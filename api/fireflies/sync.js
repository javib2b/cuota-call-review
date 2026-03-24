// Fireflies sync endpoint — per-client
// GET /api/fireflies/sync?client=Nauta[&days=90] — list recent transcripts with processing status
// POST /api/fireflies/sync — process a single transcript (body: { transcriptId, client })
import { authenticateUser, adminTable } from "../_lib/supabase.js";
import { createFirefliesClient, formatFirefliesTranscript } from "../_lib/fireflies.js";
import { analyzeTranscript, computeScores, buildCallData } from "../_lib/analyze.js";

async function getFirefliesSettings(orgId, client) {
  const table = adminTable("fireflies_settings");
  const filter = client
    ? `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
    : `org_id=eq.${orgId}`;
  const rows = await table.select("*", filter);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function findOrCreateRep(repName, orgId) {
  if (!repName || !orgId) return null;
  const table = adminTable("reps");
  try {
    const existing = await table.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(existing) && existing.length > 0) return existing[0].id;
    try {
      const inserted = await table.insert({ org_id: orgId, full_name: repName });
      if (Array.isArray(inserted) && inserted.length > 0) return inserted[0].id;
    } catch { /* ignore insert conflict */ }
    const retry = await table.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(retry) && retry.length > 0) return retry[0].id;
  } catch (e) {
    console.warn("findOrCreateRep failed:", e.message);
  }
  return null;
}

async function processFirefliesTranscript(ff, transcriptId, orgId, client) {
  const processedTable = adminTable("fireflies_processed_calls");
  const callReviewsTable = adminTable("call_reviews");

  // Mark as processing (upsert pattern)
  try {
    await processedTable.insert({ org_id: orgId, fireflies_transcript_id: transcriptId, status: "processing" });
  } catch {
    await processedTable.update(
      { status: "processing", error_message: null },
      `org_id=eq.${orgId}&fireflies_transcript_id=eq.${encodeURIComponent(transcriptId)}`
    ).catch(() => {});
  }

  try {
    const transcript = await ff.getTranscript(transcriptId);
    if (!transcript) throw new Error("Transcript not found or not accessible");

    const transcriptText = formatFirefliesTranscript(transcript.sentences || []);
    if (!transcriptText.trim()) throw new Error("Empty transcript — call may not have been recorded or speaker detection failed");

    // Extract participant info from meeting_attendees
    const attendees = transcript.meeting_attendees || [];
    const hostEmail = transcript.host_email || "";
    const hostAttendee = attendees.find(a => a.email === hostEmail);
    const externalAttendees = attendees.filter(a => a.email !== hostEmail);
    const repName = hostAttendee?.displayName || hostAttendee?.name || "";
    const prospectAttendee = externalAttendees[0];

    // Analyze with Claude
    const aiResult = await analyzeTranscript(transcriptText);
    const computed = computeScores(aiResult);

    const finalRepName = repName || aiResult.metadata?.rep_name || "";
    const repId = await findOrCreateRep(finalRepName, orgId);

    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);

    // Override with Fireflies metadata where available
    if (finalRepName) reviewData.category_scores.rep_name = finalRepName;
    if (prospectAttendee?.displayName || prospectAttendee?.name) {
      reviewData.category_scores.prospect_name = prospectAttendee.displayName || prospectAttendee.name || "";
    }
    if (attendees.length > 0) {
      reviewData.category_scores.fireflies_attendees = attendees.map(a => a.email || a.displayName).filter(Boolean);
    }
    if (transcript.title) reviewData.category_scores.call_title = transcript.title;
    if (transcript.summary?.overview) reviewData.category_scores.fireflies_summary = transcript.summary.overview;
    if (transcript.date) {
      const ts = typeof transcript.date === "number" ? transcript.date : new Date(transcript.date).getTime();
      reviewData.call_date = new Date(ts).toISOString().split("T")[0];
    }
    if (transcript.duration) {
      reviewData.category_scores.call_duration_minutes = Math.round(transcript.duration / 60);
    }
    reviewData.category_scores.fireflies_transcript_id = transcriptId;

    // Save to call_reviews
    const saved = await callReviewsTable.insert(reviewData);
    const callReviewId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    // Mark as completed
    await processedTable.update(
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&fireflies_transcript_id=eq.${encodeURIComponent(transcriptId)}`
    );

    return { ok: true, callReviewId, overallScore: computed.overallScore, rep: finalRepName };
  } catch (err) {
    console.error(`Failed to process Fireflies transcript ${transcriptId}:`, err);
    await processedTable.update(
      { status: "failed", error_message: err.message },
      `org_id=eq.${orgId}&fireflies_transcript_id=eq.${encodeURIComponent(transcriptId)}`
    ).catch(() => {});
    throw err;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (auth.profile.role !== "admin" && auth.profile.role !== "manager") {
      return res.status(403).json({ error: "Admin or manager access required" });
    }

    const orgId = auth.profile.org_id;
    const client = req.query?.client || req.body?.client || null;

    const settings = await getFirefliesSettings(orgId, client);
    if (!settings) {
      return res.status(400).json({
        error: client
          ? `Fireflies not configured for ${client}. Set up your API key in Integrations.`
          : "Fireflies not configured. Set up your API key in Integrations.",
      });
    }

    const ff = createFirefliesClient(settings.fireflies_api_key);

    // GET — list recent transcripts with processing status
    if (req.method === "GET") {
      const daysBack = parseInt(req.query.days) || 30;
      const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

      let transcripts = [];
      try {
        transcripts = await ff.listAllTranscripts(fromDate);
      } catch (e) {
        return res.status(502).json({ error: `Fireflies API error: ${e.message}` });
      }

      // Get processed status for all Fireflies transcripts in this org
      const processedTable = adminTable("fireflies_processed_calls");
      let processed = [];
      try {
        processed = await processedTable.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(processed)) processed = [];
      } catch { processed = []; }

      const processedMap = {};
      processed.forEach((p) => { processedMap[String(p.fireflies_transcript_id)] = p; });

      // Normalize transcripts
      const normalized = transcripts.map((t) => {
        const id = String(t.id || "");
        const proc = processedMap[id];
        const ts = typeof t.date === "number" ? t.date : new Date(t.date).getTime();
        const attendees = t.meeting_attendees || [];
        const hostEmail = t.host_email || "";
        const hostAttendee = attendees.find(a => a.email === hostEmail);
        const externalAttendees = attendees.filter(a => a.email !== hostEmail);
        const repName = hostAttendee?.displayName || hostAttendee?.name || null;
        const prospectName = externalAttendees[0]?.displayName || externalAttendees[0]?.name || null;
        return {
          transcriptId: id,
          title: t.title || "Untitled",
          date: ts ? new Date(ts).toISOString() : null,
          duration: t.duration ? Math.round(t.duration / 60) : null,
          repName,
          prospectName,
          participants: t.participants || [],
          status: proc?.status || "new",
          callReviewId: proc?.call_review_id || null,
          errorMessage: proc?.error_message || null,
        };
      });

      // Sort newest first
      normalized.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      return res.status(200).json({ transcripts: normalized });
    }

    // POST — process a single transcript
    if (req.method === "POST") {
      const { transcriptId, client: bodyClient } = req.body || {};
      if (!transcriptId) {
        return res.status(400).json({ error: "transcriptId is required" });
      }

      const targetClient = bodyClient || settings.client || "Other";
      const result = await processFirefliesTranscript(ff, transcriptId, orgId, targetClient);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Fireflies sync error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

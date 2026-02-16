// Manual Gong sync endpoint
// GET /api/gong/sync — list recent Gong calls with processing status
// POST /api/gong/sync — process a single call (body: { callId })
import { authenticateUser, adminTable } from "../lib/supabase.js";
import { createGongClient, buildSpeakerMap, formatTranscript } from "../lib/gong.js";
import { analyzeTranscript, computeScores, buildCallData } from "../lib/analyze.js";

async function getGongSettings(orgId) {
  const table = adminTable("gong_settings");
  const rows = await table.select("*", `org_id=eq.${orgId}`);
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
    } catch { /* ignore insert failure */ }
    const retry = await table.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(retry) && retry.length > 0) return retry[0].id;
  } catch (e) {
    console.warn("findOrCreateRep failed:", e.message);
  }
  return null;
}

async function processGongCall(gong, callId, orgId) {
  const processedTable = adminTable("gong_processed_calls");
  const callReviewsTable = adminTable("call_reviews");

  // Mark as processing
  try {
    await processedTable.insert({ org_id: orgId, gong_call_id: callId, status: "processing" });
  } catch {
    // May already exist — update status
    await processedTable.update({ status: "processing", error_message: null }, `org_id=eq.${orgId}&gong_call_id=eq.${callId}`);
  }

  try {
    // Fetch transcript and call data in parallel
    const [transcriptData, callData] = await Promise.all([
      gong.getTranscript(callId),
      gong.getCallData(callId),
    ]);

    // Build speaker map from parties
    const parties = callData.calls?.[0]?.parties || [];
    const speakerMap = buildSpeakerMap(parties);

    // Format transcript
    const transcriptText = formatTranscript(transcriptData.callTranscripts || [], speakerMap);
    if (!transcriptText.trim()) {
      throw new Error("Empty transcript — call may not have been recorded or transcribed");
    }

    // Analyze with Claude
    const aiResult = await analyzeTranscript(transcriptText);
    const computed = computeScores(aiResult);

    // Find or create rep
    const repName = aiResult.metadata?.rep_name || "";
    const repId = await findOrCreateRep(repName, orgId);

    // Determine client bucket
    const prospectCompany = aiResult.metadata?.prospect_company || "";
    const client = prospectCompany || "Other";

    // Build call review data
    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);

    // Also store the gong_call_id and call date from Gong metadata
    const gongCallMeta = callData.calls?.[0]?.metaData;
    if (gongCallMeta?.started) {
      reviewData.call_date = new Date(gongCallMeta.started).toISOString().split("T")[0];
    }

    // Save to call_reviews
    const saved = await callReviewsTable.insert(reviewData);
    const callReviewId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    // Update processed status
    await processedTable.update(
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&gong_call_id=eq.${callId}`
    );

    return { ok: true, callReviewId, overallScore: computed.overallScore };
  } catch (err) {
    console.error(`Failed to process Gong call ${callId}:`, err);
    await processedTable.update(
      { status: "failed", error_message: err.message },
      `org_id=eq.${orgId}&gong_call_id=eq.${callId}`
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

    // Get Gong settings
    const settings = await getGongSettings(orgId);
    if (!settings) return res.status(400).json({ error: "Gong not configured. Set up credentials in Gong Settings." });

    const gong = createGongClient(settings.gong_access_key, settings.gong_access_key_secret, settings.gong_base_url);

    // GET — list recent calls with their processing status
    if (req.method === "GET") {
      const daysBack = parseInt(req.query.days) || 30;
      const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

      const gongCalls = await gong.listAllCalls(fromDate);

      // Get processed status for these calls
      const processedTable = adminTable("gong_processed_calls");
      const gongCallIds = gongCalls.map((c) => c.metaData?.id).filter(Boolean);
      let processed = [];
      if (gongCallIds.length > 0) {
        processed = await processedTable.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(processed)) processed = [];
      }

      const processedMap = {};
      processed.forEach((p) => { processedMap[p.gong_call_id] = p; });

      const enrichedCalls = gongCalls.map((call) => {
        const id = call.metaData?.id;
        const proc = processedMap[id];
        return {
          gongCallId: id,
          title: call.metaData?.title || "Untitled",
          started: call.metaData?.started,
          duration: call.metaData?.duration,
          direction: call.metaData?.direction,
          parties: (call.parties || []).map((p) => p.name || p.emailAddress).filter(Boolean),
          status: proc?.status || "new",
          callReviewId: proc?.call_review_id || null,
          errorMessage: proc?.error_message || null,
        };
      });

      // Sort by date, newest first
      enrichedCalls.sort((a, b) => new Date(b.started || 0) - new Date(a.started || 0));

      return res.status(200).json({ calls: enrichedCalls });
    }

    // POST — process a single call
    if (req.method === "POST") {
      const { callId } = req.body || {};
      if (!callId) return res.status(400).json({ error: "callId is required" });

      const result = await processGongCall(gong, callId, orgId);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Gong sync error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// Diio sync endpoint — per-client
// GET /api/diio/sync?client=Acme — list recent meetings + phone calls with processing status
// POST /api/diio/sync — process a single call (body: { callId, callType, client })
import { authenticateUser, adminTable } from "../_lib/supabase.js";
import { createDiioClient, refreshDiioToken } from "../_lib/diio.js";
import { analyzeTranscript, computeScores, buildCallData } from "../_lib/analyze.js";

async function getDiioSettings(orgId, client) {
  const table = adminTable("diio_settings");
  const filter = client
    ? `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
    : `org_id=eq.${orgId}`;
  const rows = await table.select("*", filter);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

// Update tokens in diio_settings after a refresh
async function saveTokens(orgId, client, accessToken, refreshToken) {
  const table = adminTable("diio_settings");
  await table.update(
    { access_token: accessToken, refresh_token: refreshToken, updated_at: new Date().toISOString() },
    `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
  );
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

// Compose a rich transcript preamble so Claude has context about the call
function buildTranscriptText(callMeta, rawTranscript) {
  const sellers = (callMeta.attendees?.sellers || []).map((s) => s.name || s.email).filter(Boolean);
  const customers = (callMeta.attendees?.customers || []).map((c) => c.name || c.email).filter(Boolean);

  const lines = [`Call: ${callMeta.name || "Untitled"}`];
  if (callMeta.scheduled_at || callMeta.occurred_at) {
    lines.push(`Date: ${new Date(callMeta.scheduled_at || callMeta.occurred_at).toLocaleDateString()}`);
  }
  if (sellers.length > 0) lines.push(`Sellers (internal): ${sellers.join(", ")}`);
  if (customers.length > 0) lines.push(`Customers (prospect): ${customers.join(", ")}`);
  lines.push("", "---", "", rawTranscript.trim());

  return lines.join("\n");
}

async function processDiioCall(diio, settings, callId, callType, orgId, client) {
  const processedTable = adminTable("diio_processed_calls");
  const callReviewsTable = adminTable("call_reviews");
  const diioId = `${callType}_${callId}`;

  // Mark as processing
  try {
    await processedTable.insert({ org_id: orgId, diio_call_id: diioId, call_type: callType, status: "processing" });
  } catch {
    await processedTable.update(
      { status: "processing", error_message: null },
      `org_id=eq.${orgId}&diio_call_id=eq.${diioId}`
    );
  }

  try {
    // Fetch the call record to get last_transcript_id and attendee info
    let callMeta;
    if (callType === "meeting") {
      const result = await diio.listMeetings(1, 1); // we already have listing data, but re-fetch by ID isn't in API
      // Use the passed-in callId to fetch transcript via the meetings endpoint path
      // Diio GET /v1/meetings/:id
      const r = await fetch(`https://${settings.subdomain}.diio.com/api/external/v1/meetings/${callId}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.access_token}` },
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`Diio meetings/${callId} ${r.status}: ${body}`);
      }
      callMeta = await r.json();
    } else {
      // phone_call
      const r = await fetch(`https://${settings.subdomain}.diio.com/api/external/v1/phone_calls/${callId}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.access_token}` },
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`Diio phone_calls/${callId} ${r.status}: ${body}`);
      }
      callMeta = await r.json();
    }

    const transcriptId = callMeta.last_transcript_id;
    if (!transcriptId) {
      throw new Error("No transcript available for this call — it may not have been transcribed yet");
    }

    // Fetch transcript
    const transcriptData = await diio.getTranscript(transcriptId);
    const rawTranscript = transcriptData.transcript || "";
    if (!rawTranscript.trim()) {
      throw new Error("Transcript is empty — call may not have been fully transcribed yet");
    }

    // Build enriched transcript text with call context
    const transcriptText = buildTranscriptText(callMeta, rawTranscript);

    // Analyze with Claude
    const aiResult = await analyzeTranscript(transcriptText);
    const computed = computeScores(aiResult);

    // Extract rep/prospect info from Diio metadata (more reliable than AI extraction)
    const sellers = callMeta.attendees?.sellers || [];
    const customers = callMeta.attendees?.customers || [];
    const repName = sellers[0]?.name || aiResult.metadata?.rep_name || "";
    const prospectName = customers[0]?.name || aiResult.metadata?.prospect_name || "";

    const repId = await findOrCreateRep(repName, orgId);
    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);

    // Override with structured Diio metadata
    const callDate = callMeta.scheduled_at || callMeta.occurred_at || callMeta.created_at;
    if (callDate) reviewData.call_date = new Date(callDate).toISOString().split("T")[0];
    if (repName) reviewData.category_scores.rep_name = repName;
    if (prospectName) reviewData.category_scores.prospect_name = prospectName;
    if (callMeta.name) reviewData.category_scores.call_title = callMeta.name;
    reviewData.category_scores.diio_call_type = callType;
    if (sellers.length > 0) reviewData.category_scores.diio_sellers = sellers.map((s) => s.name || s.email).filter(Boolean);
    if (customers.length > 0) reviewData.category_scores.diio_customers = customers.map((c) => c.name || c.email).filter(Boolean);

    // Save to call_reviews
    const saved = await callReviewsTable.insert(reviewData);
    const callReviewId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    // Mark as completed
    await processedTable.update(
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&diio_call_id=eq.${diioId}`
    );

    return { ok: true, callReviewId, overallScore: computed.overallScore };
  } catch (err) {
    console.error(`Failed to process Diio ${callType} ${callId}:`, err);
    await processedTable.update(
      { status: "failed", error_message: err.message },
      `org_id=eq.${orgId}&diio_call_id=eq.${diioId}`
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

    const settings = await getDiioSettings(orgId, client);
    if (!settings) {
      return res.status(400).json({
        error: client
          ? `Diio not configured for ${client}. Set up credentials in Integrations.`
          : "Diio not configured. Set up credentials in Integrations.",
      });
    }

    // Build onRefresh callback that persists new tokens
    const onRefresh = async () => {
      try {
        const tokenData = await refreshDiioToken(
          settings.subdomain,
          settings.client_id,
          settings.client_secret,
          settings.refresh_token
        );
        const newAccess = tokenData.access_token;
        const newRefresh = tokenData.refresh_token || settings.refresh_token;
        settings.access_token = newAccess;
        settings.refresh_token = newRefresh;
        await saveTokens(orgId, settings.client, newAccess, newRefresh);
        return newAccess;
      } catch (e) {
        console.error("Diio token refresh failed:", e.message);
        return null;
      }
    };

    // If no access_token yet, try to get one
    if (!settings.access_token) {
      try {
        const tokenData = await refreshDiioToken(
          settings.subdomain,
          settings.client_id,
          settings.client_secret,
          settings.refresh_token
        );
        settings.access_token = tokenData.access_token;
        settings.refresh_token = tokenData.refresh_token || settings.refresh_token;
        await saveTokens(orgId, settings.client, settings.access_token, settings.refresh_token);
      } catch (e) {
        return res.status(401).json({ error: `Diio credentials invalid — could not obtain access token: ${e.message}` });
      }
    }

    const diio = createDiioClient(settings.subdomain, settings.access_token, onRefresh);

    // GET — list recent calls with processing status
    if (req.method === "GET") {
      const daysBack = parseInt(req.query.days) || 30;

      // Fetch meetings and phone calls in parallel
      const [meetings, phoneCalls] = await Promise.all([
        diio.listAllMeetings(daysBack).catch((e) => { console.warn("listAllMeetings failed:", e.message); return []; }),
        diio.listAllPhoneCalls(daysBack).catch((e) => { console.warn("listAllPhoneCalls failed:", e.message); return []; }),
      ]);

      // Get processed status for all Diio calls in this org
      const processedTable = adminTable("diio_processed_calls");
      let processed = [];
      try {
        processed = await processedTable.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(processed)) processed = [];
      } catch { processed = []; }

      const processedMap = {};
      processed.forEach((p) => { processedMap[p.diio_call_id] = p; });

      // Normalize meetings
      const normalizedMeetings = meetings
        .filter((m) => m.id && m.last_transcript_id)
        .map((m) => {
          const diioId = `meeting_${m.id}`;
          const proc = processedMap[diioId];
          const sellers = (m.attendees?.sellers || []).map((s) => s.name || s.email).filter(Boolean);
          const customers = (m.attendees?.customers || []).map((c) => c.name || c.email).filter(Boolean);
          return {
            diioCallId: diioId,
            rawId: m.id,
            callType: "meeting",
            title: m.name || "Untitled Meeting",
            date: m.scheduled_at || m.created_at,
            sellerName: sellers.join(", ") || null,
            customerName: customers.join(", ") || null,
            hasTranscript: true,
            status: proc?.status || "new",
            callReviewId: proc?.call_review_id || null,
            errorMessage: proc?.error_message || null,
          };
        });

      // Normalize phone calls (only those with a transcript)
      const normalizedPhoneCalls = phoneCalls
        .filter((p) => p.id && p.last_transcript_id)
        .map((p) => {
          const diioId = `phone_${p.id}`;
          const proc = processedMap[diioId];
          const sellers = (p.attendees?.sellers || []).map((s) => s.name || s.email).filter(Boolean);
          const customers = (p.attendees?.customers || []).map((c) => c.name || c.email).filter(Boolean);
          return {
            diioCallId: diioId,
            rawId: p.id,
            callType: "phone_call",
            title: p.name || "Untitled Call",
            date: p.occurred_at || p.created_at,
            sellerName: sellers.join(", ") || null,
            customerName: customers.join(", ") || null,
            hasTranscript: true,
            status: proc?.status || "new",
            callReviewId: proc?.call_review_id || null,
            errorMessage: proc?.error_message || null,
          };
        });

      // Merge and sort by date, newest first
      const allCalls = [...normalizedMeetings, ...normalizedPhoneCalls];
      allCalls.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      return res.status(200).json({ calls: allCalls });
    }

    // POST — process a single call
    if (req.method === "POST") {
      const { callId, callType, client: bodyClient } = req.body || {};
      if (!callId || !callType) {
        return res.status(400).json({ error: "callId and callType (meeting|phone_call) are required" });
      }

      const targetClient = bodyClient || settings.client || "Other";
      const result = await processDiioCall(diio, settings, callId, callType, orgId, targetClient);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Diio sync error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// Gong webhook handler — receives call completion notifications
// Uses waitUntil for background processing so we can return 200 immediately to Gong
import { waitUntil } from "@vercel/functions";
import { adminTable } from "../lib/supabase.js";
import { createGongClient, buildSpeakerMap, formatTranscript } from "../lib/gong.js";
import { analyzeTranscript, computeScores, buildCallData } from "../lib/analyze.js";

async function findOrCreateRep(repName, orgId) {
  if (!repName || !orgId) return null;
  const table = adminTable("reps");
  try {
    const existing = await table.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(existing) && existing.length > 0) return existing[0].id;
    try {
      const inserted = await table.insert({ org_id: orgId, full_name: repName });
      if (Array.isArray(inserted) && inserted.length > 0) return inserted[0].id;
    } catch { /* ignore */ }
    const retry = await table.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(retry) && retry.length > 0) return retry[0].id;
  } catch (e) {
    console.warn("findOrCreateRep failed:", e.message);
  }
  return null;
}

async function processWebhookCall(gongCallId, orgId, settings) {
  const processedTable = adminTable("gong_processed_calls");
  const callReviewsTable = adminTable("call_reviews");

  // Mark as processing
  try {
    await processedTable.insert({ org_id: orgId, gong_call_id: gongCallId, status: "processing" });
  } catch {
    await processedTable.update(
      { status: "processing", error_message: null },
      `org_id=eq.${orgId}&gong_call_id=eq.${gongCallId}`
    );
  }

  try {
    const gong = createGongClient(settings.gong_access_key, settings.gong_access_key_secret, settings.gong_base_url);

    const [transcriptData, callData] = await Promise.all([
      gong.getTranscript(gongCallId),
      gong.getCallData(gongCallId),
    ]);

    const parties = callData.calls?.[0]?.parties || [];
    const speakerMap = buildSpeakerMap(parties);
    const transcriptText = formatTranscript(transcriptData.callTranscripts || [], speakerMap);

    if (!transcriptText.trim()) {
      throw new Error("Empty transcript");
    }

    const aiResult = await analyzeTranscript(transcriptText);
    const computed = computeScores(aiResult);
    const repName = aiResult.metadata?.rep_name || "";
    const repId = await findOrCreateRep(repName, orgId);
    const client = aiResult.metadata?.prospect_company || "Other";

    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);

    const gongCallMeta = callData.calls?.[0]?.metaData;
    if (gongCallMeta?.started) {
      reviewData.call_date = new Date(gongCallMeta.started).toISOString().split("T")[0];
    }

    const saved = await callReviewsTable.insert(reviewData);
    const callReviewId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    await processedTable.update(
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&gong_call_id=eq.${gongCallId}`
    );

    console.log(`Webhook: processed Gong call ${gongCallId} → review ${callReviewId} (score: ${computed.overallScore})`);
  } catch (err) {
    console.error(`Webhook: failed to process ${gongCallId}:`, err);
    await processedTable.update(
      { status: "failed", error_message: err.message },
      `org_id=eq.${orgId}&gong_call_id=eq.${gongCallId}`
    ).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ error: "Empty payload" });

    // Gong sends different event types — we care about CALL_ANALYZED
    // The payload shape: { organizationId, callId, ... }
    // Or for Gong's new format: { data: [{ callId, ... }] }
    const callIds = [];
    if (payload.callId) {
      callIds.push(payload.callId);
    } else if (Array.isArray(payload.data)) {
      payload.data.forEach((d) => { if (d.callId) callIds.push(d.callId); });
    }

    if (callIds.length === 0) {
      // Might be a verification/ping event — just return OK
      return res.status(200).json({ ok: true, message: "No calls to process" });
    }

    // Find all orgs with Gong configured and auto_review enabled
    const settingsTable = adminTable("gong_settings");
    const allSettings = await settingsTable.select("*", "auto_review=eq.true");

    if (!Array.isArray(allSettings) || allSettings.length === 0) {
      return res.status(200).json({ ok: true, message: "No orgs with auto-review enabled" });
    }

    // Return 200 immediately, process in background
    res.status(200).json({ ok: true, processing: callIds.length });

    // Process each call for each org in the background
    for (const settings of allSettings) {
      for (const callId of callIds) {
        waitUntil(processWebhookCall(callId, settings.org_id, settings));
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

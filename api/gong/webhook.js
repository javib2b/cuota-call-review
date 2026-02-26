// Gong webhook handler — receives call completion notifications
// Uses waitUntil for background processing so we can return 200 immediately to Gong
import { waitUntil } from "@vercel/functions";
import { adminTable } from "../_lib/supabase.js";
import { createGongClient, buildSpeakerMap, formatTranscript } from "../_lib/gong.js";
import { analyzeTranscript, computeScores, buildCallData } from "../_lib/analyze.js";

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

    // Extract structured metadata from Gong parties
    const internalParties = parties.filter(p => p.affiliation === "Internal").map(p => p.name).filter(Boolean);
    const externalRaw = parties.filter(p => p.affiliation === "External");
    const externalNames = externalRaw.map(p => p.name).filter(Boolean);
    const externalCompanies = externalRaw.map(p => p.company).filter(Boolean);
    const externalTitles = externalRaw.map(p => p.title).filter(Boolean);
    const gongCallMeta = callData.calls?.[0]?.metaData;
    const gongTitle = gongCallMeta?.title || "";

    const transcriptText = formatTranscript(transcriptData.callTranscripts || [], speakerMap);

    if (!transcriptText.trim()) {
      throw new Error("Empty transcript");
    }

    const aiResult = await analyzeTranscript(transcriptText);
    const computed = computeScores(aiResult);

    // Use Gong's internal party as AE name (fallback to AI-extracted)
    const repName = internalParties[0] || aiResult.metadata?.rep_name || "";
    const repId = await findOrCreateRep(repName, orgId);

    // Use the client from the settings row (per-client config)
    const client = settings.client || "Other";

    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);

    // Override AI-guessed metadata with structured Gong data
    if (repName) reviewData.category_scores.rep_name = repName;
    if (externalNames.length > 0) reviewData.category_scores.prospect_name = externalNames[0];
    // Use company name for prospect_company (not person name)
    if (externalCompanies.length > 0) {
      reviewData.prospect_company = externalCompanies[0];
    }
    if (gongTitle) reviewData.category_scores.call_title = gongTitle;

    // Store all Gong party data for reference
    if (internalParties.length > 0) reviewData.category_scores.gong_internal_parties = internalParties;
    if (externalNames.length > 0) reviewData.category_scores.gong_external_parties = externalNames;
    if (externalCompanies.length > 0) reviewData.category_scores.gong_external_companies = externalCompanies;
    if (externalTitles.length > 0) reviewData.category_scores.gong_external_titles = externalTitles;

    // Store call date from Gong metadata
    if (gongCallMeta?.started) {
      reviewData.call_date = new Date(gongCallMeta.started).toISOString().split("T")[0];
    }

    const saved = await callReviewsTable.insert(reviewData);
    const callReviewId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    await processedTable.update(
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&gong_call_id=eq.${gongCallId}`
    );

    console.log(`Webhook: processed Gong call ${gongCallId} → review ${callReviewId} (score: ${computed.overallScore}, client: ${client})`);
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

    // Process each call for each settings row (each row = one org+client config)
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

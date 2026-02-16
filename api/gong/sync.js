// Manual Gong sync endpoint — per-client
// GET /api/gong/sync?client=11x — list recent Gong calls with processing status
// POST /api/gong/sync — process a single call (body: { callId, client })
import { authenticateUser, adminTable } from "../lib/supabase.js";
import { createGongClient, buildSpeakerMap, formatTranscript } from "../lib/gong.js";
import { analyzeTranscript, computeScores, buildCallData } from "../lib/analyze.js";

async function getGongSettings(orgId, client) {
  const table = adminTable("gong_settings");
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
    } catch { /* ignore insert failure */ }
    const retry = await table.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(retry) && retry.length > 0) return retry[0].id;
  } catch (e) {
    console.warn("findOrCreateRep failed:", e.message);
  }
  return null;
}

async function processGongCall(gong, callId, orgId, client) {
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

    // Extract structured metadata from Gong parties
    const internalParties = parties.filter(p => p.affiliation === "Internal").map(p => p.name).filter(Boolean);
    const externalRaw = parties.filter(p => p.affiliation === "External");
    const externalNames = externalRaw.map(p => p.name).filter(Boolean);
    const externalCompanies = externalRaw.map(p => p.company).filter(Boolean);
    const externalTitles = externalRaw.map(p => p.title).filter(Boolean);
    const gongCallMeta = callData.calls?.[0]?.metaData;
    const gongTitle = gongCallMeta?.title || "";

    // Format transcript
    const transcriptText = formatTranscript(transcriptData.callTranscripts || [], speakerMap);
    if (!transcriptText.trim()) {
      throw new Error("Empty transcript — call may not have been recorded or transcribed");
    }

    // Analyze with Claude
    const aiResult = await analyzeTranscript(transcriptText);
    const computed = computeScores(aiResult);

    // Use Gong's internal party as AE name (fallback to AI-extracted)
    const repName = internalParties[0] || aiResult.metadata?.rep_name || "";
    const repId = await findOrCreateRep(repName, orgId);

    // Use the configured client (not AI-guessed)
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
    const client = req.query?.client || req.body?.client || null;

    // Get Gong settings for this client
    const settings = await getGongSettings(orgId, client);
    if (!settings) {
      return res.status(400).json({
        error: client
          ? `Gong not configured for ${client}. Set up credentials in Integrations.`
          : "Gong not configured. Set up credentials in Integrations.",
      });
    }

    const gong = createGongClient(settings.gong_access_key, settings.gong_access_key_secret, settings.gong_base_url);

    // GET — list recent calls with their processing status
    if (req.method === "GET") {
      const daysBack = parseInt(req.query.days) || 30;
      const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

      const gongCalls = await gong.listAllCalls(fromDate);

      // Log raw Gong response structure for debugging
      let _debugSample = null;
      if (gongCalls.length > 0) {
        const s = gongCalls[0];
        _debugSample = {
          topLevelKeys: Object.keys(s),
          metaDataKeys: s.metaData ? Object.keys(s.metaData) : null,
          partiesSample: (s.parties || []).slice(0, 2).map(p => ({ keys: Object.keys(p), affiliation: p.affiliation, name: p.name, emailAddress: p.emailAddress, company: p.company, title: p.title })),
          metaDataId: s.metaData?.id,
          metaDataTitle: s.metaData?.title,
          topLevelId: s.id,
        };
        console.log("Gong debug sample:", JSON.stringify(_debugSample));
      }

      // Get processed status for these calls
      const processedTable = adminTable("gong_processed_calls");
      let processed = [];
      try {
        processed = await processedTable.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(processed)) processed = [];
      } catch { processed = []; }

      const processedMap = {};
      processed.forEach((p) => { processedMap[p.gong_call_id] = p; });

      const enrichedCalls = gongCalls.map((call) => {
        // Robust ID extraction — try every possible location
        const rawId = call.metaData?.id ?? call.id ?? call.callId ?? null;
        const id = rawId != null ? String(rawId) : null;

        const proc = id ? (processedMap[id] || processedMap[rawId]) : null;
        const callParties = call.parties || [];
        const internal = callParties.filter(p => p.affiliation === "Internal");
        const external = callParties.filter(p => p.affiliation === "External");

        // Build a useful display title from available data
        const gongTitle = call.metaData?.title || call.title || "";
        const aeNames = internal.map(p => p.name).filter(Boolean);
        const prospectNames = external.map(p => p.name).filter(Boolean);
        const allNames = callParties.map(p => p.name || p.emailAddress).filter(Boolean);
        const started = call.metaData?.started || call.started;

        let displayTitle = gongTitle;
        if (!displayTitle || displayTitle === "Untitled") {
          if (aeNames.length > 0 && prospectNames.length > 0) {
            displayTitle = `${aeNames[0]} \u2194 ${prospectNames[0]}`;
          } else if (allNames.length > 0) {
            displayTitle = allNames.slice(0, 2).join(" & ");
          } else if (started) {
            displayTitle = `Call on ${new Date(started).toLocaleDateString()}`;
          }
        }

        // Infer call type from title keywords
        const titleLower = (gongTitle || "").toLowerCase();
        let callType = null;
        if (/\bintro\b|introduction|first\s+call|initial|discovery/.test(titleLower)) callType = "Discovery";
        else if (/\bfollow[\s-]?up\b|check[\s-]?in|recap|touchbase|touch\s+base/.test(titleLower)) callType = "Follow-up";
        else if (/\bdemo\b|demonstration|walkthrough|walk[\s-]?through|presentation/.test(titleLower)) callType = "Demo";
        else if (/\bnegotiat\b|pricing|proposal|contract/.test(titleLower)) callType = "Negotiation";
        else if (/\bclos(e|ing)\b|sign(ing|ature)?|final/.test(titleLower)) callType = "Closing";

        return {
          gongCallId: id,
          title: displayTitle || "Untitled",
          callType,
          started,
          duration: call.metaData?.duration || call.duration,
          direction: call.metaData?.direction || call.direction,
          parties: allNames,
          aeName: aeNames.join(", ") || null,
          prospectName: prospectNames.join(", ") || null,
          prospectCompany: external.map(p => p.company).filter(Boolean).join(", ") || null,
          prospectTitle: external.map(p => p.title).filter(Boolean).join(", ") || null,
          status: proc?.status || "new",
          callReviewId: proc?.call_review_id || null,
          errorMessage: proc?.error_message || null,
        };
      }).filter(c => c.gongCallId);

      // Sort by date, newest first
      enrichedCalls.sort((a, b) => new Date(b.started || 0) - new Date(a.started || 0));

      return res.status(200).json({ calls: enrichedCalls, _debug: _debugSample });
    }

    // POST — process a single call
    if (req.method === "POST") {
      const { callId, client: bodyClient } = req.body || {};
      if (!callId) {
        console.error("POST /api/gong/sync: missing callId. req.body:", JSON.stringify(req.body));
        return res.status(400).json({ error: "callId is required" });
      }

      // Use the client from settings (which was already looked up by client param)
      const targetClient = bodyClient || settings.client || "Other";
      const result = await processGongCall(gong, callId, orgId, targetClient);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Gong sync error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

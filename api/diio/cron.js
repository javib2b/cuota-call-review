// Vercel Cron — auto-processes new Diio calls for all configured clients
// Runs on a schedule defined in vercel.json (every hour)
import { adminTable } from "../_lib/supabase.js";
import { createDiioClient, refreshDiioToken } from "../_lib/diio.js";
import { analyzeTranscript, computeScores, buildCallData } from "../_lib/analyze.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAYS_BACK = 14;   // scan last 14 days for new calls
const MAX_PER_ORG = 3;  // max calls to process per org per run (stay within 60s timeout)

// Get the Anthropic API key for an org: env var first, then org admin's stored key
async function getOrgApiKey(orgId) {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const profiles = await adminTable("profiles").select("id", `org_id=eq.${orgId}&role=in.(admin,manager)&order=created_at.asc&limit=1`);
    if (!Array.isArray(profiles) || profiles.length === 0) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${profiles[0].id}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user.user_metadata?.api_key || null;
  } catch (e) {
    console.warn(`[cron] getOrgApiKey(${orgId}): ${e.message}`);
    return null;
  }
}

async function saveTokens(orgId, client, accessToken, refreshToken) {
  try {
    await adminTable("diio_settings").update(
      { access_token: accessToken, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
    );
  } catch (e) {
    console.warn("[cron] saveTokens:", e.message);
  }
}

function buildTranscriptText(callMeta, rawTranscript) {
  const sellers = (callMeta.attendees?.sellers || []).map((s) => s.name || s.email).filter(Boolean);
  const customers = (callMeta.attendees?.customers || []).map((c) => c.name || c.email).filter(Boolean);
  const lines = [`Call: ${callMeta.name || "Untitled"}`];
  if (callMeta.scheduled_at || callMeta.occurred_at)
    lines.push(`Date: ${new Date(callMeta.scheduled_at || callMeta.occurred_at).toLocaleDateString()}`);
  if (sellers.length > 0) lines.push(`Sellers (internal): ${sellers.join(", ")}`);
  if (customers.length > 0) lines.push(`Customers (prospect): ${customers.join(", ")}`);
  lines.push("", "---", "", typeof rawTranscript === "string" ? rawTranscript : String(rawTranscript));
  return lines.join("\n");
}

async function processOneCall(diio, settings, callId, callType, orgId, client, apiKey) {
  const processedTable = adminTable("diio_processed_calls");
  const diioId = `${callType}_${callId}`;

  // Mark as processing
  try {
    await processedTable.insert({ org_id: orgId, diio_call_id: diioId, call_type: callType, status: "processing" });
  } catch {
    await processedTable.update({ status: "processing", error_message: null }, `org_id=eq.${orgId}&diio_call_id=eq.${diioId}`);
  }

  try {
    const endpoint = callType === "meeting" ? "meetings" : "phone_calls";
    const r = await fetch(`https://${settings.subdomain}.diio.com/api/external/v1/${endpoint}/${callId}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.access_token}` },
    });
    if (!r.ok) throw new Error(`Diio ${endpoint}/${callId} returned ${r.status}`);
    const callMeta = await r.json();

    const transcriptId = callMeta.last_transcript_id;
    if (!transcriptId) throw new Error("No transcript available yet");

    const transcriptData = await diio.getTranscript(transcriptId);
    const rawRaw = transcriptData.transcript;
    const rawTranscript = Array.isArray(rawRaw)
      ? rawRaw.map((t) => `${t.speaker || t.name || ""}: ${t.text || t.content || ""}`.trim()).filter(Boolean).join("\n")
      : typeof rawRaw === "string" ? rawRaw : rawRaw != null ? String(rawRaw) : "";
    if (!rawTranscript.trim()) throw new Error("Transcript is empty");

    const transcriptText = buildTranscriptText(callMeta, rawTranscript);
    const aiResult = await analyzeTranscript(transcriptText, apiKey);
    const computed = computeScores(aiResult);

    const sellers = callMeta.attendees?.sellers || [];
    const customers = callMeta.attendees?.customers || [];
    const repName = sellers[0]?.name || aiResult.metadata?.rep_name || "";
    const prospectName = customers[0]?.name || aiResult.metadata?.prospect_name || "";

    // Rep find-or-create (non-blocking)
    let repId = null;
    try {
      const repsTable = adminTable("reps");
      const existing = await repsTable.select("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
      if (Array.isArray(existing) && existing.length > 0) {
        repId = existing[0].id;
      } else if (repName) {
        const inserted = await repsTable.insert({ org_id: orgId, full_name: repName }).catch(() => null);
        if (Array.isArray(inserted) && inserted[0]) repId = inserted[0].id;
      }
    } catch { /* non-blocking */ }

    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);
    const callDate = callMeta.scheduled_at || callMeta.occurred_at || callMeta.created_at;
    if (callDate) reviewData.call_date = new Date(callDate).toISOString().split("T")[0];
    if (repName) reviewData.category_scores.rep_name = repName;
    if (prospectName) reviewData.category_scores.prospect_name = prospectName;
    if (callMeta.name) reviewData.category_scores.call_title = callMeta.name;
    reviewData.category_scores.diio_call_type = callType;
    if (sellers.length > 0) reviewData.category_scores.diio_sellers = sellers.map((s) => s.name || s.email).filter(Boolean);
    if (customers.length > 0) reviewData.category_scores.diio_customers = customers.map((c) => c.name || c.email).filter(Boolean);

    const saved = await adminTable("call_reviews").insert(reviewData);
    const callReviewId = Array.isArray(saved) && saved[0] ? saved[0].id : null;

    await processedTable.update(
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&diio_call_id=eq.${diioId}`
    );
    console.log(`[cron] ✓ ${diioId} → review ${callReviewId} (${client})`);
    return true;
  } catch (err) {
    console.error(`[cron] ✗ ${diioId}: ${err.message}`);
    await processedTable.update(
      { status: "failed", error_message: err.message },
      `org_id=eq.${orgId}&diio_call_id=eq.${diioId}`
    ).catch(() => {});
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Vercel calls cron jobs with Authorization: Bearer <CRON_SECRET>
  // Allow unauthenticated only if no secret is configured (dev)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const summary = { orgsChecked: 0, orgsProcessed: 0, callsProcessed: 0, callsFailed: 0 };

  try {
    const allSettings = await adminTable("diio_settings").select("*");
    if (!Array.isArray(allSettings) || allSettings.length === 0) {
      return res.status(200).json({ message: "No Diio integrations configured", ...summary });
    }

    for (const settings of allSettings) {
      const { org_id: orgId, client } = settings;
      summary.orgsChecked++;

      try {
        const apiKey = await getOrgApiKey(orgId);
        if (!apiKey) {
          console.warn(`[cron] No API key for org ${orgId} (${client}), skipping`);
          continue;
        }

        // Ensure valid access token
        if (!settings.access_token) {
          const tokenData = await refreshDiioToken(
            settings.subdomain, settings.client_id, settings.client_secret, settings.refresh_token
          );
          settings.access_token = tokenData.access_token;
          settings.refresh_token = tokenData.refresh_token || settings.refresh_token;
          await saveTokens(orgId, client, settings.access_token, settings.refresh_token);
        }

        const onRefresh = async () => {
          try {
            const tokenData = await refreshDiioToken(
              settings.subdomain, settings.client_id, settings.client_secret, settings.refresh_token
            );
            settings.access_token = tokenData.access_token;
            settings.refresh_token = tokenData.refresh_token || settings.refresh_token;
            await saveTokens(orgId, client, settings.access_token, settings.refresh_token);
            return settings.access_token;
          } catch { return null; }
        };

        const diio = createDiioClient(settings.subdomain, settings.access_token, onRefresh);

        // List recent calls in parallel
        const [meetings, phoneCalls] = await Promise.all([
          diio.listAllMeetings(DAYS_BACK).catch(() => []),
          diio.listAllPhoneCalls(DAYS_BACK).catch(() => []),
        ]);

        // Find which are already processed
        let processed = [];
        try {
          processed = await adminTable("diio_processed_calls").select("diio_call_id,status", `org_id=eq.${orgId}`);
          if (!Array.isArray(processed)) processed = [];
        } catch { processed = []; }

        // Exclude completed and in-progress; retry failed ones
        const doneIds = new Set(
          processed.filter((p) => p.status === "completed" || p.status === "processing").map((p) => p.diio_call_id)
        );

        const queue = [];
        for (const m of meetings) {
          if (m.id && m.last_transcript_id && !doneIds.has(`meeting_${m.id}`)) {
            queue.push({ callId: m.id, callType: "meeting" });
          }
        }
        for (const p of phoneCalls) {
          if (p.id && p.last_transcript_id && !doneIds.has(`phone_${p.id}`)) {
            queue.push({ callId: p.id, callType: "phone_call" });
          }
        }

        if (queue.length === 0) {
          console.log(`[cron] No new calls for ${client}`);
          continue;
        }

        summary.orgsProcessed++;
        console.log(`[cron] ${queue.length} new calls for ${client}, processing up to ${MAX_PER_ORG}`);

        for (const { callId, callType } of queue.slice(0, MAX_PER_ORG)) {
          const ok = await processOneCall(diio, settings, callId, callType, orgId, client, apiKey);
          if (ok) summary.callsProcessed++;
          else summary.callsFailed++;
        }
      } catch (e) {
        console.error(`[cron] Error for org ${orgId} (${client}): ${e.message}`);
      }
    }

    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron] Fatal:", err.message);
    return res.status(500).json({ error: err.message, ...summary });
  }
}

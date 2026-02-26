// Vercel Cron — auto-processes new Diio calls for all configured clients
// Runs on a schedule defined in vercel.json (every hour)
import { adminTable } from "../_lib/supabase.js";
import { createDiioClient, refreshDiioToken } from "../_lib/diio.js";
import { analyzeTranscript, computeScores, buildCallData } from "../_lib/analyze.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAYS_BACK = 7;       // scan last 7 days
const MAX_PER_AE = 1;      // 1 call per AE per run for fair distribution
const MAX_TOTAL = 2;       // 2 calls per run: listing ~3s + overhead ~5s + 2×Claude ~20s = ~48s, safely under 60s limit
const MAX_TRANSCRIPT_CHARS = 30000; // truncate transcripts to keep Claude under ~15s
const CLAUDE_TIMEOUT_MS = 30000;    // abort Claude if it takes longer than 30s — leaves time for 2nd call

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

  const pt = Date.now();
  const pe = () => `+${((Date.now() - pt) / 1000).toFixed(1)}s`;

  try {
    const endpoint = callType === "meeting" ? "meetings" : "phone_calls";
    console.log(`[cron] ${diioId}: fetching metadata ${pe()}`);
    const r = await fetch(`https://${settings.subdomain}.diio.com/api/external/v1/${endpoint}/${callId}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Diio ${endpoint}/${callId} returned ${r.status}`);
    const callMeta = await r.json();

    const transcriptId = callMeta.last_transcript_id;
    if (!transcriptId) throw new Error("No transcript available yet");

    console.log(`[cron] ${diioId}: fetching transcript ${transcriptId} ${pe()}`);
    const transcriptData = await diio.getTranscript(transcriptId);
    const rawRaw = transcriptData.transcript;
    const rawTranscript = Array.isArray(rawRaw)
      ? rawRaw.map((t) => `${t.speaker || t.name || ""}: ${t.text || t.content || ""}`.trim()).filter(Boolean).join("\n")
      : typeof rawRaw === "string" ? rawRaw : rawRaw != null ? String(rawRaw) : "";
    if (!rawTranscript.trim()) throw new Error("Transcript is empty");

    const transcriptText = buildTranscriptText(callMeta, rawTranscript);

    // Truncate very long transcripts to keep Claude under time budget
    const transcriptForAnalysis = transcriptText.length > MAX_TRANSCRIPT_CHARS
      ? transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n[TRANSCRIPT TRUNCATED FOR LENGTH]"
      : transcriptText;

    console.log(`[cron] ${diioId}: calling Claude (${transcriptForAnalysis.length} chars) ${pe()}`);
    // Race Claude against a timeout so we get a clean error instead of Vercel's hard cutoff
    const aiResult = await Promise.race([
      analyzeTranscript(transcriptForAnalysis, apiKey),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Claude analysis timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`)), CLAUDE_TIMEOUT_MS)),
    ]);
    console.log(`[cron] ${diioId}: Claude done ${pe()}`);
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

  const t0 = Date.now();
  const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

  try {
    console.log(`[cron] start`);
    const allSettings = await adminTable("diio_settings").select("*");
    if (!Array.isArray(allSettings) || allSettings.length === 0) {
      return res.status(200).json({ message: "No Diio integrations configured", ...summary });
    }
    console.log(`[cron] settings loaded ${elapsed()}`);

    for (const settings of allSettings) {
      const { org_id: orgId, client } = settings;
      summary.orgsChecked++;

      try {
        const apiKey = await getOrgApiKey(orgId);
        console.log(`[cron] apiKey ${apiKey ? "ok" : "missing"} ${elapsed()}`);
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
          console.log(`[cron] token refresh triggered ${elapsed()}`);
          try {
            const tokenData = await refreshDiioToken(
              settings.subdomain, settings.client_id, settings.client_secret, settings.refresh_token
            );
            settings.access_token = tokenData.access_token;
            settings.refresh_token = tokenData.refresh_token || settings.refresh_token;
            await saveTokens(orgId, client, settings.access_token, settings.refresh_token);
            console.log(`[cron] token refreshed ${elapsed()}`);
            return settings.access_token;
          } catch (e) {
            console.warn(`[cron] token refresh failed: ${e.message} ${elapsed()}`);
            return null;
          }
        };

        const diio = createDiioClient(settings.subdomain, settings.access_token, onRefresh);

        // Fetch one page of recent calls in parallel — newest-first, 50 items each
        // One page is enough since the 7-day window fits well within the first 50 results
        const cutoffMs = Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000;
        console.log(`[cron] listing calls ${elapsed()}`);
        const [meetingPage, phoneCallPage] = await Promise.all([
          diio.listMeetings(1, 50).catch((e) => { console.warn(`[cron] meetings list err: ${e.message}`); return { meetings: [] }; }),
          diio.listPhoneCalls(1, 50).catch((e) => { console.warn(`[cron] phonecalls list err: ${e.message}`); return { phone_calls: [] }; }),
        ]);
        console.log(`[cron] listed: ${meetingPage.meetings?.length ?? 0} meetings, ${phoneCallPage.phone_calls?.length ?? 0} phone calls ${elapsed()}`);
        const meetings = (meetingPage.meetings || []).filter((m) => {
          const d = new Date(m.scheduled_at || m.occurred_at || m.created_at).getTime();
          return d > cutoffMs;
        });
        const phoneCalls = (phoneCallPage.phone_calls || []).filter((p) => {
          const d = new Date(p.occurred_at || p.scheduled_at || p.created_at).getTime();
          return d > cutoffMs;
        });

        // Find which are already processed
        let processed = [];
        try {
          processed = await adminTable("diio_processed_calls").select("diio_call_id,status,created_at", `org_id=eq.${orgId}`);
          if (!Array.isArray(processed)) processed = [];
        } catch { processed = []; }

        // Exclude completed/skipped; retry failed ones
        // Treat "processing" as stuck (retryable) if older than 10 minutes — handles cron timeouts
        const TEN_MIN = 10 * 60 * 1000;
        const doneIds = new Set(
          processed.filter((p) => {
            if (p.status === "completed" || p.status === "skipped") return true;
            if (p.status === "processing") {
              const age = Date.now() - new Date(p.created_at).getTime();
              return age < TEN_MIN; // still actively processing (recent)
            }
            return false; // failed → retryable
          }).map((p) => p.diio_call_id)
        );

        // Build queue with seller info for grouping
        const queue = [];
        for (const m of meetings) {
          if (m.id && m.last_transcript_id && !doneIds.has(`meeting_${m.id}`)) {
            const seller = (m.attendees?.sellers?.[0]?.name || m.attendees?.sellers?.[0]?.email || "unknown").trim();
            queue.push({ callId: m.id, callType: "meeting", seller });
          }
        }
        for (const p of phoneCalls) {
          if (p.id && p.last_transcript_id && !doneIds.has(`phone_${p.id}`)) {
            const seller = (p.attendees?.sellers?.[0]?.name || p.attendees?.sellers?.[0]?.email || "unknown").trim();
            queue.push({ callId: p.id, callType: "phone_call", seller });
          }
        }

        if (queue.length === 0) {
          console.log(`[cron] No new calls for ${client}`);
          continue;
        }

        // Group by AE, cap at MAX_PER_AE per seller
        const byAE = {};
        for (const item of queue) {
          if (!byAE[item.seller]) byAE[item.seller] = [];
          if (byAE[item.seller].length < MAX_PER_AE) byAE[item.seller].push(item);
        }
        const toProcess = Object.values(byAE).flat();

        summary.orgsProcessed++;
        console.log(`[cron] ${queue.length} new calls for ${client} across ${Object.keys(byAE).length} AEs, processing ${toProcess.length}`);

        for (const { callId, callType } of toProcess) {
          if (summary.callsProcessed + summary.callsFailed >= MAX_TOTAL) break;
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

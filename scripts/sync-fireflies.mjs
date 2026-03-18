#!/usr/bin/env node
// Sync Fireflies.ai transcripts for configured clients and analyze them with Claude.
//
// SETUP (one-time, run this SQL in Supabase SQL editor):
//
//   CREATE TABLE IF NOT EXISTS fireflies_settings (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     org_id uuid NOT NULL,
//     client text NOT NULL,
//     fireflies_api_key text NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//
//   CREATE TABLE IF NOT EXISTS fireflies_processed_calls (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     org_id uuid NOT NULL,
//     fireflies_transcript_id text NOT NULL,
//     status text NOT NULL DEFAULT 'processing',
//     call_review_id uuid,
//     error_message text,
//     processed_at timestamptz,
//     created_at timestamptz NOT NULL DEFAULT now(),
//     UNIQUE(org_id, fireflies_transcript_id)
//   );
//
//   -- Insert your client config (replace values):
//   INSERT INTO fireflies_settings (org_id, client, fireflies_api_key)
//   VALUES ('<your-org-uuid>', 'Paymenow', '<your-fireflies-api-key>');
//
// USAGE:
//   SUPABASE_SERVICE_KEY=xxx ANTHROPIC_API_KEY=yyy node scripts/sync-fireflies.mjs [client1] [client2] ...
//
// EXAMPLES:
//   SUPABASE_SERVICE_KEY=xxx ANTHROPIC_API_KEY=yyy node scripts/sync-fireflies.mjs Paymenow
//   SUPABASE_SERVICE_KEY=xxx ANTHROPIC_API_KEY=yyy node scripts/sync-fireflies.mjs           # syncs ALL configured clients
//
// ENV:
//   DAYS_BACK=90   How many days back to look (default: 90)
//   CONCURRENCY=3  Parallel calls to process at once (default: 3)

import { createFirefliesClient, formatFirefliesTranscript } from "../api/_lib/fireflies.js";
import { analyzeTranscript, computeScores, buildCallData } from "../api/_lib/analyze.js";

const SUPABASE_URL  = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DAYS_BACK     = parseInt(process.env.DAYS_BACK || "90");
const CONCURRENCY   = parseInt(process.env.CONCURRENCY || "3");

const TARGET_CLIENTS = process.argv.slice(2);

if (!SERVICE_KEY)   { console.error("✗ Missing SUPABASE_SERVICE_KEY"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("✗ Missing ANTHROPIC_API_KEY");    process.exit(1); }

// ── Minimal Supabase admin client ─────────────────────────────────────────────
const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function dbGet(table, filters = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${filters ? "&" + filters : ""}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || body.error || `GET ${table} failed (${r.status})`);
  return body;
}

async function dbInsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || body.error || `INSERT ${table} failed (${r.status})`);
  return Array.isArray(body) ? body[0] : body;
}

async function dbUpdate(table, data, filters) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || body.error || `PATCH ${table} failed (${r.status})`);
  return body;
}

// ── Rep find-or-create ────────────────────────────────────────────────────────
async function findOrCreateRep(repName, orgId) {
  if (!repName || !orgId) return null;
  try {
    const existing = await dbGet("reps", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (existing.length > 0) return existing[0].id;
    const inserted = await dbInsert("reps", { org_id: orgId, full_name: repName });
    return inserted?.id ?? null;
  } catch (e) {
    console.warn(`    ⚠ Could not find/create rep "${repName}": ${e.message}`);
    return null;
  }
}

// ── Process a single Fireflies transcript ─────────────────────────────────────
async function processTranscript(ff, transcriptId, orgId, client) {
  // Mark as processing
  try {
    await dbInsert("fireflies_processed_calls", { org_id: orgId, fireflies_transcript_id: transcriptId, status: "processing" });
  } catch {
    await dbUpdate("fireflies_processed_calls",
      { status: "processing", error_message: null },
      `org_id=eq.${orgId}&fireflies_transcript_id=eq.${transcriptId}`
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

    // Heuristic: host is the internal (rep) participant
    const hostAttendee = attendees.find(a => a.email === hostEmail);
    const externalAttendees = attendees.filter(a => a.email !== hostEmail);
    const repName = hostAttendee?.displayName || hostAttendee?.name || "";
    const prospectAttendee = externalAttendees[0];

    process.stdout.write("      Analyzing… ");
    const aiResult = await analyzeTranscript(transcriptText, ANTHROPIC_KEY);
    const computed = computeScores(aiResult);
    console.log(`score ${computed.overallScore}`);

    const finalRepName = repName || aiResult.metadata?.rep_name || "";
    const repId = await findOrCreateRep(finalRepName, orgId);

    const reviewData = buildCallData(aiResult, computed, transcriptText, orgId, repId, client);

    // Override with Fireflies metadata where available
    if (finalRepName)                         reviewData.category_scores.rep_name          = finalRepName;
    if (prospectAttendee?.displayName)        reviewData.category_scores.prospect_name     = prospectAttendee.displayName || prospectAttendee.name || "";
    if (externalAttendees[0]?.email)          reviewData.category_scores.fireflies_attendees = attendees.map(a => a.email || a.displayName).filter(Boolean);
    if (transcript.title)                     reviewData.category_scores.call_title        = transcript.title;
    if (transcript.summary?.overview)         reviewData.category_scores.fireflies_summary = transcript.summary.overview;
    if (transcript.date) {
      const ts = typeof transcript.date === "number" ? transcript.date : new Date(transcript.date).getTime();
      reviewData.call_date = new Date(ts).toISOString().split("T")[0];
    }
    if (transcript.duration) {
      reviewData.call_duration_minutes = Math.round(transcript.duration / 60);
    }
    // Store the Fireflies transcript ID so we can link back
    reviewData.category_scores.fireflies_transcript_id = transcriptId;

    const saved = await dbInsert("call_reviews", reviewData);
    const callReviewId = saved?.id ?? null;

    await dbUpdate("fireflies_processed_calls",
      { status: "completed", call_review_id: callReviewId, processed_at: new Date().toISOString() },
      `org_id=eq.${orgId}&fireflies_transcript_id=eq.${transcriptId}`
    );

    return { ok: true, callReviewId, score: computed.overallScore, rep: finalRepName };
  } catch (err) {
    await dbUpdate("fireflies_processed_calls",
      { status: "failed", error_message: err.message },
      `org_id=eq.${orgId}&fireflies_transcript_id=eq.${transcriptId}`
    ).catch(() => {});
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n Fireflies Sync — last ${DAYS_BACK} days\n`);

  // Fetch all Fireflies settings
  let allSettings;
  try {
    allSettings = await dbGet("fireflies_settings");
  } catch (e) {
    console.error(`✗ Could not read fireflies_settings: ${e.message}`);
    console.error(`  Make sure the table exists — see the SQL at the top of this script.`);
    process.exit(1);
  }

  if (!allSettings.length) {
    console.error("✗ No Fireflies configurations found in fireflies_settings table.");
    console.error("  Add a row with: org_id, client, fireflies_api_key");
    process.exit(1);
  }

  // Filter to requested clients (or all)
  const configs = TARGET_CLIENTS.length > 0
    ? allSettings.filter(s => TARGET_CLIENTS.some(t => t.toLowerCase() === (s.client || "").toLowerCase()))
    : allSettings;

  if (!configs.length) {
    console.error(`✗ No Fireflies config found for: ${TARGET_CLIENTS.join(", ")}`);
    console.error(`  Configured clients: ${allSettings.map(s => s.client).join(", ")}`);
    process.exit(1);
  }

  const fromDate = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();
  const totals   = { processed: 0, skipped: 0, failed: 0 };

  for (const cfg of configs) {
    const orgId  = cfg.org_id;
    const client = cfg.client;
    console.log(`── ${client} (org: ${orgId})`);

    const ff = createFirefliesClient(cfg.fireflies_api_key);

    // Fetch transcripts from Fireflies
    let transcripts;
    try {
      transcripts = await ff.listAllTranscripts(fromDate);
      console.log(`   ${transcripts.length} transcripts found in Fireflies`);
    } catch (e) {
      console.error(`   ✗ Fireflies API error: ${e.message}`);
      continue;
    }

    if (!transcripts.length) { console.log("   Nothing to sync.\n"); continue; }

    // Fetch already-processed transcript IDs for this org
    let processed = [];
    try {
      processed = await dbGet("fireflies_processed_calls", `org_id=eq.${orgId}&status=eq.completed`);
    } catch { /* ignore */ }
    const doneIds = new Set(processed.map(p => String(p.fireflies_transcript_id)));

    // Identify new transcripts
    const toProcess = transcripts
      .map(t => {
        const id = String(t.id || "");
        const title = t.title || id;
        const ts = typeof t.date === "number" ? t.date : new Date(t.date).getTime();
        const dateStr = ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?";
        return { id, title, dateStr };
      })
      .filter(t => t.id && !doneIds.has(t.id));

    console.log(`   ${doneIds.size} already synced · ${toProcess.length} new to process`);

    if (!toProcess.length) { console.log("   All caught up.\n"); continue; }

    // Process in parallel batches
    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      const batch = toProcess.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (t) => {
        process.stdout.write(`   ⟳ [${t.dateStr}] ${t.title.slice(0, 50).padEnd(50)}  `);
        try {
          const result = await processTranscript(ff, t.id, orgId, client);
          console.log(`✓ score ${result.score}${result.rep ? "  rep: " + result.rep : ""}`);
          totals.processed++;
        } catch (e) {
          console.log(`✗ ${e.message}`);
          totals.failed++;
        }
      }));

      const done = Math.min(i + CONCURRENCY, toProcess.length);
      if (toProcess.length > CONCURRENCY) {
        console.log(`   … ${done}/${toProcess.length} processed`);
      }
    }
    console.log();
  }

  console.log(` Done: ${totals.processed} synced · ${totals.skipped} skipped · ${totals.failed} failed\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

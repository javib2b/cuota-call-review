#!/usr/bin/env node
// One-off script to re-analyze all saved calls with the new /10 rubric + risk indicators.
//
// Usage:
//   SUPABASE_SERVICE_KEY=your_key ANTHROPIC_API_KEY=your_key node scripts/reanalyze-all.mjs
//
// Optional:
//   --dry-run     Preview which calls would be re-analyzed without making changes
//   --limit N     Only process N calls (useful for testing)

const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_KEY env var"); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error("Missing ANTHROPIC_API_KEY env var"); process.exit(1); }

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

const CATEGORIES = [
  { id: "pre_call_research", name: "Pre-Call Research" },
  { id: "intro_opening", name: "Intro/Opening" },
  { id: "agenda", name: "Agenda" },
  { id: "discovery", name: "Discovery" },
  { id: "pitch", name: "Pitch" },
  { id: "services_product", name: "Services/Product Overview" },
  { id: "pricing", name: "Pricing" },
  { id: "next_steps", name: "Next Steps/Closing" },
  { id: "objection_handling", name: "Objection Handling" },
];

const ANALYSIS_PROMPT = `You are an expert sales call reviewer using the Cuota scoring rubric. Analyze the following sales call transcript.

SCORING RUBRIC — 9 categories, each scored out of 10 (total /90):
1. PRE-CALL RESEARCH (pre_call_research): Did the rep show evidence of researching the prospect, their company, industry, and pain points before the call?
2. INTRO/OPENING (intro_opening): Did the rep introduce themselves clearly, build rapport, and set a professional tone?
3. AGENDA (agenda): Did the rep set a clear agenda, confirm time, and get buy-in on what would be covered?
4. DISCOVERY (discovery): Quality and depth of questions to uncover pain, impact, timeline, and decision process.
5. PITCH (pitch): Was the pitch tailored to the prospect's specific situation and pain points uncovered in discovery?
6. SERVICES/PRODUCT OVERVIEW (services_product): Was the product/service explanation clear, relevant, and tied to value rather than features?
7. PRICING (pricing): Was pricing discussed confidently, anchored to value, and objections around cost handled well?
8. NEXT STEPS/CLOSING (next_steps): Were specific next steps proposed, calendar commitments obtained, and clear action items assigned?
9. OBJECTION HANDLING (objection_handling): Were objections acknowledged, explored, and addressed effectively with evidence or reframing?

For each category, provide:
- score: An integer from 0 to 10
- details: 2-3 sentences explaining the score — what the rep did well or missed

RISK INDICATORS — assess each of these (flagged = true if the risk is present):
- meddpicc_gaps: Are there significant gaps in MEDDPICC qualification? (Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Implicated Pain, Champion, Competition)
- single_threaded: Is this deal relying on a single contact with no multi-threading or stakeholder engagement?
- no_decision_maker: Does the rep lack access to or awareness of the economic buyer / decision maker?
- engagement_gap: Is there evidence of a long gap between this and previous interactions, or stalling momentum?
- no_next_steps: Were next steps vague, missing, or not committed to with a specific date/time?

For each risk, provide:
- flagged: true or false
- details: 1-2 sentences explaining why the risk is or isn't present

ALSO PROVIDE:
- gut_check: An honest 3-5 sentence paragraph giving your overall gut feeling about this call. Be direct and constructive.
- strengths: Exactly 3 strengths, each with a short title and 1-2 sentence description.
- areas_of_opportunity: 2-4 areas where the rep can improve. Each must have a description of the gap AND a "fix" — a specific, actionable suggestion the rep can implement immediately.

ALSO EXTRACT from the transcript:
- rep_name: The sales rep / account executive name
- prospect_company: The prospect's company name
- prospect_name: The main prospect/buyer on the call
- call_type: One of Discovery, Demo, Follow-up, Negotiation, Closing
- deal_stage: One of Early, Mid-Pipe, Late Stage, Negotiation

RESPOND ONLY WITH VALID JSON:
{"metadata":{"rep_name":"...","prospect_company":"...","prospect_name":"...","call_type":"...","deal_stage":"..."},"scores":{"pre_call_research":{"score":7,"details":"..."},"intro_opening":{"score":8,"details":"..."},"agenda":{"score":6,"details":"..."},"discovery":{"score":7,"details":"..."},"pitch":{"score":5,"details":"..."},"services_product":{"score":6,"details":"..."},"pricing":{"score":4,"details":"..."},"next_steps":{"score":8,"details":"..."},"objection_handling":{"score":7,"details":"..."}},"risks":{"meddpicc_gaps":{"flagged":true,"details":"..."},"single_threaded":{"flagged":false,"details":"..."},"no_decision_maker":{"flagged":true,"details":"..."},"engagement_gap":{"flagged":false,"details":"..."},"no_next_steps":{"flagged":false,"details":"..."}},"gut_check":"...","strengths":[{"title":"...","description":"..."},{"title":"...","description":"..."},{"title":"...","description":"..."}],"areas_of_opportunity":[{"description":"...","fix":"..."},{"description":"...","fix":"..."}]}`;

const headers = {
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

async function fetchAllCalls() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/call_reviews?select=id,prospect_company,call_date,call_type,deal_stage,deal_value,category_scores,transcript,overall_score&order=created_at.asc`, { headers });
  if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function analyzeTranscript(transcript) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: ANALYSIS_PROMPT + "\n\n---\n\nTRANSCRIPT:\n" + transcript }],
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `Claude API error (${res.status})`);
  }

  const data = await res.json();
  const text = data.content.map((c) => c.text || "").join("");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

function computeScores(aiResult) {
  const scores = {};
  CATEGORIES.forEach((cat) => {
    const ai = aiResult.scores[cat.id];
    if (ai) scores[cat.id] = { score: ai.score || 0, details: ai.details || "" };
  });
  if (aiResult.metadata) {
    scores.rep_name = aiResult.metadata.rep_name || "";
    scores.prospect_name = aiResult.metadata.prospect_name || "";
  }
  const total = CATEGORIES.reduce((sum, cat) => sum + (scores[cat.id]?.score || 0), 0);
  return { scores, overallScore: Math.round((total / 90) * 100) };
}

async function updateCall(id, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/call_reviews?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Update failed for ${id}: ${r.status} ${await r.text()}`);
}

async function main() {
  console.log("Fetching all calls from Supabase...");
  const calls = await fetchAllCalls();
  console.log(`Found ${calls.length} calls.`);

  const toProcess = calls.filter(c => c.transcript && c.transcript.trim().length > 50);
  const skipped = calls.length - toProcess.length;
  if (skipped > 0) console.log(`Skipping ${skipped} calls with no/short transcript.`);

  const batch = toProcess.slice(0, limit);
  console.log(`Will process ${batch.length} calls${dryRun ? " (DRY RUN)" : ""}.\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const call = batch[i];
    const label = `[${i + 1}/${batch.length}] ${call.id} — ${call.prospect_company || "Unknown"} (${call.call_date || "no date"})`;

    if (dryRun) {
      console.log(`  ${label} — would re-analyze (transcript: ${call.transcript.length} chars)`);
      continue;
    }

    try {
      process.stdout.write(`  ${label} — analyzing...`);
      const aiResult = await analyzeTranscript(call.transcript);
      const computed = computeScores(aiResult);

      // Preserve existing metadata from category_scores (client, rep_name, gong data, etc.)
      const existingCS = call.category_scores || {};
      const preservedKeys = {};
      for (const [k, v] of Object.entries(existingCS)) {
        // Keep non-category keys (client, rep_name, prospect_name, gong_*, call_title)
        if (!CATEGORIES.some(cat => cat.id === k) && typeof v !== "object") {
          preservedKeys[k] = v;
        }
        // Also preserve array/string metadata keys from Gong enrichment
        if (k.startsWith("gong_") || k === "call_title") {
          preservedKeys[k] = v;
        }
      }

      const newCategoryScores = {
        ...computed.scores,
        ...preservedKeys,
      };

      // Use AI-extracted metadata but prefer existing values for rep_name/prospect_name if they came from Gong
      if (existingCS.rep_name) newCategoryScores.rep_name = existingCS.rep_name;
      if (existingCS.prospect_name) newCategoryScores.prospect_name = existingCS.prospect_name;
      if (existingCS.client) newCategoryScores.client = existingCS.client;

      const updateData = {
        category_scores: newCategoryScores,
        overall_score: computed.overallScore,
        risk_flags: aiResult.risks || null,
        ai_analysis: aiResult,
        coaching_notes: aiResult.gut_check || "",
        // Preserve call_type/deal_stage from AI if not already set meaningfully
        call_type: aiResult.metadata?.call_type || call.call_type || "Discovery",
        deal_stage: aiResult.metadata?.deal_stage || call.deal_stage || "Early",
      };

      await updateCall(call.id, updateData);

      const flaggedCount = aiResult.risks ? Object.values(aiResult.risks).filter(r => r.flagged).length : 0;
      console.log(` done. Score: ${computed.overallScore}% | Risks: ${flaggedCount} flagged`);
      success++;
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    if (i < batch.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone! ${success} succeeded, ${failed} failed${skipped > 0 ? `, ${skipped} skipped (no transcript)` : ""}.`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });

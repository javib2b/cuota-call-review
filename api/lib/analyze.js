// Server-side Claude analysis module
// Duplicated scoring constants from src/App.jsx to keep serverless functions self-contained

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
{"metadata":{"rep_name":"...","prospect_company":"...","prospect_name":"...","call_type":"...","deal_stage":"..."},"scores":{"pre_call_research":{"score":7,"details":"..."},"intro_opening":{"score":8,"details":"..."},"agenda":{"score":6,"details":"..."},"discovery":{"score":7,"details":"..."},"pitch":{"score":5,"details":"..."},"services_product":{"score":6,"details":"..."},"pricing":{"score":4,"details":"..."},"next_steps":{"score":8,"details":"..."},"objection_handling":{"score":7,"details":"..."}},"gut_check":"...","strengths":[{"title":"...","description":"..."},{"title":"...","description":"..."},{"title":"...","description":"..."}],"areas_of_opportunity":[{"description":"...","fix":"..."},{"description":"...","fix":"..."}]}`;

// Call Claude API and parse the analysis result
export async function analyzeTranscript(transcript) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

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

// Compute overall score from AI result — new /10 rubric
export function computeScores(aiResult) {
  const scores = {};

  // Build category scores object with { score, details } per category
  CATEGORIES.forEach((cat) => {
    const ai = aiResult.scores[cat.id];
    if (ai) {
      scores[cat.id] = { score: ai.score || 0, details: ai.details || "" };
    }
  });

  // Add metadata to category_scores
  if (aiResult.metadata) {
    scores.rep_name = aiResult.metadata.rep_name || "";
    scores.prospect_name = aiResult.metadata.prospect_name || "";
  }

  // Calculate overall score: sum of /10 scores → percentage of /90
  const total = CATEGORIES.reduce((sum, cat) => {
    const cs = scores[cat.id];
    return sum + (cs?.score || 0);
  }, 0);
  const overallScore = Math.round((total / 90) * 100);

  return { scores, overallScore };
}

// Build the call_reviews row from analysis results
export function buildCallData(aiResult, computed, transcript, orgId, repId, client) {
  return {
    org_id: orgId,
    ...(repId ? { rep_id: repId } : {}),
    prospect_company: aiResult.metadata?.prospect_company || "",
    call_date: new Date().toISOString().split("T")[0],
    call_type: aiResult.metadata?.call_type || "Discovery",
    deal_stage: aiResult.metadata?.deal_stage || "Early",
    deal_value: null,
    category_scores: {
      ...computed.scores,
      client: client || aiResult.metadata?.prospect_company || "Other",
    },
    overall_score: computed.overallScore,
    momentum_score: null,
    close_probability: null,
    risk_flags: null,
    transcript,
    ai_analysis: aiResult,
    coaching_notes: aiResult.gut_check || "",
  };
}

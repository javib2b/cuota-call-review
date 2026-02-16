// Server-side Claude analysis module
// Duplicated scoring constants from src/App.jsx to keep serverless functions self-contained

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CATEGORIES = [
  { id: "opening", name: "Opening & Agenda Setting", weight: 8, criteria: ["Confirmed time available", "Stated clear agenda/purpose", "Asked prospect to add items", "Set expectations for outcome"] },
  { id: "discovery", name: "Discovery Depth", weight: 15, criteria: ["Identified core business pain", "Quantified impact of the problem", "Explored timeline/urgency", "Uncovered previous attempts to solve", "Asked 'why now?' or trigger event"] },
  { id: "qualification", name: "Qualification (MEDDPICC)", weight: 15, criteria: ["Metrics: Success criteria defined", "Economic Buyer: Identified or accessed", "Decision Criteria: Understood", "Decision Process: Mapped", "Paper Process: Legal/procurement discussed", "Implicated Pain: Connected to business impact", "Champion: Identified and tested", "Competition: Landscape understood"] },
  { id: "storytelling", name: "Storytelling & Social Proof", weight: 10, criteria: ["Used relevant customer story", "Matched story to prospect's situation", "Included specific metrics/outcomes", "Created 'that could be us' moment"] },
  { id: "objection", name: "Objection Handling", weight: 12, criteria: ["Acknowledged the concern genuinely", "Asked clarifying questions before responding", "Reframed rather than argued", "Used evidence/proof to address", "Confirmed resolution before moving on"] },
  { id: "demo", name: "Demo / Value Presentation", weight: 10, criteria: ["Tied features to stated pain points", "Avoided feature dumping", "Asked engagement questions during demo", "Created 'aha' moments"] },
  { id: "multithreading", name: "Multi-threading & Stakeholders", weight: 10, criteria: ["Asked about other stakeholders", "Understood org structure", "Planned to engage additional contacts", "Discussed how to get champion buy-in"] },
  { id: "nextsteps", name: "Next Steps & Commitment", weight: 12, criteria: ["Proposed specific next step", "Got calendar commitment (date/time)", "Assigned clear action items", "Summarized what was agreed", "Created urgency or deadline"] },
  { id: "control", name: "Call Control & Presence", weight: 8, criteria: ["Managed talk/listen ratio well", "Redirected tangents effectively", "Showed confidence and authority", "Used silence effectively", "Matched prospect's energy/pace"] },
];

const RISK_DEFINITIONS = [
  { id: "single_thread", severity: "high" },
  { id: "no_next_steps", severity: "high" },
  { id: "no_pain", severity: "high" },
  { id: "happy_ears", severity: "medium" },
  { id: "no_champion", severity: "medium" },
  { id: "competitor_unhandled", severity: "medium" },
  { id: "no_timeline", severity: "medium" },
  { id: "no_budget", severity: "low" },
  { id: "low_engagement", severity: "high" },
  { id: "feature_dump", severity: "low" },
];

const ANALYSIS_PROMPT = "You are an expert sales call reviewer using the Cuota Revenue Framework. Analyze the following sales call transcript.\n\nSCORING FRAMEWORK (9 categories):\n1. OPENING (8%): Confirmed time | Stated agenda | Asked prospect to add | Set expectations\n2. DISCOVERY (15%): Core pain | Quantified impact | Timeline/urgency | Previous attempts | Why now\n3. QUALIFICATION MEDDPICC (15%): Metrics | Economic Buyer | Decision Criteria | Decision Process | Paper Process | Implicated Pain | Champion | Competition\n4. STORYTELLING (10%): Customer story | Matched situation | Specific metrics | That could be us moment\n5. OBJECTION HANDLING (12%): Acknowledged | Clarifying questions | Reframed | Evidence | Confirmed resolution\n6. DEMO (10%): Tied to pain | No feature dump | Engagement questions | Aha moments\n7. MULTI-THREADING (10%): Other stakeholders | Org structure | Additional contacts | Champion buy-in\n8. NEXT STEPS (12%): Specific step | Calendar commitment | Action items | Summarized | Urgency\n9. CALL CONTROL (8%): Talk ratio | Redirected tangents | Confidence | Silence | Matched energy\n\nRISK FLAGS: single_thread, no_next_steps, no_pain, happy_ears, no_champion, competitor_unhandled, no_timeline, no_budget, low_engagement, feature_dump\n\nALSO EXTRACT from the transcript:\n- rep_name: The sales rep / account executive name\n- prospect_company: The prospect's company name\n- prospect_name: The main prospect/buyer on the call\n- call_type: One of Discovery, Demo, Follow-up, Negotiation, Closing\n- deal_stage: One of Early, Mid-Pipe, Late Stage, Negotiation\n\nRESPOND ONLY WITH VALID JSON:\n{\"metadata\":{\"rep_name\":\"...\",\"prospect_company\":\"...\",\"prospect_name\":\"...\",\"call_type\":\"...\",\"deal_stage\":\"...\"},\"scores\":{\"opening\":{\"criteria_met\":[true,false,...],\"key_moment\":\"...\"},\"discovery\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"qualification\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"storytelling\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"objection\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"demo\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"multithreading\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"nextsteps\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"control\":{\"criteria_met\":[...],\"key_moment\":\"...\"}},\"risks\":{\"single_thread\":false,\"no_next_steps\":false,\"no_pain\":false,\"happy_ears\":false,\"no_champion\":false,\"competitor_unhandled\":false,\"no_timeline\":false,\"no_budget\":false,\"low_engagement\":false,\"feature_dump\":false},\"coaching_notes\":\"...\",\"executive_summary\":\"...\",\"top_3_improvements\":[\"...\",\"...\",\"...\"],\"strongest_moment\":\"...\",\"biggest_miss\":\"...\"}";

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
      max_tokens: 4096,
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

// Compute overall score, momentum, and close probability from AI result
export function computeScores(aiResult) {
  const scores = {};

  // Build category scores object (same shape as frontend)
  CATEGORIES.forEach((cat) => {
    const ai = aiResult.scores[cat.id];
    if (ai) {
      scores[cat.id] = {};
      ai.criteria_met.forEach((met, i) => {
        scores[cat.id][i] = met;
      });
    }
  });

  // Add metadata to category_scores
  if (aiResult.metadata) {
    scores.rep_name = aiResult.metadata.rep_name || "";
    scores.prospect_name = aiResult.metadata.prospect_name || "";
  }

  // Calculate overall score (weighted)
  const overallScore = Math.round(
    CATEGORIES.reduce((t, cat) => {
      const cs = scores[cat.id] || {};
      const met = Object.values(cs).filter(Boolean).length;
      return t + (cat.criteria.length > 0 ? met / cat.criteria.length : 0) * cat.weight;
    }, 0)
  );

  // Calculate momentum
  const calcFactor = (id) => {
    const cs = scores[id] || {};
    const cat = CATEGORIES.find((c) => c.id === id);
    return cat ? Object.values(cs).filter(Boolean).length / cat.criteria.length || 0 : 0;
  };
  const momentum = Math.round(
    calcFactor("nextsteps") * 30 + calcFactor("discovery") * 25 + calcFactor("qualification") * 25 + calcFactor("multithreading") * 20
  );

  // Calculate close probability
  const risks = aiResult.risks || {};
  const hrc = RISK_DEFINITIONS.filter((r) => risks[r.id] && r.severity === "high").length;
  const mrc = RISK_DEFINITIONS.filter((r) => risks[r.id] && r.severity === "medium").length;
  const closeProbability = Math.max(5, Math.min(95, Math.round(overallScore * 0.5 + momentum * 0.5 - hrc * 12 - mrc * 5)));

  return { scores, overallScore, momentum, closeProbability };
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
    momentum_score: computed.momentum,
    close_probability: computed.closeProbability,
    risk_flags: aiResult.risks || {},
    transcript,
    ai_analysis: aiResult,
    coaching_notes: aiResult.coaching_notes || "",
  };
}

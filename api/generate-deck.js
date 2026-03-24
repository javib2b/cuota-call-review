// POST /api/generate-deck
// Body: { context: { companyName, client, prospectCompany, dealStage, callType, repName, painPoints, referenceText }, apiKey? }
// Returns: { slides: [...] }

import { authenticateUser } from "./_lib/supabase.js";

const SYSTEM_PROMPT = `You are an expert B2B enterprise sales deck designer. Generate highly personalized, specific slide content as structured JSON. Be hyper-specific — use real numbers, concrete timelines, and language from the reference material. Never use generic filler. Every line must earn its place.`;

function buildPrompt(ctx) {
  const hasIntelligence = ctx.callIntelligence && ctx.callIntelligence.trim().length > 10;
  return `Create a 9-slide sales deck for this engagement:

COMPANY (selling): ${ctx.companyName || "Our Company"}
PROSPECT/CLIENT: ${ctx.prospectCompany || ctx.client || "the prospect"}
DEAL STAGE: ${ctx.dealStage || "Mid-Pipe"}
DECK TYPE: ${ctx.callType || "Demo"}
REP: ${ctx.repName || ""}
PAIN POINTS / KEY THEMES: ${ctx.painPoints || (hasIntelligence ? "see call intelligence below" : "not specified")}
${ctx.referenceText ? `\nREFERENCE MATERIAL (match this tone, style, and messaging):\n${ctx.referenceText.substring(0, 3500)}\n` : ""}${hasIntelligence ? `\nREAL CALL INTELLIGENCE (from ${ctx.callCount || "multiple"} reviewed sales calls with this client — use these real patterns):
${ctx.callIntelligence.substring(0, 3500)}

MANDATORY INSTRUCTIONS — YOU MUST FOLLOW THESE OR THE OUTPUT IS WRONG:
- Every slide must contain at least one piece of language, a number, or a concept pulled VERBATIM or PARAPHRASED from the call intelligence above
- Problem slide: each bullet must name a pain that was explicitly mentioned in calls — no generic phrases like "lack of visibility" unless a rep actually said it
- Solution slide: each bullet must directly counter a problem from the calls — frame as "we do X, which others can't because Y"
- Proof slide: the quote must sound like it came from a prospect at ${ctx.prospectCompany || ctx.client || "this company"} — reference their deal stage, their specific pain, or their situation
- CTA slide: closing line must mention the specific prospect and deal context by name
- Features slide: columns must be the 3 actual reasons reps are winning or losing on these calls — not generic capabilities
- If any competitor is mentioned in the calls, address it head-on in the problem or features slide
- Derive 3 core win themes from the call intelligence and weave them through the entire deck consistently
` : ""}

Return ONLY valid JSON — no markdown fences, no explanation, nothing else.

{
  "slides": [
    {
      "type": "title",
      "title": "Compelling value-focused headline (max 8 words, specific to their situation)",
      "subtitle": "${ctx.prospectCompany || ctx.client || "Prospect"} · ${ctx.callType || "Presentation"} · ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}"
    },
    {
      "type": "agenda",
      "title": "Today's Agenda",
      "points": ["Agenda item 1", "Agenda item 2", "Agenda item 3", "Agenda item 4"]
    },
    {
      "type": "problem",
      "title": "The Challenges You're Navigating",
      "points": ["Specific pain point 1 tied to their context — be concrete", "Specific pain point 2 with a measurable impact", "Specific pain point 3", "Specific pain point 4"]
    },
    {
      "type": "solution",
      "title": "How We Solve It",
      "points": ["Solution mapped directly to pain 1", "Solution mapped directly to pain 2", "Solution mapped directly to pain 3", "Solution mapped directly to pain 4"]
    },
    {
      "type": "features",
      "title": "What Sets Us Apart",
      "columns": [
        {"heading": "Capability 1", "body": "2-3 sentences on why this matters specifically to them, not generic benefits"},
        {"heading": "Capability 2", "body": "2-3 sentences on why this matters specifically to them"},
        {"heading": "Capability 3", "body": "2-3 sentences on why this matters specifically to them"}
      ]
    },
    {
      "type": "proof",
      "title": "Don't Take Our Word For It",
      "quote": "A real, human-sounding testimonial — conversational, not corporate-speak. Should reflect a situation similar to this prospect's.",
      "attribution": "Name, Title at Company Name",
      "metrics": ["X% outcome improvement tied to their specific pain", "Y days to full adoption", "Z ROI in first 90 days"]
    },
    {
      "type": "roi",
      "title": "The Business Case",
      "metrics": [
        {"label": "Expected ROI", "value": "3.2x"},
        {"label": "Time to Value", "value": "45 days"},
        {"label": "Cost Reduction", "value": "35%"},
        {"label": "Hours Saved / Week", "value": "12 hrs"}
      ]
    },
    {
      "type": "timeline",
      "title": "Getting Started is Simple",
      "steps": [
        {"phase": "Week 1-2", "description": "Kickoff, access provisioning, and team onboarding"},
        {"phase": "Week 3-4", "description": "Pilot launch with core workflows and initial adoption"},
        {"phase": "Month 2", "description": "Full rollout, integrations live, and adoption tracking"},
        {"phase": "Month 3+", "description": "Optimization, expanded use cases, and QBR cadence"}
      ]
    },
    {
      "type": "cta",
      "title": "The Ask",
      "points": ["Schedule 30-min pilot kick-off this week — no IT work required", "Connect ${ctx.companyName || "us"} with their procurement/IT lead by Friday", "Sign 90-day pilot SOW — we handle the rest"],
      "closing": "Personalized closing tied to their exact situation and the value you've discussed — make it memorable"
    }
  ]
}

IMPORTANT for roi slide: Derive metrics from the actual pain points provided — use realistic numbers that reflect their industry and situation, not placeholder values.
IMPORTANT for proof slide: The quote must sound like a real person said it in a conversation, not a press release.
IMPORTANT for cta slide: Every next step must be time-boxed and concrete (e.g. "this week", "by Friday", "30-min call") — never vague.`;
}

function buildMSPPrompt(ctx) {
  const hasIntelligence = ctx.callIntelligence && ctx.callIntelligence.trim().length > 10;
  return `Create a 6-slide Mutual Success Plan for this engagement:

COMPANY (selling): ${ctx.companyName || "Our Company"}
PROSPECT/CLIENT: ${ctx.prospectCompany || ctx.client || "the prospect"}
DEAL STAGE: ${ctx.dealStage || "Late Stage"}
REP: ${ctx.repName || ""}
PAIN POINTS / SUCCESS CRITERIA: ${ctx.painPoints || (hasIntelligence ? "see call intelligence below" : "not specified")}
${ctx.referenceText ? `\nREFERENCE MATERIAL:\n${ctx.referenceText.substring(0, 2500)}\n` : ""}${hasIntelligence ? `\nCALL INTELLIGENCE (from ${ctx.callCount || "multiple"} reviewed calls):
${ctx.callIntelligence.substring(0, 2500)}
Use the real pain points and patterns from these calls to ground the MSP in actual conversations.
Derive shared goals and success KPIs from the actual outcomes and objections visible in the call intelligence — not generic placeholders.
` : ""}

Return ONLY valid JSON — no markdown fences, no explanation, nothing else.

{
  "slides": [
    {
      "type": "title",
      "title": "Mutual Success Plan: [Prospect Name]",
      "subtitle": "${ctx.companyName || "Our Company"} × ${ctx.prospectCompany || ctx.client || "Prospect"} · ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}"
    },
    {
      "type": "success",
      "subtype": "goals",
      "title": "Shared Goals",
      "points": ["Specific shared goal 1 — tie to their business outcome", "Specific shared goal 2", "Specific shared goal 3", "Specific shared goal 4"]
    },
    {
      "type": "success",
      "subtype": "kpis",
      "title": "Success KPIs",
      "kpis": [
        {"label": "KPI 1 description", "value": "target value"},
        {"label": "KPI 2 description", "value": "target value"},
        {"label": "KPI 3 description", "value": "target value"},
        {"label": "KPI 4 description", "value": "target value"},
        {"label": "KPI 5 description", "value": "target value"},
        {"label": "KPI 6 description", "value": "target value"}
      ]
    },
    {
      "type": "success",
      "subtype": "milestones",
      "title": "Key Milestones",
      "items": [
        {"milestone": "Milestone 1 description", "date": "Week 1", "owner": "Both"},
        {"milestone": "Milestone 2 description", "date": "Week 2", "owner": "${ctx.companyName || "Us"}"},
        {"milestone": "Milestone 3 description", "date": "Week 3-4", "owner": "${ctx.prospectCompany || ctx.client || "Prospect"}"},
        {"milestone": "Milestone 4 description", "date": "Month 2", "owner": "Both"},
        {"milestone": "Milestone 5 description", "date": "Month 3", "owner": "Both"}
      ]
    },
    {
      "type": "success",
      "subtype": "ownership",
      "title": "Who Owns What",
      "items": [
        {"goal": "Responsibility 1", "owner": "${ctx.companyName || "Us"}"},
        {"goal": "Responsibility 2", "owner": "${ctx.prospectCompany || ctx.client || "Prospect"}"},
        {"goal": "Responsibility 3", "owner": "${ctx.companyName || "Us"}"},
        {"goal": "Responsibility 4", "owner": "${ctx.prospectCompany || ctx.client || "Prospect"}"},
        {"goal": "Responsibility 5", "owner": "Both"}
      ]
    },
    {
      "type": "success",
      "subtype": "signoff",
      "title": "Commitments & Sign-Off",
      "points": ["Commitment 1 — specific and time-bound", "Commitment 2 — specific and time-bound", "Commitment 3 — specific and time-bound", "Commitment 4 — specific and time-bound"]
    }
  ]
}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { context, apiKey: userKey } = req.body || {};
    if (!context) return res.status(400).json({ error: "Missing context" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY || userKey;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    const isMSP = context.callType === "Mutual Success Plan";
    const prompt = isMSP ? buildMSPPrompt(context) : buildPrompt(context);

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const data = await claudeRes.json();
    const text = data.content?.map((c) => c.text || "").join("") || "";

    const jsonMatch = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) throw new Error("Invalid deck structure returned");

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("generate-deck error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

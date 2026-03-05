// POST /api/generate-deck
// Body: { context: { companyName, client, prospectCompany, dealStage, callType, repName, painPoints, referenceText }, apiKey? }
// Returns: { slides: [...] }

import { authenticateUser } from "./_lib/supabase.js";

const SYSTEM_PROMPT = `You are an expert B2B enterprise sales deck designer. Generate highly personalized, specific slide content as structured JSON. Never use generic filler — make every line specific to the context provided.`;

function buildPrompt(ctx) {
  return `Create a 9-slide sales deck for this engagement:

COMPANY (selling): ${ctx.companyName || "Our Company"}
PROSPECT/CLIENT: ${ctx.prospectCompany || ctx.client || "the prospect"}
DEAL STAGE: ${ctx.dealStage || "Mid-Pipe"}
DECK TYPE: ${ctx.callType || "Demo"}
REP: ${ctx.repName || ""}
PAIN POINTS / KEY THEMES: ${ctx.painPoints || "not specified"}
${ctx.referenceText ? `\nREFERENCE MATERIAL (match this tone, style, and messaging):\n${ctx.referenceText.substring(0, 3500)}\n` : ""}

Return ONLY valid JSON — no markdown fences, no explanation, nothing else.

{
  "slides": [
    {
      "type": "title",
      "title": "Compelling value-focused headline (max 8 words)",
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
      "points": ["Specific pain point 1 tied to their context", "Specific pain point 2", "Specific pain point 3", "Specific pain point 4"]
    },
    {
      "type": "solution",
      "title": "How We Solve It",
      "points": ["Solution mapped to pain 1", "Solution mapped to pain 2", "Solution mapped to pain 3", "Solution mapped to pain 4"]
    },
    {
      "type": "features",
      "title": "What Sets Us Apart",
      "columns": [
        {"heading": "Capability 1", "body": "2-3 sentence description of why this matters to them"},
        {"heading": "Capability 2", "body": "2-3 sentence description of why this matters to them"},
        {"heading": "Capability 3", "body": "2-3 sentence description of why this matters to them"}
      ]
    },
    {
      "type": "proof",
      "title": "Don't Take Our Word For It",
      "quote": "Specific customer testimonial that would resonate with this prospect's situation",
      "attribution": "Name, Title at Company Name",
      "metrics": ["X% outcome improvement", "Y days/weeks to value", "Z ROI achieved"]
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
      "points": ["Specific next step 1 (e.g. schedule 2-week pilot, align stakeholders)", "Specific next step 2 (e.g. sign SOW, connect to IT team)"],
      "closing": "Personalized closing statement tied to their specific situation and the value you discussed"
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
        messages: [{ role: "user", content: buildPrompt(context) }],
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

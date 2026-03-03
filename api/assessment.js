// POST /api/assessment — run a GTM assessment with AI
import { authenticateUser } from "./_lib/supabase.js";

const ASSESSMENT_PROMPTS = {
  gtm_strategy: `You are an expert fractional CRO evaluating a company's GTM strategy.
Score the following responses on a scale of 0–100 and provide a 2-3 paragraph narrative assessment.
Focus on ICP clarity, differentiation strength, channel mix, and outbound structure.`,

  top_of_funnel: `You are an expert growth advisor evaluating top-of-funnel performance.
Score the following responses on a scale of 0–100 and provide a 2-3 paragraph narrative assessment.
Focus on lead volume, conversion rates, channel efficiency, and velocity.`,

  revops: `You are an expert RevOps consultant evaluating revenue operations maturity.
Score the following responses on a scale of 0–100 and provide a 2-3 paragraph narrative assessment.
Focus on CRM hygiene, pipeline discipline, forecasting accuracy, and process documentation.`,

  hiring: `You are an expert sales hiring advisor evaluating talent acquisition and onboarding.
Score the following responses on a scale of 0–100 and provide a 2-3 paragraph narrative assessment.
Focus on interview rigor, onboarding structure, ramp time, and success criteria clarity.`,

  metrics: `You are an expert sales performance analyst evaluating key metrics against benchmarks.
Score the following responses on a scale of 0–100 and provide a 2-3 paragraph narrative assessment.
Focus on quota attainment, pipeline coverage, win rate, and ramp efficiency vs. SaaS benchmarks.`,
};

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

    const { assessmentType, client, answers, apiKey: userKey } = req.body || {};
    if (!assessmentType || !answers) return res.status(400).json({ error: "Missing required fields" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY || userKey;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    const systemPrompt = ASSESSMENT_PROMPTS[assessmentType] || ASSESSMENT_PROMPTS.gtm_strategy;
    const answersText = Object.entries(answers)
      .map(([k, v]) => `Q: ${k.replace(/_/g, " ")}\nA: ${v}`)
      .join("\n\n");

    const prompt = `${systemPrompt}

Client: ${client}

Responses:
${answersText}

RESPOND ONLY WITH VALID JSON:
{"score": 72, "narrative": "2-3 paragraph narrative here..."}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(502).json({ error: e.error?.message || "Claude API error" });
    }

    const data = await claudeRes.json();
    const text = data.content.map(c => c.text || "").join("");
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());
    return res.status(200).json(result);
  } catch (err) {
    console.error("Assessment error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

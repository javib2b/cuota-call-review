// POST /api/revenue-bridge — generate a revenue bridge plan with AI
import { authenticateUser } from "./_lib/supabase.js";

const PROMPT = (ctx) => `You are an expert fractional CRO advising a B2B SaaS company on their revenue strategy.

Based on the following revenue data, generate a "What Has to Be True" revenue bridge plan.
Write exactly 5 specific, actionable bullet points that explain what must happen for the company to hit their ARR goal.
Be direct and specific — reference the actual numbers. Each bullet should be 1-2 sentences.

Data:
- Current ARR: $${(ctx.current_arr || 0).toLocaleString()}
- ARR Goal: $${(ctx.arr_goal || 0).toLocaleString()}
- ARR Gap: $${(ctx.arr_gap || 0).toLocaleString()}
- Months Remaining: ${ctx.months_remaining || "unknown"}
- Deals Needed: ${ctx.deals_needed || 0}
- Avg Deal Size: $${(ctx.avg_deal_size || 0).toLocaleString()}
- Current Win Rate: ${ctx.win_rate_pct || 0}%
- Pipeline Needed: $${(ctx.pipeline_needed || 0).toLocaleString()}
- Deals Per Month Required: ${ctx.deals_per_month || 0}
- AEs Needed: ${ctx.aes_needed || 0}
- Avg Call Review Score: ${ctx.avg_score_pct || "N/A"}% (out of 100)
- Total Call Reviews Analyzed: ${ctx.total_reviews || 0}

RESPOND ONLY WITH VALID JSON: {"bullets": ["bullet1", "bullet2", "bullet3", "bullet4", "bullet5"]}`;

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
        max_tokens: 2048,
        messages: [{ role: "user", content: PROMPT(context || {}) }],
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
    console.error("Revenue bridge error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

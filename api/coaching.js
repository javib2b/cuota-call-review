// POST /api/coaching — generate a personalized coaching plan for a rep
import { authenticateUser } from "./_lib/supabase.js";

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

    const { repName, calls, apiKey: userKey } = req.body || {};
    if (!repName || !calls) return res.status(400).json({ error: "Missing required fields" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY || userKey;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    const callSummary = calls
      .map((c, i) => `Call ${i + 1}: ${c.date} — Score: ${c.score}% — Weaknesses: ${c.weaknesses?.join(", ") || "none"}`)
      .join("\n");

    const prompt = `You are an expert sales coach. Based on the following call review data for ${repName}, generate a 3-bullet personalized coaching plan.
Each bullet should be specific, actionable, and reference patterns from their actual performance.
Focus on the top 1-2 recurring weaknesses.

Call history:
${callSummary}

Top recurring weaknesses: ${calls[0]?.weaknesses?.join(", ") || "review pending"}

RESPOND ONLY WITH VALID JSON: {"bullets": ["coaching point 1", "coaching point 2", "coaching point 3"]}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
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
    console.error("Coaching error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

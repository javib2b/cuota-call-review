// POST /api/extract-brand
// Body: { text: "...extracted slide text..." }
// Returns: { brand: { companyName, primaryColor, accentColor, referenceText, toneNotes } }

import { authenticateUser } from "./_lib/supabase.js";

const SYSTEM = `You are a brand extraction expert. Analyze presentation content and extract structured brand information as JSON.`;

function buildPrompt(text) {
  return `Analyze this extracted text from a sales presentation deck and extract brand information.

DECK TEXT:
${text.substring(0, 8000)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "companyName": "The selling company's name (not the prospect's). Look for company names in headers, footers, and intro slides.",
  "primaryColor": "#hex — the dominant brand color. If you see color keywords like 'navy', 'dark blue', 'midnight' use #1e3a5f. If 'black' use #0f1923. If 'dark green' use #0d3b2e. If unclear, use #1e3a5f.",
  "accentColor": "#hex — the highlight/CTA color. If you see 'green', 'emerald', 'lime' use #31CE81. If 'orange' use #f97316. If 'blue' use #3b82f6. If unclear, use #31CE81.",
  "referenceText": "2-3 paragraphs summarizing: (1) the core value proposition and key messaging pillars, (2) the slide structure and flow, (3) the tone and writing style. This will guide generation of a new deck that matches this brand.",
  "toneNotes": "One sentence describing the tone, e.g. 'Enterprise-focused, data-driven, concise bullets with ROI emphasis.'"
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

    const { text, apiKey: userKey } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "No text provided. Could not read slide content from the file." });

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
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(text) }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({
        error: e.error?.message || `Claude API error (${claudeRes.status})`,
      });
    }

    const data = await claudeRes.json();
    const rawText = data.content?.map((c) => c.text || "").join("") || "";

    const jsonMatch = rawText.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON returned from Claude");

    const brand = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ brand });
  } catch (err) {
    console.error("extract-brand error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

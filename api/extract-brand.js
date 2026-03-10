// POST /api/extract-brand
// Body (one of):
//   { text: "...extracted slide text..." }          → PPTX/text path
//   { pdfBase64: "data:application/pdf;base64,..." } → PDF path (Claude vision)
// Returns: { companyName, primaryColor, accentColor, referenceText, toneNotes }

import { authenticateUser } from "./_lib/supabase.js";

const SYSTEM = `You are a brand extraction expert. Analyze presentation content and extract structured brand information.`;

function textPrompt(text) {
  return `Analyze this extracted text from a sales presentation deck and extract brand information.

DECK TEXT:
${text.substring(0, 6000)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "companyName": "The selling company's name (not the prospect's)",
  "primaryColor": "#hex — the dominant brand color (dark/navy background or primary heading color). If unclear, use #1e3a5f",
  "accentColor": "#hex — the accent/highlight color (buttons, callouts, CTAs). If unclear, use #31CE81",
  "referenceText": "2-3 paragraphs summarizing the brand voice, key messaging pillars, value propositions, and slide structure found in this deck. This will be used to make a new deck match this style.",
  "toneNotes": "1 sentence describing the tone (e.g. 'Enterprise, data-driven, concise bullet points')"
}`;
}

function pdfMessages(base64Data) {
  // Strip data URL prefix if present
  const b64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  return [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: b64 },
        },
        {
          type: "text",
          text: `Analyze this sales presentation deck PDF and extract brand information.

Return ONLY valid JSON (no markdown, no explanation):
{
  "companyName": "The selling company's name (not the prospect's)",
  "primaryColor": "#hex — the dominant brand color (dark/navy background or primary heading color). If unclear, use #1e3a5f",
  "accentColor": "#hex — the accent/highlight color (buttons, callouts, CTAs). If unclear, use #31CE81",
  "referenceText": "2-3 paragraphs summarizing the brand voice, key messaging pillars, value propositions, and slide structure found in this deck. This will be used to make a new deck match this style.",
  "toneNotes": "1 sentence describing the tone (e.g. 'Enterprise, data-driven, concise bullet points')"
}`,
        },
      ],
    },
  ];
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

    const { text, pdfBase64, apiKey: userKey } = req.body || {};
    if (!text && !pdfBase64) return res.status(400).json({ error: "Provide text or pdfBase64" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY || userKey;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    const isPdf = !!pdfBase64;
    const messages = isPdf
      ? pdfMessages(pdfBase64)
      : [{ role: "user", content: textPrompt(text) }];

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        // PDF documents require the beta header
        ...(isPdf ? { "anthropic-beta": "pdfs-2024-09-25" } : {}),
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const data = await claudeRes.json();
    const rawText = data.content?.map((c) => c.text || "").join("") || "";

    const jsonMatch = rawText.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON returned from Claude");

    const brand = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ brand });
  } catch (err) {
    console.error("extract-brand error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

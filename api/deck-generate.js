// POST /api/deck-generate — Generate AI-powered branded sales deck content
// Body: { prospect, company?, product?, context? }
import { authenticateUser } from "./_lib/supabase.js";

const DECK_PROMPT = `You are Cuota's presentation strategist. Generate a branded sales deck for the given prospect.

Return ONLY valid JSON with this structure:
{
  "slides": [
    {
      "type": "title",
      "title": "Main title",
      "subtitle": "Subtitle text"
    },
    {
      "type": "agenda",
      "title": "Agenda",
      "items": ["Item 1", "Item 2", "Item 3", "Item 4"]
    },
    {
      "type": "problem",
      "title": "The Challenge",
      "headline": "Key problem statement",
      "bullets": ["Pain point 1", "Pain point 2", "Pain point 3"],
      "stat": { "value": "47%", "label": "of companies face this issue" }
    },
    {
      "type": "solution",
      "title": "Our Solution",
      "headline": "One-line value prop",
      "features": [
        { "name": "Feature 1", "description": "Short description" },
        { "name": "Feature 2", "description": "Short description" },
        { "name": "Feature 3", "description": "Short description" }
      ]
    },
    {
      "type": "proof",
      "title": "Results That Speak",
      "case_studies": [
        { "company": "Company A", "result": "3x improvement in X", "quote": "Short testimonial" },
        { "company": "Company B", "result": "50% reduction in Y", "quote": "Short testimonial" }
      ]
    },
    {
      "type": "differentiators",
      "title": "Why Us",
      "items": [
        { "point": "Differentiator 1", "detail": "Brief explanation" },
        { "point": "Differentiator 2", "detail": "Brief explanation" },
        { "point": "Differentiator 3", "detail": "Brief explanation" }
      ]
    },
    {
      "type": "pricing",
      "title": "Investment",
      "headline": "Flexible pricing that scales with you",
      "tiers": [
        { "name": "Starter", "description": "For small teams", "highlight": false },
        { "name": "Growth", "description": "For scaling orgs", "highlight": true },
        { "name": "Enterprise", "description": "Custom solutions", "highlight": false }
      ]
    },
    {
      "type": "next_steps",
      "title": "Next Steps",
      "steps": ["Step 1", "Step 2", "Step 3"],
      "cta": "Call to action text"
    },
    {
      "type": "closing",
      "title": "Thank You",
      "subtitle": "Contact info or closing message"
    }
  ]
}

Make the content SPECIFIC to the prospect company, their industry pain points, and how the seller's solution addresses their needs. Be concrete with numbers, not generic.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { prospect, company, product, context } = req.body || {};
    if (!prospect || !prospect.trim()) {
      return res.status(400).json({ error: "Prospect company name is required" });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(400).json({ error: "No API key configured." });
    }

    const userMessage = `${DECK_PROMPT}\n\nProspect Company: ${prospect}\nSeller Company: ${company || "Our company"}\nProduct/Service: ${product || "Our solution"}\n${context ? `Additional context: ${context}` : ""}`;

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
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const data = await claudeRes.json();
    const text = data.content.map((c) => c.text || "").join("");
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());

    return res.status(200).json(result);
  } catch (err) {
    console.error("Deck generate error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

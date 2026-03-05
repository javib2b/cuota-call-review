// POST /api/client-research — AI-powered company research for call preparation
// Body: { company, context? }
import { authenticateUser } from "./_lib/supabase.js";

const RESEARCH_PROMPT = `You are Cuota's client research analyst. Research the following company and return a JSON object with intelligence that helps sales reps prepare for calls.

Return ONLY valid JSON with this structure:
{
  "company_overview": {
    "name": "Company name",
    "industry": "Industry",
    "description": "2-3 sentence overview",
    "founded": "Year or unknown",
    "headquarters": "Location",
    "employee_count": "Estimate",
    "revenue_estimate": "Estimate or range",
    "funding_stage": "If applicable",
    "key_products": ["Product 1", "Product 2"]
  },
  "key_people": [
    {
      "name": "Full name",
      "title": "Title",
      "relevance": "Why they matter for the deal",
      "talking_points": ["Point 1", "Point 2"]
    }
  ],
  "pain_points": [
    {
      "pain": "Specific pain point",
      "evidence": "How we know this",
      "cuota_angle": "How our solution addresses it"
    }
  ],
  "competitive_landscape": {
    "main_competitors": ["Competitor 1", "Competitor 2"],
    "our_differentiators": ["Diff 1", "Diff 2"],
    "potential_objections": ["Objection 1", "Objection 2"],
    "objection_rebuttals": ["Rebuttal 1", "Rebuttal 2"]
  },
  "call_preparation": {
    "recommended_opening": "Suggested opening statement",
    "discovery_questions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"],
    "value_props_to_emphasize": ["Value prop 1", "Value prop 2"],
    "stories_to_reference": ["Relevant case study or story"],
    "things_to_avoid": ["Thing to avoid 1"]
  },
  "deal_intelligence": {
    "buying_signals": ["Signal 1"],
    "risk_factors": ["Risk 1"],
    "recommended_deal_stage_focus": "What to focus on",
    "suggested_next_steps": ["Step 1", "Step 2"]
  },
  "recent_news": [
    {
      "headline": "News headline",
      "relevance": "Why it matters for the call",
      "talking_point": "How to reference it"
    }
  ]
}`;

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

    const { company, context } = req.body || {};
    if (!company || !company.trim()) {
      return res.status(400).json({ error: "Company name is required" });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(400).json({ error: "No API key configured." });
    }

    const userMessage = `${RESEARCH_PROMPT}\n\nCompany to research: ${company}\n${context ? `Additional context: ${context}` : ""}`;

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
    console.error("Client research error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

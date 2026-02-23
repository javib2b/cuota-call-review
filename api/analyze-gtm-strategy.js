// POST /api/analyze-gtm-strategy — evaluate GTM strategy quality with Claude
// Body: { client, data: { icp, personas, valueProposition, channels, competitive, notes } }
import { authenticateUser } from "./lib/supabase.js";

const PROMPT = `You are an expert B2B GTM strategist. Evaluate the following GTM strategy inputs for {CLIENT} and score each dimension of their go-to-market strategy.

SCORING SCALE:
- Needs Improvement: 0-39 (critical gaps, no clear strategy)
- Below Average: 40-49 (exists but weak, inconsistent)
- Average: 50-64 (functional but generic, lacks depth)
- Great: 65-79 (solid, clear, mostly well-executed)
- Excellent: 80-100 (best-in-class, precise, differentiated)

EVALUATE THESE 6 DIMENSIONS (score each 0-100):
1. GTM Hypothesis: Is there a crisp "who, why now, how, where" defined? Is targeting specific or still broad?
2. Ideal Customer Profile: How precise and operationalized is the ICP? Does it include company type, headcount, industry, revenue band?
3. Buyer Persona: How well-defined are the buyer personas? Do they include roles, KPIs, decision criteria, buying signals?
4. Customer Acquisition Channels: Is there a clear multi-channel strategy? Are channels prioritized and owned?
5. Channel Targeting: Is there a specific playbook per channel (LinkedIn, email, phone, emerging)?
6. Competitive Analysis & Positioning: Is competitive differentiation clear and trained? Can the team articulate it?

GTM STRATEGY INPUTS:
{DATA}

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100, weighted average>,
  "summary": "<3-4 sentence direct assessment of GTM strategy maturity>",
  "sub_scores": [
    {"category": "GTM Hypothesis", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence>"},
    {"category": "Ideal Customer Profile", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Buyer Persona", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Customer Acquisition Channels", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Channel Targeting", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Competitive Analysis", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"},
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation with rationale>"},
    {"title": "<action>", "description": "<specific recommendation with rationale>"}
  ]
}`;

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

    const { client, data = {} } = req.body || {};
    if (!client) return res.status(400).json({ error: "Client name is required" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured. Ask your admin to set ANTHROPIC_API_KEY." });

    const dataLines = [];
    if (data.icp?.trim()) dataLines.push(`ICP Definition: ${data.icp}`);
    if (data.personas?.trim()) dataLines.push(`Buyer Personas: ${data.personas}`);
    if (data.valueProposition?.trim()) dataLines.push(`Value Proposition: ${data.valueProposition}`);
    if (data.channels?.trim()) dataLines.push(`Acquisition Channels: ${data.channels}`);
    if (data.competitive?.trim()) dataLines.push(`Competitive Positioning: ${data.competitive}`);
    if (data.notes?.trim()) dataLines.push(`Additional Context: ${data.notes}`);

    if (dataLines.length === 0) return res.status(400).json({ error: "No GTM data provided." });

    const prompt = PROMPT.replace("{CLIENT}", client).replace("{DATA}", dataLines.join("\n\n"));

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const result = await claudeRes.json();
    const text = result.content.map((c) => c.text || "").join("");
    return res.status(200).json(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (err) {
    console.error("Analyze-gtm-strategy error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

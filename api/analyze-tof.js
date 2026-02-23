// POST /api/analyze-tof — evaluate top-of-funnel strategy with Claude
// Body: { client, data: { inboundVolume, outboundVolume, inboundConvRate, outboundReplyRate, emailOpenRate, contentCadence, brandDescription, websiteNotes, notes } }
import { authenticateUser } from "./lib/supabase.js";

const PROMPT = `You are an expert B2B demand generation analyst. Evaluate the following top-of-funnel metrics and strategy for {CLIENT}.

SCORING SCALE:
- Needs Improvement: 0-39 (critical gaps)
- Below Average: 40-49 (exists but weak)
- Average: 50-64 (functional but not optimized)
- Great: 65-79 (strong, well-executed)
- Excellent: 80-100 (best-in-class)

EVALUATE THESE 6 DIMENSIONS (score each 0-100):
1. Target Audience & Segmentation: How specific is targeting? Is there a crisp ICP applied to campaigns with clear messaging per segment?
2. Lead Generation Channels & Tactics: Is there a diversified, owned channel strategy? Are outbound and inbound both functioning well?
3. Brand Building: Is there consistent thought leadership, message consistency, and social proof being built?
4. Website & Landing Page Optimization: Does the website convert well, communicate clearly, and attract the right traffic?
5. Content Strategy & Assets: Is content being published regularly, distributed across channels, and enabling the sales team?
6. Outbound Email & Conversion Rates: Are outbound sequences performing at benchmark? Is there testing and personalization?

TOP OF FUNNEL DATA:
{DATA}

INDUSTRY BENCHMARKS (B2B SaaS):
- Outbound email open rate: 30-50% is good; below 20% is poor
- Outbound reply rate: 3-8% is good; below 1% is poor
- Meeting conversion (outbound): 1-3% of touches; below 0.5% is poor
- Inbound lead quality: High volume ≠ high quality; qualification rate matters

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100>,
  "summary": "<3-4 sentence direct assessment>",
  "sub_scores": [
    {"category": "Target Audience & Segmentation", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence>"},
    {"category": "Lead Generation Channels", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Brand Building", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Website Optimization", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Content Strategy", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Outbound Email Performance", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"},
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's missing and why it matters>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation>"},
    {"title": "<action>", "description": "<specific recommendation>"}
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
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    const fmt = (n) => Number(n).toLocaleString();
    const dataLines = [];
    if (data.inboundVolume) dataLines.push(`Inbound Leads/Month: ${fmt(data.inboundVolume)}`);
    if (data.outboundVolume) dataLines.push(`Outbound Sequences Active/Month: ${fmt(data.outboundVolume)}`);
    if (data.inboundConvRate) dataLines.push(`Inbound → Meeting Conversion Rate: ${data.inboundConvRate}%`);
    if (data.outboundReplyRate) dataLines.push(`Outbound Email Reply Rate: ${data.outboundReplyRate}%`);
    if (data.emailOpenRate) dataLines.push(`Email Open Rate: ${data.emailOpenRate}%`);
    if (data.contentCadence?.trim()) dataLines.push(`Content Strategy / Cadence: ${data.contentCadence}`);
    if (data.brandDescription?.trim()) dataLines.push(`Brand Building Efforts: ${data.brandDescription}`);
    if (data.websiteNotes?.trim()) dataLines.push(`Website / Landing Pages: ${data.websiteNotes}`);
    if (data.notes?.trim()) dataLines.push(`Additional Context: ${data.notes}`);

    if (dataLines.length === 0) return res.status(400).json({ error: "No top-of-funnel data provided." });

    const prompt = PROMPT.replace("{CLIENT}", client).replace("{DATA}", dataLines.join("\n"));

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
    console.error("Analyze-tof error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

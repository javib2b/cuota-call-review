// POST /api/analyze-crm — analyze CRM pipeline data with Claude
// Body: { client, crmData, snapshotDate }
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

    const { client, crmData = {}, snapshotDate } = req.body || {};
    if (!client) return res.status(400).json({ error: "Client name is required" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured. Ask your admin to set ANTHROPIC_API_KEY." });

    // Build a readable data summary for the prompt
    const dataLines = [];
    const fmt = (n) => Number(n).toLocaleString();
    if (crmData.quota) dataLines.push(`Quota: $${fmt(crmData.quota)}`);
    if (crmData.totalPipeline) dataLines.push(`Total Pipeline: $${fmt(crmData.totalPipeline)}`);
    if (crmData.quota && crmData.totalPipeline) {
      const coverage = ((Number(crmData.totalPipeline) / Number(crmData.quota)) * 100).toFixed(0);
      dataLines.push(`Pipeline Coverage Ratio: ${coverage}% of quota`);
    }
    if (crmData.activeDeals) dataLines.push(`Active Deals: ${crmData.activeDeals}`);
    if (crmData.winRate) dataLines.push(`Win Rate: ${crmData.winRate}%`);
    if (crmData.avgDealSize) dataLines.push(`Average Deal Size: $${fmt(crmData.avgDealSize)}`);
    if (crmData.avgCycleDays) dataLines.push(`Average Sales Cycle: ${crmData.avgCycleDays} days`);
    if (crmData.earlyStage) dataLines.push(`Early Stage Pipeline: $${fmt(crmData.earlyStage)}`);
    if (crmData.midStage) dataLines.push(`Mid-Pipeline: $${fmt(crmData.midStage)}`);
    if (crmData.lateStage) dataLines.push(`Late Stage Pipeline: $${fmt(crmData.lateStage)}`);
    if (crmData.negotiation) dataLines.push(`Negotiation Stage: $${fmt(crmData.negotiation)}`);
    if (crmData.wonThisMonth) dataLines.push(`Won This Month: $${fmt(crmData.wonThisMonth)}`);
    if (crmData.lostThisMonth) dataLines.push(`Lost This Month: $${fmt(crmData.lostThisMonth)}`);
    if (crmData.notes) dataLines.push(`Additional Context: ${crmData.notes}`);

    if (dataLines.length === 0) return res.status(400).json({ error: "No pipeline data provided to analyze." });

    const PROMPT = `You are an expert B2B sales operations analyst. Analyze the following pipeline data for ${client} (as of ${snapshotDate || "today"}) and provide a comprehensive health assessment.

Pipeline Data:
${dataLines.join("\n")}

Respond with valid JSON ONLY using this exact structure:
{
  "health_score": <integer 0-100, overall pipeline health score>,
  "summary": "<3-5 sentence direct assessment covering health, key risks, and outlook. Be specific to the numbers provided.>",
  "key_metrics": [
    {"label": "<metric name>", "value": "<formatted value>", "status": "<good|warning|bad|neutral>", "note": "<1 sentence context>"},
    ... up to 6 of the most important metrics derived from the data
  ],
  "insights": [
    {"type": "<risk|opportunity|observation>", "text": "<specific, actionable insight tied to the actual numbers>"},
    ... 3-5 insights
  ],
  "recommendations": [
    {"title": "<action title>", "description": "<specific recommendation with clear rationale tied to the data>"},
    ... 3-4 recommendations
  ]
}

Focus on: pipeline coverage vs quota, velocity, stage distribution health, win rate implications, and forecast quality. Be direct and quantitative.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: PROMPT }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const data = await claudeRes.json();
    const text = data.content.map((c) => c.text || "").join("");
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());
    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze-crm error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// POST /api/analyze-metrics — benchmark sales metrics against industry standards
// Body: { client, data: { quotaAttainment, pipelineCoverage, winRate, avgDealSize, saleCycleDays, sdrMeetings, aeRampMonths, managerRatio, cac, notes } }
import { authenticateUser } from "./lib/supabase.js";

const PROMPT = `You are an expert B2B SaaS revenue operations analyst. Benchmark the following sales metrics for {CLIENT} against industry standards and evaluate performance across 5 dimensions.

SCORING SCALE:
- Needs Improvement: 0-39 (significantly below benchmark)
- Below Average: 40-49 (somewhat below benchmark)
- Average: 50-64 (at benchmark)
- Great: 65-79 (above benchmark)
- Excellent: 80-100 (top quartile performance)

B2B SAAS INDUSTRY BENCHMARKS:
- Quota Attainment: Top quartile = 70%+ of reps at quota; average = 50-60%
- Pipeline Coverage: Healthy = 3-4x quota; < 2.5x is risky
- Win Rate: Top = 25-35%; average = 15-25%; poor = < 15%
- Sales Cycle: Depends on ACV but SMB <30d, mid-market 30-90d, enterprise 90-180d
- SDR Meetings/Month: Top = 15-20+; average = 8-12; poor = <6
- AE Ramp Time: Top = 3-4 months; average = 4-6 months; poor = >6 months
- Manager:Rep Ratio: Ideal = 1:6-8; too wide = 1:10+
- CAC: Benchmark varies by segment; LTV:CAC > 3x is healthy

EVALUATE THESE 5 DIMENSIONS (score each 0-100):
1. Outbound Benchmarks: How does outbound performance (reply rates, meetings booked) compare to industry benchmarks?
2. SDR Benchmarks: How do SDR productivity metrics (meetings/month, pipeline contribution) compare?
3. AE Benchmarks: How do AE performance metrics (quota attainment, win rate, cycle time) compare?
4. Management Benchmarks: How does pipeline coverage, forecast accuracy, and manager leverage compare?
5. Revenue Benchmarks: How do revenue efficiency metrics (CAC, LTV, ARR growth) compare?

METRICS DATA FOR {CLIENT}:
{DATA}

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100>,
  "summary": "<3-4 sentence benchmarking assessment — be direct and quantitative>",
  "sub_scores": [
    {"category": "Outbound Benchmarks", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence with specific comparison to benchmark>"},
    {"category": "SDR Benchmarks", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "AE Benchmarks", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Management Benchmarks", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Revenue Benchmarks", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "key_metrics": [
    {"label": "<metric>", "value": "<formatted value>", "benchmark": "<industry benchmark>", "status": "<good|warning|bad|neutral>"},
    ... up to 6 most important metrics
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's below benchmark>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's below benchmark>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation tied to the data>"},
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
    if (data.quotaAttainment) dataLines.push(`% of Reps at Quota: ${data.quotaAttainment}%`);
    if (data.pipelineCoverage) dataLines.push(`Pipeline Coverage Ratio: ${data.pipelineCoverage}x`);
    if (data.winRate) dataLines.push(`Win Rate: ${data.winRate}%`);
    if (data.avgDealSize) dataLines.push(`Average Deal Size: $${fmt(data.avgDealSize)}`);
    if (data.saleCycleDays) dataLines.push(`Average Sales Cycle: ${data.saleCycleDays} days`);
    if (data.sdrMeetings) dataLines.push(`SDR Meetings Booked/Month (per SDR): ${data.sdrMeetings}`);
    if (data.outboundReplyRate) dataLines.push(`Outbound Email Reply Rate: ${data.outboundReplyRate}%`);
    if (data.aeRampMonths) dataLines.push(`AE Average Ramp Time: ${data.aeRampMonths} months`);
    if (data.managerRatio) dataLines.push(`Manager:Rep Ratio: 1:${data.managerRatio}`);
    if (data.cac) dataLines.push(`Customer Acquisition Cost (CAC): $${fmt(data.cac)}`);
    if (data.ltv) dataLines.push(`Lifetime Value (LTV): $${fmt(data.ltv)}`);
    if (data.notes?.trim()) dataLines.push(`Additional Context: ${data.notes}`);

    if (dataLines.length === 0) return res.status(400).json({ error: "No metrics data provided." });

    const prompt = PROMPT.replace(/{CLIENT}/g, client).replace("{DATA}", dataLines.join("\n"));

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
    console.error("Analyze-metrics error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

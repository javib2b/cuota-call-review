// POST /api/analyze-hiring — evaluate sales hiring practices with Claude
// Body: { client, data: { profileCriteria, interviewProcess, hasScorecard, hasMockPitch, hasManagerPlan, timeToHire, offerAcceptRate, rampTime, notes } }
import { authenticateUser } from "./lib/supabase.js";

const PROMPT = `You are an expert B2B sales talent and hiring consultant. Evaluate the following sales hiring practices for {CLIENT}.

SCORING SCALE:
- Needs Improvement: 0-39 (no structure, reactive hiring)
- Below Average: 40-49 (some process but inconsistent)
- Average: 50-64 (structured but not optimized)
- Great: 65-79 (well-designed, mostly consistent)
- Excellent: 80-100 (best-in-class, data-driven, repeatable)

EVALUATE THESE 6 DIMENSIONS (score each 0-100):
1. SDR & AE Profiling: Are ideal candidate profiles defined with specific competencies, skills, and disqualifiers?
2. Interview Process: Is there a structured multi-stage process with clear evaluation criteria at each stage?
3. Interview Conversions: Are conversion rates tracked at each stage? Is the funnel optimized?
4. Interview Panel: Is there a diverse, consistent panel? Are evaluators calibrated on what good looks like?
5. Mock Pitches: Is a mock pitch or role-play part of the process? Are evaluation rubrics defined?
6. Manager 30/60/90: Is there a structured onboarding plan for new managers? Does it include defined milestones and accountability checkpoints?

HIRING DATA:
{DATA}

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100>,
  "summary": "<3-4 sentence direct assessment of hiring program maturity>",
  "sub_scores": [
    {"category": "SDR & AE Profiling", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence>"},
    {"category": "Interview Process", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Interview Conversions", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Interview Panel", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Mock Pitches", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Manager 30/60/90", "score": <0-100>, "status": "...", "note": "..."}
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

    const dataLines = [];
    if (data.profileCriteria?.trim()) dataLines.push(`Candidate Profile Criteria: ${data.profileCriteria}`);
    if (data.interviewProcess?.trim()) dataLines.push(`Interview Process Description: ${data.interviewProcess}`);
    if (data.hasScorecard !== undefined) dataLines.push(`Standardized Interview Scorecard: ${data.hasScorecard ? "Yes" : "No"}`);
    if (data.hasMockPitch !== undefined) dataLines.push(`Mock Pitch in Interview Process: ${data.hasMockPitch ? "Yes" : "No"}`);
    if (data.hasManagerPlan !== undefined) dataLines.push(`Manager 30/60/90 Plan Exists: ${data.hasManagerPlan ? "Yes" : "No"}`);
    if (data.timeToHire) dataLines.push(`Average Time to Hire: ${data.timeToHire} days`);
    if (data.offerAcceptRate) dataLines.push(`Offer Acceptance Rate: ${data.offerAcceptRate}%`);
    if (data.rampTime) dataLines.push(`Average AE Ramp Time: ${data.rampTime} months`);
    if (data.notes?.trim()) dataLines.push(`Additional Context: ${data.notes}`);

    if (dataLines.length === 0) return res.status(400).json({ error: "No hiring data provided." });

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
    console.error("Analyze-hiring error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

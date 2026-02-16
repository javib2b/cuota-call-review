// POST /api/analyze — analyze a transcript with Claude (server-side)
// Body: { transcript, apiKey? }
// Uses ANTHROPIC_API_KEY env var, falls back to user-provided apiKey
import { authenticateUser } from "./lib/supabase.js";

const ANALYSIS_PROMPT = `You are an expert sales call reviewer using the Cuota scoring rubric. Analyze the following sales call transcript.

SCORING RUBRIC — 9 categories, each scored out of 10 (total /90):
1. PRE-CALL RESEARCH (pre_call_research): Did the rep show evidence of researching the prospect, their company, industry, and pain points before the call?
2. INTRO/OPENING (intro_opening): Did the rep introduce themselves clearly, build rapport, and set a professional tone?
3. AGENDA (agenda): Did the rep set a clear agenda, confirm time, and get buy-in on what would be covered?
4. DISCOVERY (discovery): Quality and depth of questions to uncover pain, impact, timeline, and decision process.
5. PITCH (pitch): Was the pitch tailored to the prospect's specific situation and pain points uncovered in discovery?
6. SERVICES/PRODUCT OVERVIEW (services_product): Was the product/service explanation clear, relevant, and tied to value rather than features?
7. PRICING (pricing): Was pricing discussed confidently, anchored to value, and objections around cost handled well?
8. NEXT STEPS/CLOSING (next_steps): Were specific next steps proposed, calendar commitments obtained, and clear action items assigned?
9. OBJECTION HANDLING (objection_handling): Were objections acknowledged, explored, and addressed effectively with evidence or reframing?

For each category, provide:
- score: An integer from 0 to 10
- details: 2-3 sentences explaining the score — what the rep did well or missed

ALSO PROVIDE:
- gut_check: An honest 3-5 sentence paragraph giving your overall gut feeling about this call. Be direct and constructive.
- strengths: Exactly 3 strengths, each with a short title and 1-2 sentence description.
- areas_of_opportunity: 2-4 areas where the rep can improve. Each must have a description of the gap AND a "fix" — a specific, actionable suggestion the rep can implement immediately.

ALSO EXTRACT from the transcript:
- rep_name: The sales rep / account executive name
- prospect_company: The prospect's company name
- prospect_name: The main prospect/buyer on the call
- call_type: One of Discovery, Demo, Follow-up, Negotiation, Closing
- deal_stage: One of Early, Mid-Pipe, Late Stage, Negotiation

RESPOND ONLY WITH VALID JSON:
{"metadata":{"rep_name":"...","prospect_company":"...","prospect_name":"...","call_type":"...","deal_stage":"..."},"scores":{"pre_call_research":{"score":7,"details":"..."},"intro_opening":{"score":8,"details":"..."},"agenda":{"score":6,"details":"..."},"discovery":{"score":7,"details":"..."},"pitch":{"score":5,"details":"..."},"services_product":{"score":6,"details":"..."},"pricing":{"score":4,"details":"..."},"next_steps":{"score":8,"details":"..."},"objection_handling":{"score":7,"details":"..."}},"gut_check":"...","strengths":[{"title":"...","description":"..."},{"title":"...","description":"..."},{"title":"...","description":"..."}],"areas_of_opportunity":[{"description":"...","fix":"..."},{"description":"...","fix":"..."}]}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { transcript, apiKey: userKey } = req.body || {};
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    // Use server env key first, fall back to user-provided key
    const anthropicKey = process.env.ANTHROPIC_API_KEY || userKey;
    if (!anthropicKey) {
      return res.status(400).json({ error: "No API key configured. Ask your admin to set ANTHROPIC_API_KEY." });
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: ANALYSIS_PROMPT + "\n\n---\n\nTRANSCRIPT:\n" + transcript }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      const msg = e.error?.message || `Claude API error (${claudeRes.status})`;
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: msg });
    }

    const data = await claudeRes.json();
    const text = data.content.map((c) => c.text || "").join("");
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());

    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

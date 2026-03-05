// POST /api/agent-review — Cuota Agent AI call coaching using C.U.O.T.A. framework
// Body: { transcript }
import { authenticateUser } from "./_lib/supabase.js";

const AGENT_PROMPT = `You are the Cuota AI Sales Agent — an elite sales coach that reviews calls and shows exactly how it would have handled the conversation differently using the Cuota Call Framework.

THE CUOTA CALL FRAMEWORK:
1. CONNECT (Opening) — Build rapport, confirm time, set agenda, establish credibility
2. UNCOVER (Discovery) — Deep pain discovery, quantify impact, understand urgency, explore current state
3. ORIENT (Qualification) — MEDDPICC qualification, map buying committee, understand decision process
4. TRANSFORM (Demo/Value) — Tailored presentation, tie features to outcomes, social proof, storytelling
5. ADVANCE (Next Steps) — Get commitment, create urgency, mutual action plan, multi-thread

For the given transcript, provide a thorough coaching review. Return ONLY valid JSON:
{
  "framework_scores": {
    "connect": { "score": 0-100, "summary": "One sentence assessment" },
    "uncover": { "score": 0-100, "summary": "One sentence assessment" },
    "orient": { "score": 0-100, "summary": "One sentence assessment" },
    "transform": { "score": 0-100, "summary": "One sentence assessment" },
    "advance": { "score": 0-100, "summary": "One sentence assessment" }
  },
  "overall_framework_score": 0-100,
  "cuota_agent_playback": {
    "what_went_well": ["Specific thing 1", "Specific thing 2"],
    "critical_misses": ["Miss 1 with explanation", "Miss 2 with explanation"],
    "rewritten_moments": [
      {
        "timestamp_context": "Context of when this happened",
        "what_rep_said": "Actual quote or paraphrase",
        "what_cuota_would_say": "The improved version",
        "technique_used": "Name of the sales technique",
        "expected_impact": "Why this would work better"
      }
    ],
    "talk_track_suggestions": [
      {
        "situation": "When the prospect says X",
        "cuota_response": "Here's exactly what to say",
        "technique": "Name of technique"
      }
    ]
  },
  "coaching_plan": {
    "immediate_action": "The one thing to fix before the next call",
    "weekly_focus": "Skill to practice this week",
    "resource_recommendation": "Book, course, or framework to study"
  },
  "deal_assessment": {
    "win_probability": 0-100,
    "deal_health": "Healthy|At Risk|Critical",
    "recommended_next_play": "Specific next action for this deal"
  }
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

    const { transcript } = req.body || {};
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(400).json({ error: "No API key configured." });
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
        messages: [{ role: "user", content: AGENT_PROMPT + "\n\nTRANSCRIPT:\n" + transcript }],
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
    console.error("Agent review error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

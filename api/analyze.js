// POST /api/analyze — analyze a transcript with Claude (server-side)
// Body: { transcript, apiKey? }
// Uses ANTHROPIC_API_KEY env var, falls back to user-provided apiKey
import { authenticateUser } from "./lib/supabase.js";

const ANALYSIS_PROMPT = "You are an expert sales call reviewer using the Cuota Revenue Framework. Analyze the following sales call transcript.\n\nSCORING FRAMEWORK (9 categories):\n1. OPENING (8%): Confirmed time | Stated agenda | Asked prospect to add | Set expectations\n2. DISCOVERY (15%): Core pain | Quantified impact | Timeline/urgency | Previous attempts | Why now\n3. QUALIFICATION MEDDPICC (15%): Metrics | Economic Buyer | Decision Criteria | Decision Process | Paper Process | Implicated Pain | Champion | Competition\n4. STORYTELLING (10%): Customer story | Matched situation | Specific metrics | That could be us moment\n5. OBJECTION HANDLING (12%): Acknowledged | Clarifying questions | Reframed | Evidence | Confirmed resolution\n6. DEMO (10%): Tied to pain | No feature dump | Engagement questions | Aha moments\n7. MULTI-THREADING (10%): Other stakeholders | Org structure | Additional contacts | Champion buy-in\n8. NEXT STEPS (12%): Specific step | Calendar commitment | Action items | Summarized | Urgency\n9. CALL CONTROL (8%): Talk ratio | Redirected tangents | Confidence | Silence | Matched energy\n\nRISK FLAGS: single_thread, no_next_steps, no_pain, happy_ears, no_champion, competitor_unhandled, no_timeline, no_budget, low_engagement, feature_dump\n\nALSO EXTRACT from the transcript:\n- rep_name: The sales rep / account executive name\n- prospect_company: The prospect's company name\n- prospect_name: The main prospect/buyer on the call\n- call_type: One of Discovery, Demo, Follow-up, Negotiation, Closing\n- deal_stage: One of Early, Mid-Pipe, Late Stage, Negotiation\n\nRESPOND ONLY WITH VALID JSON:\n{\"metadata\":{\"rep_name\":\"...\",\"prospect_company\":\"...\",\"prospect_name\":\"...\",\"call_type\":\"...\",\"deal_stage\":\"...\"},\"scores\":{\"opening\":{\"criteria_met\":[true,false,...],\"key_moment\":\"...\"},\"discovery\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"qualification\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"storytelling\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"objection\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"demo\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"multithreading\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"nextsteps\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"control\":{\"criteria_met\":[...],\"key_moment\":\"...\"}},\"risks\":{\"single_thread\":false,\"no_next_steps\":false,\"no_pain\":false,\"happy_ears\":false,\"no_champion\":false,\"competitor_unhandled\":false,\"no_timeline\":false,\"no_budget\":false,\"low_engagement\":false,\"feature_dump\":false},\"coaching_notes\":\"...\",\"executive_summary\":\"...\",\"top_3_improvements\":[\"...\",\"...\",\"...\"],\"strongest_moment\":\"...\",\"biggest_miss\":\"...\"}";

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
        max_tokens: 4096,
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

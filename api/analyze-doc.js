// POST /api/analyze-doc — analyze a sales enablement document with Claude
// Body: { content, docType, title? }
import { authenticateUser } from "./_lib/supabase.js";

const DOC_ANALYSIS_PROMPT = `You are an expert sales enablement consultant. Analyze the following sales document and provide a thorough quality audit.

Document Type: {DOC_TYPE}

SCORING — rate each dimension out of 10:
1. CLARITY (clarity): Is the messaging clear, concise, and jargon-free? Can the target buyer easily understand it?
2. VALUE_PROPOSITION (value_proposition): Does it clearly articulate a compelling, differentiated value proposition?
3. BUYER_FOCUS (buyer_focus): Is it buyer-centric — focused on their pain, goals, and outcomes — vs. feature-heavy?
4. PROOF_POINTS (proof_points): Are there specific data points, case studies, metrics, or testimonials to build credibility?
5. CALL_TO_ACTION (call_to_action): Is the CTA clear, specific, low-friction, and compelling?
6. OBJECTION_HANDLING (objection_handling): Does it preemptively address common objections or competitive concerns?
7. COMPETITIVE_POSITIONING (competitive_positioning): Does it effectively differentiate from alternatives?
8. STRUCTURE (structure): Is it logically structured, scannable, and easy to navigate?
9. TONE (tone): Is the tone appropriate, consistent, and aligned with the target buyer persona?
10. COMPLETENESS (completeness): Does it include all essential elements for a document of this type?

RESPOND WITH VALID JSON ONLY:
{
  "overall_score": <integer 0-100, weighted average of all category scores converted to percentage>,
  "summary": "<2-3 sentence overall assessment — be direct and actionable>",
  "scores": {
    "clarity": {"score": <0-10>, "details": "<2 sentences>"},
    "value_proposition": {"score": <0-10>, "details": "<2 sentences>"},
    "buyer_focus": {"score": <0-10>, "details": "<2 sentences>"},
    "proof_points": {"score": <0-10>, "details": "<2 sentences>"},
    "call_to_action": {"score": <0-10>, "details": "<2 sentences>"},
    "objection_handling": {"score": <0-10>, "details": "<2 sentences>"},
    "competitive_positioning": {"score": <0-10>, "details": "<2 sentences>"},
    "structure": {"score": <0-10>, "details": "<2 sentences>"},
    "tone": {"score": <0-10>, "details": "<2 sentences>"},
    "completeness": {"score": <0-10>, "details": "<2 sentences>"}
  },
  "key_strengths": [
    {"title": "<strength title>", "description": "<1-2 sentences>"},
    {"title": "<strength title>", "description": "<1-2 sentences>"},
    {"title": "<strength title>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap title>", "description": "<what's wrong and why it matters>", "fix": "<specific, actionable recommendation>"},
    {"title": "<gap title>", "description": "<what's wrong and why it matters>", "fix": "<specific, actionable recommendation>"},
    {"title": "<gap title>", "description": "<what's wrong and why it matters>", "fix": "<specific, actionable recommendation>"}
  ],
  "missing_elements": ["<element 1>", "<element 2>"]
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

    const { content, docType = "pitch_deck", title } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ error: "Document content is required" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured. Ask your admin to set ANTHROPIC_API_KEY." });

    const docTypeLabels = {
      pitch_deck: "Pitch Deck",
      battle_card: "Battle Card",
      email_template: "Email Template",
      call_script: "Call Script",
      playbook: "Sales Playbook",
      case_study: "Case Study",
      proposal: "Proposal Template",
    };
    const docTypeLabel = docTypeLabels[docType] || docType;

    const prompt = DOC_ANALYSIS_PROMPT.replace("{DOC_TYPE}", docTypeLabel);
    const userMessage = `${title ? `Document Title: ${title}\n\n` : ""}DOCUMENT CONTENT:\n${content}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt + "\n\n---\n\n" + userMessage }],
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
    console.error("Analyze-doc error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

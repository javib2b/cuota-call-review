// GET  /api/gtm-profile?client=Acme   → load saved profile
// POST /api/gtm-profile { client, action:"generate" } → AI draft from transcripts
// POST /api/gtm-profile { client, action:"save", icp_description, sell_to, competitors, partners } → persist
import { authenticateUser, adminTable } from "./_lib/supabase.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: "return=representation",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { profile: userProfile } = auth;
    const orgId = userProfile.org_id;

    // ── GET: load saved profile ──────────────────────────────────────────────
    if (req.method === "GET") {
      const client = req.query?.client;
      if (!client) return res.status(400).json({ error: "Missing client parameter" });

      const rows = await adminTable("client_gtm_profiles").select(
        "*",
        `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
      );
      return res.status(200).json({ profile: rows[0] || null });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { client, action, website, stage, icp_description, sell_to, competitors, partners } = req.body || {};
    if (!client) return res.status(400).json({ error: "Missing client" });

    // ── action: save ──────────────────────────────────────────────────────────
    if (action === "save") {
      const payload = {
        org_id: orgId,
        client,
        website: website || "",
        stage: stage || "",
        icp_description: icp_description || "",
        sell_to: sell_to || "",
        competitors: competitors || [],
        partners: partners || [],
        updated_at: new Date().toISOString(),
      };

      // Try upsert (merge-duplicates on org_id, client unique constraint)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/client_gtm_profiles?on_conflict=org_id,client`, {
        method: "POST",
        headers: { ...adminHeaders(), Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || body.error || `Upsert failed (${r.status})`);
      return res.status(200).json({ profile: Array.isArray(body) ? body[0] : body });
    }

    // ── action: generate ──────────────────────────────────────────────────────
    if (action === "generate") {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return res.status(400).json({ error: "No ANTHROPIC_API_KEY configured" });

      // Fetch up to 20 most recent call reviews for this client
      const calls = await adminTable("call_reviews").select(
        "category_scores,transcript",
        `org_id=eq.${orgId}&category_scores->>client=eq.${encodeURIComponent(client)}&order=created_at.desc&limit=20`
      );

      if (!calls || calls.length === 0) {
        return res.status(200).json({
          draft: {
            icp_description: "",
            sell_to: "",
            competitors: [],
            partners: [],
          },
        });
      }

      // Concatenate transcripts (first 3000 chars each)
      const transcriptBlock = calls
        .map((c, i) => {
          const t = c.transcript || c.category_scores?.transcript || "";
          return `--- Call ${i + 1} ---\n${t.slice(0, 3000)}`;
        })
        .join("\n\n");

      const prompt = `You are analyzing sales call transcripts for ${client}.
Based on the transcripts, extract the following as JSON:
{
  "icp_description": "2-3 sentences describing the Ideal Customer Profile — company type, size, industry, key buyer persona",
  "sell_to": "1-2 sentences on who their primary buyers are (titles, departments)",
  "competitors": ["Competitor A", "Competitor B"],
  "partners": ["Partner A", "Partner B"]
}

"competitors" = companies mentioned as alternatives, competing solutions, or things the prospect already uses that you compete against.
"partners" = tools, platforms, or vendors mentioned as integrations, complementary technology, or ecosystem partners.

Return ONLY valid JSON with no markdown or explanation.

TRANSCRIPTS:
${transcriptBlock}`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const e = await claudeRes.json().catch(() => ({}));
        return res.status(502).json({ error: e.error?.message || "Claude API error" });
      }

      const data = await claudeRes.json();
      const text = data.content.map(c => c.text || "").join("");
      let draft;
      try {
        draft = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        return res.status(502).json({ error: "Claude returned invalid JSON" });
      }

      // Persist ai_generated_at timestamp alongside any existing profile
      const existing = await adminTable("client_gtm_profiles").select(
        "id",
        `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
      ).catch(() => []);

      const now = new Date().toISOString();
      if (existing && existing.length > 0) {
        await adminTable("client_gtm_profiles").update(
          { ai_generated_at: now },
          `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`
        ).catch(() => {});
      }

      return res.status(200).json({ draft: { ...draft, ai_generated_at: now } });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error("GTM profile error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

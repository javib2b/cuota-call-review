// Fireflies settings CRUD — admin only, per-client
import { authenticateUser, adminTable } from "../_lib/supabase.js";
import { createFirefliesClient } from "../_lib/fireflies.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (auth.profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const orgId = auth.profile.org_id;
    const table = adminTable("fireflies_settings");
    const client = req.query?.client || null;

    // GET — fetch settings (API key masked)
    if (req.method === "GET") {
      if (!client) {
        const rows = await table.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(rows)) return res.status(200).json({ configs: [] });
        const configs = rows.map((s) => ({
          client: s.client,
          configured: true,
          api_key_masked: s.fireflies_api_key ? "****" + s.fireflies_api_key.slice(-8) : "",
          created_at: s.created_at,
        }));
        return res.status(200).json({ configs });
      }

      const rows = await table.select("*", `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(200).json({ configured: false });
      }
      const s = rows[0];
      return res.status(200).json({
        configured: true,
        client: s.client,
        api_key_masked: s.fireflies_api_key ? "****" + s.fireflies_api_key.slice(-8) : "",
        created_at: s.created_at,
      });
    }

    // POST — save/update settings, verify API key
    if (req.method === "POST") {
      const { apiKey, client: bodyClient } = req.body || {};
      const targetClient = bodyClient || "Other";

      if (!apiKey) {
        return res.status(400).json({ error: "apiKey is required" });
      }

      // Verify the API key works by listing transcripts
      let keyVerified = false;
      let verifyError = null;
      try {
        const ff = createFirefliesClient(apiKey);
        await ff.listAllTranscripts(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), 1);
        keyVerified = true;
      } catch (e) {
        verifyError = e.message;
        console.warn("Fireflies API key verification failed:", e.message);
      }

      const data = {
        org_id: orgId,
        client: targetClient,
        fireflies_api_key: apiKey,
      };

      const existing = await table.select("id", `org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      if (Array.isArray(existing) && existing.length > 0) {
        await table.update(data, `org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      } else {
        await table.insert(data);
      }

      return res.status(200).json({ ok: true, keyVerified, ...(verifyError ? { verifyError } : {}) });
    }

    // DELETE — remove settings for a specific client
    if (req.method === "DELETE") {
      if (!client) return res.status(400).json({ error: "client query param required" });
      await table.delete(`org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Fireflies settings error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

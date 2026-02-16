// Gong settings CRUD — admin only, per-client
import { authenticateUser, adminTable } from "../lib/supabase.js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Auth
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    if (auth.profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const orgId = auth.profile.org_id;
    const table = adminTable("gong_settings");
    const client = req.query?.client || null;

    // GET — fetch settings
    if (req.method === "GET") {
      // If no client specified, return ALL configs for this org
      if (!client) {
        const rows = await table.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(rows)) return res.status(200).json({ configs: [] });
        const configs = rows.map((s) => ({
          client: s.client || "Other",
          configured: true,
          gong_base_url: s.gong_base_url,
          auto_review: s.auto_review,
          gong_access_key_masked: s.gong_access_key ? "****" + s.gong_access_key.slice(-4) : "",
          gong_access_key_secret_masked: s.gong_access_key_secret ? "****" + s.gong_access_key_secret.slice(-4) : "",
          updated_at: s.updated_at,
        }));
        return res.status(200).json({ configs });
      }

      // With client specified, return that client's config
      const rows = await table.select("*", `org_id=eq.${orgId}&client=eq.${encodeURIComponent(client)}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(200).json({ configured: false });
      }
      const settings = rows[0];
      return res.status(200).json({
        configured: true,
        client: settings.client,
        id: settings.id,
        gong_base_url: settings.gong_base_url,
        auto_review: settings.auto_review,
        gong_access_key_masked: settings.gong_access_key ? "****" + settings.gong_access_key.slice(-4) : "",
        gong_access_key_secret_masked: settings.gong_access_key_secret ? "****" + settings.gong_access_key_secret.slice(-4) : "",
        updated_at: settings.updated_at,
      });
    }

    // POST — save/update settings (client required in body)
    if (req.method === "POST") {
      const { accessKey, accessKeySecret, baseUrl, autoReview, client: bodyClient } = req.body || {};
      const targetClient = bodyClient || "Other";
      if (!accessKey || !accessKeySecret) {
        return res.status(400).json({ error: "Access key and secret are required" });
      }

      const data = {
        org_id: orgId,
        client: targetClient,
        gong_access_key: accessKey,
        gong_access_key_secret: accessKeySecret,
        gong_base_url: baseUrl || "https://us-11211.api.gong.io",
        auto_review: autoReview !== false,
        updated_at: new Date().toISOString(),
      };

      // Check if settings exist for this org+client
      const existing = await table.select("id", `org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      if (Array.isArray(existing) && existing.length > 0) {
        await table.update(data, `org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      } else {
        await table.insert(data);
      }
      return res.status(200).json({ ok: true });
    }

    // DELETE — remove settings for a specific client
    if (req.method === "DELETE") {
      const targetClient = client || "Other";
      await table.delete(`org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Gong settings error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

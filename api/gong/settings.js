// Gong settings CRUD — admin only
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

    // GET — fetch current settings (mask secrets)
    if (req.method === "GET") {
      const rows = await table.select("*", `org_id=eq.${orgId}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(200).json({ configured: false });
      }
      const settings = rows[0];
      return res.status(200).json({
        configured: true,
        id: settings.id,
        gong_base_url: settings.gong_base_url,
        auto_review: settings.auto_review,
        // Mask secrets — only show last 4 chars
        gong_access_key_masked: settings.gong_access_key ? "****" + settings.gong_access_key.slice(-4) : "",
        gong_access_key_secret_masked: settings.gong_access_key_secret ? "****" + settings.gong_access_key_secret.slice(-4) : "",
        updated_at: settings.updated_at,
      });
    }

    // POST — save/update settings
    if (req.method === "POST") {
      const { accessKey, accessKeySecret, baseUrl, autoReview } = req.body || {};
      if (!accessKey || !accessKeySecret) {
        return res.status(400).json({ error: "Access key and secret are required" });
      }

      const data = {
        org_id: orgId,
        gong_access_key: accessKey,
        gong_access_key_secret: accessKeySecret,
        gong_base_url: baseUrl || "https://us-11211.api.gong.io",
        auto_review: autoReview !== false,
        updated_at: new Date().toISOString(),
      };

      // Check if settings exist
      const existing = await table.select("id", `org_id=eq.${orgId}`);
      if (Array.isArray(existing) && existing.length > 0) {
        await table.update(data, `org_id=eq.${orgId}`);
      } else {
        await table.insert(data);
      }
      return res.status(200).json({ ok: true });
    }

    // DELETE — remove settings
    if (req.method === "DELETE") {
      await table.delete(`org_id=eq.${orgId}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Gong settings error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// Diio settings CRUD — admin only, per-client
import { authenticateUser, adminTable } from "../lib/supabase.js";
import { refreshDiioToken } from "../lib/diio.js";

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
    const table = adminTable("diio_settings");
    const client = req.query?.client || null;

    // GET — fetch settings (credentials masked)
    if (req.method === "GET") {
      if (!client) {
        const rows = await table.select("*", `org_id=eq.${orgId}`);
        if (!Array.isArray(rows)) return res.status(200).json({ configs: [] });
        const configs = rows.map((s) => ({
          client: s.client,
          configured: true,
          subdomain: s.subdomain,
          updated_at: s.updated_at,
          client_id_masked: s.client_id ? "****" + s.client_id.slice(-4) : "",
          has_token: !!s.access_token,
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
        subdomain: s.subdomain,
        updated_at: s.updated_at,
        client_id_masked: s.client_id ? "****" + s.client_id.slice(-4) : "",
        has_token: !!s.access_token,
      });
    }

    // POST — save/update settings, attempt initial token fetch
    if (req.method === "POST") {
      const { subdomain, clientId, clientSecret, refreshToken, client: bodyClient } = req.body || {};
      const targetClient = bodyClient || "Other";

      if (!subdomain || !clientId || !clientSecret || !refreshToken) {
        return res.status(400).json({ error: "subdomain, clientId, clientSecret, and refreshToken are required" });
      }

      // Try to get an initial access token to verify credentials
      let accessToken = null;
      let storedRefreshToken = refreshToken;
      let tokenObtained = false;
      let tokenError = null;

      try {
        const tokenData = await refreshDiioToken(subdomain, clientId, clientSecret, refreshToken);
        accessToken = tokenData.access_token;
        storedRefreshToken = tokenData.refresh_token || refreshToken;
        tokenObtained = true;
      } catch (e) {
        tokenError = e.message;
        console.warn("Diio initial token fetch failed:", e.message);
      }

      const data = {
        org_id: orgId,
        client: targetClient,
        subdomain,
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: storedRefreshToken,
        access_token: accessToken,
        updated_at: new Date().toISOString(),
      };

      const existing = await table.select("id", `org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      if (Array.isArray(existing) && existing.length > 0) {
        await table.update(data, `org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      } else {
        await table.insert(data);
      }

      return res.status(200).json({ ok: true, tokenObtained, ...(tokenError ? { tokenError } : {}) });
    }

    // DELETE — remove settings for a specific client
    if (req.method === "DELETE") {
      const targetClient = client || "Other";
      await table.delete(`org_id=eq.${orgId}&client=eq.${encodeURIComponent(targetClient)}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Diio settings error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

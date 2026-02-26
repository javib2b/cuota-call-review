// Google Drive OAuth + document sync — connect via OAuth2, sync Docs/text files to enablement_docs
import { authenticateUser, adminTable } from "../_lib/supabase.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email";
const TIMEOUT_MS = 15000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .then(r => { clearTimeout(timer); return r; })
    .catch(e => { clearTimeout(timer); throw e; });
}

function getRedirectUri(req) {
  if (process.env.GDRIVE_REDIRECT_URI) return process.env.GDRIVE_REDIRECT_URI;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}/api/gdrive/sync`;
}

async function refreshToken(refreshToken) {
  const r = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${r.status}`);
  return r.json();
}

async function driveGet(url, accessToken) {
  return fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const redirectUri = getRedirectUri(req);
  const appBase = redirectUri.replace(/\/api\/gdrive\/sync$/, "");

  // ── OAuth callback (GET ?action=callback) ── no user JWT available yet
  if (req.method === "GET" && req.query.action === "callback") {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) return res.redirect(302, `${appBase}/?gdrive_error=${encodeURIComponent(oauthError)}`);
    if (!code || !state) return res.redirect(302, `${appBase}/?gdrive_error=missing_params`);

    try {
      const jwt = Buffer.from(state, "base64url").toString("utf8");
      const auth = await authenticateUser(jwt);
      if (!auth) return res.redirect(302, `${appBase}/?gdrive_error=auth_failed`);

      const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!tokenRes.ok) {
        const e = await tokenRes.text();
        console.error("GDrive token exchange failed:", e);
        return res.redirect(302, `${appBase}/?gdrive_error=token_exchange_failed`);
      }
      const tokens = await tokenRes.json();

      const emailRes = await driveGet("https://www.googleapis.com/oauth2/v2/userinfo", tokens.access_token);
      const { email = "" } = emailRes.ok ? await emailRes.json() : {};

      const orgId = auth.profile.org_id;
      const sourcesTable = adminTable("doc_sources");
      const existing = await sourcesTable.select("id,config", `org_id=eq.${orgId}&provider=eq.gdrive`);
      const exRow = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
      const config = { ...(exRow?.config || { sources: [] }), gdrive_email: email };
      const data = {
        org_id: orgId,
        provider: "gdrive",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || exRow?.refresh_token,
        token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        config,
      };
      if (exRow) {
        await sourcesTable.update(data, `org_id=eq.${orgId}&provider=eq.gdrive`);
      } else {
        await sourcesTable.insert(data);
      }
      return res.redirect(302, `${appBase}/?gdrive_connected=1`);
    } catch (e) {
      console.error("GDrive callback error:", e);
      return res.redirect(302, `${appBase}/?gdrive_error=${encodeURIComponent(e.message)}`);
    }
  }

  // ── All other requests require user JWT ──
  try {
    const authToken = req.headers.authorization?.replace("Bearer ", "");
    const auth = await authenticateUser(authToken);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const orgId = auth.profile.org_id;

    const sourcesTable = adminTable("doc_sources");
    const docsTable = adminTable("enablement_docs");

    const getRow = async () => {
      const rows = await sourcesTable.select("*", `org_id=eq.${orgId}&provider=eq.gdrive`);
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    };

    const getValidAccessToken = async (row) => {
      if (!row?.access_token) throw new Error("Google Drive not connected");
      const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
      if (expiresAt && expiresAt.getTime() - Date.now() < 120000) {
        if (!row.refresh_token) throw new Error("No refresh token — please reconnect Google Drive");
        const refreshed = await refreshToken(row.refresh_token);
        const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
        await sourcesTable.update(
          { access_token: refreshed.access_token, token_expires_at: newExpiry },
          `org_id=eq.${orgId}&provider=eq.gdrive`
        );
        return refreshed.access_token;
      }
      return row.access_token;
    };

    // GET ?action=auth_url — generate OAuth URL
    if (req.method === "GET" && req.query.action === "auth_url") {
      if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured in Vercel env vars" });
      const state = Buffer.from(authToken).toString("base64url");
      const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: DRIVE_SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();
      return res.status(200).json({ url });
    }

    // GET (default) — connection status
    if (req.method === "GET") {
      const row = await getRow();
      if (!row) return res.status(200).json({ connected: false });
      return res.status(200).json({
        connected: true,
        email: row.config?.gdrive_email || "",
        last_synced_at: row.last_synced_at,
        synced_count: row.synced_count || 0,
        sources: row.config?.sources || [],
      });
    }

    const body = req.body || {};
    const { action } = body;

    // POST action=update_sources
    if (req.method === "POST" && action === "update_sources") {
      const { sources } = body;
      const row = await getRow();
      if (!row) return res.status(400).json({ error: "Not connected" });
      const config = { ...(row.config || {}), sources: sources || [] };
      await sourcesTable.update({ config }, `org_id=eq.${orgId}&provider=eq.gdrive`);
      return res.status(200).json({ ok: true });
    }

    // POST action=sync — fetch Drive files and save as enablement_docs
    if (req.method === "POST" && action === "sync") {
      const row = await getRow();
      const accessToken = await getValidAccessToken(row);
      const sources = row.config?.sources || [];
      if (sources.length === 0) return res.status(400).json({ error: "No sources configured" });

      const results = [];
      for (const source of sources) {
        try {
          let files = [];
          if (source.type === "folder") {
            const q = encodeURIComponent(`'${source.id}' in parents and trashed=false`);
            const fields = encodeURIComponent("files(id,name,mimeType)");
            const r = await driveGet(
              `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=50`,
              accessToken
            );
            if (!r.ok) throw new Error(`Drive API ${r.status}`);
            files = (await r.json()).files || [];
          } else {
            const r = await driveGet(
              `https://www.googleapis.com/drive/v3/files/${source.id}?fields=id,name,mimeType`,
              accessToken
            );
            if (r.ok) files = [await r.json()];
          }

          for (const file of files) {
            const isGDoc = file.mimeType === "application/vnd.google-apps.document";
            const isText = ["text/plain", "text/markdown"].includes(file.mimeType);
            if (!isGDoc && !isText) continue;

            let content = "";
            if (isGDoc) {
              const r = await driveGet(
                `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text%2Fplain`,
                accessToken
              );
              if (r.ok) content = await r.text();
            } else {
              const r = await driveGet(
                `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
                accessToken
              );
              if (r.ok) content = await r.text();
            }

            if (!content.trim()) continue;
            if (content.length > 60000) content = content.slice(0, 60000) + "\n[Content truncated]";

            const sourceUrl = `https://drive.google.com/file/d/${file.id}`;
            const docData = {
              org_id: orgId,
              client: source.client || "",
              doc_type: source.docType || "playbook",
              title: file.name,
              content,
              source_url: sourceUrl,
              synced_from: "gdrive",
              overall_score: null,
              ai_analysis: null,
            };

            const existing = await docsTable.select("id", `org_id=eq.${orgId}&source_url=eq.${encodeURIComponent(sourceUrl)}`);
            if (Array.isArray(existing) && existing.length > 0) {
              const { overall_score, ai_analysis, ...updateData } = docData;
              await docsTable.update(updateData, `id=eq.${existing[0].id}`);
              results.push({ name: file.name, status: "updated" });
            } else {
              await docsTable.insert(docData);
              results.push({ name: file.name, status: "created" });
            }
          }
        } catch (e) {
          results.push({ source: source.name || source.id, error: e.message });
        }
      }

      const syncedCount = results.filter(r => !r.error).length;
      await sourcesTable.update(
        { last_synced_at: new Date().toISOString(), synced_count: syncedCount },
        `org_id=eq.${orgId}&provider=eq.gdrive`
      );
      return res.status(200).json({ ok: true, results, syncedCount });
    }

    // DELETE — disconnect
    if (req.method === "DELETE") {
      await sourcesTable.delete(`org_id=eq.${orgId}&provider=eq.gdrive`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("GDrive sync error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// Notion document sync — connect via integration token, sync pages/databases to enablement_docs
import { authenticateUser, adminTable } from "../_lib/supabase.js";

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";
const TIMEOUT_MS = 15000;

function notionFetch(path, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Notion request timed out")), TIMEOUT_MS);
  return fetch(`${NOTION_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: controller.signal,
  }).then(r => { clearTimeout(timer); return r; })
    .catch(e => { clearTimeout(timer); throw e; });
}

function richText(arr = []) {
  return arr.map(t => t.plain_text || "").join("");
}

// Recursively extract plain text from Notion block tree
async function extractContent(blockId, token, depth = 0) {
  if (depth > 4) return "";
  const r = await notionFetch(`/blocks/${blockId}/children?page_size=100`, token);
  if (!r.ok) return "";
  const { results = [] } = await r.json();
  const lines = [];
  for (const block of results) {
    const t = block.type;
    const d = block[t];
    if (!d) continue;
    let line = "";
    if (d.rich_text) line = richText(d.rich_text);
    else if (t === "child_page") line = d.title || "";
    if (line) lines.push(line);
    if (block.has_children && depth < 3) {
      const child = await extractContent(block.id, token, depth + 1);
      if (child) lines.push(child);
    }
  }
  return lines.filter(Boolean).join("\n");
}

async function getPageTitle(pageId, token) {
  const r = await notionFetch(`/pages/${pageId}`, token);
  if (!r.ok) return "Untitled";
  const page = await r.json();
  const props = page.properties || {};
  const titleProp = Object.values(props).find(p => p.type === "title");
  return titleProp ? richText(titleProp.title || []) : "Untitled";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const authToken = req.headers.authorization?.replace("Bearer ", "");
    const auth = await authenticateUser(authToken);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const orgId = auth.profile.org_id;

    const sourcesTable = adminTable("doc_sources");
    const docsTable = adminTable("enablement_docs");

    const getRow = async () => {
      const rows = await sourcesTable.select("*", `org_id=eq.${orgId}&provider=eq.notion`);
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    };

    // GET — return connection status
    if (req.method === "GET") {
      const row = await getRow();
      if (!row) return res.status(200).json({ connected: false });
      return res.status(200).json({
        connected: true,
        workspace: row.config?.workspace || null,
        last_synced_at: row.last_synced_at,
        synced_count: row.synced_count || 0,
        sources: row.config?.sources || [],
      });
    }

    const body = req.body || {};
    const { action } = body;

    // POST action=connect — validate and save integration token
    if (req.method === "POST" && action === "connect") {
      const { token } = body;
      if (!token?.trim()) return res.status(400).json({ error: "Integration token is required" });
      const r = await notionFetch("/users/me", token.trim());
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return res.status(400).json({ error: `Invalid token: ${e.message || r.status}` });
      }
      const me = await r.json();
      const workspace = me.name || "Notion Workspace";
      const existing = await getRow();
      const config = { ...(existing?.config || { sources: [] }), workspace };
      const data = { org_id: orgId, provider: "notion", access_token: token.trim(), config };
      if (existing) {
        await sourcesTable.update(data, `org_id=eq.${orgId}&provider=eq.notion`);
      } else {
        await sourcesTable.insert(data);
      }
      return res.status(200).json({ ok: true, workspace });
    }

    // POST action=update_sources — save source list
    if (req.method === "POST" && action === "update_sources") {
      const { sources } = body;
      const row = await getRow();
      if (!row) return res.status(400).json({ error: "Not connected" });
      const config = { ...(row.config || {}), sources: sources || [] };
      await sourcesTable.update({ config }, `org_id=eq.${orgId}&provider=eq.notion`);
      return res.status(200).json({ ok: true });
    }

    // POST action=sync — fetch all configured pages/databases and save as enablement_docs
    if (req.method === "POST" && action === "sync") {
      const row = await getRow();
      if (!row?.access_token) return res.status(400).json({ error: "Notion not connected" });
      const notionToken = row.access_token;
      const sources = row.config?.sources || [];
      if (sources.length === 0) return res.status(400).json({ error: "No sources configured" });

      const results = [];
      for (const source of sources) {
        try {
          let pages = [];
          if (source.type === "database") {
            let cursor;
            for (let i = 0; i < 10; i++) {
              const queryBody = cursor ? { start_cursor: cursor } : {};
              const r = await notionFetch(`/databases/${source.id}/query`, notionToken, {
                method: "POST", body: JSON.stringify(queryBody),
              });
              if (!r.ok) break;
              const d = await r.json();
              pages.push(...(d.results || []));
              if (!d.has_more || pages.length >= 50) break;
              cursor = d.next_cursor;
            }
          } else {
            const r = await notionFetch(`/pages/${source.id}`, notionToken);
            if (r.ok) pages = [await r.json()];
          }

          for (const page of pages) {
            const title = await getPageTitle(page.id, notionToken);
            const content = await extractContent(page.id, notionToken);
            if (!content && !title) continue;
            const sourceUrl = `https://notion.so/${page.id.replace(/-/g, "")}`;
            const docData = {
              org_id: orgId,
              client: source.client || "",
              doc_type: source.docType || "playbook",
              title: title || source.name || "Notion Page",
              content: content || "",
              source_url: sourceUrl,
              synced_from: "notion",
              overall_score: null,
              ai_analysis: null,
            };
            // Upsert by source_url — don't wipe existing score/analysis on resync
            const existing = await docsTable.select("id,overall_score,ai_analysis", `org_id=eq.${orgId}&source_url=eq.${encodeURIComponent(sourceUrl)}`);
            if (Array.isArray(existing) && existing.length > 0) {
              const { overall_score, ai_analysis, ...updateData } = docData;
              await docsTable.update(updateData, `id=eq.${existing[0].id}`);
              results.push({ title, status: "updated" });
            } else {
              await docsTable.insert(docData);
              results.push({ title, status: "created" });
            }
          }
        } catch (e) {
          results.push({ source: source.name || source.id, error: e.message });
        }
      }

      const syncedCount = results.filter(r => !r.error).length;
      await sourcesTable.update(
        { last_synced_at: new Date().toISOString(), synced_count: syncedCount },
        `org_id=eq.${orgId}&provider=eq.notion`
      );
      return res.status(200).json({ ok: true, results, syncedCount });
    }

    // DELETE — disconnect
    if (req.method === "DELETE") {
      await sourcesTable.delete(`org_id=eq.${orgId}&provider=eq.notion`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Notion sync error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// GET /api/proxy-logo?domain=example.com
// Server-side proxy for Clearbit logos — bypasses browser CORS restrictions
// Returns { dataUri: "data:image/png;base64,..." }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: "Missing domain" });

  const normalized = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim()
    .toLowerCase();

  if (!normalized || normalized.length > 100 || !/^[a-z0-9.-]+$/.test(normalized)) {
    return res.status(400).json({ error: "Invalid domain" });
  }

  try {
    const resp = await fetch(`https://logo.clearbit.com/${normalized}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CuotaApp/1.0)" },
    });

    if (!resp.ok) return res.status(404).json({ error: "Logo not found" });

    const contentType = resp.headers.get("content-type") || "image/png";
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUri = `data:${contentType};base64,${base64}`;

    // Cache for 24 hours
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).json({ dataUri });
  } catch (err) {
    console.error("proxy-logo error:", err);
    return res.status(500).json({ error: err.message || "Fetch failed" });
  }
}

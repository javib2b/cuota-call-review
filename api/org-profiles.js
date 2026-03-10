// GET /api/org-profiles → returns Gravatar photo_url for all org members
import { createHash } from "crypto";
import { authenticateUser, adminTable } from "./_lib/supabase.js";

function gravatarUrl(email) {
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=200`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const orgId = auth.profile.org_id;

    const rows = await adminTable("profiles").select(
      "full_name,email",
      `org_id=eq.${orgId}`
    );

    const profiles = (rows || []).map(p => ({
      full_name: p.full_name,
      photo_url: p.email ? gravatarUrl(p.email) : null,
    }));

    return res.status(200).json({ profiles });
  } catch (err) {
    console.error("org-profiles error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

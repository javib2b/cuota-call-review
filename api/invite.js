// api/invite.js — Create invitation + send email via Resend
import { authenticateUser, adminTable } from "./_lib/supabase.js";

const APP_URL = "https://cuota-call-review.vercel.app";
const FROM_EMAIL = "Cuota <onboarding@cuota.io>";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const auth = await authenticateUser(token);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { profile } = auth;
  if (profile.role !== "admin" && profile.role !== "manager") {
    return res.status(403).json({ error: "Only admins and managers can invite team members" });
  }

  const { email, role, client_company } = req.body || {};
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });
  if (!role) return res.status(400).json({ error: "Role required" });
  if (role === "client" && !client_company?.trim()) return res.status(400).json({ error: "Client company name required" });

  // 1. Create invitation record in Supabase
  const invTable = adminTable("invitations");
  const payload = { org_id: profile.org_id, email: email.toLowerCase().trim(), role, invited_by: profile.id, accepted: false };
  if (role === "client") payload.client_company = client_company.trim();

  let invitation;
  try {
    const rows = await invTable.insert(payload);
    invitation = Array.isArray(rows) ? rows[0] : rows;
  } catch (e) {
    return res.status(500).json({ error: "Failed to create invitation: " + e.message });
  }

  // 2. Send email via Resend
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    // Invitation created but email not sent — degrade gracefully
    return res.status(200).json({ ok: true, emailSent: false, warning: "RESEND_API_KEY not configured — invitation saved but no email sent" });
  }

  const inviterName = profile.full_name || "Your team";
  const roleLabel = role === "rep" ? "Sales Rep" : role === "manager" ? "Manager" : role === "client" ? "Client" : role;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#04090f;font-family:system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:rgba(6,32,53,0.95);border:1px solid rgba(255,255,255,0.10);border-radius:16px;overflow:hidden;">

    <!-- Header -->
    <div style="padding:32px 36px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:13px;font-weight:700;color:#31CE81;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Cuota</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#f0f0f0;line-height:1.3;">You've been invited to join the team</h1>
    </div>

    <!-- Body -->
    <div style="padding:28px 36px;">
      <p style="margin:0 0 20px;font-size:15px;color:#9ca3af;line-height:1.6;">
        <strong style="color:#f0f0f0;">${inviterName}</strong> has invited you to Cuota as a
        <span style="display:inline-block;background:rgba(49,206,129,0.15);color:#31CE81;font-weight:600;padding:2px 10px;border-radius:20px;font-size:13px;margin-left:4px;">${roleLabel}</span>
      </p>

      <p style="margin:0 0 28px;font-size:14px;color:#9ca3af;line-height:1.6;">
        Click the button below to sign up. Make sure to use this exact email address:
        <strong style="display:block;margin-top:6px;color:#f0f0f0;font-size:15px;">${email}</strong>
      </p>

      <a href="${APP_URL}" style="display:inline-block;padding:13px 28px;background:#31CE81;color:#fff;font-weight:700;font-size:15px;border-radius:10px;text-decoration:none;letter-spacing:-0.2px;">
        Accept Invitation →
      </a>

      <p style="margin:28px 0 0;font-size:12px;color:#7a8ba0;line-height:1.6;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 36px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0;font-size:11px;color:#7a8ba0;">Cuota · Call Review Engine</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email.toLowerCase().trim()],
        subject: `${inviterName} invited you to Cuota`,
        html,
      }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.message || JSON.stringify(body));
    return res.status(200).json({ ok: true, emailSent: true });
  } catch (e) {
    // Email failed but invitation was already saved — don't blow up
    console.error("Resend error:", e.message);
    return res.status(200).json({ ok: true, emailSent: false, warning: "Invitation saved but email failed: " + e.message });
  }
}

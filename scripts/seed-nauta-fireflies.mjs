#!/usr/bin/env node
// One-time script: insert Nauta Fireflies configuration into fireflies_settings.
//
// USAGE:
//   SUPABASE_SERVICE_KEY=xxx node scripts/seed-nauta-fireflies.mjs
//
// The org_id is fetched automatically from the profiles table using
// the ADMIN_EMAIL env var (or defaults to looking for org_id in the first profile).

const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ORG_ID       = process.env.ORG_ID; // override if known

if (!SERVICE_KEY) { console.error("✗ Missing SUPABASE_SERVICE_KEY"); process.exit(1); }

const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function dbGet(table, filters = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${filters ? "&" + filters : ""}`;
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || body.error || `GET ${table} failed (${r.status})`);
  return body;
}

async function dbUpsert(table, data, onConflict) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: `return=representation,resolution=merge-duplicates`, "On-Conflict": onConflict || "" },
    body: JSON.stringify(data),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || body.error || `UPSERT ${table} failed (${r.status})`);
  return body;
}

async function main() {
  // Resolve org_id
  let orgId = ORG_ID;
  if (!orgId) {
    const profiles = await dbGet("profiles", "limit=1");
    if (!profiles.length) { console.error("✗ No profiles found — cannot determine org_id. Set ORG_ID env var."); process.exit(1); }
    orgId = profiles[0].org_id;
    console.log(`  Using org_id: ${orgId} (from first profile)`);
  }

  const NAUTA_API_KEY = "ac3c86b8-fcf6-4044-a47d-e2a27fb648fd";
  const CLIENT = "Nauta";

  // Check if already exists
  const existing = await dbGet("fireflies_settings", `org_id=eq.${orgId}&client=eq.${encodeURIComponent(CLIENT)}`);
  if (existing.length > 0) {
    console.log(`  Nauta Fireflies config already exists — updating API key.`);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fireflies_settings?org_id=eq.${orgId}&client=eq.${encodeURIComponent(CLIENT)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ fireflies_api_key: NAUTA_API_KEY }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.message || body.error || `PATCH failed (${r.status})`);
    console.log(`✓ Updated Nauta Fireflies API key.`);
    return;
  }

  await dbGet("fireflies_settings", "limit=0").catch(async () => {
    // Table might not exist — print setup SQL
    console.warn(`
⚠  fireflies_settings table not found. Run this SQL in Supabase first:

  CREATE TABLE IF NOT EXISTS fireflies_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    client text NOT NULL,
    fireflies_api_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS fireflies_processed_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    fireflies_transcript_id text NOT NULL,
    status text NOT NULL DEFAULT 'processing',
    call_review_id uuid,
    error_message text,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(org_id, fireflies_transcript_id)
  );
    `);
    process.exit(1);
  });

  const r = await fetch(`${SUPABASE_URL}/rest/v1/fireflies_settings`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ org_id: orgId, client: CLIENT, fireflies_api_key: NAUTA_API_KEY }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || body.error || `INSERT failed (${r.status})`);
  console.log(`✓ Inserted Nauta Fireflies config (org: ${orgId})`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });

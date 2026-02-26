// Server-side Supabase admin client (bypasses RLS via service role key)

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FETCH_TIMEOUT_MS = 10000; // 10s per Supabase REST call

function adminHeaders() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function userHeaders(token) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token}`,
  };
}

// Validate a user's JWT and return their profile
export async function authenticateUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok) return null;
  const user = await r.json();
  if (!user?.id) return null;

  // Fetch profile to get org_id and role
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&id=eq.${user.id}`, {
    headers: adminHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!pr.ok) return null;
  const profiles = await pr.json();
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  return { user, profile: profiles[0] };
}

// Admin table client (bypasses RLS)
export function adminTable(table) {
  return {
    async select(query = "*", filters = "") {
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=${query}${filters ? "&" + filters : ""}`;
      const r = await fetch(url, { headers: adminHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || body.error || `Select from ${table} failed (${r.status})`);
      return body;
    },
    async insert(data) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...adminHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || body.error || `Insert into ${table} failed (${r.status})`);
      return body;
    },
    async update(data, filters) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
        method: "PATCH",
        headers: { ...adminHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || body.error || `Update ${table} failed (${r.status})`);
      return body;
    },
    async upsert(data, onConflict) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...adminHeaders(), Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || body.error || `Upsert ${table} failed (${r.status})`);
      return body;
    },
    async delete(filters) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
        method: "DELETE",
        headers: adminHeaders(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return r.ok;
    },
  };
}

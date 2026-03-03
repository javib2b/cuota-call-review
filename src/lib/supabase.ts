const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmbG1ycXRwZHJobnl2b2txdXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTU0OTUsImV4cCI6MjA4NjQzMTQ5NX0.66eeDUOONigyN3YG2JfqvCjrLe9m5a4ipBhp8TXZOms";

function headers(token?: string) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
}

export type AuthResult = {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  error?: string;
  error_description?: string;
};

export const supabase = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,

  async auth(
    action: "signup" | "token" | "logout",
    body: Record<string, unknown>
  ): Promise<AuthResult> {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok)
      return {
        error: data.error || data.msg || "Auth failed",
        error_description: data.error_description || data.message || `HTTP ${r.status}`,
      };
    return data;
  },

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    return this.auth("token", { grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async updateUser(token: string, metadata: Record<string, unknown>) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: metadata }),
    });
    if (!r.ok) return null;
    return r.json();
  },

  table(tableName: string, token?: string) {
    const h = (extra: Record<string, string> = {}) => ({ ...headers(token), ...extra });

    return {
      async select<T>(query = "*"): Promise<T[]> {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=${query}`, {
          headers: h(),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Select failed (${r.status})`);
        return body as T[];
      },

      async selectWhere<T>(query = "*", filters = ""): Promise<T[]> {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/${tableName}?select=${query}&${filters}`,
          { headers: h() }
        );
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Query failed (${r.status})`);
        return body as T[];
      },

      async insert<T>(data: unknown): Promise<T[]> {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
          method: "POST",
          headers: h({ Prefer: "return=representation" }),
          body: JSON.stringify(data),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Insert failed (${r.status})`);
        return body as T[];
      },

      async update<T>(data: unknown, filters: string): Promise<T[]> {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?${filters}`, {
          method: "PATCH",
          headers: h({ Prefer: "return=representation" }),
          body: JSON.stringify(data),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Update failed (${r.status})`);
        return body as T[];
      },

      async delete(filters: string): Promise<boolean> {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?${filters}`, {
          method: "DELETE",
          headers: h(),
        });
        return r.ok;
      },

      async upsert<T>(data: unknown, onConflict?: string): Promise<T[]> {
        const prefer = onConflict
          ? `return=representation,resolution=merge-duplicates`
          : "return=representation";
        const url = onConflict
          ? `${SUPABASE_URL}/rest/v1/${tableName}?on_conflict=${onConflict}`
          : `${SUPABASE_URL}/rest/v1/${tableName}`;
        const r = await fetch(url, {
          method: "POST",
          headers: h({ Prefer: prefer }),
          body: JSON.stringify(data),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Upsert failed (${r.status})`);
        return body as T[];
      },
    };
  },
};

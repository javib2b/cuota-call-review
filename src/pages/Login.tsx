import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

interface Props {
  onLogin: (session: { access_token: string; refresh_token: string; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } }, profile: Profile) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const body =
        mode === "login"
          ? { email, password, grant_type: "password" }
          : { email, password };
      const data = await supabase.auth(mode === "login" ? "token" : "signup", body);
      if (data.error) throw new Error(data.error_description || data.error);
      if (!data.access_token || !data.user) throw new Error("Login failed");

      // Try to load profile
      let profile: Profile = {
        id: data.user.id,
        org_id: "00000000-0000-0000-0000-000000000001",
        role: "manager",
      };
      try {
        const rows = await supabase
          .table("profiles", data.access_token)
          .selectWhere<Profile>("*", `id=eq.${data.user.id}`);
        if (rows.length > 0) profile = rows[0];
      } catch { /* use default */ }

      onLogin(data as { access_token: string; refresh_token: string; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } }, profile);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-black tracking-tight text-slate-800 mb-1">
            CUOTA<span className="text-brand-500">/</span>
          </div>
          <div className="text-sm text-slate-500">GTM Engine for Revenue Consultants</div>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-card shadow-card p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
            >
              {loading ? "Loading…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>Don't have an account?{" "}
                <button onClick={() => setMode("signup")} className="text-brand-500 hover:text-brand-600 font-semibold">
                  Sign up
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => setMode("login")} className="text-brand-500 hover:text-brand-600 font-semibold">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmbG1ycXRwZHJobnl2b2txdXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTU0OTUsImV4cCI6MjA4NjQzMTQ5NX0.66eeDUOONigyN3YG2JfqvCjrLe9m5a4ipBhp8TXZOms";

// Lightweight Supabase client
const supabase = {
  headers: (token) => ({
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  }),
  async auth(action, body) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${action}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) return { error: data.error || data.msg || data.message || "Auth failed", error_description: data.error_description || data.msg || data.message || `HTTP ${r.status}` };
    return data;
  },
  async updateUser(token, metadata) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: "PUT", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: metadata }) });
    if (!r.ok) return null;
    return r.json();
  },
  async from(table, token) {
    return {
      async select(query = "*") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}`, { headers: supabase.headers(token) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Select from ${table} failed (${r.status})`);
        return body;
      },
      async selectWhere(query = "*", filters = "") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}&${filters}`, { headers: supabase.headers(token) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Query ${table} failed (${r.status})`);
        return body;
      },
      async insert(data) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: { ...supabase.headers(token), Prefer: "return=representation" }, body: JSON.stringify(data) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Insert into ${table} failed (${r.status})`);
        return body;
      },
      async update(data, filters) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, { method: "PATCH", headers: { ...supabase.headers(token), Prefer: "return=representation" }, body: JSON.stringify(data) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || body.error || `Update ${table} failed (${r.status})`);
        return body;
      },
      async delete(filters) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, { method: "DELETE", headers: supabase.headers(token) });
        return r.ok;
      },
    };
  },
};

const CATEGORIES = [
  { id: "pre_call_research", name: "Pre-Call Research" },
  { id: "intro_opening", name: "Intro/Opening" },
  { id: "agenda", name: "Agenda" },
  { id: "discovery", name: "Discovery" },
  { id: "pitch", name: "Pitch" },
  { id: "services_product", name: "Services/Product Overview" },
  { id: "pricing", name: "Pricing" },
  { id: "next_steps", name: "Next Steps/Closing" },
  { id: "objection_handling", name: "Objection Handling" },
];

// Old category IDs for backward compatibility detection
const OLD_CATEGORY_IDS = ["opening", "qualification", "storytelling", "objection", "demo", "multithreading", "nextsteps", "control"];

const RISK_INDICATORS = [
  { id: "meddpicc_gaps", label: "MEDDPICC Gaps", severity: "high" },
  { id: "single_threaded", label: "Single-Threaded Deal", severity: "high" },
  { id: "no_decision_maker", label: "No Access to Decision Maker", severity: "high" },
  { id: "engagement_gap", label: "Time Since Last Call", severity: "medium" },
  { id: "no_next_steps", label: "No Clear Next Steps", severity: "high" },
];

const DEFAULT_CLIENTS = ["11x", "Arc", "Factor", "Nauta", "Planimatik", "Rapido", "Xepelin"];
const CLIENT_DOMAINS = { "11x": "11x.ai", "Arc": "experiencearc.com", "Factor": "factor.ai", "Nauta": "getnauta.com", "Planimatik": "planimatik.com", "Rapido": "rapidosaas.com", "Xepelin": "xepelin.com" };
function getClientLogo(client) { const domain = CLIENT_DOMAINS[client]; return domain ? `https://logo.clearbit.com/${domain}` : null; }

function loadClients() {
  try {
    const stored = localStorage.getItem("cuota_clients");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.sort((a, b) => a.localeCompare(b));
    }
  } catch {}
  return [...DEFAULT_CLIENTS];
}

function saveClients(clients) {
  localStorage.setItem("cuota_clients", JSON.stringify(clients));
}

function isNewFormat(call) {
  const cs = call.category_scores;
  if (!cs) return false;
  return CATEGORIES.some(cat => cs[cat.id]?.score !== undefined);
}

function computeCategoryAverages(calls) {
  const avgs = {};
  CATEGORIES.forEach(cat => {
    let total = 0, count = 0;
    calls.forEach(c => {
      if (!isNewFormat(c)) return;
      const cs = c.category_scores?.[cat.id];
      if (cs && typeof cs.score === "number") {
        total += cs.score;
        count++;
      }
    });
    avgs[cat.id] = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
  });
  return avgs;
}

function computeWeakAndStrongPoints(calls) {
  const avgs = computeCategoryAverages(calls);
  const sorted = CATEGORIES.map(cat => ({ id: cat.id, name: cat.name, avg: avgs[cat.id] })).sort((a, b) => a.avg - b.avg);
  return { weak: sorted.slice(0, 3), strong: sorted.slice(-3).reverse() };
}


function groupCallsByClientAndAE(calls, clientList) {
  const groups = {};
  clientList.forEach(c => { groups[c] = {}; });
  calls.forEach(call => {
    const client = call.category_scores?.client;
    let bucket;
    if (client && clientList.includes(client)) {
      bucket = client;
    } else {
      const company = (call.prospect_company || "").toLowerCase();
      const matched = clientList.find(c => company.includes(c.toLowerCase()));
      bucket = matched || null;
    }
    if (!bucket) return; // skip calls that don't match any client
    const ae = call.rep_name || call.category_scores?.rep_name || "Unknown";
    if (!groups[bucket]) groups[bucket] = {};
    if (!groups[bucket][ae]) groups[bucket][ae] = [];
    groups[bucket][ae].push(call);
  });
  return groups;
}

function getScoreColor(s) { return s >= 80 ? "#31CE81" : s >= 60 ? "#eab308" : s >= 40 ? "#f97316" : "#ef4444"; }
function getScoreLabel(s) { return s >= 85 ? "Solid" : s >= 65 ? "Average" : s >= 50 ? "Needs Work" : "Critical"; }
function getScoreColor10(s) { return s >= 8 ? "#31CE81" : s >= 6 ? "#eab308" : s >= 4 ? "#f97316" : "#ef4444"; }

function CircularScore({ score, size = 120, strokeWidth = 8, label }) {
  const r = (size - strokeWidth) / 2, c = 2 * Math.PI * r, o = c - (score / 100) * c, color = getScoreColor(score);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.3, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>{score}</span>
        {label && <span style={{ fontSize: 10, color: "rgba(0,0,0,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>}
      </div>
    </div>
  );
}

// ==================== AUTH SCREEN ====================
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) { setError("Email and password are required."); return; }
    if (mode === "signup" && !fullName.trim()) { setError("Full name is required."); return; }
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "login") {
        const data = await supabase.auth("token?grant_type=password", { email, password });
        if (data.error || data.error_description) throw new Error(data.error_description || data.error || "Login failed");
        if (!data.access_token || !data.user?.id) throw new Error("Invalid server response. Please try again.");
        onAuth(data);
      } else {
        const data = await supabase.auth("signup", { email, password, data: { full_name: fullName } });
        if (data.error) throw new Error(data.error?.message || data.error || "Signup failed");
        const token = data.access_token || data.session?.access_token;
        const user = data.user || data.session?.user;
        if (token && user?.id) { onAuth({ ...data, access_token: token, user }); }
        else { setMessage("Check your email for a confirmation link!"); }
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F3F0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ width: 400, padding: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1A2B3C", letterSpacing: 2, fontFamily: "'DM Sans', system-ui, sans-serif" }}>CUOTA<span style={{ color: "#31CE81" }}>/</span></div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginTop: 4, letterSpacing: 1 }}>Call Review Engine</div>
        </div>
        <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 16, padding: 28 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#FFFFFF", borderRadius: 10, padding: 4 }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); setMessage(""); }} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, background: mode === m ? "rgba(0,0,0,0.06)" : "transparent", color: mode === m ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontFamily: "inherit" }}>{m === "login" ? "Log In" : "Sign Up"}</button>
            ))}
          </div>
          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Javier Ramirez" style={{ width: "100%", padding: "12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, color: "#1A2B3C", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={{ width: "100%", padding: "12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, color: "#1A2B3C", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", padding: "12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, color: "#1A2B3C", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
          {message && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, fontSize: 13, color: "#1a7a42" }}>{message}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px", border: "none", borderRadius: 10, cursor: "pointer", background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}>{loading ? "..." : mode === "login" ? "Log In" : "Create Account"}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== CATEGORY BAR ====================
function CategoryBar({ category, scores, onScoreChange }) {
  const cs = scores[category.id] || {};
  const score = cs.score || 0;
  const details = cs.details || "";
  const pct = Math.round((score / 10) * 100);
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C" }}>{category.name}</span>
            <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: getScoreColor10(score) + "22", color: getScoreColor10(score), fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{score}/10</span>
          </div>
          <div style={{ height: 4, background: "rgba(0,0,0,0.08)", borderRadius: 4 }}><div style={{ height: "100%", width: pct + "%", background: getScoreColor10(score), borderRadius: 4, transition: "width 0.5s" }} /></div>
        </div>
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>{"\u25BC"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "4px 18px 14px", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 12px" }}>
            <label style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 600 }}>Score:</label>
            <input type="number" min={0} max={10} value={score} onChange={e => onScoreChange(category.id, Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))} style={{ width: 56, padding: "6px 8px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontSize: 14, fontWeight: 700, textAlign: "center", fontFamily: "'Space Mono', monospace", outline: "none" }} />
            <span style={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }}>/10</span>
          </div>
          {details && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.6)", margin: "0 0 4px", lineHeight: 1.6 }}>{details}</p>}
        </div>
      )}
    </div>
  );
}

// ==================== SAVED CALLS ====================
function SavedCallsList({ calls, onSelect, onNewCall, folderClient, setFolderClient, folderAE, setFolderAE, error, onRetry, clients, onAddClient, onDeleteClient }) {
  const grouped = groupCallsByClientAndAE(calls, clients);

  const breadcrumb = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 }}>
      <span onClick={() => { setFolderClient(null); setFolderAE(null); }} style={{ color: folderClient ? "#31CE81" : "#1A2B3C", cursor: folderClient ? "pointer" : "default", fontWeight: 600 }}>Clients</span>
      {folderClient && <>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span onClick={() => setFolderAE(null)} style={{ color: folderAE ? "#31CE81" : "#1A2B3C", cursor: folderAE ? "pointer" : "default", fontWeight: 600 }}>{folderClient}</span>
      </>}
      {folderAE && <>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{folderAE}</span>
      </>}
    </div>
  );

  const newReviewBtn = (
    <button onClick={onNewCall} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Review</button>
  );

  // ---- CLIENT FOLDERS VIEW ----
  if (!folderClient) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Clients</h2>
          {newReviewBtn}
        </div>
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#ef4444" }}>{error}</span>
            {onRetry && <button onClick={onRetry} style={{ padding: "6px 14px", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Retry</button>}
          </div>
        )}
        {calls.length === 0 && !error && <p style={{ color: "rgba(0,0,0,0.45)", textAlign: "center", padding: 40 }}>No calls reviewed yet. Click "+ New Review" to get started.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {clients.map(client => {
            const aes = grouped[client] || {};
            const aeCount = Object.keys(aes).length;
            const clientCalls = Object.values(aes).flat();
            const callCount = clientCalls.length;
            const avgScore = callCount > 0 ? Math.round(clientCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / callCount) : 0;
            const isEmpty = callCount === 0;
            const logoUrl = getClientLogo(client);
            return (
              <div key={client} style={{ position: "relative", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 0, cursor: isEmpty ? "default" : "pointer", overflow: "hidden", opacity: isEmpty ? 0.5 : 1, transition: "all 0.2s", boxShadow: isEmpty ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }} onClick={() => !isEmpty && setFolderClient(client)}>
                {onDeleteClient && <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove "${client}" folder?`)) onDeleteClient(client); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.04)", border: "none", color: "rgba(0,0,0,0.3)", fontSize: 12, cursor: "pointer", padding: "2px 6px", borderRadius: 6, lineHeight: 1, zIndex: 2 }} title="Remove client">{"\u2715"}</button>}
                <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f8f9fa", border: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                    {logoUrl ? <img src={logoUrl} alt={client} style={{ width: 32, height: 32, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; const fb = e.target.parentNode.querySelector("[data-fallback]"); if (fb) fb.style.display = "flex"; }} /> : null}
                    <span data-fallback style={{ display: logoUrl ? "none" : "flex", fontSize: 20, fontWeight: 700, color: "#31CE81", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>{client.charAt(0).toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>
                    {callCount > 0 ? (
                      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>{callCount} call{callCount !== 1 ? "s" : ""} · {aeCount} rep{aeCount !== 1 ? "s" : ""}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", marginTop: 2 }}>No calls yet</div>
                    )}
                  </div>
                </div>
                {callCount > 0 && (
                  <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CircularScore score={avgScore} size={40} strokeWidth={3} />
                      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.45)" }}>avg score</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(avgScore), textTransform: "uppercase", letterSpacing: 0.5 }}>{getScoreLabel(avgScore)}</div>
                  </div>
                )}
              </div>
            );
          })}
          {onAddClient && (
            <div onClick={() => { const name = window.prompt("Enter client name:"); if (name?.trim()) onAddClient(name.trim()); }} style={{ background: "#FFFFFF", border: "2px dashed rgba(0,0,0,0.1)", borderRadius: 16, padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(49,206,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 24, color: "#31CE81", fontWeight: 300 }}>+</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.4)" }}>Add Client</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- AE FOLDERS VIEW ----
  if (folderClient && !folderAE) {
    const aes = grouped[folderClient] || {};
    const aeEntries = Object.entries(aes).map(([name, aeCalls]) => {
      const avg = aeCalls.length > 0 ? Math.round(aeCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / aeCalls.length) : 0;
      return { name, calls: aeCalls, avg };
    }).sort((a, b) => b.avg - a.avg);

    return (
      <div>
        {breadcrumb}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>{folderClient} &mdash; Account Executives</h2>
          {newReviewBtn}
        </div>
        {aeEntries.length === 0 && <p style={{ color: "rgba(0,0,0,0.45)", textAlign: "center", padding: 40 }}>No calls for this client.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {aeEntries.map(ae => (
            <div key={ae.name} onClick={() => setFolderAE(ae.name)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s" }}>
              <CircularScore score={ae.avg} size={50} strokeWidth={4} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1A2B3C" }}>{ae.name}</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>{ae.calls.length} call{ae.calls.length !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(ae.avg), textTransform: "uppercase", letterSpacing: 0.5 }}>{getScoreLabel(ae.avg)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- AE DETAIL VIEW ----
  const aeCalls = (grouped[folderClient] || {})[folderAE] || [];
  const sortedAeCalls = [...aeCalls].sort((a, b) => new Date(a.call_date) - new Date(b.call_date));
  const latestScore = sortedAeCalls.length > 0 ? (sortedAeCalls[sortedAeCalls.length - 1].overall_score || 0) : 0;
  const firstScore = sortedAeCalls.length > 0 ? (sortedAeCalls[0].overall_score || 0) : 0;
  const delta = sortedAeCalls.length > 1 ? latestScore - firstScore : 0;
  const { weak, strong } = computeWeakAndStrongPoints(aeCalls);

  // Risk patterns from last 3 calls
  const recentCalls = sortedAeCalls.slice(-3);
  const riskPatterns = RISK_INDICATORS.map(risk => {
    const flagged = recentCalls.filter(c => c.category_scores?.risk_indicators?.[risk.id]?.flagged).length;
    return { ...risk, flagged, total: recentCalls.length };
  }).filter(r => r.flagged > 0);

  // Coaching insights
  const coachingInsights = [];
  const weakBelow6 = weak.filter(w => w.avg > 0 && w.avg < 6);
  if (weakBelow6.length > 0) coachingInsights.push(`Focus on ${weakBelow6[0].name} (${weakBelow6[0].avg}/10)`);
  const criticalRisks = riskPatterns.filter(r => r.flagged === r.total && r.total >= 2);
  if (criticalRisks.length > 0) coachingInsights.push(`${criticalRisks[0].label} flagged in all recent calls`);
  const strongAbove8 = strong.filter(s => s.avg >= 8);
  if (strongAbove8.length > 0 && coachingInsights.length < 2) coachingInsights.push(`Leverage strong ${strongAbove8[0].name} skills (${strongAbove8[0].avg}/10)`);

  // Sparkline data
  const sparkPoints = sortedAeCalls.map((c, i) => ({
    x: sortedAeCalls.length === 1 ? 50 : (i / (sortedAeCalls.length - 1)) * 100,
    y: c.overall_score || 0,
    date: c.call_date,
  }));
  const svgH = 80;
  const svgPad = 8;
  const sparkSvgPoints = sparkPoints.map(p => ({
    cx: `${p.x}%`,
    cy: svgPad + ((100 - p.y) / 100) * (svgH - svgPad * 2),
    cxNum: p.x,
    score: p.y,
    date: p.date,
  }));
  const polyline = sparkSvgPoints.map(p => `${p.cxNum},${p.cy}`).join(" ");

  return (
    <div>
      {breadcrumb}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        {newReviewBtn}
      </div>

      {/* SECTION 1: Header Card */}
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 24, marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
        <CircularScore score={latestScore} size={80} strokeWidth={6} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C" }}>{folderAE}</div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", marginTop: 4 }}>
            {sortedAeCalls.length} call{sortedAeCalls.length !== 1 ? "s" : ""} reviewed
          </div>
        </div>
        {sortedAeCalls.length > 1 && (
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: delta >= 0 ? "#31CE81" : "#ef4444", fontFamily: "'Space Mono', monospace" }}>
              {delta >= 0 ? "+" : ""}{delta} pts
            </span>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", marginTop: 2 }}>{firstScore} &rarr; {latestScore}</div>
          </div>
        )}
      </div>

      {/* SECTION 2: Score Trend (only if >1 call) */}
      {sortedAeCalls.length > 1 && (
        <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.4)", fontWeight: 700, marginBottom: 12 }}>Score Trend</div>
          <svg width="100%" height={svgH} viewBox={`0 0 100 ${svgH}`} preserveAspectRatio="none" style={{ display: "block" }}>
            <polyline points={polyline} fill="none" stroke="rgba(49,206,129,0.4)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {sparkSvgPoints.map((p, i) => (
              <circle key={i} cx={p.cxNum} cy={p.cy} r="3.5" fill={getScoreColor(p.score)} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
                <title>{p.date}: {p.score}</title>
              </circle>
            ))}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "rgba(0,0,0,0.35)" }}>{sortedAeCalls[0].call_date}</span>
            <span style={{ fontSize: 10, color: "rgba(0,0,0,0.35)" }}>{sortedAeCalls[sortedAeCalls.length - 1].call_date}</span>
          </div>
        </div>
      )}

      {/* SECTION 3: Category Performance */}
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#31CE81", fontWeight: 700, marginBottom: 10 }}>Strongest</div>
            {strong.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{p.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor10(p.avg), fontFamily: "'Space Mono', monospace" }}>{p.avg}/10</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#ef4444", fontWeight: 700, marginBottom: 10 }}>Weakest</div>
            {weak.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{p.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor10(p.avg), fontFamily: "'Space Mono', monospace" }}>{p.avg}/10</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: Risk Patterns */}
      {riskPatterns.length > 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.4)", fontWeight: 700, marginBottom: 10 }}>Risk Patterns (last {recentCalls.length} calls)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {riskPatterns.map(r => {
              const isCritical = r.flagged === r.total && r.total >= 2;
              return (
                <span key={r.id} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 20, background: isCritical ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)", color: isCritical ? "#ef4444" : "#b45309", fontWeight: 600 }}>
                  {r.label}: {r.flagged}/{r.total} {isCritical && "CRITICAL"}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 5: Coaching Insights */}
      {coachingInsights.length > 0 && (
        <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: "16px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#3b82f6", fontWeight: 700, marginBottom: 8 }}>Coaching Insights</div>
          {coachingInsights.map((ins, i) => (
            <div key={i} style={{ fontSize: 13, color: "#1e40af", padding: "3px 0", display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: "#3b82f6" }}>&bull;</span> {ins}
            </div>
          ))}
        </div>
      )}

      {/* SECTION 6: Call List (chronological, oldest first) */}
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.5)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Calls ({sortedAeCalls.length})</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedAeCalls.map(call => (
          <div key={call.id} onClick={() => onSelect(call)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s" }}>
            <CircularScore score={call.overall_score || 0} size={50} strokeWidth={4} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C" }}>{call.category_scores?.prospect_name || call.prospect_company || "Unknown"}</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                {call.category_scores?.prospect_name && call.prospect_company ? `${call.prospect_company} · ` : ""}{call.call_type} | {call.call_date}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(call.overall_score || 0), textTransform: "uppercase", letterSpacing: 0.5 }}>{getScoreLabel(call.overall_score || 0)}</div>
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{call.deal_value ? "$" + Number(call.deal_value).toLocaleString() : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ==================== MAIN APP ====================

// ==================== INVITE MODAL ====================
function InviteModal({ token, profile, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("rep");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    (async () => {
      const t = await supabase.from("invitations", token);
      const data = await t.selectWhere("*", "org_id=eq." + profile.org_id);
      if (Array.isArray(data)) setInvites(data);
    })();
  }, [token, sent]);

  const sendInvite = async () => {
    if (!email.includes("@")) { setError("Enter a valid email"); return; }
    setSending(true); setError("");
    try {
      const t = await supabase.from("invitations", token);
      const result = await t.insert({ org_id: profile.org_id, email, role, invited_by: profile.id });
      if (result?.error) throw new Error(result.error.message || "Failed");
      setSent(true); setEmail(""); setTimeout(() => setSent(false), 3000);
    } catch (e) { setError(e.message); } finally { setSending(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 28, width: 440, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Invite Team Members</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.45)", fontSize: 20, cursor: "pointer" }}>\u2715</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" style={{ flex: 1, padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none" }}>
            <option value="rep" style={{ background: "#FFFFFF" }}>Rep</option>
            <option value="manager" style={{ background: "#FFFFFF" }}>Manager</option>
          </select>
        </div>
        <button onClick={sendInvite} disabled={sending} style={{ width: "100%", padding: "10px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>{sending ? "Sending..." : "Send Invite"}</button>
        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
        {sent && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#1a7a42" }}>Invite created! They can sign up and will be added to your org.</div>}
        {invites.length > 0 && (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.45)", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Pending Invites</h4>
            {invites.map(inv => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #FFFFFF" }}>
                <span style={{ fontSize: 13, color: "#1A2B3C" }}>{inv.email}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: inv.accepted ? "rgba(49,206,129,0.15)" : "rgba(234,179,8,0.15)", color: inv.accepted ? "#31CE81" : "#eab308" }}>{inv.accepted ? "Joined" : "Pending"}</span>
                  <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{inv.role}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ==================== GONG SETTINGS MODAL ====================
function GongSettingsModal({ token, getValidToken, onClose, client }) {
  const [accessKey, setAccessKey] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://us-11211.api.gong.io");
  const [autoReview, setAutoReview] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const t = await getValidToken();
        const qs = client ? `?client=${encodeURIComponent(client)}` : "";
        const r = await fetch(`/api/gong/settings${qs}`, { headers: { Authorization: `Bearer ${t}` } });
        if (r.ok) {
          const data = await r.json();
          if (data.configured) {
            setConfigured(true);
            setBaseUrl(data.gong_base_url || "https://us-11211.api.gong.io");
            setAutoReview(data.auto_review !== false);
          }
        }
      } catch (e) { console.error("Load gong settings:", e); }
      setLoading(false);
    })();
  }, [getValidToken, client]);

  const handleSave = async () => {
    if (!accessKey || !accessKeySecret) { setError("Both access key and secret are required"); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/gong/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ accessKey, accessKeySecret, baseUrl, autoReview, client: client || "Other" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      setConfigured(true); setSuccess("Settings saved!"); setAccessKey(""); setAccessKeySecret("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setError(""); setSuccess("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`/api/gong/sync${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Test failed");
      setSuccess(`Connection successful! Found ${data.calls?.length || 0} recent calls.`);
      setTimeout(() => setSuccess(""), 5000);
    } catch (e) { setError(e.message); } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove Gong integration${client ? ` for ${client}` : ""}? This won't delete already-processed calls.`)) return;
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      await fetch(`/api/gong/settings${qs}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      setConfigured(false); setAccessKey(""); setAccessKeySecret(""); setSuccess("Integration removed.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 28, width: 460, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Gong Integration{client ? ` \u2014 ${client}` : ""}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.45)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 20 }}>Loading...</p>
        ) : (
          <>
            {configured && (
              <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 13, color: "#1a7a42" }}>
                Gong is connected. Enter new credentials below to update.
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Access Key</label>
              <input value={accessKey} onChange={e => setAccessKey(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Gong access key"} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Access Key Secret</label>
              <input type="password" value={accessKeySecret} onChange={e => setAccessKeySecret(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Gong access key secret"} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Gong API Base URL</label>
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, cursor: "pointer" }}>
              <input type="checkbox" checked={autoReview} onChange={() => setAutoReview(!autoReview)} style={{ accentColor: "#31CE81", width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: "#1A2B3C" }}>Auto-review new calls via webhook</span>
            </label>

            {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
            {success && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#1a7a42" }}>{success}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : "Save Credentials"}</button>
              {configured && (
                <button onClick={handleTest} disabled={testing} style={{ padding: "10px 16px", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, background: "rgba(59,130,246,0.08)", color: "#3b82f6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{testing ? "Testing..." : "Test"}</button>
              )}
            </div>
            {configured && (
              <button onClick={handleDelete} style={{ width: "100%", marginTop: 12, padding: "8px", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, background: "rgba(239,68,68,0.06)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove Integration</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ==================== GONG SYNC MODAL ====================
function GongSyncModal({ getValidToken, onClose, onCallProcessed, client }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState("");
  const [aeFilter, setAeFilter] = useState("");

  const [debugInfo, setDebugInfo] = useState(null);

  const loadGongCalls = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`/api/gong/sync${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load calls");
      setCalls(data.calls || []);
      if (data._debug) setDebugInfo(data._debug);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [getValidToken, client]);

  useEffect(() => { loadGongCalls(); }, [loadGongCalls]);

  const processCall = async (gongCallId) => {
    if (!gongCallId) { setError("Cannot process call: missing call ID"); return; }
    setProcessing(gongCallId); setError("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`/api/gong/sync${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ callId: String(gongCallId), client: client || "Other" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Processing failed");
      // Update local state
      setCalls(prev => prev.map(c => c.gongCallId === gongCallId ? { ...c, status: "completed", overallScore: data.overallScore } : c));
      if (onCallProcessed) onCallProcessed();
    } catch (e) {
      setError(e.message);
      setCalls(prev => prev.map(c => c.gongCallId === gongCallId ? { ...c, status: "failed", errorMessage: e.message } : c));
    } finally { setProcessing(null); }
  };

  const statusBadge = (status) => {
    const styles = {
      new: { bg: "rgba(59,130,246,0.1)", color: "#3b82f6", text: "New" },
      processing: { bg: "rgba(234,179,8,0.1)", color: "#eab308", text: "Processing..." },
      completed: { bg: "rgba(49,206,129,0.1)", color: "#31CE81", text: "Reviewed" },
      failed: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", text: "Failed" },
    };
    const s = styles[status] || styles.new;
    return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>{s.text}</span>;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 28, width: 560, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Sync Gong Calls{client ? ` \u2014 ${client}` : ""}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadGongCalls} disabled={loading} style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "transparent", color: "rgba(0,0,0,0.5)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{loading ? "..." : "Refresh"}</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.45)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
          </div>
        </div>

        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}

        {debugInfo && (
          <details style={{ marginBottom: 12, fontSize: 11, color: "rgba(0,0,0,0.5)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Gong API debug</summary>
            <pre style={{ background: "rgba(0,0,0,0.03)", padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 120, fontSize: 10 }}>{JSON.stringify(debugInfo, null, 2)}</pre>
          </details>
        )}

        {loading ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 20 }}>Loading Gong calls...</p>
        ) : calls.length === 0 ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 20 }}>No calls found in the last 30 days.</p>
        ) : (() => {
          const aeNames = [...new Set(calls.map(c => c.aeName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          const filtered = aeFilter ? calls.filter(c => c.aeName === aeFilter) : calls;
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{filtered.length} call{filtered.length !== 1 ? "s" : ""}{aeFilter ? ` for ${aeFilter}` : " from last 30 days"}</div>
              {aeNames.length > 1 && (
                <select value={aeFilter} onChange={e => setAeFilter(e.target.value)} style={{ padding: "5px 10px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "#FFFFFF", color: "#1A2B3C", fontSize: 12, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="">All AEs</option>
                  {aeNames.map(ae => <option key={ae} value={ae}>{ae}</option>)}
                </select>
              )}
            </div>
            {filtered.map(call => (
              <div key={call.gongCallId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: call.status === "completed" ? "rgba(49,206,129,0.03)" : "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.title}</span>
                    {call.callType && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, fontWeight: 600, flexShrink: 0, background: call.callType === "Discovery" ? "rgba(59,130,246,0.1)" : call.callType === "Follow-up" ? "rgba(139,92,246,0.1)" : call.callType === "Demo" ? "rgba(234,179,8,0.1)" : call.callType === "Negotiation" ? "rgba(249,115,22,0.1)" : "rgba(49,206,129,0.1)", color: call.callType === "Discovery" ? "#3b82f6" : call.callType === "Follow-up" ? "#8b5cf6" : call.callType === "Demo" ? "#ca8a04" : call.callType === "Negotiation" ? "#ea580c" : "#31CE81" }}>{call.callType}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>
                    {call.started ? new Date(call.started).toLocaleDateString() : ""}
                    {call.duration ? ` \u00B7 ${Math.round(call.duration / 60)}min` : ""}
                  </div>
                  {(call.aeName || call.prospectName) && (
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginTop: 3 }}>
                      {call.aeName && <span style={{ fontWeight: 600 }}>AE: {call.aeName}</span>}
                      {call.aeName && call.prospectName && <span> &middot; </span>}
                      {call.prospectName && <span>Prospect: {call.prospectName}</span>}
                      {call.prospectCompany && <span> &middot; {call.prospectCompany}</span>}
                      {call.prospectTitle && <span style={{ color: "rgba(0,0,0,0.35)" }}> ({call.prospectTitle})</span>}
                    </div>
                  )}
                  {call.errorMessage && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{call.errorMessage}</div>}
                </div>
                {statusBadge(call.status)}
                {(call.status === "new" || call.status === "failed") && (
                  <button onClick={() => processCall(call.gongCallId)} disabled={processing === call.gongCallId} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: processing ? "wait" : "pointer", fontFamily: "inherit", opacity: processing && processing !== call.gongCallId ? 0.4 : 1, whiteSpace: "nowrap" }}>
                    {processing === call.gongCallId ? "Processing..." : call.status === "failed" ? "Retry" : "Review"}
                  </button>
                )}
              </div>
            ))}
          </div>
          ); })()}
      </div>
    </div>
  );
}

// ==================== INTEGRATIONS PAGE ====================
function IntegrationsPage({ getValidToken, token, loadCalls, clients }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [settingsClient, setSettingsClient] = useState(null);
  const [syncClient, setSyncClient] = useState(null);

  const loadConfigs = useCallback(async () => {
    try {
      const t = await getValidToken();
      const r = await fetch("/api/gong/settings", { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) {
        const data = await r.json();
        setConfigs(data.configs || []);
      }
    } catch (e) { console.error("Load integrations:", e); }
    setLoading(false);
  }, [getValidToken]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const configMap = {};
  configs.forEach(c => { configMap[c.client] = c; });

  // Detail view for a specific client
  if (selectedClient) {
    const cfg = configMap[selectedClient];
    return (
      <div>
        {settingsClient && <GongSettingsModal token={token} getValidToken={getValidToken} client={settingsClient} onClose={() => { setSettingsClient(null); loadConfigs(); }} />}
        {syncClient && <GongSyncModal getValidToken={getValidToken} client={syncClient} onClose={() => setSyncClient(null)} onCallProcessed={loadCalls} />}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 }}>
          <span onClick={() => setSelectedClient(null)} style={{ color: "#31CE81", cursor: "pointer", fontWeight: 600 }}>Integrations</span>
          <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
          <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{selectedClient}</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 20px" }}>{selectedClient} &mdash; Integrations</h2>

        <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 24 }}>{"\uD83D\uDD17"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C" }}>Gong</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                {cfg ? "Connected" : "Not connected"}
                {cfg?.updated_at ? ` \u00B7 Updated ${new Date(cfg.updated_at).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {cfg && (
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#31CE81", display: "inline-block" }} />
              )}
              {!cfg && (
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(0,0,0,0.2)", display: "inline-block" }} />
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSettingsClient(selectedClient)} style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {cfg ? "Edit Credentials" : "Connect Gong"}
            </button>
            {cfg && (
              <button onClick={() => setSyncClient(selectedClient)} style={{ padding: "10px 20px", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, background: "rgba(139,92,246,0.08)", color: "#8b5cf6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Sync Calls
              </button>
            )}
          </div>

          {cfg && (
            <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(0,0,0,0.02)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginBottom: 4 }}>Configuration</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
                Base URL: {cfg.gong_base_url} &middot; Auto-review: {cfg.auto_review ? "On" : "Off"}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid view of all clients
  return (
    <div>
      {loading ? (
        <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 40 }}>Loading integrations...</p>
      ) : (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 20px" }}>Integrations</h2>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: "-12px 0 20px" }}>Configure Gong credentials per client. Synced calls will be filed under the corresponding client folder.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {clients.map(name => {
              const cfg = configMap[name];
              return (
                <div key={name} onClick={() => setSelectedClient(name)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u2699\uFE0F"}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2B3C", marginBottom: 8 }}>{name}</div>
                  {cfg ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#31CE81", display: "inline-block" }} />
                      <span style={{ fontSize: 11, color: "#31CE81", fontWeight: 600 }}>Gong connected</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>Not configured</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== ADMIN DASHBOARD ====================
function AdminDashboard({ allCalls }) {
  const repStats = {};
  allCalls.forEach(c => {
    const name = c.category_scores?.rep_name || "Unknown";
    if (!repStats[name]) repStats[name] = { calls: 0, totalScore: 0 };
    repStats[name].calls++;
    repStats[name].totalScore += c.overall_score || 0;
  });

  const totalCalls = allCalls.length;
  const avgScore = totalCalls > 0 ? Math.round(allCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / totalCalls) : 0;

  const catAverages = computeCategoryAverages(allCalls);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 20px" }}>Admin Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Calls", value: totalCalls, color: "#1A2B3C" },
          { label: "Avg Score", value: avgScore + "%", color: getScoreColor(avgScore) },
        ].map((card, i) => (
          <div key={i} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, fontFamily: "'Space Mono', monospace" }}>{card.value}</div>
            <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Rep Leaderboard</h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, fontSize: 10, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1, padding: "0 0 8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <span>Rep</span><span style={{ textAlign: "center" }}>Calls</span><span style={{ textAlign: "center" }}>Avg Score</span>
        </div>
        {Object.entries(repStats).sort((a, b) => (b[1].totalScore / b[1].calls) - (a[1].totalScore / a[1].calls)).map(([name, stats]) => {
          const avg = Math.round(stats.totalScore / stats.calls);
          return (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "10px 0", borderBottom: "1px solid #FFFFFF", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C" }}>{name}</span>
              <span style={{ textAlign: "center", fontSize: 13, color: "rgba(0,0,0,0.5)" }}>{stats.calls}</span>
              <span style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: getScoreColor(avg) }}>{avg}%</span>
            </div>
          );
        })}
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Category Averages (All Reps)</h3>
        {CATEGORIES.map(cat => {
          const avg = catAverages[cat.id];
          const pct = Math.round((avg / 10) * 100);
          return (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #FFFFFF" }}>
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", width: 180, flexShrink: 0 }}>{cat.name}</span>
              <div style={{ flex: 1, height: 8, background: "rgba(0,0,0,0.08)", borderRadius: 4 }}>
                <div style={{ height: "100%", width: pct + "%", background: getScoreColor10(avg), borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor10(avg), fontFamily: "'Space Mono', monospace", width: 50, textAlign: "right" }}>{avg}/10</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function loadStored(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }

async function findOrCreateRep(repName, orgId, token) {
  if (!repName || !orgId || !token) return null;
  try {
    const table = await supabase.from("reps", token);
    // Step 1: Find existing rep
    const existing = await table.selectWhere("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
    if (Array.isArray(existing) && existing.length > 0 && existing[0].id) return existing[0].id;

    // Step 2: Insert new rep
    try {
      const inserted = await table.insert({ org_id: orgId, full_name: repName });
      if (Array.isArray(inserted) && inserted.length > 0 && inserted[0].id) return inserted[0].id;
    } catch (insertErr) {
      console.warn("findOrCreateRep: insert failed, retrying select:", insertErr.message);
    }

    // Step 3: Retry select (in case of race condition)
    try {
      const retry = await table.selectWhere("id", `full_name=eq.${encodeURIComponent(repName)}&org_id=eq.${orgId}`);
      if (Array.isArray(retry) && retry.length > 0 && retry[0].id) return retry[0].id;
    } catch (retryErr) {
      console.warn("findOrCreateRep: retry select failed:", retryErr.message);
    }
  } catch (err) {
    console.warn("findOrCreateRep: all steps failed, proceeding without rep_id:", err.message);
  }
  return null;
}

export default function CuotaCallReview() {
  const [session, setSession] = useState(() => loadStored("cuota_session"));
  const [profile, setProfile] = useState(() => loadStored("cuota_profile"));
  const [page, setPage] = useState("calls");
  const [savedCalls, setSavedCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [folderClient, setFolderClient] = useState(null);
  const [folderAE, setFolderAE] = useState(null);
  const [clients, setClients] = useState(loadClients);

  const addClient = useCallback((name) => {
    setClients(prev => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      saveClients(next);
      return next;
    });
  }, []);

  const deleteClient = useCallback((name) => {
    setClients(prev => {
      const next = prev.filter(c => c !== name);
      saveClients(next);
      return next;
    });
  }, []);

  // Gong integration state — string (client name) or null
  const [gongSettingsClient, setGongSettingsClient] = useState(null);
  const [gongSyncClient, setGongSyncClient] = useState(null);

  // Review state
  const [callInfo, setCallInfo] = useState({ client: "", repName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "" });
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState("transcript");
  const [transcript, setTranscript] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [callsError, setCallsError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("cuota_api_key") || "");

  const token = session?.access_token;

  // Refresh the session token, returns new access_token or null
  const refreshSessionToken = useCallback(async () => {
    const stored = loadStored("cuota_session");
    const refreshToken = stored?.refresh_token || session?.refresh_token;
    if (!refreshToken) return null;
    try {
      const data = await supabase.auth("token?grant_type=refresh_token", { refresh_token: refreshToken });
      if (!data.error && data.access_token && data.user?.id) {
        const refreshed = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user, expires_at: data.expires_at };
        setSession(refreshed);
        localStorage.setItem("cuota_session", JSON.stringify(refreshed));
        localStorage.setItem("cuota_access_token", data.access_token);
        if (data.user.user_metadata?.api_key) {
          localStorage.setItem("cuota_api_key", data.user.user_metadata.api_key);
          setApiKey(data.user.user_metadata.api_key);
        }
        return data.access_token;
      }
    } catch (e) { console.error("Token refresh failed:", e); }
    return null;
  }, [session?.refresh_token]);

  // Get a valid token — refreshes automatically if expired
  const getValidToken = useCallback(async () => {
    const stored = loadStored("cuota_session");
    const currentToken = session?.access_token || stored?.access_token;
    if (!currentToken) return null;
    const expiresAt = session?.expires_at || stored?.expires_at;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && now >= expiresAt - 60) {
      const newToken = await refreshSessionToken();
      return newToken;
    }
    return currentToken;
  }, [session, refreshSessionToken]);

  // Load saved calls
  const loadCalls = useCallback(async () => {
    const validToken = await getValidToken();
    if (!validToken) return;
    try {
      const table = await supabase.from("call_reviews", validToken);
      const data = await table.select("*");
      if (Array.isArray(data)) {
        const sorted = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const enriched = sorted.map(c => ({ ...c, rep_name: c.category_scores?.rep_name || c.prospect_company }));
        setCallsError("");
        setSavedCalls(enriched);
      }
    } catch (e) {
      console.error("Load calls error:", e);
      setCallsError("Failed to load calls: " + (e.message || "Unknown error"));
    }
  }, [getValidToken]);

  // Validate stored session on mount
  const hasValidated = useRef(false);
  useEffect(() => {
    if (hasValidated.current) return;
    hasValidated.current = true;

    const validateSession = async () => {
      const stored = loadStored("cuota_session");
      if (!stored?.access_token || !stored?.user?.id) {
        setSession(null);
        setLoading(false);
        return;
      }

      // Restore profile from localStorage
      const storedProfile = loadStored("cuota_profile");
      if (storedProfile) setProfile(storedProfile);

      const now = Math.floor(Date.now() / 1000);
      const isExpired = stored.expires_at && now >= stored.expires_at - 60;

      if (isExpired) {
        const newToken = await refreshSessionToken();
        if (!newToken) {
          // Refresh failed — force re-login
          setSession(null);
          setProfile(null);
          localStorage.removeItem("cuota_session");
          localStorage.removeItem("cuota_profile");
          localStorage.removeItem("cuota_access_token");
          setLoading(false);
          return;
        }
      }
      // setLoading(false) handled by the token useEffect after loadCalls completes
    };
    validateSession();
  }, [refreshSessionToken]);

  // Load calls whenever token changes
  useEffect(() => {
    if (token) { loadCalls().finally(() => setLoading(false)); }
    else { setLoading(false); }
  }, [token, loadCalls]);

  // Auto-refresh token every 50 minutes to prevent expiration during use
  useEffect(() => {
    if (!session?.refresh_token) return;
    const interval = setInterval(() => { refreshSessionToken(); }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session?.refresh_token, refreshSessionToken]);

  const handleAuth = async (data) => {
    const accessToken = data.access_token || data.session?.access_token;
    const refreshToken = data.refresh_token || data.session?.refresh_token;
    const user = data.user || data.session?.user;
    const expiresAt = data.expires_at || data.session?.expires_at;
    if (!accessToken || !user?.id) {
      setSession(null);
      return;
    }
    const sessionData = { access_token: accessToken, refresh_token: refreshToken, user, expires_at: expiresAt };
    setSession(sessionData);
    localStorage.setItem("cuota_session", JSON.stringify(sessionData));
    localStorage.setItem("cuota_access_token", accessToken);
    // Restore API key from user metadata
    if (user.user_metadata?.api_key) {
      localStorage.setItem("cuota_api_key", user.user_metadata.api_key);
      setApiKey(user.user_metadata.api_key);
    }
    // Get or create profile in Supabase
    try {
      const table = await supabase.from("profiles", accessToken);
      const profiles = await table.selectWhere("*", "id=eq." + user.id);
      if (Array.isArray(profiles) && profiles.length > 0) {
        setProfile(profiles[0]);
        localStorage.setItem("cuota_profile", JSON.stringify(profiles[0]));
      } else {
        // No profile exists — check for invitation to determine org
        let orgId = "00000000-0000-0000-0000-000000000001";
        let role = "admin";
        try {
          const invTable = await supabase.from("invitations", accessToken);
          const invites = await invTable.selectWhere("*", "email=eq." + encodeURIComponent(user.email) + "&accepted=eq.false");
          if (Array.isArray(invites) && invites.length > 0) {
            orgId = invites[0].org_id;
            role = invites[0].role || "rep";
            // Mark invitation as accepted
            try { await invTable.update({ accepted: true }, "id=eq." + invites[0].id); } catch (e) { console.error("Invitation accept failed:", e.message); }
          }
        } catch (e) { console.error("Invitation lookup failed:", e.message); }
        // Create the profile in Supabase
        const newProfile = { id: user.id, org_id: orgId, role, full_name: user.user_metadata?.full_name || user.email };
        try {
          const created = await table.insert(newProfile);
          const profileData = Array.isArray(created) && created[0] ? created[0] : newProfile;
          setProfile(profileData);
          localStorage.setItem("cuota_profile", JSON.stringify(profileData));
        } catch (insertErr) {
          console.error("Profile insert error:", insertErr);
          // Use local fallback if insert fails
          setProfile(newProfile);
          localStorage.setItem("cuota_profile", JSON.stringify(newProfile));
        }
      }
    } catch (e) {
      console.error("Profile error:", e);
      const fallback = { id: user.id, role: "admin", org_id: "00000000-0000-0000-0000-000000000001" };
      setProfile(fallback);
      localStorage.setItem("cuota_profile", JSON.stringify(fallback));
    }
  };

  const clearSession = () => {
    setSession(null);
    setProfile(null);
    setSavedCalls([]);
    setPage("calls");
    setFolderClient(null);
    setFolderAE(null);
    localStorage.removeItem("cuota_session");
    localStorage.removeItem("cuota_profile");
    localStorage.removeItem("cuota_access_token");
  };

  const handleLogout = () => { clearSession(); };

  // Review functions
  const handleScoreChange = (catId, newScore) => { setScores(p => ({ ...p, [catId]: { ...p[catId], score: newScore } })); };

  const totalRaw = CATEGORIES.reduce((sum, cat) => sum + (scores[cat.id]?.score || 0), 0);
  const overallScore = Math.round((totalRaw / 90) * 100);

  const analyzeTranscript = async () => {
    if (!transcript.trim()) { setError("Paste a transcript first."); return; }
    setAnalyzing(true); setError("");
    try {
      const validToken = await getValidToken();
      if (!validToken) { clearSession(); throw new Error("Session expired. Please log in again."); }
      const res = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${validToken}`}, body:JSON.stringify({transcript, apiKey: apiKey || undefined}) });
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||"Analysis failed");}
      const result=await res.json();
      const newScores = {};
      CATEGORIES.forEach(cat => { const ai = result.scores[cat.id]; if (ai) { newScores[cat.id] = { score: ai.score || 0, details: ai.details || "" }; } });
      setScores(newScores);
      // Auto-fill call info from transcript
      if (result.metadata) {
        setCallInfo(p => ({
          ...p,
          repName: result.metadata.rep_name || p.repName,
          prospectCompany: result.metadata.prospect_company || p.prospectCompany,
          callType: result.metadata.call_type || p.callType,
          dealStage: result.metadata.deal_stage || p.dealStage,
        }));
      }
      setAiAnalysis(result); setNotes(result.gut_check || ""); setActiveTab("insights");
    } catch (err) { setError("Analysis failed: " + err.message); } finally { setAnalyzing(false); }
  };

  const saveCall = async () => {
    if (!callInfo.client) { setError("Please select a client before saving."); return; }
    if (!callInfo.repName.trim()) { setError("Please enter a rep name before saving."); return; }
    setSaving(true); setError(""); setSaveSuccess(false);
    try {
      const validToken = await getValidToken();
      if (!validToken) { clearSession(); setError("Session expired. Please log in again."); setSaving(false); return; }

      const orgId = profile?.org_id || "00000000-0000-0000-0000-000000000001";
      const repId = await findOrCreateRep(callInfo.repName, orgId, validToken);

      const callData = {
        org_id: orgId,
        reviewed_by: session.user?.id,
        ...(repId ? { rep_id: repId } : {}),
        prospect_company: callInfo.prospectCompany,
        call_date: callInfo.callDate,
        call_type: callInfo.callType,
        deal_stage: callInfo.dealStage,
        deal_value: callInfo.dealValue ? Number(callInfo.dealValue) : null,
        category_scores: { ...scores, rep_name: callInfo.repName, prospect_name: aiAnalysis?.metadata?.prospect_name || "", client: callInfo.client },
        overall_score: overallScore,
        momentum_score: null,
        close_probability: null,
        risk_flags: aiAnalysis?.risks || null,
        transcript: transcript,
        ai_analysis: aiAnalysis,
        coaching_notes: notes,
      };

      const table = await supabase.from("call_reviews", validToken);
      if (selectedCall?.id) {
        await table.update(callData, `id=eq.${selectedCall.id}`);
      } else {
        await table.insert(callData);
      }
      await loadCalls();
      // Navigate to the client folder so the user sees the saved call immediately
      setPage("calls");
      setFolderClient(callInfo.client);
      setFolderAE(null);
      setSelectedCall(null);
    } catch (err) {
      setError("Save failed: " + (err.message || "Unknown error"));
    } finally { setSaving(false); }
  };

  const loadCallIntoReview = (call) => {
    setSelectedCall(call);
    setCallInfo({ client: call.category_scores?.client || "", repName: call.category_scores?.rep_name || "", prospectCompany: call.prospect_company || "", callDate: call.call_date || "", callType: call.call_type || "Discovery", dealStage: call.deal_stage || "Early", dealValue: call.deal_value || "" });
    // Detect old format (boolean criteria) vs new format ({ score, details })
    const cs = call.category_scores || {};
    const isOld = OLD_CATEGORY_IDS.some(id => cs[id] && typeof Object.values(cs[id])[0] === "boolean");
    if (isOld) {
      // Old format: don't load category scores into the new scorecard — just show overall
      setScores({});
    } else {
      setScores(cs);
    }
    setNotes(call.coaching_notes || "");
    setTranscript(call.transcript || "");
    setAiAnalysis(call.ai_analysis || null);
    setPage("review");
    setActiveTab("scorecard");
  };

  const startNewReview = () => {
    setSelectedCall(null);
    setCallInfo({ client: "", repName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "" });
    setScores({}); setNotes(""); setTranscript(""); setAiAnalysis(null); setError("");
    setPage("review"); setActiveTab("transcript");
  };

  if (loading && !session) return <div style={{ minHeight: "100vh", background: "#F5F3F0" }} />;
  if (!session) return <AuthScreen onAuth={handleAuth} />;

  const tabs = [
    { id: "transcript", label: "Transcript" },
    { id: "scorecard", label: "Scorecard" },
    { id: "insights", label: aiAnalysis ? "AI Insights \u2726" : "AI Insights" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F3F0", color: "#1A2B3C", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      {showInvite && <InviteModal token={token} profile={profile} onClose={() => setShowInvite(false)} />}
      {gongSettingsClient && <GongSettingsModal token={token} getValidToken={getValidToken} client={gongSettingsClient} onClose={() => setGongSettingsClient(null)} />}
      {gongSyncClient && <GongSyncModal getValidToken={getValidToken} client={gongSyncClient} onClose={() => setGongSyncClient(null)} onCallProcessed={loadCalls} />}

      {/* NAV */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(0,0,0,0.08)", padding: "0 24px", display: "flex", alignItems: "center", gap: 8, height: 56, overflowX: "auto" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#1A2B3C", letterSpacing: 1.5, marginRight: 16, flexShrink: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>CUOTA<span style={{ color: "#31CE81" }}>/</span></span>
        {[
          { id: "review", label: "Call Review", icon: "\u{1F4DE}" },
          { id: "calls", label: "Clients", icon: "\u{1F4C1}", badge: savedCalls.length },
          ...(profile?.role === "admin" ? [{ id: "integrations", label: "Integrations", icon: "\u2699\uFE0F" }] : []),
          ...(profile?.role === "admin" ? [{ id: "admin", label: "Admin", icon: "\u{1F451}" }] : []),
        ].map(nav => (
          <button key={nav.id} onClick={() => { setPage(nav.id); if (nav.id === "calls") { setFolderClient(null); setFolderAE(null); } }} style={{ padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: page === nav.id ? "rgba(0,0,0,0.06)" : "transparent", color: page === nav.id ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
            <span>{nav.icon}</span> {nav.label}
            {nav.badge > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "rgba(74,222,128,0.15)", color: "#31CE81" }}>{nav.badge}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(profile?.role === "manager" || profile?.role === "admin") && <button onClick={() => setShowInvite(true)} style={{ padding: "6px 12px", border: "1px solid rgba(49,206,129,0.3)", borderRadius: 8, background: "rgba(49,206,129,0.08)", color: "#31CE81", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Invite</button>}
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", flexShrink: 0 }}>{session.user?.email}</span>
        <button onClick={handleLogout} style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "transparent", color: "rgba(0,0,0,0.45)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Logout</button>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
        {/* SAVED CALLS PAGE */}
        {page === "calls" && <SavedCallsList calls={savedCalls} onSelect={loadCallIntoReview} onNewCall={startNewReview} folderClient={folderClient} setFolderClient={setFolderClient} folderAE={folderAE} setFolderAE={setFolderAE} error={callsError} onRetry={loadCalls} clients={clients} onAddClient={addClient} onDeleteClient={deleteClient} />}

        {page === "integrations" && profile?.role === "admin" && <IntegrationsPage getValidToken={getValidToken} token={token} loadCalls={loadCalls} clients={clients} />}
        {page === "admin" && profile?.role === "admin" && <AdminDashboard allCalls={savedCalls} />}

        {/* REVIEW PAGE */}
        {page === "review" && (
          <>
            {/* Call Info */}
            <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { key: "client", label: "Client", options: clients, required: true },
                  { key: "repName", label: "Rep Name", placeholder: "e.g. Sarah Chen" },
                  { key: "prospectCompany", label: "Prospect Company", placeholder: "e.g. Meijer" },
                  { key: "callDate", label: "Call Date", type: "date" },
                  { key: "callType", label: "Call Type", options: ["Discovery", "Demo", "Follow-up", "Negotiation", "Closing"] },
                  { key: "dealStage", label: "Deal Stage", options: ["Early", "Mid-Pipe", "Late Stage", "Negotiation"] },
                  { key: "dealValue", label: "Deal Value ($)", placeholder: "e.g. 50000", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{f.label}</label>
                    {f.options ? (
                      <select value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid " + (!callInfo[f.key] && f.required ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.06)"), borderRadius: 8, color: callInfo[f.key] ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                        {!callInfo[f.key] && <option value="">Select {f.label.toLowerCase()}...</option>}
                        {f.options.map(o => <option key={o} value={o} style={{ background: "#FFFFFF", color: "#1A2B3C" }}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || "text"} value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Score Dashboard */}
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <CircularScore score={overallScore} size={100} label="overall" />
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: getScoreColor(overallScore), fontFamily: "'Space Mono', monospace" }}>{totalRaw}/90</span>
                  <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", marginLeft: 6 }}>({overallScore}%)</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: getScoreColor(overallScore), textTransform: "uppercase", letterSpacing: 1 }}>{getScoreLabel(overallScore)}</span>
              </div>
              {aiAnalysis?.gut_check && (
                <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "#7c3aed", fontWeight: 700 }}>Gut Check</span>
                  <p style={{ fontSize: 14, color: "#1A2B3C", lineHeight: 1.7, margin: 0 }}>{aiAnalysis.gut_check}</p>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#FFFFFF", borderRadius: 12, padding: 4, overflowX: "auto" }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "10px 12px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: activeTab === tab.id ? "rgba(0,0,0,0.06)" : "transparent", color: activeTab === tab.id ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontFamily: "inherit" }}>{tab.label}</button>
              ))}
            </div>

            {/* Transcript */}
            {activeTab === "transcript" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Call Transcript</h3>
                  <button onClick={analyzeTranscript} disabled={analyzing || !transcript.trim()} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing ? "wait" : "pointer", background: analyzing ? "rgba(0,0,0,0.05)" : "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: !transcript.trim() ? 0.4 : 1 }}>
                    {analyzing ? "Analyzing..." : "Analyze with AI \u2726"}
                  </button>
                </div>
                {error && <div style={{ padding: "10px 14px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste your call transcript here..." style={{ width: "100%", minHeight: 350, background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: 16, fontSize: 13, color: "#1A2B3C", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                {analyzing && <div style={{ marginTop: 16, padding: 20, textAlign: "center", background: "#FFFFFF", borderRadius: 12 }}><p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)" }}>Analyzing transcript... (15-30s)</p></div>}
              </div>
            )}

            {/* Scorecard */}
            {activeTab === "scorecard" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {CATEGORIES.map(cat => <CategoryBar key={cat.id} category={cat} scores={scores} onScoreChange={handleScoreChange} />)}
              </div>
            )}

            {/* AI Insights */}
            {activeTab === "insights" && (aiAnalysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Gut Check */}
                <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Gut Check</h4>
                  <p style={{ fontSize: 14, color: "#1A2B3C", lineHeight: 1.7, margin: 0 }}>{aiAnalysis.gut_check}</p>
                </div>

                {/* Strengths */}
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#31CE81", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Strengths</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {(aiAnalysis.strengths || []).map((s, i) => (
                      <div key={i} style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7a42", marginBottom: 6 }}>{s.title}</div>
                        <p style={{ fontSize: 12, color: "#1a7a42", margin: 0, lineHeight: 1.6, opacity: 0.85 }}>{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Areas of Opportunity */}
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#eab308", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Areas of Opportunity</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(aiAnalysis.areas_of_opportunity || []).map((area, i) => (
                      <div key={i} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16 }}>
                        <p style={{ fontSize: 13, color: "#1A2B3C", margin: "0 0 10px", lineHeight: 1.6 }}>{area.description}</p>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8 }}>
                          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#3b82f6", fontWeight: 700, flexShrink: 0, paddingTop: 2 }}>Fix</span>
                          <p style={{ fontSize: 12, color: "#2563eb", margin: 0, lineHeight: 1.6 }}>{area.fix}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risk Indicators */}
                {aiAnalysis.risks && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Risk Indicators</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {RISK_INDICATORS.map(risk => {
                        const data = aiAnalysis.risks[risk.id];
                        if (!data) return null;
                        const flagged = data.flagged;
                        return (
                          <div key={risk.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: flagged ? risk.severity === "high" ? "rgba(239,68,68,0.06)" : "rgba(234,179,8,0.06)" : "rgba(49,206,129,0.04)", border: "1px solid " + (flagged ? risk.severity === "high" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)" : "rgba(49,206,129,0.15)") }}>
                            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{flagged ? risk.severity === "high" ? "\u26A0\uFE0F" : "\u26A0" : "\u2705"}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: flagged ? "#1A2B3C" : "rgba(0,0,0,0.5)", marginBottom: 2 }}>{risk.label}</div>
                              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: 0, lineHeight: 1.5 }}>{data.details}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(0,0,0,0.4)" }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>{"\u2726"}</p>
                <p style={{ fontSize: 14 }}>Paste a transcript and click Analyze with AI</p>
              </div>
            ))}

            {/* Notes */}
            {activeTab === "notes" && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", margin: "0 0 12px" }}>Coaching Notes</h3>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key observations, coaching points..." style={{ width: "100%", minHeight: 200, background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: 16, fontSize: 13, color: "#1A2B3C", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            )}

            {/* Save Button */}
            <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "flex-end" }}>
              {saveSuccess && <span style={{ padding: "12px 0", fontSize: 13, color: "#31CE81", fontWeight: 600 }}>Saved successfully!</span>}
              {error && !analyzing && <span style={{ padding: "12px 0", fontSize: 13, color: "#ef4444" }}>{error}</span>}
              <button onClick={saveCall} disabled={saving} style={{ padding: "14px 32px", border: "none", borderRadius: 12, cursor: "pointer", background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : selectedCall ? "Update Call" : "Save This Call"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

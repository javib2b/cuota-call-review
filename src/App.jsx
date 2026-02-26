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

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];
const DEFAULT_PAST_CLIENTS = ["Rapido"];
const CLIENT_DOMAINS = { "11x": "11x.ai", "Arc": "experiencearc.com", "Diio": "diio.com", "Factor": "factor.ai", "Nauta": "getnauta.com", "Planimatik": "planimatik.com", "Rapido": "rapidosaas.com", "Xepelin": "xepelin.com" };
function getClientLogo(client) { const domain = CLIENT_DOMAINS[client]; return domain ? `https://logo.clearbit.com/${domain}` : null; }

function loadPastClients() {
  try {
    const stored = localStorage.getItem("cuota_past_clients");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return Array.from(new Set([...DEFAULT_PAST_CLIENTS, ...parsed])).sort((a, b) => a.localeCompare(b));
    }
  } catch {}
  return [...DEFAULT_PAST_CLIENTS];
}

function savePastClients(list) {
  localStorage.setItem("cuota_past_clients", JSON.stringify(list));
}

function loadClients() {
  const past = loadPastClients();
  try {
    const stored = localStorage.getItem("cuota_clients");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Always merge with DEFAULT_CLIENTS so new defaults are never missed
        // Exclude any names that are now in past clients
        const merged = Array.from(new Set([...DEFAULT_CLIENTS, ...parsed])).filter(c => !past.includes(c));
        return merged.sort((a, b) => a.localeCompare(b));
      }
    }
  } catch {}
  return [...DEFAULT_CLIENTS].filter(c => !past.includes(c));
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

// ==================== FILE DROP ZONE ====================
async function extractTextFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(" ") + "\n\n";
    }
    return text.trim();
  }

  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  }

  // Plain text files (.txt, .vtt, .srt, .md, etc.)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file);
  });
}

function FileDropZone({ value, onChange, placeholder, minHeight = 220, accept = ".txt,.vtt,.srt,.md,.pdf,.docx" }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setExtractError("");
    setExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      onChange(text);
      setFileName(file.name);
    } catch (e) {
      setExtractError("Could not extract text from this file. Try copying and pasting the text instead.");
    } finally {
      setExtracting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); };
  const clear = () => { onChange(""); setFileName(""); setExtractError(""); };

  return (
    <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} style={{ position: "relative" }}>
      {dragging && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(49,206,129,0.08)", border: "2px dashed #31CE81", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, pointerEvents: "none" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#31CE81" }}>Drop to load file</div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          {extracting ? (
            <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>Extracting text...</span>
          ) : fileName ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.25)", borderRadius: 20 }}>
              <span style={{ fontSize: 12 }}>📎</span>
              <span style={{ fontSize: 11, color: "#1a7a42", fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
              <button onClick={clear} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.35)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }}>Drop a file or paste text below · PDF, DOCX, TXT, VTT supported</span>
          )}
        </div>
        <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{ padding: "5px 12px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: "#FFFFFF", color: "rgba(0,0,0,0.5)", fontSize: 11, fontWeight: 600, cursor: extracting ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          <span>📎</span> Browse file
        </button>
        <input ref={fileInputRef} type="file" accept={accept} style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
      {extractError && <div style={{ marginBottom: 8, padding: "7px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{extractError}</div>}
      <textarea
        value={value}
        onChange={e => { onChange(e.target.value); if (!e.target.value) setFileName(""); }}
        placeholder={placeholder}
        style={{ width: "100%", minHeight, background: dragging ? "rgba(49,206,129,0.02)" : "#FFFFFF", border: "1px solid " + (dragging ? "rgba(49,206,129,0.4)" : "rgba(0,0,0,0.06)"), borderRadius: 12, padding: 16, fontSize: 13, color: "#1A2B3C", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.2s" }}
      />
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
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginTop: 4, letterSpacing: 1 }}>GTM Audit Engine</div>
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
function SavedCallsList({ calls, onSelect, onNewCall, folderClient, setFolderClient, folderAE, setFolderAE, error, onRetry, clients, onAddClient, onDeleteClient, pastClients, onArchiveClient, onRestoreClient, onClientClick }) {
  const grouped = groupCallsByClientAndAE(calls, [...clients, ...(pastClients || [])]);

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
    const renderClientCard = (client, isPast) => {
      const aes = grouped[client] || {};
      const aeCount = Object.keys(aes).length;
      const clientCalls = Object.values(aes).flat();
      const callCount = clientCalls.length;
      const avgScore = callCount > 0 ? Math.round(clientCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / callCount) : 0;
      const isEmpty = callCount === 0;
      const logoUrl = getClientLogo(client);
      return (
        <div key={client} style={{ position: "relative", background: isPast ? "#fafafa" : "#FFFFFF", border: `1px solid ${isPast ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0.08)"}`, borderRadius: 16, padding: 0, cursor: isEmpty ? "default" : "pointer", overflow: "hidden", opacity: isPast ? 0.65 : (isEmpty ? 0.5 : 1), transition: "all 0.2s", boxShadow: isEmpty || isPast ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }} onClick={() => !isEmpty && (onClientClick ? onClientClick(client) : setFolderClient(client))}>
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, zIndex: 2 }}>
            {isPast ? (
              onRestoreClient && <button onClick={(e) => { e.stopPropagation(); onRestoreClient(client); }} style={{ background: "rgba(49,206,129,0.1)", border: "none", color: "#31CE81", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontFamily: "inherit" }} title="Move back to active clients">Restore</button>
            ) : (
              onArchiveClient && <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Archive "${client}"? Their call history will still be viewable.`)) onArchiveClient(client); }} style={{ background: "rgba(0,0,0,0.04)", border: "none", color: "rgba(0,0,0,0.3)", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontFamily: "inherit" }} title="Archive client">Archive</button>
            )}
          </div>
          <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f8f9fa", border: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {logoUrl ? <img src={logoUrl} alt={client} style={{ width: 32, height: 32, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; const fb = e.target.parentNode.querySelector("[data-fallback]"); if (fb) fb.style.display = "flex"; }} /> : null}
              <span data-fallback style={{ display: logoUrl ? "none" : "flex", fontSize: 20, fontWeight: 700, color: isPast ? "rgba(0,0,0,0.25)" : "#31CE81", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>{client.charAt(0).toUpperCase()}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: isPast ? "rgba(0,0,0,0.45)" : "#1A2B3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>
              {callCount > 0 ? (
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", marginTop: 2 }}>{callCount} call{callCount !== 1 ? "s" : ""} · {aeCount} rep{aeCount !== 1 ? "s" : ""}</div>
              ) : (
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.25)", marginTop: 2 }}>No calls</div>
              )}
            </div>
          </div>
          {callCount > 0 && (
            <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CircularScore score={avgScore} size={40} strokeWidth={3} />
                <div style={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }}>avg score</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(avgScore), textTransform: "uppercase", letterSpacing: 0.5 }}>{getScoreLabel(avgScore)}</div>
            </div>
          )}
        </div>
      );
    };

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
          {clients.map(client => renderClientCard(client, false))}
          {onAddClient && (
            <div onClick={() => { const name = window.prompt("Enter client name:"); if (name?.trim()) onAddClient(name.trim()); }} style={{ background: "#FFFFFF", border: "2px dashed rgba(0,0,0,0.1)", borderRadius: 16, padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(49,206,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 24, color: "#31CE81", fontWeight: 300 }}>+</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.4)" }}>Add Client</div>
            </div>
          )}
        </div>
        {pastClients && pastClients.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Past Clients</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {pastClients.map(client => renderClientCard(client, true))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- AE FOLDERS VIEW ----
  if (folderClient && !folderAE) {
    const aes = grouped[folderClient] || {};
    const allEntries = Object.entries(aes).map(([name, aeCalls]) => {
      const avg = aeCalls.length > 0 ? Math.round(aeCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / aeCalls.length) : 0;
      // Determine rep type from calls — if any call is tagged SDR, treat the rep as SDR
      const isSdr = aeCalls.some(c => c.category_scores?.rep_type === "SDR");
      return { name, calls: aeCalls, avg, isSdr };
    }).sort((a, b) => b.avg - a.avg);

    const aeEntries = allEntries.filter(e => !e.isSdr);
    const sdrEntries = allEntries.filter(e => e.isSdr);

    const repRow = (ae) => (
      <div key={ae.name} onClick={() => setFolderAE(ae.name)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s" }}>
        <CircularScore score={ae.avg} size={50} strokeWidth={4} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A2B3C" }}>{ae.name}</div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>{ae.calls.length} call{ae.calls.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(ae.avg), textTransform: "uppercase", letterSpacing: 0.5 }}>{getScoreLabel(ae.avg)}</div>
      </div>
    );

    return (
      <div>
        {breadcrumb}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>{folderClient}</h2>
          {newReviewBtn}
        </div>
        {allEntries.length === 0 && <p style={{ color: "rgba(0,0,0,0.45)", textAlign: "center", padding: 40 }}>No calls for this client.</p>}
        {aeEntries.length > 0 && (
          <div style={{ marginBottom: sdrEntries.length > 0 ? 28 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Account Executives</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aeEntries.map(repRow)}
            </div>
          </div>
        )}
        {sdrEntries.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>SDR Prospecting</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sdrEntries.map(repRow)}
            </div>
          </div>
        )}
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
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C" }}>{call.prospect_company || "Unknown Company"}</div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>{call.call_type} | {call.call_date}</div>
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

// ==================== DIIO SETTINGS MODAL ====================
function DiioSettingsModal({ getValidToken, onClose, client }) {
  const [subdomain, setSubdomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [currentSubdomain, setCurrentSubdomain] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const t = await getValidToken();
        const qs = client ? `?client=${encodeURIComponent(client)}` : "";
        const r = await fetch(`/api/diio/settings${qs}`, { headers: { Authorization: `Bearer ${t}` } });
        if (r.ok) {
          const data = await r.json();
          if (data.configured) {
            setConfigured(true);
            setCurrentSubdomain(data.subdomain || "");
          }
        }
      } catch (e) { console.error("Load diio settings:", e); }
      setLoading(false);
    })();
  }, [getValidToken, client]);

  const handleSave = async () => {
    if (!subdomain || !clientId || !clientSecret || !refreshToken) {
      setError("All four fields are required"); return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/diio/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ subdomain, clientId, clientSecret, refreshToken, client: client || "Other" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      setConfigured(true);
      setCurrentSubdomain(subdomain);
      if (data.tokenObtained) {
        setSuccess("Credentials saved and connection verified!");
      } else {
        setSuccess(`Credentials saved. Note: ${data.tokenError || "Could not verify connection — check your credentials."}`);
      }
      setSubdomain(""); setClientId(""); setClientSecret(""); setRefreshToken("");
      setTimeout(() => setSuccess(""), 6000);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setError(""); setSuccess("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`/api/diio/sync${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Test failed");
      setSuccess(`Connection successful! Found ${data.calls?.length || 0} recent transcribed calls.`);
      setTimeout(() => setSuccess(""), 5000);
    } catch (e) { setError(e.message); } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove Diio integration${client ? ` for ${client}` : ""}? This won't delete already-processed calls.`)) return;
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      await fetch(`/api/diio/settings${qs}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      setConfigured(false); setCurrentSubdomain("");
      setSuccess("Integration removed."); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
  };

  const inputStyle = { width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 28, width: 480, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Diio Integration{client ? ` \u2014 ${client}` : ""}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.45)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 20 }}>Loading...</p>
        ) : (
          <>
            {configured && (
              <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 13, color: "#1a7a42" }}>
                Diio is connected ({currentSubdomain}.diio.com). Enter new credentials below to update.
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Subdomain</label>
              <input value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder={configured ? currentSubdomain : "yourcompany (for yourcompany.diio.com)"} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Client ID</label>
              <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Diio client ID"} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Client Secret</label>
              <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Diio client secret"} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Refresh Token</label>
              <input type="password" value={refreshToken} onChange={e => setRefreshToken(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Diio refresh token"} style={inputStyle} />
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>Obtain your credentials from the Diio API settings dashboard.</div>
            </div>

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

// ==================== DIIO SYNC MODAL ====================
function DiioSyncModal({ getValidToken, onClose, onCallProcessed, client }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");

  const loadDiioCalls = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`/api/diio/sync${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load calls");
      setCalls(data.calls || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [getValidToken, client]);

  useEffect(() => { loadDiioCalls(); }, [loadDiioCalls]);

  const processCall = async (diioCallId, rawId, callType) => {
    if (!diioCallId) { setError("Cannot process call: missing call ID"); return; }
    setProcessing(diioCallId); setError("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      const r = await fetch(`/api/diio/sync${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ callId: String(rawId), callType, client: client || "Other" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Processing failed");
      setCalls(prev => prev.map(c => c.diioCallId === diioCallId ? { ...c, status: "completed", overallScore: data.overallScore } : c));
      if (onCallProcessed) onCallProcessed();
    } catch (e) {
      setError(e.message);
      setCalls(prev => prev.map(c => c.diioCallId === diioCallId ? { ...c, status: "failed", errorMessage: e.message } : c));
    } finally { setProcessing(null); }
  };

  const statusBadge = (status) => {
    const s = { new: { bg: "rgba(59,130,246,0.1)", color: "#3b82f6", text: "New" }, processing: { bg: "rgba(234,179,8,0.1)", color: "#eab308", text: "Processing..." }, completed: { bg: "rgba(49,206,129,0.1)", color: "#31CE81", text: "Reviewed" }, failed: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", text: "Failed" } }[status] || { bg: "rgba(59,130,246,0.1)", color: "#3b82f6", text: "New" };
    return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>{s.text}</span>;
  };

  const typeBadge = (callType) => {
    const isPhone = callType === "phone_call";
    return <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, fontWeight: 600, background: isPhone ? "rgba(249,115,22,0.1)" : "rgba(59,130,246,0.1)", color: isPhone ? "#ea580c" : "#3b82f6" }}>{isPhone ? "Phone" : "Meeting"}</span>;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 28, width: 580, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1A2B3C", margin: 0 }}>Sync Diio Calls{client ? ` \u2014 ${client}` : ""}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadDiioCalls} disabled={loading} style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "transparent", color: "rgba(0,0,0,0.5)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{loading ? "..." : "Refresh"}</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.45)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
          </div>
        </div>

        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}

        {loading ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 20 }}>Loading Diio calls...</p>
        ) : calls.length === 0 ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", padding: 20 }}>No transcribed calls found in the last 30 days.</p>
        ) : (() => {
          const sellerNames = [...new Set(calls.map(c => c.sellerName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          const filtered = sellerFilter ? calls.filter(c => c.sellerName === sellerFilter) : calls;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{filtered.length} call{filtered.length !== 1 ? "s" : ""}{sellerFilter ? ` for ${sellerFilter}` : " from last 30 days"}</div>
                {sellerNames.length > 1 && (
                  <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} style={{ padding: "5px 10px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "#FFFFFF", color: "#1A2B3C", fontSize: 12, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
                    <option value="">All Sellers</option>
                    {sellerNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>
              {filtered.map(call => (
                <div key={call.diioCallId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: call.status === "completed" ? "rgba(49,206,129,0.03)" : "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.title}</span>
                      {typeBadge(call.callType)}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>
                      {call.date ? new Date(call.date).toLocaleDateString() : ""}
                    </div>
                    {(call.sellerName || call.customerName) && (
                      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginTop: 3 }}>
                        {call.sellerName && <span style={{ fontWeight: 600 }}>Seller: {call.sellerName}</span>}
                        {call.sellerName && call.customerName && <span> &middot; </span>}
                        {call.customerName && <span>Customer: {call.customerName}</span>}
                      </div>
                    )}
                    {call.errorMessage && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{call.errorMessage}</div>}
                  </div>
                  {statusBadge(call.status)}
                  {(call.status === "new" || call.status === "failed") && (
                    <button onClick={() => processCall(call.diioCallId, call.rawId, call.callType)} disabled={!!processing} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: processing ? "wait" : "pointer", fontFamily: "inherit", opacity: processing && processing !== call.diioCallId ? 0.4 : 1, whiteSpace: "nowrap" }}>
                      {processing === call.diioCallId ? "Processing..." : call.status === "failed" ? "Retry" : "Review"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ==================== INTEGRATIONS PAGE ====================
function IntegrationsPage({ getValidToken, token, loadCalls, clients }) {
  const [gongConfigs, setGongConfigs] = useState([]);
  const [diioConfigs, setDiioConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [gongSettingsClient, setGongSettingsClient] = useState(null);
  const [gongSyncClient, setGongSyncClient] = useState(null);
  const [diioSettingsClient, setDiioSettingsClient] = useState(null);
  const [diioSyncClient, setDiioSyncClient] = useState(null);

  const loadConfigs = useCallback(async () => {
    try {
      const t = await getValidToken();
      const [gongRes, diioRes] = await Promise.all([
        fetch("/api/gong/settings", { headers: { Authorization: `Bearer ${t}` } }),
        fetch("/api/diio/settings", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (gongRes.ok) {
        const data = await gongRes.json();
        setGongConfigs(data.configs || []);
      }
      if (diioRes.ok) {
        const data = await diioRes.json();
        setDiioConfigs(data.configs || []);
      }
    } catch (e) { console.error("Load integrations:", e); }
    setLoading(false);
  }, [getValidToken]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const gongMap = {};
  gongConfigs.forEach(c => { gongMap[c.client] = c; });
  const diioMap = {};
  diioConfigs.forEach(c => { diioMap[c.client] = c; });

  // Detail view for a specific client
  if (selectedClient) {
    const gongCfg = gongMap[selectedClient];
    const diioCfg = diioMap[selectedClient];
    return (
      <div>
        {gongSettingsClient && <GongSettingsModal token={token} getValidToken={getValidToken} client={gongSettingsClient} onClose={() => { setGongSettingsClient(null); loadConfigs(); }} />}
        {gongSyncClient && <GongSyncModal getValidToken={getValidToken} client={gongSyncClient} onClose={() => setGongSyncClient(null)} onCallProcessed={loadCalls} />}
        {diioSettingsClient && <DiioSettingsModal getValidToken={getValidToken} client={diioSettingsClient} onClose={() => { setDiioSettingsClient(null); loadConfigs(); }} />}
        {diioSyncClient && <DiioSyncModal getValidToken={getValidToken} client={diioSyncClient} onClose={() => setDiioSyncClient(null)} onCallProcessed={loadCalls} />}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 }}>
          <span onClick={() => setSelectedClient(null)} style={{ color: "#31CE81", cursor: "pointer", fontWeight: 600 }}>Integrations</span>
          <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
          <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{selectedClient}</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 20px" }}>{selectedClient} &mdash; Integrations</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Gong card */}
          <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>{"\uD83D\uDD17"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C" }}>Gong</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                  {gongCfg ? "Connected" : "Not connected"}
                  {gongCfg?.updated_at ? ` \u00B7 Updated ${new Date(gongCfg.updated_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: gongCfg ? "#31CE81" : "rgba(0,0,0,0.2)", display: "inline-block" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setGongSettingsClient(selectedClient)} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {gongCfg ? "Edit Credentials" : "Connect Gong"}
              </button>
              {gongCfg && (
                <button onClick={() => setGongSyncClient(selectedClient)} style={{ padding: "9px 18px", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, background: "rgba(139,92,246,0.08)", color: "#8b5cf6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Sync Calls
                </button>
              )}
            </div>
            {gongCfg && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(0,0,0,0.02)", borderRadius: 8, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
                Base URL: {gongCfg.gong_base_url} &middot; Auto-review: {gongCfg.auto_review ? "On" : "Off"}
              </div>
            )}
          </div>

          {/* Diio card */}
          <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>{"📞"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C" }}>Diio</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                  {diioCfg ? `Connected · ${diioCfg.subdomain}.diio.com` : "Not connected"}
                  {diioCfg?.updated_at ? ` \u00B7 Updated ${new Date(diioCfg.updated_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: diioCfg ? "#31CE81" : "rgba(0,0,0,0.2)", display: "inline-block" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDiioSettingsClient(selectedClient)} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {diioCfg ? "Edit Credentials" : "Connect Diio"}
              </button>
              {diioCfg && (
                <button onClick={() => setDiioSyncClient(selectedClient)} style={{ padding: "9px 18px", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, background: "rgba(139,92,246,0.08)", color: "#8b5cf6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Sync Calls
                </button>
              )}
            </div>
          </div>
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
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: "-12px 0 20px" }}>Configure Gong or Diio credentials per client to automatically import and review recorded calls.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {clients.map(name => {
              const gongCfg = gongMap[name];
              const diioCfg = diioMap[name];
              const connectedCount = (gongCfg ? 1 : 0) + (diioCfg ? 1 : 0);
              return (
                <div key={name} onClick={() => setSelectedClient(name)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u2699\uFE0F"}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2B3C", marginBottom: 8 }}>{name}</div>
                  {connectedCount > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      {gongCfg && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#31CE81", display: "inline-block" }} />
                          <span style={{ fontSize: 11, color: "#31CE81", fontWeight: 600 }}>Gong</span>
                        </div>
                      )}
                      {diioCfg && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#31CE81", display: "inline-block" }} />
                          <span style={{ fontSize: 11, color: "#31CE81", fontWeight: 600 }}>Diio</span>
                        </div>
                      )}
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

// ==================== HOME PAGE ====================
function AuditStatusBadge({ score }) {
  if (score === null) return <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Not assessed</span>;
  const { label, color, bg } = score < 40 ? { label: "Needs Improvement", color: "#ef4444", bg: "rgba(239,68,68,0.08)" }
    : score < 50 ? { label: "Below Average", color: "#f97316", bg: "rgba(249,115,22,0.08)" }
    : score < 65 ? { label: "Average", color: "#eab308", bg: "rgba(234,179,8,0.08)" }
    : score < 80 ? { label: "Great", color: "#22c55e", bg: "rgba(34,197,94,0.08)" }
    : { label: "Excellent", color: "#31CE81", bg: "rgba(49,206,129,0.08)" };
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, padding: "2px 8px", borderRadius: 6 }}>{label}</span>;
}

function HomePage({ savedCalls, enablementDocs, crmSnapshots, gtmAssessments, tofAssessments, hiringAssessments, metricsAssessments, clients, onNavigate, onClientClick }) {
  const latestScore = (arr) => arr.length > 0 ? (arr[0].overall_score || null) : null;
  const avgScore = (arr) => {
    const scores = arr.map(a => a.overall_score).filter(Boolean);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  };

  const callScore = avgScore(savedCalls);
  const enablementScore = avgScore(enablementDocs);
  const crmScore = latestScore(crmSnapshots);
  const gtmScore = latestScore(gtmAssessments);
  const tofScore = latestScore(tofAssessments);
  const hiringScore = latestScore(hiringAssessments);
  const metricsScore = latestScore(metricsAssessments);

  const allScores = [gtmScore, tofScore, callScore, enablementScore, crmScore, hiringScore, metricsScore].filter(s => s !== null);
  const overallScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;

  const sections = [
    { id: "gtm", label: "GTM Strategy", icon: "🎯", color: "#6366f1", accent: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)", score: gtmScore, count: gtmAssessments.length, countLabel: "assessments", desc: "ICP definition, buyer personas, competitive positioning, channel strategy" },
    { id: "tof", label: "Top of Funnel", icon: "📣", color: "#0ea5e9", accent: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.2)", score: tofScore, count: tofAssessments.length, countLabel: "assessments", desc: "Lead gen channels, brand building, content, outbound conversion rates" },
    { id: "calls", label: "Sales Readiness", icon: "📞", color: "#31CE81", accent: "rgba(49,206,129,0.08)", border: "rgba(49,206,129,0.2)", score: callScore, count: savedCalls.length, countLabel: "calls", desc: "Call quality, discovery, objection handling, next steps, deal qualification" },
    { id: "enablement", label: "Sales Enablement", icon: "📄", color: "#3b82f6", accent: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", score: enablementScore, count: enablementDocs.length, countLabel: "documents", desc: "Pitch decks, battle cards, playbooks, onboarding, manager training" },
    { id: "crm", label: "RevOps", icon: "📊", color: "#8b5cf6", accent: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.2)", score: crmScore, count: crmSnapshots.length, countLabel: "snapshots", desc: "Pipeline health, forecast accuracy, CRM hygiene, reporting cadence" },
    { id: "hiring", label: "Sales Hiring", icon: "👥", color: "#ec4899", accent: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.2)", score: hiringScore, count: hiringAssessments.length, countLabel: "assessments", desc: "Interview process, candidate profiling, mock pitches, 30/60/90 plans" },
    { id: "metrics", label: "Metrics & Benchmarks", icon: "📈", color: "#f59e0b", accent: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", score: metricsScore, count: metricsAssessments.length, countLabel: "assessments", desc: "Quota attainment, pipeline coverage, win rate, SDR/AE benchmarks" },
  ];

  // Per-client cross-dimension health
  const clientHealth = clients.map(client => {
    const clientCalls = savedCalls.filter(c => c.category_scores?.client === client || (c.prospect_company || "").toLowerCase().includes(client.toLowerCase()));
    const cs = clientCalls.length > 0 ? Math.round(clientCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / clientCalls.length) : null;
    const clientDocs = enablementDocs.filter(d => d.client === client);
    const ds = clientDocs.length > 0 ? Math.round(clientDocs.reduce((s, d) => s + (d.overall_score || 0), 0) / clientDocs.length) : null;
    const latestCrm = crmSnapshots.filter(s => s.client === client).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const rs = latestCrm?.overall_score || null;
    const latestGtm = gtmAssessments.filter(s => s.client === client).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const gs = latestGtm?.overall_score || null;
    const latestTof = tofAssessments.filter(s => s.client === client).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const ts = latestTof?.overall_score || null;
    const latestHiring = hiringAssessments.filter(s => s.client === client).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const hs = latestHiring?.overall_score || null;
    const latestMetrics = metricsAssessments.filter(s => s.client === client).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const ms = latestMetrics?.overall_score || null;
    const allS = [gs, ts, cs, ds, rs, hs, ms].filter(s => s !== null);
    const overall = allS.length > 0 ? Math.round(allS.reduce((a, b) => a + b, 0) / allS.length) : null;
    return { client, gs, ts, cs, ds, rs, hs, ms, overall, hasData: allS.length > 0 };
  }).filter(c => c.hasData);

  const sc = (score) => score !== null
    ? <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(score), fontFamily: "'Space Mono', monospace" }}>{score}%</span>
    : <span style={{ fontSize: 11, color: "rgba(0,0,0,0.18)" }}>—</span>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A2B3C", margin: "0 0 6px" }}>GTM Audit — Executive Summary</h1>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>Full-funnel assessment of your sales organization's go-to-market execution</p>
        </div>
        {overallScore !== null && (
          <div style={{ textAlign: "center", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "14px 22px", flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: getScoreColor(overallScore), fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>{overallScore}%</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.4)", marginTop: 6 }}>Overall GTM Score</div>
            <AuditStatusBadge score={overallScore} />
          </div>
        )}
      </div>

      {/* 7 Audit Area Cards — 2 columns + 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
        {sections.map(sec => (
          <div key={sec.id} onClick={() => onNavigate(sec.id)} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, padding: "18px 20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: sec.accent, border: `1px solid ${sec.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{sec.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C" }}>{sec.label}</div>
              </div>
              {sec.score !== null
                ? <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: getScoreColor(sec.score) }}>{sec.score}%</div>
                : <div style={{ fontSize: 11, color: "rgba(0,0,0,0.3)" }}>—</div>}
            </div>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: 0, lineHeight: 1.55 }}>{sec.desc}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <AuditStatusBadge score={sec.score} />
              <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)" }}>{sec.count > 0 ? `${sec.count} ${sec.countLabel}` : ""}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Client Health Overview */}
      {clientHealth.length > 0 ? (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.35)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1.2 }}>Client Health Overview</h3>
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(8, 68px)", gap: 0, padding: "9px 18px", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <span>Client</span>
              {["GTM","TOF","S.Ready","S.Enable","RevOps","Hiring","Metrics","Overall"].map(h => <span key={h} style={{ textAlign: "center" }}>{h}</span>)}
            </div>
            {clientHealth.map((ch, i) => (
              <div key={ch.client} style={{ display: "grid", gridTemplateColumns: "1fr repeat(8, 68px)", gap: 0, padding: "12px 18px", borderBottom: i < clientHealth.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", alignItems: "center" }}>
                <span onClick={() => onClientClick && onClientClick(ch.client)} style={{ fontSize: 13, fontWeight: 600, color: onClientClick ? "#31CE81" : "#1A2B3C", cursor: onClientClick ? "pointer" : "default" }}>{ch.client}</span>
                {[ch.gs, ch.ts, ch.cs, ch.ds, ch.rs, ch.hs, ch.ms, ch.overall].map((s, j) => (
                  <div key={j} style={{ textAlign: "center" }}>{sc(s)}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚀</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", margin: "0 0 8px" }}>Start your first GTM audit</h3>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: "0 0 20px" }}>Select any section from the navigation above to begin assessing your sales organization.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {[{ id: "calls", label: "Review a Call", color: "#31CE81" }, { id: "gtm", label: "Assess GTM Strategy", color: "#6366f1" }, { id: "crm", label: "Add Pipeline Data", color: "#8b5cf6" }].map(b => (
              <button key={b.id} onClick={() => onNavigate(b.id)} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: b.color, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{b.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== GTM ASSESSMENT DOC TYPES ====================
const DOC_TYPES = [
  "Sales Playbook / Methodology",
  "Metrics & Performance Data",
  "Org Chart / Team Structure",
  "Marketing Materials / Pitch Deck",
  "Call Transcripts",
  "Job Descriptions",
  "CRM / Pipeline Report",
  "Other",
];

// ==================== ENABLEMENT PAGE ====================
const ENABLEMENT_DOC_TYPES = [
  // Enablement
  { id: "pitch_deck", name: "Pitch Deck", category: "enablement" },
  { id: "battle_card", name: "Battle Card", category: "enablement" },
  { id: "email_template", name: "Email Template", category: "enablement" },
  { id: "call_script", name: "Call Script", category: "enablement" },
  { id: "playbook", name: "Sales Playbook", category: "enablement" },
  { id: "proposal", name: "Proposal Template", category: "enablement" },
  // Marketing
  { id: "case_study", name: "Case Study", category: "marketing" },
  { id: "one_pager", name: "One-Pager", category: "marketing" },
  { id: "marketing_deck", name: "Marketing Deck", category: "marketing" },
  { id: "customer_story", name: "Customer Story", category: "marketing" },
  // Training
  { id: "training_doc", name: "Training Document", category: "training" },
  { id: "onboarding", name: "Onboarding Guide", category: "training" },
  { id: "certification", name: "Certification / Quiz", category: "training" },
];

function EnablementPage({ docs, getValidToken, profile, clients, onDocsUpdate }) {
  const [mode, setMode] = useState("list");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docTitle, setDocTitle] = useState("");
  const [docClient, setDocClient] = useState("");
  const [docType, setDocType] = useState("pitch_deck");
  const [docContent, setDocContent] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const startNew = () => {
    setSelectedDoc(null); setDocTitle(""); setDocClient(""); setDocType("pitch_deck");
    setDocContent(""); setAnalysis(null); setError(""); setMode("new");
  };

  const viewDoc = (doc) => {
    setSelectedDoc(doc); setDocTitle(doc.title); setDocClient(doc.client);
    setDocType(doc.doc_type); setDocContent(doc.content || "");
    setAnalysis(doc.ai_analysis || null); setError(""); setMode("view");
  };

  const analyzeDoc = async () => {
    if (!docContent.trim()) { setError("Paste document content first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ content: docContent, docType, title: docTitle }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const saveDoc = async () => {
    if (!docTitle.trim()) { setError("Please enter a document title."); return; }
    if (!docClient) { setError("Please select a client."); return; }
    if (!docContent.trim()) { setError("Please paste document content."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      const data = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client: docClient, doc_type: docType, title: docTitle, content: docContent, overall_score: analysis?.overall_score || null, ai_analysis: analysis || null };
      const table = await supabase.from("enablement_docs", t);
      if (selectedDoc?.id) { await table.update(data, `id=eq.${selectedDoc.id}`); }
      else { await table.insert(data); }
      await onDocsUpdate();
      setMode("list");
    } catch (e) {
      if (e.message?.includes("relation") || e.message?.includes("exist") || e.message?.includes("does not exist")) {
        setError("The enablement_docs table doesn't exist yet. Run the DB migration in Supabase to set it up.");
      } else { setError("Save failed: " + e.message); }
    } finally { setSaving(false); }
  };

  const docTypeLabel = (id) => ENABLEMENT_DOC_TYPES.find(t => t.id === id)?.name || id;
  const byClient = {};
  docs.forEach(d => { if (!byClient[d.client]) byClient[d.client] = []; byClient[d.client].push(d); });

  if (mode === "list") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 4px" }}>Enablement</h2>
            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>Audit your sales materials for quality, completeness, and buyer-centricity</p>
          </div>
          <button onClick={startNew} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Upload Doc</button>
        </div>
        {docs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📄</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", margin: "0 0 8px" }}>No documents yet</h3>
            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: "0 0 20px" }}>Upload a pitch deck, battle card, or email template to get an AI quality audit.</p>
            <button onClick={startNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Upload First Doc</button>
          </div>
        ) : Object.entries(byClient).map(([client, clientDocs]) => (
          <div key={client} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>{client}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientDocs.map(doc => (
                <div key={doc.id} onClick={() => viewDoc(doc)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>
                      <span>{docTypeLabel(doc.doc_type)}</span>
                      {doc.created_at && <span> · {new Date(doc.created_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  {doc.overall_score ? (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(doc.overall_score), fontFamily: "'Space Mono', monospace" }}>{doc.overall_score}%</div>
                      <div style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", textTransform: "uppercase" }}>{getScoreLabel(doc.overall_score)}</div>
                    </div>
                  ) : <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", flexShrink: 0 }}>Not analyzed</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // New / Edit view
  const isViewMode = mode === "view" && selectedDoc;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13 }}>
        <span onClick={() => setMode("list")} style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}>Enablement</span>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{isViewMode ? selectedDoc.title : "New Document"}</span>
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Document Title</label>
            <input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Q1 2025 Pitch Deck" style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Client</label>
            <select value={docClient} onChange={e => setDocClient(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid " + (!docClient ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.08)"), borderRadius: 8, color: docClient ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              {ENABLEMENT_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)" }}>Document Content</label>
          <button onClick={analyzeDoc} disabled={analyzing || !docContent.trim()} style={{ padding: "8px 18px", border: "none", borderRadius: 8, cursor: analyzing || !docContent.trim() ? "default" : "pointer", background: analyzing || !docContent.trim() ? "rgba(0,0,0,0.05)" : "linear-gradient(135deg, #3b82f6, #2563eb)", color: analyzing || !docContent.trim() ? "rgba(0,0,0,0.35)" : "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
            {analyzing ? "Analyzing..." : "Analyze with AI ✦"}
          </button>
        </div>
        <FileDropZone value={docContent} onChange={setDocContent} placeholder="Paste your document content here, or drag and drop a file — .pdf, .docx, .txt, .md supported..." minHeight={200} accept=".txt,.md,.html,.pdf,.docx" />
        {analyzing && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", textAlign: "center", marginTop: 10 }}>Analyzing document quality... (10-20s)</p>}
      </div>
      {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {analysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 20 }}>
            <CircularScore score={analysis.overall_score || 0} size={90} strokeWidth={6} label="quality" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Document Quality Assessment</div>
              <p style={{ fontSize: 14, color: "#1A2B3C", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
            </div>
          </div>
          {analysis.scores && (
            <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 20 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#1A2B3C", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>Category Breakdown</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(analysis.scores).map(([key, val]) => {
                  const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  const pct = Math.round((val.score / 10) * 100);
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", fontWeight: 500 }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor10(val.score), fontFamily: "'Space Mono', monospace" }}>{val.score}/10</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 4 }}>
                        <div style={{ height: "100%", width: pct + "%", background: getScoreColor10(val.score), borderRadius: 4 }} />
                      </div>
                      {val.details && <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", margin: "4px 0 0", lineHeight: 1.5 }}>{val.details}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {analysis.key_strengths?.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#31CE81", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Key Strengths</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {analysis.key_strengths.map((s, i) => (
                  <div key={i} style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a7a42", marginBottom: 4 }}>{s.title}</div>
                    <p style={{ fontSize: 11, color: "#1a7a42", margin: 0, lineHeight: 1.6, opacity: 0.85 }}>{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.gaps?.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#eab308", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Areas to Improve</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analysis.gaps.map((g, i) => (
                  <div key={i} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginBottom: 4 }}>{g.title}</div>
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", margin: "0 0 10px", lineHeight: 1.6 }}>{g.description}</p>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8 }}>
                      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#3b82f6", fontWeight: 700, flexShrink: 0, paddingTop: 1 }}>Fix</span>
                      <p style={{ fontSize: 11, color: "#2563eb", margin: 0, lineHeight: 1.6 }}>{g.fix}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.missing_elements?.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Missing Elements</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {analysis.missing_elements.map((m, i) => (
                  <span key={i} style={{ padding: "4px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setMode("list")} style={{ padding: "10px 20px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "transparent", color: "rgba(0,0,0,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={saveDoc} disabled={saving} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : isViewMode ? "Update Doc" : "Save Doc"}</button>
      </div>
    </div>
  );
}

// ==================== CLIENT PROFILE PAGE ====================
function ClientProfilePage({ client, savedCalls, enablementDocs, onBack, onViewCall, onBrowseByRep, onNavigate }) {
  const docTypeLabel = (id) => ENABLEMENT_DOC_TYPES.find(t => t.id === id)?.name || id;
  const docCategory = (docType) => ENABLEMENT_DOC_TYPES.find(t => t.id === docType)?.category || "enablement";

  const clientCalls = savedCalls
    .filter(c => c.category_scores?.client === client || (c.prospect_company || "").toLowerCase().includes(client.toLowerCase()))
    .sort((a, b) => new Date(b.call_date || b.created_at) - new Date(a.call_date || a.created_at));

  const clientDocs = enablementDocs.filter(d => d.client === client);
  const enablementList = clientDocs.filter(d => docCategory(d.doc_type) === "enablement");
  const marketingList = clientDocs.filter(d => docCategory(d.doc_type) === "marketing");
  const trainingList = clientDocs.filter(d => docCategory(d.doc_type) === "training");

  const avgCallScore = clientCalls.length > 0
    ? Math.round(clientCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / clientCalls.length)
    : null;

  const logoUrl = getClientLogo(client);

  const docRow = (doc) => (
    <div key={doc.id} onClick={() => onNavigate("enablement")} style={{ background: "#fafafa", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📄</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
        <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>{docTypeLabel(doc.doc_type)}{doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString()}` : ""}</div>
      </div>
      {doc.overall_score
        ? <div style={{ fontSize: 14, fontWeight: 700, color: getScoreColor(doc.overall_score), fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>{doc.overall_score}%</div>
        : <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", flexShrink: 0 }}>Not scored</span>}
    </div>
  );

  const Section = ({ title, icon, accent, items, emptyText, children, action }) => (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: items.length > 0 ? 14 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C" }}>{title}</span>
          {items.length > 0 && <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", background: "rgba(0,0,0,0.05)", borderRadius: 10, padding: "2px 8px" }}>{items.length}</span>}
        </div>
        {action}
      </div>
      {items.length === 0
        ? <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", margin: items.length === 0 ? "10px 0 0" : 0, textAlign: "center", padding: "12px 0" }}>{emptyText}</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13 }}>
        <span onClick={onBack} style={{ color: "#31CE81", cursor: "pointer", fontWeight: 600 }}>Clients</span>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{client}</span>
      </div>

      {/* Header card */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "18px 22px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#f8f9fa", border: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {logoUrl ? <img src={logoUrl} alt={client} style={{ width: 38, height: 38, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} /> : null}
          <span style={{ fontSize: 22, fontWeight: 700, color: "#31CE81" }}>{client.charAt(0)}</span>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1A2B3C", margin: "0 0 4px" }}>{client}</h2>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>
            {clientCalls.length} call{clientCalls.length !== 1 ? "s" : ""} · {clientDocs.length} document{clientDocs.length !== 1 ? "s" : ""}
          </div>
        </div>
        {avgCallScore !== null && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: getScoreColor(avgCallScore), fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>{avgCallScore}%</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.35)", marginTop: 4 }}>Avg Call Score</div>
          </div>
        )}
      </div>

      {/* Call Reviews */}
      <Section
        title="Call Reviews" icon="📞" items={clientCalls}
        emptyText="No call reviews yet for this client."
        action={clientCalls.length > 0 && <button onClick={onBrowseByRep} style={{ fontSize: 12, fontWeight: 600, color: "#31CE81", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Browse by Rep →</button>}
      >
        {clientCalls.map(call => (
          <div key={call.id} onClick={() => onViewCall(call)} style={{ background: "#fafafa", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <CircularScore score={call.overall_score || 0} size={40} strokeWidth={3} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", display: "flex", alignItems: "center", gap: 6 }}>
                {call.category_scores?.rep_name || call.rep_name || "Unknown Rep"}
                {call.category_scores?.rep_type === "SDR" && <span style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4 }}>SDR</span>}
              </div>
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>
                {call.category_scores?.call_type || call.call_type || "Call"}
                {call.call_date ? ` · ${new Date(call.call_date).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(call.overall_score || 0), textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>{getScoreLabel(call.overall_score || 0)}</div>
          </div>
        ))}
      </Section>

      {/* Enablement Documents */}
      <Section
        title="Enablement Documents" icon="📄" items={enablementList}
        emptyText="No enablement documents uploaded yet."
        action={<button onClick={() => onNavigate("enablement")} style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>+ Upload →</button>}
      >
        {enablementList.map(docRow)}
      </Section>

      {/* Marketing Materials */}
      <Section
        title="Marketing Materials" icon="📣" items={marketingList}
        emptyText="No marketing materials uploaded yet."
        action={<button onClick={() => onNavigate("enablement")} style={{ fontSize: 12, fontWeight: 600, color: "#0ea5e9", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>+ Upload →</button>}
      >
        {marketingList.map(docRow)}
      </Section>

      {/* Training Documents */}
      <Section
        title="Training Documents" icon="🎓" items={trainingList}
        emptyText="No training documents uploaded yet."
        action={<button onClick={() => onNavigate("enablement")} style={{ fontSize: 12, fontWeight: 600, color: "#8b5cf6", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>+ Upload →</button>}
      >
        {trainingList.map(docRow)}
      </Section>
    </div>
  );
}

// ==================== CRM PAGE ====================
function CrmPage({ snapshots, getValidToken, profile, clients, onSnapshotsUpdate }) {
  const [mode, setMode] = useState("list");
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().split("T")[0]);
  const [crmData, setCrmData] = useState({ quota: "", totalPipeline: "", activeDeals: "", winRate: "", avgDealSize: "", avgCycleDays: "", earlyStage: "", midStage: "", lateStage: "", negotiation: "", wonThisMonth: "", lostThisMonth: "", notes: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const startNew = () => {
    setSelectedSnapshot(null); setSelectedClient(""); setSnapshotDate(new Date().toISOString().split("T")[0]);
    setCrmData({ quota: "", totalPipeline: "", activeDeals: "", winRate: "", avgDealSize: "", avgCycleDays: "", earlyStage: "", midStage: "", lateStage: "", negotiation: "", wonThisMonth: "", lostThisMonth: "", notes: "" });
    setAnalysis(null); setError(""); setMode("new");
  };

  const viewSnapshot = (snap) => {
    setSelectedSnapshot(snap); setSelectedClient(snap.client);
    setCrmData(snap.crm_data || {}); setAnalysis(snap.ai_analysis || null);
    setSnapshotDate(snap.snapshot_date || new Date().toISOString().split("T")[0]);
    setError(""); setMode("view");
  };

  const analyzeData = async () => {
    if (!selectedClient) { setError("Please select a client first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-crm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ client: selectedClient, crmData, snapshotDate }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const saveSnapshot = async () => {
    if (!selectedClient) { setError("Please select a client."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      const data = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client: selectedClient, snapshot_date: snapshotDate, crm_data: crmData, overall_score: analysis?.health_score || null, ai_analysis: analysis || null };
      const table = await supabase.from("crm_snapshots", t);
      if (selectedSnapshot?.id) { await table.update(data, `id=eq.${selectedSnapshot.id}`); }
      else { await table.insert(data); }
      await onSnapshotsUpdate();
      setMode("list");
    } catch (e) {
      if (e.message?.includes("relation") || e.message?.includes("exist") || e.message?.includes("does not exist")) {
        setError("The crm_snapshots table doesn't exist yet. Run the DB migration in Supabase to set it up.");
      } else { setError("Save failed: " + e.message); }
    } finally { setSaving(false); }
  };

  const byClient = {};
  snapshots.forEach(s => { if (!byClient[s.client]) byClient[s.client] = []; byClient[s.client].push(s); });

  if (mode === "list") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 4px" }}>RevOps</h2>
            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>Track pipeline health and get AI-powered deal analysis per client</p>
          </div>
          <button onClick={startNew} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Add Snapshot</button>
        </div>
        {snapshots.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", margin: "0 0 8px" }}>No pipeline data yet</h3>
            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: "0 0 20px" }}>Add a CRM snapshot to get AI analysis of your pipeline health, coverage, and forecast quality.</p>
            <button onClick={startNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add First Snapshot</button>
          </div>
        ) : Object.entries(byClient).map(([client, clientSnaps]) => (
          <div key={client} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>{client}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientSnaps.sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)).map(snap => (
                <div key={snap.id} onClick={() => viewSnapshot(snap)} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📊</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C" }}>{client} Pipeline Snapshot</div>
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>
                      {snap.snapshot_date && <span>{new Date(snap.snapshot_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                      {snap.crm_data?.totalPipeline && <span> · ${Number(snap.crm_data.totalPipeline).toLocaleString()} pipeline</span>}
                    </div>
                  </div>
                  {snap.overall_score ? (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(snap.overall_score), fontFamily: "'Space Mono', monospace" }}>{snap.overall_score}%</div>
                      <div style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", textTransform: "uppercase" }}>health</div>
                    </div>
                  ) : <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", flexShrink: 0 }}>Not analyzed</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // New / Edit view
  const isViewMode = mode === "view" && selectedSnapshot;
  const numField = (key, label, placeholder) => (
    <div key={key}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={crmData[key] || ""} onChange={e => setCrmData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13 }}>
        <span onClick={() => setMode("list")} style={{ color: "#8b5cf6", cursor: "pointer", fontWeight: 600 }}>RevOps</span>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{isViewMode ? `${selectedSnapshot.client} — ${selectedSnapshot.snapshot_date}` : "New Snapshot"}</span>
      </div>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Client</label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid " + (!selectedClient ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.08)"), borderRadius: 8, color: selectedClient ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Snapshot Date</label>
            <input type="date" value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.45)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Overall Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {numField("quota", "Quota ($)", "e.g. 500000")}
          {numField("totalPipeline", "Total Pipeline ($)", "e.g. 1500000")}
          {numField("activeDeals", "Active Deals", "e.g. 24")}
          {numField("winRate", "Win Rate (%)", "e.g. 22")}
          {numField("avgDealSize", "Avg Deal Size ($)", "e.g. 45000")}
          {numField("avgCycleDays", "Avg Sales Cycle (days)", "e.g. 90")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.45)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Pipeline by Stage</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {numField("earlyStage", "Early Stage ($)", "e.g. 500000")}
          {numField("midStage", "Mid-Pipeline ($)", "e.g. 600000")}
          {numField("lateStage", "Late Stage ($)", "e.g. 300000")}
          {numField("negotiation", "Negotiation ($)", "e.g. 100000")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.45)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Activity (This Month)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {numField("wonThisMonth", "Deals Won ($)", "e.g. 90000")}
          {numField("lostThisMonth", "Deals Lost ($)", "e.g. 40000")}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Additional Context</label>
          <textarea value={crmData.notes || ""} onChange={e => setCrmData(p => ({ ...p, notes: e.target.value }))} placeholder="Key at-risk deals, market conditions, team changes, etc." rows={3} style={{ width: "100%", padding: "10px 12px", background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
        </div>
        <button onClick={analyzeData} disabled={analyzing || !selectedClient} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing || !selectedClient ? "default" : "pointer", background: analyzing || !selectedClient ? "rgba(0,0,0,0.05)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: analyzing || !selectedClient ? "rgba(0,0,0,0.35)" : "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
          {analyzing ? "Analyzing..." : "Analyze Pipeline ✦"}
        </button>
        {analyzing && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginTop: 8 }}>Analyzing pipeline health... (10-20s)</p>}
      </div>
      {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {analysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, display: "flex", alignItems: "flex-start", gap: 20 }}>
            <CircularScore score={analysis.health_score || 0} size={90} strokeWidth={6} label="health" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Pipeline Health Assessment</div>
              <p style={{ fontSize: 14, color: "#1A2B3C", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
            </div>
          </div>
          {analysis.key_metrics?.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {analysis.key_metrics.map((m, i) => (
                <div key={i} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: m.status === "good" ? "#31CE81" : m.status === "warning" ? "#eab308" : m.status === "bad" ? "#ef4444" : "#1A2B3C", fontFamily: "'Space Mono', monospace", lineHeight: 1.2 }}>{m.value}</div>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>{m.label}</div>
                  {m.note && <div style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", marginTop: 6, lineHeight: 1.4 }}>{m.note}</div>}
                </div>
              ))}
            </div>
          )}
          {analysis.insights?.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 20 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#1A2B3C", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>Key Insights</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analysis.insights.map((insight, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)", borderRadius: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{insight.type === "risk" ? "⚠️" : insight.type === "opportunity" ? "✅" : "💡"}</span>
                    <p style={{ fontSize: 13, color: "#1A2B3C", margin: 0, lineHeight: 1.6 }}>{insight.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.recommendations?.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#eab308", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Recommendations</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginBottom: 4 }}>{rec.title}</div>
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", margin: 0, lineHeight: 1.6 }}>{rec.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setMode("list")} style={{ padding: "10px 20px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "transparent", color: "rgba(0,0,0,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={saveSnapshot} disabled={saving} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : isViewMode ? "Update Snapshot" : "Save Snapshot"}</button>
      </div>
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

// ==================== SHARED HELPERS FOR ASSESSMENT PAGES ====================

function AuditAnalysisDisplay({ analysis, accentColor = "#6366f1" }) {
  if (!analysis) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Score + summary */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, display: "flex", alignItems: "flex-start", gap: 20 }}>
        <CircularScore score={analysis.overall_score || 0} size={88} strokeWidth={6} label="score" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Assessment Summary</div>
          <p style={{ fontSize: 14, color: "#1A2B3C", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
        </div>
      </div>
      {/* Sub-scores */}
      {analysis.sub_scores?.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>Dimension Scores</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analysis.sub_scores.map((s, i) => {
              const statusColor = s.score < 40 ? "#ef4444" : s.score < 50 ? "#f97316" : s.score < 65 ? "#eab308" : s.score < 80 ? "#22c55e" : "#31CE81";
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C" }}>{s.category}</span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: statusColor }}>{s.score}%</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ width: `${s.score}%`, height: "100%", background: statusColor, borderRadius: 4, transition: "width 0.6s ease" }} />
                  </div>
                  {s.note && <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", margin: 0, lineHeight: 1.5 }}>{s.note}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Key metrics (for metrics page) */}
      {analysis.key_metrics?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {analysis.key_metrics.map((m, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: m.status === "good" ? "#31CE81" : m.status === "warning" ? "#eab308" : m.status === "bad" ? "#ef4444" : "#1A2B3C", fontFamily: "'Space Mono', monospace", lineHeight: 1.2 }}>{m.value}</div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>{m.label}</div>
              {m.benchmark && <div style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", marginTop: 4 }}>Benchmark: {m.benchmark}</div>}
            </div>
          ))}
        </div>
      )}
      {/* Strengths */}
      {analysis.strengths?.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Strengths</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analysis.strengths.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>✅</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginBottom: 2 }}>{s.title}</div><p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: 0, lineHeight: 1.5 }}>{s.description}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Gaps */}
      {analysis.gaps?.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Critical Gaps</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {analysis.gaps.map((g, i) => (
              <div key={i} style={{ padding: "12px 14px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginBottom: 4 }}>{g.title}</div>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "0 0 8px", lineHeight: 1.5 }}>{g.description}</p>
                <div style={{ fontSize: 12, color: accentColor, fontWeight: 600 }}>Fix: {g.fix}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Recommendations */}
      {analysis.recommendations?.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Recommendations</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analysis.recommendations.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 13, color: accentColor, fontWeight: 700, flexShrink: 0 }}>→</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginBottom: 2 }}>{r.title}</div><p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: 0, lineHeight: 1.5 }}>{r.description}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssessmentListView({ title, emoji, accentColor, assessments, onNew, onView, gradient }) {
  const byClient = {};
  assessments.forEach(a => { if (!byClient[a.client]) byClient[a.client] = []; byClient[a.client].push(a); });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 4px" }}>{title}</h2>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>AI-powered assessment against industry best practices</p>
        </div>
        <button onClick={onNew} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: gradient, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ New Assessment</button>
      </div>
      {assessments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>{emoji}</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C", margin: "0 0 8px" }}>No assessments yet</h3>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: "0 0 20px" }}>Run an assessment to get AI-scored insights for this area of your GTM.</p>
          <button onClick={onNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: gradient, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Run First Assessment</button>
        </div>
      ) : Object.entries(byClient).map(([client, items]) => (
        <div key={client} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.35)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1.2 }}>{client}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(item => (
              <div key={item.id} onClick={() => onView(item)} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C" }}>{client} — {title}</div>
                  <div style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", marginTop: 2 }}>{item.assessment_date && new Date(item.assessment_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
                {item.overall_score ? (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(item.overall_score), fontFamily: "'Space Mono', monospace" }}>{item.overall_score}%</div>
                    <AuditStatusBadge score={item.overall_score} />
                  </div>
                ) : <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)" }}>Not analyzed</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AssessmentFormShell({ title, emoji, accentColor, gradient, breadcrumb, client, setClient, clients, assessmentDate, setAssessmentDate, analyzing, saving, analysis, error, onAnalyze, onSave, onBack, analyzeLabel, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13 }}>
        <span onClick={onBack} style={{ color: accentColor, cursor: "pointer", fontWeight: 600 }}>{title}</span>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span style={{ color: "#1A2B3C", fontWeight: 600 }}>{breadcrumb}</span>
      </div>
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Client</label>
            <select value={client} onChange={e => setClient(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid " + (!client ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.08)"), borderRadius: 8, color: client ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Assessment Date</label>
            <input type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        </div>
        {children}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button onClick={onAnalyze} disabled={analyzing || !client} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing || !client ? "default" : "pointer", background: analyzing || !client ? "rgba(0,0,0,0.05)" : gradient, color: analyzing || !client ? "rgba(0,0,0,0.35)" : "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
            {analyzing ? "Analyzing..." : analyzeLabel + " ✦"}
          </button>
          {analysis && <button onClick={onSave} disabled={saving} style={{ padding: "10px 20px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "#fff", color: "#1A2B3C", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : "Save Assessment"}</button>}
        </div>
        {analyzing && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginTop: 8 }}>Analyzing... (10-20s)</p>}
      </div>
      {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
    </div>
  );
}

// ==================== GTM STRATEGY PAGE ====================

function GtmStrategyPage({ assessments, getValidToken, profile, clients, onUpdate }) {
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [client, setClient] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState({ icp: "", personas: "", valueProposition: "", channels: "", competitive: "", notes: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const startNew = () => { setSelected(null); setClient(""); setAssessmentDate(new Date().toISOString().split("T")[0]); setData({ icp: "", personas: "", valueProposition: "", channels: "", competitive: "", notes: "" }); setAnalysis(null); setError(""); setMode("new"); };
  const viewItem = (item) => { setSelected(item); setClient(item.client); setAssessmentDate(item.assessment_date || new Date().toISOString().split("T")[0]); setData(item.input_data || {}); setAnalysis(item.ai_analysis || null); setError(""); setMode("view"); };

  const ta = (key, label, placeholder, rows = 3) => (
    <div key={key} style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={rows} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
    </div>
  );

  const analyze = async () => {
    if (!client) { setError("Select a client first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-audit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ type: "gtm_strategy", client, data }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const save = async () => {
    if (!client) { setError("Select a client."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      const row = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client, assessment_date: assessmentDate, input_data: data, overall_score: analysis?.overall_score || null, ai_analysis: analysis || null };
      const table = await supabase.from("gtm_assessments", t);
      if (selected?.id) { await table.update(row, `id=eq.${selected.id}`); } else { await table.insert(row); }
      await onUpdate(); setMode("list");
    } catch (e) { setError(e.message?.includes("exist") ? "The gtm_assessments table doesn't exist yet. Create it in Supabase." : "Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  if (mode === "list") return <AssessmentListView title="GTM Strategy" emoji="🎯" accentColor="#6366f1" gradient="linear-gradient(135deg, #6366f1, #4f46e5)" assessments={assessments} onNew={startNew} onView={viewItem} />;

  return (
    <>
      <AssessmentFormShell title="GTM Strategy" emoji="🎯" accentColor="#6366f1" gradient="linear-gradient(135deg, #6366f1, #4f46e5)" breadcrumb={selected ? `${selected.client} — ${selected.assessment_date}` : "New Assessment"} client={client} setClient={setClient} clients={clients} assessmentDate={assessmentDate} setAssessmentDate={setAssessmentDate} analyzing={analyzing} saving={saving} analysis={analysis} error={error} onAnalyze={analyze} onSave={save} onBack={() => setMode("list")} analyzeLabel="Assess GTM Strategy">
        {ta("icp", "Ideal Customer Profile", "Describe your ICP: company size, industry, revenue range, tech stack, pain points they share...", 3)}
        {ta("personas", "Buyer Personas", "List your target personas: their roles, seniority, KPIs, what they care about, how they evaluate vendors...", 3)}
        {ta("valueProposition", "Value Proposition", "What is your core value proposition? How do you articulate the outcome you deliver vs. the problem you solve?", 3)}
        {ta("channels", "Customer Acquisition Channels", "What channels are you using? (Outbound, Inbound, Referrals, Partnerships, Events) How is each performing?", 3)}
        {ta("competitive", "Competitive Positioning", "Who are your main competitors? How do you position against them? What are your key differentiators?", 3)}
        {ta("notes", "Additional Context", "Any other context: recent pivots, market shifts, experiments underway...", 2)}
      </AssessmentFormShell>
      <AuditAnalysisDisplay analysis={analysis} accentColor="#6366f1" />
    </>
  );
}

// ==================== TOP OF FUNNEL PAGE ====================

function TopOfFunnelPage({ assessments, getValidToken, profile, clients, onUpdate }) {
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [client, setClient] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState({ inboundVolume: "", outboundVolume: "", inboundConvRate: "", outboundReplyRate: "", emailOpenRate: "", contentCadence: "", brandDescription: "", websiteNotes: "", notes: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const startNew = () => { setSelected(null); setClient(""); setAssessmentDate(new Date().toISOString().split("T")[0]); setData({ inboundVolume: "", outboundVolume: "", inboundConvRate: "", outboundReplyRate: "", emailOpenRate: "", contentCadence: "", brandDescription: "", websiteNotes: "", notes: "" }); setAnalysis(null); setError(""); setMode("new"); };
  const viewItem = (item) => { setSelected(item); setClient(item.client); setAssessmentDate(item.assessment_date || new Date().toISOString().split("T")[0]); setData(item.input_data || {}); setAnalysis(item.ai_analysis || null); setError(""); setMode("view"); };

  const numField = (key, label, placeholder) => (
    <div key={key}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );
  const ta = (key, label, placeholder) => (
    <div key={key} style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
    </div>
  );

  const analyze = async () => {
    if (!client) { setError("Select a client first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-audit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ type: "tof", client, data }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const save = async () => {
    if (!client) { setError("Select a client."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      const row = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client, assessment_date: assessmentDate, input_data: data, overall_score: analysis?.overall_score || null, ai_analysis: analysis || null };
      const table = await supabase.from("tof_assessments", t);
      if (selected?.id) { await table.update(row, `id=eq.${selected.id}`); } else { await table.insert(row); }
      await onUpdate(); setMode("list");
    } catch (e) { setError(e.message?.includes("exist") ? "The tof_assessments table doesn't exist yet." : "Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  if (mode === "list") return <AssessmentListView title="Top of Funnel" emoji="📣" accentColor="#0ea5e9" gradient="linear-gradient(135deg, #0ea5e9, #0284c7)" assessments={assessments} onNew={startNew} onView={viewItem} />;

  return (
    <>
      <AssessmentFormShell title="Top of Funnel" emoji="📣" accentColor="#0ea5e9" gradient="linear-gradient(135deg, #0ea5e9, #0284c7)" breadcrumb={selected ? `${selected.client} — ${selected.assessment_date}` : "New Assessment"} client={client} setClient={setClient} clients={clients} assessmentDate={assessmentDate} setAssessmentDate={setAssessmentDate} analyzing={analyzing} saving={saving} analysis={analysis} error={error} onAnalyze={analyze} onSave={save} onBack={() => setMode("list")} analyzeLabel="Assess Top of Funnel">
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Volume Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("inboundVolume", "Inbound Leads/Month", "e.g. 120")}
          {numField("outboundVolume", "Outbound Sequences/Month", "e.g. 500")}
          {numField("inboundConvRate", "Inbound → Meeting Rate (%)", "e.g. 8")}
          {numField("outboundReplyRate", "Outbound Reply Rate (%)", "e.g. 4")}
          {numField("emailOpenRate", "Email Open Rate (%)", "e.g. 35")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Strategy & Presence</div>
        {ta("contentCadence", "Content Strategy & Cadence", "How often are you publishing? What types of content? LinkedIn posts, webinars, SEO, video...")}
        {ta("brandDescription", "Brand Building Efforts", "What are you doing for thought leadership, brand awareness, community presence?")}
        {ta("websiteNotes", "Website & Landing Pages", "Describe your website conversion performance, message clarity, SEO status, campaign pages...")}
        {ta("notes", "Additional Context", "Any other context about your top-of-funnel motion...")}
      </AssessmentFormShell>
      <AuditAnalysisDisplay analysis={analysis} accentColor="#0ea5e9" />
    </>
  );
}

// ==================== SALES HIRING PAGE ====================

function SalesHiringPage({ assessments, getValidToken, profile, clients, onUpdate }) {
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [client, setClient] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState({ profileCriteria: "", interviewProcess: "", hasScorecard: false, hasMockPitch: false, hasManagerPlan: false, timeToHire: "", offerAcceptRate: "", rampTime: "", notes: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const startNew = () => { setSelected(null); setClient(""); setAssessmentDate(new Date().toISOString().split("T")[0]); setData({ profileCriteria: "", interviewProcess: "", hasScorecard: false, hasMockPitch: false, hasManagerPlan: false, timeToHire: "", offerAcceptRate: "", rampTime: "", notes: "" }); setAnalysis(null); setError(""); setMode("new"); };
  const viewItem = (item) => { setSelected(item); setClient(item.client); setAssessmentDate(item.assessment_date || new Date().toISOString().split("T")[0]); setData(item.input_data || {}); setAnalysis(item.ai_analysis || null); setError(""); setMode("view"); };

  const toggle = (key, label) => (
    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: data[key] ? "rgba(34,197,94,0.06)" : "rgba(0,0,0,0.02)", border: `1px solid ${data[key] ? "rgba(34,197,94,0.2)" : "rgba(0,0,0,0.08)"}`, borderRadius: 8, cursor: "pointer" }} onClick={() => setData(p => ({ ...p, [key]: !p[key] }))}>
      <div style={{ width: 18, height: 18, borderRadius: 4, background: data[key] ? "#22c55e" : "#fff", border: `2px solid ${data[key] ? "#22c55e" : "rgba(0,0,0,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "#fff" }}>{data[key] ? "✓" : ""}</div>
      <span style={{ fontSize: 13, color: "#1A2B3C", fontWeight: 500 }}>{label}</span>
    </div>
  );
  const numField = (key, label, placeholder) => (
    <div key={key}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );
  const ta = (key, label, placeholder) => (
    <div key={key} style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
    </div>
  );

  const analyze = async () => {
    if (!client) { setError("Select a client first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-audit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ type: "hiring", client, data }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const save = async () => {
    if (!client) { setError("Select a client."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      const row = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client, assessment_date: assessmentDate, input_data: data, overall_score: analysis?.overall_score || null, ai_analysis: analysis || null };
      const table = await supabase.from("hiring_assessments", t);
      if (selected?.id) { await table.update(row, `id=eq.${selected.id}`); } else { await table.insert(row); }
      await onUpdate(); setMode("list");
    } catch (e) { setError(e.message?.includes("exist") ? "The hiring_assessments table doesn't exist yet." : "Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  if (mode === "list") return <AssessmentListView title="Sales Hiring" emoji="👥" accentColor="#ec4899" gradient="linear-gradient(135deg, #ec4899, #db2777)" assessments={assessments} onNew={startNew} onView={viewItem} />;

  return (
    <>
      <AssessmentFormShell title="Sales Hiring" emoji="👥" accentColor="#ec4899" gradient="linear-gradient(135deg, #ec4899, #db2777)" breadcrumb={selected ? `${selected.client} — ${selected.assessment_date}` : "New Assessment"} client={client} setClient={setClient} clients={clients} assessmentDate={assessmentDate} setAssessmentDate={setAssessmentDate} analyzing={analyzing} saving={saving} analysis={analysis} error={error} onAnalyze={analyze} onSave={save} onBack={() => setMode("list")} analyzeLabel="Assess Hiring Program">
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Program Checklist</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {toggle("hasScorecard", "Standardized interview scorecard exists for SDRs and AEs")}
          {toggle("hasMockPitch", "Mock pitch or role-play is a required part of the interview process")}
          {toggle("hasManagerPlan", "Structured 30/60/90 onboarding plan exists for new managers")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Hiring Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("timeToHire", "Avg Time to Hire (days)", "e.g. 21")}
          {numField("offerAcceptRate", "Offer Acceptance Rate (%)", "e.g. 85")}
          {numField("rampTime", "AE Ramp Time (months)", "e.g. 4")}
        </div>
        {ta("profileCriteria", "SDR / AE Candidate Profile", "What does your ideal SDR or AE profile look like? Skills, backgrounds, traits, disqualifiers...")}
        {ta("interviewProcess", "Interview Process Description", "Describe the stages: screening, technical, culture fit, mock pitch, panel... How many rounds?")}
        {ta("notes", "Additional Context", "Any hiring challenges, recent changes to the process, or market conditions...")}
      </AssessmentFormShell>
      <AuditAnalysisDisplay analysis={analysis} accentColor="#ec4899" />
    </>
  );
}

// ==================== METRICS PAGE ====================

function MetricsPage({ assessments, getValidToken, profile, clients, onUpdate }) {
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [client, setClient] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState({ quotaAttainment: "", pipelineCoverage: "", winRate: "", avgDealSize: "", saleCycleDays: "", sdrMeetings: "", outboundReplyRate: "", aeRampMonths: "", managerRatio: "", cac: "", ltv: "", notes: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const startNew = () => { setSelected(null); setClient(""); setAssessmentDate(new Date().toISOString().split("T")[0]); setData({ quotaAttainment: "", pipelineCoverage: "", winRate: "", avgDealSize: "", saleCycleDays: "", sdrMeetings: "", outboundReplyRate: "", aeRampMonths: "", managerRatio: "", cac: "", ltv: "", notes: "" }); setAnalysis(null); setError(""); setMode("new"); };
  const viewItem = (item) => { setSelected(item); setClient(item.client); setAssessmentDate(item.assessment_date || new Date().toISOString().split("T")[0]); setData(item.input_data || {}); setAnalysis(item.ai_analysis || null); setError(""); setMode("view"); };

  const numField = (key, label, placeholder) => (
    <div key={key}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );

  const analyze = async () => {
    if (!client) { setError("Select a client first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-audit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ type: "metrics", client, data }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const save = async () => {
    if (!client) { setError("Select a client."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      const row = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client, assessment_date: assessmentDate, input_data: data, overall_score: analysis?.overall_score || null, ai_analysis: analysis || null };
      const table = await supabase.from("metrics_assessments", t);
      if (selected?.id) { await table.update(row, `id=eq.${selected.id}`); } else { await table.insert(row); }
      await onUpdate(); setMode("list");
    } catch (e) { setError(e.message?.includes("exist") ? "The metrics_assessments table doesn't exist yet." : "Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  if (mode === "list") return <AssessmentListView title="Metrics & Benchmarks" emoji="📈" accentColor="#f59e0b" gradient="linear-gradient(135deg, #f59e0b, #d97706)" assessments={assessments} onNew={startNew} onView={viewItem} />;

  return (
    <>
      <AssessmentFormShell title="Metrics & Benchmarks" emoji="📈" accentColor="#f59e0b" gradient="linear-gradient(135deg, #f59e0b, #d97706)" breadcrumb={selected ? `${selected.client} — ${selected.assessment_date}` : "New Assessment"} client={client} setClient={setClient} clients={clients} assessmentDate={assessmentDate} setAssessmentDate={setAssessmentDate} analyzing={analyzing} saving={saving} analysis={analysis} error={error} onAnalyze={analyze} onSave={save} onBack={() => setMode("list")} analyzeLabel="Benchmark Metrics">
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>AE / Sales Performance</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("quotaAttainment", "% of Reps at Quota", "e.g. 55")}
          {numField("winRate", "Win Rate (%)", "e.g. 22")}
          {numField("saleCycleDays", "Avg Sales Cycle (days)", "e.g. 45")}
          {numField("avgDealSize", "Avg Deal Size ($)", "e.g. 25000")}
          {numField("aeRampMonths", "AE Ramp Time (months)", "e.g. 4")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Pipeline & Outbound</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("pipelineCoverage", "Pipeline Coverage (x quota)", "e.g. 3.2")}
          {numField("sdrMeetings", "SDR Meetings/Month (per rep)", "e.g. 10")}
          {numField("outboundReplyRate", "Outbound Reply Rate (%)", "e.g. 4")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Revenue Efficiency</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("cac", "CAC ($)", "e.g. 15000")}
          {numField("ltv", "LTV ($)", "e.g. 75000")}
          {numField("managerRatio", "Manager:Rep Ratio (1:X)", "e.g. 7")}
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 6 }}>Additional Context</label>
          <textarea value={data.notes || ""} onChange={e => setData(p => ({ ...p, notes: e.target.value }))} placeholder="Market context, team size, recent changes, quota setting methodology..." rows={2} style={{ width: "100%", padding: "10px 12px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#1A2B3C", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
        </div>
      </AssessmentFormShell>
      <AuditAnalysisDisplay analysis={analysis} accentColor="#f59e0b" />
    </>
  );
}

// ==================== INTAKE PAGE ====================
function IntakePage({ clients, getValidToken, profile, onReportGenerated, onBack }) {
  const [selectedClient, setSelectedClient] = useState("");
  const [docs, setDocs] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const addFile = async (file) => {
    if (!file) return;
    setExtracting(true);
    try {
      const content = await extractTextFromFile(file);
      setDocs(prev => [...prev, { id: Date.now() + Math.random(), filename: file.name, docType: "Other", content }]);
    } catch (e) {
      setError(`Could not read ${file.name}: ${e.message}`);
    } finally { setExtracting(false); }
  };

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    for (const f of Array.from(e.dataTransfer.files)) await addFile(f);
  };

  const handleFileInput = async (e) => {
    for (const f of Array.from(e.target.files)) await addFile(f);
    e.target.value = "";
  };

  const removeDoc = (id) => setDocs(prev => prev.filter(d => d.id !== id));
  const updateDocType = (id, docType) => setDocs(prev => prev.map(d => d.id === id ? { ...d, docType } : d));

  const generate = async () => {
    if (!selectedClient) { setError("Please select a client."); return; }
    if (docs.length === 0) { setError("Please upload at least one document."); return; }
    setGenerating(true); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/analyze-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          type: "full_assessment",
          client: selectedClient,
          documents: docs.map(d => ({ docType: d.docType, filename: d.filename, content: d.content })),
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Generation failed"); }
      const analysis = await r.json();
      const reportDate = new Date().toISOString().split("T")[0];
      const reportData = {
        org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001",
        client: selectedClient,
        report_date: reportDate,
        document_sources: docs.map(d => ({ docType: d.docType, filename: d.filename })),
        overall_score: analysis.overall_score || null,
        ai_analysis: analysis,
      };
      let savedReport = { ...reportData };
      try {
        const table = await supabase.from("gtm_reports", t);
        const created = await table.insert(reportData);
        if (Array.isArray(created) && created[0]) savedReport = created[0];
      } catch (saveErr) {
        console.warn("Could not save to gtm_reports (table may not exist yet):", saveErr.message);
      }
      onReportGenerated({ ...savedReport, ai_analysis: analysis });
    } catch (e) {
      setError("Generation failed: " + e.message);
    } finally { setGenerating(false); }
  };

  const canGenerate = !generating && selectedClient && docs.length > 0 && !extracting;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13 }}>
        <span onClick={onBack} style={{ color: "#31CE81", cursor: "pointer", fontWeight: 600 }}>Home</span>
        <span style={{ color: "rgba(0,0,0,0.4)" }}>/</span>
        <span style={{ color: "#1A2B3C", fontWeight: 600 }}>New GTM Assessment</span>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A2B3C", margin: "0 0 6px" }}>New GTM Assessment</h1>
        <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>Upload company documents and generate a board-ready McKinsey-style GTM assessment report</p>
      </div>

      {/* Client Selector */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
        <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 8, fontWeight: 700 }}>Client *</label>
        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ width: "100%", maxWidth: 340, padding: "10px 12px", background: "#fff", border: "1px solid " + (!selectedClient ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.08)"), borderRadius: 8, color: selectedClient ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          <option value="">Select client...</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Document Upload */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C", margin: "0 0 4px" }}>Documents</h3>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: 0 }}>Upload sales decks, playbooks, metrics reports, org charts, transcripts, CRM exports — the more context the better</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{ padding: "8px 16px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: "#fff", color: "rgba(0,0,0,0.5)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            {extracting ? "Reading..." : "📎 Browse Files"}
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" style={{ display: "none" }} onChange={handleFileInput} />
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onClick={() => !extracting && fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragOver ? "#31CE81" : "rgba(0,0,0,0.12)"}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: extracting ? "wait" : "pointer", background: dragOver ? "rgba(49,206,129,0.04)" : "rgba(0,0,0,0.01)", transition: "all 0.2s", marginBottom: docs.length > 0 ? 14 : 0 }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <p style={{ fontSize: 13, fontWeight: 600, color: dragOver ? "#31CE81" : "rgba(0,0,0,0.4)", margin: "0 0 4px" }}>Drag & drop documents here</p>
          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", margin: 0 }}>PDF, DOCX, TXT, CSV supported</p>
        </div>

        {/* Document List */}
        {docs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map(doc => (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(49,206,129,0.04)", border: "1px solid rgba(49,206,129,0.15)", borderRadius: 10 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>📎</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.filename}</div>
                  <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 2 }}>{(doc.content.length / 1000).toFixed(1)}k chars</div>
                </div>
                <select value={doc.docType} onChange={e => updateDocType(doc.id, e.target.value)} onClick={e => e.stopPropagation()} style={{ padding: "5px 8px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, background: "#fff", color: "#1A2B3C", fontSize: 11, outline: "none", fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => removeDoc(doc.id)} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.35)", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ padding: "10px 14px", marginBottom: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onBack} style={{ padding: "10px 20px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "transparent", color: "rgba(0,0,0,0.5)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button
          onClick={generate}
          disabled={!canGenerate}
          style={{ padding: "12px 28px", border: "none", borderRadius: 10, background: canGenerate ? "linear-gradient(135deg, #31CE81, #28B870)" : "rgba(0,0,0,0.07)", color: canGenerate ? "#fff" : "rgba(0,0,0,0.3)", fontSize: 14, fontWeight: 700, cursor: canGenerate ? "pointer" : "default", fontFamily: "inherit" }}
        >
          {generating ? "Analyzing documents..." : "Generate GTM Assessment ✦"}
        </button>
        {generating && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>(~30 seconds)</span>}
      </div>
    </div>
  );
}

// ==================== REPORT PAGE ====================
function ReportPage({ report, onBack }) {
  const analysis = report?.ai_analysis || {};
  const [expandedDim, setExpandedDim] = useState(null);
  const [activeWave, setActiveWave] = useState("wave1");

  const dimConfig = {
    gtm_strategy: { label: "GTM Strategy", icon: "🎯", color: "#6366f1" },
    tof: { label: "Top of Funnel", icon: "📣", color: "#0ea5e9" },
    sales_readiness: { label: "Sales Readiness", icon: "📞", color: "#31CE81" },
    enablement: { label: "Sales Enablement", icon: "📄", color: "#3b82f6" },
    revops: { label: "RevOps", icon: "📊", color: "#8b5cf6" },
    hiring: { label: "Hiring", icon: "👥", color: "#ec4899" },
    metrics: { label: "Metrics", icon: "📈", color: "#f59e0b" },
  };

  const sevColor = (s) => s === "critical" ? "#ef4444" : s === "high" ? "#f97316" : "#eab308";
  const sevBg = (s) => s === "critical" ? "rgba(239,68,68,0.08)" : s === "high" ? "rgba(249,115,22,0.08)" : "rgba(234,179,8,0.08)";
  const findingColor = (t) => t === "critical" ? "#ef4444" : t === "warning" ? "#f97316" : "#22c55e";
  const findingBg = (t) => t === "critical" ? "rgba(239,68,68,0.06)" : t === "warning" ? "rgba(249,115,22,0.06)" : "rgba(34,197,94,0.06)";
  const findingBorder = (t) => t === "critical" ? "rgba(239,68,68,0.2)" : t === "warning" ? "rgba(249,115,22,0.2)" : "rgba(34,197,94,0.2)";

  const execSummary = analysis.executive_summary || {};
  const dimensions = analysis.dimensions || [];
  const priorityGaps = analysis.priority_gaps || [];
  const sow = analysis.scope_of_work || {};
  const waves = [
    { key: "wave1", icon: "🚀", label: "Quick Wins", timeline: "0-30 days" },
    { key: "wave2", icon: "📋", label: "Strategic Initiatives", timeline: "30-90 days" },
    { key: "wave3", icon: "🔄", label: "Transformation", timeline: "90-180 days" },
  ].filter(w => sow[w.key]);

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show-all { display: block !important; }
          body { background: white !important; font-family: 'DM Sans', system-ui, sans-serif; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: "transparent", color: "rgba(0,0,0,0.55)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: "#fff", color: "rgba(0,0,0,0.55)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>🖨 Print Report</button>
      </div>

      {/* ── SECTION 1: Executive Summary ── */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "28px 32px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: execSummary.top_findings?.length ? 24 : 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#31CE81", fontWeight: 700, marginBottom: 8 }}>GTM Assessment Report</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1A2B3C", margin: "0 0 4px", lineHeight: 1.15 }}>{report.client}</h1>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginBottom: 16 }}>
              {report.report_date && new Date(report.report_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {report.document_sources?.length > 0 && ` · ${report.document_sources.length} document${report.document_sources.length !== 1 ? "s" : ""} analyzed`}
            </div>
            {execSummary.headline && <p style={{ fontSize: 17, fontWeight: 700, color: "#1A2B3C", margin: "0 0 12px", lineHeight: 1.45, fontStyle: "italic" }}>"{execSummary.headline}"</p>}
            {execSummary.narrative && <p style={{ fontSize: 14, color: "rgba(0,0,0,0.6)", margin: 0, lineHeight: 1.7 }}>{execSummary.narrative}</p>}
          </div>
          {analysis.overall_score != null && (
            <div style={{ flexShrink: 0, textAlign: "center" }}>
              <CircularScore score={analysis.overall_score} size={120} strokeWidth={8} label="overall" />
              <div style={{ marginTop: 8 }}><AuditStatusBadge score={analysis.overall_score} /></div>
            </div>
          )}
        </div>
        {execSummary.top_findings?.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {execSummary.top_findings.map((f, i) => (
              <div key={i} style={{ padding: "14px 16px", background: findingBg(f.type), border: `1px solid ${findingBorder(f.type)}`, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>{f.type === "critical" ? "🔴" : f.type === "warning" ? "🟡" : "🟢"}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: findingColor(f.type), textTransform: "uppercase", letterSpacing: 0.5 }}>{f.type}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", marginBottom: 4 }}>{f.title}</div>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", margin: 0, lineHeight: 1.5 }}>{f.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 2: GTM Diagnostic ── */}
      {dimensions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "rgba(0,0,0,0.4)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1.5 }}>GTM Diagnostic</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {dimensions.map(dim => {
              const cfg = dimConfig[dim.id] || { label: dim.label, icon: "📊", color: "#6366f1" };
              const isExpanded = expandedDim === dim.id;
              const statusColor = dim.score < 40 ? "#ef4444" : dim.score < 50 ? "#f97316" : dim.score < 65 ? "#eab308" : dim.score < 80 ? "#22c55e" : "#31CE81";
              return (
                <div key={dim.id} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
                  <div onClick={() => setExpandedDim(isExpanded ? null : dim.id)} style={{ padding: "16px 18px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: cfg.color + "15", border: `1px solid ${cfg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{cfg.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C" }}>{dim.label}</div>
                          <AuditStatusBadge score={dim.score} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: statusColor, fontFamily: "'Space Mono', monospace" }}>{dim.score}%</div>
                        <div style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</div>
                      </div>
                    </div>
                    {dim.summary && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", margin: 0, lineHeight: 1.55 }}>{dim.summary}</p>}
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                      {dim.evidence && (
                        <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, margin: "14px 0" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Evidence from Documents</div>
                          <p style={{ fontSize: 12, color: "rgba(0,0,0,0.6)", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>{dim.evidence}</p>
                        </div>
                      )}
                      {dim.sub_scores?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Sub-Scores</div>
                          {dim.sub_scores.map((ss, i) => {
                            const ssColor = ss.score < 40 ? "#ef4444" : ss.score < 50 ? "#f97316" : ss.score < 65 ? "#eab308" : ss.score < 80 ? "#22c55e" : "#31CE81";
                            return (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, color: "#1A2B3C" }}>{ss.category}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: ssColor, fontFamily: "'Space Mono', monospace" }}>{ss.score}%</span>
                                </div>
                                <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 3 }}>
                                  <div style={{ width: `${ss.score}%`, height: "100%", background: ssColor, borderRadius: 3 }} />
                                </div>
                                {ss.note && <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: "3px 0 0", lineHeight: 1.4 }}>{ss.note}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {dim.key_gaps?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Key Gaps</div>
                          {dim.key_gaps.map((gap, i) => (
                            <div key={i} style={{ padding: "8px 12px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 8, marginBottom: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1A2B3C", marginBottom: 4 }}>{gap.title}</div>
                              <div style={{ fontSize: 11, color: "#2563eb" }}>→ {gap.fix}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SECTION 3: Priority Gaps ── */}
      {priorityGaps.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "rgba(0,0,0,0.4)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.5 }}>Priority Gaps</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {priorityGaps.map((gap, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: sevBg(gap.severity), border: `1px solid ${sevColor(gap.severity)}30`, borderRadius: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 22, color: sevColor(gap.severity), fontFamily: "'Space Mono', monospace", lineHeight: 1, flexShrink: 0, paddingTop: 2 }}>{gap.rank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C" }}>{gap.title}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: sevBg(gap.severity), color: sevColor(gap.severity), fontWeight: 700, border: `1px solid ${sevColor(gap.severity)}30`, textTransform: "uppercase", letterSpacing: 0.5 }}>{gap.severity}</span>
                    {gap.dimension && dimConfig[gap.dimension] && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(0,0,0,0.04)", color: "rgba(0,0,0,0.5)", fontWeight: 600 }}>{dimConfig[gap.dimension].label}</span>}
                  </div>
                  {gap.business_impact && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.6)", margin: "0 0 6px", lineHeight: 1.55 }}>{gap.business_impact}</p>}
                  {gap.root_cause && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: "0 0 8px", lineHeight: 1.5 }}>Root cause: {gap.root_cause}</p>}
                  {gap.fix && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: 0.5 }}>Fix</span>
                      <span style={{ fontSize: 12, color: "#2563eb" }}>{gap.fix}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 4: Scope of Work ── */}
      {waves.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "rgba(0,0,0,0.4)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.5 }}>Scope of Work</h2>

          {/* Wave Tabs */}
          <div className="no-print" style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(0,0,0,0.03)", borderRadius: 10, padding: 4 }}>
            {waves.map(w => (
              <button key={w.key} onClick={() => setActiveWave(w.key)} style={{ flex: 1, padding: "8px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: activeWave === w.key ? "#fff" : "transparent", color: activeWave === w.key ? "#1A2B3C" : "rgba(0,0,0,0.45)", fontFamily: "inherit", boxShadow: activeWave === w.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                <div style={{ fontSize: 12, fontWeight: activeWave === w.key ? 700 : 500 }}>{w.icon} {w.label}</div>
                <div style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", marginTop: 2 }}>{w.timeline}</div>
              </button>
            ))}
          </div>

          {/* Active wave content (tabs on screen, all waves on print) */}
          {waves.map(w => (
            <div key={w.key} className={activeWave !== w.key ? "no-print" : ""} style={{ display: activeWave === w.key ? "block" : "none" }}>
              {/* Print header */}
              <div className="print-show-all" style={{ display: "none", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C" }}>{w.icon} {w.label}</span>
                <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginLeft: 8 }}>{w.timeline}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(sow[w.key]?.initiatives || []).map((init, i) => {
                  const effortColor = init.effort === "High" ? "#f97316" : init.effort === "Medium" ? "#eab308" : "#22c55e";
                  const impactColor = init.impact === "High" ? "#6366f1" : init.impact === "Medium" ? "#0ea5e9" : "#64748b";
                  return (
                    <div key={i} style={{ padding: "16px 18px", background: "#f8fafc", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C" }}>{init.title}</div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {init.owner && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: "rgba(99,102,241,0.08)", color: "#6366f1", fontWeight: 700, border: "1px solid rgba(99,102,241,0.2)" }}>{init.owner}</span>}
                          {init.effort && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: effortColor + "15", color: effortColor, fontWeight: 700 }}>Effort: {init.effort}</span>}
                          {init.impact && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: impactColor + "15", color: impactColor, fontWeight: 700 }}>Impact: {init.impact}</span>}
                        </div>
                      </div>
                      {init.description && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", margin: "0 0 8px", lineHeight: 1.55 }}>{init.description}</p>}
                      {init.success_metric && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#31CE81", textTransform: "uppercase", letterSpacing: 0.5 }}>✓ Success</span>
                          <span style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>{init.success_metric}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print footer */}
      <div style={{ textAlign: "center", padding: "16px 0 8px", fontSize: 11, color: "rgba(0,0,0,0.3)" }}>
        Generated by CUOTA/ GTM Assessment Platform
      </div>
    </div>
  );
}

// ==================== DOC SYNC PAGE ====================
function parseNotionId(input) {
  const clean = (input || "").replace(/-/g, "");
  const match = clean.match(/[a-f0-9]{32}/i);
  if (!match) return null;
  const h = match[0].toLowerCase();
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function parseGDriveId(url) {
  url = url || "";
  const folder = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folder) return { id: folder[1], type: "folder" };
  const file = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (file) return { id: file[1], type: "file" };
  return null;
}

function DocSyncPage({ getValidToken, clients, onDocsUpdate }) {
  const blank = { loading: true, connected: false, sources: [], last_synced_at: null, synced_count: 0 };
  const [notion, setNotion] = useState({ ...blank });
  const [gdrive, setGdrive] = useState({ ...blank });
  const [notionToken, setNotionToken] = useState("");
  const [connecting, setConnecting] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [errors, setErrors] = useState({});
  const [successes, setSuccesses] = useState({});
  const [addingTo, setAddingTo] = useState(null); // 'notion' | 'gdrive'
  const [newSrc, setNewSrc] = useState({ url: "", name: "", client: "", docType: "playbook", type: "page" });
  const [addErr, setAddErr] = useState("");

  const setErr = (k, v) => setErrors(e => ({ ...e, [k]: v }));
  const setOk = (k, v) => setSuccesses(s => ({ ...s, [k]: v }));

  useEffect(() => {
    // Check for GDrive OAuth callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get("gdrive_connected") === "1") setOk("gdrive", "Google Drive connected!");
    if (params.get("gdrive_error")) setErr("gdrive", `Connection failed: ${params.get("gdrive_error")}`);
    loadStatus("notion");
    loadStatus("gdrive");
  }, []);

  async function loadStatus(provider) {
    try {
      const t = await getValidToken();
      const r = await fetch(`/api/${provider}/sync`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (provider === "notion") setNotion(prev => ({ ...prev, loading: false, ...data }));
      else setGdrive(prev => ({ ...prev, loading: false, ...data }));
    } catch {
      if (provider === "notion") setNotion(prev => ({ ...prev, loading: false }));
      else setGdrive(prev => ({ ...prev, loading: false }));
    }
  }

  async function connectNotion() {
    if (!notionToken.trim()) return;
    setConnecting("notion"); setErr("notion", "");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ action: "connect", token: notionToken.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Connection failed");
      setNotionToken("");
      setOk("notion", `Connected to ${data.workspace}`);
      await loadStatus("notion");
    } catch (e) { setErr("notion", e.message); }
    setConnecting(null);
  }

  async function connectGDrive() {
    setErr("gdrive", "");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/gdrive/sync?action=auth_url", { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      window.location.href = data.url;
    } catch (e) { setErr("gdrive", e.message); }
  }

  async function disconnect(provider) {
    if (!window.confirm(`Disconnect ${provider === "notion" ? "Notion" : "Google Drive"}? Synced documents will remain.`)) return;
    try {
      const t = await getValidToken();
      await fetch(`/api/${provider}/sync`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      if (provider === "notion") setNotion({ ...blank, loading: false });
      else setGdrive({ ...blank, loading: false });
    } catch (e) { setErr(provider, e.message); }
  }

  async function sync(provider) {
    setSyncing(provider); setErr(provider, ""); setOk(provider, "");
    try {
      const t = await getValidToken();
      const r = await fetch(`/api/${provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Sync failed");
      setOk(provider, `Synced ${data.syncedCount} document${data.syncedCount !== 1 ? "s" : ""}`);
      await loadStatus(provider);
      onDocsUpdate?.();
    } catch (e) { setErr(provider, e.message); }
    setSyncing(null);
  }

  async function addSource(provider) {
    setAddErr("");
    const isNotion = provider === "notion";
    let source;
    if (isNotion) {
      const id = parseNotionId(newSrc.url);
      if (!id) { setAddErr("Invalid Notion URL or page ID"); return; }
      source = { id, type: newSrc.type, name: newSrc.name || id, client: newSrc.client, docType: newSrc.docType };
    } else {
      const parsed = parseGDriveId(newSrc.url);
      if (!parsed) { setAddErr("Invalid Google Drive URL"); return; }
      source = { ...parsed, name: newSrc.name || parsed.id, client: newSrc.client, docType: newSrc.docType };
    }
    const current = isNotion ? notion.sources : gdrive.sources;
    const sources = [...current, source];
    try {
      const t = await getValidToken();
      const r = await fetch(`/api/${provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ action: "update_sources", sources }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Save failed");
      if (isNotion) setNotion(n => ({ ...n, sources }));
      else setGdrive(g => ({ ...g, sources }));
      setAddingTo(null);
      setNewSrc({ url: "", name: "", client: "", docType: "playbook", type: "page" });
    } catch (e) { setAddErr(e.message); }
  }

  async function removeSource(provider, idx) {
    const isNotion = provider === "notion";
    const sources = (isNotion ? notion.sources : gdrive.sources).filter((_, i) => i !== idx);
    try {
      const t = await getValidToken();
      await fetch(`/api/${provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ action: "update_sources", sources }),
      });
      if (isNotion) setNotion(n => ({ ...n, sources }));
      else setGdrive(g => ({ ...g, sources }));
    } catch (e) { setErr(provider, e.message); }
  }

  const docTypeOptions = ENABLEMENT_DOC_TYPES.map(t => ({ value: t.id, label: t.name }));

  const ProviderCard = ({ provider, state, icon, name, color, accent, connectForm, identifierLabel, identifierPlaceholder, extraSourceFields }) => {
    const isNotion = provider === "notion";
    return (
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2B3C" }}>{name}</div>
              {state.connected && <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 1 }}>
                {isNotion ? (state.workspace || "Connected") : (state.email || "Connected")}
                {state.last_synced_at && ` · Last synced ${new Date(state.last_synced_at).toLocaleDateString()}`}
              </div>}
            </div>
          </div>
          {state.connected ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => sync(provider)} disabled={syncing === provider} style={{ padding: "7px 14px", border: "none", borderRadius: 8, background: color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {syncing === provider ? "Syncing..." : "↺ Sync Now"}
              </button>
              <button onClick={() => disconnect(provider)} style={{ padding: "7px 12px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, background: "transparent", color: "rgba(0,0,0,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Disconnect</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Not connected</span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          {errors[provider] && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{errors[provider]}</div>}
          {successes[provider] && <div style={{ background: "rgba(49,206,129,0.08)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#31CE81", marginBottom: 12 }}>{successes[provider]}</div>}

          {/* Connect form if not connected */}
          {!state.connected && !state.loading && connectForm}

          {/* Sources list */}
          {state.connected && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                {identifierLabel}s to sync {state.synced_count > 0 && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "rgba(0,0,0,0.4)" }}>· {state.synced_count} docs synced</span>}
              </div>
              {state.sources.length === 0 && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", margin: "0 0 12px" }}>No sources added yet. Click "+ Add Source" to connect a {identifierLabel.toLowerCase()}.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {state.sources.map((src, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, padding: "9px 12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 1 }}>
                        {src.type === "folder" ? "Folder" : src.type === "database" ? "Database" : "Page"} · {src.client || "No client"} · {ENABLEMENT_DOC_TYPES.find(t => t.id === src.docType)?.name || src.docType}
                      </div>
                    </div>
                    <button onClick={() => removeSource(provider, i)} style={{ background: "none", border: "none", color: "rgba(0,0,0,0.3)", fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>

              {addingTo === provider ? (
                <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 5 }}>{identifierLabel} URL or ID</label>
                      <input value={newSrc.url} onChange={e => setNewSrc(s => ({ ...s, url: e.target.value }))} placeholder={identifierPlaceholder} style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 5 }}>Display Name</label>
                      <input value={newSrc.name} onChange={e => setNewSrc(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Sales Playbook" style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    {extraSourceFields}
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 5 }}>Client</label>
                      <select value={newSrc.client} onChange={e => setNewSrc(s => ({ ...s, client: e.target.value }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }}>
                        <option value="">All clients</option>
                        {clients.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 5 }}>Document Type</label>
                      <select value={newSrc.docType} onChange={e => setNewSrc(s => ({ ...s, docType: e.target.value }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }}>
                        {docTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {addErr && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{addErr}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => addSource(provider)} style={{ padding: "7px 16px", border: "none", borderRadius: 7, background: color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
                    <button onClick={() => { setAddingTo(null); setAddErr(""); }} style={{ padding: "7px 12px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, background: "#fff", color: "rgba(0,0,0,0.5)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddingTo(provider); setAddErr(""); setNewSrc({ url: "", name: "", client: "", docType: "playbook", type: isNotion ? "page" : "file" }); }} style={{ padding: "7px 14px", border: `1px dashed ${color}`, borderRadius: 8, background: "transparent", color, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add Source</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: "0 0 4px" }}>Document Sources</h2>
        <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>Connect Notion and Google Drive to automatically sync documents into client profiles</p>
      </div>

      {/* Notion */}
      <ProviderCard
        provider="notion" state={notion} icon="◻" name="Notion" color="#000" accent="rgba(0,0,0,0.06)"
        identifierLabel="Page"
        identifierPlaceholder="https://notion.so/... or page ID"
        extraSourceFields={
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "rgba(0,0,0,0.35)", display: "block", marginBottom: 5 }}>Source Type</label>
            <select value={newSrc.type} onChange={e => setNewSrc(s => ({ ...s, type: e.target.value }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }}>
              <option value="page">Page</option>
              <option value="database">Database (all pages)</option>
            </select>
          </div>
        }
        connectForm={
          <div>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: "0 0 12px", lineHeight: 1.6 }}>
              Create a Notion integration at <strong>notion.so/my-integrations</strong>, then share your pages with it. Paste the Internal Integration Token below.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={notionToken} onChange={e => setNotionToken(e.target.value)} placeholder="secret_xxxx..." type="password" style={{ flex: 1, padding: "9px 12px", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
              <button onClick={connectNotion} disabled={connecting === "notion" || !notionToken.trim()} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "#000", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {connecting === "notion" ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        }
      />

      {/* Google Drive */}
      <ProviderCard
        provider="gdrive" state={gdrive} icon="▲" name="Google Drive" color="#1a73e8" accent="rgba(26,115,232,0.08)"
        identifierLabel="File/Folder"
        identifierPlaceholder="https://drive.google.com/..."
        extraSourceFields={null}
        connectForm={
          <div>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: "0 0 12px", lineHeight: 1.6 }}>
              Connect your Google Drive account to sync Google Docs and text files. Requires <strong>GOOGLE_CLIENT_ID</strong> and <strong>GOOGLE_CLIENT_SECRET</strong> set in Vercel environment variables.
            </p>
            <button onClick={connectGDrive} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: "#1a73e8", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Connect Google Drive
            </button>
          </div>
        }
      />

      {/* Setup notes */}
      <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, padding: "14px 16px", fontSize: 12, color: "rgba(0,0,0,0.45)", lineHeight: 1.7 }}>
        <strong style={{ color: "rgba(0,0,0,0.6)" }}>Setup notes</strong><br />
        <strong>Notion:</strong> Go to notion.so/my-integrations → New integration → copy the token → share each page with the integration (Share → Connections → your integration name).<br />
        <strong>Google Drive:</strong> Set <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>GOOGLE_CLIENT_ID</code>, <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>GOOGLE_CLIENT_SECRET</code>, and <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>GDRIVE_REDIRECT_URI=https://your-app.vercel.app/api/gdrive/sync</code> in Vercel project settings. Create OAuth credentials at console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application), add the redirect URI above.<br />
        <strong>Supported file types:</strong> Google Docs, plain text, Markdown. PDFs and other formats are skipped (use the manual upload in Enablement instead).
      </div>
    </div>
  );
}

export default function CuotaCallReview() {
  const [session, setSession] = useState(() => loadStored("cuota_session"));
  const [profile, setProfile] = useState(() => loadStored("cuota_profile"));
  const [page, setPage] = useState("home");
  const [savedCalls, setSavedCalls] = useState([]);
  const [enablementDocs, setEnablementDocs] = useState([]);
  const [crmSnapshots, setCrmSnapshots] = useState([]);
  const [gtmAssessments, setGtmAssessments] = useState([]);
  const [tofAssessments, setTofAssessments] = useState([]);
  const [hiringAssessments, setHiringAssessments] = useState([]);
  const [metricsAssessments, setMetricsAssessments] = useState([]);
  const [gtmReports, setGtmReports] = useState([]);
  const [currentReport, setCurrentReport] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [folderClient, setFolderClient] = useState(null);
  const [folderAE, setFolderAE] = useState(null);
  const [clients, setClients] = useState(loadClients);
  const [pastClients, setPastClients] = useState(loadPastClients);
  const [selectedClientProfile, setSelectedClientProfile] = useState(null);

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

  const archiveClient = useCallback((name) => {
    setClients(prev => {
      const next = prev.filter(c => c !== name);
      saveClients(next);
      return next;
    });
    setPastClients(prev => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      savePastClients(next);
      return next;
    });
  }, []);

  const restoreClient = useCallback((name) => {
    setPastClients(prev => {
      const next = prev.filter(c => c !== name);
      savePastClients(next);
      return next;
    });
    setClients(prev => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      saveClients(next);
      return next;
    });
  }, []);

  // Gong integration state — string (client name) or null
  const [gongSettingsClient, setGongSettingsClient] = useState(null);
  const [gongSyncClient, setGongSyncClient] = useState(null);

  // Review state
  const [callInfo, setCallInfo] = useState({ client: "", repName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "", repType: "AE" });
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

  // Load enablement docs
  const loadDocs = useCallback(async () => {
    const validToken = await getValidToken();
    if (!validToken) return;
    try {
      const table = await supabase.from("enablement_docs", validToken);
      const data = await table.select("*");
      if (Array.isArray(data)) setEnablementDocs(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (e) {
      console.warn("Enablement docs not available:", e.message);
    }
  }, [getValidToken]);

  // Load CRM snapshots
  const loadCrmSnapshots = useCallback(async () => {
    const validToken = await getValidToken();
    if (!validToken) return;
    try {
      const table = await supabase.from("crm_snapshots", validToken);
      const data = await table.select("*");
      if (Array.isArray(data)) setCrmSnapshots(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (e) {
      console.warn("CRM snapshots not available:", e.message);
    }
  }, [getValidToken]);

  const loadGtmAssessments = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try { const data = await (await supabase.from("gtm_assessments", t)).select("*"); if (Array.isArray(data)) setGtmAssessments(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); } catch (e) { console.warn("GTM assessments not available:", e.message); }
  }, [getValidToken]);

  const loadTofAssessments = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try { const data = await (await supabase.from("tof_assessments", t)).select("*"); if (Array.isArray(data)) setTofAssessments(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); } catch (e) { console.warn("TOF assessments not available:", e.message); }
  }, [getValidToken]);

  const loadHiringAssessments = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try { const data = await (await supabase.from("hiring_assessments", t)).select("*"); if (Array.isArray(data)) setHiringAssessments(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); } catch (e) { console.warn("Hiring assessments not available:", e.message); }
  }, [getValidToken]);

  const loadMetricsAssessments = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try { const data = await (await supabase.from("metrics_assessments", t)).select("*"); if (Array.isArray(data)) setMetricsAssessments(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); } catch (e) { console.warn("Metrics assessments not available:", e.message); }
  }, [getValidToken]);

  const loadGtmReports = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try { const data = await (await supabase.from("gtm_reports", t)).select("*"); if (Array.isArray(data)) setGtmReports(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); } catch (e) { console.warn("GTM reports not available:", e.message); }
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

  // Handle OAuth callbacks (e.g. Google Drive redirect back to app)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gdrive_connected") === "1" || params.get("gdrive_error")) {
      window.history.replaceState({}, "", window.location.pathname);
      setPage("docsync");
    }
  }, []);

  // Load all data whenever token changes
  useEffect(() => {
    if (token) {
      Promise.all([loadCalls(), loadDocs(), loadCrmSnapshots(), loadGtmAssessments(), loadTofAssessments(), loadHiringAssessments(), loadMetricsAssessments(), loadGtmReports()]).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, [token, loadCalls, loadDocs, loadCrmSnapshots, loadGtmAssessments, loadTofAssessments, loadHiringAssessments, loadMetricsAssessments, loadGtmReports]);

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
    setEnablementDocs([]);
    setCrmSnapshots([]);
    setGtmAssessments([]);
    setTofAssessments([]);
    setHiringAssessments([]);
    setMetricsAssessments([]);
    setGtmReports([]);
    setCurrentReport(null);
    setPage("home");
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
        category_scores: { ...scores, rep_name: callInfo.repName, prospect_name: aiAnalysis?.metadata?.prospect_name || "", client: callInfo.client, rep_type: callInfo.repType || "AE" },
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
    setCallInfo({ client: call.category_scores?.client || "", repName: call.category_scores?.rep_name || "", prospectCompany: call.prospect_company || "", callDate: call.call_date || "", callType: call.call_type || "Discovery", dealStage: call.deal_stage || "Early", dealValue: call.deal_value || "", repType: call.category_scores?.rep_type || "AE" });
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
    setCallInfo({ client: "", repName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "", repType: "AE" });
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
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(0,0,0,0.08)", padding: "0 24px", display: "flex", alignItems: "center", gap: 8, height: 56 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#1A2B3C", letterSpacing: 1.5, marginRight: 8, flexShrink: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>CUOTA<span style={{ color: "#31CE81" }}>/</span></span>

        {/* Home */}
        <button onClick={() => setPage("home")} style={{ padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: page === "home" ? "rgba(0,0,0,0.06)" : "transparent", color: page === "home" ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
          ◼ Home
        </button>

        {/* New Assessment CTA */}
        <button onClick={() => { setPage("intake"); }} style={{ padding: "7px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, background: page === "intake" || page === "report" ? "linear-gradient(135deg, #28B870, #22a062)" : "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
          + New Assessment
        </button>

        {/* Call Reviews direct link */}
        <button onClick={() => { setPage("calls"); setFolderClient(null); setFolderAE(null); }} style={{ padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: page === "calls" || page === "review" ? "rgba(0,0,0,0.06)" : "transparent", color: page === "calls" || page === "review" ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
          📞 Call Reviews {savedCalls.length > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "rgba(49,206,129,0.15)", color: "#31CE81" }}>{savedCalls.length}</span>}
        </button>

        {/* Audit dropdown */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setNavOpen(o => !o)} style={{ padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: ["gtm","tof","calls","enablement","crm","hiring","metrics"].includes(page) ? "rgba(0,0,0,0.06)" : "transparent", color: ["gtm","tof","calls","enablement","crm","hiring","metrics"].includes(page) ? "#1A2B3C" : "rgba(0,0,0,0.35)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            📋 Sections <span style={{ fontSize: 10, opacity: 0.6 }}>{navOpen ? "▲" : "▼"}</span>
          </button>
          {navOpen && (
            <div onMouseLeave={() => setNavOpen(false)} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, minWidth: 210, padding: "6px 0" }}>
              {[
                { id: "gtm", label: "GTM Strategy", icon: "🎯" },
                { id: "tof", label: "Top of Funnel", icon: "📣" },
                { id: "calls", label: "Sales Readiness", icon: "📞", badge: savedCalls.length },
                { id: "enablement", label: "Sales Enablement", icon: "📄" },
                { id: "crm", label: "RevOps", icon: "📊" },
                { id: "hiring", label: "Hiring", icon: "👥" },
                { id: "metrics", label: "Metrics", icon: "📈" },
              ].map(nav => (
                <button key={nav.id} onClick={() => { setPage(nav.id); setNavOpen(false); if (nav.id === "calls") { setFolderClient(null); setFolderAE(null); } }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", border: "none", background: page === nav.id ? "rgba(0,0,0,0.04)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: page === nav.id ? 700 : 500, color: page === nav.id ? "#1A2B3C" : "rgba(0,0,0,0.65)", fontFamily: "inherit", textAlign: "left", boxSizing: "border-box" }}>
                  <span style={{ width: 20, textAlign: "center" }}>{nav.icon}</span>
                  <span style={{ flex: 1 }}>{nav.label}</span>
                  {nav.badge > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "rgba(74,222,128,0.15)", color: "#31CE81" }}>{nav.badge}</span>}
                </button>
              ))}
              {profile?.role === "admin" && (
                <>
                  <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "6px 0" }} />
                  {[{ id: "integrations", label: "Integrations", icon: "⚙️" }, { id: "docsync", label: "Document Sources", icon: "🔄" }, { id: "admin", label: "Admin", icon: "👑" }].map(nav => (
                    <button key={nav.id} onClick={() => { setPage(nav.id); setNavOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", border: "none", background: page === nav.id ? "rgba(0,0,0,0.04)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: page === nav.id ? 700 : 500, color: page === nav.id ? "#1A2B3C" : "rgba(0,0,0,0.65)", fontFamily: "inherit", textAlign: "left", boxSizing: "border-box" }}>
                      <span style={{ width: 20, textAlign: "center" }}>{nav.icon}</span>
                      <span>{nav.label}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />
        {(profile?.role === "manager" || profile?.role === "admin") && <button onClick={() => setShowInvite(true)} style={{ padding: "6px 12px", border: "1px solid rgba(49,206,129,0.3)", borderRadius: 8, background: "rgba(49,206,129,0.08)", color: "#31CE81", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Invite</button>}
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", flexShrink: 0 }}>{session.user?.email}</span>
        <button onClick={handleLogout} style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, background: "transparent", color: "rgba(0,0,0,0.45)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Logout</button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {/* HOME PAGE — Executive Summary */}
        {page === "home" && <HomePage savedCalls={savedCalls} enablementDocs={enablementDocs} crmSnapshots={crmSnapshots} gtmAssessments={gtmAssessments} tofAssessments={tofAssessments} hiringAssessments={hiringAssessments} metricsAssessments={metricsAssessments} clients={clients} onNavigate={(p) => { setPage(p); if (p === "calls") { setFolderClient(null); setFolderAE(null); } }} onClientClick={(c) => { setSelectedClientProfile(c); setPage("client"); }} />}

        {/* INTAKE PAGE — New Assessment */}
        {page === "intake" && <IntakePage clients={clients} getValidToken={getValidToken} profile={profile} onBack={() => setPage("home")} onReportGenerated={(report) => { setCurrentReport(report); setPage("report"); loadGtmReports(); }} />}

        {/* REPORT PAGE — Full GTM Assessment Report */}
        {page === "report" && currentReport && <ReportPage report={currentReport} onBack={() => setPage("home")} />}

        {/* GTM STRATEGY */}
        {page === "gtm" && <GtmStrategyPage assessments={gtmAssessments} getValidToken={getValidToken} profile={profile} clients={clients} onUpdate={loadGtmAssessments} />}

        {/* TOP OF FUNNEL */}
        {page === "tof" && <TopOfFunnelPage assessments={tofAssessments} getValidToken={getValidToken} profile={profile} clients={clients} onUpdate={loadTofAssessments} />}

        {/* CLIENT PROFILE */}
        {page === "client" && selectedClientProfile && <ClientProfilePage
          client={selectedClientProfile}
          savedCalls={savedCalls}
          enablementDocs={enablementDocs}
          onBack={() => { setPage("calls"); setSelectedClientProfile(null); setFolderClient(null); setFolderAE(null); }}
          onViewCall={(call) => { loadCallIntoReview(call); }}
          onBrowseByRep={() => { setPage("calls"); setFolderClient(selectedClientProfile); setFolderAE(null); }}
          onNavigate={(p) => setPage(p)}
        />}

        {/* SALES READINESS */}
        {page === "calls" && <SavedCallsList calls={savedCalls} onSelect={loadCallIntoReview} onNewCall={startNewReview} folderClient={folderClient} setFolderClient={setFolderClient} folderAE={folderAE} setFolderAE={setFolderAE} error={callsError} onRetry={loadCalls} clients={clients} onAddClient={addClient} onDeleteClient={deleteClient} pastClients={pastClients} onArchiveClient={archiveClient} onRestoreClient={restoreClient} onClientClick={(c) => { setSelectedClientProfile(c); setPage("client"); }} />}

        {/* SALES ENABLEMENT */}
        {page === "enablement" && <EnablementPage docs={enablementDocs} getValidToken={getValidToken} profile={profile} clients={clients} onDocsUpdate={loadDocs} />}

        {/* REVOPS */}
        {page === "crm" && <CrmPage snapshots={crmSnapshots} getValidToken={getValidToken} profile={profile} clients={clients} onSnapshotsUpdate={loadCrmSnapshots} />}

        {/* HIRING */}
        {page === "hiring" && <SalesHiringPage assessments={hiringAssessments} getValidToken={getValidToken} profile={profile} clients={clients} onUpdate={loadHiringAssessments} />}

        {/* METRICS */}
        {page === "metrics" && <MetricsPage assessments={metricsAssessments} getValidToken={getValidToken} profile={profile} clients={clients} onUpdate={loadMetricsAssessments} />}

        {page === "integrations" && profile?.role === "admin" && <IntegrationsPage getValidToken={getValidToken} token={token} loadCalls={loadCalls} clients={clients} />}
        {page === "docsync" && profile?.role === "admin" && <DocSyncPage getValidToken={getValidToken} clients={[...clients, ...pastClients]} onDocsUpdate={loadDocs} />}
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
                  { key: "repType", label: "Rep Type", options: ["AE", "SDR"] },
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
                <FileDropZone value={transcript} onChange={setTranscript} placeholder="Paste your call transcript here, or drag and drop a file — .txt, .vtt, .srt, .pdf, .docx supported..." minHeight={350} accept=".txt,.vtt,.srt,.md,.pdf,.docx" />
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

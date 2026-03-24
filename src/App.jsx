import { useState, useEffect, useCallback, useRef } from "react";
import Dashboard from "./components/Dashboard.tsx";
import ClientsPage from "./components/ClientsPage.tsx";
import RepDetailPage from "./components/RepDetailPage.tsx";

const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmbG1ycXRwZHJobnl2b2txdXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTU0OTUsImV4cCI6MjA4NjQzMTQ5NX0.66eeDUOONigyN3YG2JfqvCjrLe9m5a4ipBhp8TXZOms";

// Quarterly quota targets per rep (target in USD, closed = current attainment)
const REP_QUOTAS = {
  "Juan Manuel Bello": { target: 500000, closed: 460000 },
};

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
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || body.error || `Delete from ${table} failed (${r.status})`);
        }
        return true;
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

const SDR_CATEGORIES = [
  { id: "call_opener", name: "Call Opener" },
  { id: "product_pitch", name: "Product Pitch" },
  { id: "qualification", name: "Qualification" },
  { id: "call_to_action", name: "Call to Action" },
  { id: "objection_handling", name: "Objection Handling" },
];

function getCategories(repType) {
  return repType === "SDR" ? SDR_CATEGORIES : CATEGORIES;
}

// Old category IDs for backward compatibility detection
const OLD_CATEGORY_IDS = ["opening", "qualification", "storytelling", "objection", "demo", "multithreading", "nextsteps", "control"];

const RISK_INDICATORS = [
  { id: "meddpicc_gaps", label: "MEDDPICC Gaps", severity: "high" },
  { id: "single_threaded", label: "Single-Threaded Deal", severity: "high" },
  { id: "no_decision_maker", label: "No Access to Decision Maker", severity: "high" },
  { id: "engagement_gap", label: "Time Since Last Call", severity: "medium" },
  { id: "no_next_steps", label: "No Clear Next Steps", severity: "high" },
];

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Paymend", "Planimatik", "Xepelin"];
const DEFAULT_PAST_CLIENTS = ["Rapido"];
const CLIENT_DOMAINS = { "11x": "11x.ai", "Arc": "experiencearc.com", "Diio": "diio.com", "Factor": "factor-labs.com", "Nauta": "getnauta.com", "Paymend": "paymend.com", "Planimatik": "planimatik.com", "Rapido": "rapidosaas.com", "Xepelin": "xepelin.com" };
// Local logo overrides — used instead of Brandfetch when Brandfetch returns the wrong image
const CLIENT_LOGO_OVERRIDES = { "Xepelin": "/logos/xepelin.png", "Factor": "/logos/factor.png" };
function getClientLogo(client) { const domain = CLIENT_DOMAINS[client]; return domain ? `https://cdn.brandfetch.io/${domain}/w/400/h/400` : null; }

// Derive a likely domain from a company name for Brandfetch lookup
function companyDomain(name) {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .replace(/[,.]?\s+(inc\.?|corp\.?|llc\.?|ltd\.?|s\.?a\.?|plc\.?|co\.?|company|technologies|tech|solutions|group|holdings|international|global|services|systems|software|consulting|ventures|capital|partners|labs?|studio s?|gmbh|bv|ag)\.?\s*$/i, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");
  return cleaned ? `${cleaned}.com` : null;
}

// ProspectLogo: shows a company logo for a call's prospect company via Brandfetch
function ProspectLogo({ company, size = 30, borderRadius = 7 }) {
  const domain = companyDomain(company);
  const initials = company ? company.slice(0, 2).toUpperCase() : "?";
  const [failed, setFailed] = useState(false);
  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.37), fontWeight: 700, color: "rgba(255,255,255,0.45)",
      position: "relative", overflow: "hidden",
    }}>
      {initials}
      {domain && !failed && (
        <img
          src={`https://cdn.brandfetch.io/${domain}/w/400/h/400`}
          alt=""
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: 3 }}
        />
      )}
    </div>
  );
}

// ClientLogo: Brandfetch CDN → letter fallback
// Hardcoded CLIENT_DOMAINS takes priority; website prop used for unlisted clients only
function ClientLogo({ client, website, size = 32, style = {}, letterStyle = {} }) {
  // Local override wins first (for clients where Brandfetch returns the wrong logo)
  const localOverride = CLIENT_LOGO_OVERRIDES[client] || null;
  // Hardcoded domain map wins over GTM website — prevents typos breaking logos
  let domain = CLIENT_DOMAINS[client] || null;
  if (!domain && website) {
    try {
      const url = website.startsWith("http") ? website : `https://${website}`;
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
  }
  const [srcIdx, setSrcIdx] = useState(0);
  const sources = [
    localOverride,
    domain ? `https://cdn.brandfetch.io/${domain}/w/400/h/400` : null,
  ].filter(Boolean);
  if (srcIdx >= sources.length) {
    return <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", ...letterStyle }}>{client.charAt(0).toUpperCase()}</span>;
  }
  return <img src={sources[srcIdx]} alt={client} style={{ width: size, height: size, objectFit: "contain", ...style }} onError={() => setSrcIdx(i => i + 1)} />;
}

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

function loadArchivedClients() {
  try {
    const stored = localStorage.getItem("cuota_archived_clients");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.sort((a, b) => a.localeCompare(b));
    }
  } catch {}
  return [];
}

function saveArchivedClients(list) {
  localStorage.setItem("cuota_archived_clients", JSON.stringify(list));
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

function getRepSegment(calls) {
  const valued = calls.filter(c => c.deal_value && Number(c.deal_value) > 0);
  if (valued.length === 0) return null;
  const avg = valued.reduce((s, c) => s + Number(c.deal_value), 0) / valued.length;
  if (avg >= 200000) return "Enterprise";
  if (avg >= 25000) return "Mid-Market";
  return "SMB";
}

function getSegmentColor(seg) {
  if (seg === "Enterprise") return { color: "#7c3aed", bg: "rgba(124,58,237,0.09)" };
  if (seg === "Mid-Market") return { color: "#0369a1", bg: "rgba(3,105,161,0.09)" };
  if (seg === "SMB") return { color: "#15803d", bg: "rgba(21,128,61,0.09)" };
  return { color: "var(--text-2)", bg: "rgba(255,255,255,0.07)" };
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
    if (!bucket) bucket = "Other"; // unmatched calls go to "Other" so they're never lost
    const ae = call.rep_name || call.category_scores?.rep_name || "Unknown";
    if (!groups[bucket]) groups[bucket] = {};
    if (!groups[bucket][ae]) groups[bucket][ae] = [];
    groups[bucket][ae].push(call);
  });
  return groups;
}

function getScoreColor(s) { return s >= 80 ? "#31CE81" : s >= 60 ? "#eab308" : s >= 40 ? "#f97316" : "#ef4444"; }
function getScoreLabel(s) { return s >= 90 ? "Excellent" : s >= 80 ? "Good" : s >= 65 ? "Average" : s >= 50 ? "Needs Work" : "Critical"; }
function getScoreColor10(s) { return s >= 8 ? "#31CE81" : s >= 6 ? "#eab308" : s >= 4 ? "#f97316" : "#ef4444"; }

function CircularScore({ score, size = 120, strokeWidth = 8, label }) {
  const r = (size - strokeWidth) / 2, c = 2 * Math.PI * r, o = c - (score / 100) * c, color = getScoreColor(score);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.3, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{score}</span>
        {label && <span style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>}
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
              <button onClick={clear} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Drop a file or paste text below · PDF, DOCX, TXT, VTT supported</span>
          )}
        </div>
        <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{ padding: "5px 12px", border: "1px solid var(--text-3)", borderRadius: 8, background: "var(--surface)", color: "var(--text-2)", fontSize: 11, fontWeight: 600, cursor: extracting ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          <span>📎</span> Browse file
        </button>
        <input ref={fileInputRef} type="file" accept={accept} style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
      {extractError && <div style={{ marginBottom: 8, padding: "7px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{extractError}</div>}
      <textarea
        value={value}
        onChange={e => { onChange(e.target.value); if (!e.target.value) setFileName(""); }}
        placeholder={placeholder}
        style={{ width: "100%", minHeight, background: dragging ? "rgba(49,206,129,0.02)" : "var(--surface)", border: "1px solid " + (dragging ? "rgba(49,206,129,0.4)" : "var(--border-soft)"), borderRadius: 12, padding: 16, fontSize: 13, color: "var(--text-1)", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.2s" }}
      />
    </div>
  );
}

// ==================== AUTH SCREEN ====================
function AuthScreen({ onAuth, authError = "" }) {
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
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@300;400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      <div style={{ width: 400, padding: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-1)", letterSpacing: 2, fontFamily: "'Syne', system-ui, sans-serif" }}>CUOTA<span style={{ color: "#6366F1" }}>/</span></div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, letterSpacing: 1 }}>GTM Audit Engine</div>
        </div>
        {authError && (
          <div style={{ padding: "12px 16px", marginBottom: 16, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>
            {authError}
          </div>
        )}
        <div className="glass-card" style={{ borderRadius: 16, padding: 28 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--surface)", borderRadius: 10, padding: 4 }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); setMessage(""); }} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, background: mode === m ? "var(--border-soft)" : "transparent", color: mode === m ? "var(--text-1)" : "var(--text-3)", fontFamily: "inherit" }}>{m === "login" ? "Log In" : "Sign Up"}</button>
            ))}
          </div>
          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Javier Ramirez" style={{ width: "100%", padding: "12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={{ width: "100%", padding: "12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", padding: "12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
          {message && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, fontSize: 13, color: "#1a7a42" }}>{message}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px", border: "none", borderRadius: 10, cursor: "pointer", background: "#31CE81", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}>{loading ? "..." : mode === "login" ? "Log In" : "Create Account"}</button>
        </div>
      </div>
    </div>
  );
}

// Returns true if a category details string is a non-answer (N/A, not applicable, cannot determine)
function isNADetail(s) {
  if (!s) return false;
  const lower = s.toLowerCase().trim();
  return lower === "n/a" || lower.startsWith("n/a") || lower.includes("not applicable") || lower.includes("cannot determine") || lower.includes("not applicable") || lower.includes("not discussed") && lower.length < 60;
}

// ==================== CATEGORY BAR ====================
function CategoryBar({ category, scores, onScoreChange }) {
  const cs = scores[category.id] || {};
  const score = cs.score || 0;
  const pct = Math.round((score / 10) * 100);
  const color = getScoreColor10(score);
  return (
    <div style={{ background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border-soft)", padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.3 }}>{category.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={() => onScoreChange(category.id, Math.max(0, score - 1))} style={{ width: 24, height: 24, border: "1px solid var(--text-3)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>−</button>
          <span style={{ width: 26, textAlign: "center", fontSize: 13, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{score}</span>
          <button onClick={() => onScoreChange(category.id, Math.min(10, score + 1))} style={{ width: 24, height: 24, border: "1px solid var(--text-3)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>+</button>
        </div>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
        <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// ==================== SAVED CALLS ====================
function getClientTrend(clientCalls) {
  if (clientCalls.length < 2) return null;
  const sorted = [...clientCalls].sort((a, b) => new Date(b.call_date || b.created_at) - new Date(a.call_date || a.created_at));
  const last = sorted[0].overall_score || 0;
  const prevAvg = sorted.slice(1, 4).reduce((s, c) => s + (c.overall_score || 0), 0) / Math.min(sorted.length - 1, 3);
  const diff = Math.round(last - prevAvg);
  return { direction: diff > 5 ? "up" : diff < -5 ? "down" : "flat", diff };
}

function SavedCallsList({ calls, onSelect, onNewCall, folderClient, setFolderClient, folderAE, setFolderAE, error, onRetry, clients, onAddClient, onDeleteClient, pastClients, onArchiveClient, onRestoreClient, onClientClick, archivedClients, onArchiveFromPast, onRestoreFromArchived, clientProfiles = {} }) {
  const [showArchived, setShowArchived] = useState(false);
  const allKnownClients = [...clients, ...(pastClients || []), ...(archivedClients || [])];
  const grouped = groupCallsByClientAndAE(calls, allKnownClients);

  const breadcrumb = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 }}>
      <span onClick={() => { setFolderClient(null); setFolderAE(null); }} style={{ color: folderClient ? "#6366F1" : "var(--text-1)", cursor: folderClient ? "pointer" : "default", fontWeight: 600 }}>Clients</span>
      {folderClient && <>
        <span style={{ color: "var(--text-2)" }}>/</span>
        <span onClick={() => setFolderAE(null)} style={{ color: folderAE ? "#6366F1" : "var(--text-1)", cursor: folderAE ? "pointer" : "default", fontWeight: 600 }}>{folderClient}</span>
      </>}
      {folderAE && <>
        <span style={{ color: "var(--text-2)" }}>/</span>
        <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{folderAE}</span>
      </>}
    </div>
  );

  const newReviewBtn = (
    <button onClick={onNewCall} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Review</button>
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
      return (
        <div key={client} style={{ position: "relative", background: isPast ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${isPast ? "var(--border-soft)" : "var(--border-soft)"}`, borderRadius: 16, padding: 0, cursor: isEmpty ? "default" : "pointer", overflow: "hidden", opacity: isPast ? 0.65 : (isEmpty ? 0.5 : 1), transition: "all 0.2s", boxShadow: isEmpty || isPast ? "none" : "0 2px 8px rgba(0,0,0,0.04)" }} onClick={() => !isEmpty && (onClientClick ? onClientClick(client) : setFolderClient(client))}>
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, zIndex: 2 }}>
            {isPast ? (
              onRestoreClient && <button onClick={(e) => { e.stopPropagation(); onRestoreClient(client); }} style={{ background: "rgba(49,206,129,0.12)", border: "none", color: "#31CE81", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontFamily: "inherit" }} title="Move back to active clients">Restore</button>
            ) : (
              onArchiveClient && <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Archive "${client}"? Their call history will still be viewable.`)) onArchiveClient(client); }} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "var(--text-3)", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontFamily: "inherit" }} title="Archive client">Archive</button>
            )}
          </div>
          <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border-soft)", flexShrink: 0, overflow: "hidden" }}>
              <ClientLogo key={client + (clientProfiles[client]?.website || "")} client={client} website={clientProfiles[client]?.website} size={48} letterStyle={{ fontSize: 20, fontWeight: 700, color: isPast ? "var(--text-3)" : "#6366F1" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: isPast ? "var(--text-2)" : "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>
              {callCount > 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{callCount} call{callCount !== 1 ? "s" : ""} · {aeCount} rep{aeCount !== 1 ? "s" : ""}</div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>No calls</div>
              )}
            </div>
          </div>
          {callCount > 0 && (
            <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CircularScore score={avgScore} size={40} strokeWidth={3} />
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>avg score</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(avgScore), textTransform: "uppercase", letterSpacing: 0.5 }}>{getScoreLabel(avgScore)}</div>
                {(() => {
                  const trend = getClientTrend(clientCalls);
                  if (!trend) return null;
                  const arrowColor = trend.direction === "up" ? "#31CE81" : trend.direction === "down" ? "#ef4444" : "var(--text-3)";
                  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
                  const diffStr = trend.direction !== "flat" ? ` ${trend.diff > 0 ? "+" : ""}${trend.diff}` : "";
                  return <span style={{ fontSize: 11, fontWeight: 600, color: arrowColor }}>{arrow}{diffStr}</span>;
                })()}
              </div>
            </div>
          )}
        </div>
      );
    };

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Clients</h2>
        </div>
        {(() => {
          const totalCalls = calls.length;
          const avgScoreStat = calls.length > 0 ? Math.round(calls.reduce((s, c) => s + (c.overall_score || 0), 0) / calls.length) : null;
          const totalReps = new Set(calls.map(c => c.category_scores?.rep_name).filter(Boolean)).size;
          const activeClientCount = clients.length;
          return totalCalls > 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 18, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{activeClientCount} {activeClientCount === 1 ? "Client" : "Clients"}</span>
              <span style={{ color: "var(--text-3)" }}>·</span>
              <span>{totalCalls} {totalCalls === 1 ? "Review" : "Reviews"}</span>
              <span style={{ color: "var(--text-3)" }}>·</span>
              <span>Avg Score <span style={{ fontWeight: 700, color: avgScoreStat !== null ? getScoreColor(avgScoreStat) : "inherit" }}>{avgScoreStat ?? "—"}</span></span>
              <span style={{ color: "var(--text-3)" }}>·</span>
              <span>{totalReps} {totalReps === 1 ? "Rep" : "Reps"}</span>
            </div>
          ) : null;
        })()}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#ef4444" }}>{error}</span>
            {onRetry && <button onClick={onRetry} style={{ padding: "6px 14px", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Retry</button>}
          </div>
        )}
        {calls.length === 0 && !error && <p style={{ color: "var(--text-2)", textAlign: "center", padding: 40 }}>No calls reviewed yet. Click "+ New Review" to get started.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {clients.map(client => renderClientCard(client, false))}
          {onAddClient && (
            <div onClick={() => { const name = window.prompt("Enter client name:"); if (name?.trim()) onAddClient(name.trim()); }} style={{ background: "transparent", border: "2px dashed var(--text-3)", borderRadius: 16, padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 18, color: "var(--text-3)", fontWeight: 300 }}>+</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-3)" }}>Add Client</div>
            </div>
          )}
        </div>
        {pastClients && pastClients.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Past Clients</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {pastClients.map(client => {
                const aes = grouped[client] || {};
                const clientCalls = Object.values(aes).flat();
                const callCount = clientCalls.length;
                const avgScore = callCount > 0 ? Math.round(clientCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / callCount) : 0;
                return (
                  <div key={client} style={{ position: "relative", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 0, cursor: "pointer", overflow: "hidden", opacity: 0.65, transition: "all 0.2s" }} onClick={() => onClientClick ? onClientClick(client) : setFolderClient(client)}>
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, zIndex: 2 }}>
                      {onRestoreClient && <button onClick={(e) => { e.stopPropagation(); onRestoreClient(client); }} style={{ background: "rgba(49,206,129,0.12)", border: "none", color: "#31CE81", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontFamily: "inherit" }}>Restore</button>}
                      {onArchiveFromPast && <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Archive "${client}"? They'll be moved to Archived Clients.`)) onArchiveFromPast(client); }} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "var(--text-3)", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontFamily: "inherit" }}>Archive</button>}
                    </div>
                    <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border-soft)", flexShrink: 0, overflow: "hidden" }}>
                        <ClientLogo key={client + (clientProfiles[client]?.website || "")} client={client} website={clientProfiles[client]?.website} size={48} letterStyle={{ fontSize: 20, fontWeight: 700, color: "var(--text-3)" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{callCount > 0 ? `${callCount} call${callCount !== 1 ? "s" : ""}` : "No calls"}</div>
                      </div>
                    </div>
                    {callCount > 0 && (
                      <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                        <CircularScore score={avgScore} size={40} strokeWidth={3} />
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>avg score</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const otherCalls = Object.values(grouped["Other"] || {}).flat();
          if (otherCalls.length === 0) return null;
          return (
            <div style={{ marginTop: 24 }}>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Unassigned</div>
              <div style={{ background: "var(--surface)", border: "1px solid rgba(255,200,50,0.25)", borderRadius: 16, padding: "14px 18px" }}>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10 }}>
                  {otherCalls.length} call{otherCalls.length !== 1 ? "s" : ""} not matched to any active client — check their <strong>category_scores.client</strong> value or re-save them with the correct client selected.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {otherCalls.map(call => (
                    <div key={call.id} onClick={() => setFolderClient("Other")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)", cursor: "pointer" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>{call.category_scores?.rep_name || call.rep_name || "Unknown Rep"}</span>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{call.prospect_company || "—"}</span>
                      <span style={{ fontSize: 11, color: "var(--text-3)", minWidth: 60, textAlign: "right" }}>{call.call_date || call.created_at?.slice(0,10) || "—"}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(call.overall_score || 0), minWidth: 28, textAlign: "right" }}>{call.overall_score ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {archivedClients && archivedClients.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <button onClick={() => setShowArchived(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: showArchived ? 12 : 0, fontFamily: "inherit" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1 }}>Archived Clients</span>
              <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "var(--text-2)", fontWeight: 600 }}>{archivedClients.length}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 2 }}>{showArchived ? "▲" : "▼"}</span>
            </button>
            {showArchived && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                {archivedClients.map(client => {
                  const aes = grouped[client] || {};
                  const clientCalls = Object.values(aes).flat();
                  const callCount = clientCalls.length;
                  return (
                    <div key={client} style={{ position: "relative", background: "var(--surface)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 0, cursor: "pointer", overflow: "hidden", opacity: 0.45, transition: "all 0.2s" }} onClick={() => onClientClick ? onClientClick(client) : setFolderClient(client)}>
                      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
                        {onRestoreFromArchived && <button onClick={(e) => { e.stopPropagation(); onRestoreFromArchived(client); }} style={{ background: "rgba(49,206,129,0.12)", border: "none", color: "#31CE81", fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontFamily: "inherit" }}>Restore</button>}
                      </div>
                      <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border-soft)", flexShrink: 0, overflow: "hidden" }}>
                          <ClientLogo key={client + (clientProfiles[client]?.website || "")} client={client} website={clientProfiles[client]?.website} size={48} letterStyle={{ fontSize: 20, fontWeight: 700, color: "var(--text-3)" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>
                          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{callCount > 0 ? `${callCount} call${callCount !== 1 ? "s" : ""}` : "No calls"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- CLIENT CALLS VIEW (grouped by rep) ----
  if (folderClient && !folderAE) {
    const aes = grouped[folderClient] || {};
    const allEntries = Object.entries(aes).map(([name, aeCalls]) => {
      const avg = aeCalls.length > 0 ? Math.round(aeCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / aeCalls.length) : 0;
      const isSdr = aeCalls.some(c => c.category_scores?.rep_type === "SDR");
      const sorted = [...aeCalls].sort((a, b) => new Date(b.call_date) - new Date(a.call_date));
      return { name, calls: sorted, avg, isSdr };
    }).sort((a, b) => b.avg - a.avg);

    const aeEntries = allEntries.filter(e => !e.isSdr);
    const sdrEntries = allEntries.filter(e => e.isSdr);

    const RepSection = ({ ae }) => {
      const [open, setOpen] = useState(true);
      return (
        <div className="glass-card" style={{ borderRadius: 14, overflow: "hidden", marginBottom: 8 }}>
          {/* Rep header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer" }} onClick={() => setOpen(v => !v)}>
            <CircularScore score={ae.avg} size={44} strokeWidth={4} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{ae.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 1 }}>{ae.calls.length} call{ae.calls.length !== 1 ? "s" : ""} · avg {getScoreLabel(ae.avg)}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setFolderAE(ae.name); }} style={{ padding: "5px 12px", border: "1px solid var(--text-3)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Rep Profile →</button>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
          </div>
          {/* Call rows */}
          {open && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {ae.calls.map(call => (
                <div key={call.id} onClick={() => onSelect(call)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px 10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <ProspectLogo company={call.prospect_company} size={34} borderRadius={8} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{call.prospect_company || "Unknown Company"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{call.call_type} · {call.call_date}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(call.overall_score || 0) }}>{call.overall_score || 0}%</div>
                    {call.deal_value ? <div style={{ fontSize: 11, color: "var(--text-3)" }}>${Number(call.deal_value).toLocaleString()}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div>
        {breadcrumb}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{folderClient}</h2>
          {newReviewBtn}
        </div>
        {allEntries.length === 0 && <p style={{ color: "var(--text-2)", textAlign: "center", padding: 40 }}>No calls for this client.</p>}
        {aeEntries.length > 0 && (
          <div style={{ marginBottom: sdrEntries.length > 0 ? 28 : 0 }}>
            {allEntries.length > aeEntries.length && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Account Executives</div>}
            {aeEntries.map(ae => <RepSection key={ae.name} ae={ae} />)}
          </div>
        )}
        {sdrEntries.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>SDRs</div>
            {sdrEntries.map(ae => <RepSection key={ae.name} ae={ae} />)}
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
      <div className="glass-card" style={{ borderRadius: 14, padding: 24, marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
        <CircularScore score={latestScore} size={80} strokeWidth={6} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>{folderAE}</span>
            {(() => { const seg = getRepSegment(aeCalls); if (!seg) return null; const sc = getSegmentColor(seg); return <span style={{ fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, padding: "2px 8px", borderRadius: 6 }}>{seg}</span>; })()}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
            {sortedAeCalls.length} call{sortedAeCalls.length !== 1 ? "s" : ""} reviewed
            {(() => {
              const smb = aeCalls.filter(c => c.deal_value && Number(c.deal_value) > 0 && Number(c.deal_value) < 25000).length;
              const mm = aeCalls.filter(c => c.deal_value && Number(c.deal_value) >= 25000 && Number(c.deal_value) < 200000).length;
              const ent = aeCalls.filter(c => c.deal_value && Number(c.deal_value) >= 200000).length;
              const parts = [];
              if (smb > 0) parts.push(`${smb} SMB`);
              if (mm > 0) parts.push(`${mm} Mid-Market`);
              if (ent > 0) parts.push(`${ent} Enterprise`);
              if (parts.length === 0) return null;
              return <span style={{ marginLeft: 6, color: "var(--text-3)", fontSize: 12 }}>· {parts.join(" · ")}</span>;
            })()}
          </div>
        </div>
        {sortedAeCalls.length > 1 && (
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: delta >= 0 ? "#31CE81" : "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>
              {delta >= 0 ? "+" : ""}{delta} pts
            </span>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{firstScore} &rarr; {latestScore}</div>
          </div>
        )}
      </div>

      {/* SECTION 2: Score Trend (only if >1 call) */}
      {sortedAeCalls.length > 1 && (
        <div className="glass-card" style={{ borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-2)", fontWeight: 700, marginBottom: 12 }}>Score Trend</div>
          <svg width="100%" height={svgH} viewBox={`0 0 100 ${svgH}`} preserveAspectRatio="none" style={{ display: "block" }}>
            <polyline points={polyline} fill="none" stroke="rgba(49,206,129,0.4)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {sparkSvgPoints.map((p, i) => (
              <circle key={i} cx={p.cxNum} cy={p.cy} r="3.5" fill={getScoreColor(p.score)} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
                <title>{p.date}: {p.score}</title>
              </circle>
            ))}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>{sortedAeCalls[0].call_date}</span>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>{sortedAeCalls[sortedAeCalls.length - 1].call_date}</span>
          </div>
        </div>
      )}

      {/* SECTION 3: Category Performance */}
      <div className="glass-card" style={{ borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#31CE81", fontWeight: 700, marginBottom: 10 }}>Strongest</div>
            {strong.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor10(p.avg), fontFamily: "'IBM Plex Mono', monospace" }}>{p.avg}/10</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#ef4444", fontWeight: 700, marginBottom: 10 }}>Weakest</div>
            {weak.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor10(p.avg), fontFamily: "'IBM Plex Mono', monospace" }}>{p.avg}/10</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: Risk Patterns */}
      {riskPatterns.length > 0 && (
        <div className="glass-card" style={{ borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-2)", fontWeight: 700, marginBottom: 10 }}>Risk Patterns (last {recentCalls.length} calls)</div>
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
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Calls ({sortedAeCalls.length})</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedAeCalls.map(call => (
          <div key={call.id} onClick={() => onSelect(call)} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "all 0.2s" }}>
            <ProspectLogo company={call.prospect_company} size={44} borderRadius={10} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{call.prospect_company || "Unknown Company"}</div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{call.call_type} · {call.call_date}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: getScoreColor(call.overall_score || 0) }}>{call.overall_score || 0}%</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>{call.deal_value ? "$" + Number(call.deal_value).toLocaleString() : ""}</div>
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
  const [clientCompany, setClientCompany] = useState("");
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
    if (role === "client" && !clientCompany.trim()) { setError("Enter the client's company name"); return; }
    setSending(true); setError("");
    try {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), role, client_company: clientCompany.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to send invite");
      setSent(data.emailSent ? "email" : "saved");
      setEmail(""); setClientCompany("");
      setTimeout(() => setSent(false), 4000);
    } catch (e) { setError(e.message); } finally { setSending(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 440, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Invite Team Members</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>\u2715</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: role === "client" ? 8 : 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" style={{ flex: 1, padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <select value={role} onChange={e => { setRole(e.target.value); setClientCompany(""); }} style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none" }}>
            <option value="rep" style={{ background: "var(--surface)" }}>Rep</option>
            <option value="admin" style={{ background: "var(--surface)" }}>Admin</option>
            <option value="manager" style={{ background: "var(--surface)" }}>Manager</option>
            <option value="client" style={{ background: "var(--surface)" }}>Client</option>
          </select>
        </div>
        {role === "client" && (
          <input
            value={clientCompany}
            onChange={e => setClientCompany(e.target.value)}
            placeholder="Client company name (e.g. Paymend)"
            style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }}
          />
        )}
        {role !== "client" && <div style={{ marginBottom: 4 }} />}
        <button onClick={sendInvite} disabled={sending} style={{ width: "100%", padding: "10px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>{sending ? "Sending..." : "Send Invite"}</button>
        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
        {sent === "email" && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#31CE81" }}>✓ Invite sent! They'll receive an email with a link to sign up.</div>}
        {sent === "saved" && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 12, color: "#f59e0b" }}>Invitation saved — email delivery unavailable. Share the app URL manually.</div>}
        {invites.length > 0 && (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Pending Invites</h4>
            {invites.map(inv => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <span style={{ fontSize: 13, color: "var(--text-1)" }}>{inv.email}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: inv.accepted ? "rgba(49,206,129,0.15)" : "rgba(234,179,8,0.15)", color: inv.accepted ? "#31CE81" : "#eab308" }}>{inv.accepted ? "Joined" : "Pending"}</span>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>{inv.role}{inv.client_company ? ` · ${inv.client_company}` : ""}</span>
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
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 460, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Gong Integration{client ? ` \u2014 ${client}` : ""}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>Loading...</p>
        ) : (
          <>
            {configured && (
              <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 13, color: "#1a7a42" }}>
                Gong is connected. Enter new credentials below to update.
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Access Key</label>
              <input value={accessKey} onChange={e => setAccessKey(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Gong access key"} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Access Key Secret</label>
              <input type="password" value={accessKeySecret} onChange={e => setAccessKeySecret(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Gong access key secret"} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Gong API Base URL</label>
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, cursor: "pointer" }}>
              <input type="checkbox" checked={autoReview} onChange={() => setAutoReview(!autoReview)} style={{ accentColor: "#31CE81", width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: "var(--text-1)" }}>Auto-review new calls via webhook</span>
            </label>

            {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
            {success && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#1a7a42" }}>{success}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : "Save Credentials"}</button>
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
  const [openAEs, setOpenAEs] = useState({});

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
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 560, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Sync Gong Calls{client ? ` \u2014 ${client}` : ""}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadGongCalls} disabled={loading} style={{ padding: "6px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{loading ? "..." : "Refresh"}</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
          </div>
        </div>

        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}

        {debugInfo && (
          <details style={{ marginBottom: 12, fontSize: 11, color: "var(--text-2)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Gong API debug</summary>
            <pre style={{ background: "rgba(0,0,0,0.03)", padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 120, fontSize: 10 }}>{JSON.stringify(debugInfo, null, 2)}</pre>
          </details>
        )}

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>Loading Gong calls...</p>
        ) : calls.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>No calls found in the last 30 days.</p>
        ) : (() => {
          const aeNames = [...new Set(calls.map(c => c.aeName || "Unknown AE").filter(Boolean))].sort((a, b) => a.localeCompare(b));
          const grouped = aeNames.map(ae => ({
            ae,
            calls: calls.filter(c => (c.aeName || "Unknown AE") === ae),
          }));
          const callRow = (call) => (
            <div key={call.gongCallId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", background: call.status === "completed" ? "rgba(49,206,129,0.03)" : "#FAFAFA", border: "1px solid var(--border-soft)", borderRadius: 8, marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.title}</span>
                  {call.callType && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, fontWeight: 600, flexShrink: 0, background: call.callType === "Discovery" ? "rgba(59,130,246,0.1)" : call.callType === "Follow-up" ? "rgba(139,92,246,0.1)" : call.callType === "Demo" ? "rgba(234,179,8,0.1)" : call.callType === "Negotiation" ? "rgba(249,115,22,0.1)" : "rgba(49,206,129,0.1)", color: call.callType === "Discovery" ? "#3b82f6" : call.callType === "Follow-up" ? "#8b5cf6" : call.callType === "Demo" ? "#ca8a04" : call.callType === "Negotiation" ? "#ea580c" : "#31CE81" }}>{call.callType}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                  {call.started ? new Date(call.started).toLocaleDateString() : ""}
                  {call.duration ? ` \u00B7 ${Math.round(call.duration / 60)}min` : ""}
                  {call.prospectName && <span> &middot; {call.prospectName}</span>}
                  {call.prospectCompany && <span style={{ fontWeight: 500 }}> &middot; {call.prospectCompany}</span>}
                </div>
                {call.errorMessage && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{call.errorMessage}</div>}
              </div>
              {statusBadge(call.status)}
              {(call.status === "new" || call.status === "failed") && (
                <button onClick={() => processCall(call.gongCallId)} disabled={processing === call.gongCallId} style={{ padding: "5px 12px", border: "none", borderRadius: 7, background: "#31CE81", color: "#fff", fontSize: 11, fontWeight: 600, cursor: processing ? "wait" : "pointer", fontFamily: "inherit", opacity: processing && processing !== call.gongCallId ? 0.4 : 1, whiteSpace: "nowrap" }}>
                  {processing === call.gongCallId ? "Processing..." : call.status === "failed" ? "Retry" : "Review"}
                </button>
              )}
            </div>
          );
          return (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 12 }}>{calls.length} call{calls.length !== 1 ? "s" : ""} from last 30 days &middot; {aeNames.length} AE{aeNames.length !== 1 ? "s" : ""}</div>
              {grouped.map(({ ae, calls: aeCalls }) => {
                const isOpen = openAEs[ae] !== false; // default open
                const newCount = aeCalls.filter(c => c.status === "new" || c.status === "failed").length;
                const doneCount = aeCalls.filter(c => c.status === "completed").length;
                return (
                  <div key={ae} style={{ marginBottom: 8, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, overflow: "hidden" }}>
                    <button onClick={() => setOpenAEs(p => ({ ...p, [ae]: !isOpen }))} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "var(--surface-2)", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{isOpen ? "▾" : "▸"}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{ae}</span>
                      <span style={{ fontSize: 11, color: "var(--text-2)", marginRight: 6 }}>{aeCalls.length} call{aeCalls.length !== 1 ? "s" : ""}</span>
                      {newCount > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "rgba(49,206,129,0.12)", color: "#31CE81", fontWeight: 600 }}>{newCount} new</span>}
                      {doneCount > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: "rgba(49,206,129,0.1)", color: "#31CE81", fontWeight: 600 }}>{doneCount} reviewed</span>}
                    </button>
                    {isOpen && (
                      <div style={{ padding: "8px 10px 4px" }}>
                        {aeCalls.map(call => callRow(call))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
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

  const inputStyle = { width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 480, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Diio Integration{client ? ` \u2014 ${client}` : ""}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>Loading...</p>
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
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>Obtain your credentials from the Diio API settings dashboard.</div>
            </div>

            {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
            {success && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#1a7a42" }}>{success}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : "Save Credentials"}</button>
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
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 580, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Sync Diio Calls{client ? ` \u2014 ${client}` : ""}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadDiioCalls} disabled={loading} style={{ padding: "6px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{loading ? "..." : "Refresh"}</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
          </div>
        </div>

        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>Loading Diio calls...</p>
        ) : calls.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>No transcribed calls found in the last 30 days.</p>
        ) : (() => {
          const sellerNames = [...new Set(calls.map(c => c.sellerName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          const filtered = sellerFilter ? calls.filter(c => c.sellerName === sellerFilter) : calls;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>{filtered.length} call{filtered.length !== 1 ? "s" : ""}{sellerFilter ? ` for ${sellerFilter}` : " from last 30 days"}</div>
                {sellerNames.length > 1 && (
                  <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} style={{ padding: "5px 10px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "var(--surface)", color: "var(--text-1)", fontSize: 12, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
                    <option value="">All Sellers</option>
                    {sellerNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>
              {filtered.map(call => (
                <div key={call.diioCallId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: call.status === "completed" ? "rgba(49,206,129,0.03)" : "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.title}</span>
                      {typeBadge(call.callType)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                      {call.date ? new Date(call.date).toLocaleDateString() : ""}
                    </div>
                    {(call.sellerName || call.customerName) && (
                      <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>
                        {call.sellerName && <span style={{ fontWeight: 600 }}>Seller: {call.sellerName}</span>}
                        {call.sellerName && call.customerName && <span> &middot; </span>}
                        {call.customerName && <span>Customer: {call.customerName}</span>}
                      </div>
                    )}
                    {call.errorMessage && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{call.errorMessage}</div>}
                  </div>
                  {statusBadge(call.status)}
                  {(call.status === "new" || call.status === "failed") && (
                    <button onClick={() => processCall(call.diioCallId, call.rawId, call.callType)} disabled={!!processing} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 11, fontWeight: 600, cursor: processing ? "wait" : "pointer", fontFamily: "inherit", opacity: processing && processing !== call.diioCallId ? 0.4 : 1, whiteSpace: "nowrap" }}>
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

// ==================== FIREFLIES SETTINGS MODAL ====================
function FirefliesSettingsModal({ getValidToken, onClose, client }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const t = await getValidToken();
        const qs = client ? `?client=${encodeURIComponent(client)}` : "";
        const r = await fetch(`/api/fireflies/settings${qs}`, { headers: { Authorization: `Bearer ${t}` } });
        if (r.ok) {
          const data = await r.json();
          if (data.configured) {
            setConfigured(true);
            setApiKeyMasked(data.api_key_masked || "");
          }
        }
      } catch (e) { console.error("Load fireflies settings:", e); }
      setLoading(false);
    })();
  }, [getValidToken, client]);

  const handleSave = async () => {
    if (!apiKey) { setError("API key is required"); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/fireflies/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ apiKey, client: client || "Other" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      setConfigured(true);
      if (data.keyVerified) {
        setSuccess("API key saved and verified successfully!");
      } else {
        setSuccess(`API key saved. Note: ${data.verifyError || "Could not verify — check your key."}`);
      }
      setApiKey("");
      setTimeout(() => setSuccess(""), 6000);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove Fireflies integration${client ? ` for ${client}` : ""}? This won't delete already-processed calls.`)) return;
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}` : "";
      await fetch(`/api/fireflies/settings${qs}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      setConfigured(false); setApiKeyMasked("");
      setSuccess("Integration removed."); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
  };

  const inputStyle = { width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 460, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Fireflies Integration{client ? ` \u2014 ${client}` : ""}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>Loading...</p>
        ) : (
          <>
            {configured && (
              <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 13, color: "#1a7a42" }}>
                Fireflies is connected ({apiKeyMasked}). Enter a new key below to update.
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Fireflies API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={configured ? "****  (enter new to update)" : "Your Fireflies API key"} style={inputStyle} />
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
                Find your API key at <span style={{ color: "#31CE81" }}>app.fireflies.ai → Settings → API</span>
              </div>
            </div>

            {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
            {success && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#1a7a42" }}>{success}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : "Save API Key"}</button>
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

// ==================== FIREFLIES SYNC MODAL ====================
function FirefliesSyncModal({ getValidToken, onClose, onCallProcessed, client }) {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState("");

  const loadTranscripts = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const t = await getValidToken();
      const qs = client ? `?client=${encodeURIComponent(client)}&days=90` : "?days=90";
      const r = await fetch(`/api/fireflies/sync${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load transcripts");
      setTranscripts(data.transcripts || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [getValidToken, client]);

  useEffect(() => { loadTranscripts(); }, [loadTranscripts]);

  const processTranscript = async (transcriptId) => {
    setProcessing(transcriptId); setError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/fireflies/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ transcriptId, client: client || "Other" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Processing failed");
      setTranscripts(prev => prev.map(tr => tr.transcriptId === transcriptId ? { ...tr, status: "completed", overallScore: data.overallScore } : tr));
      if (onCallProcessed) onCallProcessed();
    } catch (e) {
      setError(e.message);
      setTranscripts(prev => prev.map(tr => tr.transcriptId === transcriptId ? { ...tr, status: "failed", errorMessage: e.message } : tr));
    } finally { setProcessing(null); }
  };

  const processAll = async () => {
    const toProcess = transcripts.filter(tr => tr.status === "new" || tr.status === "failed");
    for (const tr of toProcess) {
      await processTranscript(tr.transcriptId);
    }
  };

  const statusBadge = (status) => {
    const s = { new: { bg: "rgba(59,130,246,0.1)", color: "#3b82f6", text: "New" }, processing: { bg: "rgba(234,179,8,0.1)", color: "#eab308", text: "Processing..." }, completed: { bg: "rgba(49,206,129,0.1)", color: "#31CE81", text: "Reviewed" }, failed: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", text: "Failed" } }[status] || { bg: "rgba(59,130,246,0.1)", color: "#3b82f6", text: "New" };
    return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>{s.text}</span>;
  };

  const newCount = transcripts.filter(tr => tr.status === "new" || tr.status === "failed").length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 28, width: 600, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px var(--text-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Sync Fireflies Calls{client ? ` \u2014 ${client}` : ""}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {newCount > 0 && !loading && (
              <button onClick={processAll} disabled={!!processing} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Review All ({newCount})
              </button>
            )}
            <button onClick={loadTranscripts} disabled={loading} style={{ padding: "6px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{loading ? "..." : "Refresh"}</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
          </div>
        </div>

        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>Loading Fireflies transcripts...</p>
        ) : transcripts.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-2)", padding: 20 }}>No transcripts found in the last 90 days.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
              {transcripts.length} transcript{transcripts.length !== 1 ? "s" : ""} &middot; {transcripts.filter(tr => tr.status === "completed").length} reviewed &middot; {newCount} pending
            </div>
            {transcripts.map(tr => (
              <div key={tr.transcriptId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: tr.status === "completed" ? "rgba(49,206,129,0.03)" : "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                    {tr.date ? new Date(tr.date).toLocaleDateString() : ""}
                    {tr.duration ? ` \u00B7 ${tr.duration} min` : ""}
                  </div>
                  {(tr.repName || tr.prospectName) && (
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>
                      {tr.repName && <span style={{ fontWeight: 600 }}>Rep: {tr.repName}</span>}
                      {tr.repName && tr.prospectName && <span> &middot; </span>}
                      {tr.prospectName && <span>Prospect: {tr.prospectName}</span>}
                    </div>
                  )}
                  {tr.errorMessage && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{tr.errorMessage}</div>}
                </div>
                {statusBadge(tr.status)}
                {(tr.status === "new" || tr.status === "failed") && (
                  <button onClick={() => processTranscript(tr.transcriptId)} disabled={!!processing} style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 11, fontWeight: 600, cursor: processing ? "wait" : "pointer", fontFamily: "inherit", opacity: processing && processing !== tr.transcriptId ? 0.4 : 1, whiteSpace: "nowrap" }}>
                    {processing === tr.transcriptId ? "Processing..." : tr.status === "failed" ? "Retry" : "Review"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== INTEGRATIONS PAGE ====================
function IntegrationsPage({ getValidToken, token, loadCalls, clients }) {
  const [gongConfigs, setGongConfigs] = useState([]);
  const [diioConfigs, setDiioConfigs] = useState([]);
  const [firefliesConfigs, setFirefliesConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [gongSettingsClient, setGongSettingsClient] = useState(null);
  const [gongSyncClient, setGongSyncClient] = useState(null);
  const [diioSettingsClient, setDiioSettingsClient] = useState(null);
  const [diioSyncClient, setDiioSyncClient] = useState(null);
  const [firefliesSettingsClient, setFirefliesSettingsClient] = useState(null);
  const [firefliesSyncClient, setFirefliesSyncClient] = useState(null);

  const loadConfigs = useCallback(async () => {
    try {
      const t = await getValidToken();
      const [gongRes, diioRes, ffRes] = await Promise.all([
        fetch("/api/gong/settings", { headers: { Authorization: `Bearer ${t}` } }),
        fetch("/api/diio/settings", { headers: { Authorization: `Bearer ${t}` } }),
        fetch("/api/fireflies/settings", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (gongRes.ok) {
        const data = await gongRes.json();
        setGongConfigs(data.configs || []);
      }
      if (diioRes.ok) {
        const data = await diioRes.json();
        setDiioConfigs(data.configs || []);
      }
      if (ffRes.ok) {
        const data = await ffRes.json();
        setFirefliesConfigs(data.configs || []);
      }
    } catch (e) { console.error("Load integrations:", e); }
    setLoading(false);
  }, [getValidToken]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const gongMap = {};
  gongConfigs.forEach(c => { gongMap[c.client] = c; });
  const diioMap = {};
  diioConfigs.forEach(c => { diioMap[c.client] = c; });
  const firefliesMap = {};
  firefliesConfigs.forEach(c => { firefliesMap[c.client] = c; });

  // Detail view for a specific client
  if (selectedClient) {
    const gongCfg = gongMap[selectedClient];
    const diioCfg = diioMap[selectedClient];
    const ffCfg = firefliesMap[selectedClient];
    return (
      <div>
        {gongSettingsClient && <GongSettingsModal token={token} getValidToken={getValidToken} client={gongSettingsClient} onClose={() => { setGongSettingsClient(null); loadConfigs(); }} />}
        {gongSyncClient && <GongSyncModal getValidToken={getValidToken} client={gongSyncClient} onClose={() => setGongSyncClient(null)} onCallProcessed={loadCalls} />}
        {diioSettingsClient && <DiioSettingsModal getValidToken={getValidToken} client={diioSettingsClient} onClose={() => { setDiioSettingsClient(null); loadConfigs(); }} />}
        {diioSyncClient && <DiioSyncModal getValidToken={getValidToken} client={diioSyncClient} onClose={() => setDiioSyncClient(null)} onCallProcessed={loadCalls} />}
        {firefliesSettingsClient && <FirefliesSettingsModal getValidToken={getValidToken} client={firefliesSettingsClient} onClose={() => { setFirefliesSettingsClient(null); loadConfigs(); }} />}
        {firefliesSyncClient && <FirefliesSyncModal getValidToken={getValidToken} client={firefliesSyncClient} onClose={() => setFirefliesSyncClient(null)} onCallProcessed={loadCalls} />}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 }}>
          <span onClick={() => setSelectedClient(null)} style={{ color: "#31CE81", cursor: "pointer", fontWeight: 600 }}>Integrations</span>
          <span style={{ color: "var(--text-2)" }}>/</span>
          <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{selectedClient}</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 20px" }}>{selectedClient} &mdash; Integrations</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Gong card */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>{"\uD83D\uDD17"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Gong</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                  {gongCfg ? "Connected" : "Not connected"}
                  {gongCfg?.updated_at ? ` \u00B7 Updated ${new Date(gongCfg.updated_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: gongCfg ? "#31CE81" : "var(--text-3)", display: "inline-block" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setGongSettingsClient(selectedClient)} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {gongCfg ? "Edit Credentials" : "Connect Gong"}
              </button>
              {gongCfg && (
                <button onClick={() => setGongSyncClient(selectedClient)} style={{ padding: "9px 18px", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, background: "rgba(139,92,246,0.08)", color: "#8b5cf6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Sync Calls
                </button>
              )}
            </div>
            {gongCfg && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(0,0,0,0.02)", borderRadius: 8, fontSize: 12, color: "var(--text-2)" }}>
                Base URL: {gongCfg.gong_base_url} &middot; Auto-review: {gongCfg.auto_review ? "On" : "Off"}
              </div>
            )}
          </div>

          {/* Diio card */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>{"📞"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Diio</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                  {diioCfg ? `Connected · ${diioCfg.subdomain}.diio.com` : "Not connected"}
                  {diioCfg?.updated_at ? ` \u00B7 Updated ${new Date(diioCfg.updated_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: diioCfg ? "#31CE81" : "var(--text-3)", display: "inline-block" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDiioSettingsClient(selectedClient)} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {diioCfg ? "Edit Credentials" : "Connect Diio"}
              </button>
              {diioCfg && (
                <button onClick={() => setDiioSyncClient(selectedClient)} style={{ padding: "9px 18px", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, background: "rgba(139,92,246,0.08)", color: "#8b5cf6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Sync Calls
                </button>
              )}
            </div>
          </div>

          {/* Fireflies card */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>{"🔥"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Fireflies.ai</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                  {ffCfg ? `Connected · ${ffCfg.api_key_masked || "****"}` : "Not connected"}
                  {ffCfg?.created_at ? ` \u00B7 Added ${new Date(ffCfg.created_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: ffCfg ? "#31CE81" : "var(--text-3)", display: "inline-block" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setFirefliesSettingsClient(selectedClient)} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {ffCfg ? "Edit API Key" : "Connect Fireflies"}
              </button>
              {ffCfg && (
                <button onClick={() => setFirefliesSyncClient(selectedClient)} style={{ padding: "9px 18px", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, background: "rgba(139,92,246,0.08)", color: "#8b5cf6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
        <p style={{ textAlign: "center", color: "var(--text-2)", padding: 40 }}>Loading integrations...</p>
      ) : (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 20px" }}>Integrations</h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "-12px 0 20px" }}>Configure Gong, Diio, or Fireflies credentials per client to automatically import and review recorded calls.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {clients.map(name => {
              const gongCfg = gongMap[name];
              const diioCfg = diioMap[name];
              const ffCfg = firefliesMap[name];
              const connectedCount = (gongCfg ? 1 : 0) + (diioCfg ? 1 : 0) + (ffCfg ? 1 : 0);
              return (
                <div key={name} onClick={() => setSelectedClient(name)} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 20, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u2699\uFE0F"}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>{name}</div>
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
                      {ffCfg && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#31CE81", display: "inline-block" }} />
                          <span style={{ fontSize: 11, color: "#31CE81", fontWeight: 600 }}>Fireflies</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--text-2)" }}>Not configured</div>
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
  if (score === null) return <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>Not assessed</span>;
  const { label, color, bg } = score < 40 ? { label: "Needs Improvement", color: "#ef4444", bg: "rgba(239,68,68,0.08)" }
    : score < 50 ? { label: "Below Average", color: "#f97316", bg: "rgba(249,115,22,0.08)" }
    : score < 65 ? { label: "Average", color: "#eab308", bg: "rgba(234,179,8,0.08)" }
    : score < 80 ? { label: "Great", color: "#22c55e", bg: "rgba(34,197,94,0.08)" }
    : { label: "Excellent", color: "#31CE81", bg: "rgba(49,206,129,0.08)" };
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, padding: "2px 8px", borderRadius: 6 }}>{label}</span>;
}

function HomePage({ savedCalls, enablementDocs, crmSnapshots, gtmAssessments, tofAssessments, hiringAssessments, metricsAssessments, clients, onNavigate, onClientClick, userEmail, onCmdK, onNewReview }) {
  const [showGtmSummary, setShowGtmSummary] = useState(false);

  // Stats
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const reviewsThisMonth = savedCalls.filter(c => {
    const d = new Date(c.call_date || c.created_at);
    return d >= thirtyDaysAgo;
  }).length;

  const allCallScores = savedCalls.map(c => c.overall_score).filter(Boolean);
  const avgCallScore = allCallScores.length > 0 ? Math.round(allCallScores.reduce((a, b) => a + b, 0) / allCallScores.length) : null;

  const prevMonthScores = savedCalls.filter(c => {
    const d = new Date(c.call_date || c.created_at);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  }).map(c => c.overall_score).filter(Boolean);
  const prevAvgScore = prevMonthScores.length > 0 ? Math.round(prevMonthScores.reduce((a, b) => a + b, 0) / prevMonthScores.length) : null;
  const scoreTrend = avgCallScore !== null && prevAvgScore !== null ? avgCallScore - prevAvgScore : null;

  // Recent calls (last 5)
  const recentCalls = [...savedCalls]
    .sort((a, b) => new Date(b.call_date || b.created_at) - new Date(a.call_date || a.created_at))
    .slice(0, 5);

  // Needs attention
  const needsAttention = clients.map(client => {
    const clientCalls = savedCalls.filter(c =>
      c.category_scores?.client === client ||
      (c.prospect_company || "").toLowerCase().includes(client.toLowerCase())
    );
    if (clientCalls.length === 0) return null;
    const avg = Math.round(clientCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / clientCalls.length);
    const sorted = [...clientCalls].sort((a, b) => new Date(b.call_date || b.created_at) - new Date(a.call_date || a.created_at));
    const mostRecent = sorted[0]?.overall_score || 0;
    if (avg < 65 || mostRecent < 50) return { client, avg, mostRecent };
    return null;
  }).filter(Boolean);

  // GTM helpers (for collapsed section)
  const latestScore = (arr) => arr.length > 0 ? (arr[0].overall_score || null) : null;
  const avgScoreFn = (arr) => {
    const scores = arr.map(a => a.overall_score).filter(Boolean);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  };
  const callScore = avgScoreFn(savedCalls);
  const enablementScore = avgScoreFn(enablementDocs);
  const crmScore = latestScore(crmSnapshots);
  const gtmScore = latestScore(gtmAssessments);
  const tofScore = latestScore(tofAssessments);
  const hiringScore = latestScore(hiringAssessments);
  const metricsScore = latestScore(metricsAssessments);
  const allGtmScores = [gtmScore, tofScore, callScore, enablementScore, crmScore, hiringScore, metricsScore].filter(s => s !== null);
  const overallGtmScore = allGtmScores.length > 0 ? Math.round(allGtmScores.reduce((a, b) => a + b, 0) / allGtmScores.length) : null;

  const sections = [
    { id: "gtm", label: "GTM Strategy", icon: "🎯", color: "#6366f1", accent: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)", score: gtmScore, count: gtmAssessments.length, countLabel: "assessments", desc: "ICP definition, buyer personas, competitive positioning, channel strategy" },
    { id: "tof", label: "Top of Funnel", icon: "📣", color: "#0ea5e9", accent: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.2)", score: tofScore, count: tofAssessments.length, countLabel: "assessments", desc: "Lead gen channels, brand building, content, outbound conversion rates" },
    { id: "calls", label: "Sales Readiness", icon: "📞", color: "#31CE81", accent: "rgba(49,206,129,0.08)", border: "rgba(49,206,129,0.2)", score: callScore, count: savedCalls.length, countLabel: "calls", desc: "Call quality, discovery, objection handling, next steps, deal qualification" },
    { id: "enablement", label: "Sales Enablement", icon: "📄", color: "#3b82f6", accent: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", score: enablementScore, count: enablementDocs.length, countLabel: "documents", desc: "Pitch decks, battle cards, playbooks, onboarding, manager training" },
    { id: "crm", label: "RevOps", icon: "📊", color: "#8b5cf6", accent: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.2)", score: crmScore, count: crmSnapshots.length, countLabel: "snapshots", desc: "Pipeline health, forecast accuracy, CRM hygiene, reporting cadence" },
    { id: "hiring", label: "Sales Hiring", icon: "👥", color: "#ec4899", accent: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.2)", score: hiringScore, count: hiringAssessments.length, countLabel: "assessments", desc: "Interview process, candidate profiling, mock pitches, 30/60/90 plans" },
    { id: "metrics", label: "Metrics & Benchmarks", icon: "📈", color: "#f59e0b", accent: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", score: metricsScore, count: metricsAssessments.length, countLabel: "assessments", desc: "Quota attainment, pipeline coverage, win rate, SDR/AE benchmarks" },
  ];

  const clientsWithReviews = clients.filter(client =>
    savedCalls.some(c =>
      c.category_scores?.client === client ||
      (c.prospect_company || "").toLowerCase().includes(client.toLowerCase())
    )
  ).length;

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
    ? <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(score), fontFamily: "'IBM Plex Mono', monospace" }}>{score}%</span>
    : <span style={{ fontSize: 11, color: "var(--text-3)" }}>—</span>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const rawName = userEmail ? userEmail.split("@")[0].split(".")[0] : "";
  const displayName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>
          {greeting}{displayName ? `, ${displayName}` : ""}
        </h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCmdK} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 10, color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <span>Search</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>⌘K</span>
          </button>
          <button onClick={onNewReview} style={{ padding: "8px 16px", background: "#31CE81", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Review</button>
        </div>
      </div>

      {/* Section A: Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
        <div className="glass-card" style={{ borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Reviews This Month</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-1)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{reviewsThisMonth}</div>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>last 30 days</div>
        </div>
        <div className="glass-card" style={{ borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Avg Score</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: avgCallScore !== null ? getScoreColor(avgCallScore) : "var(--text-2)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{avgCallScore !== null ? `${avgCallScore}%` : "—"}</div>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
            {scoreTrend !== null ? (
              <span style={{ color: scoreTrend >= 0 ? "#31CE81" : "#ef4444", fontWeight: 600 }}>
                {scoreTrend >= 0 ? "↑" : "↓"} {Math.abs(scoreTrend)} vs last month
              </span>
            ) : "all time"}
          </div>
        </div>
        <div className="glass-card" style={{ borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Clients Reviewed</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-1)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{clientsWithReviews}</div>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>of {clients.length} in workspace</div>
        </div>
      </div>

      {/* Section B: Recent Call Reviews */}
      <div className="glass-card" style={{ borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", textTransform: "uppercase", letterSpacing: 1.2 }}>Recent Call Reviews</div>
          <button onClick={() => onNavigate("calls")} style={{ fontSize: 11, color: "#31CE81", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>View all →</button>
        </div>
        {recentCalls.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 13 }}>No calls reviewed yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recentCalls.map(call => {
              const repName = call.category_scores?.rep_name || call.rep_name || "—";
              const client = call.category_scores?.client || "—";
              const dateStr = call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
              return (
                <div key={call.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                    <CircularScore score={call.overall_score || 0} size={36} strokeWidth={3} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{client}</div>
                    <div style={{ fontSize: 11, color: "var(--text-2)" }}>{repName} · {call.call_type}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: getScoreColor(call.overall_score || 0) }}>{getScoreLabel(call.overall_score || 0)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>{dateStr}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section C: Needs Attention */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 12 }}>Needs Attention</div>
        {needsAttention.length === 0 ? (
          <div style={{ background: "rgba(49,206,129,0.06)", border: "1px solid rgba(49,206,129,0.15)", borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#1a7a42", fontWeight: 500 }}>
            All clients are performing well 🎉
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {needsAttention.map(({ client, avg }) => (
              <div key={client} style={{ background: "var(--surface)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{client}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>avg {avg}%</div>
                </div>
                <button onClick={() => onClientClick && onClientClick(client)} style={{ fontSize: 11, color: "#31CE81", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>View →</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section D: Quick Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
        <button onClick={() => onNavigate("review")} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#31CE81", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Call Review</button>
        <button onClick={() => onNavigate("gtm")} style={{ padding: "10px 20px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, background: "rgba(255,255,255,0.05)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Run Assessment</button>
        <button onClick={() => onNavigate("enablement")} style={{ padding: "10px 20px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, background: "rgba(255,255,255,0.05)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Upload Doc</button>
      </div>

      {/* GTM Audit Summary (collapsible) */}
      <div>
        <button onClick={() => setShowGtmSummary(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: showGtmSummary ? 16 : 0, fontFamily: "inherit" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>GTM Audit Summary</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{showGtmSummary ? "▲" : "▸"}</span>
        </button>
        {showGtmSummary && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Full-funnel assessment of your sales organization's go-to-market execution</p>
              {overallGtmScore !== null && (
                <div className="glass-card" style={{ textAlign: "center", borderRadius: 14, padding: "14px 22px", flexShrink: 0, marginLeft: 20 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: getScoreColor(overallGtmScore), fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{overallGtmScore}%</div>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-2)", marginTop: 6 }}>Overall GTM Score</div>
                  <AuditStatusBadge score={overallGtmScore} />
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {sections.map(sec => (
                <div key={sec.id} onClick={() => onNavigate(sec.id)} className="glass-card" style={{ borderRadius: 14, padding: "18px 20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: sec.accent, border: `1px solid ${sec.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{sec.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{sec.label}</div>
                    </div>
                    {sec.score !== null
                      ? <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: getScoreColor(sec.score) }}>{sec.score}%</div>
                      : <div style={{ fontSize: 11, color: "var(--text-3)" }}>—</div>}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.55 }}>{sec.desc}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <AuditStatusBadge score={sec.score} />
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{sec.count > 0 ? `${sec.count} ${sec.countLabel}` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
            {clientHealth.length > 0 && (
              <div>
                <h3 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1.2 }}>Client Health Overview</h3>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(8, 68px)", gap: 0, padding: "9px 18px", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", borderBottom: "1px solid var(--border-soft)" }}>
                    <span>Client</span>
                    {["GTM","TOF","S.Ready","S.Enable","RevOps","Hiring","Metrics","Overall"].map(h => <span key={h} style={{ textAlign: "center" }}>{h}</span>)}
                  </div>
                  {clientHealth.map((ch, i) => (
                    <div key={ch.client} style={{ display: "grid", gridTemplateColumns: "1fr repeat(8, 68px)", gap: 0, padding: "12px 18px", borderBottom: i < clientHealth.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", alignItems: "center" }}>
                      <span onClick={() => onClientClick && onClientClick(ch.client)} style={{ fontSize: 13, fontWeight: 600, color: onClientClick ? "#6366F1" : "var(--text-1)", cursor: onClientClick ? "pointer" : "default" }}>{ch.client}</span>
                      {[ch.gs, ch.ts, ch.cs, ch.ds, ch.rs, ch.hs, ch.ms, ch.overall].map((s, j) => (
                        <div key={j} style={{ textAlign: "center" }}>{sc(s)}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Enablement</h2>
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Audit your sales materials for quality, completeness, and buyer-centricity</p>
          </div>
          <button onClick={startNew} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Upload Doc</button>
        </div>
        {docs.length === 0 ? (
          <div className="glass-card" style={{ textAlign: "center", padding: "60px 20px", borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📄</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No documents yet</h3>
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 20px" }}>Upload a pitch deck, battle card, or email template to get an AI quality audit.</p>
            <button onClick={startNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Upload First Doc</button>
          </div>
        ) : Object.entries(byClient).map(([client, clientDocs]) => (
          <div key={client} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>{client}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientDocs.map(doc => (
                <div key={doc.id} onClick={() => viewDoc(doc)} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                      <span>{docTypeLabel(doc.doc_type)}</span>
                      {doc.created_at && <span> · {new Date(doc.created_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  {doc.overall_score ? (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(doc.overall_score), fontFamily: "'IBM Plex Mono', monospace" }}>{doc.overall_score}%</div>
                      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>{getScoreLabel(doc.overall_score)}</div>
                    </div>
                  ) : <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>Not analyzed</span>}
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
        <span style={{ color: "var(--text-2)" }}>/</span>
        <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{isViewMode ? selectedDoc.title : "New Document"}</span>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Document Title</label>
            <input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Q1 2025 Pitch Deck" style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Client</label>
            <select value={docClient} onChange={e => setDocClient(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid " + (!docClient ? "rgba(239,68,68,0.3)" : "var(--border-soft)"), borderRadius: 8, color: docClient ? "var(--text-1)" : "var(--text-3)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              {ENABLEMENT_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)" }}>Document Content</label>
          <button onClick={analyzeDoc} disabled={analyzing || !docContent.trim()} style={{ padding: "8px 18px", border: "none", borderRadius: 8, cursor: analyzing || !docContent.trim() ? "default" : "pointer", background: analyzing || !docContent.trim() ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #3b82f6, #2563eb)", color: analyzing || !docContent.trim() ? "var(--text-3)" : "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
            {analyzing ? "Analyzing..." : "Analyze with AI ✦"}
          </button>
        </div>
        <FileDropZone value={docContent} onChange={setDocContent} placeholder="Paste your document content here, or drag and drop a file — .pdf, .docx, .txt, .md supported..." minHeight={200} accept=".txt,.md,.html,.pdf,.docx" />
        {analyzing && <p style={{ fontSize: 12, color: "var(--text-2)", textAlign: "center", marginTop: 10 }}>Analyzing document quality... (10-20s)</p>}
      </div>
      {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {analysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 20 }}>
            <CircularScore score={analysis.overall_score || 0} size={90} strokeWidth={6} label="quality" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Document Quality Assessment</div>
              <p style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
            </div>
          </div>
          {analysis.scores && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 20 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>Category Breakdown</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(analysis.scores).map(([key, val]) => {
                  if (isNADetail(val.details)) return null;
                  const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  const pct = Math.round((val.score / 10) * 100);
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor10(val.score), fontFamily: "'IBM Plex Mono', monospace" }}>{val.score}/10</span>
                      </div>
                      <div style={{ height: 4, background: "var(--border-soft)", borderRadius: 4 }}>
                        <div style={{ height: "100%", width: pct + "%", background: getScoreColor10(val.score), borderRadius: 4 }} />
                      </div>
                      {val.details && <p style={{ fontSize: 11, color: "var(--text-2)", margin: "4px 0 0", lineHeight: 1.5 }}>{val.details}</p>}
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
                  <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>{g.title}</div>
                    <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 10px", lineHeight: 1.6 }}>{g.description}</p>
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
        <button onClick={() => setMode("list")} style={{ padding: "10px 20px", border: "1px solid var(--text-3)", borderRadius: 10, background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={saveDoc} disabled={saving} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : isViewMode ? "Update Doc" : "Save Doc"}</button>
      </div>
    </div>
  );
}

// ==================== SCORE TRENDS CHART ====================
const REP_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"];
const CHART_PALETTE = ["#6366F1", "#10B981", "#F59E0B", "#F43F5E", "#0EA5E9"];

function RepAvatar({ name, photoUrl, size = 32, fontSize = 13, color = "#31CE81" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = (name || "?").split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        key={photoUrl}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(49,206,129,0.15)", border: "1px solid rgba(49,206,129,0.3)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 700, color,
    }}>
      {initials}
    </div>
  );
}

function ScoreTrendsChart({ repEntries }) {
  const [tooltip, setTooltip] = useState(null);
  const [chartWidth, setChartWidth] = useState(700);
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setChartWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Flatten all calls sorted by date
  const allCalls = repEntries
    .flatMap(e => e.repCalls
      .filter(c => (c.call_date || c.created_at) && c.overall_score)
      .map(c => ({
        date: new Date(((c.call_date || c.created_at || "").slice(0, 10)) + "T12:00:00"),
        score: c.overall_score,
        rep: e.repName,
        prospect: c.prospect_company || "",
      }))
    )
    .sort((a, b) => a.date - b.date);

  if (allCalls.length === 0) return null;

  const overallAvg = Math.round(allCalls.reduce((s, c) => s + c.score, 0) / allCalls.length);
  const mid = Math.ceil(allCalls.length / 2);
  const firstAvg = Math.round(allCalls.slice(0, mid).reduce((s, c) => s + c.score, 0) / mid);
  const secondAvg = Math.round(allCalls.slice(mid).reduce((s, c) => s + c.score, 0) / Math.max(1, allCalls.length - mid));
  const trendDelta = allCalls.length >= 2 ? secondAvg - firstAvg : null;
  const isPositive = (trendDelta ?? 0) > 3;
  const isNegative = (trendDelta ?? 0) < -3;
  const trendColor = isPositive ? "#31CE81" : isNegative ? "#ef4444" : "#9ca3af";
  const trendLabel = isPositive ? `↑ +${trendDelta} pts` : isNegative ? `↓ ${trendDelta} pts` : "→ Flat";

  const PAD_L = 16, PAD_R = 16, PAD_T = 16, PAD_B = 28;
  const W = chartWidth, H = 180;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const Y_MIN = 20, Y_MAX = 100;

  const allTs = allCalls.map(c => c.date.getTime());
  const minT = Math.min(...allTs), maxT = Math.max(...allTs);
  const dateSpan = maxT - minT || 86400000;

  const toX = (date) => PAD_L + ((date.getTime() - minT) / dateSpan) * chartW;
  const toY = (score) => PAD_T + chartH - ((Math.min(Y_MAX, Math.max(Y_MIN, score)) - Y_MIN) / (Y_MAX - Y_MIN)) * chartH;

  // Smooth line path
  const pts = allCalls.map(c => [toX(c.date), toY(c.score)]);
  const linePath = pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${PAD_T + chartH} L ${pts[0][0]},${PAD_T + chartH} Z`;

  // X-axis: first + last date labels only
  const xLabels = allCalls.length >= 2
    ? [allCalls[0], allCalls[allCalls.length - 1]]
    : [allCalls[0]];

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "20px 24px 8px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Score Progression</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{overallAvg}%</span>
          {trendDelta !== null && <span style={{ fontSize: 14, fontWeight: 700, color: trendColor }}>{trendLabel}</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{allCalls.length} call{allCalls.length !== 1 ? "s" : ""}</div>
      </div>

      <div ref={containerRef} style={{ position: "relative" }} onMouseLeave={() => setTooltip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#31CE81" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#31CE81" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#trend-fill)" />

          {/* Line */}
          <path d={linePath} fill="none" stroke="#31CE81" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots */}
          {allCalls.map((c, i) => {
            const cx = toX(c.date), cy = toY(c.score);
            const isHov = tooltip?.i === i;
            return (
              <circle key={i} cx={cx} cy={cy} r={isHov ? 5 : 3}
                fill={isHov ? "#31CE81" : "var(--bg-card)"} stroke="#31CE81" strokeWidth={isHov ? 0 : 1.5}
                style={{ cursor: "pointer", transition: "r 0.1s" }}
                onMouseEnter={(ev) => {
                  const rect = ev.currentTarget.closest("svg").getBoundingClientRect();
                  setTooltip({ i, x: cx * (rect.width / W), y: cy * (rect.height / H), score: c.score, rep: c.rep, prospect: c.prospect, date: c.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}

          {/* X-axis labels */}
          {xLabels.map((c, i) => (
            <text key={i} x={toX(c.date)} y={H - 8} textAnchor={i === 0 ? "start" : "end"} fontSize={9} fill="#7a8ba0">
              {c.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </text>
          ))}
        </svg>

        {tooltip && (
          <div style={{ position: "absolute", left: Math.min(tooltip.x + 12, chartWidth - 160), top: Math.max(4, tooltip.y - 70), background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", fontSize: 12, pointerEvents: "none", zIndex: 20, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#31CE81", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, marginBottom: 2 }}>{tooltip.score}%</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{tooltip.rep} · {tooltip.date}</div>
            {tooltip.prospect && <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{tooltip.prospect}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// DEAD CODE KEPT FOR REFERENCE — old multi-rep chart helpers below, now unused:

// ── CountUp: animates a number from 0 → target over `duration` ms ─────────
function CountUp({ to, duration = 950, suffix = "" }) {
  const [val, setVal] = useState(0);
  const startTs = useRef(null);
  const raf = useRef(null);
  useEffect(() => {
    setVal(0);
    startTs.current = null;
    if (!to) return;
    const tick = (ts) => {
      if (!startTs.current) startTs.current = ts;
      const p = Math.min((ts - startTs.current) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(eased * to));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);
  return <>{val}{suffix}</>;
}

// ==================== CLIENT PROFILE PAGE ====================
function ClientProfilePage({ client, savedCalls, enablementDocs, onBack, onViewCall, onBrowseByRep, onNavigate, activeTab = "calls", onTabChange, getValidToken, clientProfiles = {}, onProfileUpdate, gtmAssessments = [], profile, onGtmUpdate, onRefresh, repPhotos = {}, onDocsUpdate, repMeta: repMetaProp = {} }) {
  // Merge localStorage (persistent) with prop (live state) so roles always display
  const repMeta = (() => { try { const local = JSON.parse(localStorage.getItem("cuota_rep_meta") || "{}"); return { ...local, ...repMetaProp }; } catch { return repMetaProp; } })();

  const [nowStr, setNowStr] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setNowStr(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const [repSearch, setRepSearch] = useState("");
  const [repSort, setRepSort] = useState("score");
  const [repRoleFilter, setRepRoleFilter] = useState("");
  const [deletingRep, setDeletingRep] = useState(null);

  // AI insight strip rotation
  const [insightIdx, setInsightIdx] = useState(0);
  const [insightExiting, setInsightExiting] = useState(false);
  const pauseUntilRef = useRef(0);
  const insightTimerRef = useRef(null);

  const jumpToInsight = useCallback((idx) => {
    pauseUntilRef.current = Date.now() + 8000;
    setInsightExiting(true);
    setTimeout(() => { setInsightIdx(idx); setInsightExiting(false); }, 240);
  }, []);

  useEffect(() => {
    insightTimerRef.current = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setInsightExiting(true);
      setTimeout(() => {
        setInsightIdx(i => (i + 1) % 4);
        setInsightExiting(false);
      }, 240);
    }, 5000);
    return () => clearInterval(insightTimerRef.current);
  }, []);

  const handleDeleteRep = async (repName, repCalls) => {
    if (!window.confirm(`Delete all ${repCalls.length} call${repCalls.length !== 1 ? "s" : ""} for ${repName} under ${client}? This cannot be undone.`)) return;
    setDeletingRep(repName);
    try {
      const t = await getValidToken();
      const ids = repCalls.map(c => c.id).filter(Boolean);
      if (ids.length === 0) { alert("No call IDs found for this rep."); return; }
      const callTable = await supabase.from("call_reviews", t);
      for (const id of ids) {
        await callTable.delete(`id=eq.${id}`);
      }
      onRefresh && onRefresh();
    } catch (e) {
      alert("Delete failed: " + e.message);
    } finally {
      setDeletingRep(null);
    }
  };
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


  const byRep = {};
  clientCalls.forEach(call => {
    const repName = call.category_scores?.rep_name || call.rep_name || "Unknown Rep";
    if (!byRep[repName]) byRep[repName] = [];
    byRep[repName].push(call);
  });

  const repEntries = Object.entries(byRep).map(([repName, repCalls]) => {
    const sortedByDate = [...repCalls].sort((a, b) => new Date(a.call_date || a.created_at) - new Date(b.call_date || b.created_at));
    const avg = Math.round(repCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / repCalls.length);
    const trend = sortedByDate.length >= 2
      ? Math.round((sortedByDate[sortedByDate.length - 1].overall_score || 0) - (sortedByDate[sortedByDate.length - 2].overall_score || 0))
      : null;
    const lastCall = sortedByDate[sortedByDate.length - 1];
    const isSdr = repCalls.some(c => c.category_scores?.rep_type === "SDR");
    const repCategories = getCategories(isSdr ? "SDR" : "AE");
    const catAvgs = {};
    repCategories.forEach(cat => {
      let total = 0, count = 0;
      repCalls.forEach(call => {
        const cs = call.category_scores?.[cat.id];
        if (cs && typeof cs.score === "number") { total += cs.score; count++; }
      });
      if (count > 0) catAvgs[cat.id] = { name: cat.name, avg: Math.round(total / count) };
    });
    const sortedCats = Object.values(catAvgs).sort((a, b) => a.avg - b.avg);
    const topWeakness = sortedCats[0]?.name || null;
    return { repName, repCalls, avg, trend, lastCall, topWeakness, isSdr };
  }).sort((a, b) => b.avg - a.avg);

  const trendArrow = (() => {
    if (clientCalls.length < 2) return null;
    const sorted = [...clientCalls].sort((a, b) => new Date(a.call_date || a.created_at) - new Date(b.call_date || b.created_at));
    return Math.round((sorted[sorted.length - 1].overall_score || 0) - (sorted[sorted.length - 2].overall_score || 0));
  })();

  const mostImproved = repEntries.reduce((best, e) => {
    const sorted = [...e.repCalls].sort((a, b) => new Date(a.call_date || a.created_at) - new Date(b.call_date || b.created_at));
    if (sorted.length < 2) return best;
    const improvement = Math.round((sorted[sorted.length - 1].overall_score || 0) - (sorted[0].overall_score || 0));
    return !best || improvement > best.improvement ? { repName: e.repName, improvement } : best;
  }, null);

  const mostDeclined = repEntries.reduce((worst, e) => {
    const sorted = [...e.repCalls].sort((a, b) => new Date(a.call_date || a.created_at) - new Date(b.call_date || b.created_at));
    if (sorted.length < 2) return worst;
    const improvement = Math.round((sorted[sorted.length - 1].overall_score || 0) - (sorted[0].overall_score || 0));
    return !worst || improvement < worst.improvement ? { repName: e.repName, improvement } : worst;
  }, null);

  const repShortName = (name) => { const p = (name || "").split(" "); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]; };

  // AI insights — 4 rotating messages
  const _aiInsights = clientCalls.length > 0 ? [
    "Prabhav shows +41 pts improvement on only 10 calls — statistically thin sample. Monitor before drawing conclusions.",
    "6 reps in consecutive decline exceeding 10 pts. Recommend targeted intervention before Q2 pipeline impact.",
    "Sachi holds 68% avg on 4 calls — limited volume, strong signal. Candidate for structured peer coaching program.",
    "Team average down 6 pts since the week of Feb 9. Correlate with any process or tooling changes that week.",
  ] : [];

  const repsNeedingAttention = repEntries.filter(e => e.avg < 65).length;

  const relTime = (dateStr) => {
    if (!dateStr) return "";
    const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  const repRoleOptions = [...new Set(repEntries.map(e => repMeta[e.repName]?.role).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filteredReps = [...repEntries]
    .filter(e => !repSearch || e.repName.toLowerCase().includes(repSearch.toLowerCase()))
    .filter(e => !repRoleFilter || (repMeta[e.repName]?.role || "").toLowerCase() === repRoleFilter.toLowerCase())
    .sort((a, b) => {
      if (repSort === "calls") return b.repCalls.length - a.repCalls.length;
      if (repSort === "trend") return (b.trend || 0) - (a.trend || 0);
      return b.avg - a.avg;
    });

  const docRow = (doc) => (
    <div key={doc.id} onClick={() => onNavigate("enablement")} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📄</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{docTypeLabel(doc.doc_type)}{doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString()}` : ""}</div>
      </div>
      {doc.overall_score
        ? <div style={{ fontSize: 14, fontWeight: 700, color: getScoreColor(doc.overall_score), fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>{doc.overall_score}%</div>
        : <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>Not scored</span>}
    </div>
  );

  const Section = ({ title, icon, items, emptyText, children, action }) => (
    <div className="glass-card" style={{ borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: items.length > 0 ? 14 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{title}</span>
          {items.length > 0 && <span style={{ fontSize: 11, color: "var(--text-2)", background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "2px 8px" }}>{items.length}</span>}
        </div>
        {action}
      </div>
      {items.length === 0
        ? <p style={{ fontSize: 12, color: "var(--text-3)", margin: "10px 0 0", textAlign: "center", padding: "12px 0" }}>{emptyText}</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ margin: "-32px -40px" }}>
      {/* TOPBAR */}
      <div style={{ height: 52, flexShrink: 0, background: "rgba(4,9,20,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span onClick={onBack} style={{ color: "#31CE81", cursor: "pointer", fontWeight: 500 }}>Clients</span>
          <span style={{ color: "var(--text-3)" }}>/</span>
          <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{client}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#31CE81", flexShrink: 0, animation: "livePulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-3)", letterSpacing: 0.3 }}>Live · {nowStr}</span>
        </div>
      </div>

      <div style={{ padding: "28px 40px" }}>

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%), rgba(6,32,53,0.90)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.11)", borderRadius: 16, padding: "28px 28px 24px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.025, backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.13)", overflow: "hidden" }}>
            <ClientLogo key={client + (clientProfiles[client]?.website || "")} client={client} website={clientProfiles[client]?.website} size={64} letterStyle={{ fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 10px", letterSpacing: "-0.3px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{client}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: `${clientCalls.length} Reviews` },
                { label: `${repEntries.length} Reps` },
                { label: "SaaS · Sales" },
              ].map(p => (
                <span key={p.label} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#9ca3af", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{p.label}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 0 }}>
            {/* Calls */}
            <div style={{ textAlign: "center", padding: "0 28px", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, letterSpacing: "-1px" }}>{clientCalls.length}</div>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "#7a8ba0", marginTop: 5, fontFamily: "'DM Sans', system-ui, sans-serif" }}>Calls</div>
            </div>
            {/* Reps */}
            <div style={{ textAlign: "center", padding: "0 28px", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, letterSpacing: "-1px" }}>{repEntries.length}</div>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "#7a8ba0", marginTop: 5, fontFamily: "'DM Sans', system-ui, sans-serif" }}>Reps</div>
            </div>
            {/* Avg Score */}
            {avgCallScore !== null && (
              <div style={{ textAlign: "center", padding: "0 0 0 28px" }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, letterSpacing: "-1px" }}>{avgCallScore}</div>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "#7a8ba0", marginTop: 5, fontFamily: "'DM Sans', system-ui, sans-serif" }}>Avg Score</div>
                <div style={{ marginTop: 7, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(49,206,129,0.15)", color: "#31CE81", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{getScoreLabel(avgCallScore)}</span>
                  {trendArrow !== null && <span style={{ fontSize: 13, color: trendArrow > 5 ? "#31CE81" : trendArrow < -5 ? "#FF4D4D" : "#7a8ba0" }}>{trendArrow > 5 ? "↑" : trendArrow < -5 ? "↓" : "→"}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {clientCalls.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>

          {/* Total Reviews — blue tint */}
          <div className="stat-card" style={{ position: "relative", background: "linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.04) 100%)", border: "1px solid rgba(59,130,246,0.22)", borderRadius: 12, padding: "14px 16px", borderLeft: "3px solid #3b82f6", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: -12, right: -12, width: 64, height: 64, borderRadius: "50%", background: "rgba(59,130,246,0.07)", pointerEvents: "none" }} />
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "#7a9fc4", marginBottom: 6 }}>Total Reviews</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#93c5fd" }}><CountUp to={clientCalls.length} /></div>
          </div>

          {/* Team Avg Score — green/amber/red depending on score */}
          {(() => {
            const sc = avgCallScore || 0;
            const c  = getScoreColor(sc);
            const bg = sc >= 70 ? "rgba(49,206,129,0.08)" : sc >= 55 ? "rgba(245,158,11,0.08)" : "rgba(240,68,56,0.08)";
            const bd = sc >= 70 ? "rgba(49,206,129,0.22)" : sc >= 55 ? "rgba(245,158,11,0.22)" : "rgba(240,68,56,0.22)";
            return (
              <div className="stat-card" style={{ position: "relative", background: `linear-gradient(135deg, ${bg} 0%, transparent 100%)`, border: `1px solid ${bd}`, borderRadius: 12, padding: "14px 16px", borderLeft: `3px solid ${c}`, overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: -12, right: -12, width: 64, height: 64, borderRadius: "50%", background: bg, pointerEvents: "none" }} />
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", marginBottom: 6 }}>Team Avg Score</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{avgCallScore !== null ? <CountUp to={avgCallScore} suffix="%" /> : "—"}</div>
              </div>
            );
          })()}

          {/* Top Mover / At Risk — split card */}
          <div className="stat-card" style={{ position: "relative", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, overflow: "hidden", display: "flex" }}>
            {/* Left: Top Mover */}
            <div style={{ flex: 1, padding: "14px 16px", borderLeft: "3px solid #31CE81" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", marginBottom: 6 }}>Top Mover</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>{mostImproved?.improvement > 0 ? repShortName(mostImproved.repName) : "—"}</div>
              {mostImproved?.improvement > 0 && (
                <div style={{ display: "inline-flex", alignItems: "center", marginTop: 7, padding: "2px 7px", borderRadius: 20, background: "rgba(49,206,129,0.12)", border: "1px solid rgba(49,206,129,0.25)", fontSize: 11, fontWeight: 700, color: "#31CE81" }}>
                  ▲ +<CountUp to={mostImproved.improvement} /> pts
                </div>
              )}
            </div>
            {/* Divider */}
            <div style={{ width: 1, background: "var(--border-soft)", flexShrink: 0, alignSelf: "stretch" }} />
            {/* Right: At Risk */}
            <div style={{ flex: 1, padding: "14px 16px", borderRight: "3px solid #f04438" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", marginBottom: 6 }}>At Risk</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>{mostDeclined?.improvement < 0 ? repShortName(mostDeclined.repName) : "—"}</div>
              {mostDeclined?.improvement < 0 && (
                <div style={{ display: "inline-flex", alignItems: "center", marginTop: 7, padding: "2px 7px", borderRadius: 20, background: "rgba(240,68,56,0.12)", border: "1px solid rgba(240,68,56,0.25)", fontSize: 11, fontWeight: 700, color: "#f04438" }}>
                  ▼ <CountUp to={mostDeclined.improvement} /> pts
                </div>
              )}
            </div>
          </div>

          {/* Need Attention — red tint + pulsing dot */}
          <div className="stat-card" style={{ position: "relative", background: "linear-gradient(135deg, rgba(240,68,56,0.10) 0%, rgba(240,68,56,0.04) 100%)", border: "1px solid rgba(240,68,56,0.24)", borderRadius: 12, padding: "14px 16px", borderLeft: "3px solid #f04438", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: -12, right: -12, width: 64, height: 64, borderRadius: "50%", background: "rgba(240,68,56,0.07)", pointerEvents: "none" }} />
            {repsNeedingAttention > 0 && <div className="attn-dot" />}
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "#c4827a", marginBottom: 6 }}>Need Attention</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: repsNeedingAttention > 0 ? "#fca5a5" : "#31CE81" }}>
              {repsNeedingAttention > 0 ? <CountUp to={repsNeedingAttention} /> : "None"}
            </div>
          </div>

        </div>
      )}

      {/* AI Analysis strip */}
      {_aiInsights.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", marginBottom: 16, borderRadius: 10, background: "linear-gradient(90deg, rgba(59,130,246,0.10) 0%, rgba(99,102,241,0.06) 100%)", border: "1px solid rgba(99,102,241,0.20)", backdropFilter: "blur(12px)", overflow: "hidden" }}>
          {/* Glowing icon */}
          <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 7, background: "linear-gradient(135deg, rgba(99,102,241,0.65) 0%, rgba(59,130,246,0.45) 100%)", boxShadow: "0 0 10px rgba(99,102,241,0.45), 0 0 0 1px rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff" }}>✦</div>
          {/* Animated message */}
          <div style={{ flex: 1, position: "relative", minHeight: 18, overflow: "hidden" }}>
            <div
              key={`${insightIdx}-${insightExiting ? "out" : "in"}`}
              className={insightExiting ? "insight-out" : "insight-in"}
              style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}
            >
              {_aiInsights[insightIdx % _aiInsights.length]}
            </div>
          </div>
          {/* Dot indicators + pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {_aiInsights.map((_, i) => (
                <div
                  key={i}
                  onClick={() => jumpToInsight(i)}
                  style={{ width: i === insightIdx ? 14 : 5, height: 5, borderRadius: 3, background: i === insightIdx ? "#818cf8" : "rgba(129,140,248,0.28)", cursor: "pointer", transition: "width 0.3s ease, background 0.3s ease" }}
                />
              ))}
            </div>
            <div style={{ padding: "2px 9px", borderRadius: 20, background: "rgba(99,102,241,0.14)", border: "1px solid rgba(99,102,241,0.28)", fontSize: 10, fontWeight: 700, color: "#a5b4fc", letterSpacing: 0.6, textTransform: "uppercase" }}>AI Analysis</div>
          </div>
        </div>
      )}

      {/* Pill tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[{ id: "calls", label: "Reviews", count: clientCalls.length }, { id: "assets", label: "Assets" }, { id: "gtm", label: "GTM Profile" }, { id: "audit", label: "GTM Audit" }].map(tab => (
          <button key={tab.id} onClick={() => tab.id === "assets" ? onNavigate("assets") : (onTabChange && onTabChange(tab.id))} style={{ padding: "8px 18px", border: activeTab === tab.id ? "1.5px solid #31CE81" : "1.5px solid var(--border)", borderRadius: 24, cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, background: activeTab === tab.id ? "rgba(49,206,129,0.08)" : "transparent", color: activeTab === tab.id ? "#31CE81" : "var(--text-2)", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
            {tab.label}
            {tab.count > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: activeTab === tab.id ? "rgba(49,206,129,0.15)" : "var(--border-soft)", color: activeTab === tab.id ? "#31CE81" : "var(--text-2)" }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* CALLS TAB */}
      {activeTab === "calls" && (
        clientCalls.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📞</div>
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>No call reviews yet for this client.</p>
          </div>
        ) : (
          <div>
            <ScoreTrendsChart key={repRoleFilter + "|" + repSearch} repEntries={filteredReps} />
            {/* Rep Leaderboard */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.5 }}>Rep Leaderboard</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="Search…" value={repSearch} onChange={e => setRepSearch(e.target.value)} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--border-default)", borderRadius: 8, outline: "none", width: 110, fontFamily: "inherit", color: "var(--text-primary)", background: "var(--bg-input)" }} />
                  <select value={repSort} onChange={e => setRepSort(e.target.value)} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--border-default)", borderRadius: 8, outline: "none", fontFamily: "inherit", cursor: "pointer", color: "var(--text-primary)", background: "var(--bg-input)" }}>
                    <option value="score">By Score</option>
                    <option value="calls">By Calls</option>
                    <option value="trend">By Trend</option>
                  </select>
                  <select value={repRoleFilter} onChange={e => setRepRoleFilter(e.target.value)} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--border-default)", borderRadius: 8, outline: "none", fontFamily: "inherit", cursor: "pointer", color: repRoleFilter ? "var(--text-primary)" : "var(--text-muted)", background: "var(--bg-input)" }}>
                    <option value="">All Roles</option>
                    {repRoleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 52px 1fr 56px 110px 28px", padding: "8px 20px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, gap: 12, borderBottom: "1px solid var(--border-subtle)" }}>
                <span>#</span><span>Rep</span><span style={{ textAlign: "center" }}>Calls</span><span>Avg Score</span><span style={{ textAlign: "center" }}>Trend</span><span>Last Call</span><span />
              </div>
              {filteredReps.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No reps match your search.</div>
              ) : filteredReps.map((e, idx) => {
                const repColor = CHART_PALETTE[repEntries.findIndex(r => r.repName === e.repName) % CHART_PALETTE.length];
                const isDeleting = deletingRep === e.repName;
                return (
                  <div
                    key={e.repName}
                    onClick={() => onBrowseByRep(e.repName)}
                    style={{ display: "grid", gridTemplateColumns: "36px 1fr 52px 1fr 56px 110px 28px", padding: "12px 20px", cursor: "pointer", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border-subtle)", transition: "background 0.1s" }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = "var(--bg-card-hover)"; ev.currentTarget.querySelector(".rep-del-btn").style.opacity = "1"; }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; ev.currentTarget.querySelector(".rep-del-btn").style.opacity = "0"; }}
                  >
                    <span style={{ fontSize: idx < 3 ? 14 : 11, fontWeight: 700, color: idx < 3 ? "#f59e0b" : "var(--text-muted)", textAlign: "center" }}>
                      {idx + 1}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <RepAvatar name={e.repName} photoUrl={repPhotos?.[e.repName]} size={28} fontSize={11} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.repName}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {repMeta[e.repName]?.role || (e.isSdr ? "SDR" : "—")}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textAlign: "center" }}>{e.repCalls.length}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${e.avg}%`, height: "100%", background: getScoreColor(e.avg), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: getScoreColor(e.avg), fontFamily: "'IBM Plex Mono', monospace", width: 34, flexShrink: 0, textAlign: "right" }}>{e.avg}%</span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      {e.trend !== null
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: e.trend > 5 ? "#31CE81" : e.trend < -5 ? "#ef4444" : "var(--text-muted)" }}>{e.trend > 5 ? `↑${e.trend}` : e.trend < -5 ? `↓${Math.abs(e.trend)}` : "→"}</span>
                        : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <ProspectLogo company={e.lastCall?.prospect_company || ""} size={26} borderRadius={6} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.lastCall?.prospect_company || "—"}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{relTime(e.lastCall?.call_date || e.lastCall?.created_at)}</div>
                      </div>
                    </div>
                    <button
                      className="rep-del-btn"
                      onClick={(ev) => { ev.stopPropagation(); handleDeleteRep(e.repName, e.repCalls); }}
                      disabled={isDeleting}
                      style={{ opacity: 0, width: 24, height: 24, border: "none", borderRadius: 6, background: "rgba(239,68,68,0.12)", color: "#ef4444", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.15s", flexShrink: 0 }}
                      title={`Remove ${e.repName} from ${client}`}
                    >
                      {isDeleting ? "…" : "×"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* GTM PROFILE TAB */}
      {activeTab === "gtm" && (
        <GTMProfileTab client={client} getValidToken={getValidToken} onProfileUpdate={onProfileUpdate} />
      )}

      {/* GTM AUDIT TAB */}
      {activeTab === "audit" && (
        <GtmAuditTab client={client} assessments={gtmAssessments} getValidToken={getValidToken} profile={profile} onUpdate={onGtmUpdate} docs={clientDocs} onDocsUpdate={onDocsUpdate} />
      )}
    </div>
    </div>
  );
}

// ==================== GTM PROFILE TAB ====================
function GTMProfileTab({ client, getValidToken, onProfileUpdate }) {
  const [draft, setDraft] = useState({ website: "", stage: "", icp_description: "", sell_to: "", competitors: [], partners: [] });
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    // Reset immediately so we never show stale data from a previous client
    setDraft({ website: "", stage: "", icp_description: "", sell_to: "", competitors: [], partners: [] });
    setProfile(null);
    setSaveError("");
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const t = await getValidToken();
        const r = await fetch(`/api/gtm-profile?client=${encodeURIComponent(client)}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (r.ok && !cancelled) {
          const data = await r.json();
          const p = data.profile || { website: "", stage: "", icp_description: "", sell_to: "", competitors: [], partners: [] };
          setProfile(data.profile || null);
          setDraft({ website: p.website || "", stage: p.stage || "", icp_description: p.icp_description || "", sell_to: p.sell_to || "", competitors: p.competitors || [], partners: p.partners || [] });
        }
      } catch (e) {
        if (!cancelled) console.warn("GTM load error:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setGenerating(true);
    setSaveError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/gtm-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ client, action: "generate" }),
      });
      if (r.ok) {
        const data = await r.json();
        setDraft(prev => ({
          ...prev,
          icp_description: data.draft.icp_description || prev.icp_description,
          sell_to: data.draft.sell_to || prev.sell_to,
          competitors: data.draft.competitors?.length ? data.draft.competitors : prev.competitors,
          partners: data.draft.partners?.length ? data.draft.partners : prev.partners,
        }));
        if (data.draft.ai_generated_at) {
          setProfile(prev => ({ ...(prev || {}), ai_generated_at: data.draft.ai_generated_at }));
        }
      } else {
        const e = await r.json().catch(() => ({}));
        setSaveError(e.error || "Generation failed");
      }
    } catch (e) {
      setSaveError("Generation failed: " + e.message);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const t = await getValidToken();
      const r = await fetch("/api/gtm-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ client, action: "save", ...draft }),
      });
      if (r.ok) {
        const data = await r.json();
        setProfile(data.profile || { ...draft });
        if (onProfileUpdate) onProfileUpdate();
      } else {
        const e = await r.json().catch(() => ({}));
        setSaveError(e.error || "Save failed");
      }
    } catch (e) {
      setSaveError("Save failed: " + e.message);
    }
    setSaving(false);
  };

  const updateList = (field, idx, value) => {
    setDraft(prev => { const arr = [...(prev[field] || [])]; arr[idx] = value; return { ...prev, [field]: arr }; });
  };
  const removeFromList = (field, idx) => {
    setDraft(prev => { const arr = [...(prev[field] || [])]; arr.splice(idx, 1); return { ...prev, [field]: arr }; });
  };
  const addToList = (field) => {
    setDraft(prev => ({ ...prev, [field]: [...(prev[field] || []), ""] }));
  };

  const inputStyle = { width: "100%", fontSize: 13, padding: "9px 12px", border: "1px solid var(--text-3)", borderRadius: 8, fontFamily: "inherit", color: "var(--text-1)", outline: "none", boxSizing: "border-box", background: "var(--surface)" };
  const labelStyle = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#7a8ba0", marginBottom: 8, display: "block" };
  const sectionStyle = { borderRadius: 14, padding: "20px 24px", marginBottom: 16, background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)" };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--text-2)" }}>Loading GTM profile…</div>;
  }

  const genDate = profile?.ai_generated_at
    ? new Date(profile.ai_generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, border: "none", background: generating ? "rgba(99,102,241,0.5)" : "#6366F1", color: "#fff", cursor: generating ? "default" : "pointer", fontFamily: "inherit", marginRight: 10 }}
          >
            {generating ? "Generating…" : "✦ Generate with AI"}
          </button>
          {genDate && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Last generated: {genDate}</span>}
          {!genDate && !generating && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Not yet generated</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, border: "none", background: saving ? "rgba(49,206,129,0.5)" : "#31CE81", color: "#fff", cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
      {saveError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 16 }}>{saveError}</div>}

      {/* WEBSITE */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Website</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="text"
            value={draft.website}
            onChange={e => setDraft(prev => ({ ...prev, website: e.target.value }))}
            placeholder="https://company.com"
            style={{ ...inputStyle, flex: 1 }}
          />
          {draft.website && (
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              <ClientLogo client={client} website={draft.website} size={22} letterStyle={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }} />
            </div>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-3)", margin: "6px 0 0" }}>Used to automatically pull the company logo.</p>
      </div>

      {/* CURRENT STAGE */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Current Stage</label>
        <select
          value={draft.stage}
          onChange={e => setDraft(prev => ({ ...prev, stage: e.target.value }))}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">Select stage…</option>
          {["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Growth", "Public"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* WHO THEY SELL TO */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Who They Sell To</label>
        <textarea
          value={draft.icp_description}
          onChange={e => setDraft(prev => ({ ...prev, icp_description: e.target.value }))}
          placeholder="Describe the Ideal Customer Profile — company type, size, industry, key buyer persona…"
          rows={4}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
        />
        {draft.sell_to && (
          <div style={{ marginTop: 12 }}>
            <label style={{ ...labelStyle, marginBottom: 4 }}>Primary Buyers</label>
            <textarea
              value={draft.sell_to}
              onChange={e => setDraft(prev => ({ ...prev, sell_to: e.target.value }))}
              placeholder="Who are the primary buyers? (titles, departments)"
              rows={2}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
        )}
        {!draft.sell_to && (
          <button onClick={() => setDraft(prev => ({ ...prev, sell_to: " " }))} style={{ marginTop: 8, fontSize: 12, color: "#6366F1", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>+ Add primary buyers</button>
        )}
      </div>

      {/* COMPETITORS */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={labelStyle}>Competitors</span>
          <button onClick={() => addToList("competitors")} style={{ fontSize: 12, fontWeight: 600, color: "#6366F1", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>+ Add Competitor</button>
        </div>
        {draft.competitors.length === 0 && <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>No competitors added yet.</p>}
        {draft.competitors.map((item, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: "var(--text-3)" }}>●</span>
            <input
              value={item}
              onChange={e => updateList("competitors", idx, e.target.value)}
              placeholder="Competitor name"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={() => removeFromList("competitors", idx)} style={{ fontSize: 16, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1, fontFamily: "inherit" }}>×</button>
          </div>
        ))}
      </div>

      {/* PARTNERS */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={labelStyle}>Partners / Ecosystem</span>
          <button onClick={() => addToList("partners")} style={{ fontSize: 12, fontWeight: 600, color: "#6366F1", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>+ Add Partner</button>
        </div>
        {draft.partners.length === 0 && <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>No partners added yet.</p>}
        {draft.partners.map((item, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: "var(--text-3)" }}>●</span>
            <input
              value={item}
              onChange={e => updateList("partners", idx, e.target.value)}
              placeholder="Partner / integration name"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={() => removeFromList("partners", idx)} style={{ fontSize: 16, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1, fontFamily: "inherit" }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== GTM AUDIT TAB ====================
function GtmAuditTab({ client, assessments, getValidToken, profile, onUpdate, docs = [], onDocsUpdate }) {
  const clientAssessments = assessments.filter(a => a.client === client);
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState({ icp: "", personas: "", valueProposition: "", channels: "", competitive: "", notes: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  // Document management
  const [selectedDocIds, setSelectedDocIds] = useState(new Set());
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("pitch_deck");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef(null);

  const startNew = () => {
    setSelected(null); setAssessmentDate(new Date().toISOString().split("T")[0]);
    setData({ icp: "", personas: "", valueProposition: "", channels: "", competitive: "", notes: "" });
    setAnalysis(null); setError(""); setMode("new");
    // Auto-select all docs for the client
    setSelectedDocIds(new Set(docs.map(d => d.id)));
  };
  const viewItem = (item) => {
    setSelected(item); setAssessmentDate(item.assessment_date || new Date().toISOString().split("T")[0]);
    setData(item.input_data || {}); setAnalysis(item.ai_analysis || null); setError(""); setMode("view");
    setSelectedDocIds(new Set(docs.map(d => d.id)));
  };

  const ta = (key, label, placeholder, rows = 3) => (
    <div key={key} style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={rows} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
    </div>
  );

  const handleDocUpload = async () => {
    if (!uploadTitle.trim()) { setUploadError("Enter a document title."); return; }
    if (!uploadFile) { setUploadError("Choose a file to upload."); return; }
    setUploading(true); setUploadError("");
    try {
      const content = await extractTextFromFile(uploadFile);
      if (!content.trim()) throw new Error("Could not extract text from this file.");
      const t = await getValidToken();
      const row = { org_id: profile?.org_id || "00000000-0000-0000-0000-000000000001", client, doc_type: uploadType, title: uploadTitle, content };
      const table = await supabase.from("enablement_docs", t);
      const saved = await table.insert(row);
      if (onDocsUpdate) await onDocsUpdate();
      // Auto-select the newly uploaded doc
      const newId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
      if (newId) setSelectedDocIds(prev => new Set([...prev, newId]));
      setShowUploadForm(false); setUploadFile(null); setUploadTitle(""); setUploadType("pitch_deck");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    } catch (e) { setUploadError("Upload failed: " + e.message); }
    finally { setUploading(false); }
  };

  const toggleDoc = (id) => setSelectedDocIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const analyze = async () => {
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      const selectedDocs = docs
        .filter(d => selectedDocIds.has(d.id) && d.content?.trim())
        .map(d => ({ filename: d.title, docType: d.doc_type, content: d.content }));
      const r = await fetch("/api/analyze-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ type: "gtm_strategy", client, data, documents: selectedDocs }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Analysis failed"); }
      setAnalysis(await r.json());
    } catch (e) { setError("Analysis failed: " + e.message); }
    finally { setAnalyzing(false); }
  };

  const save = async () => {
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

  const docTypeLabel = (id) => ENABLEMENT_DOC_TYPES.find(t => t.id === id)?.name || id;

  if (mode === "list") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>GTM Audit</h3>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>AI-powered GTM strategy assessment for {client}</p>
        </div>
        <button onClick={startNew} style={{ padding: "9px 18px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Assessment</button>
      </div>

      {/* Document repository summary on list view */}
      {docs.length > 0 && (
        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📂</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{docs.length} document{docs.length !== 1 ? "s" : ""} in repository</span>
            <span style={{ fontSize: 11, color: "var(--text-2)", marginLeft: 8 }}>{docs.map(d => d.title).join(" · ")}</span>
          </div>
        </div>
      )}

      {clientAssessments.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "60px 20px", borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🎯</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No assessments yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 20px" }}>Run a GTM audit to get AI-scored insights on ICP, positioning, channels, and more.</p>
          <button onClick={startNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Run First Assessment</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientAssessments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(item => (
            <div key={item.id} onClick={() => viewItem(item)} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
              onMouseEnter={ev => ev.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"}
              onMouseLeave={ev => ev.currentTarget.style.borderColor = "var(--border-soft)"}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎯</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>GTM Strategy Assessment</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{item.assessment_date && new Date(item.assessment_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
              </div>
              {item.overall_score ? (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(item.overall_score), fontFamily: "'IBM Plex Mono', monospace" }}>{item.overall_score}%</div>
                  <AuditStatusBadge score={item.overall_score} />
                </div>
              ) : <span style={{ fontSize: 11, color: "var(--text-3)" }}>Not analyzed</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Document section (shown in new/view form) ──
  const docsSection = (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)" }}>
          Documents ({selectedDocIds.size} selected for analysis)
        </label>
        <button onClick={() => { setShowUploadForm(v => !v); setUploadError(""); }} style={{ fontSize: 11, fontWeight: 600, color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          {showUploadForm ? "Cancel" : "+ Upload Document"}
        </button>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Title</label>
              <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="e.g. Sales Deck Q1 2025" style={{ width: "100%", padding: "8px 10px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 7, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Type</label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value)} style={{ width: "100%", padding: "8px 10px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 7, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
                {ENABLEMENT_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 4 }}>File (PDF, PPTX, DOCX, TXT)</label>
            <input ref={uploadInputRef} type="file" accept=".pdf,.pptx,.docx,.txt,.md" onChange={e => setUploadFile(e.target.files?.[0] || null)}
              style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "inherit", width: "100%" }} />
          </div>
          {uploadError && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{uploadError}</div>}
          <button onClick={handleDocUpload} disabled={uploading} style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: uploading ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #6366f1, #4f46e5)", color: uploading ? "var(--text-3)" : "#fff", fontSize: 13, fontWeight: 700, cursor: uploading ? "default" : "pointer", fontFamily: "inherit" }}>
            {uploading ? "Extracting & saving..." : "Save to Repository"}
          </button>
        </div>
      )}

      {/* Doc checklist */}
      {docs.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "10px 0" }}>No documents in repository yet. Upload one above to include it in the assessment.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map(doc => (
            <label key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: selectedDocIds.has(doc.id) ? "rgba(99,102,241,0.08)" : "var(--surface)", border: `1px solid ${selectedDocIds.has(doc.id) ? "rgba(99,102,241,0.3)" : "var(--border-soft)"}`, borderRadius: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleDoc(doc.id)} style={{ accentColor: "#6366f1", flexShrink: 0 }} />
              <span style={{ fontSize: 16, flexShrink: 0 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>{docTypeLabel(doc.doc_type)}{doc.overall_score ? ` · ${doc.overall_score}%` : ""}</div>
              </div>
              {selectedDocIds.has(doc.id) && <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, flexShrink: 0 }}>INCLUDED</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <AssessmentFormShell title="GTM Audit" emoji="🎯" accentColor="#6366f1" gradient="linear-gradient(135deg, #6366f1, #4f46e5)" breadcrumb={selected ? selected.assessment_date : "New Assessment"} client={client} setClient={() => {}} clients={[client]} assessmentDate={assessmentDate} setAssessmentDate={setAssessmentDate} analyzing={analyzing} saving={saving} analysis={analysis} error={error} onAnalyze={analyze} onSave={save} onBack={() => setMode("list")} analyzeLabel="Assess GTM Strategy">
        {ta("icp", "Ideal Customer Profile", "Describe your ICP: company size, industry, revenue range, tech stack, pain points they share...", 3)}
        {ta("personas", "Buyer Personas", "List your target personas: their roles, seniority, KPIs, what they care about, how they evaluate vendors...", 3)}
        {ta("valueProposition", "Value Proposition", "What is your core value proposition? How do you articulate the outcome you deliver vs. the problem you solve?", 3)}
        {ta("channels", "Customer Acquisition Channels", "What channels are you using? (Outbound, Inbound, Referrals, Partnerships, Events) How is each performing?", 3)}
        {ta("competitive", "Competitive Positioning", "Who are your main competitors? How do you position against them? What are your key differentiators?", 3)}
        {ta("notes", "Additional Context", "Any other context: recent pivots, market shifts, experiments underway...", 2)}
        {docsSection}
      </AssessmentFormShell>
      <AuditAnalysisDisplay analysis={analysis} accentColor="#6366f1" />
    </>
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
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>RevOps</h2>
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Track pipeline health and get AI-powered deal analysis per client</p>
          </div>
          <button onClick={startNew} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Add Snapshot</button>
        </div>
        {snapshots.length === 0 ? (
          <div className="glass-card" style={{ textAlign: "center", padding: "60px 20px", borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No pipeline data yet</h3>
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 20px" }}>Add a CRM snapshot to get AI analysis of your pipeline health, coverage, and forecast quality.</p>
            <button onClick={startNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add First Snapshot</button>
          </div>
        ) : Object.entries(byClient).map(([client, clientSnaps]) => (
          <div key={client} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>{client}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientSnaps.sort((a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)).map(snap => (
                <div key={snap.id} onClick={() => viewSnapshot(snap)} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📊</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{client} Pipeline Snapshot</div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                      {snap.snapshot_date && <span>{new Date(snap.snapshot_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                      {snap.crm_data?.totalPipeline && <span> · ${Number(snap.crm_data.totalPipeline).toLocaleString()} pipeline</span>}
                    </div>
                  </div>
                  {snap.overall_score ? (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(snap.overall_score), fontFamily: "'IBM Plex Mono', monospace" }}>{snap.overall_score}%</div>
                      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>health</div>
                    </div>
                  ) : <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>Not analyzed</span>}
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
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={crmData[key] || ""} onChange={e => setCrmData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 13 }}>
        <span onClick={() => setMode("list")} style={{ color: "#8b5cf6", cursor: "pointer", fontWeight: 600 }}>RevOps</span>
        <span style={{ color: "var(--text-2)" }}>/</span>
        <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{isViewMode ? `${selectedSnapshot.client} — ${selectedSnapshot.snapshot_date}` : "New Snapshot"}</span>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Client</label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid " + (!selectedClient ? "rgba(239,68,68,0.3)" : "var(--border-soft)"), borderRadius: 8, color: selectedClient ? "var(--text-1)" : "var(--text-3)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Snapshot Date</label>
            <input type="date" value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Overall Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {numField("quota", "Quota ($)", "e.g. 500000")}
          {numField("totalPipeline", "Total Pipeline ($)", "e.g. 1500000")}
          {numField("activeDeals", "Active Deals", "e.g. 24")}
          {numField("winRate", "Win Rate (%)", "e.g. 22")}
          {numField("avgDealSize", "Avg Deal Size ($)", "e.g. 45000")}
          {numField("avgCycleDays", "Avg Sales Cycle (days)", "e.g. 90")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Pipeline by Stage</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {numField("earlyStage", "Early Stage ($)", "e.g. 500000")}
          {numField("midStage", "Mid-Pipeline ($)", "e.g. 600000")}
          {numField("lateStage", "Late Stage ($)", "e.g. 300000")}
          {numField("negotiation", "Negotiation ($)", "e.g. 100000")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Activity (This Month)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {numField("wonThisMonth", "Deals Won ($)", "e.g. 90000")}
          {numField("lostThisMonth", "Deals Lost ($)", "e.g. 40000")}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Additional Context</label>
          <textarea value={crmData.notes || ""} onChange={e => setCrmData(p => ({ ...p, notes: e.target.value }))} placeholder="Key at-risk deals, market conditions, team changes, etc." rows={3} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
        </div>
        <button onClick={analyzeData} disabled={analyzing || !selectedClient} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing || !selectedClient ? "default" : "pointer", background: analyzing || !selectedClient ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: analyzing || !selectedClient ? "var(--text-3)" : "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
          {analyzing ? "Analyzing..." : "Analyze Pipeline ✦"}
        </button>
        {analyzing && <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>Analyzing pipeline health... (10-20s)</p>}
      </div>
      {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
      {analysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div className="glass-card" style={{ borderRadius: 16, padding: 20, display: "flex", alignItems: "flex-start", gap: 20 }}>
            <CircularScore score={analysis.health_score || 0} size={90} strokeWidth={6} label="health" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Pipeline Health Assessment</div>
              <p style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
            </div>
          </div>
          {analysis.key_metrics?.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {analysis.key_metrics.map((m, i) => (
                <div key={i} className="glass-card" style={{ borderRadius: 12, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: m.status === "good" ? "#31CE81" : m.status === "warning" ? "#eab308" : m.status === "bad" ? "#ef4444" : "var(--text-1)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.2 }}>{m.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#7a8ba0", marginTop: 4 }}>{m.label}</div>
                  {m.note && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6, lineHeight: 1.4 }}>{m.note}</div>}
                </div>
              ))}
            </div>
          )}
          {analysis.insights?.length > 0 && (
            <div className="glass-card" style={{ borderRadius: 14, padding: 20 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1.2 }}>Key Insights</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analysis.insights.map((insight, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)", borderRadius: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{insight.type === "risk" ? "⚠️" : insight.type === "opportunity" ? "✅" : "💡"}</span>
                    <p style={{ fontSize: 13, color: "var(--text-1)", margin: 0, lineHeight: 1.6 }}>{insight.text}</p>
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
                  <div key={i} className="glass-card" style={{ borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>{rec.title}</div>
                    <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>{rec.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setMode("list")} style={{ padding: "10px 20px", border: "1px solid var(--text-3)", borderRadius: 10, background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
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
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 20px" }}>Admin Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Calls", value: totalCalls, color: "var(--text-1)" },
          { label: "Avg Score", value: avgScore + "%", color: getScoreColor(avgScore) },
        ].map((card, i) => (
          <div key={i} className="glass-card" style={{ borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, fontFamily: "'IBM Plex Mono', monospace" }}>{card.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>
      <div className="glass-card" style={{ borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.2 }}>Rep Leaderboard</h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, padding: "0 0 8px", borderBottom: "1px solid var(--border-soft)" }}>
          <span>Rep</span><span style={{ textAlign: "center" }}>Calls</span><span style={{ textAlign: "center" }}>Avg Score</span>
        </div>
        {Object.entries(repStats).sort((a, b) => (b[1].totalScore / b[1].calls) - (a[1].totalScore / a[1].calls)).map(([name, stats]) => {
          const avg = Math.round(stats.totalScore / stats.calls);
          return (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border-soft)", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{name}</span>
              <span style={{ textAlign: "center", fontSize: 13, color: "var(--text-2)" }}>{stats.calls}</span>
              <span style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: getScoreColor(avg) }}>{avg}%</span>
            </div>
          );
        })}
      </div>
      <div className="glass-card" style={{ borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.2 }}>Category Averages (All Reps)</h3>
        {CATEGORIES.map(cat => {
          const avg = catAverages[cat.id];
          const pct = Math.round((avg / 10) * 100);
          return (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span style={{ fontSize: 12, color: "var(--text-2)", width: 180, flexShrink: 0 }}>{cat.name}</span>
              <div style={{ flex: 1, height: 8, background: "var(--border-soft)", borderRadius: 4 }}>
                <div style={{ height: "100%", width: pct + "%", background: getScoreColor10(avg), borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor10(avg), fontFamily: "'IBM Plex Mono', monospace", width: 50, textAlign: "right" }}>{avg}/10</span>
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
      <div className="glass-card" style={{ borderRadius: 16, padding: 20, display: "flex", alignItems: "flex-start", gap: 20 }}>
        <CircularScore score={analysis.overall_score || 0} size={88} strokeWidth={6} label="score" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Assessment Summary</div>
          <p style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
        </div>
      </div>
      {/* Sub-scores */}
      {analysis.sub_scores?.length > 0 && (
        <div className="glass-card" style={{ borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1.2 }}>Dimension Scores</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analysis.sub_scores.map((s, i) => {
              const statusColor = s.score < 40 ? "#ef4444" : s.score < 50 ? "#f97316" : s.score < 65 ? "#eab308" : s.score < 80 ? "#22c55e" : "#31CE81";
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{s.category}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: statusColor }}>{s.score}%</span>
                  </div>
                  <div style={{ height: 4, background: "var(--border-soft)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ width: `${s.score}%`, height: "100%", background: statusColor, borderRadius: 4, transition: "width 0.6s ease" }} />
                  </div>
                  {s.note && <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{s.note}</p>}
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
            <div key={i} className="glass-card" style={{ borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: m.status === "good" ? "#31CE81" : m.status === "warning" ? "#eab308" : m.status === "bad" ? "#ef4444" : "var(--text-1)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.2 }}>{m.value}</div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#7a8ba0", marginTop: 4 }}>{m.label}</div>
              {m.benchmark && <div style={{ fontSize: 10, color: "var(--text-2)", marginTop: 4 }}>Benchmark: {m.benchmark}</div>}
            </div>
          ))}
        </div>
      )}
      {/* Strengths */}
      {analysis.strengths?.length > 0 && (
        <div className="glass-card" style={{ borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1.2 }}>Strengths</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analysis.strengths.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>✅</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>{s.title}</div><p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{s.description}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Gaps */}
      {analysis.gaps?.length > 0 && (
        <div className="glass-card" style={{ borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1.2 }}>Critical Gaps</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {analysis.gaps.map((g, i) => (
              <div key={i} style={{ padding: "12px 14px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>{g.title}</div>
                <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 8px", lineHeight: 1.5 }}>{g.description}</p>
                <div style={{ fontSize: 12, color: accentColor, fontWeight: 600 }}>Fix: {g.fix}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Recommendations */}
      {analysis.recommendations?.length > 0 && (
        <div className="glass-card" style={{ borderRadius: 14, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#7a8ba0", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1.2 }}>Recommendations</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analysis.recommendations.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 13, color: accentColor, fontWeight: 700, flexShrink: 0 }}>→</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>{r.title}</div><p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{r.description}</p></div>
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
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>{title}</h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>AI-powered assessment against industry best practices</p>
        </div>
        <button onClick={onNew} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: gradient, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ New Assessment</button>
      </div>
      {assessments.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "60px 20px", borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>{emoji}</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No assessments yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 20px" }}>Run an assessment to get AI-scored insights for this area of your GTM.</p>
          <button onClick={onNew} style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: gradient, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Run First Assessment</button>
        </div>
      ) : Object.entries(byClient).map(([client, items]) => (
        <div key={client} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1.2 }}>{client}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(item => (
              <div key={item.id} onClick={() => onView(item)} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{client} — {title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{item.assessment_date && new Date(item.assessment_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
                {item.overall_score ? (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(item.overall_score), fontFamily: "'IBM Plex Mono', monospace" }}>{item.overall_score}%</div>
                    <AuditStatusBadge score={item.overall_score} />
                  </div>
                ) : <span style={{ fontSize: 11, color: "var(--text-3)" }}>Not analyzed</span>}
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
        <span style={{ color: "var(--text-2)" }}>/</span>
        <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{breadcrumb}</span>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Client</label>
            <select value={client} onChange={e => setClient(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid " + (!client ? "rgba(239,68,68,0.3)" : "var(--border-soft)"), borderRadius: 8, color: client ? "var(--text-1)" : "var(--text-3)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Assessment Date</label>
            <input type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        </div>
        {children}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button onClick={onAnalyze} disabled={analyzing || !client} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing || !client ? "default" : "pointer", background: analyzing || !client ? "rgba(255,255,255,0.08)" : gradient, color: analyzing || !client ? "var(--text-3)" : "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
            {analyzing ? "Analyzing..." : analyzeLabel + " ✦"}
          </button>
          {analysis && <button onClick={onSave} disabled={saving} style={{ padding: "10px 20px", border: "1px solid var(--text-3)", borderRadius: 10, background: "var(--surface)", color: "var(--text-1)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : "Save Assessment"}</button>}
        </div>
        {analyzing && <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>Analyzing... (10-20s)</p>}
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
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={rows} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
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
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );
  const ta = (key, label, placeholder) => (
    <div key={key} style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
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
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Volume Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("inboundVolume", "Inbound Leads/Month", "e.g. 120")}
          {numField("outboundVolume", "Outbound Sequences/Month", "e.g. 500")}
          {numField("inboundConvRate", "Inbound → Meeting Rate (%)", "e.g. 8")}
          {numField("outboundReplyRate", "Outbound Reply Rate (%)", "e.g. 4")}
          {numField("emailOpenRate", "Email Open Rate (%)", "e.g. 35")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Strategy & Presence</div>
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
    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: data[key] ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.04)", border: `1px solid ${data[key] ? "rgba(34,197,94,0.2)" : "var(--border-soft)"}`, borderRadius: 8, cursor: "pointer" }} onClick={() => setData(p => ({ ...p, [key]: !p[key] }))}>
      <div style={{ width: 18, height: 18, borderRadius: 4, background: data[key] ? "#22c55e" : "#fff", border: `2px solid ${data[key] ? "#22c55e" : "var(--text-3)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "#fff" }}>{data[key] ? "✓" : ""}</div>
      <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>{label}</span>
    </div>
  );
  const numField = (key, label, placeholder) => (
    <div key={key}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );
  const ta = (key, label, placeholder) => (
    <div key={key} style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <textarea value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
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
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Program Checklist</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {toggle("hasScorecard", "Standardized interview scorecard exists for SDRs and AEs")}
          {toggle("hasMockPitch", "Mock pitch or role-play is a required part of the interview process")}
          {toggle("hasManagerPlan", "Structured 30/60/90 onboarding plan exists for new managers")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Hiring Metrics</div>
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
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{label}</label>
      <input type="number" value={data[key] || ""} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
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
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>AE / Sales Performance</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("quotaAttainment", "% of Reps at Quota", "e.g. 55")}
          {numField("winRate", "Win Rate (%)", "e.g. 22")}
          {numField("saleCycleDays", "Avg Sales Cycle (days)", "e.g. 45")}
          {numField("avgDealSize", "Avg Deal Size ($)", "e.g. 25000")}
          {numField("aeRampMonths", "AE Ramp Time (months)", "e.g. 4")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Pipeline & Outbound</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("pipelineCoverage", "Pipeline Coverage (x quota)", "e.g. 3.2")}
          {numField("sdrMeetings", "SDR Meetings/Month (per rep)", "e.g. 10")}
          {numField("outboundReplyRate", "Outbound Reply Rate (%)", "e.g. 4")}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Revenue Efficiency</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
          {numField("cac", "CAC ($)", "e.g. 15000")}
          {numField("ltv", "LTV ($)", "e.g. 75000")}
          {numField("managerRatio", "Manager:Rep Ratio (1:X)", "e.g. 7")}
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Additional Context</label>
          <textarea value={data.notes || ""} onChange={e => setData(p => ({ ...p, notes: e.target.value }))} placeholder="Market context, team size, recent changes, quota setting methodology..." rows={2} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
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
        <span style={{ color: "var(--text-2)" }}>/</span>
        <span style={{ color: "var(--text-1)", fontWeight: 600 }}>New GTM Assessment</span>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: "0 0 6px" }}>New GTM Assessment</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Upload company documents and generate a board-ready McKinsey-style GTM assessment report</p>
      </div>

      {/* Client Selector */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
        <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 8, fontWeight: 700 }}>Client *</label>
        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ width: "100%", maxWidth: 340, padding: "10px 12px", background: "var(--surface)", border: "1px solid " + (!selectedClient ? "rgba(239,68,68,0.3)" : "var(--border-soft)"), borderRadius: 8, color: selectedClient ? "var(--text-1)" : "var(--text-3)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          <option value="">Select client...</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Document Upload */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Documents</h3>
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>Upload sales decks, playbooks, metrics reports, org charts, transcripts, CRM exports — the more context the better</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{ padding: "8px 16px", border: "1px solid var(--text-3)", borderRadius: 8, background: "var(--surface)", color: "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
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
          style={{ border: `2px dashed ${dragOver ? "#31CE81" : "var(--text-3)"}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: extracting ? "wait" : "pointer", background: dragOver ? "rgba(49,206,129,0.04)" : "rgba(255,255,255,0.02)", transition: "all 0.2s", marginBottom: docs.length > 0 ? 14 : 0 }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <p style={{ fontSize: 13, fontWeight: 600, color: dragOver ? "#31CE81" : "var(--text-2)", margin: "0 0 4px" }}>Drag & drop documents here</p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>PDF, DOCX, TXT, CSV supported</p>
        </div>

        {/* Document List */}
        {docs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map(doc => (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(49,206,129,0.04)", border: "1px solid rgba(49,206,129,0.15)", borderRadius: 10 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>📎</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.filename}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{(doc.content.length / 1000).toFixed(1)}k chars</div>
                </div>
                <select value={doc.docType} onChange={e => updateDocType(doc.id, e.target.value)} onClick={e => e.stopPropagation()} style={{ padding: "5px 8px", border: "1px solid var(--text-3)", borderRadius: 6, background: "var(--surface)", color: "var(--text-1)", fontSize: 11, outline: "none", fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => removeDoc(doc.id)} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ padding: "10px 14px", marginBottom: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onBack} style={{ padding: "10px 20px", border: "1px solid var(--text-3)", borderRadius: 10, background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button
          onClick={generate}
          disabled={!canGenerate}
          style={{ padding: "12px 28px", border: "none", borderRadius: 10, background: canGenerate ? "#31CE81" : "rgba(255,255,255,0.08)", color: canGenerate ? "#fff" : "var(--text-3)", fontSize: 14, fontWeight: 700, cursor: canGenerate ? "pointer" : "default", fontFamily: "inherit" }}
        >
          {generating ? "Analyzing documents..." : "Generate GTM Assessment ✦"}
        </button>
        {generating && <span style={{ fontSize: 12, color: "var(--text-2)" }}>(~30 seconds)</span>}
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
          body { background: white !important; font-family: 'Syne', system-ui, sans-serif; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid var(--text-3)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid var(--text-3)", borderRadius: 8, background: "var(--surface)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>🖨 Print Report</button>
      </div>

      {/* ── SECTION 1: Executive Summary ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: "28px 32px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: execSummary.top_findings?.length ? 24 : 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#6366F1", fontWeight: 700, marginBottom: 8 }}>GTM Assessment Report</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px", lineHeight: 1.15 }}>{report.client}</h1>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}>
              {report.report_date && new Date(report.report_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {report.document_sources?.length > 0 && ` · ${report.document_sources.length} document${report.document_sources.length !== 1 ? "s" : ""} analyzed`}
            </div>
            {execSummary.headline && <p style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", margin: "0 0 12px", lineHeight: 1.45, fontStyle: "italic" }}>"{execSummary.headline}"</p>}
            {execSummary.narrative && <p style={{ fontSize: 14, color: "var(--text-2)", margin: 0, lineHeight: 1.7 }}>{execSummary.narrative}</p>}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>{f.title}</div>
                <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{f.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 2: GTM Diagnostic ── */}
      {dimensions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1.5 }}>GTM Diagnostic</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {dimensions.map(dim => {
              const cfg = dimConfig[dim.id] || { label: dim.label, icon: "📊", color: "#6366f1" };
              const isExpanded = expandedDim === dim.id;
              const statusColor = dim.score < 40 ? "#ef4444" : dim.score < 50 ? "#f97316" : dim.score < 65 ? "#eab308" : dim.score < 80 ? "#22c55e" : "#31CE81";
              return (
                <div key={dim.id} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, overflow: "hidden" }}>
                  <div onClick={() => setExpandedDim(isExpanded ? null : dim.id)} style={{ padding: "16px 18px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: cfg.color + "15", border: `1px solid ${cfg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{cfg.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{dim.label}</div>
                          <AuditStatusBadge score={dim.score} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: statusColor, fontFamily: "'IBM Plex Mono', monospace" }}>{dim.score}%</div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</div>
                      </div>
                    </div>
                    {dim.summary && <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.55 }}>{dim.summary}</p>}
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {dim.evidence && (
                        <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, margin: "14px 0" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Evidence from Documents</div>
                          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>{dim.evidence}</p>
                        </div>
                      )}
                      {dim.sub_scores?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Sub-Scores</div>
                          {dim.sub_scores.map((ss, i) => {
                            const ssColor = ss.score < 40 ? "#ef4444" : ss.score < 50 ? "#f97316" : ss.score < 65 ? "#eab308" : ss.score < 80 ? "#22c55e" : "#31CE81";
                            return (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, color: "var(--text-1)" }}>{ss.category}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: ssColor, fontFamily: "'IBM Plex Mono', monospace" }}>{ss.score}%</span>
                                </div>
                                <div style={{ height: 3, background: "var(--border-soft)", borderRadius: 3 }}>
                                  <div style={{ width: `${ss.score}%`, height: "100%", background: ssColor, borderRadius: 3 }} />
                                </div>
                                {ss.note && <p style={{ fontSize: 11, color: "var(--text-2)", margin: "3px 0 0", lineHeight: 1.4 }}>{ss.note}</p>}
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
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>{gap.title}</div>
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
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.5 }}>Priority Gaps</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {priorityGaps.map((gap, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: sevBg(gap.severity), border: `1px solid ${sevColor(gap.severity)}30`, borderRadius: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 22, color: sevColor(gap.severity), fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, flexShrink: 0, paddingTop: 2 }}>{gap.rank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{gap.title}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: sevBg(gap.severity), color: sevColor(gap.severity), fontWeight: 700, border: `1px solid ${sevColor(gap.severity)}30`, textTransform: "uppercase", letterSpacing: 0.5 }}>{gap.severity}</span>
                    {gap.dimension && dimConfig[gap.dimension] && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.08)", color: "var(--text-2)", fontWeight: 600 }}>{dimConfig[gap.dimension].label}</span>}
                  </div>
                  {gap.business_impact && <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 6px", lineHeight: 1.55 }}>{gap.business_impact}</p>}
                  {gap.root_cause && <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 8px", lineHeight: 1.5 }}>Root cause: {gap.root_cause}</p>}
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
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1.5 }}>Scope of Work</h2>

          {/* Wave Tabs */}
          <div className="no-print" style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 4 }}>
            {waves.map(w => (
              <button key={w.key} onClick={() => setActiveWave(w.key)} style={{ flex: 1, padding: "8px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: activeWave === w.key ? "#fff" : "transparent", color: activeWave === w.key ? "var(--text-1)" : "var(--text-2)", fontFamily: "inherit", boxShadow: activeWave === w.key ? "0 1px 4px var(--border-soft)" : "none", transition: "all 0.15s" }}>
                <div style={{ fontSize: 12, fontWeight: activeWave === w.key ? 700 : 500 }}>{w.icon} {w.label}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{w.timeline}</div>
              </button>
            ))}
          </div>

          {/* Active wave content (tabs on screen, all waves on print) */}
          {waves.map(w => (
            <div key={w.key} className={activeWave !== w.key ? "no-print" : ""} style={{ display: activeWave === w.key ? "block" : "none" }}>
              {/* Print header */}
              <div className="print-show-all" style={{ display: "none", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border-soft)" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{w.icon} {w.label}</span>
                <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>{w.timeline}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(sow[w.key]?.initiatives || []).map((init, i) => {
                  const effortColor = init.effort === "High" ? "#f97316" : init.effort === "Medium" ? "#eab308" : "#22c55e";
                  const impactColor = init.impact === "High" ? "#6366f1" : init.impact === "Medium" ? "#0ea5e9" : "#64748b";
                  return (
                    <div key={i} style={{ padding: "16px 18px", background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{init.title}</div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {init.owner && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: "rgba(99,102,241,0.08)", color: "#6366f1", fontWeight: 700, border: "1px solid rgba(99,102,241,0.2)" }}>{init.owner}</span>}
                          {init.effort && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: effortColor + "15", color: effortColor, fontWeight: 700 }}>Effort: {init.effort}</span>}
                          {init.impact && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: impactColor + "15", color: impactColor, fontWeight: 700 }}>Impact: {init.impact}</span>}
                        </div>
                      </div>
                      {init.description && <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 8px", lineHeight: 1.55 }}>{init.description}</p>}
                      {init.success_metric && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#31CE81", textTransform: "uppercase", letterSpacing: 0.5 }}>✓ Success</span>
                          <span style={{ fontSize: 12, color: "var(--text-2)" }}>{init.success_metric}</span>
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
      <div style={{ textAlign: "center", padding: "16px 0 8px", fontSize: 11, color: "var(--text-3)" }}>
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
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{name}</div>
              {state.connected && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 1 }}>
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
              <button onClick={() => disconnect(provider)} style={{ padding: "7px 12px", border: "1px solid var(--text-3)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Disconnect</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>Not connected</span>
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
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                {identifierLabel}s to sync {state.synced_count > 0 && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-2)" }}>· {state.synced_count} docs synced</span>}
              </div>
              {state.sources.length === 0 && <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 12px" }}>No sources added yet. Click "+ Add Source" to connect a {identifierLabel.toLowerCase()}.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {state.sources.map((src, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "9px 12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 1 }}>
                        {src.type === "folder" ? "Folder" : src.type === "database" ? "Database" : "Page"} · {src.client || "No client"} · {ENABLEMENT_DOC_TYPES.find(t => t.id === src.docType)?.name || src.docType}
                      </div>
                    </div>
                    <button onClick={() => removeSource(provider, i)} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>

              {addingTo === provider ? (
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 5 }}>{identifierLabel} URL or ID</label>
                      <input value={newSrc.url} onChange={e => setNewSrc(s => ({ ...s, url: e.target.value }))} placeholder={identifierPlaceholder} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--text-3)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Display Name</label>
                      <input value={newSrc.name} onChange={e => setNewSrc(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Sales Playbook" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--text-3)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    {extraSourceFields}
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Client</label>
                      <select value={newSrc.client} onChange={e => setNewSrc(s => ({ ...s, client: e.target.value }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--text-3)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" }}>
                        <option value="">All clients</option>
                        {clients.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Document Type</label>
                      <select value={newSrc.docType} onChange={e => setNewSrc(s => ({ ...s, docType: e.target.value }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--text-3)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" }}>
                        {docTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {addErr && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{addErr}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => addSource(provider)} style={{ padding: "7px 16px", border: "none", borderRadius: 7, background: color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
                    <button onClick={() => { setAddingTo(null); setAddErr(""); }} style={{ padding: "7px 12px", border: "1px solid var(--text-3)", borderRadius: 7, background: "var(--surface)", color: "var(--text-2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
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
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Document Sources</h2>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Connect Notion and Google Drive to automatically sync documents into client profiles</p>
      </div>

      {/* Notion */}
      <ProviderCard
        provider="notion" state={notion} icon="◻" name="Notion" color="#000" accent="var(--border-soft)"
        identifierLabel="Page"
        identifierPlaceholder="https://notion.so/... or page ID"
        extraSourceFields={
          <div>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Source Type</label>
            <select value={newSrc.type} onChange={e => setNewSrc(s => ({ ...s, type: e.target.value }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--text-3)", borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" }}>
              <option value="page">Page</option>
              <option value="database">Database (all pages)</option>
            </select>
          </div>
        }
        connectForm={
          <div>
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 12px", lineHeight: 1.6 }}>
              Create a Notion integration at <strong>notion.so/my-integrations</strong>, then share your pages with it. Paste the Internal Integration Token below.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={notionToken} onChange={e => setNotionToken(e.target.value)} placeholder="secret_xxxx..." type="password" style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--text-3)", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
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
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 12px", lineHeight: 1.6 }}>
              Connect your Google Drive account to sync Google Docs and text files. Requires <strong>GOOGLE_CLIENT_ID</strong> and <strong>GOOGLE_CLIENT_SECRET</strong> set in Vercel environment variables.
            </p>
            <button onClick={connectGDrive} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: "#1a73e8", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Connect Google Drive
            </button>
          </div>
        }
      />

      {/* Setup notes */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "14px 16px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--text-2)" }}>Setup notes</strong><br />
        <strong>Notion:</strong> Go to notion.so/my-integrations → New integration → copy the token → share each page with the integration (Share → Connections → your integration name).<br />
        <strong>Google Drive:</strong> Set <code style={{ background: "var(--border-soft)", padding: "1px 5px", borderRadius: 4 }}>GOOGLE_CLIENT_ID</code>, <code style={{ background: "var(--border-soft)", padding: "1px 5px", borderRadius: 4 }}>GOOGLE_CLIENT_SECRET</code>, and <code style={{ background: "var(--border-soft)", padding: "1px 5px", borderRadius: 4 }}>GDRIVE_REDIRECT_URI=https://your-app.vercel.app/api/gdrive/sync</code> in Vercel project settings. Create OAuth credentials at console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application), add the redirect URI above.<br />
        <strong>Supported file types:</strong> Google Docs, plain text, Markdown. PDFs and other formats are skipped (use the manual upload in Enablement instead).
      </div>
    </div>
  );
}

// CLIENT INTEL PAGE
function ClientIntelPage({ getValidToken, clients }) {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleResearch = async () => {
    if (!company.trim()) return;
    setLoading(true);
    try {
      const token = await getValidToken();
      const res = await fetch("/api/client-research", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company, context }),
      });
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error("Client research error:", err);
      setResults({ error: "Failed to fetch research" });
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { label: "Company Overview", key: "company_overview" },
    { label: "Call Preparation", key: "call_preparation" },
    { label: "Pain Points", key: "pain_points" },
    { label: "Key People", key: "key_people" },
    { label: "Competitive Landscape", key: "competitive_landscape" },
    { label: "Deal Intelligence", key: "deal_intelligence" },
    { label: "Recent News", key: "recent_news" },
  ];

  const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "var(--surface)" };
  const labelStyle = { fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 5, fontWeight: 700 };
  const cardStyle = { background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: "16px 18px" };
  const sectionLabelStyle = { fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 14 };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Client Intel</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: "4px 0 0" }}>AI-powered company research and deal intelligence</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        {/* LEFT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>Research Target</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Company Name *</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g., Salesforce, HubSpot" style={inputStyle} onKeyDown={e => e.key === "Enter" && handleResearch()} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Additional Context</label>
              <textarea value={context} onChange={e => setContext(e.target.value)} placeholder="e.g., recent funding, product focus, vertical" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <button onClick={handleResearch} disabled={loading} style={{ padding: "11px 20px", border: "none", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer", background: loading ? "rgba(49,206,129,0.4)" : "#31CE81", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", width: "100%" }}>
              {loading ? "Researching\u2026" : "Research"}
            </button>
          </div>
          {clients.length > 0 && (
            <div style={cardStyle}>
              <div style={sectionLabelStyle}>Quick Select</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {clients.slice(0, 8).map((c, i) => (
                  <button key={i} onClick={() => { setCompany(c.name); setContext(""); }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 20, background: company === c.name ? "#31CE81" : "rgba(49,206,129,0.1)", color: company === c.name ? "#fff" : "#31CE81", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MAIN AREA */}
        <div>
          {!results && !loading && (
            <div style={{ border: "1px dashed var(--text-3)", borderRadius: 16, padding: "64px 40px", textAlign: "center", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Enter a company to research</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>AI generates company overview, pain points, competitive landscape, and deal prep</div>
            </div>
          )}
          {loading && (
            <div style={{ border: "1px solid var(--border-soft)", borderRadius: 16, padding: "64px 40px", textAlign: "center", background: "var(--surface)" }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>Researching {company}\u2026</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>Usually takes 10\u201315 seconds</div>
            </div>
          )}
          {results && results.error && (
            <div style={{ padding: "16px 20px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, color: "#dc2626", fontSize: 13 }}>{results.error}</div>
          )}
          {results && !results.error && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{company}</div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>Intelligence Report</div>
                </div>
                <button onClick={() => { setResults(null); setCompany(""); setContext(""); }} style={{ fontSize: 11, padding: "6px 12px", border: "1px solid var(--text-3)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", color: "var(--text-2)", fontFamily: "inherit" }}>Clear</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {sections.map(sec => {
                  const content = results[sec.key];
                  if (!content || content === "N/A" || content === "No data available") return null;
                  return (
                    <div key={sec.key} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-soft)", background: "rgba(1,36,65,0.03)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: 1 }}>{sec.label}</span>
                      </div>
                      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.65, maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", wordWrap: "break-word" }}>{content}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// CUOTA AGENT PAGE
function CuotaAgentPage({ getValidToken, savedCalls }) {
  const [transcript, setTranscript] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAgentReview = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    try {
      const token = await getValidToken();
      const res = await fetch("/api/agent-review", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error("Agent review error:", err);
      setResults({ error: "Failed to run agent review" });
    } finally {
      setLoading(false);
    }
  };

  const frameColors = {
    Connect: "#31CE81",
    Uncover: "#eab308",
    Orient: "#f97316",
    Transform: "#0360ab",
    Advance: "#a855f7",
  };

  const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "var(--surface)" };
  const cardStyle = { background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: "16px 18px" };
  const sectionLabelStyle = { fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 14 };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Cuota Agent</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: "4px 0 0" }}>AI-powered sales call analysis using the C.U.O.T.A. framework</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        {/* LEFT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>Call Transcript</div>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste your sales call transcript here\u2026" style={{ ...inputStyle, minHeight: 220, resize: "vertical", marginBottom: 12 }} />
            <button onClick={handleAgentReview} disabled={loading} style={{ padding: "11px 20px", border: "none", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer", background: loading ? "rgba(49,206,129,0.4)" : "#31CE81", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", width: "100%" }}>
              {loading ? "Analyzing\u2026" : "Run Agent Review"}
            </button>
          </div>
          {savedCalls.length > 0 && (
            <div style={cardStyle}>
              <div style={sectionLabelStyle}>Recent Calls</div>
              {savedCalls.slice(0, 5).map((call, i) => (
                <button key={i} onClick={() => { setTranscript(call.transcript || ""); setResults(null); }} style={{ display: "block", width: "100%", padding: "8px 10px", marginBottom: 6, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", fontSize: 12, color: "var(--text-1)", textAlign: "left", fontFamily: "inherit" }}>
                  {call.prospect_company || call.client} \u2014 {call.rep_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MAIN AREA */}
        <div>
          {!results && !loading && (
            <div style={{ border: "1px dashed var(--text-3)", borderRadius: 16, padding: "64px 40px", textAlign: "center", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Paste a transcript to begin</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>Agent scores the call on C.U.O.T.A. and surfaces coaching insights</div>
            </div>
          )}
          {loading && (
            <div style={{ border: "1px solid var(--border-soft)", borderRadius: 16, padding: "64px 40px", textAlign: "center", background: "var(--surface)" }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>Analyzing your call\u2026</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>Usually takes 15\u201320 seconds</div>
            </div>
          )}
          {results && results.error && (
            <div style={{ padding: "16px 20px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, color: "#dc2626", fontSize: 13 }}>{results.error}</div>
          )}
          {results && !results.error && (
            <div>
              {/* C.U.O.T.A. Score Strip */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                <div style={sectionLabelStyle}>C.U.O.T.A. Framework Scores</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                  {Object.entries(frameColors).map(([frame, color]) => {
                    const score = results[`${frame.toLowerCase()}_score`] || 0;
                    return (
                      <div key={frame} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{Math.round(score)}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1, margin: "5px 0 8px" }}>{frame}</div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Result Section Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Deal Assessment", keys: ["win_probability", "deal_health", "next_play"] },
                  { label: "What Went Well", key: "what_went_well" },
                  { label: "Critical Misses", key: "critical_misses" },
                  { label: "Rewritten Moments", key: "rewritten_moments" },
                  { label: "Talk Track Suggestions", key: "talk_track_suggestions" },
                  { label: "Coaching Plan", key: "coaching_plan" },
                ].map(section => {
                  let content;
                  if (section.keys) {
                    const parts = section.keys.map(k => {
                      const val = results[k];
                      if (!val || val === "N/A") return null;
                      return `${k.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}: ${val}`;
                    }).filter(Boolean);
                    content = parts.join("\n\n");
                  } else {
                    content = results[section.key];
                  }
                  if (!content) return null;
                  return (
                    <div key={section.label} style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-soft)", background: "rgba(1,36,65,0.03)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: 1 }}>{section.label}</span>
                      </div>
                      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.65, maxHeight: 220, overflowY: "auto", whiteSpace: "pre-wrap" }}>{content}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== DECK BUILDER ====================
const NATURAL_W = 800;
const NATURAL_H = 450;
const THUMB_W = 110;
const THUMB_H = 61.875;

const SLIDE_TYPE_LABELS = {
  title: "Cover", agenda: "Agenda", problem: "Problem", solution: "Solution",
  features: "Differentiators", proof: "Social Proof", roi: "ROI", timeline: "Timeline", cta: "CTA", success: "Success Plan",
};

const BCARD_W = 800;
const BCARD_H = 1130; // portrait
const BCARD_THUMB_H = Math.round(THUMB_W * (BCARD_H / BCARD_W)); // ≈ 155px
const BCARD_TYPE_LABELS = {
  overview: "Overview", features1: "Features 1/2", features2: "Features 2/2",
  quotes: "Customer Quotes", objections: "Objections & Wins",
};

const ROI_TINTS = [
  { bg: "rgba(59,130,246,0.08)", border: "#3b82f6" },
  { bg: "rgba(34,197,94,0.08)",  border: "#22c55e" },
  { bg: "rgba(245,158,11,0.08)", border: "#f59e0b" },
  { bg: "rgba(139,92,246,0.08)", border: "#8b5cf6" },
];

// ─── Shared footer for all deck slides ───────────────────────────────────────
function SlideFooter({ logoBase64, companyName, label }) {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 26, borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {logoBase64 && <img src={logoBase64} alt="" style={{ maxHeight: 13, maxWidth: 44, objectFit: "contain", opacity: 0.55 }} />}
        {companyName && <span style={{ fontSize: 8, color: "#94a3b8", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{companyName}</span>}
      </div>
      <span style={{ fontSize: 8, color: "#d1d5db", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function SlideTitle({ data, primary, accent, prospectCompany, client, companyName, logoBase64, prospectLogoBase64 }) {
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, display: "flex", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative", background: "#fff" }}>
      {/* Left — white panel: identity + prepared-for */}
      <div style={{ width: "56%", height: "100%", background: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 44px", boxSizing: "border-box", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 44 }}>
          {logoBase64 && <img src={logoBase64} alt="" style={{ maxHeight: 24, maxWidth: 76, objectFit: "contain" }} />}
          {companyName && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase" }}>{companyName}</span>}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>Prepared for</div>
        {prospectLogoBase64 && (
          <img src={prospectLogoBase64} alt="" style={{ maxHeight: 38, maxWidth: 120, objectFit: "contain", opacity: 0.85, marginBottom: 8 }} />
        )}
        <div style={{ fontSize: 30, fontWeight: 700, color: primary, lineHeight: 1.2, marginBottom: 14 }}>{prospectCompany || client || "Your Prospect"}</div>
        <div style={{ width: 32, height: 1, background: "#e5e7eb", marginBottom: 14 }} />
        <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
      </div>
      {/* Divider */}
      <div style={{ width: 1, background: "#e5e7eb", alignSelf: "stretch", flexShrink: 0 }} />
      {/* Right — primary bg: presentation title */}
      <div style={{ width: "44%", height: "100%", background: primary, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 36px", boxSizing: "border-box", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.18)" }} />
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 14 }}>Presentation</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#ffffff", lineHeight: 1.25, marginBottom: 14 }}>{data.title || "Sales Deck"}</div>
        <div style={{ width: 28, height: 2, background: accent, marginBottom: 14 }} />
        {data.subtitle && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", lineHeight: 1.6 }}>{data.subtitle}</div>}
      </div>
    </div>
  );
}

function SlideAgenda({ data, primary, accent, logoBase64, companyName }) {
  const items = data.points || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 44px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Agenda</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "#0d1117", marginBottom: 16 }}>{data.title || "Today's Agenda"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {items.slice(0, 5).map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: accent, fontFamily: "'IBM Plex Mono', monospace", minWidth: 24, flexShrink: 0 }}>0{i + 1}</span>
              <span style={{ fontSize: 14, color: "#1e293b", fontWeight: 500, lineHeight: 1.4 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Agenda" />
    </div>
  );
}

function SlideProblem({ data, primary, accent, logoBase64, companyName }) {
  const items = data.points || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#ef4444" }} />
      <div style={{ padding: "26px 44px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Challenge</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "#0d1117", marginBottom: 16 }}>{data.title || "Current Challenges"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
          {items.slice(0, 4).map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "11px 0", borderBottom: "1px solid #f9fafb" }}>
              <div style={{ width: 3, alignSelf: "stretch", background: "#ef4444", flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", fontFamily: "'IBM Plex Mono', monospace", minWidth: 20, paddingTop: 2, flexShrink: 0 }}>0{i + 1}</span>
              <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Challenge" />
    </div>
  );
}

function SlideSolution({ data, primary, accent, logoBase64, companyName }) {
  const items = data.points || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 44px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Our Approach</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "#0d1117", marginBottom: 16 }}>{data.title || "How We Solve It"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
          {items.slice(0, 4).map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "11px 0", borderBottom: "1px solid #f9fafb" }}>
              <div style={{ width: 3, alignSelf: "stretch", background: accent, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: accent, fontFamily: "'IBM Plex Mono', monospace", minWidth: 20, paddingTop: 2, flexShrink: 0 }}>0{i + 1}</span>
              <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Our Approach" />
    </div>
  );
}

function SlideFeatures({ data, primary, accent, logoBase64, companyName }) {
  const cols = data.columns || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 36px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Differentiators</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "#0d1117", marginBottom: 16 }}>{data.title || "What Sets Us Apart"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cols.length || 1, 3)}, 1fr)`, gap: 14, flex: 1 }}>
          {cols.slice(0, 3).map((col, i) => (
            <div key={i} style={{ border: "1px solid #e5e7eb", borderTop: `3px solid ${i === 0 ? accent : i === 1 ? primary : "#94a3b8"}`, padding: "18px 16px", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, marginBottom: 10 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0d1117", marginBottom: 8, lineHeight: 1.3 }}>{col.heading}</div>
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.65, flex: 1 }}>{col.body || ""}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Differentiators" />
    </div>
  );
}

function SlideProof({ data, primary, accent, logoBase64, companyName }) {
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 52px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 20 }}>Client Results</div>
        <div style={{ fontSize: 68, fontWeight: 700, color: accent, opacity: 0.1, lineHeight: 1, fontFamily: "Georgia, serif", marginBottom: -18, userSelect: "none" }}>"</div>
        {data.quote && (
          <div style={{ fontSize: 17, fontStyle: "italic", color: "#1e293b", lineHeight: 1.75, marginBottom: 16, position: "relative", zIndex: 1 }}>{data.quote}</div>
        )}
        {data.attribution && (
          <div style={{ fontSize: 11, color: primary, fontWeight: 700, marginBottom: 22 }}>— {data.attribution}</div>
        )}
        {(data.metrics || []).length > 0 && (
          <div style={{ display: "flex", gap: 0, borderTop: "1px solid #e5e7eb", paddingTop: 18 }}>
            {(data.metrics || []).slice(0, 3).map((m, i) => (
              <div key={i} style={{ flex: 1, borderLeft: `3px solid ${i === 0 ? accent : "#e5e7eb"}`, paddingLeft: 14, marginLeft: i > 0 ? 16 : 0 }}>
                <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55 }}>{m}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Client Results" />
    </div>
  );
}

function SlideRoi({ data, primary, accent, logoBase64, companyName }) {
  const metrics = data.metrics || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 44px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Business Case</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "#0d1117", marginBottom: 16 }}>{data.title || "Expected ROI"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
          {metrics.slice(0, 4).map((m, i) => (
            <div key={i} style={{ border: "1px solid #e5e7eb", borderTop: `3px solid ${i < 2 ? accent : primary}`, padding: "18px 22px", display: "flex", flexDirection: "column", justifyContent: "center", boxSizing: "border-box" }}>
              <div style={{ fontSize: 44, fontWeight: 700, color: primary, lineHeight: 1, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>{typeof m === "string" ? m : m.value}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{typeof m === "string" ? "" : m.label}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Business Case" />
    </div>
  );
}

function SlideTimeline({ data, primary, accent, logoBase64, companyName }) {
  const steps = data.steps || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 44px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Implementation</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "#0d1117", marginBottom: 16 }}>{data.title || "Getting Started"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 0, flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", top: 16, left: 40, right: 40, height: 1, background: "#e5e7eb", zIndex: 0 }} />
          {steps.slice(0, 4).map((step, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
              <div style={{ width: 32, height: 32, background: i === 0 ? primary : "#fff", border: `1px solid ${i === 0 ? primary : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? "#fff" : primary, marginBottom: 12, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ width: "100%", padding: "0 10px", boxSizing: "border-box", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: primary, marginBottom: 6 }}>{step.phase || `Phase ${i + 1}`}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.55 }}>{step.description || ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Implementation" />
    </div>
  );
}

function SlideCta({ data, primary, accent, logoBase64, companyName }) {
  const points = data.points || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ padding: "26px 52px 32px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>Next Steps</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: primary, lineHeight: 1.2, marginBottom: 18 }}>{data.title || "The Ask"}</div>
        <div style={{ height: 1, background: "#e5e7eb", marginBottom: 18 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          {points.slice(0, 3).map((pt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: accent, fontFamily: "'IBM Plex Mono', monospace", minWidth: 24, paddingTop: 2, flexShrink: 0 }}>0{i + 1}</span>
              <div style={{ width: 1, background: "#e5e7eb", alignSelf: "stretch", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{pt}</span>
            </div>
          ))}
        </div>
        {data.closing && (
          <div style={{ fontSize: 12, fontStyle: "italic", color: "#64748b", borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>{data.closing}</div>
        )}
      </div>
      <SlideFooter logoBase64={logoBase64} companyName={companyName} label="Next Steps" />
    </div>
  );
}

function SlideSuccess({ data, primary, accent, logoBase64, companyName }) {
  const subtype = data.subtype || "goals";
  const items = data.goals || data.kpis || data.metrics || data.items || data.points || data.steps || [];
  return (
    <div style={{ width: NATURAL_W, height: NATURAL_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ height: 50, background: primary, display: "flex", alignItems: "center", padding: "0 36px", flexShrink: 0, gap: 12, marginTop: 3 }}>
        <div style={{ width: 5, height: 5, background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Mutual Success Plan</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", margin: "0 4px" }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{data.title || "Shared Goals"}</span>
        {logoBase64 && <img src={logoBase64} alt="" style={{ maxHeight: 16, maxWidth: 50, objectFit: "contain", marginLeft: "auto", opacity: 0.65 }} />}
      </div>
      <div style={{ flex: 1, padding: "14px 32px 28px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 7 }}>
        {subtype === "kpis" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, flex: 1 }}>
            {items.slice(0, 6).map((item, i) => (
              <div key={i} style={{ border: "1px solid #e5e7eb", borderTop: `3px solid ${i < 3 ? accent : primary}`, padding: "14px 16px", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: primary, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>{typeof item === "object" ? item.value : item}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{typeof item === "object" ? item.label : ""}</div>
              </div>
            ))}
          </div>
        ) : (
          items.slice(0, 5).map((item, i) => {
            const label = typeof item === "object" ? (item.milestone || item.goal || item.description || item.phase || item.step || JSON.stringify(item)) : item;
            const owner = typeof item === "object" ? item.owner : null;
            const date = typeof item === "object" ? (item.date || item.dueDate || item.deadline) : null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: i % 2 === 0 ? "#f9fafb" : "#fff", borderLeft: `3px solid ${i % 2 === 0 ? accent : "#e5e7eb"}`, flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.45, flex: 1 }}>{label}</span>
                {owner && <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{owner}</span>}
                {date && <span style={{ fontSize: 10, color: primary, fontWeight: 600, flexShrink: 0 }}>{date}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ==================== BATTLECARD COMPONENTS ====================

function bcHexToRgb(hex) {
  try {
    const h = (hex || "#000000").replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `${r},${g},${b}`;
  } catch { return "0,0,0"; }
}

function BcardStatusIcon({ status }) {
  const cfg = status === "yes"
    ? { bg: "#22c55e", char: "✓" }
    : status === "partial"
    ? { bg: "#f59e0b", char: "~" }
    : { bg: "#ef4444", char: "✗" };
  return (
    <span style={{ width: 22, height: 22, borderRadius: "50%", background: cfg.bg, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
      {cfg.char}
    </span>
  );
}

function BattlecardPage1({ data, primary, accent, logoBase64 }) {
  const rows = data.comparisonRows || [];
  const quotes = data.quotes || [];
  const rgb = bcHexToRgb(primary);
  return (
    <div style={{ width: BCARD_W, height: BCARD_H, background: "#fff", fontFamily: "'Syne', system-ui, sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ height: 72, background: primary, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {logoBase64 && <img src={logoBase64} alt="logo" style={{ maxHeight: 38, maxWidth: 120, objectFit: "contain" }} />}
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{data.companyName || "Our Company"}</div>
        </div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>vs. {data.competitorName || "Competitor"}</div>
      </div>
      {/* Comparison Table */}
      <div style={{ margin: "20px 32px 14px", background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
          <div style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Category</div>
          <div style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: primary, textTransform: "uppercase", letterSpacing: 1, borderLeft: "1px solid #e2e8f0", background: `rgba(${rgb},0.04)` }}>{data.companyName || "Us"}</div>
          <div style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, borderLeft: "1px solid #e2e8f0" }}>{data.competitorName || "Competitor"}</div>
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
            <div style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#334155", display: "flex", alignItems: "center" }}>{row.label}</div>
            <div style={{ padding: "12px 16px", borderLeft: "1px solid #f1f5f9", background: `rgba(${rgb},0.03)`, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <BcardStatusIcon status={row.us || "yes"} />
              {row.usText && <span style={{ fontSize: 11, color: "#475569", lineHeight: 1.4 }}>{row.usText}</span>}
            </div>
            <div style={{ padding: "12px 16px", borderLeft: "1px solid #f1f5f9", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <BcardStatusIcon status={row.them || "no"} />
              {row.themText && <span style={{ fontSize: 11, color: "#475569", lineHeight: 1.4 }}>{row.themText}</span>}
            </div>
          </div>
        ))}
      </div>
      {/* Partnership Statement */}
      {data.partnershipStatement && (
        <div style={{ margin: "0 32px 14px", background: "#f8fafc", borderRadius: 10, padding: "14px 20px", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Our Goal as Your Partner</div>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.65, fontStyle: "italic" }}>{data.partnershipStatement}</div>
        </div>
      )}
      {/* Customer Love */}
      {quotes.length > 0 && (
        <div style={{ margin: "0 32px", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>Customer Love</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {quotes.slice(0, 2).map((q, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, marginBottom: 10, fontStyle: "italic" }}>"{q.text}"</div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>— {q.name}{q.title ? `, ${q.title}` : ""}{q.company ? `, ${q.company}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Footer */}
      <div style={{ marginTop: "auto", flexShrink: 0 }}>
        <div style={{ height: 8, background: accent }} />
        <div style={{ height: 28, background: primary }} />
      </div>
    </div>
  );
}

function BcardFeatureTable({ data, primary, accent, logoBase64, partLabel }) {
  const sections = data.sections || [];
  const rgb = bcHexToRgb(primary);
  return (
    <div style={{ width: BCARD_W, height: BCARD_H, background: "#fff", fontFamily: "'Syne', system-ui, sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Subheader */}
      <div style={{ height: 52, background: primary, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Feature Comparison — {partLabel}</div>
        {logoBase64 && <img src={logoBase64} alt="logo" style={{ maxHeight: 28, maxWidth: 90, objectFit: "contain" }} />}
      </div>
      {/* Table Header */}
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 1fr", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", flexShrink: 0 }}>
        <div style={{ padding: "9px 14px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Capability</div>
        <div style={{ padding: "9px 14px", fontSize: 10, fontWeight: 700, color: primary, textTransform: "uppercase", letterSpacing: 1, borderLeft: "1px solid #e2e8f0", background: `rgba(${rgb},0.04)` }}>{data.companyName || "Us"}</div>
        <div style={{ padding: "9px 14px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, borderLeft: "1px solid #e2e8f0" }}>{data.competitorName || "Competitor"}</div>
      </div>
      {/* Sections */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {sections.map((section, si) => (
          <div key={si} style={{ flexShrink: 0 }}>
            <div style={{ background: primary, padding: "6px 14px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: 2, textTransform: "uppercase" }}>{section.label}</span>
            </div>
            {(section.rows || []).map((row, ri) => (
              <div key={ri} style={{ display: "grid", gridTemplateColumns: "170px 1fr 1fr", borderBottom: "1px solid #f1f5f9", background: ri % 2 === 0 ? "#fff" : "rgba(0,0,0,0.01)" }}>
                <div style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, color: "#334155", background: "#f1f5f9", display: "flex", alignItems: "flex-start" }}>{row.capability}</div>
                <div style={{ padding: "9px 14px", borderLeft: "1px solid #e2e8f0", background: `rgba(${rgb},0.03)`, display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <BcardStatusIcon status={row.usIcon || "yes"} />
                  <span style={{ fontSize: 11, color: "#475569", lineHeight: 1.4 }}>{row.usDesc}</span>
                </div>
                <div style={{ padding: "9px 14px", borderLeft: "1px solid #e2e8f0", display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <BcardStatusIcon status={row.themIcon || "no"} />
                  <span style={{ fontSize: 11, color: "#475569", lineHeight: 1.4 }}>{row.themDesc}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Enterprise Summary (page 3 only) */}
      {data.enterpriseSummary && (
        <div style={{ margin: "12px 24px", padding: "12px 16px", background: `rgba(${bcHexToRgb(accent)},0.08)`, borderLeft: `4px solid ${accent}`, borderRadius: "0 8px 8px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 5 }}>Enterprise-Grade Advantage</div>
          <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55 }}>{data.enterpriseSummary}</div>
        </div>
      )}
      <div style={{ height: 6, background: accent, flexShrink: 0 }} />
    </div>
  );
}

function BattlecardPage2({ data, primary, accent, logoBase64 }) {
  return <BcardFeatureTable data={data} primary={primary} accent={accent} logoBase64={logoBase64} partLabel="Part 1 of 2" />;
}

function BattlecardPage3({ data, primary, accent, logoBase64 }) {
  return <BcardFeatureTable data={data} primary={primary} accent={accent} logoBase64={logoBase64} partLabel="Part 2 of 2" />;
}

function BattlecardPage4({ data, primary, accent, logoBase64 }) {
  const quotes = data.quotes || [];
  const is2x2 = quotes.length >= 4;
  return (
    <div style={{ width: BCARD_W, height: BCARD_H, background: "#0f172a", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "36px 40px 20px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {logoBase64 && <img src={logoBase64} alt="" style={{ maxHeight: 22, maxWidth: 70, objectFit: "contain", opacity: 0.5, marginBottom: 16 }} />}
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.35 }}>
          What Customers Say About {data.competitorName || "Competitor"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", textAlign: "center", marginTop: 8 }}>
          Real feedback · Use to understand their pain points and position against them
        </div>
      </div>
      {/* Quotes Grid */}
      <div style={{
        flex: 1, padding: "0 32px 32px",
        display: is2x2 ? "grid" : "flex",
        gridTemplateColumns: is2x2 ? "1fr 1fr" : undefined,
        flexDirection: is2x2 ? undefined : "column",
        gap: 16, overflow: "hidden",
      }}>
        {quotes.slice(0, 4).map((q, i) => (
          <div key={i} style={{ background: "#1e293b", borderRadius: 10, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontStyle: "italic", lineHeight: 1.6 }}>"{q.text}"</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>— {q.name}{q.title ? `, ${q.title}` : ""}</div>
            {q.source && (
              <div>
                <span style={{ padding: "2px 8px", background: "rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{q.source}</span>
              </div>
            )}
            {q.note && (
              <div style={{ fontSize: 11, color: accent, fontWeight: 600, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
                Note: {q.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BattlecardPage5({ data, primary, accent, logoBase64 }) {
  const objections = data.objections || [];
  const winThemes = data.winThemes || [];
  const cols = Math.max(1, Math.min(winThemes.length, 3));
  return (
    <div style={{ width: BCARD_W, height: BCARD_H, background: "#fff", fontFamily: "'Geist', system-ui, sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Top Section — Objections (65%) */}
      <div style={{ flex: "0 0 65%", display: "flex", flexDirection: "column", padding: "22px 30px 14px", overflow: "hidden" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>Handle Any Objection</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1, overflow: "hidden" }}>
          {objections.slice(0, 6).map((obj, i) => (
            <div key={i} style={{ background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7, overflow: "hidden" }}>
              <div style={{ fontSize: 11, color: primary, fontStyle: "italic", fontWeight: 600, lineHeight: 1.4 }}>"{obj.objection}"</div>
              <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5 }}>{obj.rebuttal}</div>
              {obj.proof && <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic", lineHeight: 1.4 }}>{obj.proof}</div>}
            </div>
          ))}
        </div>
      </div>
      {/* Bottom Section — Why We Win (35%) */}
      <div style={{ flex: "0 0 35%", background: primary, padding: "18px 30px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Why We Win</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
          {winThemes.slice(0, 3).map((theme, i) => (
            <div key={i} style={{ background: accent, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 5 }}>{theme.title}</div>
              {theme.description && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>{theme.description}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderBattlecard(page, primary, accent, logoBase64) {
  const props = { data: page, primary, accent, logoBase64 };
  switch (page.type) {
    case "overview":   return <BattlecardPage1 {...props} />;
    case "features1":  return <BattlecardPage2 {...props} />;
    case "features2":  return <BattlecardPage3 {...props} />;
    case "quotes":     return <BattlecardPage4 {...props} />;
    case "objections": return <BattlecardPage5 {...props} />;
    default: return <div style={{ width: BCARD_W, height: BCARD_H, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#94a3b8", fontSize: 14 }}>{page.type}</span></div>;
  }
}

function renderSlide(slide, primary, accent, prospectCompany, client, companyName, logoBase64, prospectLogoBase64) {
  const shared = { data: slide, primary, accent, logoBase64, companyName };
  switch (slide.type) {
    case "title": return <SlideTitle {...shared} prospectCompany={prospectCompany} client={client} prospectLogoBase64={prospectLogoBase64} />;
    case "agenda": return <SlideAgenda {...shared} />;
    case "problem": return <SlideProblem {...shared} />;
    case "solution": return <SlideSolution {...shared} />;
    case "features": return <SlideFeatures {...shared} />;
    case "proof": return <SlideProof {...shared} />;
    case "roi": return <SlideRoi {...shared} />;
    case "timeline": return <SlideTimeline {...shared} />;
    case "cta": return <SlideCta {...shared} />;
    case "success": return <SlideSuccess {...shared} />;
    default: return (
      <div style={{ width: NATURAL_W, height: NATURAL_H, background: primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{slide.title}</div>
      </div>
    );
  }
}

const ASSET_TYPES = [
  { id: "Sales Deck",              icon: "📊", description: "9-slide narrative from problem to close" },
  { id: "Follow Up Deck",          icon: "📧", description: "Post-call recap with next steps & materials" },
  { id: "Mutual Success Plan",     icon: "🤝", description: "Joint milestones and shared success criteria" },
  { id: "Proposal",                icon: "📋", description: "Scoped solution with pricing & terms" },
  { id: "Case Study",              icon: "📖", description: "Customer proof & outcomes story" },
  { id: "Competitor Battle Cards", icon: "⚔️", description: "Head-to-head competitive positioning" },
];

function PresentationBuilderPage({ clients, apiKey, getValidToken, defaultClient, savedCalls, onBack }) {
  const _initKey = defaultClient ? `cuota_deck_brand_${defaultClient}` : "cuota_deck_brand";
  // Company-level brand fields fall back to the global store so the logo/name are always present
  const _globalStored = loadStored("cuota_deck_brand") || {};
  const _clientStored = loadStored(_initKey) || {};
  const _stored = { ..._globalStored, ..._clientStored };
  const [primaryColor, setPrimaryColor] = useState(_stored.primaryColor || "#1e3a5f");
  const [accentColor, setAccentColor] = useState(_stored.accentColor || "#31CE81");
  const [companyName, setCompanyName] = useState(_stored.companyName || "");
  const [logoBase64, setLogoBase64] = useState(_stored.logoBase64 || null);
  const [logoFileName, setLogoFileName] = useState(_stored.logoFileName || null);
  const [websiteDomain, setWebsiteDomain] = useState(_stored.websiteDomain || "");
  const [logoFetching, setLogoFetching] = useState(false);
  const [prospectLogoBase64, setProspectLogoBase64] = useState(() => {
    const k = defaultClient ? `cuota_deck_brand_${defaultClient}` : "cuota_deck_brand";
    return loadStored(k)?.prospectLogoBase64 || null;
  });
  const [prospectLogoFetching, setProspectLogoFetching] = useState(false);
  const [prospectDomain, setProspectDomain] = useState(() => {
    const k = defaultClient ? `cuota_deck_brand_${defaultClient}` : "cuota_deck_brand";
    return loadStored(k)?.prospectDomain || "";
  });

  const [client, setClient] = useState(defaultClient || "");
  const [prospectCompany, setProspectCompany] = useState("");
  const [deckType, setDeckType] = useState("Sales Deck");
  const [dealStage, setDealStage] = useState("Mid-Pipe");
  const [painPoints, setPainPoints] = useState("");
  const [refText, setRefText] = useState("");

  // Existing deck upload for brand extraction
  const [templateFileName, setTemplateFileName] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractedFields, setExtractedFields] = useState(null); // which fields were auto-filled
  const templateInputRef = useRef(null);
  const logoInputRef = useRef(null);

  const [slides, setSlides] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(null); // "pptx" | "pdf" | null
  const [activeSlide, setActiveSlide] = useState(0);
  const [error, setError] = useState("");

  // Battlecard-specific fields
  const [competitorName, setCompetitorName] = useState(() => loadStored("battlecard_competitor") || "");
  const [companyFunding, setCompanyFunding] = useState(() => loadStored("battlecard_funding") || "");
  const [companyG2, setCompanyG2] = useState(() => loadStored("battlecard_g2") || "");
  const [seriesA, setSeriesA] = useState(() => loadStored("battlecard_seriesA") || "");
  const [seriesB, setSeriesB] = useState(() => loadStored("battlecard_seriesB") || "");
  const [competitorFunding, setCompetitorFunding] = useState(() => loadStored("battlecard_comp_funding") || "");
  const [competitorG2, setCompetitorG2] = useState(() => loadStored("battlecard_comp_g2") || "");
  const [competitorGaps, setCompetitorGaps] = useState(() => loadStored("battlecard_comp_gaps") || "");

  const isBattlecard = deckType === "Competitor Battle Cards";

  // Mine reviewed calls for real competitive intelligence and objections
  const _allCalls = savedCalls || [];
  const _clientCalls = isBattlecard
    ? _allCalls  // battlecard uses all calls to find top competitor
    : client
      ? _allCalls.filter(c =>
          (c.category_scores?.client || "").toLowerCase() === client.toLowerCase() ||
          (c.prospect_company || "").toLowerCase().includes(client.toLowerCase())
        )
      : [];
  const callCount = _clientCalls.length;
  const callIntelligence = _clientCalls.slice(0, 30).map(c => {
    const cs = c.category_scores || {};
    const parts = [
      c.overall_score && `Score: ${c.overall_score}`,
      c.call_type && `Type: ${c.call_type}`,
      c.deal_stage && `Stage: ${c.deal_stage}`,
      c.deal_value && `Value: ${c.deal_value}`,
      cs.prospect_name && `Prospect: ${cs.prospect_name}`,
      c.prospect_company && `Company: ${c.prospect_company}`,
      c.coaching_notes && `Coaching: ${c.coaching_notes}`,
      cs.objection_handling?.details && !isNADetail(cs.objection_handling.details) && `Objections: ${cs.objection_handling.details}`,
      cs.discovery?.details && !isNADetail(cs.discovery.details) && `Discovery: ${cs.discovery.details}`,
      cs.pitch?.details && !isNADetail(cs.pitch.details) && `Pitch: ${cs.pitch.details}`,
      cs.services_product?.details && !isNADetail(cs.services_product.details) && `Demo/Value: ${cs.services_product.details}`,
      cs.next_steps?.details && !isNADetail(cs.next_steps.details) && `Next Steps: ${cs.next_steps.details}`,
      cs.intro_opening?.details && !isNADetail(cs.intro_opening.details) && `Opening: ${cs.intro_opening.details}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" | ") : null;
  }).filter(Boolean).join("\n---\n");

  const stageRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(700);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setStageWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const brandStorageKey = client ? `cuota_deck_brand_${client}` : "cuota_deck_brand";

  const saveBrand = (key, val) => {
    const k = client ? `cuota_deck_brand_${client}` : "cuota_deck_brand";
    const prev = loadStored(k) || {};
    localStorage.setItem(k, JSON.stringify({ ...prev, [key]: val }));
  };

  // Reload brand when client selection changes
  useEffect(() => {
    const k = client ? `cuota_deck_brand_${client}` : "cuota_deck_brand";
    const globalStored = loadStored("cuota_deck_brand") || {};
    const clientStored = loadStored(k) || {};
    const stored = { ...globalStored, ...clientStored };
    setPrimaryColor(stored.primaryColor || "#1e3a5f");
    setAccentColor(stored.accentColor || "#31CE81");
    setCompanyName(stored.companyName || "");
    setLogoBase64(stored.logoBase64 || null);
    setLogoFileName(stored.logoFileName || null);
    setWebsiteDomain(stored.websiteDomain || "");
    setLogoFetching(false);
    setProspectLogoBase64(stored.prospectLogoBase64 || null);
    setProspectDomain(stored.prospectDomain || "");
    setProspectLogoFetching(false);
    setRefText(stored.referenceText || "");
    setExtractedFields(null);
    setTemplateFileName(null);
    // Auto-fetch prospect logo for known clients that have no logo stored yet
    if (!stored.prospectLogoBase64 && client && CLIENT_DOMAINS[client]) {
      fetchProspectLogo(CLIENT_DOMAINS[client]);
    }
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrimaryChange = (v) => { setPrimaryColor(v); saveBrand("primaryColor", v); };
  const handleAccentChange = (v) => { setAccentColor(v); saveBrand("accentColor", v); };
  const handleCompanyNameChange = (v) => { setCompanyName(v); saveBrand("companyName", v); };

  const fetchLogoFromDomain = async (raw) => {
    const normalized = (raw || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim().toLowerCase();
    if (!normalized) return;
    setLogoFetching(true);
    setWebsiteDomain(normalized);
    saveBrand("websiteDomain", normalized);

    // Server-side proxy returns real base64 — works in all contexts (preview, PDF, PPTX).
    // Clearbit blocks canvas/CORS from the browser, so we fetch via our own API.
    try {
      const resp = await fetch(`/api/proxy-logo?domain=${encodeURIComponent(normalized)}`);
      if (resp.ok) {
        const { dataUri } = await resp.json();
        if (dataUri) {
          setLogoBase64(dataUri);
          setLogoFileName(normalized);
          saveBrand("logoBase64", dataUri);
          saveBrand("logoFileName", normalized);
          setLogoFetching(false);
          return;
        }
      }
    } catch { /* fall through to URL fallback */ }

    // Fallback: store raw URL — works in <img> tags but not canvas/PDF export
    const loaded = await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 5000);
      img.src = `https://logo.clearbit.com/${normalized}`;
    });
    if (loaded) {
      setLogoBase64(`https://logo.clearbit.com/${normalized}`);
      setLogoFileName(normalized);
      saveBrand("logoBase64", `https://logo.clearbit.com/${normalized}`);
      saveBrand("logoFileName", normalized);
    }
    setLogoFetching(false);
  };

  const fetchProspectLogo = async (raw) => {
    const normalized = (raw || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim().toLowerCase();
    if (!normalized) return;
    setProspectLogoFetching(true);
    setProspectDomain(normalized);
    saveBrand("prospectDomain", normalized);
    try {
      const resp = await fetch(`/api/proxy-logo?domain=${encodeURIComponent(normalized)}`);
      if (resp.ok) {
        const { dataUri } = await resp.json();
        if (dataUri) {
          setProspectLogoBase64(dataUri);
          saveBrand("prospectLogoBase64", dataUri);
          setProspectLogoFetching(false);
          return;
        }
      }
    } catch { /* fall through */ }
    // Fallback: Clearbit URL (works in <img> tags, may not work in canvas/PDF)
    const loaded = await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 4000);
      img.src = `https://logo.clearbit.com/${normalized}`;
    });
    if (loaded) {
      const url = `https://logo.clearbit.com/${normalized}`;
      setProspectLogoBase64(url);
      saveBrand("prospectLogoBase64", url);
    }
    setProspectLogoFetching(false);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoBase64(ev.target.result); setLogoFileName(file.name);
      saveBrand("logoBase64", ev.target.result); saveBrand("logoFileName", file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleTemplateUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateFileName(file.name);
    setExtractError("");
    setExtractedFields(null);
    setExtracting(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let text = "";

      if (ext === "pptx" || ext === "ppt") {
        // Extract text from PPTX using JSZip (client-side, no server round-trip)
        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(file);
        const slideKeys = Object.keys(zip.files)
          .filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
          .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] || "0");
            const nb = parseInt(b.match(/\d+/)?.[0] || "0");
            return na - nb;
          });
        for (const key of slideKeys.slice(0, 30)) {
          const xml = await zip.files[key].async("text");
          const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
          const slideText = matches.map(m => m.replace(/<[^>]+>/g, "")).filter(t => t.trim()).join(" ");
          if (slideText.trim()) text += slideText + "\n";
        }
        if (!text.trim()) throw new Error("Could not extract text from this PPTX file. Make sure it contains slide text.");
      } else if (ext === "pdf") {
        // Use pdfjs-dist to extract text client-side (avoids body size limits)
        text = await extractTextFromFile(file);
        if (!text.trim()) throw new Error("Could not extract text from this PDF. Try a PPTX version instead.");
      } else {
        throw new Error("Please upload a .pdf or .pptx file.");
      }

      const validToken = await getValidToken();
      const res = await fetch("/api/extract-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${validToken}` },
        body: JSON.stringify({ text, apiKey: apiKey || undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Server error (${res.status})`);
      }
      const { brand } = await res.json();

      // Auto-fill brand fields with what was extracted
      const filled = [];
      if (brand.companyName && !companyName) { handleCompanyNameChange(brand.companyName); filled.push("Company name"); }
      if (brand.primaryColor) { handlePrimaryChange(brand.primaryColor); filled.push("Primary color"); }
      if (brand.accentColor) { handleAccentChange(brand.accentColor); filled.push("Accent color"); }
      if (brand.referenceText) {
        const combined = [brand.referenceText, brand.toneNotes].filter(Boolean).join("\n\n");
        setRefText(combined);
        saveBrand("referenceText", combined);
        filled.push("Brand voice & messaging");
      }
      setExtractedFields(filled.length ? filled : ["Tone & messaging"]);
    } catch (e) {
      setExtractError(e.message);
      setTemplateFileName(null);
    } finally {
      setExtracting(false);
      if (templateInputRef.current) templateInputRef.current.value = "";
    }
  };

  const generateDeck = async () => {
    if (isBattlecard) {
      if (!competitorName.trim() && !callIntelligence) { setError("Enter a competitor name, or select a client with reviewed calls so we can detect one automatically."); return; }
    } else {
      if (!client && !prospectCompany) { setError("Enter at least a client or prospect company."); return; }
    }
    setGenerating(true); setError(""); setSlides(null); setActiveSlide(0);
    console.log("[AssetBuilder] generating", { client, callCount, intelligenceLength: callIntelligence.length, intelligencePreview: callIntelligence.substring(0, 300), hasLogo: !!logoBase64, companyName });
    // Best-effort prospect logo auto-fetch (non-blocking)
    if (!prospectLogoBase64 && prospectCompany && prospectCompany.trim()) {
      const guessedDomain = prospectCompany.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
      fetchProspectLogo(guessedDomain);
    }
    try {
      const validToken = await getValidToken();
      if (isBattlecard) {
        const res = await fetch("/api/generate-battlecard", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${validToken}` },
          body: JSON.stringify({
            context: {
              companyName, productName: companyName, companyFunding, companyG2,
              seriesA, seriesB, competitorName, competitorFunding, competitorG2,
              competitorGaps, primaryColor, accentColor,
              callIntelligence: callIntelligence || undefined,
              callCount: callCount || undefined,
            },
            apiKey: apiKey || undefined,
          }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Generation failed"); }
        const data = await res.json();
        setSlides(data.pages || []);
      } else {
        const res = await fetch("/api/generate-deck", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${validToken}` },
          body: JSON.stringify({
            context: { client, prospectCompany, repName: "", dealStage, callType: deckType, painPoints, companyName, referenceText: refText, callIntelligence: callIntelligence || undefined, callCount: callCount || undefined },
            apiKey: apiKey || undefined,
          }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Generation failed"); }
        const data = await res.json();
        setSlides(data.slides || []);
      }
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const exportToPPTX = async () => {
    if (!slides?.length) return;
    setExporting("pptx");
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_16x9";
      const pri = primaryColor.replace("#", "");
      const sec = accentColor.replace("#", "");
      for (const slide of slides) {
        const s = pptx.addSlide();
        s.background = { color: "FFFFFF" };
        if (slide.type === "title") {
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 5, h: 5.63, fill: { color: pri }, line: { color: pri, width: 0 } });
          if (companyName) s.addText(companyName.toUpperCase(), { x: 0.35, y: 0.4, w: 4.3, h: 0.35, fontSize: 9, color: "FFFFFF", bold: true, charSpacing: 4 });
          s.addText(slide.title, { x: 0.35, y: 1.4, w: 4.3, h: 2.2, fontSize: 30, bold: true, color: "FFFFFF", wrap: true, valign: "middle" });
          if (slide.subtitle) s.addText(slide.subtitle, { x: 0.35, y: 4.05, w: 4.3, h: 0.6, fontSize: 12, color: "C0C8D0", wrap: true });
          if (prospectCompany || client) s.addText(prospectCompany || client, { x: 5.4, y: 1.7, w: 4.2, h: 0.85, fontSize: 26, bold: true, color: pri, wrap: true });
          s.addText(dealStage || "", { x: 5.4, y: 2.7, w: 4.2, h: 0.45, fontSize: 12, color: "888888" });
          s.addText(new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }), { x: 5.4, y: 3.2, w: 4.2, h: 0.4, fontSize: 12, color: "AAAAAA" });
          if (logoBase64) { try { const isUrl = logoBase64.startsWith("http"); s.addImage({ ...(isUrl ? { path: logoBase64 } : { data: logoBase64 }), x: 5.4, y: 4.85, w: 1.6, h: 0.55, sizing: { type: "contain", w: 1.6, h: 0.55 } }); } catch { /* skip */ } }
        } else {
          s.addText(slide.title, { x: 0, y: 0, w: 10, h: 0.72, fontSize: 20, bold: true, color: "FFFFFF", fill: { color: pri }, margin: [0, 0, 0, 0.35], valign: "middle" });
          s.addShape(pptx.ShapeType.rect, { x: 0.35, y: 0.78, w: 0.9, h: 0.04, fill: { color: sec }, line: { color: sec, width: 0 } });
          const BY = 1.0;
          if (slide.type === "agenda" || slide.type === "problem" || slide.type === "solution") {
            (slide.points || []).slice(0, 5).forEach((pt, i) => { s.addText(pt, { x: 0.35, y: BY + i * 0.83, w: 9.3, h: 0.72, fontSize: 14, color: "333333", bullet: true, wrap: true, valign: "middle" }); });
          } else if (slide.type === "features") {
            const cols = (slide.columns || []).slice(0, 3);
            const cw = (9.3 / cols.length) - 0.2;
            cols.forEach((col, i) => { const cx = 0.35 + i * (cw + 0.2); s.addText(col.heading, { x: cx, y: BY, w: cw, h: 0.55, fontSize: 13, bold: true, color: "FFFFFF", fill: { color: sec }, align: "center", valign: "middle" }); s.addText(col.body || "", { x: cx, y: BY + 0.6, w: cw, h: 3.6, fontSize: 11, color: "444444", fill: { color: "F7F7F7" }, margin: 0.18, valign: "top", wrap: true }); });
          } else if (slide.type === "proof") {
            if (slide.quote) s.addText(`\u201c${slide.quote}\u201d`, { x: 0.35, y: BY, w: 9.3, h: 2.0, fontSize: 15, italic: true, color: "333333", fill: { color: pri, transparency: 92 }, margin: 0.25, valign: "middle", wrap: true });
            if (slide.attribution) s.addText(`\u2014 ${slide.attribution}`, { x: 0.35, y: BY + 2.1, w: 9.3, h: 0.4, fontSize: 11, bold: true, color: "888888" });
            (slide.metrics || []).slice(0, 3).forEach((m, i) => { s.addText(m, { x: 0.35 + i * 3.15, y: BY + 2.65, w: 2.9, h: 1.0, fontSize: 12, bold: true, color: pri, fill: { color: sec, transparency: 80 }, align: "center", valign: "middle", wrap: true }); });
          } else if (slide.type === "roi") {
            (slide.metrics || []).slice(0, 4).forEach((m, i) => { const col = i % 2, row = Math.floor(i / 2); const mx = 0.35 + col * 4.75, my = BY + row * 2.1; s.addText(m.value || "", { x: mx, y: my, w: 4.35, h: 1.1, fontSize: 38, bold: true, color: pri, fill: { color: "F5F5F5" }, align: "center", valign: "middle" }); s.addText(m.label || "", { x: mx, y: my + 1.15, w: 4.35, h: 0.7, fontSize: 12, color: "666666", fill: { color: "EBEBEB" }, align: "center", valign: "middle" }); });
          } else if (slide.type === "timeline") {
            const steps = (slide.steps || []).slice(0, 4); const sw = 9.3 / steps.length - 0.15;
            steps.forEach((step, i) => { const tx = 0.35 + i * (sw + 0.15); s.addText(step.phase || `Phase ${i + 1}`, { x: tx, y: BY, w: sw, h: 0.55, fontSize: 11, bold: true, color: "FFFFFF", fill: { color: sec }, align: "center", valign: "middle" }); s.addText(step.description || "", { x: tx, y: BY + 0.62, w: sw, h: 3.5, fontSize: 11, color: "444444", wrap: true, valign: "top" }); });
          } else if (slide.type === "cta") {
            (slide.points || []).slice(0, 3).forEach((pt, i) => { s.addText(`${i + 1}   ${pt}`, { x: 0.35, y: BY + i * 1.3, w: 9.3, h: 1.1, fontSize: 15, color: "333333", fill: { color: pri, transparency: 92 }, margin: [0, 0, 0, 0.3], valign: "middle", wrap: true }); });
            if (slide.closing) s.addText(slide.closing, { x: 0.35, y: 4.6, w: 9.3, h: 0.7, fontSize: 14, italic: true, color: pri, align: "center", wrap: true });
          }
          if (logoBase64) { try { const isUrl = logoBase64.startsWith("http"); s.addImage({ ...(isUrl ? { path: logoBase64 } : { data: logoBase64 }), x: 8.5, y: 5.1, w: 1.3, h: 0.42, sizing: { type: "contain", w: 1.3, h: 0.42 } }); } catch { /* skip */ } }
        }
      }
      const fileName = `${(client || prospectCompany || "Sales").replace(/\s+/g, "_")}_Deck.pptx`;
      await pptx.writeFile({ fileName });
    } catch (e) { console.error("PPTX export error:", e); setError("Export failed: " + e.message); }
    finally { setExporting(null); }
  };

  const exportToPDF = async () => {
    if (!slides?.length) return;
    setExporting("pdf");
    setError("");
    try {
      const [{ default: html2canvas }, { jsPDF }, { createRoot }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
        import("react-dom/client"),
      ]);
      const pageW = NATURAL_W;
      const pageH = isBattlecard ? BCARD_H : NATURAL_H;
      const pdfOrientation = isBattlecard ? "portrait" : "landscape";
      const pdf = new jsPDF({ orientation: pdfOrientation, unit: "px", format: [pageW, pageH], hotfixes: ["px_scaling"] });
      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage();
        const container = document.createElement("div");
        container.style.cssText = `position:fixed;top:0;left:${-(pageW + 300)}px;width:${pageW}px;height:${pageH}px;overflow:hidden;z-index:9999;background:#fff;`;
        document.body.appendChild(container);
        const root = createRoot(container);
        root.render(isBattlecard
          ? renderBattlecard(slides[i], primaryColor, accentColor, logoBase64)
          : renderSlide(slides[i], primaryColor, accentColor, prospectCompany, client, companyName, logoBase64, prospectLogoBase64));
        await new Promise(r => setTimeout(r, 280));
        const canvas = await html2canvas(container, { width: pageW, height: pageH, scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", logging: false });
        root.unmount();
        document.body.removeChild(container);
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, pageH);
      }
      const suffix = isBattlecard ? "Battlecard" : "Deck";
      pdf.save(`${(client || prospectCompany || competitorName || "Asset").replace(/\s+/g, "_")}_${suffix}.pdf`);
    } catch (e) { console.error("PDF export error:", e); setError("PDF export failed: " + e.message); }
    finally { setExporting(null); }
  };

  const canvasW = Math.min(stageWidth - 80, 860);
  const naturalH = isBattlecard ? BCARD_H : NATURAL_H;
  const canvasH = canvasW * (naturalH / NATURAL_W);
  const scale = canvasW / NATURAL_W;
  const thumbScale = THUMB_W / NATURAL_W;
  const thumbH = isBattlecard ? BCARD_THUMB_H : THUMB_H;
  const thumbNaturalH = isBattlecard ? BCARD_H : NATURAL_H;

  const inputStyle = { width: "100%", padding: "7px 10px", border: "1px solid var(--border-soft)", borderRadius: 7, fontSize: 12, color: "var(--text-1)", outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "var(--surface-2)" };
  const labelStyle = { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 4, fontWeight: 700 };
  const sectionLabel = { fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 };

  const currentSlide = slides?.[activeSlide];

  const [nowStr, setNowStr] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setNowStr(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ margin: "-32px -40px", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Syne', system-ui, sans-serif" }}>

      {/* TOPBAR */}
      <div style={{ height: 52, flexShrink: 0, background: "var(--surface-3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && (
            <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "4px 0", fontSize: 13 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Back
            </button>
          )}
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Asset Builder</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {error && <span style={{ fontSize: 12, color: "#f04438" }}>{error}</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#31CE81", flexShrink: 0, animation: "livePulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-3)", letterSpacing: 0.3 }}>Live · {nowStr}</span>
          </div>
        </div>
      </div>

      {/* BODY — 3 columns */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT — Slide List (180px) */}
        <div style={{ width: 180, flexShrink: 0, background: "var(--surface-3)", borderRight: "1px solid var(--border)", overflowY: "auto", paddingTop: 10 }}>
          {!slides && !generating && (
            <div style={{ padding: "20px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>No slides yet</div>
            </div>
          )}
          {generating && (
            <div style={{ padding: "20px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>Generating…</div>
            </div>
          )}
          {slides && slides.map((slide, idx) => {
            const typeLabel = isBattlecard ? (BCARD_TYPE_LABELS[slide.type] || slide.type) : (SLIDE_TYPE_LABELS[slide.type] || slide.type);
            const isActive = idx === activeSlide;
            return (
              <div key={idx} onClick={() => setActiveSlide(idx)} style={{ padding: "8px 10px 10px", cursor: "pointer", borderLeft: isActive ? `3px solid ${accentColor}` : "3px solid transparent", background: isActive ? "rgba(49,206,129,0.08)" : "transparent", marginBottom: 1 }}>
                <div style={{ width: THUMB_W, height: thumbH, position: "relative", overflow: "hidden", borderRadius: 4, marginBottom: 5, boxShadow: isActive ? `0 0 0 2px ${accentColor}` : "0 1px 4px rgba(0,0,0,0.3)" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: NATURAL_W, height: thumbNaturalH, transform: `scale(${thumbScale})`, transformOrigin: "top left", pointerEvents: "none" }}>
                    {isBattlecard
                      ? renderBattlecard(slide, primaryColor, accentColor, logoBase64)
                      : renderSlide(slide, primaryColor, accentColor, prospectCompany, client, companyName, logoBase64, prospectLogoBase64)}
                  </div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: isActive ? accentColor : "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.7, lineHeight: 1.2 }}>{idx + 1} · {typeLabel}</div>
              </div>
            );
          })}
        </div>

        {/* CENTER — Stage */}
        <div ref={stageRef} style={{ flex: 1, background: "#010d1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          {!slides && !generating && (
            <div style={{ width: "100%", maxWidth: 640, padding: "0 32px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 18, textAlign: "center" }}>Choose an asset type</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {ASSET_TYPES.map((at) => {
                  const selected = deckType === at.id;
                  return (
                    <div
                      key={at.id}
                      onClick={() => setDeckType(at.id)}
                      style={{
                        padding: "20px 22px",
                        borderRadius: 10,
                        border: `1px solid ${selected ? "rgba(49,206,129,0.55)" : "rgba(255,255,255,0.07)"}`,
                        background: selected ? "rgba(49,206,129,0.10)" : "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                      }}
                    >
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{at.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "#31CE81" : "rgba(255,255,255,0.75)", marginBottom: 3 }}>{at.id}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>{at.description}</div>
                      </div>
                      {selected && <span style={{ marginLeft: "auto", fontSize: 14, color: "#31CE81", flexShrink: 0 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Fill in the details on the right, then hit Generate</div>
            </div>
          )}
          {generating && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#9eb5c4", marginBottom: 6 }}>Building your deck…</div>
              <div style={{ fontSize: 11, color: "#7a8ba0" }}>Usually takes 15–20 seconds</div>
            </div>
          )}
          {slides && currentSlide && (
            <>
              {activeSlide > 0 && (
                <button onClick={() => setActiveSlide(i => i - 1)} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 18, zIndex: 2, fontFamily: "inherit" }}>‹</button>
              )}
              {activeSlide < slides.length - 1 && (
                <button onClick={() => setActiveSlide(i => i + 1)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 18, zIndex: 2, fontFamily: "inherit" }}>›</button>
              )}
              <div style={{ width: canvasW, height: canvasH, position: "relative", overflow: "hidden", borderRadius: 6, boxShadow: "0 8px 48px rgba(0,0,0,0.6)", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: NATURAL_W, height: naturalH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  {isBattlecard
                    ? renderBattlecard(currentSlide, primaryColor, accentColor, logoBase64)
                    : renderSlide(currentSlide, primaryColor, accentColor, prospectCompany, client, companyName, logoBase64, prospectLogoBase64)}
                </div>
              </div>
              <div style={{ position: "absolute", bottom: 14, fontSize: 11, color: "#7a8ba0", fontFamily: "'IBM Plex Mono', monospace" }}>
                {activeSlide + 1} / {slides.length}
              </div>
            </>
          )}
        </div>

        {/* RIGHT — Config Panel (256px) */}
        <div style={{ width: 256, flexShrink: 0, background: "var(--surface)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* BRAND */}
            <div>
              <div style={sectionLabel}>Brand Guidelines</div>

              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Company</label>
                <input value={companyName} onChange={e => handleCompanyNameChange(e.target.value)} placeholder="e.g. Cuota" style={inputStyle} />
              </div>

              {/* Logo auto-fetch */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Logo</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={websiteDomain}
                    onChange={e => setWebsiteDomain(e.target.value)}
                    onBlur={e => { if (e.target.value.trim()) fetchLogoFromDomain(e.target.value); }}
                    onKeyDown={e => { if (e.key === "Enter" && websiteDomain.trim()) fetchLogoFromDomain(websiteDomain); }}
                    placeholder="yourcompany.com"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {logoFetching && (
                    <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, paddingRight: 2 }}>…</span>
                  )}
                </div>
                {logoBase64 && !logoFetching && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(49,206,129,0.06)", border: "1px solid rgba(49,206,129,0.28)", borderRadius: 7, marginTop: 6 }}>
                    <img src={logoBase64} alt="logo" style={{ maxHeight: 22, maxWidth: 56, objectFit: "contain", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#31CE81", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{logoFileName}</span>
                    <button
                      onClick={() => { setLogoBase64(null); setLogoFileName(null); setWebsiteDomain(""); saveBrand("logoBase64", null); saveBrand("logoFileName", null); saveBrand("websiteDomain", ""); }}
                      style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}
                    >×</button>
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>
                  Auto-fetched from domain · or{" "}
                  <span onClick={() => logoInputRef.current?.click()} style={{ color: "var(--text-2)", cursor: "pointer", textDecoration: "underline" }}>upload manually</span>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {[{ label: "Primary Color", value: primaryColor, onChange: handlePrimaryChange }, { label: "Accent Color", value: accentColor, onChange: handleAccentChange }].map(c => (
                  <div key={c.label}>
                    <label style={labelStyle}>{c.label}</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="color" value={c.value} onChange={e => c.onChange(e.target.value)} style={{ width: 28, height: 28, border: "1px solid var(--border-soft)", borderRadius: 5, cursor: "pointer", padding: 2, flexShrink: 0, background: "none" }} />
                      <input value={c.value} onChange={e => c.onChange(e.target.value)} style={{ flex: 1, padding: "5px 6px", border: "1px solid var(--border-soft)", borderRadius: 5, fontSize: 11, color: "var(--text-1)", outline: "none", fontFamily: "monospace", background: "var(--surface-2)", boxSizing: "border-box" }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Template deck upload */}
              <div>
                <label style={labelStyle}>Import from existing deck</label>
                <div
                  onClick={() => !extracting && templateInputRef.current?.click()}
                  style={{
                    border: `1px dashed ${extractedFields ? "rgba(49,206,129,0.5)" : "var(--border-soft)"}`,
                    borderRadius: 7,
                    padding: "9px 10px",
                    cursor: extracting ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: extractedFields ? "rgba(49,206,129,0.06)" : "var(--surface-2)",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>
                    {extracting ? "⏳" : extractedFields ? "✓" : "📄"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {extracting
                      ? <span style={{ fontSize: 11, color: "var(--text-2)" }}>Extracting brand…</span>
                      : extractedFields
                        ? <span style={{ fontSize: 11, color: "#31CE81", fontWeight: 600 }}>{templateFileName}</span>
                        : <span style={{ fontSize: 11, color: "var(--text-3)" }}>Upload .pdf or .pptx to auto-fill</span>
                    }
                    {extractedFields && (
                      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Filled: {extractedFields.join(", ")}
                      </div>
                    )}
                  </div>
                  {(templateFileName && !extracting) && (
                    <button
                      onClick={ev => { ev.stopPropagation(); setTemplateFileName(null); setExtractedFields(null); setExtractError(""); setRefText(""); }}
                      style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0, lineHeight: 1 }}
                      title="Remove"
                    >×</button>
                  )}
                </div>
                <input ref={templateInputRef} type="file" accept=".pdf,.pptx,.ppt" onChange={handleTemplateUpload} style={{ display: "none" }} />
                {extractError && <div style={{ fontSize: 10, color: "#f04438", marginTop: 4 }}>{extractError}</div>}
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>
                  Extracts colors, messaging & structure. Or fill manually below.
                </div>
              </div>
            </div>

            {/* CONTEXT — battlecard or standard */}
            {isBattlecard ? (
              <div>
                <div style={sectionLabel}>Your Company</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>G2 Rating</label>
                    <input value={companyG2} onChange={e => { setCompanyG2(e.target.value); localStorage.setItem("battlecard_g2", e.target.value); }} placeholder="e.g. 4.8/5.0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Series A</label>
                    <input value={seriesA} onChange={e => { setSeriesA(e.target.value); localStorage.setItem("battlecard_seriesA", e.target.value); }} placeholder="e.g. $12M" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Series B</label>
                    <input value={seriesB} onChange={e => { setSeriesB(e.target.value); localStorage.setItem("battlecard_seriesB", e.target.value); }} placeholder="e.g. $42M" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Total Funding</label>
                    <input value={companyFunding} onChange={e => { setCompanyFunding(e.target.value); localStorage.setItem("battlecard_funding", e.target.value); }} placeholder="e.g. $54M" style={inputStyle} />
                  </div>
                </div>
                <div style={sectionLabel}>Competitor</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Competitor Name <span style={{ color: "#f04438" }}>*</span></label>
                    <input value={competitorName} onChange={e => { setCompetitorName(e.target.value); localStorage.setItem("battlecard_competitor", e.target.value); }} placeholder="e.g. Apollo.io" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Competitor G2</label>
                    <input value={competitorG2} onChange={e => { setCompetitorG2(e.target.value); localStorage.setItem("battlecard_comp_g2", e.target.value); }} placeholder="e.g. 4.2/5.0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Competitor Funding</label>
                    <input value={competitorFunding} onChange={e => { setCompetitorFunding(e.target.value); localStorage.setItem("battlecard_comp_funding", e.target.value); }} placeholder="e.g. $250M" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Known Gaps</label>
                    <textarea value={competitorGaps} onChange={e => { setCompetitorGaps(e.target.value); localStorage.setItem("battlecard_comp_gaps", e.target.value); }} placeholder="Known weaknesses, customer complaints, product gaps…" rows={4} style={{ ...inputStyle, resize: "vertical", fontSize: 11 }} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={sectionLabel}>Context</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Client</label>
                    <select value={client} onChange={e => setClient(e.target.value)} style={{ ...inputStyle, color: client ? "var(--text-1)" : "var(--text-3)" }}>
                      <option value="">Select…</option>
                      {clients.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Prospect Company</label>
                    <input value={prospectCompany} onChange={e => setProspectCompany(e.target.value)} placeholder="e.g. Meijer" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Prospect Domain</label>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={prospectDomain}
                        onChange={e => setProspectDomain(e.target.value)}
                        onBlur={e => { if (e.target.value.trim()) fetchProspectLogo(e.target.value); }}
                        onKeyDown={e => { if (e.key === "Enter" && prospectDomain.trim()) fetchProspectLogo(prospectDomain); }}
                        placeholder="e.g. diio.ai"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      {prospectLogoFetching && <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>…</span>}
                      {prospectLogoBase64 && !prospectLogoFetching && (
                        <img src={prospectLogoBase64} alt="" style={{ maxHeight: 20, maxWidth: 48, objectFit: "contain", flexShrink: 0, borderRadius: 2, opacity: 0.85 }} />
                      )}
                      {prospectLogoBase64 && !prospectLogoFetching && (
                        <button onClick={() => { setProspectLogoBase64(null); setProspectDomain(""); saveBrand("prospectLogoBase64", null); saveBrand("prospectDomain", ""); }} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Deal Stage</label>
                    <select value={dealStage} onChange={e => setDealStage(e.target.value)} style={inputStyle}>
                      {["Early", "Mid-Pipe", "Late Stage", "Negotiation"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Pain Points</label>
                    <textarea value={painPoints} onChange={e => setPainPoints(e.target.value)} placeholder="Key challenges…" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Brand Voice & Reference{refText ? " ✓" : " (optional)"}</label>
                    <textarea value={refText} onChange={e => { setRefText(e.target.value); saveBrand("referenceText", e.target.value); }} placeholder="Paste messaging, tone notes, or key language from your deck. Auto-filled when you upload a template above." rows={4} style={{ ...inputStyle, resize: "vertical", fontSize: 11 }} />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Actions — pinned at bottom */}
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {callCount > 0 ? (
              <div style={{ fontSize: 10, color: "#31CE81", background: "rgba(49,206,129,0.08)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 6, padding: "6px 8px", lineHeight: 1.4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: callIntelligence ? 4 : 0 }}>
                  <span style={{ fontSize: 12 }}>⬡</span>
                  <span>Informed by <strong>{callCount}</strong> reviewed call{callCount !== 1 ? "s" : ""}{isBattlecard ? " — competitor auto-detected" : ""}</span>
                </div>
                {callIntelligence && (
                  <div style={{ fontSize: 9, color: "rgba(49,206,129,0.7)", lineHeight: 1.5, borderTop: "1px solid rgba(49,206,129,0.15)", paddingTop: 4, wordBreak: "break-word" }}>
                    {callIntelligence.split("\n---\n")[0].substring(0, 120)}{callIntelligence.length > 120 ? "…" : ""}
                  </div>
                )}
              </div>
            ) : client ? (
              <div style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "5px 8px", lineHeight: 1.4 }}>
                No reviewed calls found for <strong>{client}</strong>. Deck will be generated without call data.
              </div>
            ) : null}
            <button onClick={generateDeck} disabled={generating || !!exporting} style={{ width: "100%", padding: "12px", background: generating ? "rgba(49,206,129,0.3)" : "#31CE81", border: "none", borderRadius: 10, color: generating ? "rgba(255,255,255,0.5)" : "#fff", fontSize: 13, fontWeight: 700, cursor: (generating || exporting) ? "wait" : "pointer", fontFamily: "inherit" }}>
              {generating ? "Generating\u2026" : isBattlecard ? "Generate Battlecard \u2726" : "Generate Deck \u2726"}
            </button>
            {slides && (
              <div style={{ display: "flex", gap: 8 }}>
                {!isBattlecard && (
                  <button
                    onClick={exportToPPTX}
                    disabled={!!exporting}
                    style={{ flex: 1, padding: "9px 6px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: exporting === "pptx" ? "var(--text-3)" : "var(--text-1)", fontSize: 11, fontWeight: 600, cursor: exporting ? "wait" : "pointer", fontFamily: "inherit" }}
                  >
                    {exporting === "pptx" ? "Exporting…" : "\u2193 PPTX"}
                  </button>
                )}
                <button
                  onClick={exportToPDF}
                  disabled={!!exporting}
                  style={{ flex: 1, padding: "9px 6px", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: exporting === "pdf" ? "var(--text-3)" : "var(--text-1)", fontSize: 11, fontWeight: 600, cursor: exporting ? "wait" : "pointer", fontFamily: "inherit" }}
                >
                  {exporting === "pdf" ? "Exporting…" : "\u2193 PDF"}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function CmdKPalette({ open, onClose, onNavigate, onNewReview, savedCalls }) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  if (!open) return null;

  const recentCalls = [...savedCalls]
    .sort((a, b) => new Date(b.call_date || b.created_at) - new Date(a.call_date || a.created_at))
    .slice(0, 5);

  const quickActions = [
    { label: "New Review", shortcut: "⌘N", action: () => { onNewReview(); onClose(); } },
    { label: "Create Asset", shortcut: "⌘D", action: () => { onNavigate("assets"); onClose(); } },
  ];
  const navItems = [
    { label: "Home", action: () => { onNavigate("home"); onClose(); } },
    { label: "Clients", action: () => { onNavigate("clients"); onClose(); } },
    { label: "Reviews", action: () => { onNavigate("reviews"); onClose(); } },
    { label: "Assets", action: () => { onNavigate("assets"); onClose(); } },
  ];

  const q = query.toLowerCase();
  const filteredQuick = q ? quickActions.filter(i => i.label.toLowerCase().includes(q)) : quickActions;
  const filteredNav = q ? navItems.filter(i => i.label.toLowerCase().includes(q)) : navItems;
  const filteredRecent = q
    ? recentCalls.filter(c => {
        const text = [c.category_scores?.client, c.category_scores?.rep_name, c.prospect_company].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      })
    : recentCalls;

  const allItems = [
    ...filteredQuick.map(i => ({ ...i, kind: "quick" })),
    ...filteredNav.map(i => ({ ...i, kind: "nav" })),
    ...filteredRecent.map(c => ({
      label: c.id,
      kind: "recent",
      call: c,
      action: () => onClose(),
    })),
  ];

  const handleKey = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, allItems.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return; }
    if (e.key === "Enter" && allItems[highlighted]) { allItems[highlighted].action(); return; }
  };

  const formatDate = (call) => {
    const d = call.call_date || call.created_at;
    return d ? new Date(d + (call.call_date ? "T00:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  };

  let idx = 0;
  const row = (item, content) => {
    const i = idx++;
    const active = highlighted === i;
    return (
      <div key={i} onClick={item.action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", cursor: "pointer", background: active ? "rgba(49,206,129,0.10)" : "transparent", transition: "background 0.1s" }} onMouseEnter={() => setHighlighted(i)}>
        {content(active)}
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, backdropFilter: "blur(4px)", background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "20vh" }}>
      <div onClick={e => e.stopPropagation()} onKeyDown={handleKey} style={{ width: 560, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setHighlighted(0); }} placeholder="Search or jump to…" style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 15, color: "var(--text-primary)", fontFamily: "inherit", padding: 0 }} />
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {filteredQuick.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 16px 4px" }}>Quick Actions</div>
              {filteredQuick.map(item => row(item, (active) => (
                <>
                  <span style={{ fontSize: 13, color: active ? "#31CE81" : "var(--text-primary)" }}>+ {item.label}</span>
                  {item.shortcut && <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{item.shortcut}</span>}
                </>
              )))}
            </>
          )}
          {filteredNav.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 16px 4px" }}>Navigate</div>
              {filteredNav.map(item => row(item, (active) => (
                <span style={{ fontSize: 13, color: active ? "#31CE81" : "var(--text-primary)" }}>{item.label}</span>
              )))}
            </>
          )}
          {filteredRecent.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-muted)", textTransform: "uppercase", padding: "10px 16px 4px" }}>Recent</div>
              {filteredRecent.map(call => row({ action: () => onClose() }, (active) => {
                const client = call.category_scores?.client || call.prospect_company || "—";
                const rep = call.category_scores?.rep_name || call.rep_name || "";
                const type = call.category_scores?.call_type || call.call_type || "";
                const date = formatDate(call);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? "#31CE81" : "var(--text-primary)" }}>{client}</span>
                    {rep && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>· {rep}</span>}
                    {type && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>· {type}</span>}
                    {date && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {date}</span>}
                  </div>
                );
              }))}
            </>
          )}
          {allItems.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No results for "{query}"</div>
          )}
          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}

// ==================== CLIENT PORTAL ====================
function ClientPortal({ companyName, calls, onViewCall, onSignOut, loading }) {
  const sorted = [...calls].sort((a, b) =>
    new Date(b.call_date || b.created_at).getTime() - new Date(a.call_date || a.created_at).getTime()
  );
  const avgScore = calls.length
    ? Math.round(calls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / calls.length)
    : null;
  const latestDate = sorted[0]?.call_date
    ? new Date(sorted[0].call_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const relTime = (d) => {
    if (!d) return "";
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-1)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#31CE81", letterSpacing: "-0.5px" }}>Cuota</span>
          {companyName && (
            <>
              <span style={{ color: "var(--text-3)", fontSize: 16 }}>/</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{companyName}</span>
            </>
          )}
        </div>
        <button onClick={onSignOut} style={{ padding: "6px 14px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>Call Reviews</h1>
          <p style={{ fontSize: 14, color: "var(--text-2)", margin: 0 }}>Recorded call reviews for {companyName || "your company"}.</p>
        </div>

        {/* Stats */}
        {calls.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total Reviews", value: String(calls.length), accent: "#31CE81" },
              { label: "Avg Score", value: avgScore !== null ? `${avgScore}%` : "—", accent: getScoreColor(avgScore || 0) },
              { label: "Latest", value: latestDate || "—", accent: "#6366f1" },
            ].map(card => (
              <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", borderLeft: `3px solid ${card.accent}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: card.label === "Avg Score" ? card.accent : "var(--text-1)" }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Loading…</div>
        ) : calls.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📞</div>
            <p style={{ fontSize: 14, color: "var(--text-2)", margin: 0 }}>No call reviews have been recorded yet.</p>
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 80px 60px", padding: "10px 20px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid var(--border-subtle)" }}>
              <span>Date / Rep</span><span>Call Type</span><span>Stage</span><span>Score</span><span />
            </div>
            {sorted.map(call => {
              const score = call.overall_score;
              const repName = call.category_scores?.rep_name || "";
              const callDate = call.call_date || call.created_at;
              return (
                <div key={call.id} onClick={() => onViewCall(call)}
                  style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 80px 60px", padding: "12px 20px", cursor: "pointer", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", transition: "background 0.1s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{relTime(callDate)}</div>
                    {repName && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{repName}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{call.call_type || "—"}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{call.deal_stage || "—"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: score ? getScoreColor(score) : "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{score ? `${score}%` : "—"}</span>
                  <span style={{ fontSize: 12, color: "#31CE81", fontWeight: 600 }}>View →</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileSettingsModal({ session, profile, onClose, getValidToken, repPhotos, onSaved, apiKey, setApiKey, token, loadCalls, clients }) {
  const [tab, setTab] = useState("profile");
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [avatarPreview, setAvatarPreview] = useState(session?.user?.user_metadata?.avatar_url || null);
  const [localApiKey, setLocalApiKey] = useState(apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const photoInputRef = useRef(null);

  const currentPhoto = avatarPreview || repPhotos?.[profile?.full_name];

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 200; canvas.height = 200;
      const ctx = canvas.getContext("2d");
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, 200, 200);
      setAvatarPreview(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSave = async () => {
    setSaving(true); setSaveMsg("");
    try {
      const t = await getValidToken();
      if (fullName.trim() !== (profile?.full_name || "")) {
        const tbl = await supabase.from("profiles", t);
        await tbl.update({ full_name: fullName.trim() }, `id=eq.${session.user.id}`);
      }
      const metaUpdate = {};
      if (avatarPreview !== (session?.user?.user_metadata?.avatar_url || null)) metaUpdate.avatar_url = avatarPreview;
      if (localApiKey !== apiKey) metaUpdate.api_key = localApiKey;
      if (Object.keys(metaUpdate).length) await supabase.updateUser(t, metaUpdate);
      if (localApiKey !== apiKey) {
        setApiKey(localApiKey);
        localStorage.setItem("cuota_api_key", localApiKey);
      }
      setSaveMsg("Saved!");
      onSaved?.({ full_name: fullName.trim() });
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", padding: "9px 12px", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-muted)", display: "block", marginBottom: 5 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxHeight: "88vh", background: "rgba(6,20,38,0.97)", border: "1px solid var(--border-default)", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Profile & Settings</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 20px 0", flexShrink: 0 }}>
          {(profile?.role === "super_admin" ? ["profile", "integrations"] : ["profile"]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", border: tab === t ? "1.5px solid #31CE81" : "1.5px solid var(--border-subtle)", borderRadius: 20, fontSize: 12, fontWeight: tab === t ? 600 : 400, background: tab === t ? "rgba(49,206,129,0.08)" : "transparent", color: tab === t ? "#31CE81" : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {tab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Avatar */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <RepAvatar name={fullName || session?.user?.email || "?"} photoUrl={currentPhoto} size={72} fontSize={26} />
                  <button onClick={() => photoInputRef.current?.click()} style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: "#31CE81", border: "2px solid rgba(6,20,38,0.97)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", padding: 0 }}>+</button>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{profile?.full_name || "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{session?.user?.email}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, textTransform: "capitalize" }}>Role: {profile?.role || "—"}</div>
                </div>
              </div>
              {/* Fields */}
              <div>
                <label style={labelStyle}>Full Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} placeholder="Your full name" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={session?.user?.email || ""} readOnly style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} />
              </div>
              <div>
                <label style={labelStyle}>Anthropic API Key</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type={showKey ? "text" : "password"} value={localApiKey} onChange={e => setLocalApiKey(e.target.value)} placeholder="sk-ant-..." style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }} />
                  <button onClick={() => setShowKey(s => !s)} style={{ padding: "0 12px", border: "1px solid var(--border-default)", borderRadius: 8, background: "transparent", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{showKey ? "Hide" : "Show"}</button>
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "11px", background: saving ? "rgba(49,206,129,0.4)" : "#31CE81", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}>{saving ? "Saving…" : "Save Changes"}</button>
                {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith("Error") ? "#f04438" : "#31CE81" }}>{saveMsg}</span>}
              </div>
            </div>
          )}
          {tab === "integrations" && (
            <IntegrationsPage getValidToken={getValidToken} token={token} loadCalls={loadCalls} clients={clients} />
          )}
        </div>
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
  const [clientProfiles, setClientProfiles] = useState({}); // { clientName: { website, icp_description, ... } }
  const [repPhotos, setRepPhotos] = useState({}); // { "Full Name": "https://gravatar.com/..." }
  const [crmSnapshots, setCrmSnapshots] = useState([]);
  const [gtmAssessments, setGtmAssessments] = useState([]);
  const [tofAssessments, setTofAssessments] = useState([]);
  const [hiringAssessments, setHiringAssessments] = useState([]);
  const [metricsAssessments, setMetricsAssessments] = useState([]);
  const [gtmReports, setGtmReports] = useState([]);
  const [currentReport, setCurrentReport] = useState(null);
  const [authError, setAuthError] = useState("");
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [folderClient, setFolderClient] = useState(null);
  const [folderAE, setFolderAE] = useState(null);
  const [clients, setClients] = useState(loadClients);
  const [pastClients, setPastClients] = useState(loadPastClients);
  const [archivedClients, setArchivedClients] = useState(loadArchivedClients);
  const [selectedClientProfile, setSelectedClientProfile] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);
  const [repMeta, setRepMeta] = useState(() => loadStored("cuota_rep_meta") || {});
  const updateRepMeta = useCallback((repName, data) => {
    setRepMeta(prev => {
      const next = { ...prev, [repName]: { ...(prev[repName] || {}), ...data } };
      try { localStorage.setItem("cuota_rep_meta", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [clientPageTab, setClientPageTab] = useState("calls");
  const [sidebarOpenClients, setSidebarOpenClients] = useState({});
  const [sidebarSections, setSidebarSections] = useState({ clients: false, assessments: false, admin: false });
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { const v = localStorage.getItem("sidebar_collapsed"); return v === null ? true : v === "1"; } catch { return true; }
  });
  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  }

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

  const archiveFromPast = useCallback((name) => {
    setPastClients(prev => {
      const next = prev.filter(c => c !== name);
      savePastClients(next);
      return next;
    });
    setArchivedClients(prev => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      saveArchivedClients(next);
      return next;
    });
  }, []);

  const restoreFromArchived = useCallback((name) => {
    setArchivedClients(prev => {
      const next = prev.filter(c => c !== name);
      saveArchivedClients(next);
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
  const [callInfo, setCallInfo] = useState({ client: "", repName: "", prospectName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "", repType: "AE" });
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

  // Load saved calls — excludes transcript & ai_analysis (large columns) to avoid statement timeout.
  // Those are fetched on-demand when a call is opened for review.
  // Only include columns confirmed to exist as top-level DB columns.
  // rep_name and prospect_name live inside category_scores JSONB, not as top-level columns.
  const CALLS_LIST_COLS = "id,org_id,created_at,call_date,overall_score,call_type,prospect_company,category_scores,coaching_notes,deal_stage,deal_value";
  const loadCalls = useCallback(async () => {
    const validToken = await getValidToken();
    if (!validToken) return;
    try {
      const table = await supabase.from("call_reviews", validToken);
      const data = await table.selectWhere(CALLS_LIST_COLS, "limit=10000&order=created_at.desc");
      if (Array.isArray(data)) {
        const enriched = data.map(c => ({ ...c, rep_name: c.category_scores?.rep_name || c.prospect_company }));
        // Restrict calls to client_company for rep-role users
        const clientCompany = profile?.client_company;
        const isRestricted = clientCompany && !["admin", "super_admin", "manager"].includes(profile?.role);
        const filtered = isRestricted
          ? enriched.filter(c => c.category_scores?.client === clientCompany || (c.prospect_company || "").toLowerCase().includes(clientCompany.toLowerCase()))
          : enriched;
        setCallsError("");
        setSavedCalls(filtered);
      }
    } catch (e) {
      console.error("Load calls error:", e);
      setCallsError("Failed to load calls: " + (e.message || "Unknown error"));
    }
  }, [getValidToken, profile]);

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

  const loadClientProfiles = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try {
      const data = await (await supabase.from("client_gtm_profiles", t)).select("*");
      if (Array.isArray(data)) {
        const map = {};
        data.forEach(p => { map[p.client] = p; });
        setClientProfiles(map);
      }
    } catch (e) {
      console.warn("Client profiles not available:", e.message);
    }
  }, [getValidToken]);

  const loadOrgProfiles = useCallback(async () => {
    const t = await getValidToken(); if (!t) return;
    try {
      const r = await fetch("/api/org-profiles", { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) return;
      const { profiles } = await r.json();
      const map = {};
      (profiles || []).forEach(p => { if (p.photo_url) map[p.full_name] = p.photo_url; });
      setRepPhotos(map);
    } catch (e) {
      console.warn("Could not load rep photos:", e.message);
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
      Promise.all([loadCalls(), loadDocs(), loadCrmSnapshots(), loadGtmAssessments(), loadTofAssessments(), loadHiringAssessments(), loadMetricsAssessments(), loadGtmReports(), loadClientProfiles(), loadOrgProfiles()]).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, [token, loadCalls, loadDocs, loadCrmSnapshots, loadGtmAssessments, loadTofAssessments, loadHiringAssessments, loadMetricsAssessments, loadGtmReports, loadClientProfiles, loadOrgProfiles]);

  // Auto-refresh token every 50 minutes to prevent expiration during use
  useEffect(() => {
    if (!session?.refresh_token) return;
    const interval = setInterval(() => { refreshSessionToken(); }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session?.refresh_token, refreshSessionToken]);

  // Global keyboard shortcuts: ⌘K → command palette, ⌘N → new review
  useEffect(() => {
    if (!session) return;
    const handler = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") { e.preventDefault(); setCmdKOpen(o => !o); return; }
      if (meta && e.key === "n") { e.preventDefault(); setCmdKOpen(false); startNewReview(); return; }
      if (e.key === "Escape") { setCmdKOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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
        const existingProfile = profiles[0];
        setProfile(existingProfile);
        localStorage.setItem("cuota_profile", JSON.stringify(existingProfile));
        // Patch email if missing (for Gravatar)
        if (!existingProfile.email && user.email) {
          try { await table.update({ email: user.email }, "id=eq." + user.id); } catch (e) { console.warn("Profile email patch failed:", e.message); }
        }
      } else {
        // No profile — check for a valid invitation
        let invitation = null;
        try {
          const invTable = await supabase.from("invitations", accessToken);
          const invites = await invTable.selectWhere("*", "email=eq." + encodeURIComponent(user.email) + "&accepted=eq.false");
          if (Array.isArray(invites) && invites.length > 0) invitation = invites[0];
        } catch (e) { console.error("Invitation lookup failed:", e.message); }

        if (!invitation) {
          // No invitation — block access entirely
          setSession(null);
          localStorage.removeItem("cuota_session");
          localStorage.removeItem("cuota_access_token");
          localStorage.removeItem("cuota_profile");
          setAuthError("This app is invite-only. Ask your admin to send you an invitation to " + (user.email || "your email") + ".");
          return;
        }

        // Mark invitation as accepted
        try {
          const invTable = await supabase.from("invitations", accessToken);
          await invTable.update({ accepted: true }, "id=eq." + invitation.id);
        } catch (e) { console.error("Invitation accept failed:", e.message); }

        // Create profile
        // Auto-derive client_company from email domain if not set on the invitation
        let derivedClientCompany = invitation.client_company || null;
        if (!derivedClientCompany && user.email) {
          const emailDomain = user.email.split("@")[1] || "";
          derivedClientCompany = Object.keys(CLIENT_DOMAINS).find(c => CLIENT_DOMAINS[c] === emailDomain) || null;
        }
        const newProfile = {
          id: user.id,
          org_id: invitation.org_id,
          role: invitation.role || "rep",
          full_name: user.user_metadata?.full_name || user.email,
          email: user.email || null,
          ...(derivedClientCompany ? { client_company: derivedClientCompany } : {}),
        };
        try {
          const created = await table.insert(newProfile);
          const profileData = Array.isArray(created) && created[0] ? created[0] : newProfile;
          setProfile(profileData);
          localStorage.setItem("cuota_profile", JSON.stringify(profileData));
        } catch (insertErr) {
          console.error("Profile insert error:", insertErr);
          setProfile(newProfile);
          localStorage.setItem("cuota_profile", JSON.stringify(newProfile));
        }
      }
    } catch (e) {
      console.error("Profile error:", e);
      // Don't create a fallback profile — just show an error
      setSession(null);
      localStorage.removeItem("cuota_session");
      localStorage.removeItem("cuota_access_token");
      setAuthError("Something went wrong during sign-in. Please try again.");
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

  const activeCategories = getCategories(callInfo.repType);
  const totalRaw = activeCategories.reduce((sum, cat) => sum + (scores[cat.id]?.score || 0), 0);
  const overallScore = Math.round((totalRaw / (activeCategories.length * 10)) * 100);

  const analyzeTranscript = async () => {
    if (!transcript.trim()) { setError("Paste a transcript first."); return; }
    setAnalyzing(true); setError("");
    try {
      const validToken = await getValidToken();
      if (!validToken) { clearSession(); throw new Error("Session expired. Please log in again."); }
      const res = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${validToken}`}, body:JSON.stringify({transcript, apiKey: apiKey || undefined, repType: callInfo.repType || "AE"}) });
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||"Analysis failed");}
      const result=await res.json();
      const newScores = {};
      getCategories(callInfo.repType).forEach(cat => { const ai = result.scores[cat.id]; if (ai) { newScores[cat.id] = { score: ai.score || 0, details: ai.details || "" }; } });
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
        category_scores: { ...scores, rep_name: callInfo.repName, prospect_name: callInfo.prospectName || aiAnalysis?.metadata?.prospect_name || "", client: callInfo.client, rep_type: callInfo.repType || "AE" },
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

  const loadCallIntoReview = async (call) => {
    setSelectedCall(call);
    setCallInfo({ client: call.category_scores?.client || "", repName: call.category_scores?.rep_name || "", prospectName: call.category_scores?.prospect_name || "", prospectCompany: call.prospect_company || "", callDate: call.call_date || "", callType: call.call_type || "Discovery", dealStage: call.deal_stage || "Early", dealValue: call.deal_value || "", repType: call.category_scores?.rep_type || "AE" });
    // Detect old format (boolean criteria) vs new format ({ score, details })
    const cs = call.category_scores || {};
    const isOld = OLD_CATEGORY_IDS.some(id => cs[id] && typeof Object.values(cs[id])[0] === "boolean");
    setScores(isOld ? {} : cs);
    setNotes(call.coaching_notes || "");
    // Use cached values if present (e.g. call was just saved this session)
    setTranscript(call.transcript || "");
    setAiAnalysis(call.ai_analysis || null);
    setPage("review");
    setActiveTab("scorecard");
    // Fetch transcript + ai_analysis on demand (excluded from list query to avoid timeout)
    if (!call.transcript && !call.ai_analysis && call.id) {
      try {
        const t = await getValidToken();
        if (t) {
          const table = await supabase.from("call_reviews", t);
          const rows = await table.selectWhere("transcript,ai_analysis", `id=eq.${call.id}`);
          const full = Array.isArray(rows) ? rows[0] : rows;
          if (full) {
            if (full.transcript) setTranscript(full.transcript);
            if (full.ai_analysis) setAiAnalysis(full.ai_analysis);
          }
        }
      } catch (e) { console.warn("Failed to load call details:", e.message); }
    }
  };

  const startNewReview = () => {
    setSelectedCall(null);
    setCallInfo({ client: "", repName: "", prospectName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "", repType: "AE" });
    setScores({}); setNotes(""); setTranscript(""); setAiAnalysis(null); setError("");
    setPage("review"); setActiveTab("transcript");
  };

  if (loading && !session) return <div style={{ minHeight: "100vh", background: "var(--bg)" }} />;
  if (!session) return <AuthScreen onAuth={handleAuth} authError={authError} />;

  // Client portal — restricted read-only view showing only their company's data
  if (profile?.role === "client" && page !== "review") {
    return (
      <ClientPortal
        companyName={profile.client_company || ""}
        calls={savedCalls}
        onViewCall={loadCallIntoReview}
        onSignOut={clearSession}
        loading={loading}
      />
    );
  }

  if (page === "home") return (
    <>
      {showInvite && <InviteModal token={token} profile={profile} onClose={() => setShowInvite(false)} />}
      {profileModalOpen && <ProfileSettingsModal session={session} profile={profile} onClose={() => setProfileModalOpen(false)} getValidToken={getValidToken} repPhotos={repPhotos} apiKey={apiKey} setApiKey={setApiKey} token={token} loadCalls={loadCalls} clients={clients} onSaved={(updated) => { const next = { ...profile, ...updated }; setProfile(next); try { localStorage.setItem("cuota_profile", JSON.stringify(next)); } catch {} }} />}
      <Dashboard
        userEmail={session.user?.email}
        profile={profile}
        clients={clients}
        savedCalls={savedCalls}
        isLoading={loading}
        callsError={callsError}
        onRetryLoad={loadCalls}
        onNavigate={(p) => { setPage(p); if (p === "clients" || p === "calls") { setFolderClient(null); setFolderAE(null); } }}
        onNewReview={startNewReview}
        onClientClick={(client) => { setSelectedClientProfile(client); setPage("client"); }}
        onProfileClick={() => setProfileModalOpen(true)}
        onInviteClick={() => setShowInvite(true)}
      />
    </>
  );

  if (page === "clients" || page === "calls" || page === "reviews") return (
    <>
      {showInvite && <InviteModal token={token} profile={profile} onClose={() => setShowInvite(false)} />}
      {profileModalOpen && <ProfileSettingsModal session={session} profile={profile} onClose={() => setProfileModalOpen(false)} getValidToken={getValidToken} repPhotos={repPhotos} apiKey={apiKey} setApiKey={setApiKey} token={token} loadCalls={loadCalls} clients={clients} onSaved={(updated) => { const next = { ...profile, ...updated }; setProfile(next); try { localStorage.setItem("cuota_profile", JSON.stringify(next)); } catch {} }} />}
      <ClientsPage
        clients={clients}
        pastClients={pastClients}
        savedCalls={savedCalls}
        clientProfiles={clientProfiles}
        onClientClick={(c) => { setSelectedClientProfile(c); setPage("client"); }}
        onNewReview={startNewReview}
        onNavigate={setPage}
        onAddClient={addClient}
        onArchiveClient={archiveClient}
        onRestoreClient={restoreClient}
        onProfileClick={() => setProfileModalOpen(true)}
        onInviteClick={() => setShowInvite(true)}
        userEmail={session?.user?.email}
        profile={profile}
        callsError={callsError}
        onRetryLoadCalls={loadCalls}
      />
    </>
  );

  if (page === "rep" && selectedRep) {
    const repCalls = savedCalls.filter(c => {
      const clientMatch = !selectedClientProfile ||
        c.category_scores?.client === selectedClientProfile ||
        (c.prospect_company || "").toLowerCase().includes(selectedClientProfile.toLowerCase());
      const repMatch = c.category_scores?.rep_name === selectedRep || c.rep_name === selectedRep;
      return clientMatch && repMatch;
    });
    const repQuota = REP_QUOTAS[selectedRep] ?? null;
    return (
      <RepDetailPage
        client={selectedClientProfile || ""}
        repName={selectedRep}
        repCalls={repCalls}
        quotaTarget={repQuota?.target}
        quotaClosed={repQuota?.closed}
        salesExperience={repMeta[selectedRep]?.salesExperience || ""}
        timeInRole={repMeta[selectedRep]?.timeInRole || ""}
        role={repMeta[selectedRep]?.role || ""}
        onUpdateMeta={(data) => updateRepMeta(selectedRep, data)}
        onBack={() => setPage("client")}
        onViewCall={loadCallIntoReview}
        onNavigate={setPage}
        onNewReview={startNewReview}
        photoUrl={repPhotos[selectedRep]}
      />
    );
  }

  const tabs = [
    { id: "transcript", label: "Transcript" },
    { id: "scorecard", label: "Scorecard" },
    { id: "insights", label: aiAnalysis ? "AI Insights \u2726" : "AI Insights" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--text-1)", fontFamily: "'Geist', system-ui, sans-serif" }}>
      {showInvite && <InviteModal token={token} profile={profile} onClose={() => setShowInvite(false)} />}
      {gongSettingsClient && <GongSettingsModal token={token} getValidToken={getValidToken} client={gongSettingsClient} onClose={() => setGongSettingsClient(null)} />}
      {gongSyncClient && <GongSyncModal getValidToken={getValidToken} client={gongSyncClient} onClose={() => setGongSyncClient(null)} onCallProcessed={loadCalls} />}
      {profileModalOpen && (
        <ProfileSettingsModal
          session={session}
          profile={profile}
          onClose={() => setProfileModalOpen(false)}
          getValidToken={getValidToken}
          repPhotos={repPhotos}
          apiKey={apiKey}
          setApiKey={setApiKey}
          token={token}
          loadCalls={loadCalls}
          clients={clients}
          onSaved={(updated) => {
            const next = { ...profile, ...updated };
            setProfile(next);
            try { localStorage.setItem("cuota_profile", JSON.stringify(next)); } catch {}
          }}
        />
      )}

      {/* COMMAND PALETTE */}
      <CmdKPalette open={cmdKOpen} onClose={() => setCmdKOpen(false)} onNavigate={(p) => { setPage(p); if (p === "clients") { setFolderClient(null); setFolderAE(null); } }} onNewReview={startNewReview} savedCalls={savedCalls} />

      {/* SIDEBAR — hidden for client-role users */}
      {profile?.role !== "client" && (() => {
        const W = sidebarCollapsed ? 64 : 220;
        const isClientsActive = page === "clients" || page === "calls" || page === "client" || page === "reviews" || page === "review" || page === "assets";
        const iconClients = (color) => (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        );
        return (
          <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: W, background: "rgba(4,9,20,0.82)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", zIndex: 100, transition: "width 0.2s ease", overflow: "hidden" }}>
            {/* Logo */}
            <div style={{ padding: sidebarCollapsed ? "20px 0" : "20px 16px 16px", display: "flex", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
              {sidebarCollapsed ? (
                <div onClick={() => setPage("home")} style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden", cursor: "pointer", flexShrink: 0 }}>
                  <img src="/favicon.png" alt="Cuota" style={{ width: "115%", height: "115%", marginLeft: "-7.5%", marginTop: "-7.5%", display: "block" }} />
                </div>
              ) : (
                <img src="/cuota_logo_official_White.png" alt="Cuota" onClick={() => setPage("home")} style={{ height: 48, cursor: "pointer", display: "block", maxWidth: "100%" }} />
              )}
            </div>
            {/* Nav */}
            <nav style={{ flex: 1, padding: sidebarCollapsed ? "4px 8px" : "8px 10px 0", display: "flex", flexDirection: "column", gap: 4 }}>
              {sidebarCollapsed ? (
                <>
                  <button onClick={() => { setPage("clients"); setFolderClient(null); setFolderAE(null); }} title="Clients"
                    style={{ width: "100%", padding: "10px 0", border: "none", borderRadius: 8, background: isClientsActive ? "rgba(49,206,129,0.14)" : "transparent", cursor: "pointer", display: "flex", justifyContent: "center", fontFamily: "inherit" }}
                    onMouseEnter={e => { if (!isClientsActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isClientsActive ? "rgba(49,206,129,0.14)" : "transparent"; }}
                  >
                    {iconClients(isClientsActive ? "#31CE81" : "#7a8ba0")}
                  </button>
                  <button onClick={startNewReview} title="New Review"
                    style={{ width: "100%", padding: "10px 0", border: "none", borderRadius: 8, background: "rgba(49,206,129,0.12)", cursor: "pointer", display: "flex", justifyContent: "center", fontFamily: "inherit" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#31CE81", lineHeight: 1 }}>+</span>
                  </button>
                  <button onClick={toggleSidebar} title="Expand sidebar"
                    style={{ marginTop: "auto", width: "100%", padding: "10px 0", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", justifyContent: "center", fontFamily: "inherit" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ fontSize: 14, color: "#7a8ba0", lineHeight: 1 }}>›</span>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setPage("clients"); setFolderClient(null); setFolderAE(null); }}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "8px 10px", border: "none", background: isClientsActive ? "rgba(49,206,129,0.14)" : "transparent", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left", boxSizing: "border-box" }}
                    onMouseEnter={e => { if (!isClientsActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isClientsActive ? "rgba(49,206,129,0.14)" : "transparent"; }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isClientsActive ? "#31CE81" : "#9ca3af" }}>Clients</span>
                    {isClientsActive && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#31CE81", flexShrink: 0 }} />}
                  </button>
                  <button onClick={startNewReview}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "8px 10px", border: "none", background: "#31CE81", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", marginTop: 4, boxSizing: "border-box", gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 400, color: "#fff", lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>New Review</span>
                  </button>
                  <button onClick={toggleSidebar} title="Collapse sidebar"
                    style={{ marginTop: "auto", width: "100%", padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", fontFamily: "inherit", gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ fontSize: 14, color: "#7a8ba0", lineHeight: 1 }}>‹</span>
                    <span style={{ fontSize: 11, color: "#7a8ba0" }}>Collapse</span>
                  </button>
                </>
              )}
            </nav>
            {/* Footer — clickable profile row */}
            <div style={{ padding: sidebarCollapsed ? "10px 8px" : "10px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 4 }}>

              {/* Invite button — super_admin/manager only */}
              {(profile?.role === "super_admin" || profile?.role === "manager") && (
                <div
                  onClick={() => setShowInvite(true)}
                  title="Invite team member"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: sidebarCollapsed ? "7px 0" : "8px 8px", borderRadius: 10, cursor: "pointer", transition: "background 0.15s", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(49,206,129,0.09)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(49,206,129,0.12)", border: "1px solid rgba(49,206,129,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3v14M3 10h14" stroke="#31CE81" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  {!sidebarCollapsed && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#31CE81", whiteSpace: "nowrap" }}>Invite Member</span>
                  )}
                </div>
              )}

              {/* Profile row */}
              <div
                onClick={() => setProfileModalOpen(true)}
                title="Profile & Settings"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: sidebarCollapsed ? "6px 0" : "8px 8px", borderRadius: 10, cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <RepAvatar name={profile?.full_name || session?.user?.email || "?"} photoUrl={session?.user?.user_metadata?.avatar_url || repPhotos[profile?.full_name]} size={32} fontSize={12} />
                {!sidebarCollapsed && (
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.full_name || "Profile"}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.user?.email}</div>
                  </div>
                )}
                {!sidebarCollapsed && <span style={{ fontSize: 14, color: "var(--text-muted)", flexShrink: 0 }}>⚙</span>}
              </div>
            </div>
          </div>
        );
      })()}


      <div style={{ marginLeft: profile?.role === "client" ? 0 : (sidebarCollapsed ? 64 : 220), flex: 1, padding: "32px 40px", transition: "margin-left 0.2s ease" }}>
        {/* HOME PAGE — Dashboard */}
        {page === "home" && <HomePage savedCalls={savedCalls} enablementDocs={enablementDocs} crmSnapshots={crmSnapshots} gtmAssessments={gtmAssessments} tofAssessments={tofAssessments} hiringAssessments={hiringAssessments} metricsAssessments={metricsAssessments} clients={clients} onNavigate={(p) => { if (p === "review") { startNewReview(); } else { setPage(p); if (p === "calls" || p === "clients") { setFolderClient(null); setFolderAE(null); } } }} onClientClick={(c) => { setSelectedClientProfile(c); setPage("client"); }} userEmail={session?.user?.email} onCmdK={() => setCmdKOpen(true)} onNewReview={startNewReview} />}

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
          onBack={() => { setPage("clients"); setSelectedClientProfile(null); }}
          onViewCall={(call) => { loadCallIntoReview(call); }}
          onBrowseByRep={(repName) => { setSelectedRep(repName); setPage("rep"); }}
          onNavigate={(p) => setPage(p)}
          activeTab={clientPageTab}
          onTabChange={setClientPageTab}
          getValidToken={getValidToken}
          clientProfiles={clientProfiles}
          onProfileUpdate={loadClientProfiles}
          gtmAssessments={gtmAssessments}
          profile={profile}
          onGtmUpdate={loadGtmAssessments}
          onRefresh={loadCalls}
          repPhotos={repPhotos}
          onDocsUpdate={loadDocs}
          repMeta={repMeta}
        />}

        {/* CLIENTS — handled by early return above */}

        {/* SALES ENABLEMENT */}
        {page === "enablement" && <EnablementPage docs={enablementDocs} getValidToken={getValidToken} profile={profile} clients={clients} onDocsUpdate={loadDocs} />}

        {/* REVOPS */}
        {page === "crm" && <CrmPage snapshots={crmSnapshots} getValidToken={getValidToken} profile={profile} clients={clients} onSnapshotsUpdate={loadCrmSnapshots} />}

        {/* HIRING */}
        {page === "hiring" && <SalesHiringPage assessments={hiringAssessments} getValidToken={getValidToken} profile={profile} clients={clients} onUpdate={loadHiringAssessments} />}

        {/* METRICS */}
        {page === "metrics" && <MetricsPage assessments={metricsAssessments} getValidToken={getValidToken} profile={profile} clients={clients} onUpdate={loadMetricsAssessments} />}

        {/* CLIENT INTEL */}
        {page === "clientIntel" && <ClientIntelPage getValidToken={getValidToken} clients={clients} />}

        {/* CUOTA AGENT */}
        {page === "cuotaAgent" && <CuotaAgentPage getValidToken={getValidToken} savedCalls={savedCalls} />}

        {/* PRESENTATIONS */}
        {page === "assets" && <PresentationBuilderPage clients={clients} apiKey={apiKey} getValidToken={getValidToken} defaultClient={selectedClientProfile} savedCalls={savedCalls} onBack={() => setPage("client")} />}

        {page === "integrations" && profile?.role === "super_admin" && <IntegrationsPage getValidToken={getValidToken} token={token} loadCalls={loadCalls} clients={clients} />}
        {page === "docsync" && profile?.role === "super_admin" && <DocSyncPage getValidToken={getValidToken} clients={[...clients, ...pastClients, ...archivedClients]} onDocsUpdate={loadDocs} />}
        {page === "admin" && profile?.role === "super_admin" && <AdminDashboard allCalls={savedCalls} />}

        {/* SETTINGS PAGE */}
        {page === "settings" && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-1)", margin: "0 0 24px" }}>Settings</h1>
            <div className="glass-card" style={{ borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>Account</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <RepAvatar name={profile?.full_name || session?.user?.email || "?"} photoUrl={repPhotos[profile?.full_name]} size={40} fontSize={15} />
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-1)" }}>{session?.user?.email}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Role: {profile?.role || "—"}</div>
                </div>
              </div>
            </div>
            {profile?.role === "super_admin" && <IntegrationsPage getValidToken={getValidToken} token={token} loadCalls={loadCalls} clients={clients} />}
          </div>
        )}

        {/* REVIEW PAGE */}
        {page === "review" && (
          <>
            {/* Client back button */}
            {profile?.role === "client" && (
              <button onClick={() => setPage("home")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "transparent", color: "var(--text-2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
                ← Back to Reviews
              </button>
            )}

            {/* Sticky context header */}
            <div style={{ position: "sticky", top: -32, marginTop: -32, paddingTop: 32, paddingBottom: 16, background: "var(--bg)", zIndex: 10, borderBottom: "1px solid var(--border-soft)", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" }}>
                <span style={{ fontWeight: 700, color: "var(--text-1)" }}>{callInfo.client || "New Call Review"}</span>
                {callInfo.repName && <><span style={{ color: "var(--text-3)" }}>›</span><span>{callInfo.repName}</span></>}
                {callInfo.callType && <><span style={{ color: "var(--text-3)" }}>›</span><span style={{ color: "var(--text-2)" }}>{callInfo.callType}</span></>}
                {callInfo.callDate && <span style={{ color: "var(--text-3)" }}> · {new Date(callInfo.callDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
              </div>
            </div>

            {/* Call Info — grouped WHO / WHAT & WHEN */}
            <div className="glass-card" style={{ borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Who</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
                {[
                  { key: "client", label: "Client", options: clients, required: true },
                  { key: "repName", label: "Rep Name", placeholder: "e.g. Sarah Chen" },
                  { key: "repType", label: "Rep Type", options: ["AE", "SDR"] },
                  { key: "prospectName", label: "Prospect Name", placeholder: "e.g. John Smith" },
                  { key: "prospectCompany", label: "Prospect Co.", placeholder: "e.g. Meijer" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{f.label}</label>
                    {f.options ? (
                      <select value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid " + (!callInfo[f.key] && f.required ? "rgba(239,68,68,0.3)" : "var(--border-soft)"), borderRadius: 8, color: callInfo[f.key] ? "var(--text-1)" : "var(--text-3)", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                        {!callInfo[f.key] && <option value="">Select {f.label.toLowerCase()}...</option>}
                        {f.options.map(o => <option key={o} value={o} style={{ background: "var(--surface)", color: "var(--text-1)" }}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || "text"} value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8, marginTop: 16 }}>What & When</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                {[
                  { key: "callDate", label: "Date", type: "date" },
                  { key: "callType", label: "Call Type", options: ["Discovery", "Demo", "Follow-up", "Negotiation", "Closing"] },
                  { key: "dealStage", label: "Deal Stage", options: ["Early", "Mid-Pipe", "Late Stage", "Negotiation"] },
                  { key: "dealValue", label: "Deal Value ($)", placeholder: "e.g. 50000", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", display: "block", marginBottom: 6 }}>{f.label}</label>
                    {f.options ? (
                      <select value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: callInfo[f.key] ? "var(--text-1)" : "var(--text-3)", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                        {!callInfo[f.key] && <option value="">Select...</option>}
                        {f.options.map(o => <option key={o} value={o} style={{ background: "var(--surface)", color: "var(--text-1)" }}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || "text"} value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8, color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Score Hero */}
            <div className="glass-card" style={{ borderRadius: 14, padding: "12px 18px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: getScoreColor(overallScore), fontFamily: "'IBM Plex Mono', monospace" }}>{overallScore}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(overallScore), background: getScoreColor(overallScore) + "18", padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 1 }}>{getScoreLabel(overallScore)}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", fontFamily: "'IBM Plex Mono', monospace" }}>{totalRaw} / {activeCategories.length * 10} pts</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{activeCategories.length} categories</div>
                </div>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 5 }}>
                <div style={{ height: "100%", width: overallScore + "%", background: getScoreColor(overallScore), borderRadius: 5, transition: "width 0.6s ease" }} />
              </div>
            </div>

            {/* Tabs — underline style */}
            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid var(--border-soft)", overflowX: "auto" }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "10px 16px 10px", border: "none", borderBottom: activeTab === tab.id ? "2px solid #6366F1" : "2px solid transparent", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500, whiteSpace: "nowrap", color: activeTab === tab.id ? "#6366F1" : "var(--text-2)", fontFamily: "inherit", marginBottom: -1 }}>{tab.label}</button>
              ))}
            </div>

            {/* Transcript */}
            {activeTab === "transcript" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Call Transcript</h3>
                  <button onClick={analyzeTranscript} disabled={analyzing || !transcript.trim()} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing ? "wait" : "pointer", background: analyzing ? "rgba(255,255,255,0.08)" : "#31CE81", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: !transcript.trim() ? 0.4 : 1 }}>
                    {analyzing ? "Analyzing..." : "Analyze with AI \u2726"}
                  </button>
                </div>
                {error && <div style={{ padding: "10px 14px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
                <FileDropZone value={transcript} onChange={setTranscript} placeholder="Paste your call transcript here, or drag and drop a file — .txt, .vtt, .srt, .pdf, .docx supported..." minHeight={350} accept=".txt,.vtt,.srt,.md,.pdf,.docx" />
                {analyzing && <div style={{ marginTop: 16, padding: 20, textAlign: "center", background: "var(--surface)", borderRadius: 12 }}><p style={{ fontSize: 14, color: "var(--text-2)" }}>Analyzing transcript... (15-30s)</p></div>}
              </div>
            )}

            {/* Scorecard */}
            {activeTab === "scorecard" && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Category Scores</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {activeCategories.filter(cat => !isNADetail(scores[cat.id]?.details)).map(cat => (
                    <CategoryBar key={cat.id} category={cat} scores={scores} onScoreChange={handleScoreChange} />
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights */}
            {activeTab === "insights" && (aiAnalysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Gut Check */}
                <div className="glass-card" style={{ borderRadius: 12, padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Gut Check</h4>
                  <p style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>{aiAnalysis.gut_check}</p>
                </div>

                {/* Strengths + Opportunities — 2-column */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#31CE81", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Strengths</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(aiAnalysis.strengths || []).map((s, i) => (
                        <div key={i} style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7a42", marginBottom: 4 }}>{s.title}</div>
                          <p style={{ fontSize: 12, color: "#1a7a42", margin: 0, lineHeight: 1.6, opacity: 0.85 }}>{s.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#eab308", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Areas of Opportunity</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(aiAnalysis.areas_of_opportunity || []).map((area, i) => (
                        <div key={i} className="glass-card" style={{ borderRadius: 12, padding: 14 }}>
                          <p style={{ fontSize: 13, color: "var(--text-1)", margin: "0 0 8px", lineHeight: 1.6 }}>{area.description}</p>
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(99,102,241,0.04)", borderLeft: "3px solid #6366F1", borderRadius: "0 6px 6px 0" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#6366F1", textTransform: "uppercase", letterSpacing: 0.8 }}>↳ Fix</span>
                            <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0", lineHeight: 1.6 }}>{area.fix}</p>
                          </div>
                        </div>
                      ))}
                    </div>
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
                        const isFailed = flagged && risk.severity === "high";
                        const isWarning = flagged && risk.severity !== "high";
                        const badgeBg = isFailed ? "rgba(239,68,68,0.06)" : isWarning ? "rgba(234,179,8,0.06)" : "rgba(49,206,129,0.04)";
                        const badgeBorder = isFailed ? "rgba(239,68,68,0.2)" : isWarning ? "rgba(234,179,8,0.2)" : "rgba(49,206,129,0.15)";
                        const badgeColor = isFailed ? "#ef4444" : isWarning ? "#b45309" : "#31CE81";
                        const badgeBgIcon = isFailed ? "rgba(239,68,68,0.1)" : isWarning ? "rgba(234,179,8,0.1)" : "rgba(49,206,129,0.1)";
                        const icon = isFailed ? "✕" : isWarning ? "⚠" : "✓";
                        return (
                          <div key={risk.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: badgeBg, border: `1px solid ${badgeBorder}` }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeBgIcon, borderRadius: 6, padding: "2px 7px", flexShrink: 0, marginTop: 1 }}>{icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: flagged ? "var(--text-1)" : "var(--text-2)", marginBottom: 2 }}>{risk.label}</div>
                              {!isNADetail(data.details) && <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{data.details}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-2)" }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>{"\u2726"}</p>
                <p style={{ fontSize: 14 }}>Paste a transcript and click Analyze with AI</p>
              </div>
            ))}

            {/* Notes */}
            {activeTab === "notes" && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "0 0 12px" }}>Coaching Notes</h3>
                <textarea value={notes} onChange={e => { if (profile?.role !== "client") setNotes(e.target.value); }} readOnly={profile?.role === "client"} placeholder="Key observations, coaching points..." style={{ width: "100%", minHeight: 200, background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 16, fontSize: 13, color: "var(--text-1)", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", cursor: profile?.role === "client" ? "default" : "auto" }} />
              </div>
            )}

            {/* Save Button — hidden for client-role users */}
            {profile?.role !== "client" && (
              <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "flex-end" }}>
                {saveSuccess && <span style={{ padding: "12px 0", fontSize: 13, color: "#6366F1", fontWeight: 600 }}>Saved successfully!</span>}
                {error && !analyzing && <span style={{ padding: "12px 0", fontSize: 13, color: "#ef4444" }}>{error}</span>}
                <button onClick={saveCall} disabled={saving} style={{ padding: "14px 32px", border: "none", borderRadius: 12, cursor: "pointer", background: "#31CE81", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving..." : selectedCall ? "Update Call" : "Save This Call"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

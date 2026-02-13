import { useState, useEffect, useCallback } from "react";

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
    return r.json();
  },
  async from(table, token) {
    return {
      async select(query = "*") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}`, { headers: supabase.headers(token) });
        return r.json();
      },
      async selectWhere(query = "*", filters = "") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${query}&${filters}`, { headers: supabase.headers(token) });
        return r.json();
      },
      async insert(data) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: { ...supabase.headers(token), Prefer: "return=representation" }, body: JSON.stringify(data) });
        return r.json();
      },
      async update(data, filters) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, { method: "PATCH", headers: { ...supabase.headers(token), Prefer: "return=representation" }, body: JSON.stringify(data) });
        return r.json();
      },
      async delete(filters) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, { method: "DELETE", headers: supabase.headers(token) });
        return r.ok;
      },
    };
  },
};

const CATEGORIES = [
  { id: "opening", name: "Opening & Agenda Setting", weight: 8, description: "Did the rep set a clear agenda, confirm time, and establish purpose?", criteria: ["Confirmed time available", "Stated clear agenda/purpose", "Asked prospect to add items", "Set expectations for outcome"] },
  { id: "discovery", name: "Discovery Depth", weight: 15, description: "Quality of questions asked to uncover pain, impact, and urgency", criteria: ["Identified core business pain", "Quantified impact of the problem", "Explored timeline/urgency", "Uncovered previous attempts to solve", "Asked 'why now?' or trigger event"] },
  { id: "qualification", name: "Qualification (MEDDPICC)", weight: 15, description: "Did the rep qualify the opportunity properly?", criteria: ["Metrics: Success criteria defined", "Economic Buyer: Identified or accessed", "Decision Criteria: Understood", "Decision Process: Mapped", "Paper Process: Legal/procurement discussed", "Implicated Pain: Connected to business impact", "Champion: Identified and tested", "Competition: Landscape understood"] },
  { id: "storytelling", name: "Storytelling & Social Proof", weight: 10, description: "Use of relevant case studies, analogies, and proof points", criteria: ["Used relevant customer story", "Matched story to prospect's situation", "Included specific metrics/outcomes", "Created 'that could be us' moment"] },
  { id: "objection", name: "Objection Handling", weight: 12, description: "How the rep addressed concerns, pushback, and resistance", criteria: ["Acknowledged the concern genuinely", "Asked clarifying questions before responding", "Reframed rather than argued", "Used evidence/proof to address", "Confirmed resolution before moving on"] },
  { id: "demo", name: "Demo / Value Presentation", weight: 10, description: "Was the demo/presentation tailored and compelling?", criteria: ["Tied features to stated pain points", "Avoided feature dumping", "Asked engagement questions during demo", "Created 'aha' moments"] },
  { id: "multithreading", name: "Multi-threading & Stakeholders", weight: 10, description: "Did the rep expand beyond single contact?", criteria: ["Asked about other stakeholders", "Understood org structure", "Planned to engage additional contacts", "Discussed how to get champion buy-in"] },
  { id: "nextsteps", name: "Next Steps & Commitment", weight: 12, description: "Quality and specificity of agreed next steps", criteria: ["Proposed specific next step", "Got calendar commitment (date/time)", "Assigned clear action items", "Summarized what was agreed", "Created urgency or deadline"] },
  { id: "control", name: "Call Control & Presence", weight: 8, description: "Rep's ability to manage flow, pace, and energy", criteria: ["Managed talk/listen ratio well", "Redirected tangents effectively", "Showed confidence and authority", "Used silence effectively", "Matched prospect's energy/pace"] },
];

const RISK_DEFINITIONS = [
  { id: "single_thread", label: "Single-Threaded Deal", icon: "\u{1F9F5}", severity: "high" },
  { id: "no_next_steps", label: "Vague or No Next Steps", icon: "\u{1F4C5}", severity: "high" },
  { id: "no_pain", label: "Pain Not Quantified", icon: "\u{1F3AF}", severity: "high" },
  { id: "happy_ears", label: "Happy Ears Detected", icon: "\u{1F442}", severity: "medium" },
  { id: "no_champion", label: "No Champion Identified", icon: "\u{1F6E1}\uFE0F", severity: "medium" },
  { id: "competitor_unhandled", label: "Competitor Mentioned, Not Addressed", icon: "\u2694\uFE0F", severity: "medium" },
  { id: "no_timeline", label: "No Timeline Established", icon: "\u23F0", severity: "medium" },
  { id: "no_budget", label: "Budget Not Discussed", icon: "\u{1F4B0}", severity: "low" },
  { id: "low_engagement", label: "Low Prospect Engagement", icon: "\u{1F636}", severity: "high" },
  { id: "feature_dump", label: "Feature Dumping Detected", icon: "\u{1F4E6}", severity: "low" },
];

const ANALYSIS_PROMPT = "You are an expert sales call reviewer using the Cuota Revenue Framework. Analyze the following sales call transcript.\n\nSCORING FRAMEWORK (9 categories):\n1. OPENING (8%): Confirmed time | Stated agenda | Asked prospect to add | Set expectations\n2. DISCOVERY (15%): Core pain | Quantified impact | Timeline/urgency | Previous attempts | Why now\n3. QUALIFICATION MEDDPICC (15%): Metrics | Economic Buyer | Decision Criteria | Decision Process | Paper Process | Implicated Pain | Champion | Competition\n4. STORYTELLING (10%): Customer story | Matched situation | Specific metrics | That could be us moment\n5. OBJECTION HANDLING (12%): Acknowledged | Clarifying questions | Reframed | Evidence | Confirmed resolution\n6. DEMO (10%): Tied to pain | No feature dump | Engagement questions | Aha moments\n7. MULTI-THREADING (10%): Other stakeholders | Org structure | Additional contacts | Champion buy-in\n8. NEXT STEPS (12%): Specific step | Calendar commitment | Action items | Summarized | Urgency\n9. CALL CONTROL (8%): Talk ratio | Redirected tangents | Confidence | Silence | Matched energy\n\nRISK FLAGS: single_thread, no_next_steps, no_pain, happy_ears, no_champion, competitor_unhandled, no_timeline, no_budget, low_engagement, feature_dump\n\nALSO EXTRACT from the transcript:\n- rep_name: The sales rep / account executive name\n- prospect_company: The prospect's company name\n- prospect_name: The main prospect/buyer on the call\n- call_type: One of Discovery, Demo, Follow-up, Negotiation, Closing\n- deal_stage: One of Early, Mid-Pipe, Late Stage, Negotiation\n\nRESPOND ONLY WITH VALID JSON:\n{\"metadata\":{\"rep_name\":\"...\",\"prospect_company\":\"...\",\"prospect_name\":\"...\",\"call_type\":\"...\",\"deal_stage\":\"...\"},\"scores\":{\"opening\":{\"criteria_met\":[true,false,...],\"key_moment\":\"...\"},\"discovery\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"qualification\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"storytelling\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"objection\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"demo\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"multithreading\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"nextsteps\":{\"criteria_met\":[...],\"key_moment\":\"...\"},\"control\":{\"criteria_met\":[...],\"key_moment\":\"...\"}},\"risks\":{\"single_thread\":false,\"no_next_steps\":false,\"no_pain\":false,\"happy_ears\":false,\"no_champion\":false,\"competitor_unhandled\":false,\"no_timeline\":false,\"no_budget\":false,\"low_engagement\":false,\"feature_dump\":false},\"coaching_notes\":\"...\",\"executive_summary\":\"...\",\"top_3_improvements\":[\"...\",\"...\",\"...\"],\"strongest_moment\":\"...\",\"biggest_miss\":\"...\"}";

function getScoreColor(s) { return s >= 80 ? "#31CE81" : s >= 60 ? "#eab308" : s >= 40 ? "#f97316" : "#ef4444"; }
function getScoreLabel(s) { return s >= 85 ? "Excellent" : s >= 70 ? "Strong" : s >= 55 ? "Developing" : s >= 40 ? "Needs Work" : "Critical"; }
function getMomentumLabel(m) { return m >= 80 ? { label: "Accelerating", color: "#31CE81", icon: "\u{1F680}" } : m >= 60 ? { label: "Steady", color: "#3b82f6", icon: "\u27A1\uFE0F" } : m >= 40 ? { label: "Stalling", color: "#eab308", icon: "\u26A0\uFE0F" } : { label: "At Risk", color: "#ef4444", icon: "\u{1F53B}" }; }

function CircularScore({ score, size = 120, strokeWidth = 8, label }) {
  const r = (size - strokeWidth) / 2, c = 2 * Math.PI * r, o = c - (score / 100) * c, color = getScoreColor(score);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.3, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>{score}</span>
        {label && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>}
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
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "login") {
        const data = await supabase.auth("token?grant_type=password", { email, password });
        if (data.error || data.error_description) throw new Error(data.error_description || data.error?.message || "Login failed");
        onAuth(data);
      } else {
        const data = await supabase.auth("signup", { email, password, data: { full_name: fullName } });
        if (data.error) throw new Error(data.error?.message || "Signup failed");
        if (data.access_token) { onAuth(data); } 
        else { setMessage("Check your email for a confirmation link!"); }
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#012441", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ width: 400, padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40, justifyContent: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #31CE81, #28B870)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono', monospace" }}>C</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f5f3f0" }}>Cuota</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Call Review Engine</div>
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 4 }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); setMessage(""); }} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, background: mode === m ? "rgba(255,255,255,0.08)" : "transparent", color: mode === m ? "#f5f3f0" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>{m === "login" ? "Log In" : "Sign Up"}</button>
            ))}
          </div>
          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6 }}>Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Javier Ramirez" style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f3f0", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f3f0", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f3f0", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          {error && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#fca5a5" }}>{error}</div>}
          {message && <div style={{ padding: "10px 14px", marginBottom: 16, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, fontSize: 13, color: "#86EFAC" }}>{message}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px", border: "none", borderRadius: 10, cursor: "pointer", background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}>{loading ? "..." : mode === "login" ? "Log In" : "Create Account"}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== CATEGORY BAR ====================
function CategoryBar({ category, scores, aiKeyMoment, onScoreChange }) {
  const cs = scores[category.id] || {}, checked = Object.values(cs).filter(Boolean).length, total = category.criteria.length, pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f5f3f0" }}>{category.name}</span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: getScoreColor(pct) + "22", color: getScoreColor(pct), fontWeight: 600 }}>{pct}%</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>w: {category.weight}%</span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}><div style={{ height: "100%", width: pct + "%", background: getScoreColor(pct), borderRadius: 4, transition: "width 0.5s" }} /></div>
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>{"\u25BC"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "4px 18px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "8px 0 12px", lineHeight: 1.5 }}>{category.description}</p>
          {aiKeyMoment && <div style={{ padding: "10px 14px", marginBottom: 12, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}><span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#3b82f6", fontWeight: 600 }}>Key Moment</span><p style={{ fontSize: 12, color: "#93c5fd", margin: "4px 0 0", lineHeight: 1.5 }}>{aiKeyMoment}</p></div>}
          {category.criteria.map((cr, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer", borderBottom: i < category.criteria.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
              <input type="checkbox" checked={!!cs[i]} onChange={() => onScoreChange(category.id, i)} style={{ accentColor: "#31CE81", width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: cs[i] ? "#f5f3f0" : "rgba(255,255,255,0.5)" }}>{cr}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== SAVED CALLS ====================
function SavedCallsList({ calls, onSelect, onNewCall }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f5f3f0", margin: 0 }}>Saved Calls ({calls.length})</h2>
        <button onClick={onNewCall} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Review</button>
      </div>
      {calls.length === 0 && <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 40 }}>No calls reviewed yet. Click "+ New Review" to get started.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {calls.map(call => (
          <div key={call.id} onClick={() => onSelect(call)} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s" }}>
            <CircularScore score={call.overall_score || 0} size={50} strokeWidth={4} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f5f3f0" }}>{call.prospect_company || "Unknown Company"}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Rep: {call.rep_name || "Unknown"} | {call.call_type} | {call.call_date}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: getMomentumLabel(call.momentum_score || 0).color }}>{getMomentumLabel(call.momentum_score || 0).icon} {call.momentum_score || 0}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{call.deal_value ? "$" + Number(call.deal_value).toLocaleString() : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== PROGRESSION ====================
function ProgressionView({ calls }) {
  const repCalls = {};
  calls.forEach(c => { const name = c.rep_name || "Unknown"; if (!repCalls[name]) repCalls[name] = []; repCalls[name].push(c); });
  Object.values(repCalls).forEach(arr => arr.sort((a, b) => new Date(a.call_date) - new Date(b.call_date)));

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f5f3f0", margin: "0 0 20px" }}>Rep Progression</h2>
      {Object.keys(repCalls).length === 0 && <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 40 }}>Save some calls to see progression data.</p>}
      {Object.entries(repCalls).map(([name, rCalls]) => {
        const first = rCalls[0]?.overall_score || 0, last = rCalls[rCalls.length - 1]?.overall_score || 0, delta = last - first;
        const maxScore = Math.max(...rCalls.map(c => c.overall_score || 0), 1);
        return (
          <div key={name} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f3f0" }}>{name}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{rCalls.length} call{rCalls.length !== 1 ? "s" : ""} reviewed</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: getScoreColor(last), fontFamily: "'Space Mono', monospace" }}>{last}</div>
                <div style={{ fontSize: 12, color: delta >= 0 ? "#31CE81" : "#ef4444" }}>{delta >= 0 ? "+" : ""}{delta} pts</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "end", gap: 4, height: 60 }}>
              {rCalls.map((c, i) => {
                const h = Math.max(8, ((c.overall_score || 0) / 100) * 60);
                return <div key={i} title={`${c.call_date}: ${c.overall_score}`} style={{ flex: 1, height: h, background: getScoreColor(c.overall_score || 0), borderRadius: 4, transition: "height 0.3s", maxWidth: 40 }} />;
              })}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {rCalls.map((c, i) => <div key={i} style={{ flex: 1, fontSize: 9, color: "rgba(255,255,255,0.25)", textAlign: "center", maxWidth: 40 }}>{c.call_date?.slice(5)}</div>)}
            </div>
          </div>
        );
      })}
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
      <div style={{ background: "#012441", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: 440, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#f5f3f0", margin: 0 }}>Invite Team Members</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>\u2715</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" style={{ flex: 1, padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f5f3f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f3f0", fontSize: 13, outline: "none" }}>
            <option value="rep" style={{ background: "#012441" }}>Rep</option>
            <option value="manager" style={{ background: "#012441" }}>Manager</option>
          </select>
        </div>
        <button onClick={sendInvite} disabled={sending} style={{ width: "100%", padding: "10px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>{sending ? "Sending..." : "Send Invite"}</button>
        {error && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#fca5a5" }}>{error}</div>}
        {sent && <div style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(49,206,129,0.1)", border: "1px solid rgba(49,206,129,0.2)", borderRadius: 8, fontSize: 12, color: "#86efac" }}>Invite created! They can sign up and will be added to your org.</div>}
        {invites.length > 0 && (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Pending Invites</h4>
            {invites.map(inv => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 13, color: "#f5f3f0" }}>{inv.email}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: inv.accepted ? "rgba(49,206,129,0.15)" : "rgba(234,179,8,0.15)", color: inv.accepted ? "#31CE81" : "#eab308" }}>{inv.accepted ? "Joined" : "Pending"}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{inv.role}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ==================== ADMIN DASHBOARD ====================
function AdminDashboard({ allCalls }) {
  const repStats = {};
  allCalls.forEach(c => {
    const name = c.category_scores?.rep_name || "Unknown";
    if (!repStats[name]) repStats[name] = { calls: 0, totalScore: 0, totalMomentum: 0, risks: 0 };
    repStats[name].calls++;
    repStats[name].totalScore += c.overall_score || 0;
    repStats[name].totalMomentum += c.momentum_score || 0;
    const riskCount = c.risk_flags ? Object.values(c.risk_flags).filter(Boolean).length : 0;
    repStats[name].risks += riskCount;
  });

  const totalCalls = allCalls.length;
  const avgScore = totalCalls > 0 ? Math.round(allCalls.reduce((s, c) => s + (c.overall_score || 0), 0) / totalCalls) : 0;
  const avgMomentum = totalCalls > 0 ? Math.round(allCalls.reduce((s, c) => s + (c.momentum_score || 0), 0) / totalCalls) : 0;
  const avgClose = totalCalls > 0 ? Math.round(allCalls.reduce((s, c) => s + (c.close_probability || 0), 0) / totalCalls) : 0;

  const catAverages = {};
  CATEGORIES.forEach(cat => {
    let total = 0, count = 0;
    allCalls.forEach(c => {
      const cs = c.category_scores?.[cat.id];
      if (cs) {
        const checked = Object.values(cs).filter(v => v === true).length;
        total += (checked / cat.criteria.length) * 100;
        count++;
      }
    });
    catAverages[cat.id] = count > 0 ? Math.round(total / count) : 0;
  });

  const riskCounts = {};
  RISK_DEFINITIONS.forEach(r => { riskCounts[r.id] = 0; });
  allCalls.forEach(c => { if (c.risk_flags) RISK_DEFINITIONS.forEach(r => { if (c.risk_flags[r.id]) riskCounts[r.id]++; }); });
  const topRisks = RISK_DEFINITIONS.filter(r => riskCounts[r.id] > 0).sort((a, b) => riskCounts[b.id] - riskCounts[a.id]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f5f3f0", margin: "0 0 20px" }}>Admin Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Calls", value: totalCalls, color: "#f5f3f0" },
          { label: "Avg Score", value: avgScore, color: getScoreColor(avgScore) },
          { label: "Avg Momentum", value: avgMomentum, color: getMomentumLabel(avgMomentum).color },
          { label: "Avg Close %", value: avgClose + "%", color: getScoreColor(avgClose) },
        ].map((card, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, fontFamily: "'Space Mono', monospace" }}>{card.value}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f5f3f0", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Rep Leaderboard</h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, padding: "0 0 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span>Rep</span><span style={{ textAlign: "center" }}>Calls</span><span style={{ textAlign: "center" }}>Avg Score</span><span style={{ textAlign: "center" }}>Avg Momentum</span><span style={{ textAlign: "center" }}>Avg Risks</span>
        </div>
        {Object.entries(repStats).sort((a, b) => (b[1].totalScore / b[1].calls) - (a[1].totalScore / a[1].calls)).map(([name, stats]) => {
          const avg = Math.round(stats.totalScore / stats.calls);
          const avgM = Math.round(stats.totalMomentum / stats.calls);
          const avgR = (stats.risks / stats.calls).toFixed(1);
          return (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f3f0" }}>{name}</span>
              <span style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{stats.calls}</span>
              <span style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: getScoreColor(avg) }}>{avg}</span>
              <span style={{ textAlign: "center", fontSize: 13, color: getMomentumLabel(avgM).color }}>{avgM}</span>
              <span style={{ textAlign: "center", fontSize: 13, color: Number(avgR) > 3 ? "#ef4444" : Number(avgR) > 1.5 ? "#eab308" : "#31CE81" }}>{avgR}</span>
            </div>
          );
        })}
      </div>
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f5f3f0", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Category Averages (All Reps)</h3>
        {CATEGORIES.map(cat => {
          const avg = catAverages[cat.id];
          return (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", width: 180, flexShrink: 0 }}>{cat.name}</span>
              <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                <div style={{ height: "100%", width: avg + "%", background: getScoreColor(avg), borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: getScoreColor(avg), fontFamily: "'Space Mono', monospace", width: 40, textAlign: "right" }}>{avg}%</span>
            </div>
          );
        })}
      </div>
      {topRisks.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f5f3f0", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Most Common Risks</h3>
          {topRisks.slice(0, 5).map(risk => (
            <div key={risk.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 16 }}>{risk.icon}</span>
              <span style={{ fontSize: 13, color: "#f5f3f0", flex: 1 }}>{risk.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: risk.severity === "high" ? "#ef4444" : risk.severity === "medium" ? "#eab308" : "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>{riskCounts[risk.id]}x</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", width: 60 }}>({totalCalls > 0 ? Math.round(riskCounts[risk.id] / totalCalls * 100) : 0}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CuotaCallReview() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState("calls");
  const [savedCalls, setSavedCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Review state
  const [callInfo, setCallInfo] = useState({ repName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "" });
  const [scores, setScores] = useState({});
  const [risks, setRisks] = useState({});
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState("transcript");
  const [transcript, setTranscript] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiKeyMoments, setAiKeyMoments] = useState({});
  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const token = session?.access_token;

  // Load saved calls
  const loadCalls = useCallback(async () => {
    if (!token) return;
    try {
      const table = await supabase.from("call_reviews", token);
      const data = await table.select("*");
      if (Array.isArray(data)) {
        const sorted = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        // Enrich with rep_name from the stored data
        const enriched = sorted.map(c => ({ ...c, rep_name: c.category_scores?.rep_name || c.prospect_company }));
        setSavedCalls(enriched);
      }
    } catch (e) { console.error("Load calls error:", e); }
  }, [token]);

  useEffect(() => { 
    if (token) { loadCalls().finally(() => setLoading(false)); } 
    else { setLoading(false); }
  }, [token, loadCalls]);

  const handleAuth = async (data) => {
    setSession(data);
    // Get or create profile
    try {
      const table = await supabase.from("profiles", data.access_token);
      const profiles = await table.selectWhere("*", "id=eq." + data.user.id);
      if (Array.isArray(profiles) && profiles.length > 0) {
        setProfile(profiles[0]);
      }
    } catch (e) { console.error("Profile error:", e); setProfile({ id: data.user.id, role: "admin", org_id: "00000000-0000-0000-0000-000000000001" }); }
  };

  const handleLogout = () => { setSession(null); setProfile(null); setSavedCalls([]); setPage("calls"); };

  // Review functions
  const handleScoreChange = (catId, idx) => { setScores(p => ({ ...p, [catId]: { ...p[catId], [idx]: !p[catId]?.[idx] } })); };
  const handleRiskToggle = (id) => { setRisks(p => ({ ...p, [id]: !p[id] })); };

  const calcFactor = (id) => { const s = scores[id] || {}, cat = CATEGORIES.find(c => c.id === id); return cat ? Object.values(s).filter(Boolean).length / cat.criteria.length || 0 : 0; };
  const overallScore = Math.round(CATEGORIES.reduce((t, cat) => { const cs = scores[cat.id] || {}; return t + (cat.criteria.length > 0 ? Object.values(cs).filter(Boolean).length / cat.criteria.length : 0) * cat.weight; }, 0));
  const momentum = Math.round(calcFactor("nextsteps") * 30 + calcFactor("discovery") * 25 + calcFactor("qualification") * 25 + calcFactor("multithreading") * 20);
  const hrc = RISK_DEFINITIONS.filter(r => risks[r.id] && r.severity === "high").length;
  const mrc = RISK_DEFINITIONS.filter(r => risks[r.id] && r.severity === "medium").length;
  const closeProbability = Math.max(5, Math.min(95, Math.round(overallScore * 0.5 + momentum * 0.5 - hrc * 12 - mrc * 5)));
  const mi = getMomentumLabel(momentum);

  const analyzeTranscript = async () => {
    if (!transcript.trim()) { setError("Paste a transcript first."); return; }
    setAnalyzing(true); setError("");
    try {
      const apiKey = localStorage.getItem("cuota_api_key");
      if (!apiKey) throw new Error("Enter your API key in Settings (top right) first.");
      const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}, body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4096,messages:[{role:"user",content:ANALYSIS_PROMPT+"\n\n---\n\nTRANSCRIPT:\n"+transcript}]}) });
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||"API error");}
      const data=await res.json();
      const text = data.content.map(c => c.text || "").join("");
      const result = JSON.parse(text.replace(/```json|```/g, "").trim());
      const newScores = {}, newKM = {};
      CATEGORIES.forEach(cat => { const ai = result.scores[cat.id]; if (ai) { newScores[cat.id] = {}; ai.criteria_met.forEach((met, i) => { newScores[cat.id][i] = met; }); newKM[cat.id] = ai.key_moment; } });
      setScores(newScores); setAiKeyMoments(newKM);
      const newRisks = {}; RISK_DEFINITIONS.forEach(r => { newRisks[r.id] = !!result.risks[r.id]; }); setRisks(newRisks);
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
      setAiAnalysis(result); setNotes(result.coaching_notes || ""); setActiveTab("insights");
    } catch (err) { setError("Analysis failed: " + err.message); } finally { setAnalyzing(false); }
  };

  const saveCall = async () => {
    if (!token) { setError("Please log in to save calls."); return; }
    setSaving(true); setError(""); setSaveSuccess(false);
    try {
      const orgId = profile?.org_id || "00000000-0000-0000-0000-000000000001";
      // Find or create rep
      const repsTable = await supabase.from("reps", token);
      let reps = await repsTable.selectWhere("*", `org_id=eq.${orgId}&full_name=eq.${encodeURIComponent(callInfo.repName)}`);
      let repId;
      if (Array.isArray(reps) && reps.length > 0) { repId = reps[0].id; }
      else {
        const newRep = await repsTable.insert({ org_id: orgId, full_name: callInfo.repName || "Unknown Rep" });
        repId = Array.isArray(newRep) && newRep[0] ? newRep[0].id : null;
      }
      if (!repId) throw new Error("Could not create rep record");

      const callData = {
        org_id: orgId,
        rep_id: repId,
        reviewed_by: session.user.id,
        prospect_company: callInfo.prospectCompany,
        call_date: callInfo.callDate,
        call_type: callInfo.callType,
        deal_stage: callInfo.dealStage,
        deal_value: callInfo.dealValue ? Number(callInfo.dealValue) : null,
        category_scores: { ...scores, rep_name: callInfo.repName, prospect_name: aiAnalysis?.metadata?.prospect_name || "" },
        overall_score: overallScore,
        momentum_score: momentum,
        close_probability: closeProbability,
        risk_flags: risks,
        transcript: transcript,
        ai_analysis: aiAnalysis,
        coaching_notes: notes,
      };

      const table = await supabase.from("call_reviews", token);
      if (selectedCall?.id) {
        await table.update(callData, `id=eq.${selectedCall.id}`);
      } else {
        await table.insert(callData);
      }
      setSaveSuccess(true);
      await loadCalls();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) { setError("Save failed: " + err.message); } finally { setSaving(false); }
  };

  const loadCallIntoReview = (call) => {
    setSelectedCall(call);
    setCallInfo({ repName: call.category_scores?.rep_name || "", prospectCompany: call.prospect_company || "", callDate: call.call_date || "", callType: call.call_type || "Discovery", dealStage: call.deal_stage || "Early", dealValue: call.deal_value || "" });
    setScores(call.category_scores || {});
    setRisks(call.risk_flags || {});
    setNotes(call.coaching_notes || "");
    setTranscript(call.transcript || "");
    setAiAnalysis(call.ai_analysis || null);
    setAiKeyMoments({});
    if (call.ai_analysis?.scores) {
      const km = {};
      CATEGORIES.forEach(cat => { if (call.ai_analysis.scores[cat.id]?.key_moment) km[cat.id] = call.ai_analysis.scores[cat.id].key_moment; });
      setAiKeyMoments(km);
    }
    setPage("review");
    setActiveTab("scorecard");
  };

  const startNewReview = () => {
    setSelectedCall(null);
    setCallInfo({ repName: "", prospectCompany: "", callDate: new Date().toISOString().split("T")[0], callType: "Discovery", dealStage: "Early", dealValue: "" });
    setScores({}); setRisks({}); setNotes(""); setTranscript(""); setAiAnalysis(null); setAiKeyMoments({}); setError("");
    setPage("review"); setActiveTab("transcript");
  };

  if (!session) return <AuthScreen onAuth={handleAuth} />;

  const tabs = [
    { id: "transcript", label: "Transcript" },
    { id: "scorecard", label: "Scorecard" },
    { id: "risks", label: "Risks" + (Object.values(risks).filter(Boolean).length > 0 ? " (" + Object.values(risks).filter(Boolean).length + ")" : "") },
    { id: "insights", label: aiAnalysis ? "AI Insights \u2726" : "AI Insights" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#012441", color: "#f5f3f0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      {showInvite && <InviteModal token={token} profile={profile} onClose={() => setShowInvite(false)} />}
      
      {/* NAV */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", display: "flex", alignItems: "center", gap: 8, height: 56, overflowX: "auto" }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #31CE81, #28B870)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>C</div>
        <span style={{ fontSize: 16, fontWeight: 700, marginRight: 16, flexShrink: 0 }}>Cuota</span>
        {[
          { id: "review", label: "Call Review", icon: "\u{1F4DE}" },
          { id: "calls", label: "Saved Calls", icon: "\u{1F4C1}", badge: savedCalls.length },
          { id: "progression", label: "Progression", icon: "\u{1F4C8}" },
          ...(profile?.role === "admin" ? [{ id: "admin", label: "Admin", icon: "\u{1F451}" }] : []),
        ].map(nav => (
          <button key={nav.id} onClick={() => setPage(nav.id)} style={{ padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: page === nav.id ? "rgba(255,255,255,0.08)" : "transparent", color: page === nav.id ? "#f5f3f0" : "rgba(255,255,255,0.35)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
            <span>{nav.icon}</span> {nav.label}
            {nav.badge > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "rgba(74,222,128,0.15)", color: "#31CE81" }}>{nav.badge}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(profile?.role === "manager" || profile?.role === "admin") && <button onClick={() => setShowInvite(true)} style={{ padding: "6px 12px", border: "1px solid rgba(49,206,129,0.3)", borderRadius: 8, background: "rgba(49,206,129,0.08)", color: "#31CE81", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>+ Invite</button>}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{session.user?.email}</span>
        <button onClick={() => { const k = window.prompt("Enter your Anthropic API key (sk-ant-...):",localStorage.getItem("cuota_api_key")||""); if(k&&k.startsWith("sk-ant-")){localStorage.setItem("cuota_api_key",k);alert("API key saved!");} }} style={{ padding: "6px 12px", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, background: "rgba(59,130,246,0.08)", color: "#3b82f6", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>API Key</button>
        <button onClick={handleLogout} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Logout</button>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
        {/* SAVED CALLS PAGE */}
        {page === "calls" && <SavedCallsList calls={savedCalls} onSelect={loadCallIntoReview} onNewCall={startNewReview} />}

        {/* PROGRESSION PAGE */}
        {page === "progression" && <ProgressionView calls={savedCalls} />}
        {page === "admin" && profile?.role === "admin" && <AdminDashboard allCalls={savedCalls} />}

        {/* REVIEW PAGE */}
        {page === "review" && (
          <>
            {/* API Key */}

            {/* Call Info */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { key: "repName", label: "Rep Name", placeholder: "e.g. Sarah Chen" },
                  { key: "prospectCompany", label: "Company", placeholder: "e.g. Acme Corp" },
                  { key: "callDate", label: "Call Date", type: "date" },
                  { key: "callType", label: "Call Type", options: ["Discovery", "Demo", "Follow-up", "Negotiation", "Closing"] },
                  { key: "dealStage", label: "Deal Stage", options: ["Early", "Mid-Pipe", "Late Stage", "Negotiation"] },
                  { key: "dealValue", label: "Deal Value ($)", placeholder: "e.g. 50000", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6 }}>{f.label}</label>
                    {f.options ? (
                      <select value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f3f0", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                        {f.options.map(o => <option key={o} value={o} style={{ background: "#012441" }}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || "text"} value={callInfo[f.key]} onChange={e => setCallInfo(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f3f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Score Dashboard */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <CircularScore score={overallScore} size={100} label="overall" />
                <span style={{ fontSize: 11, fontWeight: 600, color: getScoreColor(overallScore), textTransform: "uppercase", letterSpacing: 1 }}>{getScoreLabel(overallScore)}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 28 }}>{mi.icon}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: mi.color }}>{momentum}</span>
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.4)" }}>Momentum</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <CircularScore score={closeProbability} size={100} label="close %" />
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: 4, overflowX: "auto" }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "10px 12px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: activeTab === tab.id ? "rgba(255,255,255,0.08)" : "transparent", color: activeTab === tab.id ? "#f5f3f0" : "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>{tab.label}</button>
              ))}
            </div>

            {/* Transcript */}
            {activeTab === "transcript" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f5f3f0", margin: 0 }}>Call Transcript</h3>
                  <button onClick={analyzeTranscript} disabled={analyzing || !transcript.trim()} style={{ padding: "10px 24px", border: "none", borderRadius: 10, cursor: analyzing ? "wait" : "pointer", background: analyzing ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #31CE81, #28B870)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: !transcript.trim() ? 0.4 : 1 }}>
                    {analyzing ? "Analyzing..." : "Analyze with AI \u2726"}
                  </button>
                </div>
                {error && <div style={{ padding: "10px 14px", marginBottom: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#fca5a5" }}>{error}</div>}
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste your call transcript here..." style={{ width: "100%", minHeight: 350, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, fontSize: 13, color: "#f5f3f0", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                {analyzing && <div style={{ marginTop: 16, padding: 20, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 12 }}><p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Analyzing transcript... (15-30s)</p></div>}
              </div>
            )}

            {/* Scorecard */}
            {activeTab === "scorecard" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {CATEGORIES.map(cat => <CategoryBar key={cat.id} category={cat} scores={scores} aiKeyMoment={aiKeyMoments[cat.id]} onScoreChange={handleScoreChange} />)}
              </div>
            )}

            {/* Risks */}
            {activeTab === "risks" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f5f3f0", margin: 0 }}>Risk Flags</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {RISK_DEFINITIONS.map(risk => (
                    <div key={risk.id} onClick={() => handleRiskToggle(risk.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", background: risks[risk.id] ? risk.severity === "high" ? "rgba(239,68,68,0.08)" : risk.severity === "medium" ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.02)", border: risks[risk.id] ? "1px solid " + (risk.severity === "high" ? "rgba(239,68,68,0.25)" : risk.severity === "medium" ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.08)") : "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 16 }}>{risk.icon}</span>
                      <span style={{ fontSize: 13, color: risks[risk.id] ? "#f5f3f0" : "rgba(255,255,255,0.35)", flex: 1, fontWeight: risks[risk.id] ? 500 : 400 }}>{risk.label}</span>
                      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: risk.severity === "high" ? "rgba(239,68,68,0.6)" : risk.severity === "medium" ? "rgba(234,179,8,0.5)" : "rgba(255,255,255,0.25)", fontWeight: 600 }}>{risk.severity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights */}
            {activeTab === "insights" && (aiAnalysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Executive Summary</h4>
                  <p style={{ fontSize: 14, color: "#f5f3f0", lineHeight: 1.7, margin: 0 }}>{aiAnalysis.executive_summary}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: 16 }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#31CE81", fontWeight: 700 }}>Strongest Moment</span>
                    <p style={{ fontSize: 13, color: "#BBF7D0", margin: "8px 0 0", lineHeight: 1.6 }}>{aiAnalysis.strongest_moment}</p>
                  </div>
                  <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 16 }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#ef4444", fontWeight: 700 }}>Biggest Miss</span>
                    <p style={{ fontSize: 13, color: "#fecaca", margin: "8px 0 0", lineHeight: 1.6 }}>{aiAnalysis.biggest_miss}</p>
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#eab308", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Top 3 Improvements</h4>
                  {(aiAnalysis.top_3_improvements || []).map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#eab308", fontFamily: "'Space Mono', monospace", minWidth: 24 }}>{i + 1}.</span>
                      <span style={{ fontSize: 13, color: "#f5f3f0", lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Coaching Notes</h4>
                  <p style={{ fontSize: 14, color: "#f5f3f0", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{aiAnalysis.coaching_notes}</p>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>{"\u2726"}</p>
                <p style={{ fontSize: 14 }}>Paste a transcript and click Analyze with AI</p>
              </div>
            ))}

            {/* Notes */}
            {activeTab === "notes" && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f5f3f0", margin: "0 0 12px" }}>Coaching Notes</h3>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key observations, coaching points..." style={{ width: "100%", minHeight: 200, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, fontSize: 13, color: "#f5f3f0", lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
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

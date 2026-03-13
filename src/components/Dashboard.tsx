import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────
const GREEN  = "#31CE81";
const AMBER  = "#F5A623";
const RED    = "#FF4D4D";
const BG     = "var(--bg-app)";
const SURFACE = "var(--bg-primary)";
const BORDER = "var(--border)";
const TEXT   = "#f0f0f0";
const TEXT2  = "#9ca3af";
const TEXT3  = "#7a8ba0";
const FAINT  = "#7a8ba0";
const FONT   = "'DM Sans', system-ui, sans-serif";

// ─── Sidebar widths ───────────────────────────────────────────────
const FULL = 220;
const MINI = 64;

function getSavedCollapsed() {
  try { return localStorage.getItem("sidebar_collapsed") === "1"; } catch { return false; }
}
function saveCollapsed(v: boolean) {
  try { localStorage.setItem("sidebar_collapsed", v ? "1" : "0"); } catch {}
}

const scoreColor = (s: number) => s >= 70 ? GREEN : s >= 55 ? AMBER : RED;

const statusStyle = (s: string) => ({
  "At Risk":  { color: AMBER, bg: "rgba(245,166,35,0.10)"  },
  "On Track": { color: GREEN, bg: "rgba(49,206,129,0.10)"  },
  "Critical": { color: RED,   bg: "rgba(255,77,77,0.10)"   },
  "Healthy":  { color: GREEN, bg: "rgba(49,206,129,0.10)"  },
} as Record<string, { color: string; bg: string }>)[s] ?? { color: TEXT2, bg: "transparent" };

const CATEGORY_NAMES: Record<string, string> = {
  pre_call_research: "Research",
  intro_opening:     "Opening",
  agenda:            "Agenda",
  discovery:         "Discovery",
  pitch:             "Pitch",
  services_product:  "Product",
  pricing:           "Pricing",
  next_steps:        "Next Steps",
  objection_handling:"Objections",
  call_opener:       "Opener",
  product_pitch:     "Pitch",
  qualification:     "Qualification",
  call_to_action:    "CTA",
};

interface Props {
  onNavigate?: (page: string) => void;
  onNewReview?: () => void;
  onClientClick?: (client: string) => void;
  userEmail?: string;
  profile?: { full_name?: string; role?: string } | null;
  clients?: string[];
  savedCalls?: any[];
  isLoading?: boolean;
  callsError?: string;
  onRetryLoad?: () => void;
}

function callMatchesClient(call: any, client: string): boolean {
  return (
    call.category_scores?.client === client ||
    (call.prospect_company || "").toLowerCase().includes(client.toLowerCase())
  );
}

function computeClientRow(client: string, calls: any[]) {
  const clientCalls = calls.filter(c => callMatchesClient(c, client));
  if (clientCalls.length === 0) return { client, calls: 0, score: null, delta: null, gap: "—", status: null };

  const allScores = clientCalls.map(c => c.overall_score || 0).filter(Boolean);
  const score = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;

  // Trend: recent 30 days vs prior 30 days
  const now = Date.now();
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const recent = clientCalls.filter(c => now - new Date(c.call_date || c.created_at).getTime() < d30);
  const older  = clientCalls.filter(c => {
    const age = now - new Date(c.call_date || c.created_at).getTime();
    return age >= d30 && age < 2 * d30;
  });
  const recentAvg = recent.length ? Math.round(recent.map(c => c.overall_score || 0).reduce((a, b) => a + b, 0) / recent.length) : null;
  const olderAvg  = older.length  ? Math.round(older.map(c => c.overall_score || 0).reduce((a, b) => a + b, 0) / older.length)  : null;
  const delta = (recentAvg !== null && olderAvg !== null) ? recentAvg - olderAvg : null;

  // Biggest gap: weakest category across all calls
  const catTotals: Record<string, number[]> = {};
  clientCalls.forEach(call => {
    const cs = call.category_scores;
    if (!cs) return;
    Object.entries(cs).forEach(([k, v]: [string, any]) => {
      if (v && typeof v === "object" && typeof v.score === "number") {
        if (!catTotals[k]) catTotals[k] = [];
        catTotals[k].push(v.score);
      }
    });
  });
  let gap = "—";
  let weakest = Infinity;
  Object.entries(catTotals).forEach(([k, scores]) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < weakest) { weakest = avg; gap = CATEGORY_NAMES[k] ?? k; }
  });

  const status =
    score === null ? null :
    score >= 70 ? "Healthy" :
    score >= 55 ? "On Track" :
    score >= 40 ? "At Risk" : "Critical";

  return { client, calls: clientCalls.length, score, delta, gap, status };
}

export default function Dashboard({ onNavigate, onNewReview, onClientClick, userEmail = "", profile, clients = [], savedCalls = [], isLoading = false, callsError, onRetryLoad }: Props) {
  const hour = new Date().getHours();
  const tod  = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const [collapsed, setCollapsed] = useState(getSavedCollapsed);

  function toggle() {
    setCollapsed(prev => { saveCollapsed(!prev); return !prev; });
  }

  const W = collapsed ? MINI : FULL;

  // Derived stats
  const now = Date.now();
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const reviewsThisMonth = savedCalls.filter(c => now - new Date(c.call_date || c.created_at).getTime() < d30).length;
  const allScores = savedCalls.map(c => c.overall_score || 0).filter(Boolean);
  const avgScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;

  // Critical AEs: reps with avg score < 50
  const repScores: Record<string, number[]> = {};
  savedCalls.forEach(c => {
    const rep = c.category_scores?.rep_name || c.rep_name;
    if (!rep) return;
    if (!repScores[rep]) repScores[rep] = [];
    repScores[rep].push(c.overall_score || 0);
  });
  const criticalAEs = Object.values(repScores).filter(scores => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return avg < 50;
  }).length;

  // Client table rows — all clients always shown; empty ones show "—"
  const clientRows = clients.map(c => computeClientRow(c, savedCalls));

  // Display name from profile or email — always capitalize first letter
  const _rawDisplayName = profile?.full_name
    ? profile.full_name.split(" ")[0]
    : userEmail ? userEmail.split("@")[0].split(".")[0] : "";
  const displayName = _rawDisplayName ? _rawDisplayName.charAt(0).toUpperCase() + _rawDisplayName.slice(1) : "";
  const initials = (profile?.full_name || userEmail || "?")
    .split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, color: TEXT, fontFamily: FONT }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: W, flexShrink: 0, position: "fixed", top: 0, left: 0, bottom: 0,
        background: SURFACE, borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column", zIndex: 100,
        transition: "width 0.2s ease", overflow: "hidden",
      }}>

        {/* Logo */}
        <div style={{ padding: collapsed ? "20px 0" : "24px 20px 20px", display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
          {collapsed ? (
            <img src="/favicon.png" alt="Cuota" onClick={() => onNavigate?.("home")} style={{ width: 34, height: 34, cursor: "pointer", display: "block" }} />
          ) : (
            <img
              src="/cuota_logo_official_White.png" alt="Cuota"
              onClick={() => onNavigate?.("home")}
              style={{ height: 48, display: "block", maxWidth: "100%", cursor: "pointer" }}
            />
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: collapsed ? "4px 8px" : "4px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {collapsed ? (
            <>
              <button
                onClick={() => onNavigate?.("clients")}
                title="Clients"
                style={{
                  width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
                  background: "transparent", cursor: "pointer", display: "flex", justifyContent: "center",
                  fontFamily: FONT,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={TEXT2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </button>
              <button
                onClick={onNewReview}
                title="New Call Review"
                style={{
                  width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
                  background: "rgba(49,206,129,0.12)", cursor: "pointer", display: "flex", justifyContent: "center",
                  fontFamily: FONT,
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, color: GREEN, lineHeight: 1 }}>+</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onNavigate?.("clients")}
                style={{
                  display: "flex", alignItems: "center", width: "100%",
                  padding: "9px 12px", border: "none", borderRadius: 8,
                  background: "transparent", cursor: "pointer",
                  fontFamily: FONT, textAlign: "left", boxSizing: "border-box",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: TEXT2 }}>Clients</span>
              </button>
              <button
                onClick={onNewReview}
                style={{
                  display: "flex", alignItems: "center", width: "100%",
                  padding: "9px 12px", border: "none", borderRadius: 8,
                  background: "rgba(49,206,129,0.12)", cursor: "pointer",
                  fontFamily: FONT, textAlign: "left", boxSizing: "border-box",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>+ New Call Review</span>
              </button>
            </>
          )}

          {/* Toggle button */}
          <button
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              marginTop: "auto", width: "100%",
              padding: collapsed ? "10px 0" : "8px 12px",
              border: "none", borderRadius: 8,
              background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              fontFamily: FONT, gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 14, color: FAINT, lineHeight: 1 }}>{collapsed ? "›" : "‹"}</span>
            {!collapsed && <span style={{ fontSize: 11, color: FAINT }}>Collapse</span>}
          </button>
        </nav>

        {/* User footer */}
        <div style={{
          padding: collapsed ? "16px 0" : "16px 20px",
          borderTop: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "rgba(49,206,129,0.15)",
            border: "1px solid rgba(49,206,129,0.3)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: GREEN, fontFamily: FONT,
          }}>{initials}</div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayName || userEmail}
              </div>
              <div style={{ fontSize: 10, color: TEXT3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userEmail}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: W, flex: 1, padding: "40px 44px", minWidth: 0, transition: "margin-left 0.2s ease" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: TEXT, lineHeight: 1.2, fontFamily: FONT }}>
            Good {tod},{" "}
            <em style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontWeight: 400, color: GREEN }}>
              {displayName || "there"}
            </em>
          </h1>
          <button
            onClick={onNewReview}
            style={{
              padding: "10px 20px", border: "none", borderRadius: 10,
              background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT, flexShrink: 0,
            }}
          >
            + New Review
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 32 }}>
          {([
            { label: "Active Clients",     value: String(clients.length),                              color: TEXT  },
            { label: "Avg Score",          value: isLoading ? "…" : avgScore !== null ? `${avgScore}%` : "—",  color: avgScore !== null ? scoreColor(avgScore) : TEXT3 },
            { label: "Reviews This Month", value: isLoading ? "…" : String(reviewsThisMonth),           color: GREEN },
            { label: "Critical AEs",       value: isLoading ? "…" : String(criticalAEs),                color: criticalAEs > 0 ? RED : GREEN },
          ] as { label: string; value: string; color: string }[]).map(k => (
            <div key={k.label} style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)",
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any,
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)",
              borderRadius: 14, padding: "22px 22px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase", marginBottom: 12, fontFamily: FONT }}>
                {k.label}
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color: k.color, lineHeight: 1, fontFamily: "'IBM Plex Mono', monospace" }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Client Health Table */}
        <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any, border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 180px 70px 130px 100px",
            padding: "10px 24px", gap: 16,
            borderBottom: `1px solid ${BORDER}`,
            fontSize: 10, fontWeight: 700, color: TEXT3, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: FONT,
          }}>
            <span>Client</span>
            <span>Score</span>
            <span style={{ textAlign: "center" }}>Trend</span>
            <span>Biggest Gap</span>
            <span>Status</span>
          </div>

          {callsError ? (
            <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: RED }}>{callsError}</span>
              {onRetryLoad && <button onClick={onRetryLoad} style={{ padding: "6px 14px", border: `1px solid ${RED}`, borderRadius: 8, background: "rgba(255,77,77,0.1)", color: RED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Retry</button>}
            </div>
          ) : isLoading ? (
            <div style={{ padding: "32px 24px" }}>
              {[...Array(clients.length || 5)].map((_, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 180px 70px 130px 100px", padding: "14px 0", gap: 16, borderBottom: i < (clients.length || 5) - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.06)", width: `${60 + (i % 3) * 15}%` }} />
                  <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "80%" }} />
                  <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "50%" }} />
                  <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "60%" }} />
                  <div style={{ height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: "70%" }} />
                </div>
              ))}
            </div>
          ) : clientRows.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: TEXT3, fontSize: 13 }}>
              No clients yet. <button onClick={() => onNavigate?.("clients")} style={{ color: GREEN, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>Manage clients →</button>
            </div>
          ) : clientRows.map((c, i) => {
            const col = c.score !== null ? scoreColor(c.score) : TEXT3;
            const st  = c.status ? statusStyle(c.status) : { color: TEXT3, bg: "transparent" };
            const hasData = c.calls > 0;
            return (
              <div
                key={c.client}
                onClick={() => onClientClick?.(c.client)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 180px 70px 130px 100px",
                  padding: "15px 24px", gap: 16, alignItems: "center",
                  borderBottom: i < clientRows.length - 1 ? `1px solid ${BORDER}` : "none",
                  cursor: "pointer", transition: "background 0.1s",
                  opacity: hasData ? 1 : 0.45,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{c.client}</div>
                  <div style={{ fontSize: 11, color: TEXT3, marginTop: 2, fontFamily: FONT }}>
                    {hasData ? `${c.calls} review${c.calls !== 1 ? "s" : ""}` : "No reviews yet"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${c.score ?? 0}%`, height: "100%", background: col, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: col, width: 34, textAlign: "right", flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {c.score !== null ? `${c.score}%` : "—"}
                  </span>
                </div>
                <div style={{ textAlign: "center" }}>
                  {c.delta !== null
                    ? <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: c.delta > 0 ? GREEN : c.delta < 0 ? RED : TEXT3 }}>
                        {c.delta > 0 ? `↑ +${c.delta}` : c.delta < 0 ? `↓ ${c.delta}` : "— 0"}
                      </span>
                    : <span style={{ fontSize: 12, color: TEXT3 }}>—</span>
                  }
                </div>
                <div>
                  {c.gap !== "—"
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: AMBER, background: "rgba(245,166,35,0.10)", borderRadius: 6, padding: "3px 10px", fontFamily: FONT }}>{c.gap}</span>
                    : <span style={{ fontSize: 12, color: TEXT3, fontFamily: FONT }}>—</span>
                  }
                </div>
                <div>
                  {c.status
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 6, padding: "4px 10px", fontFamily: FONT }}>{c.status}</span>
                    : <span style={{ fontSize: 11, color: TEXT3 }}>—</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

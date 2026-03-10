import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────
const GREEN  = "#31CE81";
const AMBER  = "#F5A623";
const RED    = "#FF4D4D";
const BG     = "var(--bg-app)";
const SURFACE = "var(--bg-primary)";
const CARD   = "var(--bg-card)";
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

const scoreColor = (s: number) => s >= 70 ? GREEN : s >= 40 ? AMBER : RED;

const CLIENTS = [
  { name: "11x",     stage: "Series B", score: 48, delta: -6,  gap: "Discovery", status: "At Risk"  },
  { name: "Arc",     stage: "Series A", score: 61, delta: +4,  gap: "Objections",status: "On Track" },
  { name: "Diio",    stage: "Seed",     score: 44, delta: -11, gap: "Closing",   status: "Critical" },
  { name: "Factor",  stage: "Series A", score: 59, delta: 0,   gap: "Pitch",     status: "On Track" },
  { name: "Xepelin", stage: "Series B", score: 72, delta: +9,  gap: "—",         status: "Healthy"  },
];

const statusStyle = (s: string) => ({
  "At Risk":  { color: AMBER, bg: "rgba(245,166,35,0.10)"  },
  "On Track": { color: GREEN, bg: "rgba(49,206,129,0.10)"  },
  "Critical": { color: RED,   bg: "rgba(255,77,77,0.10)"   },
  "Healthy":  { color: GREEN, bg: "rgba(49,206,129,0.10)"  },
} as Record<string, { color: string; bg: string }>)[s] ?? { color: TEXT2, bg: "transparent" };

interface Props {
  onNavigate?: (page: string) => void;
  onNewReview?: () => void;
  onClientClick?: (client: string) => void;
  userEmail?: string;
}

export default function Dashboard({ onNavigate, onNewReview, onClientClick, userEmail = "" }: Props) {
  const hour = new Date().getHours();
  const tod  = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const [collapsed, setCollapsed] = useState(getSavedCollapsed);

  function toggle() {
    setCollapsed(prev => { saveCollapsed(!prev); return !prev; });
  }

  const W = collapsed ? MINI : FULL;

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
            <div
              onClick={() => onNavigate?.("home")}
              style={{
                width: 34, height: 34, borderRadius: 8, cursor: "pointer",
                background: "rgba(49,206,129,0.15)", border: "1px solid rgba(49,206,129,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: GREEN,
              }}
            >C</div>
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
          }}>JV</div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Javier V.</div>
              <div style={{ fontSize: 10, color: TEXT3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>javier@cuota.io</div>
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
              Javier
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
            { label: "Active Clients",      value: "5",    color: TEXT  },
            { label: "Avg Score",           value: "48%",  color: AMBER },
            { label: "Reviews This Month",  value: "269",  color: GREEN },
            { label: "Critical AEs",        value: "3",    color: RED   },
          ] as { label: string; value: string; color: string }[]).map(k => (
            <div key={k.label} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
              padding: "22px 22px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase", marginBottom: 12, fontFamily: FONT }}>
                {k.label}
              </div>
              <div style={{
                fontSize: 34, fontWeight: 800, color: k.color, lineHeight: 1,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Client Health Table */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
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

          {CLIENTS.map((c, i) => {
            const col = scoreColor(c.score);
            const st  = statusStyle(c.status);
            return (
              <div
                key={c.name}
                onClick={() => onClientClick?.(c.name)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 180px 70px 130px 100px",
                  padding: "15px 24px", gap: 16, alignItems: "center",
                  borderBottom: i < CLIENTS.length - 1 ? `1px solid ${BORDER}` : "none",
                  cursor: "pointer", transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: TEXT3, marginTop: 2, fontFamily: FONT }}>{c.stage}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${c.score}%`, height: "100%", background: col, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: col, width: 34, textAlign: "right", flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {c.score}%
                  </span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: c.delta > 0 ? GREEN : c.delta < 0 ? RED : TEXT3 }}>
                    {c.delta > 0 ? `↑ +${c.delta}` : c.delta < 0 ? `↓ ${c.delta}` : "— 0"}
                  </span>
                </div>
                <div>
                  {c.gap !== "—"
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: AMBER, background: "rgba(245,166,35,0.10)", borderRadius: 6, padding: "3px 10px", fontFamily: FONT }}>{c.gap}</span>
                    : <span style={{ fontSize: 12, color: TEXT3, fontFamily: FONT }}>—</span>
                  }
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 6, padding: "4px 10px", fontFamily: FONT }}>
                    {c.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

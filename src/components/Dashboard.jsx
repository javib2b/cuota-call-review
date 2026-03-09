import { useState } from "react";

const BG = "#07090f", SURFACE = "#0d1117", SURFACE2 = "#131920";
const BORDER = "rgba(255,255,255,0.06)", BORDER2 = "rgba(255,255,255,0.10)";
const GREEN = "#31CE81", AMBER = "#F5A623", RED = "#FF4D4D", BLUE = "#4D9EFF";
const TEXT = "#F5F3F0", TEXT2 = "rgba(245,243,240,0.55)", TEXT3 = "rgba(245,243,240,0.3)";

const scoreColor = s => s >= 70 ? GREEN : s >= 40 ? AMBER : RED;

const CLIENTS = [
  { name: "11x",     score: 48, delta: -6,  gap: "Discovery", stage: "Mid-Funnel",   status: "at-risk"  },
  { name: "Arc",     score: 61, delta: +4,  gap: "Objections",stage: "Late-Stage",   status: "watching" },
  { name: "Diio",    score: 44, delta: -11, gap: "Closing",   stage: "Mid-Funnel",   status: "at-risk"  },
  { name: "Factor",  score: 59, delta: 0,   gap: "Pitch",     stage: "Early-Stage",  status: "watching" },
  { name: "Xepelin", score: 72, delta: +9,  gap: null,        stage: "Late-Stage",   status: "healthy"  },
];

const REVIEWS = [
  { rep: "Côme T.",   score: 14, label: "Critical",   client: "11x",     type: "Discovery"    },
  { rep: "Alex Fung", score: 56, label: "Needs Work", client: "Arc",     type: "Qualification"},
  { rep: "Côme T.",   score: 57, label: "Needs Work", client: "Diio",    type: "Demo"         },
  { rep: "Nick Yung", score: 18, label: "Critical",   client: "11x",     type: "Objection"    },
  { rep: "JM Bello",  score: 36, label: "Critical",   client: "Factor",  type: "Discovery"    },
  { rep: "Marco R.",  score: 75, label: "Good",       client: "Xepelin", type: "Closing"      },
];

const CATEGORIES = [
  { name: "Pre-Call",   score: 51 }, { name: "Opening",    score: 68 }, { name: "Agenda",     score: 72 },
  { name: "Discovery",  score: 31 }, { name: "Pitch",      score: 55 }, { name: "Product",    score: 49 },
  { name: "Pricing",    score: 38 }, { name: "Next Steps", score: 44 }, { name: "Objections", score: 29 },
];

const ALERTS = [
  { sev: "critical", text: "Côme T. · Score 14 — no next step set on last call" },
  { sev: "warning",  text: "Diio dropped 11 pts — Discovery + Closing both under 30" },
  { sev: "warning",  text: "11x objection avg 22 — jumping to price before value" },
  { sev: "info",     text: "Portfolio Discovery avg 31 — lowest category across all clients" },
  { sev: "positive", text: "Xepelin +9 — 'peeling the onion' technique working" },
];

const NAV = [
  { label: "Dashboard",    icon: "◈" },
  { label: "Clients",      icon: "◎" },
  { label: "Call Reviews", icon: "◷" },
  { label: "GTM Analysis", icon: "◉" },
  { label: "Playbooks",    icon: "▤" },
  { label: "Diagnostics",  icon: "◬" },
  { label: "Schedule",     icon: "◻" },
  { label: "Settings",     icon: "◌" },
];

function ScoreRing({ score, size = 48 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  const col = scoreColor(score);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 500, fontFamily: "'IBM Plex Mono', monospace", color: col }}>
        {score}
      </div>
    </div>
  );
}

function Card({ children, accent, style = {}, delay = 0 }) {
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER2}`, borderRadius: 14,
      borderTop: `2px solid ${accent || BORDER2}`,
      animation: "fadeUp 0.4s ease both", animationDelay: `${delay}ms`,
      ...style
    }}>
      {children}
    </div>
  );
}

export default function Dashboard({ onNavigate, onNewReview, userEmail = "" }) {
  const [activeNav, setActiveNav] = useState("Dashboard");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const rawName = userEmail ? userEmail.split("@")[0].split(".")[0] : "there";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const criticalCount = ALERTS.filter(a => a.sev === "critical").length;

  const handleNav = (label) => {
    setActiveNav(label);
    if (label === "Clients")      onNavigate?.("clients");
    else if (label === "Call Reviews") onNavigate?.("calls");
    else if (label === "Settings")     onNavigate?.("settings");
    else if (label === "Dashboard")    onNavigate?.("home");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Syne', system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.25; }
        }
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 220, flexShrink: 0, background: SURFACE, borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "24px 20px 20px" }}>
          <img src="/cuota_logo_official_White.png" alt="Cuota" style={{ height: 36, display: "block", maxWidth: "100%" }} />
        </div>
        <nav style={{ flex: 1, padding: "0 10px", overflowY: "auto" }}>
          {NAV.map((item, i) => {
            const active = activeNav === item.label;
            return (
              <button key={item.label} onClick={() => handleNav(item.label)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "8px 12px", marginBottom: 2, border: "none", borderRadius: 8,
                background: active ? "rgba(49,206,129,0.12)" : "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left", boxSizing: "border-box",
                animation: "fadeUp 0.3s ease both", animationDelay: `${i * 35}ms`,
              }}>
                <span style={{ fontSize: 14, color: active ? GREEN : TEXT3, width: 18, textAlign: "center" }}>{item.icon}</span>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? GREEN : TEXT2 }}>{item.label}</span>
                {active && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: TEXT3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 8 }}>{userEmail}</div>
          <button onClick={() => onNavigate?.("settings")} style={{ width: "100%", padding: "6px 10px", border: `1px solid ${BORDER2}`, borderRadius: 8, background: "transparent", color: TEXT2, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Settings</button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ marginLeft: 220, flex: 1, padding: "32px 36px", minWidth: 0, overflowY: "auto" }}>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, animation: "fadeUp 0.3s ease both" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, animation: "pulse 2s ease infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: TEXT3, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 0.5 }}>{today.toUpperCase()}</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.2, color: TEXT }}>
              {greeting},{" "}
              <em style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontWeight: 400, color: GREEN }}>{displayName}</em>
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: TEXT2 }}>
              {criticalCount} calls need your attention · Portfolio health needs work
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 4 }}>
            <button style={{ padding: "9px 16px", border: `1px solid ${BORDER2}`, borderRadius: 10, background: "transparent", color: TEXT2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>⌘K Search</button>
            <button style={{ padding: "9px 16px", border: `1px solid ${BORDER2}`, borderRadius: 10, background: "transparent", color: TEXT2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>↑ Upload</button>
            <button onClick={onNewReview} style={{ padding: "9px 18px", border: "none", borderRadius: 10, background: GREEN, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Review</button>
          </div>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Active Clients",       value: "5",   sub: "2 at risk",            accent: BLUE,  delay: 60  },
            { label: "Portfolio Health",      value: "57%", sub: "↓ needs work",          accent: AMBER, delay: 110 },
            { label: "Reviews This Month",    value: "24",  sub: "↑ +6 vs last month",    accent: GREEN, delay: 160 },
            { label: "Critical AEs Under 40", value: "3",   sub: "critical threshold",    accent: RED,   delay: 210 },
          ].map(k => (
            <Card key={k.label} accent={k.accent} delay={k.delay}>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase", marginBottom: 10 }}>{k.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: TEXT, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, marginBottom: 6 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: k.accent, fontWeight: 600 }}>{k.sub}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* TWO-COL: client table + recent reviews */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12, marginBottom: 20 }}>

          {/* Client health */}
          <Card accent={BORDER2} delay={270}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase" }}>Client Health</span>
              <span style={{ fontSize: 11, color: TEXT3 }}>5 clients</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 56px 100px 80px", padding: "7px 20px", fontSize: 9, fontWeight: 700, color: TEXT3, textTransform: "uppercase", letterSpacing: 1, gap: 12 }}>
              <span>Client</span><span>Score</span><span style={{ textAlign: "center" }}>Trend</span><span>Top Gap</span><span>Status</span>
            </div>
            {CLIENTS.map((c, i) => {
              const col = scoreColor(c.score);
              const sc = {
                healthy:  { bg: "rgba(49,206,129,0.10)",  text: GREEN },
                watching: { bg: "rgba(245,166,35,0.10)",  text: AMBER },
                "at-risk":{ bg: "rgba(255,77,77,0.10)",   text: RED   },
              }[c.status];
              return (
                <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr 130px 56px 100px 80px", padding: "11px 20px", gap: 12, alignItems: "center", borderBottom: i < CLIENTS.length - 1 ? `1px solid ${BORDER}` : "none", cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = SURFACE2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: TEXT3, marginTop: 1 }}>{c.stage}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: BORDER, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${c.score}%`, height: "100%", background: col, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: col, fontFamily: "'IBM Plex Mono', monospace", width: 26, textAlign: "right" }}>{c.score}</span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: c.delta > 0 ? GREEN : c.delta < 0 ? RED : TEXT3 }}>
                      {c.delta > 0 ? `↑+${c.delta}` : c.delta < 0 ? `↓${c.delta}` : "→"}
                    </span>
                  </div>
                  <div>
                    {c.gap
                      ? <span style={{ fontSize: 10, fontWeight: 600, color: AMBER, background: "rgba(245,166,35,0.10)", borderRadius: 4, padding: "2px 7px" }}>{c.gap}</span>
                      : <span style={{ fontSize: 10, color: TEXT3 }}>—</span>}
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: sc.text, background: sc.bg, borderRadius: 4, padding: "3px 8px", textTransform: "capitalize" }}>{c.status.replace("-", " ")}</span>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Recent reviews */}
          <Card accent={BORDER2} delay={320}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase" }}>Recent Reviews</span>
            </div>
            {REVIEWS.map((r, i) => {
              const col = scoreColor(r.score);
              const lc = { Critical: RED, "Needs Work": AMBER, Good: GREEN }[r.label] || TEXT2;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i < REVIEWS.length - 1 ? `1px solid ${BORDER}` : "none", cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = SURFACE2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <ScoreRing score={r.score} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.rep}</div>
                    <div style={{ fontSize: 10, color: TEXT3, marginTop: 1 }}>{r.client} · {r.type}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: lc, background: `${lc}1A`, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{r.label}</span>
                </div>
              );
            })}
          </Card>
        </div>

        {/* THREE-COL BOTTOM */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 268px", gap: 12 }}>

          {/* Category scores 3×3 */}
          <Card accent={BORDER2} delay={370}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase" }}>Category Scores</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              {CATEGORIES.map((cat, i) => {
                const col = scoreColor(cat.score);
                const isLastRow = Math.floor(i / 3) === 2;
                const isLastCol = i % 3 === 2;
                return (
                  <div key={cat.name} style={{ padding: "14px 16px", borderRight: !isLastCol ? `1px solid ${BORDER}` : "none", borderBottom: !isLastRow ? `1px solid ${BORDER}` : "none" }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: TEXT3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{cat.name}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: col, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, marginBottom: 8 }}>{cat.score}</div>
                    <div style={{ height: 3, background: BORDER, borderRadius: 2 }}>
                      <div style={{ width: `${cat.score}%`, height: "100%", background: col, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Coaching signals */}
          <Card accent={RED} delay={420}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase" }}>Coaching Signals</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: RED, background: "rgba(255,77,77,0.12)", borderRadius: 4, padding: "1px 6px" }}>{criticalCount} critical</span>
            </div>
            <div>
              {ALERTS.map((a, i) => {
                const col = { critical: RED, warning: AMBER, info: BLUE, positive: GREEN }[a.sev];
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "11px 20px", borderBottom: i < ALERTS.length - 1 ? `1px solid ${BORDER}` : "none", alignItems: "flex-start" }}>
                    <div style={{ width: 3, minHeight: 16, borderRadius: 2, background: col, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.6 }}>{a.text}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Quick actions + upcoming */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Card accent={GREEN} delay={460} style={{ flex: "0 0 auto" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase" }}>Quick Actions</span>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "→ Review Côme's calls",       color: RED   },
                  { label: "→ Schedule 11x coaching",     color: AMBER },
                  { label: "→ Update Diio playbook",      color: AMBER },
                  { label: "→ Share Xepelin win",         color: GREEN },
                ].map(a => (
                  <button key={a.label} style={{ padding: "8px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: a.color, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = a.color}
                    onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                    {a.label}
                  </button>
                ))}
              </div>
            </Card>

            <Card accent={BLUE} delay={490} style={{ flex: "0 0 auto" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: TEXT3, textTransform: "uppercase" }}>This Week</span>
              </div>
              <div style={{ padding: "4px 18px 12px" }}>
                {[
                  { day: "Mon", event: "Arc QBR prep"           },
                  { day: "Tue", event: "11x coaching · 2pm"     },
                  { day: "Thu", event: "Diio discovery debrief" },
                  { day: "Fri", event: "Portfolio review"       },
                ].map((e, i, arr) => (
                  <div key={e.day} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TEXT3, fontFamily: "'IBM Plex Mono', monospace", width: 24, flexShrink: 0 }}>{e.day}</span>
                    <span style={{ fontSize: 12, color: TEXT2 }}>{e.event}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

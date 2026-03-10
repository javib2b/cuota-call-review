import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────
const BG      = "var(--bg-app)";
const SURFACE = "var(--bg-primary)";
const CARD    = "var(--bg-card)";
const BORDER  = "var(--border)";
const GREEN   = "#31CE81";
const AMBER   = "#F5A623";
const RED     = "#FF4D4D";
const TEXT    = "#F5F3F0";
const MUTED   = "#9eb5c4";
const FAINT   = "#7a8ba0";
const FONT    = "'DM Sans', system-ui, sans-serif";
const MONO    = "'IBM Plex Mono', monospace";

const FULL = 220;
const MINI = 64;

function getSavedCollapsed() {
  try { return localStorage.getItem("sidebar_collapsed") === "1"; } catch { return false; }
}
function saveCollapsed(v: boolean) {
  try { localStorage.setItem("sidebar_collapsed", v ? "1" : "0"); } catch {}
}

// Overall score (0–100)
function scoreColor(s: number) {
  return s >= 70 ? GREEN : s >= 40 ? AMBER : RED;
}
function scoreBg(s: number) {
  return s >= 70 ? "rgba(49,206,129,0.12)" : s >= 40 ? "rgba(245,166,35,0.12)" : "rgba(255,77,77,0.12)";
}
// Category score (0–10)
function catColor(s: number) {
  return s >= 7 ? GREEN : s >= 4 ? AMBER : RED;
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relTime(d: string) {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Score line chart ─────────────────────────────────────────────
function ScoreChart({ calls }: { calls: any[] }) {
  if (calls.length === 0) return null;

  const W = 600, H = 110, PAD = { t: 12, r: 8, b: 24, l: 36 };
  const IW = W - PAD.l - PAD.r;
  const IH = H - PAD.t - PAD.b;

  const sorted = [...calls].sort(
    (a, b) => new Date(a.call_date || a.created_at).getTime() - new Date(b.call_date || b.created_at).getTime()
  );

  const scores = sorted.map(c => c.overall_score ?? 0);
  const N = scores.length;

  const xOf = (i: number) => PAD.l + (N === 1 ? IW / 2 : (i / (N - 1)) * IW);
  const yOf = (s: number) => PAD.t + IH - (s / 100) * IH;

  // Build polyline points
  const pts = scores.map((s, i) => `${xOf(i)},${yOf(s)}`).join(" ");

  // Guide lines at 40 and 70
  const guides = [
    { y: yOf(70), label: "70", color: GREEN },
    { y: yOf(40), label: "40", color: AMBER },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: H, display: "block" }}
    >
      {/* Guide lines */}
      {guides.map(g => (
        <g key={g.label}>
          <line x1={PAD.l} y1={g.y} x2={W - PAD.r} y2={g.y} stroke={g.color} strokeWidth={0.5} strokeDasharray="3 4" opacity={0.3} />
          <text x={PAD.l - 4} y={g.y + 4} textAnchor="end" fontSize={8} fill={g.color} opacity={0.5} fontFamily={MONO}>{g.label}</text>
        </g>
      ))}

      {/* Line */}
      {N > 1 && (
        <polyline
          points={pts}
          fill="none"
          stroke={scoreColor(scores[scores.length - 1])}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {/* Area fill */}
      {N > 1 && (
        <polygon
          points={`${xOf(0)},${yOf(0)} ${pts} ${xOf(N - 1)},${yOf(0)}`}
          fill={scoreColor(scores[scores.length - 1])}
          opacity={0.05}
        />
      )}

      {/* Dots */}
      {scores.map((s, i) => (
        <circle
          key={i}
          cx={xOf(i)}
          cy={yOf(s)}
          r={N === 1 ? 5 : 3.5}
          fill={scoreColor(s)}
          stroke={SURFACE}
          strokeWidth={1.5}
        />
      ))}

      {/* X-axis date labels — first, middle, last only */}
      {[0, ...(N > 2 ? [Math.floor(N / 2)] : []), N - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize={8} fill={FAINT} fontFamily={FONT}>
          {fmtDate(sorted[i].call_date || sorted[i].created_at)}
        </text>
      ))}
    </svg>
  );
}

// ─── Category breakdown ───────────────────────────────────────────
const AE_CATS = [
  { id: "intro_opening",      name: "Opening"     },
  { id: "discovery",          name: "Discovery"   },
  { id: "pitch",              name: "Pitch"       },
  { id: "objection_handling", name: "Objections"  },
  { id: "next_steps",         name: "Next Steps"  },
  { id: "pre_call_research",  name: "Research"    },
  { id: "services_product",   name: "Product"     },
  { id: "pricing",            name: "Pricing"     },
];
const SDR_CATS = [
  { id: "call_opener",        name: "Opener"      },
  { id: "product_pitch",      name: "Pitch"       },
  { id: "qualification",      name: "Qualification"},
  { id: "call_to_action",     name: "CTA"         },
  { id: "objection_handling", name: "Objections"  },
];

function CategoryBreakdown({ calls }: { calls: any[] }) {
  const isSdr = calls.some(c => c.category_scores?.rep_type === "SDR");
  const cats  = isSdr ? SDR_CATS : AE_CATS;

  const avgs = cats.map(cat => {
    const vals = calls
      .map(c => c.category_scores?.[cat.id]?.score)
      .filter((s): s is number => typeof s === "number");
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    return { ...cat, avg };
  }).filter(c => c.avg !== null) as Array<{ id: string; name: string; avg: number }>;

  if (avgs.length === 0) return null;
  const sorted = [...avgs].sort((a, b) => a.avg - b.avg);

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any,
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)",
      borderRadius: 14, padding: "20px 24px", marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 16 }}>
        Category Breakdown
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(cat => (
          <div key={cat.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr 46px", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>{cat.name}</span>
            <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${(cat.avg / 10) * 100}%`, height: "100%", background: catColor(cat.avg), borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: catColor(cat.avg), fontFamily: MONO, textAlign: "right" }}>
              {cat.avg}/10
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Collapsible sidebar ──────────────────────────────────────────
function Sidebar({
  onNavigate, onNewReview, onBack, client,
}: {
  onNavigate: (p: string) => void;
  onNewReview: () => void;
  onBack: () => void;
  client: string;
}) {
  const [collapsed, setCollapsed] = useState(getSavedCollapsed);
  function toggle() { setCollapsed(p => { saveCollapsed(!p); return !p; }); }
  const W = collapsed ? MINI : FULL;

  return (
    <aside style={{
      width: W, flexShrink: 0, position: "fixed", top: 0, left: 0, bottom: 0,
      background: SURFACE, borderRight: `1px solid ${BORDER}`,
      display: "flex", flexDirection: "column", zIndex: 100,
      transition: "width 0.2s ease", overflow: "hidden",
    }}>
      <div style={{ padding: collapsed ? "20px 0" : "24px 20px 20px", display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
        {collapsed ? (
          <div onClick={() => onNavigate("home")} style={{ width: 34, height: 34, borderRadius: 8, cursor: "pointer", background: "rgba(49,206,129,0.15)", border: "1px solid rgba(49,206,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: GREEN }}>C</div>
        ) : (
          <img src="/cuota_logo_official_White.png" alt="Cuota" onClick={() => onNavigate("home")} style={{ height: 48, display: "block", maxWidth: "100%", cursor: "pointer" }} />
        )}
      </div>

      <nav style={{ flex: 1, padding: collapsed ? "4px 8px" : "4px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {collapsed ? (
          <>
            <button onClick={() => onNavigate("clients")} title="Clients" style={{ width: "100%", padding: "10px 0", border: "none", borderRadius: 8, background: "rgba(49,206,129,0.10)", cursor: "pointer", display: "flex", justifyContent: "center", fontFamily: FONT }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(49,206,129,0.10)")}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </button>
            <button onClick={onNewReview} title="New Call Review" style={{ width: "100%", padding: "10px 0", border: "none", borderRadius: 8, background: "rgba(49,206,129,0.12)", cursor: "pointer", display: "flex", justifyContent: "center", fontFamily: FONT }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: GREEN, lineHeight: 1 }}>+</span>
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onNavigate("clients")} style={{ display: "flex", alignItems: "center", width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, background: "rgba(49,206,129,0.10)", cursor: "pointer", fontFamily: FONT, textAlign: "left", boxSizing: "border-box" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: GREEN }}>Clients</span>
            </button>
            <button onClick={onNewReview} style={{ display: "flex", alignItems: "center", width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, background: "rgba(49,206,129,0.12)", cursor: "pointer", fontFamily: FONT, textAlign: "left", boxSizing: "border-box" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>+ New Call Review</span>
            </button>
          </>
        )}
        <button onClick={toggle} title={collapsed ? "Expand" : "Collapse"} style={{ marginTop: "auto", width: "100%", padding: collapsed ? "10px 0" : "8px 12px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", fontFamily: FONT, gap: 8 }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <span style={{ fontSize: 14, color: FAINT, lineHeight: 1 }}>{collapsed ? "›" : "‹"}</span>
          {!collapsed && <span style={{ fontSize: 11, color: FAINT }}>Collapse</span>}
        </button>
      </nav>

      <div style={{ padding: collapsed ? "16px 0" : "16px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(49,206,129,0.15)", border: "1px solid rgba(49,206,129,0.3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: GREEN, fontFamily: FONT }}>JV</div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Javier V.</div>
            <div style={{ fontSize: 10, color: FAINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>javier@cuota.io</div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Props ────────────────────────────────────────────────────────
interface Props {
  client: string;
  repName: string;
  repCalls: any[];
  quotaTarget?: number;
  quotaClosed?: number;
  onBack: () => void;
  onViewCall: (call: any) => void;
  onNavigate: (page: string) => void;
  onNewReview: () => void;
  photoUrl?: string;
}

// ─── Main ─────────────────────────────────────────────────────────
export default function RepDetailPage({ client, repName, repCalls, quotaTarget, quotaClosed, onBack, onViewCall, onNavigate, onNewReview, photoUrl }: Props) {
  const [collapsed] = useState(getSavedCollapsed);
  const [imgError, setImgError] = useState(false);
  const W = collapsed ? MINI : FULL;

  const sorted = [...repCalls].sort(
    (a, b) => new Date(b.call_date || b.created_at).getTime() - new Date(a.call_date || a.created_at).getTime()
  );

  const avgScore = repCalls.length
    ? Math.round(repCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / repCalls.length)
    : null;

  const chrono = [...repCalls].sort(
    (a, b) => new Date(a.call_date || a.created_at).getTime() - new Date(b.call_date || b.created_at).getTime()
  );
  const trend = chrono.length >= 2
    ? Math.round((chrono[chrono.length - 1].overall_score ?? 0) - (chrono[chrono.length - 2].overall_score ?? 0))
    : null;

  const initials = repName.split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, color: TEXT, fontFamily: FONT }}>
      <Sidebar onNavigate={onNavigate} onNewReview={onNewReview} onBack={onBack} client={client} />

      <main style={{ marginLeft: W, flex: 1, padding: "36px 44px 48px", minWidth: 0, transition: "margin-left 0.2s ease" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 13 }}>
            <span onClick={() => onNavigate("clients")} style={{ color: GREEN, cursor: "pointer", fontWeight: 500 }}>Clients</span>
            <span style={{ color: FAINT }}>/</span>
            <span onClick={onBack} style={{ color: GREEN, cursor: "pointer", fontWeight: 500 }}>{client}</span>
            <span style={{ color: FAINT }}>/</span>
            <span style={{ color: TEXT, fontWeight: 600 }}>{repName}</span>
          </div>

          {/* Hero */}
          <div style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%), rgba(6,32,53,0.90)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.11)",
            borderRadius: 16, padding: "24px 28px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 20,
          }}>
            {/* Avatar */}
            {photoUrl && !imgError
              ? <img src={photoUrl} alt={repName} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }} onError={() => setImgError(true)} />
              : <div style={{
                  width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(49,206,129,0.15)", border: "1px solid rgba(49,206,129,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, color: GREEN,
                }}>
                  {initials}
                </div>
            }

            {/* Name + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: TEXT, letterSpacing: "-0.3px" }}>
                {repName}
              </h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: MUTED }}>{repCalls.length} calls</span>
                {repCalls.some(c => c.category_scores?.rep_type === "SDR") && (
                  <span style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>SDR</span>
                )}
              </div>
            </div>

            {/* Score + trend */}
            {avgScore !== null && (
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 44, fontWeight: 800, color: TEXT, fontFamily: MONO, lineHeight: 1 }}>{avgScore}</div>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: FAINT, marginTop: 4 }}>Avg Score</div>
                {trend !== null && (
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: trend > 0 ? GREEN : trend < 0 ? RED : FAINT, fontFamily: MONO }}>
                    {trend > 0 ? `↑ +${trend}` : trend < 0 ? `↓ ${trend}` : "→ 0"}
                  </div>
                )}
              </div>
            )}

            {/* Quota attainment */}
            {quotaTarget != null && quotaClosed != null && (() => {
              const pct = Math.round((quotaClosed / quotaTarget) * 100);
              const barColor = pct >= 90 ? GREEN : pct >= 70 ? AMBER : RED;
              const fmtK = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
              return (
                <div style={{
                  textAlign: "center", flexShrink: 0,
                  borderLeft: `1px solid rgba(255,255,255,0.08)`, paddingLeft: 24,
                }}>
                  <div style={{ fontSize: 44, fontWeight: 800, color: barColor, fontFamily: MONO, lineHeight: 1 }}>
                    {pct}%
                  </div>
                  <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: FAINT, marginTop: 4 }}>
                    Quota Attainment
                  </div>
                  <div style={{ marginTop: 8, width: 80, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginLeft: "auto", marginRight: "auto" }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: MUTED, fontFamily: MONO }}>
                    {fmtK(quotaClosed)} / {fmtK(quotaTarget)}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Score progression chart */}
          {repCalls.length > 0 && (
            <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any, border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>
                Score Progression
              </div>
              <ScoreChart calls={repCalls} />
            </div>
          )}

          {/* Category breakdown */}
          <CategoryBreakdown calls={repCalls} />

          {/* Call list */}
          <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any, border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 52px 100px 100px",
              padding: "9px 20px", gap: 12,
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 10, fontWeight: 700, color: FAINT,
              textTransform: "uppercase", letterSpacing: 1.1,
            }}>
              <span>Call</span>
              <span style={{ textAlign: "center" }}>Score</span>
              <span>Type</span>
              <span>Date</span>
            </div>

            {sorted.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", fontSize: 13, color: MUTED }}>No calls recorded.</div>
            ) : sorted.map((call, i) => {
              const score = call.overall_score ?? null;
              const date  = call.call_date || call.created_at;
              const type  = call.category_scores?.call_type || call.call_type || "Call";
              const prospect = call.category_scores?.prospect_name || call.prospect_name || "";

              return (
                <div
                  key={call.id || i}
                  onClick={() => onViewCall(call)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 52px 100px 100px",
                    padding: "13px 20px", gap: 12, alignItems: "center",
                    borderBottom: i < sorted.length - 1 ? `1px solid ${BORDER}` : "none",
                    cursor: "pointer", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Call title / prospect */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                      {prospect || `${client} call`}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                      {relTime(date)}
                    </div>
                  </div>

                  {/* Score chip */}
                  <div style={{ textAlign: "center" }}>
                    {score !== null ? (
                      <span style={{
                        display: "inline-block",
                        padding: "3px 0", width: 38, textAlign: "center",
                        background: scoreBg(score), borderRadius: 6,
                        fontSize: 12, fontWeight: 700, color: scoreColor(score), fontFamily: MONO,
                      }}>{score}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: FAINT }}>—</span>
                    )}
                  </div>

                  {/* Call type */}
                  <div style={{ fontSize: 12, color: MUTED }}>{type}</div>

                  {/* Date */}
                  <div style={{ fontSize: 12, color: MUTED }}>{fmtDate(date)}</div>
                </div>
              );
            })}
          </div>

        </div>
      </main>
    </div>
  );
}

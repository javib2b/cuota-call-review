import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────
const BG      = "transparent";
const SURFACE = "rgba(4, 9, 20, 0.82)";
const BORDER  = "var(--border)";
const BORDER2 = "rgba(255,255,255,0.13)";
const GREEN   = "#31CE81";
const AMBER   = "#F5A623";
const RED     = "#FF4D4D";
const TEXT    = "#F5F3F0";
const MUTED   = "#9eb5c4";
const FAINT   = "#7a8ba0";
const FONT    = "'DM Sans', system-ui, sans-serif";
const MONO    = "'IBM Plex Mono', monospace";

// ─── Sidebar widths ───────────────────────────────────────────────
const FULL = 220;
const MINI = 64;

function getSavedCollapsed() {
  try { const v = localStorage.getItem("sidebar_collapsed"); return v === null ? true : v === "1"; } catch { return true; }
}
function saveCollapsed(v: boolean) {
  try { localStorage.setItem("sidebar_collapsed", v ? "1" : "0"); } catch {}
}

// ─── Client logo bg colors ────────────────────────────────────────
const LOGO_BG: Record<string, string> = {
  "11x":       "#1a1a1a",
  "Arc":       "#1c1f2e",
  "Diio":      "#0e1f2e",
  "Factor":    "#1a2235",
  "Paymend":   "#1a1a2e",
  "Nauta":     "#1a2235",
  "Planimatik":"#1e1a2e",
  "Rapido":    "#1a2218",
  "Xepelin":   "#1a2235",
};

const CLIENT_SUBTITLE: Record<string, string> = {
  "11x":     "Series B · AI Sales",
  "Arc":     "Series A · Dev Tools",
  "Diio":    "Seed · Logistics",
  "Factor":  "Series A · Fintech",
  "Paymend": "New client",
};

// ─── Domain map for Brandfetch logo lookup ─────────────────────────
const CLIENT_DOMAIN: Record<string, string> = {
  "11x":       "11x.ai",
  "Arc":       "experiencearc.com",
  "Diio":      "diio.com",
  "Factor":    "factor-labs.com",
  "Nauta":     "getnauta.com",
  "Paymend":   "paymend.com",
  "Planimatik":"planimatik.com",
  "Rapido":    "rapidosaas.com",
  "Xepelin":   "xepelin.com",
};
// Local logo overrides — used instead of Brandfetch when Brandfetch returns the wrong image
const CLIENT_LOGO_OVERRIDE: Record<string, string> = {
  "Xepelin": "/logos/xepelin.png",
  "Factor":  "/logos/factor.png",
};

function logoInitials(name: string) { return name.slice(0, 2).toUpperCase(); }
function logoBg(name: string) { return LOGO_BG[name] ?? "#1a2235"; }
function scoreColor(s: number) { return s >= 70 ? GREEN : s >= 40 ? AMBER : RED; }

// ─── ClientLogo with cascading fallback ───────────────────────────
// 1. Brandfetch CDN (hardcoded map > website fallback for unlisted > name.com guess)  2. initials
function ClientLogo({ name, size, borderRadius, website }: { name: string; size: number; borderRadius: number; website?: string }) {
  const localOverride = CLIENT_LOGO_OVERRIDE[name] ?? null;
  let domain: string = CLIENT_DOMAIN[name] ?? "";
  if (!domain && website) {
    try {
      const url = website.startsWith("http") ? website : `https://${website}`;
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
  }
  if (!domain) domain = `${name.toLowerCase()}.com`;
  const [failed, setFailed] = useState(false);

  const logoSrc = localOverride ?? `https://cdn.brandfetch.io/${domain}/w/400/h/400`;

  return (
    <div style={{
      width: size, height: size, borderRadius, flexShrink: 0,
      background: logoBg(name), border: `1px solid ${BORDER2}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.33), fontWeight: 700, color: TEXT,
      position: "relative", overflow: "hidden",
    }}>
      {logoInitials(name)}
      {!failed && (
        <img
          src={logoSrc}
          alt=""
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────────
const CIRC = 69.1;

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 11, color: FAINT, fontFamily: MONO }}>—</span>
      </div>
    );
  }
  const col    = scoreColor(score);
  const offset = CIRC * (1 - score / 100);
  return (
    <svg width={32} height={32} style={{ flexShrink: 0, display: "block" }}>
      <circle cx={16} cy={16} r={11} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2.5} />
      <circle
        cx={16} cy={16} r={11} fill="none"
        stroke={col} strokeWidth={2.5}
        strokeDasharray={CIRC} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 16 16)"
      />
      <text x={16} y={20} textAnchor="middle" fill={col} fontSize={8} fontWeight={700} fontFamily={MONO}>
        {score}
      </text>
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────
type BadgeVariant = "red" | "amber" | "green" | "gray";
const BADGE_STYLE: Record<BadgeVariant, { bg: string; color: string }> = {
  red:   { bg: "rgba(255,77,77,0.12)",   color: RED   },
  amber: { bg: "rgba(245,166,35,0.12)",  color: AMBER },
  green: { bg: "rgba(49,206,129,0.12)",  color: GREEN },
  gray:  { bg: "rgba(255,255,255,0.06)", color: FAINT },
};

function statusInfo(calls: number, score: number | null): { label: string; variant: BadgeVariant } {
  if (calls === 0 || score === null) return { label: "No calls", variant: "gray" };
  if (score >= 70) return { label: "Healthy",    variant: "green" };
  if (score >= 55) return { label: "Average",    variant: "amber" };
  if (score >= 40) return { label: "Needs Work", variant: "amber" };
  return                  { label: "Critical",   variant: "red"   };
}

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  const s = BADGE_STYLE[variant];
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 6,
      fontSize: 11, fontWeight: 600, fontFamily: FONT,
      background: s.bg, color: s.color,
    }}>{label}</span>
  );
}

// ─── Per-client computed stats ────────────────────────────────────
interface ClientMeta { calls: number; score: number | null; reps: number; }

function computeMeta(client: string, savedCalls: any[]): ClientMeta {
  const calls = savedCalls.filter(
    c => c.category_scores?.client === client ||
         (c.prospect_company || "").toLowerCase().includes(client.toLowerCase())
  );
  const scores = calls
    .map(c => c.overall_score)
    .filter((s): s is number => typeof s === "number" && s > 0);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const reps = new Set(calls.map(c => c.category_scores?.rep_name).filter(Boolean)).size;
  return { calls: calls.length, score: avgScore, reps };
}

// ─── Props ────────────────────────────────────────────────────────
interface Props {
  clients: string[];
  pastClients: string[];
  savedCalls: any[];
  clientProfiles?: Record<string, { website?: string }>;
  onClientClick: (client: string) => void;
  onNewReview: () => void;
  onNavigate: (page: string) => void;
  onAddClient: (name: string) => void;
  onArchiveClient: (name: string) => void;
  onRestoreClient: (name: string) => void;
  onProfileClick?: () => void;
  userEmail?: string;
  profile?: { full_name?: string; role?: string } | null;
  callsError?: string;
  onRetryLoadCalls?: () => void;
}

const COL = "1fr 48px 56px 120px 48px 82px";

// ─── Main ─────────────────────────────────────────────────────────
export default function ClientsPage({
  clients, pastClients, savedCalls,
  clientProfiles = {},
  onClientClick, onNewReview, onNavigate,
  onAddClient, onArchiveClient, onRestoreClient,
  onProfileClick, userEmail = "", profile,
  callsError, onRetryLoadCalls,
}: Props) {
  const [collapsed, setCollapsed]     = useState(getSavedCollapsed);
  const [hoveredRow, setHoveredRow]   = useState<string | null>(null);
  const [hoveredPast, setHoveredPast] = useState<string | null>(null);
  const [addHovered, setAddHovered]   = useState(false);

  function toggle() {
    setCollapsed(prev => { saveCollapsed(!prev); return !prev; });
  }

  const W = collapsed ? MINI : FULL;

  // Compute stats
  const metaMap: Record<string, ClientMeta> = {};
  [...clients, ...pastClients].forEach(c => { metaMap[c] = computeMeta(c, savedCalls); });

  const totalCalls = clients.reduce((s, c) => s + metaMap[c].calls, 0);
  const scores     = clients.map(c => metaMap[c].score).filter((s): s is number => s !== null);
  const avgScore   = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const totalReps  = clients.reduce((s, c) => s + metaMap[c].reps, 0);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, color: TEXT, fontFamily: FONT }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: W, flexShrink: 0, position: "fixed", top: 0, left: 0, bottom: 0,
        background: SURFACE, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column", zIndex: 100,
        transition: "width 0.2s ease", overflow: "hidden",
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? "20px 0" : "24px 20px 20px",
          display: "flex", justifyContent: collapsed ? "center" : "flex-start",
        }}>
          {collapsed ? (
            <div onClick={() => onNavigate("home")} style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden", cursor: "pointer", flexShrink: 0 }}>
              <img src="/favicon.png" alt="Cuota" style={{ width: "115%", height: "115%", marginLeft: "-7.5%", marginTop: "-7.5%", display: "block" }} />
            </div>
          ) : (
            <img
              src="/cuota_logo_official_White.png" alt="Cuota"
              onClick={() => onNavigate("home")}
              style={{ height: 48, display: "block", maxWidth: "100%", cursor: "pointer" }}
            />
          )}
        </div>

        {/* Nav */}
        <nav style={{
          flex: 1, padding: collapsed ? "4px 8px" : "4px 10px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {collapsed ? (
            <>
              {/* Clients icon — active */}
              <button
                title="Clients"
                style={{
                  width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
                  background: "rgba(49,206,129,0.10)", cursor: "default",
                  display: "flex", justifyContent: "center", fontFamily: FONT,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </button>
              {/* New Review icon */}
              <button
                onClick={onNewReview}
                title="New Call Review"
                style={{
                  width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
                  background: "rgba(49,206,129,0.12)", cursor: "pointer",
                  display: "flex", justifyContent: "center", fontFamily: FONT,
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, color: GREEN, lineHeight: 1 }}>+</span>
              </button>
            </>
          ) : (
            <>
              {/* Clients — active */}
              <button style={{
                display: "flex", alignItems: "center", width: "100%",
                padding: "9px 12px", border: "none", borderRadius: 8,
                background: "rgba(49,206,129,0.10)", cursor: "default",
                fontFamily: FONT, textAlign: "left", boxSizing: "border-box",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>Clients</span>
              </button>
              {/* + New Call Review */}
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

          {/* Collapse toggle */}
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

        {/* User footer — click to open Profile & Settings */}
        {(() => {
          const fullName = profile?.full_name || userEmail || "?";
          const initials = fullName.split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
          const displayName = profile?.full_name ? profile.full_name.split(" ")[0] : (userEmail ? userEmail.split("@")[0] : "");
          return (
            <div
              onClick={onProfileClick}
              title="Profile & Settings"
              style={{
                padding: collapsed ? "10px 0" : "10px 12px",
                borderTop: `1px solid ${BORDER}`,
                display: "flex", alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: 10, cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(49,206,129,0.15)", border: "1px solid rgba(49,206,129,0.3)",
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: GREEN, fontFamily: FONT,
              }}>{initials}</div>
              {!collapsed && (
                <>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName || userEmail}</div>
                    <div style={{ fontSize: 10, color: FAINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
                  </div>
                  <span style={{ fontSize: 14, color: FAINT, flexShrink: 0 }}>⚙</span>
                </>
              )}
            </div>
          );
        })()}
      </aside>

      {/* ── MAIN ── */}
      <main style={{
        marginLeft: W, flex: 1,
        padding: "36px 40px 40px 28px",
        minWidth: 0, transition: "margin-left 0.2s ease",
      }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* Load error banner */}
          {callsError && (
            <div style={{
              marginBottom: 20, padding: "12px 16px",
              background: "rgba(255,77,77,0.12)", border: "1px solid rgba(255,77,77,0.35)",
              borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <span style={{ fontSize: 13, color: "#ff6b6b" }}>{callsError}</span>
              {onRetryLoadCalls && (
                <button onClick={onRetryLoadCalls} style={{
                  flexShrink: 0, padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  background: "rgba(255,77,77,0.2)", border: "1px solid rgba(255,77,77,0.5)",
                  borderRadius: 6, color: "#ff6b6b", cursor: "pointer", fontFamily: FONT,
                }}>Retry</button>
              )}
            </div>
          )}

          {/* Page header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: TEXT, letterSpacing: "-0.3px" }}>
              Clients
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
              {clients.length} active
              {" · "}
              {totalCalls} reviews
              {" · avg score "}
              <span style={{ fontWeight: 600, color: avgScore !== null ? scoreColor(avgScore) : FAINT }}>
                {avgScore ?? "—"}
              </span>
              {" · "}
              {totalReps} reps
            </p>
          </div>

          {/* Active clients table */}
          <div style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)",
            borderRadius: 14, overflow: "hidden", marginBottom: 32,
          }}>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "9px 20px", gap: 12, alignItems: "center",
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 10, fontWeight: 700, letterSpacing: 1.1,
              textTransform: "uppercase", color: FAINT,
            }}>
              <span>Client</span>
              <span style={{ textAlign: "center" }}>Score</span>
              <span style={{ textAlign: "center" }}>Calls</span>
              <span>Status</span>
              <span style={{ textAlign: "center" }}>Reps</span>
              <span />
            </div>

            {clients.map((client, i) => {
              const meta    = metaMap[client];
              const { label, variant } = statusInfo(meta.calls, meta.score);
              const hovered  = hoveredRow === client;
              const subtitle = CLIENT_SUBTITLE[client] ?? "";

              return (
                <div
                  key={client}
                  onMouseEnter={() => setHoveredRow(client)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => onClientClick(client)}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    padding: "12px 20px", gap: 12, alignItems: "center",
                    borderBottom: i < clients.length - 1 ? `1px solid ${BORDER}` : "none",
                    cursor: "pointer",
                    background: hovered ? "rgba(255,255,255,0.025)" : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  {/* Logo + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                    <ClientLogo key={client + (clientProfiles[client]?.website || "")} name={client} size={34} borderRadius={8} website={clientProfiles[client]?.website} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>
                      {subtitle && <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</div>}
                    </div>
                  </div>

                  {/* Score ring */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <ScoreRing score={meta.score} />
                  </div>

                  {/* Calls */}
                  <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: meta.calls > 0 ? TEXT : FAINT, fontFamily: MONO }}>
                    {meta.calls > 0 ? meta.calls : "—"}
                  </div>

                  {/* Status */}
                  <div><Badge label={label} variant={variant} /></div>

                  {/* Reps */}
                  <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: meta.reps > 0 ? TEXT : FAINT, fontFamily: MONO }}>
                    {meta.reps > 0 ? meta.reps : "—"}
                  </div>

                  {/* Archive (hover only) */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(`Archive "${client}"? Their call history will still be viewable.`)) onArchiveClient(client);
                      }}
                      style={{
                        opacity: hovered ? 1 : 0, transition: "opacity 0.1s",
                        padding: "4px 10px", borderRadius: 6, border: `1px solid ${BORDER2}`,
                        background: "transparent", color: MUTED,
                        fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: FONT,
                      }}
                    >Archive</button>
                  </div>
                </div>
              );
            })}

            {/* + Add client */}
            <div
              onMouseEnter={() => setAddHovered(true)}
              onMouseLeave={() => setAddHovered(false)}
              onClick={() => { const name = window.prompt("Client name:"); if (name?.trim()) onAddClient(name.trim()); }}
              style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "12px 20px", cursor: "pointer",
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                border: `1.5px dashed ${addHovered ? GREEN : BORDER2}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, lineHeight: 1,
                color: addHovered ? GREEN : FAINT,
                transition: "all 0.15s",
              }}>+</div>
              <span style={{ fontSize: 13, fontWeight: 500, color: addHovered ? GREEN : FAINT, transition: "color 0.15s" }}>
                Add client
              </span>
            </div>
          </div>

          {/* Past clients */}
          {pastClients.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: FAINT,
                textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10,
              }}>
                Past clients
              </div>
              <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), rgba(6,32,53,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any, border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.09)", borderRadius: 14, overflow: "hidden" }}>
                {pastClients.map((client, i) => {
                  const meta    = metaMap[client];
                  const hovered = hoveredPast === client;
                  return (
                    <div
                      key={client}
                      onMouseEnter={() => setHoveredPast(client)}
                      onMouseLeave={() => setHoveredPast(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "11px 20px",
                        borderBottom: i < pastClients.length - 1 ? `1px solid ${BORDER}` : "none",
                        opacity: hovered ? 1 : 0.55,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <ClientLogo key={client + (clientProfiles[client]?.website || "")} name={client} size={30} borderRadius={7} website={clientProfiles[client]?.website} />
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{client}</span>
                        <span style={{ fontSize: 12, color: MUTED }}>
                          {meta.calls > 0 ? `${meta.calls} call${meta.calls !== 1 ? "s" : ""}` : "No calls"}
                        </span>
                      </div>
                      {meta.score !== null && <ScoreRing score={meta.score} />}
                      <button
                        onClick={() => onRestoreClient(client)}
                        style={{
                          opacity: hovered ? 1 : 0, transition: "opacity 0.15s",
                          padding: "4px 12px", borderRadius: 20,
                          background: "rgba(49,206,129,0.12)", border: "none",
                          color: GREEN, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: FONT,
                        }}
                      >Restore</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

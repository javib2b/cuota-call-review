const GREEN  = "#31CE81";
const AMBER  = "#F5A623";
const RED    = "#FF4D4D";
const BG     = "#011e38";
const SURFACE = "#062035";
const CARD   = "#062035";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT   = "#f0f0f0";
const TEXT2  = "#9ca3af";
const TEXT3  = "#4b5563";
const FONT   = "'DM Sans', system-ui, sans-serif";

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

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, color: TEXT, fontFamily: FONT }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 220, flexShrink: 0, position: "fixed", top: 0, left: 0, bottom: 0,
        background: SURFACE, borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column", zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px" }}>
          <img
            src="/cuota_logo_official_White.png"
            alt="Cuota"
            onClick={() => onNavigate?.("home")}
            style={{ height: 48, display: "block", maxWidth: "100%", cursor: "pointer" }}
          />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "4px 10px" }}>
          {/* Clients */}
          <button
            onClick={() => onNavigate?.("clients")}
            style={{
              display: "flex", alignItems: "center", width: "100%",
              padding: "9px 12px", marginBottom: 4, border: "none", borderRadius: 8,
              background: "transparent", cursor: "pointer",
              fontFamily: FONT, textAlign: "left", boxSizing: "border-box",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: TEXT2 }}>Clients</span>
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
        </nav>

        {/* User footer */}
        <div style={{
          padding: "16px 20px", borderTop: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "rgba(49,206,129,0.15)",
            border: `1px solid rgba(49,206,129,0.3)`, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: GREEN, fontFamily: FONT,
          }}>JV</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Javier V.</div>
            <div style={{ fontSize: 10, color: TEXT3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>javier@cuota.io</div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 220, flex: 1, padding: "40px 44px", minWidth: 0 }}>

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
          {/* Table header */}
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

          {/* Rows */}
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
                {/* Client */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: TEXT3, marginTop: 2, fontFamily: FONT }}>{c.stage}</div>
                </div>

                {/* Score bar + number */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${c.score}%`, height: "100%", background: col, borderRadius: 3 }} />
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: col, width: 34, textAlign: "right", flexShrink: 0,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {c.score}%
                  </span>
                </div>

                {/* Trend */}
                <div style={{ textAlign: "center" }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
                    color: c.delta > 0 ? GREEN : c.delta < 0 ? RED : TEXT3,
                  }}>
                    {c.delta > 0 ? `↑ +${c.delta}` : c.delta < 0 ? `↓ ${c.delta}` : "— 0"}
                  </span>
                </div>

                {/* Gap */}
                <div>
                  {c.gap !== "—"
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: AMBER, background: "rgba(245,166,35,0.10)", borderRadius: 6, padding: "3px 10px", fontFamily: FONT }}>{c.gap}</span>
                    : <span style={{ fontSize: 12, color: TEXT3, fontFamily: FONT }}>—</span>
                  }
                </div>

                {/* Status */}
                <div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: st.color, background: st.bg,
                    borderRadius: 6, padding: "4px 10px", fontFamily: FONT,
                  }}>
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

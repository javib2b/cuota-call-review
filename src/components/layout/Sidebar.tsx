import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { getScoreColor } from "../../lib/scoring";

interface ClientEntry {
  name: string;
  avgScore?: number;
}

interface Props {
  clients: ClientEntry[];
  onNewReview: () => void;
}

const ASSESSMENT_LINKS = [
  { path: "/assessments/gtm-strategy", label: "GTM Strategy" },
  { path: "/assessments/top-of-funnel", label: "Top of Funnel" },
  { path: "/assessments/revops", label: "RevOps" },
  { path: "/assessments/hiring", label: "Sales Hiring" },
  { path: "/assessments/metrics", label: "Metrics" },
];

const navItemBase =
  "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg border-l-2 border-transparent transition-colors text-left";
const navItemActive =
  "border-brand-500 bg-brand-50 text-brand-600 font-semibold";
const navItemInactive =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-800 font-medium";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-slate-100 mx-3 my-1" />;
}

export function Sidebar({ clients, onNewReview }: Props) {
  const [clientsOpen, setClientsOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const isAdmin = profile?.role === "admin" || profile?.role === "manager";

  const inner = (
    <div className="flex flex-col h-full overflow-y-auto bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-100">
        <button
          onClick={() => navigate("/")}
          className="text-xl font-black tracking-tight text-slate-800 hover:text-brand-600 transition-colors"
        >
          CUOTA<span className="text-brand-500">/</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2">
        {/* Home */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${navItemBase} ${isActive ? navItemActive : navItemInactive}`
          }
        >
          <span>🏠</span> Home
        </NavLink>

        <Divider />
        <SectionLabel>Workspace</SectionLabel>

        {/* Clients */}
        <button
          onClick={() => setClientsOpen(o => !o)}
          className={`${navItemBase} ${navItemInactive} justify-between`}
        >
          <span className="flex items-center gap-2">
            <span>📁</span> Clients
          </span>
          <span className="text-slate-400 text-xs">{clientsOpen ? "▾" : "▸"}</span>
        </button>

        {clientsOpen && (
          <div className="ml-4 mt-0.5 space-y-0.5">
            <NavLink
              to="/clients"
              end
              className={({ isActive }) =>
                `${navItemBase} text-xs ${isActive ? navItemActive : navItemInactive}`
              }
            >
              All Clients
            </NavLink>
            {clients.map(c => (
              <NavLink
                key={c.name}
                to={`/clients/${encodeURIComponent(c.name)}`}
                className={({ isActive }) =>
                  `${navItemBase} text-xs justify-between ${isActive ? navItemActive : navItemInactive}`
                }
              >
                <span className="truncate">{c.name}</span>
                {c.avgScore != null && (
                  <span
                    className="text-[10px] font-bold tabular-nums flex-shrink-0"
                    style={{ color: getScoreColor(c.avgScore) }}
                  >
                    {c.avgScore}%
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        )}

        <Divider />
        <SectionLabel>Tools</SectionLabel>

        {/* ARR Engine */}
        <NavLink
          to="/arr-engine"
          className={({ isActive }) =>
            `${navItemBase} ${isActive ? navItemActive : navItemInactive}`
          }
        >
          <span>📈</span> ARR Engine
        </NavLink>

        {/* Assessments */}
        <button
          onClick={() => setToolsOpen(o => !o)}
          className={`${navItemBase} ${navItemInactive} justify-between`}
        >
          <span className="flex items-center gap-2">
            <span>🎯</span> Assessments
          </span>
          <span className="text-slate-400 text-xs">{toolsOpen ? "▾" : "▸"}</span>
        </button>

        {toolsOpen && (
          <div className="ml-4 mt-0.5 space-y-0.5">
            {ASSESSMENT_LINKS.map(a => (
              <NavLink
                key={a.path}
                to={a.path}
                className={({ isActive }) =>
                  `${navItemBase} text-xs ${isActive ? navItemActive : navItemInactive}`
                }
              >
                {a.label}
              </NavLink>
            ))}
          </div>
        )}

        {/* Admin (manager / admin only) */}
        {isAdmin && (
          <>
            <Divider />
            <SectionLabel>Settings</SectionLabel>
            <button
              onClick={() => setAdminOpen(o => !o)}
              className={`${navItemBase} ${navItemInactive} justify-between`}
            >
              <span className="flex items-center gap-2">
                <span>⚙️</span> Admin
              </span>
              <span className="text-slate-400 text-xs">{adminOpen ? "▾" : "▸"}</span>
            </button>
            {adminOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5">
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `${navItemBase} text-xs ${isActive ? navItemActive : navItemInactive}`
                  }
                >
                  Integrations
                </NavLink>
              </div>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 p-3 space-y-1">
        <div className="text-xs text-slate-400 px-2 truncate">
          {profile?.full_name || "Account"}
        </div>
        <button
          onClick={signOut}
          className="w-full text-left text-xs text-slate-500 hover:text-red-500 px-2 py-1 rounded transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg border border-slate-200 shadow"
        onClick={() => setMobileOpen(o => !o)}
      >
        <div className="w-5 h-0.5 bg-slate-600 mb-1" />
        <div className="w-5 h-0.5 bg-slate-600 mb-1" />
        <div className="w-5 h-0.5 bg-slate-600" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 h-screen sticky top-0">
        {inner}
      </aside>

      {/* Mobile sidebar (slide-in) */}
      <aside
        className={`lg:hidden fixed left-0 top-0 z-50 flex flex-col w-64 h-full shadow-xl transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {inner}
      </aside>

      {/* FAB — new review */}
      <button
        onClick={onNewReview}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-5 py-3 bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        + New Review
      </button>
    </>
  );
}

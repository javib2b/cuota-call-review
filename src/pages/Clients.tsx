import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScoreRing } from "../components/ui/ScoreRing";
import { formatMoney, getClientLogo } from "../lib/formatting";
import { getScoreColor, getScoreLabel } from "../lib/scoring";
import type { CallReview } from "../types";

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];
const DEFAULT_PAST = ["Rapido"];

interface Props {
  savedCalls: CallReview[];
  onNewReview: () => void;
}

function getClientStats(calls: CallReview[]) {
  if (!calls.length) return { avg: 0, pipeline: 0, wonArr: 0, reps: 0, callCount: 0 };
  const avg = Math.round(calls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / calls.length);
  const pipeline = calls
    .filter(c => (c.outcome ?? "Still Active") === "Still Active")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);
  const wonArr = calls
    .filter(c => c.outcome === "Won")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);
  const reps = new Set(calls.map(c => c.category_scores?.rep_name).filter(Boolean)).size;
  return { avg, pipeline, wonArr, reps, callCount: calls.length };
}

function getClientTrend(calls: CallReview[]): number | null {
  if (calls.length < 2) return null;
  const sorted = [...calls].sort(
    (a, b) => new Date(b.call_date || "").getTime() - new Date(a.call_date || "").getTime()
  );
  const last = sorted[0].overall_score ?? 0;
  const prevAvg =
    sorted.slice(1, 4).reduce((s, c) => s + (c.overall_score ?? 0), 0) /
    Math.min(sorted.length - 1, 3);
  return Math.round(last - prevAvg);
}

interface ClientCardProps {
  client: string;
  calls: CallReview[];
  past?: boolean;
  onClick: () => void;
}

function ClientCard({ client, calls, past, onClick }: ClientCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = getClientLogo(client);
  const stats = getClientStats(calls);
  const trend = getClientTrend(calls);
  const isEmpty = calls.length === 0;

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-card shadow-card hover:shadow-card-hover cursor-pointer transition-all duration-150 overflow-hidden ${past ? "opacity-60" : ""}`}
    >
      {/* Header bar */}
      <div
        className="h-1"
        style={{ background: isEmpty ? "#E2E8F0" : getScoreColor(stats.avg) }}
      />

      <div className="p-5">
        {/* Logo + name row */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl && !logoFailed ? (
              <img
                src={logoUrl}
                alt={client}
                className="w-8 h-8 object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="text-lg font-black text-slate-500">
                {client.charAt(0)}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 truncate">{client}</div>
            <div className="text-xs text-slate-400">
              {stats.callCount} {stats.callCount === 1 ? "review" : "reviews"} · {stats.reps} reps
            </div>
          </div>
          {!isEmpty && (
            <ScoreRing score={stats.avg} size={44} strokeWidth={4} showLabel={false} />
          )}
        </div>

        {/* Stats */}
        {!isEmpty ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Avg Score</div>
              <div className="text-base font-black tabular-nums" style={{ color: getScoreColor(stats.avg) }}>
                {stats.avg}%
              </div>
              <div className="text-[10px] text-slate-400">{getScoreLabel(stats.avg)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Pipeline</div>
              <div className="text-base font-black tabular-nums text-slate-700">{formatMoney(stats.pipeline)}</div>
              <div className="text-[10px] text-slate-400">active</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-3 text-xs text-slate-400">No reviews yet</div>
        )}

        {/* Trend */}
        {trend !== null && (
          <div className="mt-3 flex items-center gap-1 text-xs font-semibold">
            <span style={{ color: trend > 5 ? "#22C55E" : trend < -5 ? "#EF4444" : "#94A3B8" }}>
              {trend > 5 ? `↑ +${trend}` : trend < -5 ? `↓ ${trend}` : "→ Stable"}
            </span>
            <span className="text-slate-400 font-normal">vs prev calls</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientsPage({ savedCalls, onNewReview }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  // Group calls by client
  const callsByClient: Record<string, CallReview[]> = {};
  savedCalls.forEach(c => {
    const client = c.category_scores?.client || "";
    if (!callsByClient[client]) callsByClient[client] = [];
    callsByClient[client].push(c);
  });

  const activeClients = DEFAULT_CLIENTS.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  );
  const pastClients = DEFAULT_PAST.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  // Summary stats
  const totalCalls = savedCalls.length;
  const allScores = savedCalls.map(c => c.overall_score).filter(Boolean) as number[];
  const avgAll = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;
  const totalReps = new Set(savedCalls.map(c => c.category_scores?.rep_name).filter(Boolean)).size;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Clients</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {DEFAULT_CLIENTS.length} active · {totalCalls} reviews · {avgAll != null ? `${avgAll}% avg` : ""} · {totalReps} reps
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-brand-500 w-48"
          />
          <button
            onClick={onNewReview}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg transition-colors hidden md:block"
          >
            + New Review
          </button>
        </div>
      </div>

      {/* Active clients grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {activeClients.map(client => (
          <ClientCard
            key={client}
            client={client}
            calls={callsByClient[client] || []}
            onClick={() => navigate(`/clients/${encodeURIComponent(client)}`)}
          />
        ))}
        {/* Add client ghost card */}
        <div className="border-2 border-dashed border-slate-200 rounded-card p-5 flex flex-col items-center justify-center gap-2 text-slate-400 cursor-default min-h-[160px]">
          <span className="text-2xl">+</span>
          <span className="text-xs font-medium">Add Client</span>
        </div>
      </div>

      {/* Past clients */}
      {pastClients.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Past Clients</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {pastClients.map(client => (
              <ClientCard
                key={client}
                client={client}
                calls={callsByClient[client] || []}
                past
                onClick={() => navigate(`/clients/${encodeURIComponent(client)}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

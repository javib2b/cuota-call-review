import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KPICard } from "../components/ui/KPICard";
import { ScoreRing } from "../components/ui/ScoreRing";
import { OutcomeBadge, ScoreBadge } from "../components/ui/StatusBadge";
import { formatMoney, shortDate } from "../lib/formatting";
import { getScoreColor } from "../lib/scoring";
import type { CallReview, WorkspaceSettings } from "../types";

interface Props {
  savedCalls: CallReview[];
  clients: string[];
  wsSettings?: WorkspaceSettings;
  onNewReview: () => void;
}

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];

export default function HomePage({ savedCalls, clients, wsSettings, onNewReview }: Props) {
  const navigate = useNavigate();
  const allClients = clients.length > 0 ? clients : DEFAULT_CLIENTS;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
  const startOfQtr = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  const thisMonthCalls = savedCalls.filter(c => new Date(c.call_date || c.created_at || "") >= startOfMonth);

  const recentScores = savedCalls
    .filter(c => new Date(c.call_date || c.created_at || "") >= thirtyDaysAgo)
    .map(c => c.overall_score)
    .filter(Boolean) as number[];

  const prevScores = savedCalls
    .filter(c => {
      const d = new Date(c.call_date || c.created_at || "");
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    })
    .map(c => c.overall_score)
    .filter(Boolean) as number[];

  const avgScore = recentScores.length
    ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
    : null;

  const prevAvgScore = prevScores.length
    ? Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length)
    : null;

  const scoreDelta = avgScore != null && prevAvgScore != null ? avgScore - prevAvgScore : undefined;

  const totalPipeline = savedCalls
    .filter(c => (c.outcome ?? "Still Active") === "Still Active")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);

  const wonARRQtr = savedCalls
    .filter(c => c.outcome === "Won" && new Date(c.close_date || c.call_date || "") >= startOfQtr)
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);

  // Recent calls (last 8)
  const recent = useMemo(
    () =>
      [...savedCalls]
        .sort(
          (a, b) =>
            new Date(b.call_date || b.created_at || "").getTime() -
            new Date(a.call_date || a.created_at || "").getTime()
        )
        .slice(0, 8),
    [savedCalls]
  );

  // Needs attention: clients where avg score < 65 or latest < 50
  const needsAttention = useMemo(() => {
    return allClients
      .map(client => {
        const cc = savedCalls.filter(c => c.category_scores?.client === client);
        if (!cc.length) return null;
        const avg = Math.round(cc.reduce((s, c) => s + (c.overall_score ?? 0), 0) / cc.length);
        const latest = [...cc].sort((a, b) => new Date(b.call_date || "").getTime() - new Date(a.call_date || "").getTime())[0];
        if (avg < 65 || (latest?.overall_score ?? 100) < 50) return { client, avg, latest };
        return null;
      })
      .filter(Boolean) as Array<{ client: string; avg: number; latest: CallReview }>;
  }, [savedCalls, allClients]);

  // ARR gap widget
  const arrGap =
    wsSettings?.arr_goal && wsSettings?.current_arr
      ? wsSettings.arr_goal - wsSettings.current_arr
      : null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your GTM health at a glance.</p>
        </div>
        <button
          onClick={onNewReview}
          className="hidden md:flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg transition-colors"
        >
          + New Review
        </button>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard
          label="Reviews This Month"
          value={thisMonthCalls.length}
          sub={`${savedCalls.length} total`}
          accent="#6366F1"
        />
        <KPICard
          label="Avg Score"
          value={avgScore != null ? `${avgScore}%` : "—"}
          delta={scoreDelta}
          sub="last 30 days"
          accent="#22C55E"
        />
        <KPICard
          label="Active Clients"
          value={allClients.length}
          accent="#F59E0B"
        />
        <KPICard
          label="Total Pipeline"
          value={formatMoney(totalPipeline)}
          sub="active deals"
          accent="#06B6D4"
        />
        <KPICard
          label="Won ARR (QTD)"
          value={formatMoney(wonARRQtr)}
          sub="this quarter"
          accent="#10B981"
        />
      </div>

      {/* ARR Gap widget */}
      {arrGap !== null && (
        <div className="bg-gradient-to-r from-brand-50 to-indigo-50 border border-brand-200 rounded-card p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-500">ARR Gap</div>
            <div className="text-xl font-black text-brand-700">
              {formatMoney(wsSettings?.current_arr)} → {formatMoney(wsSettings?.arr_goal)}
            </div>
            <div className="text-sm text-brand-600 font-medium">
              {formatMoney(arrGap)} gap · needs attention
            </div>
          </div>
          <Link
            to="/arr-engine"
            className="flex-shrink-0 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg transition-colors"
          >
            View Full Revenue Bridge →
          </Link>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Recent calls */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-card shadow-card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">Recent Call Reviews</h2>
            <Link to="/clients" className="text-xs text-brand-500 hover:text-brand-600 font-medium">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2">📞</div>
              <p className="text-sm font-semibold text-slate-600">No reviews yet</p>
              <button
                onClick={onNewReview}
                className="mt-3 px-4 py-1.5 bg-brand-500 text-white text-xs font-bold rounded-lg"
              >
                Start your first review
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recent.map(call => (
                <div
                  key={call.id}
                  onClick={() => navigate(`/clients/${encodeURIComponent(call.category_scores?.client ?? "")}/calls/${call.id}`)}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <ScoreRing score={call.overall_score ?? 0} size={40} strokeWidth={3} showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {call.category_scores?.client && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {call.category_scores.client}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-700 truncate">
                        {call.category_scores?.rep_name || "Unknown Rep"}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500">{call.prospect_company || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">{call.call_type}</span>
                      {call.deal_value ? (
                        <span className="text-[10px] text-slate-400">{formatMoney(call.deal_value)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <OutcomeBadge outcome={call.outcome} size="sm" />
                    <span className="text-xs text-slate-400">{shortDate(call.call_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Needs attention */}
        <div className="bg-white border border-slate-200 rounded-card shadow-card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-700">Needs Attention</h2>
          </div>
          {needsAttention.length === 0 ? (
            <div className="py-10 text-center px-4">
              <div className="text-2xl mb-2">🎉</div>
              <p className="text-sm font-semibold text-slate-600">All clients performing well</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {needsAttention.map(({ client, avg }) => (
                <div key={client} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-700">{client}</span>
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{ color: getScoreColor(avg) }}
                    >
                      {avg}%
                    </span>
                  </div>
                  <ScoreBadge score={avg} size="sm" />
                  <Link
                    to={`/clients/${encodeURIComponent(client)}`}
                    className="block mt-2 text-xs text-brand-500 hover:text-brand-600 font-medium"
                  >
                    View client →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

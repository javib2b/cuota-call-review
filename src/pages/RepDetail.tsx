import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ScoreRing } from "../components/ui/ScoreRing";
import { ScoreBadge, OutcomeBadge, RepTypeBadge } from "../components/ui/StatusBadge";
import { KPICard } from "../components/ui/KPICard";
import { formatMoney, shortDate } from "../lib/formatting";
import { getScoreColor, getCategories } from "../lib/scoring";
import { useAuth } from "../lib/auth";
import type { CallReview } from "../types";

interface Props {
  savedCalls: CallReview[];
}

export default function RepDetailPage({ savedCalls }: Props) {
  const { clientId, repId } = useParams<{ clientId: string; repId: string }>();
  const navigate = useNavigate();
  const { getValidToken, apiKey } = useAuth();
  const [coachingBullets, setCoachingBullets] = useState<string[]>([]);
  const [coaching, setCoaching] = useState(false);
  const [coachError, setCoachError] = useState("");

  const client = decodeURIComponent(clientId ?? "");
  const repName = decodeURIComponent(repId ?? "");

  const repCalls = savedCalls.filter(
    c => c.category_scores?.client === client && c.category_scores?.rep_name === repName
  );

  const isSdr = repCalls.some(c => c.category_scores?.rep_type === "SDR");
  const repType = isSdr ? "SDR" as const : "AE" as const;
  const cats = getCategories(repType);

  const sorted = [...repCalls].sort(
    (a, b) => new Date(a.call_date || "").getTime() - new Date(b.call_date || "").getTime()
  );

  const avg = repCalls.length
    ? Math.round(repCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / repCalls.length)
    : 0;

  const delta =
    sorted.length >= 2
      ? Math.round((sorted[sorted.length - 1].overall_score ?? 0) - (sorted[0].overall_score ?? 0))
      : null;

  const pipeline = repCalls
    .filter(c => (c.outcome ?? "Still Active") === "Still Active")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);

  const wonArr = repCalls
    .filter(c => c.outcome === "Won")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);

  const closed = repCalls.filter(c => c.outcome === "Won" || c.outcome === "Lost");
  const winRate = closed.length > 0
    ? Math.round((closed.filter(c => c.outcome === "Won").length / closed.length) * 100)
    : null;

  // Category averages
  const catAvgs: Record<string, { name: string; avg: number }> = {};
  cats.forEach(cat => {
    let total = 0, count = 0;
    repCalls.forEach(c => {
      const s = (c.category_scores as Record<string, { score?: number } | undefined>)?.[cat.id];
      if (s && typeof s.score === "number") { total += s.score; count++; }
    });
    if (count > 0) catAvgs[cat.id] = { name: cat.name, avg: Math.round(total / count) };
  });

  const sortedCats = Object.values(catAvgs).sort((a, b) => a.avg - b.avg);
  const weaknesses = sortedCats.slice(0, 3);
  const strengths = sortedCats.slice(-3).reverse();

  // Chart data
  const chartData = sorted.map(c => ({
    date: shortDate(c.call_date),
    score: c.overall_score ?? 0,
  }));

  async function generateCoaching() {
    setCoaching(true); setCoachError(""); setCoachingBullets([]);
    try {
      const t = await getValidToken();
      if (!t) throw new Error("Session expired");
      const coachingCalls = sorted.slice(-5).map(c => ({
        date: c.call_date ?? "",
        score: c.overall_score ?? 0,
        weaknesses: weaknesses.map(w => w.name),
      }));
      const res = await fetch("/api/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ repName, calls: coachingCalls, apiKey: apiKey || undefined }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { bullets?: string[] };
      setCoachingBullets(data.bullets ?? []);
    } catch (e) {
      setCoachError((e as Error).message);
    } finally {
      setCoaching(false);
    }
  }

  if (!repCalls.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 text-center">
        <div className="text-4xl mb-3">👤</div>
        <h2 className="text-lg font-bold text-slate-700 mb-2">{repName}</h2>
        <p className="text-sm text-slate-400">No call reviews found for this rep.</p>
        <Link to={`/clients/${encodeURIComponent(client)}`} className="mt-4 inline-block text-sm text-brand-500 font-medium">
          ← Back to {client}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link to="/clients" className="hover:text-slate-600">Clients</Link>
        <span>›</span>
        <Link to={`/clients/${encodeURIComponent(client)}`} className="hover:text-slate-600">{client}</Link>
        <span>›</span>
        <span className="text-slate-600 font-medium">{repName}</span>
      </div>

      {/* Rep header */}
      <div className="bg-white border border-slate-200 rounded-card shadow-card p-6">
        <div className="flex items-center gap-4 mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0"
            style={{ background: getScoreColor(avg) }}
          >
            {repName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-800">{repName}</h1>
              <RepTypeBadge type={repType} />
            </div>
            <div className="text-sm text-slate-500 mt-0.5">
              {client} · {repCalls.length} reviews
            </div>
          </div>
          <div className="ml-auto text-center">
            <ScoreRing score={avg} size={64} strokeWidth={5} />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Avg Score" value={`${avg}%`} delta={delta ?? undefined} accent="#6366F1" />
          <KPICard label="Pipeline" value={formatMoney(pipeline)} accent="#06B6D4" />
          <KPICard label="Won ARR" value={formatMoney(wonArr)} accent="#22C55E" />
          <KPICard label="Win Rate" value={winRate != null ? `${winRate}%` : "—"} sub={`${closed.length} closed`} accent="#F59E0B" />
        </div>
      </div>

      {/* Score progression chart */}
      {chartData.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-card shadow-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Score Progression</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, "Score"]}
              />
              <ReferenceLine y={75} stroke="#22C55E" strokeDasharray="3 3" opacity={0.4} />
              <ReferenceLine y={50} stroke="#F97316" strokeDasharray="3 3" opacity={0.4} />
              <Line type="monotone" dataKey="score" stroke="#6366F1" strokeWidth={2} dot={{ fill: "#6366F1", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Strengths / Weaknesses */}
      {sortedCats.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-card shadow-card p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-green-600 mb-3">Top Strengths</h3>
            {strengths.map(s => (
              <div key={s.name} className="flex items-center gap-3 mb-2.5">
                <div className="w-28 text-xs text-slate-500 flex-shrink-0 truncate">{s.name}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full">
                  <div className="h-full rounded-full bg-green-400" style={{ width: `${(s.avg / 10) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-green-600 tabular-nums">{s.avg}</span>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-card shadow-card p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-3">Coaching Focus</h3>
            {weaknesses.map(w => (
              <div key={w.name} className="flex items-center gap-3 mb-2.5">
                <div className="w-28 text-xs text-slate-500 flex-shrink-0 truncate">{w.name}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(w.avg / 10) * 100}%`, background: w.avg < 4 ? "#EF4444" : "#F97316" }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums" style={{ color: w.avg < 4 ? "#EF4444" : "#F97316" }}>
                  {w.avg}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coach This Rep */}
      <div className="bg-white border border-slate-200 rounded-card shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700">AI Coaching Plan</h3>
            <p className="text-xs text-slate-400 mt-0.5">Personalized 3-bullet coaching plan based on score patterns.</p>
          </div>
          <button
            onClick={generateCoaching}
            disabled={coaching}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {coaching ? <><span className="animate-spin">⟳</span> Generating…</> : "✦ Coach This Rep"}
          </button>
        </div>
        {coachError && <div className="text-sm text-red-500 mb-2">{coachError}</div>}
        {coachingBullets.length > 0 ? (
          <ul className="space-y-3">
            {coachingBullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-xs font-bold flex-shrink-0 flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed">{b}</p>
              </li>
            ))}
          </ul>
        ) : (
          !coaching && (
            <p className="text-sm text-slate-400">Click "Coach This Rep" to generate a personalized coaching plan.</p>
          )
        )}
      </div>

      {/* Call history */}
      <div className="bg-white border border-slate-200 rounded-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">Call History</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {[...sorted].reverse().map(call => (
            <div
              key={call.id}
              onClick={() => navigate(`/clients/${encodeURIComponent(client)}/calls/${call.id}`)}
              className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <ScoreRing score={call.overall_score ?? 0} size={36} strokeWidth={3} showLabel={false} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-700 truncate">
                  {call.prospect_company || "Unknown Company"}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{call.call_type}</span>
                  {call.deal_value ? <><span>·</span><span>{formatMoney(call.deal_value)}</span></> : null}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <OutcomeBadge outcome={call.outcome} size="sm" />
                <ScoreBadge score={call.overall_score ?? 0} size="sm" />
                <span className="text-xs text-slate-400">{shortDate(call.call_date)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

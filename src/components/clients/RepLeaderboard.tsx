import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ScoreRing } from "../ui/ScoreRing";
import { RepTypeBadge } from "../ui/StatusBadge";
import { formatMoney } from "../../lib/formatting";
import { getScoreColor, getCategories } from "../../lib/scoring";
import type { CallReview } from "../../types";

interface RepEntry {
  repName: string;
  repType: "AE" | "SDR";
  calls: CallReview[];
  avg: number;
  trend: number | null;
  pipeline: number;
  wonArr: number;
  winRate: number | null;
  topWeakness: string | null;
  lastCallDate: string | null;
}

function buildRepEntries(calls: CallReview[], client: string): RepEntry[] {
  const byRep: Record<string, CallReview[]> = {};
  calls
    .filter(c => c.category_scores?.client === client)
    .forEach(c => {
      const name = c.category_scores?.rep_name || "Unknown";
      if (!byRep[name]) byRep[name] = [];
      byRep[name].push(c);
    });

  return Object.entries(byRep).map(([repName, repCalls]) => {
    const sorted = [...repCalls].sort(
      (a, b) => new Date(a.call_date || "").getTime() - new Date(b.call_date || "").getTime()
    );
    const avg = Math.round(repCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / repCalls.length);
    const trend =
      sorted.length >= 2
        ? Math.round(
            (sorted[sorted.length - 1].overall_score ?? 0) -
            (sorted[sorted.length - 2].overall_score ?? 0)
          )
        : null;
    const isSdr = repCalls.some(c => c.category_scores?.rep_type === "SDR");
    const repType: "AE" | "SDR" = isSdr ? "SDR" : "AE";

    // Category weakness
    const cats = getCategories(repType);
    const catAvgs: Record<string, { name: string; avg: number }> = {};
    cats.forEach(cat => {
      let total = 0, count = 0;
      repCalls.forEach(c => {
        const s = (c.category_scores as Record<string, { score?: number } | undefined>)?.[cat.id];
        if (s && typeof s.score === "number") { total += s.score; count++; }
      });
      if (count > 0) catAvgs[cat.id] = { name: cat.name, avg: Math.round(total / count) };
    });
    const sorted_cats = Object.values(catAvgs).sort((a, b) => a.avg - b.avg);
    const topWeakness = sorted_cats[0]?.name ?? null;

    const pipeline = repCalls
      .filter(c => (c.outcome ?? "Still Active") === "Still Active")
      .reduce((s, c) => s + (c.deal_value ?? 0), 0);
    const wonArr = repCalls
      .filter(c => c.outcome === "Won")
      .reduce((s, c) => s + (c.deal_value ?? 0), 0);
    const closed = repCalls.filter(c => c.outcome === "Won" || c.outcome === "Lost");
    const winRate =
      closed.length > 0 ? Math.round((closed.filter(c => c.outcome === "Won").length / closed.length) * 100) : null;

    const lastCallDate =
      sorted.length > 0 ? sorted[sorted.length - 1].call_date ?? null : null;

    return { repName, repType, calls: repCalls, avg, trend, pipeline, wonArr, winRate, topWeakness, lastCallDate };
  }).sort((a, b) => b.avg - a.avg);
}

type SortKey = "avg" | "calls" | "pipeline" | "won" | "winRate";

interface Props {
  calls: CallReview[];
  client: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function RepLeaderboard({ calls, client }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("avg");
  const [sortAsc, setSortAsc] = useState(false);

  const entries = useMemo(() => buildRepEntries(calls, client), [calls, client]);

  const filtered = useMemo(() => {
    let list = search
      ? entries.filter(e => e.repName.toLowerCase().includes(search.toLowerCase()))
      : entries;
    list = [...list].sort((a, b) => {
      const factor = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "avg": return (a.avg - b.avg) * factor;
        case "calls": return (a.calls.length - b.calls.length) * factor;
        case "pipeline": return (a.pipeline - b.pipeline) * factor;
        case "won": return (a.wonArr - b.wonArr) * factor;
        case "winRate": return ((a.winRate ?? -1) - (b.winRate ?? -1)) * factor;
        default: return 0;
      }
    });
    return list;
  }, [entries, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    return (
      <th
        className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
        onClick={() => toggleSort(k)}
      >
        {label} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (!entries.length) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">👥</div>
        <p className="text-sm font-semibold text-slate-600 mb-1">No reps reviewed yet</p>
        <p className="text-xs text-slate-400">Start adding call reviews to see rep performance here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search reps…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-brand-500 w-48"
        />
        <span className="text-xs text-slate-400">{filtered.length} reps</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-card overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 w-10">#</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Rep</th>
                <SortHeader k="avg" label="Avg Score" />
                <SortHeader k="calls" label="Calls" />
                <SortHeader k="pipeline" label="Pipeline" />
                <SortHeader k="won" label="Won ARR" />
                <SortHeader k="winRate" label="Win Rate" />
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Top Gap</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((rep, idx) => (
                <tr
                  key={rep.repName}
                  className={`border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${idx % 2 === 1 ? "bg-slate-50/40" : ""}`}
                  onClick={() => navigate(`/clients/${encodeURIComponent(client)}/reps/${encodeURIComponent(rep.repName)}`)}
                >
                  <td className="px-4 py-3 text-slate-400 text-sm">
                    {MEDALS[idx] ?? <span className="font-mono text-xs">{idx + 1}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: getScoreColor(rep.avg) }}
                      >
                        {rep.repName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700">{rep.repName}</div>
                        <RepTypeBadge type={rep.repType} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ScoreRing score={rep.avg} size={32} strokeWidth={3} showLabel={false} />
                      <div>
                        <span className="font-bold tabular-nums text-sm" style={{ color: getScoreColor(rep.avg) }}>
                          {rep.avg}%
                        </span>
                        {rep.trend !== null && (
                          <span
                            className="ml-1 text-[10px] font-semibold"
                            style={{ color: rep.trend > 0 ? "#22C55E" : rep.trend < 0 ? "#EF4444" : "#94A3B8" }}
                          >
                            {rep.trend > 0 ? `+${rep.trend}` : rep.trend}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* mini progress bar */}
                    <div className="mt-1 h-1 bg-slate-100 rounded-full w-24">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${rep.avg}%`, background: getScoreColor(rep.avg) }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{rep.calls.length}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{formatMoney(rep.pipeline)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{formatMoney(rep.wonArr)}</td>
                  <td className="px-4 py-3">
                    {rep.winRate !== null ? (
                      <span className="tabular-nums text-slate-600">{rep.winRate}%</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {rep.topWeakness ? (
                      <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {rep.topWeakness}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-brand-500 font-medium">Details →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

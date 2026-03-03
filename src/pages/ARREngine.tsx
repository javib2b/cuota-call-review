import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { formatMoney, monthsUntil, shortDate } from "../lib/formatting";
import { KPICard } from "../components/ui/KPICard";
import type { WorkspaceSettings, CallReview, GapAnalysis } from "../types";

const DEFAULT_SETTINGS: Omit<WorkspaceSettings, "id" | "org_id"> = {
  current_arr: undefined,
  arr_goal: undefined,
  target_date: undefined,
  avg_deal_size_override: undefined,
  avg_win_rate: undefined,
  avg_sales_cycle_days: undefined,
};

function InputField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  type = "number",
  placeholder,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-50">
        {prefix && (
          <span className="px-3 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 h-full flex items-center self-stretch">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 text-sm text-slate-800 bg-transparent outline-none"
        />
        {suffix && (
          <span className="px-3 text-sm text-slate-400 bg-slate-50 border-l border-slate-200 self-stretch flex items-center">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function GapCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-card border p-4 ${highlight ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200"}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${highlight ? "text-brand-600" : "text-slate-800"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ARREnginePage() {
  const { profile, getValidToken, apiKey } = useAuth();
  const [settings, setSettings] = useState<WorkspaceSettings>({
    org_id: profile?.org_id ?? "",
    ...DEFAULT_SETTINGS,
  });
  const [calls, setCalls] = useState<CallReview[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [bullets, setBullets] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Load workspace settings + call reviews
  useEffect(() => {
    async function load() {
      const t = await getValidToken();
      if (!t) return;
      try {
        const [wsRows, callRows] = await Promise.all([
          supabase.table("workspace_settings", t).selectWhere<WorkspaceSettings>(
            "*",
            `org_id=eq.${profile?.org_id}`
          ),
          supabase.table("call_reviews", t).selectWhere<CallReview>(
            "overall_score,deal_value,outcome,category_scores",
            `org_id=eq.${profile?.org_id}`
          ),
        ]);
        if (wsRows.length > 0) setSettings(wsRows[0]);
        setCalls(callRows);
      } catch { /* first visit */ }
    }
    load();
  }, [getValidToken, profile]);

  // Compute derived defaults from real call data
  const derivedDealSize = useMemo(() => {
    const withValue = calls.filter(c => c.deal_value && c.deal_value > 0);
    if (!withValue.length) return null;
    return Math.round(withValue.reduce((s, c) => s + (c.deal_value ?? 0), 0) / withValue.length);
  }, [calls]);

  const derivedWinRate = useMemo(() => {
    const closed = calls.filter(c => c.outcome === "Won" || c.outcome === "Lost");
    if (!closed.length) return null;
    const won = closed.filter(c => c.outcome === "Won").length;
    return Math.round((won / closed.length) * 100);
  }, [calls]);

  const avgDealSize = settings.avg_deal_size_override ?? derivedDealSize ?? 50000;
  const winRate = (settings.avg_win_rate ?? derivedWinRate ?? 25) / 100;

  // Gap analysis
  const gap: GapAnalysis = useMemo(() => {
    const arrGap = Math.max(0, (settings.arr_goal ?? 0) - (settings.current_arr ?? 0));
    const dealsNeeded = avgDealSize > 0 ? Math.ceil(arrGap / avgDealSize) : 0;
    const pipelineNeeded = winRate > 0 ? Math.round((dealsNeeded / winRate) * avgDealSize) : 0;
    const monthsRemaining = monthsUntil(settings.target_date);
    const dealsPerMonth = monthsRemaining > 0 ? Math.ceil(dealsNeeded / monthsRemaining) : dealsNeeded;
    // Assume one AE closes 2 deals/month at this deal size
    const dealsPerAE = 2;
    const aesNeeded = Math.ceil(dealsPerMonth / dealsPerAE);
    return { arrGap, dealsNeeded, pipelineNeeded, monthsRemaining, dealsPerMonth, aesNeeded };
  }, [settings, avgDealSize, winRate]);

  const avgScore = useMemo(() => {
    const s = calls.map(c => c.overall_score).filter(Boolean);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
  }, [calls]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const t = await getValidToken();
      if (!t) throw new Error("Session expired");
      const data = { ...settings, org_id: profile?.org_id ?? "", updated_at: new Date().toISOString() };
      if (settings.id) {
        await supabase.table("workspace_settings", t).update(data, `id=eq.${settings.id}`);
      } else {
        const rows = await supabase.table("workspace_settings", t).insert<WorkspaceSettings>(data);
        if (rows[0]) setSettings(rows[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setError("");
    setBullets([]);
    try {
      const t = await getValidToken();
      if (!t) throw new Error("Session expired");
      const context = {
        current_arr: settings.current_arr,
        arr_goal: settings.arr_goal,
        target_date: settings.target_date,
        arr_gap: gap.arrGap,
        deals_needed: gap.dealsNeeded,
        pipeline_needed: gap.pipelineNeeded,
        months_remaining: gap.monthsRemaining,
        deals_per_month: gap.dealsPerMonth,
        aes_needed: gap.aesNeeded,
        avg_deal_size: avgDealSize,
        win_rate_pct: Math.round(winRate * 100),
        avg_score_pct: avgScore,
        total_reviews: calls.length,
      };
      const res = await fetch("/api/revenue-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ context, apiKey: apiKey || undefined }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { bullets?: string[] };
      setBullets(data.bullets ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function field<K extends keyof WorkspaceSettings>(key: K) {
    return {
      value: settings[key] as string | number | undefined,
      onChange: (v: string) =>
        setSettings(p => ({
          ...p,
          [key]: v === "" ? undefined : key === "target_date" ? v : Number(v),
        })),
    };
  }

  const hasGoal = (settings.current_arr ?? 0) > 0 && (settings.arr_goal ?? 0) > 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">ARR Engine</h1>
        <p className="text-sm text-slate-500 mt-1">
          Model your revenue gap, pipeline requirements, and hiring needs.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Revenue Snapshot */}
      <section className="bg-white border border-slate-200 rounded-card p-6 shadow-card">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-5">
          Revenue Snapshot
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InputField label="Current ARR" prefix="$" placeholder="0" {...field("current_arr")} />
          <InputField label="ARR Goal" prefix="$" placeholder="0" {...field("arr_goal")} />
          <InputField
            label="Target Date"
            type="date"
            placeholder=""
            {...field("target_date")}
            onChange={v => setSettings(p => ({ ...p, target_date: v || undefined }))}
            value={settings.target_date ?? ""}
          />
          <InputField
            label={`Avg Deal Size${derivedDealSize ? ` (auto: ${formatMoney(derivedDealSize)})` : ""}`}
            prefix="$"
            placeholder={derivedDealSize ? String(derivedDealSize) : "50000"}
            {...field("avg_deal_size_override")}
          />
          <InputField
            label={`Win Rate${derivedWinRate ? ` (auto: ${derivedWinRate}%)` : ""}`}
            suffix="%"
            placeholder={derivedWinRate ? String(derivedWinRate) : "25"}
            {...field("avg_win_rate")}
          />
          <InputField
            label="Avg Sales Cycle"
            suffix="days"
            placeholder="90"
            {...field("avg_sales_cycle_days")}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-5 px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </section>

      {/* Gap Analysis */}
      {hasGoal && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
            Gap Analysis
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <GapCard label="ARR Gap" value={formatMoney(gap.arrGap)} sub="Goal − Current" highlight />
            <GapCard label="Deals Needed" value={String(gap.dealsNeeded)} sub={`at ${formatMoney(avgDealSize)} avg`} />
            <GapCard
              label="Pipeline Needed"
              value={formatMoney(gap.pipelineNeeded)}
              sub={`at ${Math.round(winRate * 100)}% win rate`}
            />
            <GapCard
              label="Months Remaining"
              value={gap.monthsRemaining > 0 ? String(gap.monthsRemaining) : "—"}
              sub={settings.target_date ? shortDate(settings.target_date, true) : "No target date set"}
            />
            <GapCard
              label="Deals / Month"
              value={gap.monthsRemaining > 0 ? String(gap.dealsPerMonth) : "—"}
              sub="Required run rate"
            />
            <GapCard
              label="AEs Needed"
              value={gap.monthsRemaining > 0 ? String(gap.aesNeeded) : "—"}
              sub="At 2 deals / AE / month"
            />
          </div>

          {/* Mini KPI strip */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <KPICard
              label="Current ARR"
              value={formatMoney(settings.current_arr)}
              accent="#6366F1"
            />
            <KPICard
              label="ARR Goal"
              value={formatMoney(settings.arr_goal)}
              accent="#22C55E"
            />
            <KPICard
              label="Avg Call Score"
              value={avgScore != null ? `${avgScore}%` : "—"}
              sub={`across ${calls.length} reviews`}
              accent="#F97316"
            />
          </div>
        </section>
      )}

      {/* Revenue Bridge Plan */}
      <section className="bg-white border border-slate-200 rounded-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
              What Has to Be True
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              AI-generated revenue bridge plan based on your numbers.
            </p>
          </div>
          <button
            onClick={generatePlan}
            disabled={generating || !hasGoal}
            className="flex-shrink-0 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {generating ? (
              <><span className="animate-spin">⟳</span> Generating…</>
            ) : (
              "✦ Generate Revenue Bridge Plan"
            )}
          </button>
        </div>

        {bullets.length > 0 ? (
          <ul className="space-y-3">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-xs font-bold flex-shrink-0 flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed">{b}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <div className="text-3xl mb-2">📊</div>
            <p className="text-sm font-medium">Set your ARR goal and target date, then generate your revenue bridge plan.</p>
          </div>
        )}
      </section>
    </div>
  );
}

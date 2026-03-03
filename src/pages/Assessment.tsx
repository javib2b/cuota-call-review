import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { shortDate } from "../lib/formatting";
import { getScoreColor } from "../lib/scoring";
import { ScoreRing } from "../components/ui/ScoreRing";
import { ScoreBadge } from "../components/ui/StatusBadge";
import type { ClientAssessment, AssessmentType } from "../types";

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];

interface AssessmentConfig {
  type: AssessmentType;
  label: string;
  description: string;
  questions: Array<{ key: string; label: string; placeholder?: string; multiline?: boolean }>;
}

const ASSESSMENT_CONFIGS: Record<string, AssessmentConfig> = {
  "gtm-strategy": {
    type: "gtm_strategy",
    label: "GTM Strategy",
    description: "Evaluate the client's go-to-market strategy, ICP definition, and competitive positioning.",
    questions: [
      { key: "icp", label: "Who is your ICP?", placeholder: "Industry, company size, title, pain points", multiline: true },
      { key: "differentiation", label: "What's your primary differentiation vs. top 3 competitors?", multiline: true },
      { key: "channels", label: "Which channels are you currently selling through?", placeholder: "Direct, partner, inbound, outbound…" },
      { key: "outbound_strategy", label: "What's your documented outbound strategy?", multiline: true },
    ],
  },
  "top-of-funnel": {
    type: "top_of_funnel",
    label: "Top of Funnel",
    description: "Assess lead generation, brand awareness, and outbound effectiveness.",
    questions: [
      { key: "leads_per_week", label: "How many net new leads/week is the team generating?", placeholder: "e.g. 20 leads/week" },
      { key: "reply_rate", label: "What's your outbound reply rate?", placeholder: "e.g. 4%" },
      { key: "best_sources", label: "What lead sources are converting best?", multiline: true },
      { key: "lead_to_opp", label: "How long does it take a lead to become an opportunity?", placeholder: "e.g. 14 days" },
    ],
  },
  revops: {
    type: "revops",
    label: "RevOps",
    description: "Evaluate CRM hygiene, pipeline management, and forecast accuracy.",
    questions: [
      { key: "crm", label: "What CRM are you using and how clean is the data?", placeholder: "CRM name + data quality 1–10" },
      { key: "pipeline_stages", label: "Do you have documented pipeline stage definitions?", placeholder: "Yes/No + describe" },
      { key: "forecast_accuracy", label: "How accurate are your quarterly forecasts?", placeholder: "e.g. ±15%" },
      { key: "coverage_ratio", label: "What's your current pipeline coverage ratio?", placeholder: "e.g. 3x" },
    ],
  },
  hiring: {
    type: "hiring",
    label: "Sales Hiring",
    description: "Assess the interview process, onboarding structure, and success criteria.",
    questions: [
      { key: "interview_process", label: "Describe your current AE interview process.", multiline: true },
      { key: "scorecards", label: "Do you use structured scorecards for hiring?", placeholder: "Yes/No + describe" },
      { key: "onboarding", label: "What does your onboarding process look like?", multiline: true },
      { key: "ramp_plan", label: "Do you have a 30/60/90 plan template?", placeholder: "Yes/No + describe" },
    ],
  },
  metrics: {
    type: "metrics",
    label: "Metrics & Benchmarks",
    description: "Review key sales performance metrics against industry benchmarks.",
    questions: [
      { key: "quota_attainment", label: "What % of AEs are hitting quota?", placeholder: "e.g. 65%" },
      { key: "pipeline_coverage", label: "What is your current pipeline coverage ratio?", placeholder: "e.g. 3.5x" },
      { key: "win_rate", label: "What is your win rate from opportunity to close?", placeholder: "e.g. 22%" },
      { key: "ramp_time", label: "What's your average ramp time for new AEs?", placeholder: "e.g. 4 months" },
    ],
  },
};

export default function AssessmentPage() {
  const { assessmentType } = useParams<{ assessmentType: string }>();
  const [searchParams] = useSearchParams();
  const { profile, getValidToken, apiKey } = useAuth();
  const navigate = useNavigate();

  const config = ASSESSMENT_CONFIGS[assessmentType ?? ""] ?? null;
  const [client, setClient] = useState(searchParams.get("client") ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<ClientAssessment[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ score: number; narrative: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client || !config) return;
    async function loadHistory() {
      const t = await getValidToken();
      if (!t) return;
      try {
        const rows = await supabase
          .table("client_assessments", t)
          .selectWhere<ClientAssessment>(
            "*",
            `org_id=eq.${profile?.org_id}&client_id=eq.${encodeURIComponent(client)}&assessment_type=eq.${config!.type}&order=assessed_at.desc`
          );
        setHistory(rows);
      } catch { /* first use */ }
    }
    loadHistory();
  }, [client, config, getValidToken, profile]);

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h1 className="text-xl font-bold text-slate-700">Assessment not found</h1>
      </div>
    );
  }

  async function runAssessment() {
    if (!client) { setError("Select a client first."); return; }
    const missing = config!.questions.filter(q => !answers[q.key]?.trim());
    if (missing.length > 2) { setError("Fill in at least 2 questions before running the assessment."); return; }
    setRunning(true); setError(""); setResult(null);
    try {
      const t = await getValidToken();
      if (!t) throw new Error("Session expired");
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ assessmentType: config!.type, client, answers, apiKey: apiKey || undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Assessment failed");
      }
      const data = await res.json() as { score: number; narrative: string };
      setResult(data);

      // Save to DB
      await supabase.table("client_assessments", t).insert({
        org_id: profile?.org_id ?? "00000000-0000-0000-0000-000000000001",
        client_id: client,
        assessment_type: config!.type,
        answers,
        score: data.score,
        ai_narrative: data.narrative,
        assessed_at: new Date().toISOString(),
      });

      // Refresh history
      const rows = await supabase
        .table("client_assessments", t)
        .selectWhere<ClientAssessment>(
          "*",
          `org_id=eq.${profile?.org_id}&client_id=eq.${encodeURIComponent(client)}&assessment_type=eq.${config!.type}&order=assessed_at.desc`
        );
      setHistory(rows);
    } catch (e) {
      setError("Assessment failed: " + (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Assessment</div>
        <h1 className="text-2xl font-black text-slate-800">{config.label}</h1>
        <p className="text-sm text-slate-500 mt-1">{config.description}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Client selector */}
      <div className="bg-white border border-slate-200 rounded-card shadow-card p-5">
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Client</label>
          <select
            value={client}
            onChange={e => setClient(e.target.value)}
            className="w-full max-w-xs text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-brand-500"
          >
            <option value="">Select a client…</option>
            {DEFAULT_CLIENTS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {config.questions.map(q => (
            <div key={q.key}>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{q.label}</label>
              {q.multiline ? (
                <textarea
                  value={answers[q.key] ?? ""}
                  onChange={e => setAnswers(p => ({ ...p, [q.key]: e.target.value }))}
                  placeholder={q.placeholder}
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-brand-500 resize-y"
                />
              ) : (
                <input
                  type="text"
                  value={answers[q.key] ?? ""}
                  onChange={e => setAnswers(p => ({ ...p, [q.key]: e.target.value }))}
                  placeholder={q.placeholder}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-brand-500"
                />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={runAssessment}
          disabled={running || !client}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {running ? (
            <><span className="animate-spin">⟳</span> Running Assessment…</>
          ) : (
            "✦ Run Assessment"
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-card shadow-card p-5">
          <div className="flex items-center gap-4 mb-4">
            <ScoreRing score={result.score} size={72} strokeWidth={6} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Assessment Result</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: getScoreColor(result.score) }}>
                {result.score}/100
              </div>
              <ScoreBadge score={result.score} />
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            <p className="text-sm text-slate-700 leading-relaxed">{result.narrative}</p>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-card shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700">Assessment History</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map(h => (
              <div key={h.id} className="px-5 py-3 flex items-center gap-3">
                <ScoreRing score={h.score ?? 0} size={36} strokeWidth={3} showLabel={false} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-700">{h.client_id}</div>
                  <div className="text-xs text-slate-400">{shortDate(h.assessed_at, true)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black tabular-nums" style={{ color: getScoreColor(h.score ?? 0) }}>
                    {h.score}
                  </span>
                  <ScoreBadge score={h.score ?? 0} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ScoreRing } from "../components/ui/ScoreRing";
import { ScoreBar } from "../components/ui/ScoreBar";
import { ScoreBadge, OutcomeBadge, RepTypeBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { getCategories, computeOverallScore } from "../lib/scoring";
import { shortDate } from "../lib/formatting";
import type { CallReview as CallReviewType, CallScores, AIInsights, RepType, CallType, DealStage, CallOutcome } from "../types";

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];

interface Props {
  existingCall?: CallReviewType;
  defaultClient?: string;
  onSaved: (call: CallReviewType) => void;
  onCancel: () => void;
}

const TABS = ["Transcript", "Scorecard", "AI Insights", "Notes"] as const;
type Tab = typeof TABS[number];

// ── Risk indicator row ─────────────────────────────────────────────────────
function RiskRow({ label, data }: { label: string; data: { flagged: boolean; details: string } }) {
  return (
    <div
      className={`flex gap-3 p-3 rounded-lg ${data.flagged ? "bg-red-50" : "bg-green-50"}`}
    >
      <span className="text-base flex-shrink-0 mt-0.5">{data.flagged ? "⚠️" : "✅"}</span>
      <div>
        <div className={`text-xs font-bold ${data.flagged ? "text-red-700" : "text-green-700"}`}>{label}</div>
        <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{data.details}</div>
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function AnalysisSkeleton({ wordCount }: { wordCount: number }) {
  return (
    <div className="space-y-3 mt-4">
      <div className="text-sm text-slate-500 font-medium">
        Analyzing {wordCount.toLocaleString()} words…
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: `${80 - i * 10}%` }} />
      ))}
    </div>
  );
}

export default function CallReviewPage({ existingCall, defaultClient, onSaved, onCancel }: Props) {
  const { getValidToken, profile, apiKey } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>(existingCall ? "Scorecard" : "Transcript");

  // Form state
  const [client, setClient] = useState(existingCall?.category_scores?.client ?? defaultClient ?? "");
  const [repName, setRepName] = useState(existingCall?.category_scores?.rep_name ?? "");
  const [repType, setRepType] = useState<RepType>(existingCall?.category_scores?.rep_type ?? "AE");
  const [prospectCompany, setProspectCompany] = useState(existingCall?.prospect_company ?? "");
  const [callDate, setCallDate] = useState(existingCall?.call_date ?? new Date().toISOString().split("T")[0]);
  const [callType, setCallType] = useState<CallType>(existingCall?.call_type ?? "Discovery");
  const [dealStage, setDealStage] = useState<DealStage>(existingCall?.deal_stage ?? "Early");
  const [dealValue, setDealValue] = useState(String(existingCall?.deal_value ?? ""));
  const [outcome, setOutcome] = useState<CallOutcome>(existingCall?.outcome ?? "Still Active");
  const [closeDate, setCloseDate] = useState(existingCall?.close_date ?? "");
  const [callDuration, setCallDuration] = useState(String(existingCall?.call_duration_minutes ?? ""));
  const [nextMeeting, setNextMeeting] = useState(existingCall?.next_meeting_scheduled ?? false);
  const [nextMeetingDate, setNextMeetingDate] = useState(existingCall?.next_meeting_date ?? "");

  // Transcript / scores / AI
  const [transcript, setTranscript] = useState(existingCall?.transcript ?? "");
  const [scores, setScores] = useState<CallScores>(() => {
    if (!existingCall?.category_scores) return {};
    const { rep_name, client: c, rep_type, prospect_name, ...rest } = existingCall.category_scores;
    void rep_name; void c; void rep_type; void prospect_name;
    return rest as CallScores;
  });
  const [aiAnalysis, setAiAnalysis] = useState<AIInsights | null>(existingCall?.ai_analysis ?? null);
  const [notes, setNotes] = useState(existingCall?.coaching_notes ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const cats = getCategories(repType);
  const overallScore = computeOverallScore(scores, repType);
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const needsCloseDate = outcome === "Won" || outcome === "Lost";

  async function analyzeTranscript() {
    if (!transcript.trim()) { setError("Paste a transcript first."); return; }
    setAnalyzing(true); setError("");
    try {
      const t = await getValidToken();
      if (!t) throw new Error("Session expired");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ transcript, repType, apiKey: apiKey || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Analysis failed"); }
      const result = await res.json() as AIInsights & { scores?: Record<string, { score?: number; details?: string }> };

      // Hydrate scores from result
      const newScores: CallScores = {};
      cats.forEach(cat => {
        const ai = result.scores?.[cat.id];
        if (ai) (newScores as Record<string, unknown>)[cat.id] = { score: ai.score ?? 0, details: ai.details ?? "" };
      });
      setScores(newScores);

      // Auto-fill metadata
      if (result.metadata) {
        if (result.metadata.rep_name && !repName) setRepName(result.metadata.rep_name);
        if (result.metadata.prospect_company && !prospectCompany) setProspectCompany(result.metadata.prospect_company);
        if (result.metadata.call_type) setCallType(result.metadata.call_type as CallType);
        if (result.metadata.deal_stage) setDealStage(result.metadata.deal_stage as DealStage);
      }
      setAiAnalysis(result);
      setNotes(result.gut_check ?? "");
      setActiveTab("Insights" as Tab);
      setActiveTab("AI Insights");
    } catch (e) {
      setError("Analysis failed: " + (e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveCall() {
    if (!client) { setError("Select a client before saving."); return; }
    if (!repName.trim()) { setError("Enter a rep name before saving."); return; }
    setSaving(true); setError("");
    try {
      const t = await getValidToken();
      if (!t) throw new Error("Session expired");
      const data: Partial<CallReviewType> = {
        org_id: profile?.org_id ?? "00000000-0000-0000-0000-000000000001",
        prospect_company: prospectCompany,
        call_date: callDate,
        call_type: callType,
        deal_stage: dealStage,
        deal_value: dealValue ? Number(dealValue) : undefined,
        outcome,
        close_date: needsCloseDate && closeDate ? closeDate : undefined,
        call_duration_minutes: callDuration ? Number(callDuration) : undefined,
        next_meeting_scheduled: nextMeeting,
        next_meeting_date: nextMeeting && nextMeetingDate ? nextMeetingDate : undefined,
        category_scores: {
          ...scores,
          rep_name: repName,
          client,
          rep_type: repType,
          prospect_name: (aiAnalysis as (AIInsights & { metadata?: { prospect_name?: string } }) | null)?.metadata?.prospect_name ?? "",
        },
        overall_score: overallScore,
        ai_analysis: aiAnalysis ?? undefined,
        coaching_notes: notes,
        transcript,
      };

      const table = supabase.table("call_reviews", t);
      let saved: CallReviewType;
      if (existingCall?.id) {
        const rows = await table.update<CallReviewType>(data, `id=eq.${existingCall.id}`);
        saved = rows[0];
      } else {
        const rows = await table.insert<CallReviewType>(data);
        saved = rows[0];
      }
      onSaved(saved);
    } catch (e) {
      setError("Save failed: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function LabelInput({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</label>
        {children}
      </div>
    );
  }

  const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        {client ? (
          <><Link to={`/clients/${encodeURIComponent(client)}`} className="hover:text-slate-600">{client}</Link><span>›</span></>
        ) : null}
        <span className="text-slate-600 font-medium">
          {existingCall ? `${prospectCompany || "Call"} Review` : "New Call Review"}
        </span>
      </div>

      {/* Sticky context header */}
      <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {client && <span className="font-bold text-slate-700">{client}</span>}
          {repName && <><span className="text-slate-300">›</span><span>{repName}</span></>}
          {callType && <><span className="text-slate-300">›</span><span className="text-slate-400">{callType}</span></>}
          {callDate && <span className="text-slate-300">· {shortDate(callDate)}</span>}
        </div>
        {overallScore > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tabular-nums text-slate-700">{overallScore}%</span>
            <ScoreBadge score={overallScore} size="sm" />
          </div>
        )}
      </div>

      {/* Metadata form */}
      <div className="bg-white border border-slate-200 rounded-card shadow-card p-5 space-y-4">
        {/* WHO row */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Who</div>
          <div className="grid grid-cols-3 gap-3">
            <LabelInput label="Client">
              <select value={client} onChange={e => setClient(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {DEFAULT_CLIENTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </LabelInput>
            <LabelInput label="Rep Name">
              <input className={inputCls} value={repName} onChange={e => setRepName(e.target.value)} placeholder="Sarah Chen" />
            </LabelInput>
            <LabelInput label="Rep Type">
              <select value={repType} onChange={e => setRepType(e.target.value as RepType)} className={inputCls}>
                <option value="AE">AE</option>
                <option value="SDR">SDR</option>
              </select>
            </LabelInput>
          </div>
        </div>

        {/* WHAT & WHEN row */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">What & When</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <LabelInput label="Prospect Co.">
              <input className={inputCls} value={prospectCompany} onChange={e => setProspectCompany(e.target.value)} placeholder="Acme Inc." />
            </LabelInput>
            <LabelInput label="Date">
              <input type="date" className={inputCls} value={callDate} onChange={e => setCallDate(e.target.value)} />
            </LabelInput>
            <LabelInput label="Call Type">
              <select className={inputCls} value={callType} onChange={e => setCallType(e.target.value as CallType)}>
                {["Discovery", "Demo", "Follow-up", "Negotiation", "Close"].map(t => <option key={t}>{t}</option>)}
              </select>
            </LabelInput>
            <LabelInput label="Deal Stage">
              <select className={inputCls} value={dealStage} onChange={e => setDealStage(e.target.value as DealStage)}>
                {["Early", "Mid", "Late"].map(s => <option key={s}>{s}</option>)}
              </select>
            </LabelInput>
            <LabelInput label="Deal Value ($)">
              <input className={inputCls} value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="50000" type="number" />
            </LabelInput>
          </div>
        </div>

        {/* Outcome row */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Outcome</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <LabelInput label="Outcome">
              <select className={inputCls} value={outcome} onChange={e => setOutcome(e.target.value as CallOutcome)}>
                {["Still Active", "Won", "Lost", "No Decision"].map(o => <option key={o}>{o}</option>)}
              </select>
            </LabelInput>
            {needsCloseDate && (
              <LabelInput label="Close Date">
                <input type="date" className={inputCls} value={closeDate} onChange={e => setCloseDate(e.target.value)} />
              </LabelInput>
            )}
            <LabelInput label="Duration (min)">
              <input className={inputCls} type="number" value={callDuration} onChange={e => setCallDuration(e.target.value)} placeholder="30" />
            </LabelInput>
            <LabelInput label="Next Meeting">
              <div className="flex items-center gap-2 py-2">
                <input type="checkbox" id="nm" checked={nextMeeting} onChange={e => setNextMeeting(e.target.checked)} className="accent-brand-500" />
                <label htmlFor="nm" className="text-sm text-slate-600">Scheduled</label>
                {nextMeeting && (
                  <input type="date" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-brand-500" value={nextMeetingDate} onChange={e => setNextMeetingDate(e.target.value)} />
                )}
              </div>
            </LabelInput>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Transcript tab */}
      {activeTab === "Transcript" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RepTypeBadge type={repType} />
              {wordCount > 0 && <span className="text-xs text-slate-400">{wordCount.toLocaleString()} words</span>}
            </div>
            <button
              onClick={analyzeTranscript}
              disabled={analyzing || !transcript.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {analyzing ? (
                <><span className="animate-spin">⟳</span> Analyzing…</>
              ) : (
                "✦ Analyze with AI"
              )}
            </button>
          </div>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste your call transcript here…"
            className="w-full h-96 text-sm border border-slate-200 rounded-lg p-4 bg-white outline-none focus:border-brand-500 resize-y font-mono leading-relaxed"
          />
          {analyzing && <AnalysisSkeleton wordCount={wordCount} />}
        </div>
      )}

      {/* Scorecard tab */}
      {activeTab === "Scorecard" && (
        <div className="space-y-3">
          {/* Overview mini-chart */}
          {Object.keys(scores).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-card p-4 mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Category Overview</div>
              <div className="flex items-center gap-3 mb-3">
                <ScoreRing score={overallScore} size={56} strokeWidth={5} />
                <div>
                  <div className="text-lg font-black text-slate-800">{overallScore}%</div>
                  <ScoreBadge score={overallScore} />
                </div>
              </div>
              {cats.map(cat => {
                const s = (scores as Record<string, { score?: number } | undefined>)[cat.id]?.score ?? 0;
                const pct = (s / 10) * 100;
                return (
                  <div key={cat.id} className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-slate-500 w-36 flex-shrink-0 truncate">{cat.name}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: s >= 7 ? "#22C55E" : s >= 4 ? "#F97316" : "#EF4444" }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums w-4 text-right" style={{ color: s > 0 ? (s >= 7 ? "#22C55E" : s >= 4 ? "#F97316" : "#EF4444") : "#CBD5E1" }}>
                      {s > 0 ? s : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full category bars */}
          {cats.map(cat => (
            <ScoreBar
              key={cat.id}
              label={cat.name}
              score={(scores as Record<string, { score?: number } | undefined>)[cat.id]?.score ?? 0}
              details={(scores as Record<string, { score?: number; details?: string } | undefined>)[cat.id]?.details}
              onChange={v =>
                setScores(p => ({
                  ...p,
                  [cat.id]: { ...(p as Record<string, unknown>)[cat.id], score: v },
                }))
              }
            />
          ))}
        </div>
      )}

      {/* AI Insights tab */}
      {activeTab === "AI Insights" && (
        <div className="space-y-4">
          {!aiAnalysis ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm font-semibold text-slate-600 mb-1">No AI analysis yet</p>
              <p className="text-xs text-slate-400 mb-4">Paste a transcript and run the analysis to get insights.</p>
              <button
                onClick={() => setActiveTab("Transcript")}
                className="px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded-lg"
              >
                Go to Transcript
              </button>
            </div>
          ) : (
            <>
              {/* Gut check */}
              <div className="bg-white border border-slate-200 rounded-card p-4 shadow-card">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-purple-500 mb-3">Gut Check</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{aiAnalysis.gut_check}</p>
              </div>

              {/* Strengths + Opportunities — 2-col */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-white border border-slate-200 rounded-card p-4 shadow-card">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-green-600 mb-3">Strengths</h4>
                  <div className="space-y-3">
                    {aiAnalysis.strengths.map((s, i) => (
                      <div key={i}>
                        <div className="flex items-start gap-2">
                          <span className="text-green-500 text-sm mt-0.5">✓</span>
                          <div>
                            <div className="text-sm font-semibold text-slate-700">{s.title}</div>
                            <div className="text-xs text-slate-500 leading-relaxed mt-0.5">{s.description}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opportunities */}
                <div className="bg-white border border-slate-200 rounded-card p-4 shadow-card">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-3">Areas of Opportunity</h4>
                  <div className="space-y-3">
                    {aiAnalysis.areas_of_opportunity?.map((a, i) => (
                      <div key={i}>
                        <div className="flex items-start gap-2">
                          <span className="text-amber-500 text-sm mt-0.5">→</span>
                          <div className="flex-1">
                            <div className="text-xs text-slate-600 leading-relaxed">{a.description}</div>
                            <div className="mt-1.5 pl-3 py-1.5 border-l-2 border-brand-300 bg-brand-50 rounded-r">
                              <span className="text-[9px] font-bold text-brand-500 uppercase tracking-wider">↳ Fix</span>
                              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{a.fix}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risk indicators */}
              {aiAnalysis.risks && (
                <div className="bg-white border border-slate-200 rounded-card p-4 shadow-card">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-3">Risk Indicators</h4>
                  <div className="space-y-2">
                    {Object.entries(aiAnalysis.risks).map(([key, val]) => (
                      <RiskRow
                        key={key}
                        label={key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        data={val}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Notes tab */}
      {activeTab === "Notes" && (
        <div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add coaching notes, follow-up items, or any context for this call…"
            className="w-full h-64 text-sm border border-slate-200 rounded-lg p-4 bg-white outline-none focus:border-brand-500 resize-y leading-relaxed"
          />
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={saveCall}
          disabled={saving}
          className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
        >
          {saving ? (
            <><span className="animate-spin">⟳</span> Saving…</>
          ) : (
            existingCall ? "Save Changes" : "Save Call Review"
          )}
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ScoreRing } from "../components/ui/ScoreRing";
import { ScoreBadge, OutcomeBadge } from "../components/ui/StatusBadge";
import { RepLeaderboard } from "../components/clients/RepLeaderboard";
import { formatMoney, getClientLogo, shortDate } from "../lib/formatting";
import { getScoreColor } from "../lib/scoring";
import type { CallReview, ClientAssessment } from "../types";

// Recharts for score trends
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface Props {
  savedCalls: CallReview[];
  assessments: ClientAssessment[];
  onNewReview: (client: string) => void;
}

const TABS = ["Call Reviews", "Rep Performance", "Doc Intakes", "GTM Health"] as const;
type Tab = typeof TABS[number];

function ScoreTrendsChart({ calls }: { calls: CallReview[] }) {
  const data = [...calls]
    .sort((a, b) => new Date(a.call_date || "").getTime() - new Date(b.call_date || "").getTime())
    .map(c => ({
      date: shortDate(c.call_date),
      score: c.overall_score ?? 0,
      rep: c.category_scores?.rep_name ?? "",
    }));

  if (data.length < 2) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-card p-4 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Score Progression</div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`${v}%`, "Score"]}
          />
          <ReferenceLine y={75} stroke="#22C55E" strokeDasharray="3 3" opacity={0.4} />
          <ReferenceLine y={50} stroke="#F97316" strokeDasharray="3 3" opacity={0.4} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#6366F1"
            strokeWidth={2}
            dot={{ fill: "#6366F1", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const ASSESSMENT_LABELS: Record<string, string> = {
  gtm_strategy: "GTM Strategy",
  top_of_funnel: "Top of Funnel",
  revops: "RevOps",
  hiring: "Sales Hiring",
  metrics: "Metrics",
};

function GTMHealthTab({ client, assessments }: { client: string; assessments: ClientAssessment[] }) {
  const clientAssessments = assessments.filter(a => a.client_id === client);
  const navigate = useNavigate();

  const assessmentTypes = Object.keys(ASSESSMENT_LABELS);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {assessmentTypes.map(type => {
          const found = clientAssessments
            .filter(a => a.assessment_type === type)
            .sort((a, b) => new Date(b.assessed_at).getTime() - new Date(a.assessed_at).getTime())[0];

          return (
            <div key={type} className="bg-white border border-slate-200 rounded-card p-4 shadow-card">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                {ASSESSMENT_LABELS[type]}
              </div>
              {found ? (
                <>
                  <div
                    className="text-2xl font-black tabular-nums mb-1"
                    style={{ color: getScoreColor(found.score ?? 0) }}
                  >
                    {found.score ?? "—"}
                  </div>
                  <ScoreBadge score={found.score ?? 0} size="sm" />
                  {found.ai_narrative && (
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">
                      {found.ai_narrative}
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <div className="text-slate-400 text-sm">Not assessed</div>
                  <button
                    onClick={() =>
                      navigate(`/assessments/${type.replace("_", "-")}?client=${encodeURIComponent(client)}`)
                    }
                    className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                  >
                    Run Assessment →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientDetailPage({ savedCalls, assessments, onNewReview }: Props) {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const client = decodeURIComponent(clientId ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Call Reviews");
  const [logoFailed, setLogoFailed] = useState(false);

  const clientCalls = savedCalls.filter(c => c.category_scores?.client === client);

  const avgScore = clientCalls.length
    ? Math.round(clientCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / clientCalls.length)
    : 0;

  const pipeline = clientCalls
    .filter(c => (c.outcome ?? "Still Active") === "Still Active")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);

  const wonArr = clientCalls
    .filter(c => c.outcome === "Won")
    .reduce((s, c) => s + (c.deal_value ?? 0), 0);

  const reps = new Set(clientCalls.map(c => c.category_scores?.rep_name).filter(Boolean)).size;

  const logoUrl = getClientLogo(client);

  const sortedCalls = [...clientCalls].sort(
    (a, b) => new Date(b.call_date || "").getTime() - new Date(a.call_date || "").getTime()
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link to="/clients" className="hover:text-slate-600">Clients</Link>
        <span>›</span>
        <span className="text-slate-600 font-medium">{client}</span>
      </div>

      {/* Dark hero header */}
      <div
        className="rounded-card overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)",
          boxShadow: "0 8px 40px rgba(99,102,241,0.2)",
        }}
      >
        {/* Dot texture */}
        <div
          className="p-6"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <div className="flex items-center gap-5 flex-wrap">
            {/* Logo */}
            <div
              className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ boxShadow: "0 0 30px rgba(99,102,241,0.4)" }}
            >
              {logoUrl && !logoFailed ? (
                <img
                  src={logoUrl}
                  alt={client}
                  className="w-12 h-12 object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="text-3xl font-black text-white">{client.charAt(0)}</span>
              )}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black text-white">{client}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {[
                  { label: `${clientCalls.length} Reviews`, val: null },
                  { label: `${reps} Reps`, val: null },
                  { label: `${formatMoney(pipeline)} Pipeline`, val: null },
                  { label: `${formatMoney(wonArr)} Won`, val: null },
                ].map(({ label }) => (
                  <span
                    key={label}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Big score */}
            {clientCalls.length > 0 && (
              <div className="text-center flex-shrink-0">
                <div
                  className="text-5xl font-black tabular-nums"
                  style={{ color: getScoreColor(avgScore) }}
                >
                  {avgScore}%
                </div>
                <div className="text-xs text-white/40 mt-0.5">avg score</div>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => onNewReview(client)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-lg transition-colors border border-white/20"
            >
              + New Review
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Tab content */}
      {activeTab === "Call Reviews" && (
        <div className="space-y-4">
          <ScoreTrendsChart calls={clientCalls} />
          {sortedCalls.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📞</div>
              <p className="text-sm font-semibold text-slate-600 mb-1">No reviews for {client} yet</p>
              <button
                onClick={() => onNewReview(client)}
                className="mt-2 px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded-lg"
              >
                Add First Review
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-card shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Score</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Rep</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Prospect</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Value</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Outcome</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCalls.map((call, idx) => (
                    <tr
                      key={call.id}
                      onClick={() =>
                        navigate(`/clients/${encodeURIComponent(client)}/calls/${call.id}`)
                      }
                      className={`border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${idx % 2 === 1 ? "bg-slate-50/40" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <ScoreRing score={call.overall_score ?? 0} size={36} strokeWidth={3} showLabel={false} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {call.category_scores?.rep_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{call.prospect_company || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{call.call_type}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatMoney(call.deal_value)}</td>
                      <td className="px-4 py-3">
                        <OutcomeBadge outcome={call.outcome} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {shortDate(call.call_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "Rep Performance" && (
        <RepLeaderboard calls={savedCalls} client={client} />
      )}

      {activeTab === "Doc Intakes" && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm font-semibold text-slate-600">Document intake coming soon</p>
        </div>
      )}

      {activeTab === "GTM Health" && (
        <GTMHealthTab client={client} assessments={assessments} />
      )}
    </div>
  );
}

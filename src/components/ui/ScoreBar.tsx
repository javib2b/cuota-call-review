import { getCatScoreColor } from "../../lib/scoring";

interface Props {
  label: string;
  score: number; // 0–10
  details?: string;
  onChange?: (v: number) => void;
}

export function ScoreBar({ label, score, details, onChange }: Props) {
  const pct = (score / 10) * 100;
  const color = getCatScoreColor(score);

  return (
    <div className="bg-white border border-slate-200 rounded-[10px] p-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <span className="text-sm font-semibold text-slate-700 truncate">{label}</span>
        <span
          className="text-sm font-bold tabular-nums flex-shrink-0"
          style={{ color: score > 0 ? color : "rgba(0,0,0,0.25)" }}
        >
          {score > 0 ? `${score}/10` : "—"}
        </span>
      </div>

      {/* Track */}
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
        {/* Segment lines */}
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <div
            key={i}
            className="absolute inset-y-0 w-px bg-white opacity-60"
            style={{ left: `${i * 10}%` }}
          />
        ))}
      </div>

      {/* Manual score input (if editable) */}
      {onChange && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-400 flex-shrink-0">Score:</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={score}
            onChange={e => onChange(Number(e.target.value))}
            className="flex-1 h-1 accent-indigo-500"
          />
        </div>
      )}

      {details && (
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">{details}</p>
      )}
    </div>
  );
}

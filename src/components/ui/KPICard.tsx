interface Props {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number; // positive = up, negative = down
  icon?: string;
  accent?: string; // hex color for left border
  onClick?: () => void;
}

export function KPICard({ label, value, sub, delta, icon, accent, onClick }: Props) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-card p-4 flex items-start gap-3 ${onClick ? "cursor-pointer hover:shadow-card-hover transition-shadow" : ""}`}
      style={{ borderLeft: accent ? `3px solid ${accent}` : undefined }}
      onClick={onClick}
    >
      {icon && (
        <div className="text-2xl flex-shrink-0 mt-0.5">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
          {label}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <span className="text-2xl font-bold tabular-nums text-slate-800">{value}</span>
          {delta !== undefined && (
            <span
              className={`text-xs font-semibold mb-0.5 ${delta >= 0 ? "text-green-600" : "text-red-500"}`}
            >
              {delta >= 0 ? `↑ +${delta}` : `↓ ${delta}`}
            </span>
          )}
        </div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

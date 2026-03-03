import { useEffect, useState } from "react";
import { getScoreColor, getScoreLabel } from "../../lib/scoring";

interface Props {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  animate?: boolean;
}

export function ScoreRing({
  score,
  size = 64,
  strokeWidth = 6,
  showLabel = true,
  animate = true,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, score));
  const [displayed, setDisplayed] = useState(animate ? 0 : pct);

  useEffect(() => {
    if (!animate) { setDisplayed(pct); return; }
    const timeout = setTimeout(() => setDisplayed(pct), 60);
    return () => clearTimeout(timeout);
  }, [pct, animate]);

  const offset = circ - (displayed / 100) * circ;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const fontSize = size < 48 ? Math.round(size * 0.26) : Math.round(size * 0.22);
  const labelFontSize = Math.round(size * 0.15);

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: animate ? "stroke-dashoffset 0.6s ease" : undefined }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ gap: 0 }}
      >
        <span
          className="font-bold tabular-nums leading-none"
          style={{ fontSize, color, lineHeight: 1 }}
        >
          {score}
        </span>
        {showLabel && size >= 64 && (
          <span
            className="font-medium leading-none mt-0.5"
            style={{ fontSize: labelFontSize, color: "rgba(0,0,0,0.35)" }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

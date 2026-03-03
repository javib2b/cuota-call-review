import { getScoreStatus } from "../../lib/scoring";
import { outcomeColor } from "../../lib/formatting";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const status = getScoreStatus(score);
  const label =
    status === "excellent" ? "Excellent"
    : status === "good" ? "Good"
    : status === "average" ? "Average"
    : status === "needs_work" ? "Needs Work"
    : "Critical";

  const colorMap: Record<typeof status, string> = {
    excellent: "bg-indigo-50 text-indigo-700",
    good: "bg-green-50 text-green-700",
    average: "bg-yellow-50 text-yellow-700",
    needs_work: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  };

  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";

  return (
    <span className={`inline-flex rounded-full font-semibold ${sizeClass} ${colorMap[status]}`}>
      {label}
    </span>
  );
}

interface OutcomeBadgeProps {
  outcome?: string;
  size?: "sm" | "md";
}

export function OutcomeBadge({ outcome = "Still Active", size = "md" }: OutcomeBadgeProps) {
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex rounded-full font-semibold ${sizeClass} ${outcomeColor(outcome)}`}>
      {outcome}
    </span>
  );
}

interface RepTypeBadgeProps {
  type?: string;
}

export function RepTypeBadge({ type = "AE" }: RepTypeBadgeProps) {
  const color = type === "SDR"
    ? "bg-purple-50 text-purple-700"
    : "bg-sky-50 text-sky-700";
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {type}
    </span>
  );
}

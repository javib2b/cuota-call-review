import type { ScoreStatus, RepType, CallScores } from "../types";

export const AE_CATEGORIES = [
  { id: "pre_call_research", name: "Pre-Call Research", weight: 10 },
  { id: "intro_opening", name: "Intro / Opening", weight: 10 },
  { id: "agenda", name: "Agenda", weight: 10 },
  { id: "discovery", name: "Discovery", weight: 10 },
  { id: "pitch", name: "Pitch", weight: 10 },
  { id: "services_product", name: "Services / Product Overview", weight: 10 },
  { id: "pricing", name: "Pricing", weight: 10 },
  { id: "next_steps", name: "Next Steps / Closing", weight: 10 },
  { id: "objection_handling", name: "Objection Handling", weight: 10 },
] as const;

export const SDR_CATEGORIES = [
  { id: "call_opener", name: "Call Opener", weight: 10 },
  { id: "product_pitch", name: "Product Pitch", weight: 10 },
  { id: "qualification", name: "Qualification", weight: 10 },
  { id: "call_to_action", name: "Call to Action", weight: 10 },
  { id: "objection_handling", name: "Objection Handling", weight: 10 },
] as const;

export function getCategories(repType?: RepType) {
  return repType === "SDR" ? SDR_CATEGORIES : AE_CATEGORIES;
}

export function computeOverallScore(scores: CallScores, repType?: RepType): number {
  const cats = getCategories(repType);
  const total = cats.reduce((sum, cat) => {
    const entry = scores[cat.id as keyof CallScores];
    return sum + (entry?.score ?? 0);
  }, 0);
  const max = cats.length * 10;
  return Math.round((total / max) * 100);
}

export function getScoreStatus(score: number): ScoreStatus {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "average";
  if (score >= 40) return "needs_work";
  return "critical";
}

export function getScoreLabel(score: number): string {
  const status = getScoreStatus(score);
  const map: Record<ScoreStatus, string> = {
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    needs_work: "Needs Work",
    critical: "Critical",
  };
  return map[status];
}

export function getScoreColor(score: number): string {
  const status = getScoreStatus(score);
  const map: Record<ScoreStatus, string> = {
    excellent: "#6366F1",
    good: "#22C55E",
    average: "#EAB308",
    needs_work: "#F97316",
    critical: "#EF4444",
  };
  return map[status];
}

/** For 0–10 category scores */
export function getCatScoreColor(score: number): string {
  if (score >= 7) return "#22C55E";
  if (score >= 4) return "#F97316";
  return "#EF4444";
}

/** Score to text color class (Tailwind) */
export function getScoreColorClass(score: number): string {
  const status = getScoreStatus(score);
  const map: Record<ScoreStatus, string> = {
    excellent: "text-brand-500",
    good: "text-green-500",
    average: "text-yellow-500",
    needs_work: "text-orange-500",
    critical: "text-red-500",
  };
  return map[status];
}

export function getScoreBgClass(score: number): string {
  const status = getScoreStatus(score);
  const map: Record<ScoreStatus, string> = {
    excellent: "bg-indigo-50 text-indigo-700",
    good: "bg-green-50 text-green-700",
    average: "bg-yellow-50 text-yellow-700",
    needs_work: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  };
  return map[status];
}

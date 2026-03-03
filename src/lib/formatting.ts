/** Format a dollar value as $1.2M / $450K / $1,200 */
export function formatMoney(value?: number | null): string {
  if (value == null || isNaN(value)) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/** Always integer percent string */
export function formatPercent(value?: number | null): string {
  if (value == null || isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

/** Relative time: "2d ago", "3w ago" */
export function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Short date: "Mar 3" or "Mar 3, 2024" */
export function shortDate(dateStr?: string | null, includeYear = false): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (includeYear) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** Month name: "March 2025" */
export function monthYear(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Months between now and a future date */
export function monthsUntil(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(
    0,
    (target.getFullYear() - now.getFullYear()) * 12 +
      (target.getMonth() - now.getMonth())
  );
}

/** Client logo via Clearbit */
const CLIENT_DOMAINS: Record<string, string> = {
  "11x": "11x.ai",
  Arc: "experiencearc.com",
  Diio: "diio.com",
  Factor: "factor.ai",
  Nauta: "getnauta.com",
  Planimatik: "planimatik.com",
  Rapido: "rapidosaas.com",
  Xepelin: "xepelin.com",
};

export function getClientLogo(client: string): string | null {
  const domain = CLIENT_DOMAINS[client];
  return domain ? `https://logo.clearbit.com/${domain}` : null;
}

/** Outcome badge color */
export function outcomeColor(outcome?: string): string {
  switch (outcome) {
    case "Won": return "bg-green-100 text-green-700";
    case "Lost": return "bg-red-100 text-red-700";
    case "No Decision": return "bg-slate-100 text-slate-600";
    default: return "bg-blue-50 text-blue-600";
  }
}

// Shared formatting. Copy rules: active voice, sentence case, concrete specifics.

/** cents → "$84.00" */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Date → "March 3" */
export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** whole days between then and now, floored at 0 */
export function daysAgo(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

/** a gap between two events: "40 seconds" under two minutes, else "12 minutes" */
export function gapText(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}

/** Date → "Mar 3, 09:14" for evidence rows */
export function evidenceDate(d: Date): string {
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}

/**
 * The words meter counts effort, not tokens: content words only.
 * Agrammatic speech drops articles; typing "the" costs nothing to retrieve,
 * so it does not count against the person. "order wrong the thing help" = 4.
 */
export function countWords(fragment: string): number {
  const ARTICLES = new Set(["the", "a", "an"]);
  return fragment
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !ARTICLES.has(w.toLowerCase())).length;
}

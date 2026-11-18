import { PRIORITIES, type Priority } from "./types";

/** Repeats at which a deficiency's priority is raised to Normal, then Urgent. */
export const REPEAT_NORMAL_FLOOR = 2;
export const REPEAT_URGENT_FLOOR = 3;

const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i])) as Record<
  Priority,
  number
>;

/**
 * Priority a deficiency deserves once the same deficiency has been recorded
 * again `repeats` times (e.g. it turned up again in the next maintenance or
 * monthly round): 2+ repeats imply at least Normal, 3+ imply Urgent — but
 * never weaker than the manually chosen `base`.
 */
export function escalatedPriority(base: Priority, repeats: number): Priority {
  const floor: Priority =
    repeats >= REPEAT_URGENT_FLOOR ? "Urgent" : repeats >= REPEAT_NORMAL_FLOOR ? "Normal" : base;
  return PRIORITY_RANK[base] <= PRIORITY_RANK[floor] ? base : floor;
}

/** "×3"-style repeat badge for a deficiency that has recurred; empty when fresh. */
export function repeatBadge(repeatCount?: number | null): string {
  return repeatCount && repeatCount > 0 ? ` ×${repeatCount}` : "";
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Titles from earlier deficiencies similar to what is being typed, best match
 * first: exact-prefix > substring containment > any shared word. `titles` is
 * expected most-recent-first; ties in score keep that recency order.
 */
export function titleSuggestions(query: string, titles: string[], limit = 5): string[] {
  const q = normTitle(query);
  if (q.length < 2) return [];
  const qTokens = new Set(q.split(" ").filter(Boolean));
  const seen = new Set<string>();
  const scored: { title: string; score: number }[] = [];
  for (const t of titles) {
    const n = normTitle(t);
    if (!n || n === q || seen.has(n)) continue;
    seen.add(n);
    let score = 0;
    if (n.startsWith(q) || q.startsWith(n)) score = 3;
    else if (n.includes(q) || q.includes(n)) score = 2;
    else {
      let overlap = 0;
      for (const tok of n.split(" ")) if (qTokens.has(tok)) overlap++;
      score = overlap > 0 ? 1 : 0;
    }
    if (score > 0) scored.push({ title: t, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.title);
}

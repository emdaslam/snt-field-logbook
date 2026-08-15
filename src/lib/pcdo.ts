import { toISODate } from "./api";

/**
 * A PCDO period always runs from the 26th of the previous month
 * to the 25th of the current month (inclusive).
 *
 * Given any reference date, return the period that date belongs to:
 *  - ref on/after the 26th  -> 26 (this month)      .. 25 (next month)
 *  - ref on/before the 25th -> 26 (previous month)  .. 25 (this month)
 */
export function getPcdoPeriod(ref: Date = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();

  const start = d >= 26 ? new Date(y, m, 26) : new Date(y, m - 1, 26);
  const end = d >= 26 ? new Date(y, m + 1, 25) : new Date(y, m, 25);

  return {
    from: toISODate(start),
    to: toISODate(end),
    // The PCDO is named after the month in which it closes (the 25th)
    label: end.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export function isWithin(iso: string | null, from: string, to: string) {
  if (!iso) return false;
  return iso >= from && iso <= to;
}

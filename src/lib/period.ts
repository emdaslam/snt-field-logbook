export type Period = { from: string; to: string; label: string };

/** When leaving a custom range, keep the month if the range is a full calendar
 *  month; otherwise fall back to the current month (months[0]). */
export function snapToMonth(period: Period, months: Period[]): Period {
  return months.find((m) => m.from === period.from && m.to === period.to) ?? months[0];
}

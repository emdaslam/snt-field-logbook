/**
 * Muster (attendance sheet) logic — shared by the Muster export.
 *
 * The railway muster runs from the 11th of a month to the 10th of the next,
 * printed as two half-rows of days (11..end of month, then 1..10) with an
 * attendance code under each day. Codes follow the office sample:
 *   OL   — day with a TA-claimed movement (same rule as the TA Journal)
 *   P    — logged day with no TA claim (office / HQ / within-8 km movement)
 *   REST — rest day; NH — NH day; CR — compensatory rest
 *   PL   — privilege leave (the app's LAP); CL / SICK pass through as-is
 *   blank — no daily log for that day
 * AMC NO / DMC NO columns are placeholders ("---").
 */

import type { Period } from "./period";
import { isSpecialMovement } from "./types";
import { isTaClaimable } from "./api";
import type { DailyLog, Station } from "@/db/schema";
import type { XlsxCell, XlsxMerge } from "./xlsx";

const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/** The muster period for a calendar month (its ISO yyyy-mm-01): 11th → 10th. */
export function musterPeriodOf(monthStart: string): Period {
  const [y, m] = monthStart.split("-").map(Number);
  const from = new Date(y, m - 1, 11);
  const to = new Date(y, m, 10);
  const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to), label };
}

/** "2026-07-11" → "JULY'2026". */
export function musterMonthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? ""}'${y}`;
}

/**
 * The attendance code for one day (all logs of that date). The TA movement
 * wins over a plain movement, exactly like the Diary export's day pick; a day
 * carrying only special entries uses the first one.
 */
export function musterDayCode(
  dayLogs: DailyLog[],
  stations: Station[],
  hq: Station | null | undefined
): string {
  if (dayLogs.length === 0) return "";
  const isTa = (l: DailyLog) => {
    const p = l.taPercent ?? 0;
    return (p === 100 || p === 70 || p === 30) && !isSpecialMovement(l);
  };
  const primary =
    dayLogs.find(isTa) ?? dayLogs.find((l) => !isSpecialMovement(l)) ?? dayLogs[0];
  if (isSpecialMovement(primary)) {
    switch (primary.movementKind) {
      case "rest":
        return "REST";
      case "nh":
        return "NH";
      case "cr":
        return "CR";
      case "leave": {
        const k = (primary.leaveKind ?? "").trim().toUpperCase();
        return k === "LAP" ? "PL" : k || "LEAVE";
      }
      default:
        return "";
    }
  }
  return isTaClaimable(primary, stations, hq) ? "OL" : "P";
}

/** Attendance code per date of the muster period (only logged days present). */
export function musterCodes(
  period: { from: string; to: string },
  logs: DailyLog[],
  stations: Station[],
  hq: Station | null | undefined
): Map<string, string> {
  const byDate = new Map<string, DailyLog[]>();
  for (const l of logs) {
    if (l.logDate < period.from || l.logDate > period.to) continue;
    if (!byDate.has(l.logDate)) byDate.set(l.logDate, []);
    byDate.get(l.logDate)!.push(l);
  }
  const codes = new Map<string, string>();
  for (const [date, dayLogs] of byDate) {
    codes.set(date, musterDayCode(dayLogs, stations, hq));
  }
  return codes;
}

/** Fixed sheet geometry: 11..31 (21 cols), 1..10 (10 cols), AMC + DMC. */
export const MUSTER_LEFT_DAYS = 21;
export const MUSTER_RIGHT_DAYS = 10;
export const MUSTER_COLS = MUSTER_LEFT_DAYS + MUSTER_RIGHT_DAYS + 2;

export type MusterHeader = {
  railway: string;
  office: string;
  pfNo: string;
  name: string;
  designation: string;
};

/** Header lines of the sheet, from the period + profile-derived fields. */
export function musterHeaderLines(period: Period, h: MusterHeader) {
  const fromLabel = musterMonthLabel(period.from);
  const toLabel = musterMonthLabel(period.to);
  return {
    fromLabel,
    toLabel,
    fromToLine: `MONTH: FROM 11TH ${fromLabel} TO 10TH ${toLabel}`,
    office: `OFFICE : ${h.office}`,
    pf: `PF NO: ${h.pfNo || "-"}`,
    name: `NAME OF THE EMPLOYEE : ${h.name}`,
    designation: `DESIGNATION: ${h.designation || "-"}`,
    signature: h.designation ? `(${h.designation})` : "",
  };
}

/**
 * The muster grid: header rows, the two day halves, the attendance-code row.
 * Columns beyond a short month's last day stay blank so both halves keep
 * their width. Rows:
 *   0 railway (full width) · 1 office / PF / name / designation
 *   2 from–to line · 3 month labels + AMC/DMC · 4 day numbers · 5 codes
 */
export function buildMusterGrid(
  period: Period,
  logs: DailyLog[],
  stations: Station[],
  hq: Station | null | undefined,
  header: MusterHeader
): { grid: (string | number | XlsxCell)[][]; merges: XlsxMerge[] } {
  const lines = musterHeaderLines(period, header);
  const codes = musterCodes(period, logs, stations, hq);

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [fy, fm] = period.from.split("-").map(Number);
  const daysInFromMonth = new Date(fy, fm, 0).getDate();
  const dates: string[] = [];
  for (let d = 11; d <= daysInFromMonth; d++) dates.push(iso(new Date(fy, fm - 1, d)));
  const [ty, tm] = period.to.split("-").map(Number);
  for (let d = 1; d <= 10; d++) dates.push(iso(new Date(ty, tm - 1, d)));

  const C = (v: string | number): XlsxCell => ({ v, center: true });
  const span = (row: number, c1: number, c2: number): XlsxMerge => [row, c1, row, c2];
  const last = MUSTER_COLS - 1;

  // Left half = only the from-month days (11..end); right half = always the
  // 1st..10th of the next month. A short month pads the left half with blanks.
  const fromDates = dates.slice(0, dates.length - MUSTER_RIGHT_DAYS);
  const toDates = dates.slice(-MUSTER_RIGHT_DAYS);

  const dayRow: (string | number | XlsxCell)[] = fromDates.map((d) =>
    C(String(Number(d.slice(8))))
  );
  while (dayRow.length < MUSTER_LEFT_DAYS) dayRow.push("");
  for (const d of toDates) dayRow.push(C(String(Number(d.slice(8)))));
  dayRow.push("", "");

  const codeRow: (string | number | XlsxCell)[] = fromDates.map((d) => C(codes.get(d) ?? ""));
  while (codeRow.length < MUSTER_LEFT_DAYS) codeRow.push("");
  for (const d of toDates) codeRow.push(C(codes.get(d) ?? ""));
  codeRow.push(C("---"), C("---"));

  const grid: (string | number | XlsxCell)[][] = [
    [{ v: header.railway, bold: true, center: true }, ...Array(last).fill("")],
    [
      lines.office,
      ...Array(7).fill(""),
      lines.pf,
      ...Array(5).fill(""),
      lines.name,
      ...Array(12).fill(""),
      lines.designation,
      ...Array(5).fill(""),
    ],
    [lines.fromToLine, ...Array(last).fill("")],
    [
      { v: `MONTH : ${lines.fromLabel}`, center: true },
      ...Array(MUSTER_LEFT_DAYS - 1).fill(""),
      { v: `MONTH: ${lines.toLabel}`, center: true },
      ...Array(MUSTER_RIGHT_DAYS - 1).fill(""),
      "AMC NO",
      "DMC NO",
    ],
    dayRow,
    codeRow,
  ];

  const merges: XlsxMerge[] = [
    span(0, 0, last),
    span(1, 0, 7),
    span(1, 8, 13),
    span(1, 14, 26),
    span(1, 27, last),
    span(2, 0, last),
    span(3, 0, MUSTER_LEFT_DAYS - 1),
    span(3, MUSTER_LEFT_DAYS, MUSTER_LEFT_DAYS + MUSTER_RIGHT_DAYS - 1),
  ];

  return { grid, merges };
}

import { exportDocument } from "@/lib/pdf";
import { fmtDate, toISODate, formatFootplateShifts, footplateTrainList, pcdoWorkEntries, counterResetsOf } from "@/lib/api";
import { formatInspectionDates } from "@/lib/inspections";
import { isSpecialMovement } from "@/lib/types";
import { AUTO_TIMINGS } from "@/lib/timingsMode";
import { tripTimes, journeyTripTimes, type JourneyTimes } from "@/lib/travel";
import { loadTaGenConfig, type TaGenWindow, type TaRateKey } from "@/lib/taGenConfig";
import type { XlsxCell, XlsxSheet, XlsxMerge } from "@/lib/xlsx";
import type {
  DeficiencyTask,
  PlannedWork,
  Station,
  DailyLog,
  Tag,
  Staff,
  FootplateDetail,
  FootplateJourney,
} from "@/db/schema";

function esc(s: string | null | undefined) {
  return (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/** ISO yyyy-mm-dd → dd-mm-yyyy (the date style used by the reference sheets). */
function dmy(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

/** "January 2026" → "JANUARY-2026"; anything else passes through unchanged. */
function monthStamp(label: string): string {
  const m = /^(\w+)\s+(\d{4})$/.exec(label.trim());
  return m ? `${m[1].toUpperCase()}-${m[2]}` : label;
}

/** KMS note shown down the merged KMS column of the TA journal. */
const KMS_NOTE = "ALL ARE ABOVE 8 KMS";
/** The same note stacked vertically, one letter per line, with a blank line
 *  between words so "ALL ARE ABOVE 8 KMS" reads as distinct words. */
const KMS_NOTE_VERT = KMS_NOTE.split(" ")
  .map((w) => w.split("").join("\n"))
  .join("\n\n");

/** Trim a day count to at most one decimal and drop a trailing ".0". */
function daysLabel(d: number): string {
  return (Math.round(d * 10) / 10).toString().replace(/\.0$/, "");
}

export function exportTomorrowsWork(
  deficiencies: DeficiencyTask[],
  planned: PlannedWork[],
  stations: Station[],
  note = ""
) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const label = fmtDate(toISODate(tomorrow));

  const stationName = (id: number | null) => stations.find((s) => s.id === id)?.name ?? "Unassigned / General";

  // Selected pending tasks, plus planned works planned for tomorrow or selected
  const tasks = deficiencies.filter((d) => d.status === "Pending" && d.selectedForTomorrow);
  const works = planned.filter(
    (p) => p.status === "Pending" && (p.selectedForTomorrow || p.plannedDate === toISODate(tomorrow))
  );

  // Group station-wise
  const groups = new Map<string, { tasks: DeficiencyTask[]; works: PlannedWork[] }>();
  for (const t of tasks) {
    const k = stationName(t.stationId);
    if (!groups.has(k)) groups.set(k, { tasks: [], works: [] });
    groups.get(k)!.tasks.push(t);
  }
  for (const w of works) {
    const k = stationName(w.stationId);
    if (!groups.has(k)) groups.set(k, { tasks: [], works: [] });
    groups.get(k)!.works.push(w);
  }

  // The date appears only in the heading — individual items carry no dates.
  let body = `<h1>Tomorrow's Work (${label})</h1>`;
  if (note.trim()) {
    body += `<p class="meta">Note: ${esc(note.trim())}</p>`;
  }
  if (groups.size === 0) {
    body += `<p class="empty">No tasks or planned works selected. Tick items in the Task Manager to include them.</p>`;
  }
  for (const [station, g] of groups) {
    body += `<h2>${esc(station)}</h2><ul>`;
    for (const t of g.tasks) {
      body += `<li><strong>[Deficiency · ${esc(t.department)}]</strong> ${esc(t.title)}${t.description ? `<br/><small>${esc(t.description)}</small>` : ""}</li>`;
    }
    for (const w of g.works) {
      body += `<li><strong>[Planned Work]</strong> ${esc(w.title)}${w.materialRemarks ? `<br/>Material/Remarks: ${esc(w.materialRemarks)}` : ""}</li>`;
    }
    body += `</ul>`;
  }
  exportDocument(`Tomorrow's Work ${label}`, body, "tomorrow");
}

/**
 * PCDO report — special works entered in the PCDO section, for a period
 * running 26th of last month → 25th of this month. Grouped station-wise with a
 * department sub-section inside each station.
 */
export function exportPcdo(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  stationFilter: number | "" = "",
  selectedIds?: Set<number> | null
) {
  exportDocument(`PCDO ${period.label}`, pcdoReportBody(period, logs, stations, stationFilter, selectedIds), "pcdo");
}

/** The PCDO special-works report body, grouped station-wise with department
 * sub-sections. Split out from exportPcdo so it is easy to test headlessly. */
export function pcdoReportBody(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  stationFilter: number | "" = "",
  selectedIds?: Set<number> | null
): string {
  const stationName = (id: number | null) =>
    stations.find((s) => s.id === id)?.name ?? "Unassigned / General";

  // A log's station: explicit PCDO station, else matched from the movement text
  const logStationName = (l: DailyLog) => {
    if (l.pcdoStationId) return stationName(l.pcdoStationId);
    const match = stations.find((s) => l.stationMovement === s.name);
    if (match) return match.name;
    const loose = stations.find(
      (s) => l.stationMovement && l.stationMovement.toLowerCase().includes(s.name.toLowerCase())
    );
    return loose ? loose.name : l.stationMovement || "Unassigned / General";
  };
  const logStationId = (l: DailyLog) => {
    if (l.pcdoStationId) return l.pcdoStationId;
    const match = stations.find(
      (s) =>
        l.stationMovement === s.name ||
        (l.stationMovement && l.stationMovement.toLowerCase().includes(s.name.toLowerCase()))
    );
    return match ? match.id : null;
  };

  const entries = logs
    .filter((l) => {
      if (pcdoWorkEntries(l).length === 0) return false;
      const d = l.pcdoDate || l.logDate;
      if (d < period.from || d > period.to) return false;
      if (stationFilter && l.pcdoStationId !== stationFilter) return false;
      if (selectedIds && !selectedIds.has(l.id)) return false;
      return true;
    })
    .sort((a, b) => (a.pcdoDate || a.logDate).localeCompare(b.pcdoDate || b.logDate));

  // Disconnections recorded anywhere in the same PCDO period
  const discEntries = logs
    .filter((l) => {
      if (!l.hasDisconnections) return false;
      if (l.discSpecialWork + l.discFailure + l.discMaintenance + l.discNotPermitted <= 0) return false;
      const d = l.pcdoDate || l.logDate;
      if (d < period.from || d > period.to) return false;
      if (stationFilter && logStationId(l) !== stationFilter) return false;
      return true;
    })
    .sort((a, b) => (a.pcdoDate || a.logDate).localeCompare(b.pcdoDate || b.logDate));

  // One row per (log entry × department): a single entry can report special
  // works for several departments, so it contributes one row per department.
  type WorkRow = { station: string; date: string; department: string; work: string };
  const workRows: WorkRow[] = [];
  for (const e of entries) {
    const k = stationName(e.pcdoStationId);
    for (const w of pcdoWorkEntries(e)) {
      workRows.push({ station: k, date: e.pcdoDate || e.logDate, department: w.department, work: w.work });
    }
  }

  // Group station-wise, then department-wise inside each station.
  const groups = new Map<string, WorkRow[]>();
  for (const r of workRows) {
    if (!groups.has(r.station)) groups.set(r.station, []);
    groups.get(r.station)!.push(r);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let body = `<h1>PCDO — Special Works (${esc(period.label)})</h1>`;
  body += `<p class="meta">PCDO period: ${fmtDate(period.from)} to ${fmtDate(period.to)}`;
  if (stationFilter) body += ` · Station: ${esc(stationName(stationFilter as number))}`;
  body += ` · ${workRows.length} special work${workRows.length !== 1 ? "s" : ""}</p>`;

  if (sortedGroups.length === 0) {
    body += `<p class="empty">No special works recorded in the PCDO section for this period.</p>`;
  }

  for (const [station, rows] of sortedGroups) {
    body += `<h2>${esc(station)} (${rows.length})</h2>`;
    const deptGroups = new Map<string, WorkRow[]>();
    for (const r of rows) {
      const d = r.department || "General";
      if (!deptGroups.has(d)) deptGroups.set(d, []);
      deptGroups.get(d)!.push(r);
    }
    for (const [dept, items] of deptGroups) {
      body += `<h3>${esc(dept)}</h3>`;
      body += `<table><tr><th class="date">Date of PCDO</th><th>Special Work</th></tr>`;
      for (const it of items) {
        body += `<tr><td class="date">${fmtDate(it.date)}</td><td>${esc(it.work)}</td></tr>`;
      }
      body += `</table>`;
    }
  }

  /* ---------- Disconnections ---------- */
  const discGroups = new Map<string, DailyLog[]>();
  for (const e of discEntries) {
    const k = logStationName(e);
    if (!discGroups.has(k)) discGroups.set(k, []);
    discGroups.get(k)!.push(e);
  }
  const sortedDisc = [...discGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const sum = (rows: DailyLog[]) => ({
    sw: rows.reduce((n, r) => n + r.discSpecialWork, 0),
    fa: rows.reduce((n, r) => n + r.discFailure, 0),
    mt: rows.reduce((n, r) => n + r.discMaintenance, 0),
    np: rows.reduce((n, r) => n + r.discNotPermitted, 0),
    get total() {
      return this.sw + this.fa + this.mt + this.np;
    },
  });
  const grand = sum(discEntries);

  body += `<h1 style="margin-top:34px">Disconnections (${esc(period.label)})</h1>`;
  body += `<p class="meta">PCDO period: ${fmtDate(period.from)} to ${fmtDate(period.to)} · ${grand.total} disconnection${grand.total !== 1 ? "s" : ""} given</p>`;

  if (sortedDisc.length === 0) {
    body += `<p class="empty">No disconnections recorded for this period.</p>`;
  } else {
    // Single summary table covering all stations
    body += `<h2>Summary — Station-wise</h2>`;
    body += `<table><tr><th>Station</th><th>Special Work</th><th>Failure</th><th>Maintenance</th><th>Not Permitted</th><th>Total</th></tr>`;
    for (const [station, rows] of sortedDisc) {
      const t = sum(rows);
      body += `<tr><td>${esc(station)}</td><td>${t.sw}</td><td>${t.fa}</td><td>${t.mt}</td><td>${t.np}</td><td><strong>${t.total}</strong></td></tr>`;
    }
    body += `<tr><td><strong>Grand Total</strong></td><td><strong>${grand.sw}</strong></td><td><strong>${grand.fa}</strong></td><td><strong>${grand.mt}</strong></td><td><strong>${grand.np}</strong></td><td><strong>${grand.total}</strong></td></tr>`;
    body += `</table>`;
  }

  /* ---------- Counter Resets ---------- */
  type ResetRow = { location: string; equipment: string; failures: number; testing: number };
  // One row per (location × equipment); the station is the same one the
  // disconnections use (explicit PCDO station, else the movement's station),
  // and UFSBI / BPAC locations also name the far ("next") station.
  const resetAgg = new Map<string, ResetRow>();
  for (const e of logs) {
    const list = counterResetsOf(e);
    if (list.length === 0) continue;
    const d = e.pcdoDate || e.logDate;
    if (d < period.from || d > period.to) continue;
    if (
      stationFilter &&
      logStationId(e) !== stationFilter &&
      !list.some((r) => r.stationId === stationFilter)
    )
      continue;
    for (const r of list) {
      const from = r.stationId ? stationName(r.stationId) : logStationName(e);
      const location =
        r.equipment === "MSDAC" ? from : `${from} - ${stationName(r.nextStationId)}`;
      const key = `${location}|${r.equipment}`;
      const prev = resetAgg.get(key);
      if (prev) {
        prev.failures += r.failures;
        prev.testing += r.testing;
      } else {
        resetAgg.set(key, { location, equipment: r.equipment, failures: r.failures, testing: r.testing });
      }
    }
  }
  const sortedResets = [...resetAgg.values()].sort(
    (a, b) => a.location.localeCompare(b.location) || a.equipment.localeCompare(b.equipment)
  );
  const resetGrand = sortedResets.reduce(
    (a, r) => ({ fa: a.fa + r.failures, tt: a.tt + r.testing }),
    { fa: 0, tt: 0 }
  );
  const resetGrandTotal = resetGrand.fa + resetGrand.tt;

  body += `<h1 style="margin-top:34px">Counter Resets (${esc(period.label)})</h1>`;
  body += `<p class="meta">PCDO period: ${fmtDate(period.from)} to ${fmtDate(period.to)} · ${resetGrandTotal} reset${resetGrandTotal !== 1 ? "s" : ""} (${resetGrand.fa} from failures, ${resetGrand.tt} from testing)</p>`;

  if (sortedResets.length === 0) {
    body += `<p class="empty">No counter resets recorded for this period.</p>`;
  } else {
    body += `<h2>Summary — Station-wise</h2>`;
    body += `<table><tr><th>Station / Section</th><th>Equipment</th><th>Failures</th><th>Testing</th><th>Total</th></tr>`;
    for (const r of sortedResets) {
      body += `<tr><td>${esc(r.location)}</td><td>${esc(r.equipment)}</td><td>${r.failures}</td><td>${r.testing}</td><td><strong>${r.failures + r.testing}</strong></td></tr>`;
    }
    body += `<tr><td><strong>Grand Total</strong></td><td></td><td><strong>${resetGrand.fa}</strong></td><td><strong>${resetGrand.tt}</strong></td><td><strong>${resetGrandTotal}</strong></td></tr>`;
    body += `</table>`;
  }

  return body;
}


/**
 * Shared helpers for the Diary / TA Journal exports.
 */

type MovementStation = {
  /** Station code when the movement matches a known station, else raw text. */
  code: string;
  /** Raw movement text (for matching / fallback). */
  name: string;
  match: Station | undefined;
  travelMin: number | null;
  travelMax: number | null;
};

/** Resolve a log's station display code and (matched) travel range. */
function movementStation(l: DailyLog, stations: Station[]): MovementStation | null {
  const text = (l.stationMovement ?? "").trim();
  if (!text) return null;
  const match = stations.find(
    (s) =>
      s.name.toLowerCase() === text.toLowerCase() ||
      (s.code && s.code.toLowerCase() === text.toLowerCase())
  );
  return {
    code: match?.code?.trim() ? match.code : text,
    name: text,
    match,
    travelMin: match?.travelMin ?? null,
    travelMax: match?.travelMax ?? null,
  };
}

/** Display label for the HQ station — its code when one is set, else its name. */
function hqLabel(hq: Station | undefined): string {
  return hq?.code?.trim() ? hq.code : hq?.name || "Headquarters";
}

/**
 * The four clock times for a station-movement day. In the normal build these
 * come from the time fields the user entered on the daily log (shown verbatim,
 * or "not entered in daily log" when missing). In the personal build they are
 * generated deterministically from the TA rate and the station's travel range
 * (see src/lib/travel.ts), so they always exist.
 */
function diaryTimes(
  l: DailyLog,
  st: MovementStation,
  date: string,
  taWin?: TaGenWindow
): { outDep: string; outArr: string; retDep: string; retArr: string } {
  if (AUTO_TIMINGS) {
    const t = tripTimes(date, l.taPercent ?? 100, st.travelMin, st.travelMax, taWin);
    return { outDep: t.outDep, outArr: t.outArr, retDep: t.retDep, retArr: t.retArr };
  }
  return {
    outDep: l.timeDep || "not entered in daily log",
    outArr: l.timeArr || "not entered in daily log",
    retDep: l.returnTimeDep || "not entered in daily log",
    retArr: l.returnTimeArr || "not entered in daily log",
  };
}

/** Map a TA percent to the matching config window key (100 / 70 / 30). */
function taRateKey(p: number | null | undefined): TaRateKey {
  return p === 100 || p === 30 ? (String(p) as TaRateKey) : "70";
}

/** Display label for a station — its code when one is set, else its name. */
function stationLabel(st: Station | undefined): string {
  return st?.code?.trim() ? st.code : st?.name || "";
}

/** Wrap a station into the MovementStation shape the timing helpers expect. */
function asMovementStation(st: Station): MovementStation {
  return {
    code: st.code?.trim() ? st.code : st.name,
    name: st.name,
    match: st,
    travelMin: st.travelMin,
    travelMax: st.travelMax,
  };
}

/**
 * The four clock times for a Footplate day plus the two train-leg times. In the
 * normal build they come from the journey fields (timeDep / timeArr / the
 * trains' boarding-alighting times / returnTimeDep / returnTimeArr), shown
 * verbatim or "not entered in daily log" when missing. In the personal build
 * they are generated deterministically (see src/lib/travel.ts).
 */
function journeyTimes(
  l: DailyLog,
  boarding: MovementStation,
  date: string,
  taWin?: TaGenWindow
): JourneyTimes {
  if (AUTO_TIMINGS) {
    const fj = l.footplateJourney;
    return journeyTripTimes(
      date,
      l.taPercent ?? 100,
      boarding.travelMin,
      boarding.travelMax,
      Boolean(fj?.inbound),
      taWin
    );
  }
  const fj = l.footplateJourney;
  const miss = "not entered in daily log";
  return {
    outDep: l.timeDep || miss,
    outArr: l.timeArr || miss,
    retDep: l.returnTimeDep || miss,
    retArr: l.returnTimeArr || miss,
    trOutDep: fj?.outbound?.depTime || miss,
    trOutArr: fj?.outbound?.arrTime || miss,
    trInDep: fj?.inbound?.depTime || miss,
    trInArr: fj?.inbound?.arrTime || miss,
  };
}

type JourneyLeg = {
  trainNo: string;
  dep: string;
  arr: string;
  from: string;
  to: string;
};

/**
 * The legs of a Footplate day as export rows: HQ → boarding station (ROAD),
 * the outbound train, the return train when riding back (direction "Both"),
 * then boarding station → HQ (ROAD). Returns null when the journey is missing
 * the boarding / other-end stations.
 */
function footplateLegs(
  l: DailyLog,
  stations: Station[],
  hqCode: string,
  t: JourneyTimes
): JourneyLeg[] | null {
  const fj: FootplateJourney | null = l.footplateJourney ?? null;
  if (!fj) return null;
  const boarding = stations.find((s) => s.id === fj.boardingStationId);
  const otherEnd = stations.find((s) => s.id === fj.otherEndStationId);
  if (!boarding || !otherEnd || boarding.id === otherEnd.id) return null;
  const b = stationLabel(boarding);
  const o = stationLabel(otherEnd);
  const legs: JourneyLeg[] = [
    { trainNo: "ROAD", dep: t.outDep, arr: t.outArr, from: hqCode, to: b },
  ];
  if (fj.outbound && (fj.outbound.trainNo || fj.direction === "Up" || fj.direction === "Down")) {
    legs.push({
      trainNo: fj.outbound.trainNo || "---",
      dep: t.trOutDep,
      arr: t.trOutArr,
      from: b,
      to: o,
    });
  }
  if (fj.inbound && fj.direction === "Both") {
    legs.push({
      trainNo: fj.inbound.trainNo || "---",
      dep: t.trInDep,
      arr: t.trInArr,
      from: o,
      to: b,
    });
  }
  // With a return train (Both) the ride ends back at the boarding station;
  // otherwise (Up/Down) we return to HQ from the other-end station.
  legs.push({ trainNo: "ROAD", dep: t.retDep, arr: t.retArr, from: fj.direction === "Both" ? b : o, to: hqCode });
  return legs;
}

/** "AVAILED REST" + "REST" style pair for a Rest / NH / Leave / CR day. */
function specialPair(l: DailyLog): [string, string] | null {
  switch (l.movementKind) {
    case "rest":
      return ["AVAILED REST", "REST"];
    case "nh":
      return ["AVAILED NH", "NH"];
    case "leave":
      return ["AVAILED LEAVE", "LEAVE"];
    case "cr":
      return ["AVAILED CR", "CR"];
    default:
      return null;
  }
}

/** Non-empty work text for a log, trimmed ("" when nothing was recorded). */
function workText(l: DailyLog): string {
  return l.workDone?.trim() || "";
}

/** Wrap a grid cell into an XlsxCell, applying center / wrap cell styles. */
function styled(v: string | number, o: { center?: boolean; wrap?: boolean } = {}): XlsxCell {
  return o.center || o.wrap ? { v, ...o } : v;
}

/** Plain text of a grid cell (unwraps styled cell objects). */
function cellText(c: XlsxCell | string | number): string {
  return typeof c === "object" ? String(c.v) : String(c);
}

/**
 * Render a grid and its merge ranges into table HTML for the PDF / Word
 * outputs, honouring vertical merges (rowspan) and horizontal merges
 * (colspan) so those formats visually merge the same cells the Excel sheet
 * merges. `dateCol` marks the column rendered with class="date" (fixed-width
 * in the PDF); `centerCols` marks columns that get data-align="center";
 * `vTextCols` marks columns whose non-empty cells render their text vertically
 * (one character per line) via class="vtext" in PDF and Word.
 */
function gridHtml(
  grid: (string | number | XlsxCell)[][],
  merges: XlsxMerge[],
  opts: { dateCol?: number; centerCols?: Set<number>; vTextCols?: Set<number> } = {}
): string {
  const covered = new Set<string>();
  const rows: string[] = [];
  for (let r = 0; r < grid.length; r++) {
    const tds: string[] = [];
    for (let c = 0; c < grid[r].length; c++) {
      const key = `${r},${c}`;
      if (covered.has(key)) continue;
      const txt = cellText(grid[r][c]);
      const m = merges.find(([r1, c1]) => r1 === r && c1 === c);
      const isV = Boolean(opts.vTextCols?.has(c) && txt.trim());
      let cls = opts.dateCol === c ? "date" : "";
      if (isV) cls = cls ? `${cls} vtext` : "vtext";
      let attrs = cls ? ` class="${cls}"` : "";
      if (opts.centerCols?.has(c)) attrs += ' data-align="center"';
      if (m) {
        const [, , r2, c2] = m;
        const rs = r2 - r + 1;
        const cs = c2 - c + 1;
        if (rs > 1) {
          attrs += ` rowspan="${rs}"`;
          for (let rr = r + 1; rr <= r2; rr++) covered.add(`${rr},${c}`);
        }
        if (cs > 1) {
          attrs += ` colspan="${cs}"`;
          for (let cc = c + 1; cc <= c2; cc++) covered.add(`${r},${cc}`);
        }
      }
      tds.push(`<td${attrs}>${esc(txt)}</td>`);
    }
    rows.push(`<tr>${tds.join("")}</tr>`);
  }
  return rows.join("");
}

/**
 * Merge several logs of the same day into one nature-of-work cell. When a day
 * has two movements, both pieces of work are joined with " and "; exact
 * duplicates are dropped.
 */
function mergeWork(logs: DailyLog[]): string {
  const parts: string[] = [];
  for (const l of logs) {
    const t = workText(l);
    if (t && !parts.includes(t)) parts.push(t);
  }
  return parts.join(" and ");
}

/**
 * Pick the log that drives a day's route and timings when several logs share
 * the same date. The TA movement (a station trip claiming 100 / 70 / 30 %)
 * wins; otherwise the first real station movement; otherwise the first log.
 */
function preferTaLog(logs: DailyLog[], hq: Station | undefined): DailyLog {
  const isTa = (l: DailyLog) => {
    const p = l.taPercent ?? 0;
    return (p === 100 || p === 70 || p === 30) && !isSpecialMovement(l);
  };
  const ta = logs.find(isTa);
  if (ta) return ta;
  const movement = logs.find((l) => {
    if (isSpecialMovement(l)) return false;
    const text = (l.stationMovement ?? "").trim();
    return Boolean(text) && !(hq && text.toLowerCase() === hq.name.toLowerCase());
  });
  return movement ?? logs[0];
}

/**
 * Diary export — the reference layout: DATE | TRAIN NO | TIME DEP | TIME ARR |
 * FROM | TO | NATURE OF WORK. An away day produces two rows (HQ → station and
 * the return leg); HQ days are "AT <HQ>"; Rest/NH/Leave/CR days collapse into
 * a single "AVAILED …" row. In the normal build the times are the clock fields
 * the user entered on each daily log (timeDep / timeArr / returnTimeDep /
 * returnTimeArr), shown verbatim; in the personal build they are derived from
 * the TA rate and the station's travel range (see src/lib/travel.ts).
 */
export function exportDiary(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  me: Staff | undefined
) {
  const hq = stations.find((s) => s.id === me?.headquartersStationId);
  const hqCode = hqLabel(hq);
  const taCfg = AUTO_TIMINGS ? loadTaGenConfig() : null;

  const rows = logs
    .filter((l) => l.logDate >= period.from && l.logDate <= period.to)
    .sort((a, b) => a.logDate.localeCompare(b.logDate));

  // A day may carry two movements (two daily logs for the same date). Export
  // such a day as a single movement — the TA one wins for the route and the
  // timings, and the nature of work merges both entries with " and ".
  const days = new Map<string, DailyLog[]>();
  for (const l of rows) {
    if (!days.has(l.logDate)) days.set(l.logDate, []);
    days.get(l.logDate)!.push(l);
  }

  // Display rows (grid + xlsx share the same data)
  const grid: (string | number)[][] = [];
  const merges: XlsxMerge[] = [];
  for (const [date, dayLogs] of days) {
    const primary = preferTaLog(dayLogs, hq);
    const work = mergeWork(dayLogs) || "-";
    const sp = specialPair(primary);
    if (sp) {
      const r = grid.length;
      grid.push([dmy(date), sp[0], "", "", "", "", sp[1]]);
      merges.push([r, 1, r, 5]); // train-no..to collapse into the label
      continue;
    }
    const st = movementStation(primary, stations);
    if (!st || (hq && st.match?.id === hq.id)) {
      grid.push([dmy(date), "---", "---", "---", "AT", hqCode, work]);
      continue;
    }
    // Footplate movement — the journey legs (HQ → boarding, train leg(s),
    // boarding → HQ) each get their own row, sharing the date and work.
    if (primary.movementKind === "footplate") {
      const boarding = primary.footplateJourney
        ? stations.find((s) => s.id === primary.footplateJourney!.boardingStationId)
        : undefined;
      const t = boarding
        ? journeyTimes(primary, asMovementStation(boarding), date, taCfg ? taCfg[taRateKey(primary.taPercent)] : undefined)
        : null;
      const legs = primary.footplateJourney && t ? footplateLegs(primary, stations, hqCode, t) : null;
      const r = grid.length;
      if (legs) {
        legs.forEach((leg, i) => {
          grid.push([
            i === 0 ? dmy(date) : "",
            leg.trainNo,
            leg.dep,
            leg.arr,
            leg.from,
            leg.to,
            i === 0 ? work : "",
          ]);
        });
        merges.push([r, 0, r + legs.length - 1, 0], [r, 6, r + legs.length - 1, 6]);
      } else {
        grid.push([dmy(date), "---", "---", "---", "FOOTPLATE", "---", work]);
        merges.push([r, 1, r, 5]);
      }
      continue;
    }
    const t = diaryTimes(primary, st, date, taCfg ? taCfg[taRateKey(primary.taPercent)] : undefined);
    const r = grid.length;
    grid.push([
      dmy(date),
      "ROAD",
      t.outDep,
      t.outArr,
      hqCode,
      st.code,
      work,
    ]);
    grid.push(["", "ROAD", t.retDep, t.retArr, st.code, hqCode, ""]);
    merges.push([r, 0, r + 1, 0], [r, 6, r + 1, 6]); // date + work span both legs
  }

  const who = me?.name || me?.designation ? `${me?.name?.toUpperCase() ?? ""}, ${me?.designation?.toUpperCase() ?? ""}`.replace(/^,\s*|,\s*$/g, "") : "";
  const titleText = who
    ? `DIARY OF SRI ${who} FOR THE MONTH OF ${monthStamp(period.label)}`
    : `Diary — ${period.label}`;

  let body = `<h1>${esc(titleText)}</h1>`;
  body += `<p class="meta">${fmtDate(period.from)} to ${fmtDate(period.to)} · Headquarters: ${esc(hqCode)}</p>`;

  if (rows.length === 0) {
    body += `<p class="empty">No diary entries in this period.</p>`;
  } else {
    body += `<table>`;
    body += `<tr><th class="date" data-width="56">DATE</th><th data-width="72">TRAIN NO</th><th data-width="60">TIME DEP</th><th data-width="60">TIME ARR</th><th data-width="50">FROM</th><th data-width="50">TO</th><th>NATURE OF WORK</th></tr>`;
    body += gridHtml(grid, merges, { dateCol: 0 });
    body += `</table>`;
    if (me?.designation) body += `<p class="meta" style="text-align:right">${esc(me.designation.toUpperCase())}</p>`;
  }

  const allMerges: XlsxMerge[] = [
    [0, 0, 0, 6],
    ...merges.map(([r1, c1, r2, c2]) => [r1 + 2, c1, r2 + 2, c2] as XlsxMerge),
  ];
  const sheet: XlsxSheet = {
    rows: [
      [{ v: titleText, bold: true }],
      ["DATE", "TRAIN NO", "TIME DEP", "TIME ARR", "FROM", "TO", "NATURE OF WORK"],
      ...grid.map((g) => g.map((c, i) => (i === 6 ? styled(c, { wrap: true }) : c)) as XlsxCell[]),
    ],
    merges: allMerges,
    colWidths: [10.3, 8.7, 8.7, 8.7, 7.3, 7.3, 52.3],
  };

  exportDocument(`Diary ${period.label}`, body, "diary", sheet);
}


/**
 * TA Journal export — the reference TA.xlsx layout. Includes only days where
 * TA is actually claimed: a station movement **farther than 8 km from the
 * headquarters** (stations.distanceFromHq === "above8") with a 100 / 70 / 30
 * rate. Each qualifying day is shown as a vertical two-leg row pair, the dates
 * / timings / from / to / KMS columns are centred on both axes, the work text
 * wraps, and the SOUTH COAST RAILWAY header is centred. In the normal build
 * the timings are the user-entered clock fields; in the personal build they
 * are generated (see src/lib/travel.ts). Ends with a month summary by rate
 * and the certification + signature block.
 */
export function exportTaJournal(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  me: Staff | undefined
) {
  const hq = stations.find((s) => s.id === me?.headquartersStationId);
  const hqCode = hqLabel(hq);
  const taCfg = AUTO_TIMINGS ? loadTaGenConfig() : null;
  const taRate = me?.taRate != null && me.taRate !== "" ? Number(me.taRate) : null;
  const rateNotSet = taRate == null;

  // One entry per TA day. A date with two movements (two daily logs) counts as
  // a single TA day: the TA movement drives the route, and the nature of work
  // merges both logs with " and ". Only stations recorded as above 8 km from
  // the headquarters qualify.
  const days = new Map<string, DailyLog[]>();
  for (const l of logs) {
    if (l.logDate < period.from || l.logDate > period.to) continue;
    if (!days.has(l.logDate)) days.set(l.logDate, []);
    days.get(l.logDate)!.push(l);
  }
  const taDays: { log: DailyLog; work: string }[] = [];
  for (const dayLogs of days.values()) {
    const primary = preferTaLog(dayLogs, hq);
    if (isSpecialMovement(primary)) continue;
    const p = primary.taPercent ?? 100;
    if (p !== 100 && p !== 70 && p !== 30) continue;
    // A Footplate day is a working tour away from HQ (departure → return), so
    // it always qualifies for TA — the rate stays the manual 100/70/30 pick.
    if (primary.movementKind === "footplate") {
      taDays.push({ log: primary, work: mergeWork(dayLogs) || "-" });
      continue;
    }
    const st = movementStation(primary, stations);
    if (!st || (hq && st.match?.id === hq.id)) continue;
    if (st.match?.distanceFromHq !== "above8") continue;
    taDays.push({ log: primary, work: mergeWork(dayLogs) || "-" });
  }
  taDays.sort((a, b) => a.log.logDate.localeCompare(b.log.logDate));

  const count = (p: number) => taDays.filter((d) => (d.log.taPercent ?? 100) === p).length;
  const n100 = count(100);
  const n70 = count(70);
  const n30 = count(30);
  const days100 = n100;
  const days70 = n70 * 0.7;
  const days30 = n30 * 0.3;
  const totalDays = days100 + days70 + days30;
  const totalAmount = taRate != null ? Math.round(totalDays * taRate) : null;
  const rateMissingText = "Rate not set (Settings → Staff Details)";
  const amountCell = (p: number): string | number => (taRate != null ? Math.round((p / 100) * taRate) : rateMissingText);

  const grid: XlsxCell[][] = [];
  const merges: XlsxMerge[] = [];
  const dataStart = grid.length;
  for (const d of taDays) {
    const l = d.log;
    const p = l.taPercent ?? 100;
    const r = grid.length;
    const emptyRow = (i: number) => (i === 0 ? dmy(l.logDate) : "") as string | number;
    // Footplate day — each journey leg is its own row (HQ → boarding, train
    // leg(s), boarding → HQ); the date, days, amount and work span all legs.
    if (l.movementKind === "footplate") {
      const boarding = l.footplateJourney
        ? stations.find((s) => s.id === l.footplateJourney!.boardingStationId)
        : undefined;
      const t = boarding
        ? journeyTimes(l, asMovementStation(boarding), l.logDate, taCfg ? taCfg[taRateKey(l.taPercent)] : undefined)
        : null;
      const legs = l.footplateJourney && t ? footplateLegs(l, stations, hqCode, t) : null;
      if (legs) {
        legs.forEach((leg, i) => {
          grid.push([
            styled(emptyRow(i), { center: true }),
            leg.trainNo,
            styled(leg.dep, { center: true }),
            styled(leg.arr, { center: true }),
            styled(leg.from, { center: true }),
            styled(leg.to, { center: true }),
            styled("", { center: true }),
            i === 0 ? `${p}%` : "",
            i === 0 ? amountCell(p) : "",
            styled(i === 0 ? d.work : "", { wrap: true }),
          ]);
        });
        merges.push(
          [r, 0, r + legs.length - 1, 0],
          [r, 7, r + legs.length - 1, 7],
          [r, 8, r + legs.length - 1, 8],
          [r, 9, r + legs.length - 1, 9]
        );
      } else {
        // Incomplete journey — keep the day visible with a single row.
        grid.push([
          styled(dmy(l.logDate), { center: true }),
          "---",
          styled("---", { center: true }),
          styled("---", { center: true }),
          styled("FOOTPLATE", { center: true }),
          styled("", { center: true }),
          styled("", { center: true }),
          `${p}%`,
          amountCell(p),
          styled(d.work, { wrap: true }),
        ]);
      }
      continue;
    }
    const st = movementStation(l, stations)!;
    const t = diaryTimes(l, st, l.logDate, taCfg ? taCfg[taRateKey(l.taPercent)] : undefined);
    grid.push([
      styled(dmy(l.logDate), { center: true }),
      "ROAD",
      styled(t.outDep, { center: true }),
      styled(t.outArr, { center: true }),
      styled(hqCode, { center: true }),
      styled(st.code, { center: true }),
      styled("", { center: true }),
      `${p}%`,
      amountCell(p),
      styled(d.work, { wrap: true }),
    ]);
    grid.push([
      styled("", { center: true }),
      "ROAD",
      styled(t.retDep, { center: true }),
      styled(t.retArr, { center: true }),
      styled(st.code, { center: true }),
      styled(hqCode, { center: true }),
      styled("", { center: true }),
      "",
      "",
      "",
    ]);
    merges.push([r, 0, r + 1, 0], [r, 7, r + 1, 7], [r, 8, r + 1, 8], [r, 9, r + 1, 9]);
  }
  const dataEnd = grid.length - 1;
  if (dataStart <= dataEnd) {
    merges.push([dataStart, 6, dataEnd, 6]); // KMS note spans all rows
    grid[dataStart][6] = styled(KMS_NOTE_VERT, { center: true, wrap: true });
  }

  const month = monthStamp(period.label);
  const name = me?.name ? `Name: ${me.name}` : "Name: not updated in profile";
  const designation = me?.designation ? `Designation: ${me.designation}` : "Designation: not updated in profile";
  const pf = me?.pfNo ? `P.F.NO: ${me.pfNo}` : "P.F.NO: not updated in profile";
  const bu = me?.buNo ? `B.U.No: ${me.buNo}` : "B.U.No: not updated in profile";

  const cert =
    "I here certify that the above mentioned employee was absent on duty from his headquarters station during the period charged for in the bill on Railway Business.";

  let body = `<h1 class="centered">SOUTH COAST RAILWAY. GUNTAKAL DIVISION</h1>`;
  body += `<h2 class="centered">TRAVELLING ALLOWANCE JOURNAL</h2>`;
  body += `<p class="meta">${esc(name)} · ${esc(designation)} · ${esc(pf)}</p>`;
  body += `<p class="meta">${esc(`Headquarters: ${hqCode}`)} · Month: ${esc(month)} · ${esc(bu)}</p>`;

  if (taDays.length === 0) {
    body += `<p class="empty">No TA days in this period.</p>`;
  } else {
    body += `<table>`;
    body += `<tr><th class="date" data-width="54" data-align="center">DATE</th><th data-width="40">TRAIN NO</th><th data-width="44" data-align="center">TIME DEP</th><th data-width="44" data-align="center">TIME ARR</th><th data-width="40" data-align="center">FROM</th><th data-width="40" data-align="center">TO</th><th data-width="30" data-align="center">KMS</th><th data-width="32">TA %</th><th data-width="40">AMOUNT</th><th>NATURE OF WORK</th></tr>`;
    body += gridHtml(grid, merges, { dateCol: 0, centerCols: new Set([0, 2, 3, 4, 5, 6]), vTextCols: new Set([6]) });
    body += `</table>`;

    body += `<h2>Summary</h2>`;
    body += `<table>`;
    body += `<tr><td><strong>TOTAL NO. OF DAYS</strong></td><td></td><td></td><td><strong>${daysLabel(totalDays)} DAYS</strong></td><td><strong>${rateNotSet ? esc(rateMissingText) : `₹${totalAmount!.toLocaleString("en-IN")}`}</strong></td></tr>`;
    body += `<tr><td>100%</td><td>X ${n100}</td><td>= ${daysLabel(days100)} DAYS</td><td></td><td></td></tr>`;
    body += `<tr><td>70%</td><td>X ${n70}</td><td>= ${daysLabel(days70)} DAYS</td><td></td><td></td></tr>`;
    body += `<tr><td>30%</td><td>X ${n30}</td><td>= ${daysLabel(days30)} DAYS</td><td></td><td></td></tr>`;
    body += `<tr><td>${"".padEnd(24, "_")}</td><td></td><td></td><td></td><td></td></tr>`;
    body += `<tr><td><strong>TOTAL</strong></td><td></td><td>= ${daysLabel(totalDays)} DAYS</td><td></td><td></td></tr>`;
    body += `</table>`;

    body += `<p class="meta" style="margin-top:12px">${esc(cert)}</p>`;
    body += `<p class="meta" style="margin-top:28px">____________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;____________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;________________________</p>`;
    body += `<p class="meta">CONTROLLING OFFICER&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;HEAD OF OFFICE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;SIGNATURE OF OFFICER/ CLAIMING TA</p>`;
  }

  const summaryRows: XlsxSheet["rows"] = [
    [{ v: "SOUTH COAST RAILWAY. GUNTAKAL DIVISION", bold: true, center: true }],
    [{ v: "TRAVELLING ALLOWANCE JOURNAL", bold: true, center: true }],
    [name, "", "", designation, "", "", "", { v: pf, bold: false }, ""],
    [`Headquarters: ${hqCode}`, "", "", `Month: ${month}`, "", "", "", { v: bu, bold: false }, ""],
    [
      styled("DATE", { center: true }),
      "TRAIN NO",
      styled("TIME", { center: true }),
      "",
      styled("STATION", { center: true }),
      "",
      styled("KMS", { center: true }),
      "TA %",
      "AMOUNT",
      "NATURE OF WORK",
    ],
    [
      "",
      "",
      styled("TIME DEPT", { center: true }),
      styled("TIME ARR", { center: true }),
      styled("FROM", { center: true }),
      styled("TO", { center: true }),
      "",
      "",
      "",
      "",
    ],
    ...grid,
  ];
  const mergesAll: XlsxMerge[] = [
    [0, 0, 0, 9],
    [1, 0, 1, 9],
    [2, 7, 2, 8],
    [3, 7, 3, 8],
    [4, 0, 5, 0],
    [4, 1, 5, 1],
    [4, 2, 4, 3],
    [4, 4, 4, 5],
    [4, 6, 5, 6],
    [4, 7, 5, 7],
    [4, 8, 5, 8],
    [4, 9, 5, 9],
    ...merges.map(([r1, c1, r2, c2]) => [r1 + 6, c1, r2 + 6, c2] as XlsxMerge),
  ];
  const s = 6 + grid.length;
  const t1 = s;
  const line = s + 5;
  const tot = s + 6;
  const certRow = s + 8;
  const sigLab = s + 12;
  mergesAll.push(
    [t1, 0, t1, 6], // TOTAL NO. OF DAYS spans A:G
    [line, 1, line, 4], // underline
    [tot, 1, tot, 2], // TOTAL label
    [certRow, 0, certRow, 9], // certification text
    [sigLab, 0, sigLab, 2],
    [sigLab, 5, sigLab, 7],
    [sigLab, 9, sigLab, 9]
  );
  summaryRows.push(
    [{ v: "TOTAL NO. OF DAYS", center: true }, "", "", "", "", "", "", `${daysLabel(totalDays)} DAYS`, rateNotSet ? rateMissingText : (totalAmount as number), ""],
    [""],
    ["", "100%", `X ${n100}`, `= ${daysLabel(days100)} DAYS`, "", "", "", "", "", "", days100],
    ["", "70%", `X ${n70}`, `= ${daysLabel(days70)} DAYS`, "", "", "", "", "", "", days70],
    ["", "30%", `X ${n30}`, `= ${daysLabel(days30)} DAYS`, "", "", "", "", "", "", days30],
    ["", "".padEnd(24, "_"), "", "", ""],
    ["", "TOTAL", "", `= ${daysLabel(totalDays)} DAYS`],
    [""],
    [{ v: cert, bold: false }, "", "", "", "", "", "", "", "", ""],
    [""],
    [""],
    ["".padEnd(20, "_"), "", "", "", "", "".padEnd(19, "_"), "", "", "", "".padEnd(22, "_")],
    ["CONTROLLING OFFICER", "", "", "", "", "HEAD OF OFFICE", "", "", "", "SIGNATURE OF OFFICER/ CLAIMING TA"]
  );

  const sheet: XlsxSheet = {
    rows: summaryRows,
    merges: mergesAll,
    colWidths: [10.43, 8.14, 9.71, 9.29, 6.71, 8.43, 4.29, 9.71, 11.43, 51, 12.14, 9],
  };

  exportDocument(`TA Journal ${period.label}`, body, "ta", sheet);
}


/**
 * Inspection export — two columns only:
 *   1. Station inspected (taken from the monthly / quarterly / maintenance tag)
 *   2. The dates on which it was inspected
 */
type InspKind = "monthly" | "quarterly" | "maintenance" | "joint" | "footplate" | "poiling" | "battery";

/**
 * Inspection export. Accepts one or more kinds and renders a section per kind:
 *   - footplate -> Day/Night | Train No. | Date
 *   - others    -> Station Inspected | Dates Inspected
 */
export function exportInspections(
  kinds: InspKind | InspKind[],
  kindLabel: string,
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  stationFilter: number | "" = "",
  labelFor?: (k: InspKind) => string
) {
  const kindList = Array.isArray(kinds) ? kinds : [kinds];
  const nameOf = (id: number | null) =>
    stations.find((s) => s.id === id)?.name ?? "Unspecified station";
  const titleFor = (k: InspKind) => labelFor?.(k) ?? k;

  const inScope = (l: DailyLog) => {
    if (l.logDate < period.from || l.logDate > period.to) return false;
    if (stationFilter && l.inspectionStationId !== stationFilter) return false;
    return true;
  };

  const total = logs.filter((l) => kindList.includes(l.inspectionKind as InspKind) && inScope(l)).length;

  let body = `<h1>${esc(kindLabel)} — ${esc(period.label)}</h1>`;
  body += `<p class="meta">${fmtDate(period.from)} to ${fmtDate(period.to)} · ${total} inspection${total !== 1 ? "s" : ""}</p>`;

  for (const kind of kindList) {
    const rows = logs
      .filter((l) => l.inspectionKind === kind && inScope(l))
      .sort((a, b) => a.logDate.localeCompare(b.logDate));

    // Only head each section when several kinds are combined
    if (kindList.length > 1) {
      body += `<h2>${esc(titleFor(kind))} (${rows.length})</h2>`;
    }

    if (rows.length === 0) {
      body += `<p class="empty">No ${esc(titleFor(kind).toLowerCase())} recorded in this period.</p>`;
      continue;
    }

    if (kind === "footplate") {
      // Train numbers only — one row per footplate inspection
      body += `<table>`;
      body += `<tr><th style="width:120px">Day / Night</th><th>Train No.</th><th style="width:110px">Date</th></tr>`;
      for (const r of rows) {
        const trains = footplateTrainList(r);
        body += `<tr><td>${esc(formatFootplateShifts(r.footplateShift) || "-")} footplate</td><td>${
          esc(trains) || "-"
        }</td><td>${fmtDate(r.logDate)}</td></tr>`;
      }
      body += `</table>`;
      continue;
    }

    // One row per station; joint splits per partnering department
    const groups = new Map<string, string[]>();
    for (const r of rows) {
      const at = nameOf(r.inspectionStationId);
      const label =
        kind === "joint" && r.inspectionJointDept ? `${at} (with ${r.inspectionJointDept})` : at;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(r.logDate);
    }
    body += `<table>`;
    body += `<tr><th style="width:38%">Station Inspected</th><th>Dates Inspected</th></tr>`;
    for (const [station, dates] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      body += `<tr><td>${esc(station)}</td><td>${esc(formatInspectionDates(dates))}</td></tr>`;
    }
    body += `</table>`;
  }

  exportDocument(`${kindLabel} ${period.label}`, body, "inspection");
}

export type MonthlyFilters = {
  includeLogs: boolean;
  includeDeficiencies: boolean;
  includePlanned: boolean;
  from: string;
  to: string;
  /** Multiple stations — empty array means all. */
  stationIds: number[];
  /** Multiple departments — empty array means all. */
  departments: string[];
  status: string;
  tagId: number | "";
};

export function exportMonthly(
  filters: MonthlyFilters,
  logs: DailyLog[],
  deficiencies: DeficiencyTask[],
  planned: PlannedWork[],
  stations: Station[],
  tags: Tag[],
) {
  const stationName = (id: number | null) => stations.find((s) => s.id === id)?.name ?? "Unassigned";
  const inRange = (d: string | null) => {
    if (!d) return false;
    return d >= filters.from && d <= filters.to;
  };
  // Multiple stations: match by id, or (for logs) by the movement text.
  const matchStation = (id: number | null) =>
    filters.stationIds.length === 0 || (id != null && filters.stationIds.includes(id));
  const matchMovement = (movement: string | null) => {
    if (filters.stationIds.length === 0) return true;
    return filters.stationIds.some((id) => movement?.includes(stationName(id)) ?? false);
  };

  const fLogs = logs
    .filter((l) => {
      if (!inRange(l.logDate)) return false;
      if (!matchMovement(l.stationMovement)) return false;
      if (filters.tagId && !l.tagIds.includes(filters.tagId as number)) return false;
      return true;
    })
    // Daily logs in ascending order of date
    .sort((a, b) => a.logDate.localeCompare(b.logDate));
  const fDefs = deficiencies.filter((d) => {
    if (!inRange(d.dueDate) && !inRange(toISODate(new Date(d.createdAt)))) return false;
    if (!matchStation(d.stationId)) return false;
    if (filters.departments.length && !filters.departments.includes(d.department)) return false;
    if (filters.status && d.status !== filters.status) return false;
    return true;
  });
  const fPlans = planned.filter((p) => {
    if (!inRange(p.plannedDate)) return false;
    if (!matchStation(p.stationId)) return false;
    if (filters.status && p.status !== filters.status) return false;
    return true;
  });

  const tagName = (id: number) => tags.find((t) => t.id === id)?.name ?? "";

  const meta = [`Range: ${fmtDate(filters.from)} — ${fmtDate(filters.to)}`];
  if (filters.stationIds.length) {
    meta.push(`Stations: ${filters.stationIds.map((id) => stationName(id)).join(", ")}`);
  }
  if (filters.departments.length) meta.push(`Dept: ${filters.departments.join(", ")}`);
  if (filters.status) meta.push(`Status: ${esc(filters.status)}`);

  let body = `<h1>Monthly S&amp;T Report</h1>`;
  body += `<p class="meta">${esc(meta.join(" · "))}</p>`;

  if (filters.includeLogs) {
    body += `<h2>Daily Logs (${fLogs.length})</h2>`;
    if (fLogs.length) {
      body += `<table><tr><th>Date</th><th>Movement</th><th>Work Done</th><th>TA</th><th>Tags</th></tr>`;
      for (const l of fLogs) {
        body += `<tr><td>${fmtDate(l.logDate)}</td><td>${esc(l.stationMovement)}</td><td>${esc(l.workDone)}</td><td>${(l.taPercent ?? 0) > 0 ? `${l.taPercent ?? 100}%` : "-"}</td><td>${l.tagIds.map(tagName).filter(Boolean).map(esc).join(", ")}</td></tr>`;
      }
      body += `</table>`;
    } else body += `<p class="empty">No logs in range.</p>`;
  }

  if (filters.includeDeficiencies) {
    body += `<h2>Deficiency Tasks (${fDefs.length})</h2>`;
    if (fDefs.length) {
      const groups = new Map<string, DeficiencyTask[]>();
      for (const d of fDefs) {
        const k = stationName(d.stationId);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(d);
      }
      // Station-wise groups
      for (const [station, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        body += `<h3>${esc(station)} (${items.length})</h3>`;
        body += `<table><tr><th>Title</th><th>Dept</th><th>Priority</th><th>Due</th><th>Status</th></tr>`;
        for (const d of items) {
          body += `<tr><td>${esc(d.title)}</td><td>${esc(d.department)}</td><td>${esc(d.priority)}</td><td>${d.dueDate ? fmtDate(d.dueDate) : "-"}</td><td>${esc(d.status)}</td></tr>`;
        }
        body += `</table>`;
      }
    } else body += `<p class="empty">No deficiency tasks in range.</p>`;
  }

  if (filters.includePlanned) {
    body += `<h2>Planned Works (${fPlans.length})</h2>`;
    if (fPlans.length) {
      const groups = new Map<string, PlannedWork[]>();
      for (const p of fPlans) {
        const k = stationName(p.stationId);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(p);
      }
      // Station-wise groups
      for (const [station, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        body += `<h3>${esc(station)} (${items.length})</h3>`;
        body += `<table><tr><th>Title</th><th>Dept</th><th>Planned Date</th><th>Status</th><th>Material/Remarks</th></tr>`;
        for (const p of items) {
          body += `<tr><td>${esc(p.title)}</td><td>${esc(p.department ?? "")}</td><td>${fmtDate(p.plannedDate)}</td><td>${esc(p.status)}</td><td>${esc(p.materialRemarks)}</td></tr>`;
        }
        body += `</table>`;
      }
    } else body += `<p class="empty">No planned works in range.</p>`;
  }

  if (!filters.includeLogs && !filters.includeDeficiencies && !filters.includePlanned) {
    body += `<p class="empty">No sections selected for this report.</p>`;
  }

  exportDocument("Monthly S&T Report", body, "monthly");
}

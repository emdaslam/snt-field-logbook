import { exportDocument } from "@/lib/pdf";
import { fmtDate, toISODate, formatFootplateShifts, footplateTrainList, pcdoWorkEntries, counterResetsOf, formatRupee } from "@/lib/api";
import { formatInspectionDates } from "@/lib/inspections";
import { isSpecialMovement, EQUIPMENT_DEFAULTS, variableKmText, type ExportStyle } from "@/lib/types";
import { AUTO_TIMINGS } from "@/lib/timingsMode";
import { tripTimes, journeyTrainTimes, type TripTimes } from "@/lib/travel";
import { loadTaGenConfig, type TaGenWindow, type TaRateKey } from "@/lib/taGenConfig";
import { effectiveRequirement } from "@/lib/stock";
import type { XlsxCell, XlsxSheet, XlsxMerge } from "@/lib/xlsx";
import type {
  DeficiencyTask,
  PlannedWork,
  Station,
  DailyLog,
  Tag,
  Staff,
  FootplateDetail,
  FootplateBlock,
  FootplateJourneyTrain,
  FootplateJourney,
  Material,
  MaterialReceipt,
  MaterialUsage,
  MaterialTransfer,
  MaterialStation,
} from "@/db/schema";

function esc(s: string | null | undefined) {
  return (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/** ISO yyyy-mm-dd → dd-mm-yyyy (zero-padded day and month). */
function dmy(d: string): string {
  const [y, m, day] = d.split("-");
  return `${String(day).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
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

/** Money value rounded to paise (2 decimals) only — never to a whole rupee.
 *  TA amounts keep their decimals ("192.85"); 0.7 × a 2-decimal rate has at
 *  most 2 decimals exactly, so this never visibly changes the value. */
function money(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The TRAIN column label for one journey leg: the train number when the leg
 *  was by train, else "ROAD". A by-train leg without a recorded number still
 *  shows "TRAIN" so the column never silently falls back to road. */
function trainNoLabel(mode: string | null | undefined, trainNo: string | null | undefined): string {
  return mode === "train" ? (trainNo?.trim() || "TRAIN") : "ROAD";
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
  let body = `<h1 class="centered">Tomorrow's Work (${label})</h1>`;
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

  let body = `<h1 class="centered">PCDO — Special Works (${esc(period.label)})</h1>`;
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

  body += `<h1 class="centered" style="margin-top:34px">Disconnections (${esc(period.label)})</h1>`;
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

  body += `<h1 class="centered" style="margin-top:34px">Counter Resets (${esc(period.label)})</h1>`;
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
    // Manually overridden times (typed on the daily log) win; anything left
    // blank keeps the deterministic generated value.
    return {
      outDep: l.timeDep || t.outDep,
      outArr: l.timeArr || t.outArr,
      retDep: l.returnTimeDep || t.retDep,
      retArr: l.returnTimeArr || t.retArr,
    };
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
 * The four clock times for a Footplate day's road legs (HQ → boarding and the
 * final station → HQ). In the normal build they come from the journey fields
 * (timeDep / timeArr / returnTimeDep / returnTimeArr), shown verbatim or "not
 * entered in daily log" when missing. In the personal build they are generated
 * deterministically (see src/lib/travel.ts), with any typed value overriding
 * the generated one. The per-train leg times are handled in footplateLegs.
 */
function journeyTimes(
  l: DailyLog,
  boarding: MovementStation,
  date: string,
  taWin?: TaGenWindow
): TripTimes {
  if (AUTO_TIMINGS) {
    const t = tripTimes(
      date,
      l.taPercent ?? 100,
      boarding.travelMin,
      boarding.travelMax,
      taWin
    );
    // Manually overridden times win per field; blank ones keep the generated
    // value, so a partly edited day still stays on the 5-minute grid.
    return {
      outDep: l.timeDep || t.outDep,
      outArr: l.timeArr || t.outArr,
      retDep: l.returnTimeDep || t.retDep,
      retArr: l.returnTimeArr || t.retArr,
    };
  }
  const miss = "not entered in daily log";
  return {
    outDep: l.timeDep || miss,
    outArr: l.timeArr || miss,
    retDep: l.returnTimeDep || miss,
    retArr: l.returnTimeArr || miss,
  };
}

type JourneyLeg = {
  trainNo: string;
  dep: string;
  arr: string;
  from: string;
  to: string;
};

/** The train movements of a Footplate day in display order — each Day/Night
 *  shift's Up and Down trains, in the order they are ridden. */
function fpTrains(
  l: DailyLog
): Array<{ shift: string; dir: string; train: FootplateDetail }> {
  const out: Array<{ shift: string; dir: string; train: FootplateDetail }> = [];
  const push = (shift: string, b: FootplateBlock | FootplateDetail | null | undefined) => {
    if (!b) return;
    if ("direction" in b) {
      if (b.up?.trainNo) out.push({ shift, dir: "UP", train: b.up });
      if (b.down?.trainNo) out.push({ shift, dir: "DN", train: b.down });
    } else if (b.trainNo) {
      out.push({ shift, dir: "", train: b });
    }
  };
  push("Day", l.footplateDay);
  push("Night", l.footplateNight);
  if (l.footplateUp?.trainNo) out.push({ shift: "", dir: "UP", train: l.footplateUp });
  if (l.footplateDown?.trainNo) out.push({ shift: "", dir: "DN", train: l.footplateDown });
  return out;
}

/**
 * The legs of a Footplate day as export rows: HQ → boarding station (ROAD),
 * one row per train movement recorded on the Day/Night shifts, then the final
 * station → HQ (ROAD). Returns null when the journey or any train is missing.
 */
function footplateLegs(
  l: DailyLog,
  stations: Station[],
  hqCode: string,
  t: TripTimes
): JourneyLeg[] | null {
  const fj: FootplateJourney | null = l.footplateJourney ?? null;
  if (!fj) return null;
  const boarding = stations.find((s) => s.id === fj.boardingStationId);
  const otherEnd = stations.find((s) => s.id === fj.otherEndStationId);
  if (!boarding || !otherEnd || boarding.id === otherEnd.id) return null;
  const b = stationLabel(boarding);
  const o = stationLabel(otherEnd);
  const trains = fpTrains(l);
  if (trains.length === 0) return null;
  // In the auto build the boarding-station window is split into one slot per
  // train, and a typed boarding / alighting time overrides its slot (blank ones
  // keep the generated value); in the manual build the entered times are used
  // verbatim.
  const slots = AUTO_TIMINGS
    ? journeyTrainTimes(l.logDate, l.taPercent ?? 100, boarding.travelMin, boarding.travelMax, trains.length)
    : [];
  const miss = "not entered in daily log";
  const legs: JourneyLeg[] = [
    { trainNo: trainNoLabel(l.travelMode, l.travelTrainNo), dep: t.outDep, arr: t.outArr, from: hqCode, to: b },
  ];
  let lastTo = b;
  trains.forEach((tr, i) => {
    const up = tr.dir !== "DN";
    const from = up ? b : o;
    const to = up ? o : b;
    lastTo = to;
    const train = tr.train as FootplateJourneyTrain;
    const slot = slots[i];
    legs.push({
      trainNo: tr.train.trainNo || "---",
      dep: AUTO_TIMINGS ? train.depTime || slot?.dep || miss : train.depTime || miss,
      arr: AUTO_TIMINGS ? train.arrTime || slot?.arr || miss : train.arrTime || miss,
      from,
      to,
    });
  });
  legs.push({ trainNo: trainNoLabel(l.returnMode, l.returnTrainNo), dep: t.retDep, arr: t.retArr, from: lastTo, to: hqCode });
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
      return ["AVAILED LEAVE", l.leaveKind?.trim() ? l.leaveKind.toUpperCase() : "LEAVE"];
    case "cr":
      return [l.crFrom ? `AVAILED CR OF ${dmy(l.crFrom)}` : "AVAILED CR", "CR"];
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

/** Uppercase the body HTML text for the reference-look exports, except
 *  elements marked class="nocaps" (the TA certification line stays in
 *  sentence case, with its <u>underline</u> markup preserved). Tags and
 *  attributes are untouched. */
function upperText(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  const upper = (el: Element) => {
    if (el.classList.contains("nocaps")) return;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = (node.textContent ?? "").toUpperCase();
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        upper(node as Element);
      }
    }
  };
  upper(root);
  return root.innerHTML;
}

/** Uppercase every string cell of an Excel grid (numbers and styles kept),
 *  except cells marked noCaps (the TA certification line stays sentence case). */
function upperSheet(sheet: XlsxSheet): XlsxSheet {
  return {
    ...sheet,
    rows: sheet.rows.map((row) =>
      row.map((c) => {
        if (typeof c === "object" && typeof c.v === "string" && c.noCaps) return c;
        if (typeof c === "object" && typeof c.v === "string") return { ...c, v: c.v.toUpperCase() };
        return typeof c === "string" ? c.toUpperCase() : c;
      })
    ),
  };
}

/**
 * Render a grid and its merge ranges into table HTML for the PDF / Word
 * outputs, honouring vertical merges (rowspan) and horizontal merges
 * (colspan) so those formats visually merge the same cells the Excel sheet
 * merges. `dateCol` marks the column rendered with class="date" (fixed-width
 * in the PDF); `centerCols` marks columns that get data-align="center";
 * `valignCols` marks columns whose cells get data-valign="middle" (kept left
 * horizontally — used for the nature-of-work column, which centres
 * vertically but stays left aligned); `vTextCols` marks columns whose
 * non-empty cells render their text vertically (one character per line) via
 * class="vtext" in PDF and Word.
 */
function gridHtml(
  grid: (string | number | XlsxCell)[][],
  merges: XlsxMerge[],
  opts: { dateCol?: number; centerCols?: Set<number>; leftCols?: Set<number>; valignCols?: Set<number>; vTextCols?: Set<number>; fontCols?: Set<number> } = {}
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
      else if (opts.leftCols?.has(c)) attrs += ' data-align="left"';
      if (opts.valignCols?.has(c)) attrs += ' data-valign="middle"';
      // data-font lets the PDF renderer pick a font that carries the rupee
      // sign (jsPDF's standard Helvetica can't draw U+20B9).
      if (opts.fontCols?.has(c) && txt.trim()) attrs += ' data-font="rupee"';
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
 * PDF / Word display form of a TA grid cell. The official G.A.31 form prints
 * dates as dd-mm-yyyy ("01-06-2026"), the DAYS column as "100%" and amounts as
 * ₹ 1,000 — while the Excel sheet keeps its own (untouched) format. Only the
 * rendered PDF / Word body uses this; the xlsx grid is left exactly as built.
 */
function pdfGridOf(grid: (string | number | XlsxCell)[][]): (string | number | XlsxCell)[][] {
  return grid.map((row) =>
    row.map((c, ci) => {
      const t = cellText(c);
      if (ci === 0 && t) {
        const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
        if (m) return `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}`;
      }
      if (ci === 7 && t) {
        const m = /^(\d+)(?:\.(\d+))?%$/.exec(t);
        if (m) return `${Number(m[1])}%`;
      }
      if (ci === 8 && t && /^\d+(?:\.\d+)?$/.test(t)) {
        return `₹ ${formatRupee(Number(t))}`;
      }
      return c;
    })
  );
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
  me: Staff | undefined,
  out: (title: string, body: string, type: string, sheet?: XlsxSheet, opts?: { onePage?: boolean; twoPageBody?: string; style?: ExportStyle; cellPad?: number }) => void = exportDocument
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

  // Display rows (grid + xlsx share the same data). The rows for a subset of
  // days build one table, so the two-page layout can render the first ~half of
  // the month's days and the remaining days as two separate tables.
  const buildGrid = (keys: string[]): { grid: (string | number)[][]; merges: XlsxMerge[] } => {
    const grid: (string | number)[][] = [];
    const merges: XlsxMerge[] = [];
    for (const date of keys) {
      const dayLogs = days.get(date)!;
      const primary = preferTaLog(dayLogs, hq);
      let work = mergeWork(dayLogs) || "-";
      const sp = specialPair(primary);
      if (sp) {
        const r = grid.length;
        grid.push([dmy(date), sp[0], "", "", "", "", sp[1]]);
        merges.push([r, 1, r, 5]); // train-no..to collapse into the label
        continue;
      }
      const st = movementStation(primary, stations);
      // A variable-distance station carries its KMs marker in the work text when
      // the log confirms the work was done at/after that marker (> 8 km side).
      const varKm = variableKmText(st?.match?.variableKm);
      if (
        st?.match?.distanceFromHq === "variable" &&
        primary.taAtVariableKm === true &&
        varKm != null
      ) {
        work = `${work} at ${varKm} KMs`;
      }
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
        trainNoLabel(primary.travelMode, primary.travelTrainNo),
        t.outDep,
        t.outArr,
        hqCode,
        st.code,
        work,
      ]);
      grid.push(["", trainNoLabel(primary.returnMode, primary.returnTrainNo), t.retDep, t.retArr, st.code, hqCode, ""]);
      merges.push([r, 0, r + 1, 0], [r, 6, r + 1, 6]); // date + work span both legs
    }
    return { grid, merges };
  };

  const dayKeys = Array.from(days.keys());
  const { grid, merges } = buildGrid(dayKeys);
  // Two-page layout: the first 15/16 days (half the month, rounded up) go on
  // page 1, the remaining days on page 2 — only when a second half exists.
  const half = Math.ceil(dayKeys.length / 2);
  const halves =
    half < dayKeys.length
      ? [buildGrid(dayKeys.slice(0, half)), buildGrid(dayKeys.slice(half))]
      : null;

  const who = me?.name || me?.designation ? `${me?.name?.toUpperCase() ?? ""}, ${me?.designation?.toUpperCase() ?? ""}`.replace(/^,\s*|,\s*$/g, "") : "";
  const titleText = who
    ? `DIARY OF SRI ${who} FOR THE MONTH OF ${monthStamp(period.label)}`
    : `Diary — ${period.label}`;

  let body = `<h1 class="centered tight">${esc(titleText)}</h1>`;
  let twoPageBody = body;

  if (rows.length === 0) {
    body += `<p class="empty">No diary entries in this period.</p>`;
    twoPageBody = body;
  } else {
    const headerRow = `<tr><th class="date" data-width="56" data-align="center">DATE</th><th data-width="34" data-align="center">TRAIN NO</th><th data-width="32" data-align="center">TIME DEP</th><th data-width="32" data-align="center">TIME ARR</th><th data-width="34" data-align="center">FROM</th><th data-width="34" data-align="center">TO</th><th data-align="center">NATURE OF WORK</th></tr>`;
    const diaryTable = (g: (string | number)[][], m: XlsxMerge[]) =>
      `<table>${headerRow}${gridHtml(g, m, { dateCol: 0, centerCols: new Set([0, 1, 2, 3, 4, 5]), leftCols: new Set([6]), valignCols: new Set([6]) })}</table>`;
    const signature = me?.designation
      ? `<p class="right" data-right-pad="36" data-space-top="16"><strong>${esc(me.designation.toUpperCase())}</strong></p>`
      : "";

    body += diaryTable(grid, merges) + signature;
    // Two-page body: table (first ~half) + page-break marker + table (rest).
    // The PDF / Word renderers honour the marker; the Excel sheet stays one
    // continuous grid.
    twoPageBody += halves
      ? diaryTable(halves[0].grid, halves[0].merges) +
        `<div class="page-break"></div>` +
        diaryTable(halves[1].grid, halves[1].merges) +
        signature
      : diaryTable(grid, merges) + signature;
  }

  const allMerges: XlsxMerge[] = [
    [0, 0, 0, 6],
    ...merges.map(([r1, c1, r2, c2]) => [r1 + 2, c1, r2 + 2, c2] as XlsxMerge),
  ];
  const sheet: XlsxSheet = {
    rows: [
      [{ v: titleText, bold: true }],
      ["DATE", "TRAIN NO", "TIME DEP", "TIME ARR", "FROM", "TO", "NATURE OF WORK"].map(
        (h) => styled(h, { center: true })
      ),
      ...grid.map(
        (g) => g.map((c, i) => (i === 6 ? styled(c, { wrap: true }) : styled(c, { center: true }))) as XlsxCell[]
      ),
    ],
    merges: allMerges,
    colWidths: [10.3, 6, 6, 6, 6, 6, 63],
  };

  out(`Diary ${period.label}`, upperText(body), "diary", upperSheet(sheet), {
    onePage: true,
    twoPageBody: upperText(twoPageBody),
    style: "plain",
    cellPad: 2,
  });
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
  me: Staff | undefined,
  out: (title: string, body: string, type: string, sheet?: XlsxSheet, opts?: { onePage?: boolean; twoPageBody?: string; style?: ExportStyle }) => void = exportDocument
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
    const dist = st.match?.distanceFromHq;
    // A station fixed at "above8" always qualifies. A "variable" station
    // qualifies only when the log says the work was done at/after its KMs
    // marker (the > 8 km side), and the work text then carries that marker.
    if (dist === "variable") {
      if (primary.taAtVariableKm !== true) continue;
      const km = variableKmText(st.match?.variableKm);
      const base = mergeWork(dayLogs) || "-";
      taDays.push({
        log: primary,
        work: km != null ? `${base} at ${km} KMs` : base,
      });
      continue;
    }
    if (dist !== "above8") continue;
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
  const totalAmount = taRate != null ? money(totalDays * taRate) : null;
  const rateMissingText = "Rate not set (Settings → Staff Details)";
  const amountCell = (p: number): string | number =>
    taRate != null ? money((p / 100) * taRate) : rateMissingText;

  // Build the TA table grid for a set of TA days. A day produces a vertical
  // two-leg row pair (the journey out and the return), and the vertical KMS
  // note spans every row of the table (the full-column merge is added here so
  // each half of a two-page layout gets its own note over its own rows).
  const buildTaGrid = (
    days: { log: DailyLog; work: string }[]
  ): { grid: XlsxCell[][]; merges: XlsxMerge[] } => {
    const grid: XlsxCell[][] = [];
    const merges: XlsxMerge[] = [];
    const dataStart = grid.length;
    for (const d of days) {
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
              styled(leg.trainNo, { center: true }),
              styled(leg.dep, { center: true }),
              styled(leg.arr, { center: true }),
              styled(leg.from, { center: true }),
              styled(leg.to, { center: true }),
              styled("", { center: true }),
              styled(i === 0 ? `${p}%` : "", { center: true }),
              styled(i === 0 ? amountCell(p) : "", { center: true }),
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
            styled("---", { center: true }),
            styled("---", { center: true }),
            styled("---", { center: true }),
            styled("FOOTPLATE", { center: true }),
            styled("", { center: true }),
            styled("", { center: true }),
            styled(`${p}%`, { center: true }),
            styled(amountCell(p), { center: true }),
            styled(d.work, { wrap: true }),
          ]);
        }
        continue;
      }
      const st = movementStation(l, stations)!;
      const t = diaryTimes(l, st, l.logDate, taCfg ? taCfg[taRateKey(l.taPercent)] : undefined);
      grid.push([
        styled(dmy(l.logDate), { center: true }),
        styled(trainNoLabel(l.travelMode, l.travelTrainNo), { center: true }),
        styled(t.outDep, { center: true }),
        styled(t.outArr, { center: true }),
        styled(hqCode, { center: true }),
        styled(st.code, { center: true }),
        styled("", { center: true }),
        styled(`${p}%`, { center: true }),
        styled(amountCell(p), { center: true }),
        styled(d.work, { wrap: true }),
      ]);
      grid.push([
        styled("", { center: true }),
        styled(trainNoLabel(l.returnMode, l.returnTrainNo), { center: true }),
        styled(t.retDep, { center: true }),
        styled(t.retArr, { center: true }),
        styled(st.code, { center: true }),
        styled(hqCode, { center: true }),
        styled("", { center: true }),
        styled("", { center: true }),
        styled("", { center: true }),
        styled("", { center: true }),
      ]);
      merges.push([r, 0, r + 1, 0], [r, 7, r + 1, 7], [r, 8, r + 1, 8], [r, 9, r + 1, 9]);
    }
    const dataEnd = grid.length - 1;
    if (dataStart <= dataEnd) {
      merges.push([dataStart, 6, dataEnd, 6]); // KMS note spans all rows
      grid[dataStart][6] = styled(KMS_NOTE_VERT, { center: true, wrap: true });
    }
    return { grid, merges };
  };
  const { grid, merges } = buildTaGrid(taDays);
  // Two-page layout: the first half of the TA days go on page 1 and the rest
  // on page 2 — only when a second half exists.
  const half = Math.ceil(taDays.length / 2);
  const halves = half < taDays.length ? [buildTaGrid(taDays.slice(0, half)), buildTaGrid(taDays.slice(half))] : null;

  const month = monthStamp(period.label);
  const name = me?.name ? `Name: ${me.name}` : "Name: not updated in profile";
  const designation = me?.designation ? `Designation: ${me.designation}` : "Designation: not updated in profile";
  const pf = me?.pfNo ? `P.F.NO: ${me.pfNo}` : "P.F.NO: not updated in profile";
  const bu = me?.buNo ? `B.U.No: ${me.buNo}` : "B.U.No: not updated in profile";
  const payMetric = me?.payMetric?.trim() ? `Pay Metric: ${me.payMetric.trim()}` : "";
  const pay = me?.pay?.trim() ? `Pay: ${me.pay.trim()}` : "";

  const cert =
    "I here certify that the above mentioned employee was absent on duty from his headquarters station during the period charged for in the bill on Railway Business.";

  // The TA table's two-tier header (DATE / TRAIN NO / TIME DEPT+ARR / STATION
  // FROM+TO / KMS / DAYS / AMOUNT / NATURE OF WORK) — shared by the single
  // table and each half of the two-page layout, so every page repeats its own
  // column heading.
  const taHead =
    `<tr><th rowspan="2" class="date" data-width="56" data-align="center">DATE</th><th rowspan="2" data-width="40" data-align="center">TRAIN NO</th><th colspan="2" data-align="center">TIME</th><th colspan="2" data-align="center">STATION</th><th rowspan="2" data-width="30" data-align="center">KMS</th><th rowspan="2" data-width="32" data-align="center">DAYS</th><th rowspan="2" data-width="56" data-align="center">AMOUNT</th><th rowspan="2" data-width="90" data-align="center">NATURE OF WORK</th></tr>` +
    `<tr><th data-width="36" data-align="center">TIME DEPT</th><th data-width="36" data-align="center">TIME ARR</th><th data-width="40" data-align="center">FROM</th><th data-width="40" data-align="center">TO</th></tr>`;
  const taGridHtml = (g: XlsxCell[][], m: XlsxMerge[]) =>
    gridHtml(pdfGridOf(g), m, { dateCol: 0, centerCols: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]), leftCols: new Set([9]), vTextCols: new Set([6]), fontCols: new Set([8]), valignCols: new Set([9]) });
  // The TOTAL row closes the table. In the two-page layout it sits at the end
  // of the second table only, so page 1's table carries just the day rows.
  const taTotalRow =
    `<tr><td colspan="7" data-align="center"><strong>TOTAL NO. OF DAYS</strong></td><td><strong>${daysLabel(totalDays)} DAYS</strong></td><td data-font="rupee" data-align="center"><strong>${rateNotSet ? esc(rateMissingText) : `₹ ${formatRupee(totalAmount!)}`}</strong></td><td></td></tr>`;
  const taTable = (g: XlsxCell[][], m: XlsxMerge[], withTotal: boolean) =>
    `<table>${taHead}${taGridHtml(g, m)}${withTotal ? taTotalRow : ""}</table>`;
  // The summary by rate, the signing lines and the certification, which follow
  // the table (in the two-page layout they land at the end of the second page).
  const taFooter =
    `<p class="cols" data-cols="46,83,115"><span>100%</span><span>X ${n100}</span><span>= ${daysLabel(days100)} DAYS</span></p>` +
    `<p class="cols" data-cols="46,83,115"><span>70%</span><span>X ${n70}</span><span>= ${daysLabel(days70)} DAYS</span></p>` +
    `<p class="cols" data-cols="46,83,115"><span>30%</span><span>X ${n30}</span><span>= ${daysLabel(days30)} DAYS</span></p>` +
    `<p class="cols" data-cols="55"><span>${"".padEnd(24, "_")}</span></p>` +
    `<p class="cols" data-cols="46,83,115"><span><strong>TOTAL</strong></span><span></span><span>= ${daysLabel(totalDays)} DAYS</span></p>` +
    `<p class="meta nocaps">I here certify that the above mentioned <u>employee</u> was absent on duty from his headquarters station during the period charged for in the bill on Railway Business.</p>` +
    `<p class="cols" data-cols="0,190,390" data-space-top="24"><span>${"".padEnd(20, "_")}</span><span>${"".padEnd(19, "_")}</span><span>${"".padEnd(22, "_")}</span></p>` +
    `<p class="cols sigs" data-cols="0,190,390"><span>CONTROLLING OFFICER</span><span>HEAD OF OFFICE</span><span>SIGNATURE OF OFFICER/ CLAIMING TA</span></p>`;

  let body = `<h1 class="centered tight" data-right-note="IN LIEU OF G.A.31">SOUTH COAST RAILWAY. GUNTAKAL DIVISION</h1>`;
  body += `<h2 class="centered">TRAVELLING ALLOWANCE JOURNAL</h2>`;
  body += `<p class="cols" data-cols="0,150,300,450"><span>${esc(name)}</span><span>${esc(designation)}</span><span>${esc(pf)}</span><span>${esc(payMetric)}</span></p>`;
  body += `<p class="cols" data-cols="0,150,300,450"><span>${esc(`Headquarters: ${hqCode}`)}</span><span>${esc(`Month: ${month}`)}</span><span>${esc(bu)}</span><span>${esc(pay)}</span></p>`;
  let twoPageBody = body;

  if (taDays.length === 0) {
    body += `<p class="empty">No TA days in this period.</p>`;
    twoPageBody = body;
  } else {
    body += taTable(grid, merges, true) + taFooter;
    // Two-page body: table (first ~half) + page-break marker + table (rest,
    // with the TOTAL row) + summary/cert/signature. The PDF / Word renderers
    // honour the marker; the Excel sheet stays one continuous grid.
    twoPageBody += halves
      ? taTable(halves[0].grid, halves[0].merges, false) +
        `<div class="page-break"></div>` +
        taTable(halves[1].grid, halves[1].merges, true) +
        taFooter
      : taTable(grid, merges, true) + taFooter;
  }

  const summaryRows: XlsxSheet["rows"] = [
    [{ v: "SOUTH COAST RAILWAY. GUNTAKAL DIVISION", bold: true, center: true }],
    [{ v: "TRAVELLING ALLOWANCE JOURNAL", bold: true, center: true }],
    [name, "", "", designation, "", "", "", { v: pf, bold: false }, "", payMetric],
    [`Headquarters: ${hqCode}`, "", "", `Month: ${month}`, "", "", "", { v: bu, bold: false }, "", pay],
    [
      styled("DATE", { center: true }),
      styled("TRAIN NO", { center: true }),
      styled("TIME", { center: true }),
      styled("", { center: true }),
      styled("STATION", { center: true }),
      styled("", { center: true }),
      styled("KMS", { center: true }),
      styled("TA %", { center: true }),
      styled("AMOUNT", { center: true }),
      styled("NATURE OF WORK", { center: true }),
    ],
    [
      styled("", { center: true }),
      styled("", { center: true }),
      styled("TIME DEPT", { center: true }),
      styled("TIME ARR", { center: true }),
      styled("FROM", { center: true }),
      styled("TO", { center: true }),
      styled("", { center: true }),
      styled("", { center: true }),
      styled("", { center: true }),
      styled("", { center: true }),
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
  const certRow = s + 8;
  const sigLab = s + 12;
  mergesAll.push(
    [t1, 0, t1, 6], // TOTAL NO. OF DAYS spans A:G
    [line, 1, line, 4], // underline
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
    [{ v: cert, bold: false, noCaps: true, underlineWord: "employee" }, "", "", "", "", "", "", "", "", ""],
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

  out(`TA Journal ${period.label}`, upperText(body), "ta", upperSheet(sheet), {
    onePage: true,
    twoPageBody: upperText(twoPageBody),
    style: "plain",
  });
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

  let body = `<h1 class="centered">${esc(kindLabel)} — ${esc(period.label)}</h1>`;
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

  let body = `<h1 class="centered">Monthly S&amp;T Report</h1>`;
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

/** Format a quantity, dropping trailing zeros (50 → "50", 2.5 → "2.5"). */
function fmtQty(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** Total quantity received for a material. */
function materialReceivedTotal(materialId: number, receipts: MaterialReceipt[]): number {
  return receipts.filter((r) => r.materialId === materialId).reduce((n, r) => n + r.qty, 0);
}

/** Total quantity used for a material. */
function materialUsedTotal(materialId: number, usages: MaterialUsage[]): number {
  return usages.filter((u) => u.materialId === materialId).reduce((n, u) => n + u.qty, 0);
}

/** How much of one received batch is still in stock: its quantity minus what
 *  has been used and what has been transferred away from that batch. */
function receiptAvailable(
  receipt: MaterialReceipt,
  usages: MaterialUsage[],
  transfers: MaterialTransfer[]
): number {
  const used = usages.filter((u) => u.receiptId === receipt.id).reduce((n, u) => n + u.qty, 0);
  const moved = transfers.filter((t) => t.receiptId === receipt.id).reduce((n, t) => n + t.qty, 0);
  return receipt.qty - used - moved;
}

/** Short label of a received batch: "12 · 01-08-2026 · IPS Room · birwa". */
export function receiptLabel(
  r: MaterialReceipt,
  unit?: string,
  stationName?: (id: number | null) => string
): string {
  const parts: string[] = [];
  parts.push(unit ? `${fmtQty(r.qty)} ${unit}` : String(fmtQty(r.qty)));
  if (r.date) parts.push(r.date.slice(0, 10));
  if (stationName && r.stationId != null) parts.push(stationName(r.stationId));
  if (r.room) parts.push(r.room);
  if (r.remarks) parts.push(r.remarks);
  return parts.join(" · ");
}

export type StationMaterialRow = {
  materialId: number;
  name: string;
  unit: string;
  /** Effective required quantity at this station (override or material default). */
  requiredQty: number;
  /** Effective minimum spare at this station (override or material default). */
  minRequiredSpare: number;
  received: number;
  used: number;
  /** Quantity transferred away from this station. */
  transferredOut: number;
  /** Quantity transferred into this station. */
  transferredIn: number;
  inHand: number;
};

export type StationMaterialSummary = {
  stationId: number | null;
  stationLabel: string;
  rows: StationMaterialRow[];
  requiredTotal: number;
  receivedTotal: number;
  usedTotal: number;
  transferredTotal: number;
  inHandTotal: number;
};

/** Aggregate receipts, usage and transfers per station, per material. Stations
 *  that only appear on receipts, only on usage rows or only on transfers still
 *  get a summary (the empty sides show 0). The label comes from the caller's
 *  stationName callback. Each row also carries the station's effective required
 *  quantity and minimum spare (a materialStations override, else the material's
 *  defaults). */
export function stationMaterialSummaries(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stationName: (id: number | null) => string,
  transfers?: MaterialTransfer[]
): StationMaterialSummary[] {
  const byStation = new Map<
    number | null,
    Map<number, { received: number; used: number; out: number; in: number }>
  >();
  const agg = (
    stationId: number | null,
    materialId: number,
    receivedDelta: number,
    usedDelta: number,
    outDelta: number,
    inDelta: number
  ) => {
    const mat = byStation.get(stationId) ?? new Map<number, { received: number; used: number; out: number; in: number }>();
    const cur = mat.get(materialId) ?? { received: 0, used: 0, out: 0, in: 0 };
    cur.received += receivedDelta;
    cur.used += usedDelta;
    cur.out += outDelta;
    cur.in += inDelta;
    mat.set(materialId, cur);
    byStation.set(stationId, mat);
  };
  for (const r of receipts) agg(r.stationId, r.materialId, r.qty, 0, 0, 0);
  for (const u of usages) agg(u.stationId, u.materialId, 0, u.qty, 0, 0);
  if (transfers) {
    for (const t of transfers) {
      agg(t.fromStationId, t.materialId, 0, 0, t.qty, 0);
      agg(t.toStationId, t.materialId, 0, 0, 0, t.qty);
    }
  }

  const out: StationMaterialSummary[] = [];
  for (const [stationId, mat] of byStation) {
    const rows: StationMaterialRow[] = [];
    let requiredTotal = 0;
    let receivedTotal = 0;
    let usedTotal = 0;
    let transferredTotal = 0;
    let inTotal = 0;
    for (const [materialId, e] of mat) {
      const m = materials.find((x) => x.id === materialId);
      const req = effectiveRequirement(m!, materialStations, stationId);
      rows.push({
        materialId,
        name: m?.name ?? "Unnamed material",
        unit: m?.unit ?? "",
        requiredQty: req.requiredQty,
        minRequiredSpare: req.minRequiredSpare,
        received: e.received,
        used: e.used,
        transferredOut: e.out,
        transferredIn: e.in,
        inHand: e.received - e.used - e.out + e.in,
      });
      requiredTotal += req.requiredQty;
      receivedTotal += e.received;
      usedTotal += e.used;
      transferredTotal += e.out;
      inTotal += e.in;
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    out.push({
      stationId,
      stationLabel: stationName(stationId),
      rows,
      requiredTotal,
      receivedTotal,
      usedTotal,
      transferredTotal,
      inHandTotal: receivedTotal - usedTotal - transferredTotal + inTotal,
    });
  }
  return out.sort((a, b) => a.stationLabel.localeCompare(b.stationLabel));
}

/**
 * Materials report — the required list, every receipt (how many, at which
 * station, which room, where exactly it was placed) and every issue (how many
 * used and for what purpose), with running balances. "Required" is the
 * outstanding requirement (the original requirement minus what was received),
 * so it drops as material arrives.
 */
export function exportMaterials(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stations: Station[],
  transfers?: MaterialTransfer[]
) {
  exportDocument("Materials Report", materialsReportBody(materials, materialStations, receipts, usages, stations, transfers), "materials");
}

/** HTML body of the materials report (see exportMaterials). Split out so it is
 *  easy to verify headlessly. */
export function materialsReportBody(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stations: Station[],
  transfers?: MaterialTransfer[]
): string {
  const stationName = (id: number | null) =>
    id == null ? "Station not set" : stations.find((s) => s.id === id)?.name ?? "Unassigned";
  const qty = (n: number, unit: string) => `${fmtQty(n)} ${unit}`;
  const equipmentOf = (m: Material) => (m.equipment || "general").trim() || "general";
  // Equipment order: the fixed default list first, then anything else in
  // first-appearance order (custom equipment added by the user).
  const equipmentOrder: string[] = [];
  const seenEq = new Set<string>();
  for (const d of EQUIPMENT_DEFAULTS) {
    if (materials.some((m) => equipmentOf(m) === d)) {
      seenEq.add(d);
      equipmentOrder.push(d);
    }
  }
  for (const m of materials) {
    const eq = equipmentOf(m);
    if (!seenEq.has(eq)) {
      seenEq.add(eq);
      equipmentOrder.push(eq);
    }
  }
  const byEquipment = (eq: string) => materials.filter((m) => equipmentOf(m) === eq);

  let summaryRows = "";
  for (const eq of equipmentOrder) {
    summaryRows += `<tr><td colspan="5"><strong>${esc(eq)}</strong></td></tr>`;
    for (const m of byEquipment(eq)) {
      const received = materialReceivedTotal(m.id, receipts);
      const used = materialUsedTotal(m.id, usages);
      const inHand = received - used;
      const remaining = Math.max(0, m.requiredQty - received);
      summaryRows += `<tr><td>${esc(m.name)}</td><td data-align="center">${qty(remaining, m.unit)}</td><td data-align="center">${qty(received, m.unit)}</td><td data-align="center">${qty(used, m.unit)}</td><td data-align="center">${qty(inHand, m.unit)}</td></tr>`;
    }
  }

  let body = `<h1>Materials Report</h1>`;
  body += `<p class="meta">Generated ${fmtDate(toISODate(new Date()))} · ${materials.length} material${materials.length !== 1 ? "s" : ""} on the required list</p>`;

  if (materials.length === 0) {
    body += `<p class="empty">No materials on the required list yet. Add materials in the app first.</p>`;
    return body;
  }

  body += `<h2>Summary (grouped by equipment)</h2>`;
  body += `<table><tr><th>Material</th><th data-align="center">Required</th><th data-align="center">Received</th><th data-align="center">Used</th><th data-align="center">In Hand</th></tr>${summaryRows}</table>`;

  /* ---------- Station-wise summary ---------- */
  const stationSummaries = stationMaterialSummaries(materials, materialStations, receipts, usages, stationName, transfers);
  body += `<h2>Station-wise Summary</h2>`;
  if (stationSummaries.length === 0) {
    body += `<p class="empty">No receipts, usage or transfers recorded yet.</p>`;
  } else {
    body += `<table><tr><th>Station</th><th>Material</th><th data-align="center">Required</th><th data-align="center">Received</th><th data-align="center">Used</th><th data-align="center">Transferred out</th><th data-align="center">Transferred in</th><th data-align="center">In Hand</th></tr>`;
    for (const s of stationSummaries) {
      for (const r of s.rows) {
        body += `<tr><td>${esc(s.stationLabel)}</td><td>${esc(r.name)}</td><td data-align="center">${qty(r.requiredQty, r.unit)}</td><td data-align="center">${qty(r.received, r.unit)}</td><td data-align="center">${qty(r.used, r.unit)}</td><td data-align="center">${r.transferredOut ? qty(r.transferredOut, r.unit) : "-"}</td><td data-align="center">${r.transferredIn ? qty(r.transferredIn, r.unit) : "-"}</td><td data-align="center">${qty(r.inHand, r.unit)}</td></tr>`;
      }
      body += `<tr><td><strong>${esc(s.stationLabel)} — Total</strong></td><td></td><td data-align="center"><strong>${fmtQty(s.requiredTotal)}</strong></td><td data-align="center"><strong>${fmtQty(s.receivedTotal)}</strong></td><td data-align="center"><strong>${fmtQty(s.usedTotal)}</strong></td><td data-align="center"><strong>${s.transferredTotal ? fmtQty(s.transferredTotal) : "-"}</strong></td><td data-align="center"></td><td data-align="center"><strong>${fmtQty(s.inHandTotal)}</strong></td></tr>`;
    }
    body += `</table>`;
  }

  for (const eq of equipmentOrder) {
    for (const m of byEquipment(eq)) {
      const received = materialReceivedTotal(m.id, receipts);
      const used = materialUsedTotal(m.id, usages);
      const transferred = transfers?.filter((t) => t.materialId === m.id).reduce((n, t) => n + t.qty, 0) ?? 0;
      const remaining = Math.max(0, m.requiredQty - received);
      const mReceipts = receipts
        .filter((r) => r.materialId === m.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const mUsages = usages
        .filter((u) => u.materialId === m.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const mTransfers = transfers
        ? transfers
            .filter((t) => t.materialId === m.id)
            .sort((a, b) => b.date.localeCompare(a.date))
        : [];
      body += `<h2>${esc(m.name)}</h2>`;
      body += `<p class="meta">Equipment: ${esc(eq)} · Required: ${qty(remaining, m.unit)} · Received: ${qty(received, m.unit)} · Used: ${qty(used, m.unit)} · Transferred: ${qty(transferred, m.unit)} · In hand: ${qty(received - used, m.unit)}</p>`;

      body += `<h3>Received (${mReceipts.length})</h3>`;
      if (mReceipts.length) {
        body += `<table><tr><th class="date">Date</th><th data-align="center">Qty</th><th>Station</th><th>Room</th><th>Remarks</th><th data-align="center">In hand</th></tr>`;
        for (const r of mReceipts) {
          const avail = receiptAvailable(r, usages, transfers ?? []);
          body += `<tr><td>${dmy(r.date)}</td><td data-align="center">${qty(r.qty, m.unit)}</td><td>${esc(stationName(r.stationId) || "-")}</td><td>${esc(r.room) || "-"}</td><td>${esc(r.remarks) || "-"}</td><td data-align="center">${qty(avail, m.unit)}</td></tr>`;
        }
        body += `</table>`;
      } else body += `<p class="empty">No receipts recorded.</p>`;

      body += `<h3>Used (${mUsages.length})</h3>`;
      if (mUsages.length) {
        body += `<table><tr><th class="date">Date</th><th data-align="center">Qty</th><th>Station</th><th>Purpose</th><th>From batch</th></tr>`;
        for (const u of mUsages) {
          const batch = u.receiptId != null ? mReceipts.find((r) => r.id === u.receiptId) : null;
          const batchLabel = batch ? receiptLabel(batch, m.unit, stationName) : "-";
          body += `<tr><td>${dmy(u.date)}</td><td data-align="center">${qty(u.qty, m.unit)}</td><td>${esc(stationName(u.stationId) || "-")}</td><td>${esc(u.purpose) || "-"}</td><td>${esc(batchLabel)}</td></tr>`;
        }
        body += `</table>`;
      } else body += `<p class="empty">No usage recorded.</p>`;

      body += `<h3>Transferred (${mTransfers.length})</h3>`;
      if (mTransfers.length) {
        body += `<table><tr><th class="date">Date</th><th data-align="center">Qty</th><th>From</th><th>To</th><th>Batch</th><th>Room / Remarks</th></tr>`;
        for (const t of mTransfers) {
          const batch = t.receiptId != null ? mReceipts.find((r) => r.id === t.receiptId) : null;
          const batchLabel = batch ? receiptLabel(batch, m.unit, stationName) : "-";
          const where = [t.room, t.remarks].filter(Boolean).join(" · ");
          body += `<tr><td>${dmy(t.date)}</td><td data-align="center">${qty(t.qty, m.unit)}</td><td>${esc(stationName(t.fromStationId) || "-")}</td><td>${esc(stationName(t.toStationId) || "-")}</td><td>${esc(batchLabel)}</td><td>${esc(where) || "-"}</td></tr>`;
        }
        body += `</table>`;
      } else body += `<p class="empty">No transfers recorded.</p>`;
    }
  }

  return body;
}

/** HTML body of the in-hand materials export (see exportInHandMaterials). */
export function inHandMaterialsReportBody(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stations: Station[],
  transfers?: MaterialTransfer[]
): string {
  const stationName = (id: number | null) =>
    id == null ? "Station not set" : stations.find((s) => s.id === id)?.name ?? "Unassigned";
  const qty = (n: number, unit: string) => `${fmtQty(n)} ${unit}`;

  let body = `<h1>In-Hand Materials Report</h1>`;
  body += `<p class="meta">Generated ${fmtDate(toISODate(new Date()))} · ${materials.length} material${materials.length !== 1 ? "s" : ""} on the required list</p>`;

  if (materials.length === 0) {
    body += `<p class="empty">No materials on the required list yet. Add materials in the app first.</p>`;
    return body;
  }

  /* ---------- Overall in-hand summary ---------- */
  body += `<h2>Overall In-Hand Summary</h2>`;
  let overallRows = "";
  for (const m of [...materials].sort((a, b) => a.name.localeCompare(b.name))) {
    const received = materialReceivedTotal(m.id, receipts);
    const used = materialUsedTotal(m.id, usages);
    const inHand = received - used;
    overallRows += `<tr><td>${esc(m.name)}</td><td data-align="center">${qty(received, m.unit)}</td><td data-align="center">${qty(used, m.unit)}</td><td data-align="center"><strong>${qty(inHand, m.unit)}</strong></td></tr>`;
  }
  body += `<table><tr><th>Material</th><th data-align="center">Received</th><th data-align="center">Used</th><th data-align="center">In Hand</th></tr>${overallRows}</table>`;

  /* ---------- Station-wise in-hand ---------- */
  body += `<h2>Station-wise In-Hand</h2>`;
  const stationSummaries = stationMaterialSummaries(materials, materialStations, receipts, usages, stationName, transfers);
  if (stationSummaries.length === 0) {
    body += `<p class="empty">No receipts, usage or transfers recorded yet.</p>`;
  } else {
    body += `<table><tr><th>Station</th><th>Material</th><th data-align="center">Received</th><th data-align="center">Used</th><th data-align="center">Transferred out</th><th data-align="center">Transferred in</th><th data-align="center">In Hand</th></tr>`;
    for (const s of stationSummaries) {
      for (const r of s.rows) {
        body += `<tr><td>${esc(s.stationLabel)}</td><td>${esc(r.name)}</td><td data-align="center">${qty(r.received, r.unit)}</td><td data-align="center">${qty(r.used, r.unit)}</td><td data-align="center">${r.transferredOut ? qty(r.transferredOut, r.unit) : "-"}</td><td data-align="center">${r.transferredIn ? qty(r.transferredIn, r.unit) : "-"}</td><td data-align="center">${qty(r.inHand, r.unit)}</td></tr>`;
      }
      body += `<tr><td><strong>${esc(s.stationLabel)} — Total</strong></td><td></td><td data-align="center"><strong>${fmtQty(s.receivedTotal)}</strong></td><td data-align="center"><strong>${fmtQty(s.usedTotal)}</strong></td><td data-align="center"><strong>${s.transferredTotal ? fmtQty(s.transferredTotal) : "-"}</strong></td><td data-align="center"></td><td data-align="center"><strong>${fmtQty(s.inHandTotal)}</strong></td></tr>`;
    }
    body += `</table>`;
  }

  return body;
}

/** HTML body of the required-materials export (see exportRequiredMaterials). */
export function requiredMaterialsReportBody(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stations: Station[],
  transfers?: MaterialTransfer[]
): string {
  const stationName = (id: number | null) =>
    id == null ? "Station not set" : stations.find((s) => s.id === id)?.name ?? "Unassigned";
  const qty = (n: number, unit: string) => `${fmtQty(n)} ${unit}`;

  let body = `<h1>Required Materials Report</h1>`;
  body += `<p class="meta">Generated ${fmtDate(toISODate(new Date()))} · ${materials.length} material${materials.length !== 1 ? "s" : ""} on the required list</p>`;

  if (materials.length === 0) {
    body += `<p class="empty">No materials on the required list yet. Add materials in the app first.</p>`;
    return body;
  }

  /* ---------- Overall required summary ---------- */
  body += `<h2>Overall Required Summary</h2>`;
  let overallRows = "";
  for (const m of [...materials].sort((a, b) => a.name.localeCompare(b.name))) {
    const received = materialReceivedTotal(m.id, receipts);
    const remaining = Math.max(0, m.requiredQty - received);
    overallRows += `<tr><td>${esc(m.name)}</td><td data-align="center">${qty(m.requiredQty, m.unit)}</td><td data-align="center">${qty(Number(m.minRequiredSpare) || 0, m.unit)}</td><td data-align="center">${qty(received, m.unit)}</td><td data-align="center"><strong>${qty(remaining, m.unit)}</strong></td></tr>`;
  }
  body += `<table><tr><th>Material</th><th data-align="center">Required</th><th data-align="center">Min Spare</th><th data-align="center">Received</th><th data-align="center">Still Required</th></tr>${overallRows}</table>`;

  /* ---------- Station-wise required list ---------- */
  body += `<h2>Station-wise Required List</h2>`;
  const stationSummaries = stationMaterialSummaries(materials, materialStations, receipts, usages, stationName, transfers);
  if (stationSummaries.length === 0) {
    body += `<p class="empty">No receipts, usage or transfers recorded yet.</p>`;
  } else {
    body += `<table><tr><th>Station</th><th>Material</th><th data-align="center">Required</th><th data-align="center">Min Spare</th><th data-align="center">Received</th><th data-align="center">In Hand</th></tr>`;
    for (const s of stationSummaries) {
      for (const r of s.rows) {
        body += `<tr><td>${esc(s.stationLabel)}</td><td>${esc(r.name)}</td><td data-align="center">${qty(r.requiredQty, r.unit)}</td><td data-align="center">${qty(r.minRequiredSpare, r.unit)}</td><td data-align="center">${qty(r.received, r.unit)}</td><td data-align="center">${qty(r.inHand, r.unit)}</td></tr>`;
      }
      body += `<tr><td><strong>${esc(s.stationLabel)} — Total</strong></td><td></td><td data-align="center"><strong>${fmtQty(s.requiredTotal)}</strong></td><td data-align="center"></td><td data-align="center"><strong>${fmtQty(s.receivedTotal)}</strong></td><td data-align="center"><strong>${fmtQty(s.inHandTotal)}</strong></td></tr>`;
    }
    body += `</table>`;
  }

  return body;
}

/** Export the in-hand materials report (overall + station-wise in-hand). */
export function exportInHandMaterials(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stations: Station[],
  transfers?: MaterialTransfer[]
) {
  exportDocument("In-Hand Materials Report", inHandMaterialsReportBody(materials, materialStations, receipts, usages, stations, transfers), "materials");
}

/** Export the required-materials report (overall + station-wise required). */
export function exportRequiredMaterials(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stations: Station[],
  transfers?: MaterialTransfer[]
) {
  exportDocument("Required Materials Report", requiredMaterialsReportBody(materials, materialStations, receipts, usages, stations, transfers), "materials");
}

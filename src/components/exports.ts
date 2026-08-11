import { exportDocument } from "@/lib/pdf";
import { fmtDate, toISODate, formatFootplateShifts, footplateTrainList } from "@/lib/api";
import { formatInspectionDates } from "@/lib/inspections";
import { isSpecialMovement } from "@/lib/types";
import { tripTimes } from "@/lib/travel";
import type { XlsxSheet, XlsxMerge } from "@/lib/xlsx";
import type {
  DeficiencyTask,
  PlannedWork,
  Station,
  DailyLog,
  Tag,
  Staff,
  FootplateDetail,
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
 * PCDO report — station-wise list of special works entered in the PCDO
 * section, for a period running 26th of last month → 25th of this month.
 */
export function exportPcdo(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  stationFilter: number | "" = "",
  selectedIds?: Set<number> | null
) {
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
      if (!l.pcdoWork || !l.pcdoWork.trim()) return false;
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

  // Group station-wise
  const groups = new Map<string, DailyLog[]>();
  for (const e of entries) {
    const k = stationName(e.pcdoStationId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let body = `<h1>PCDO — Special Works (${esc(period.label)})</h1>`;
  body += `<p class="meta">PCDO period: ${fmtDate(period.from)} to ${fmtDate(period.to)}`;
  if (stationFilter) body += ` · Station: ${esc(stationName(stationFilter as number))}`;
  body += ` · ${entries.length} special work${entries.length !== 1 ? "s" : ""}</p>`;

  if (sortedGroups.length === 0) {
    body += `<p class="empty">No special works recorded in the PCDO section for this period.</p>`;
  }

  for (const [station, items] of sortedGroups) {
    body += `<h2>${esc(station)} (${items.length})</h2>`;
    body += `<table><tr><th class="date">Date of PCDO</th><th>Special Work</th></tr>`;
    for (const it of items) {
      body += `<tr><td class="date">${fmtDate(it.pcdoDate || it.logDate)}</td><td>${esc(it.pcdoWork)}</td></tr>`;
    }
    body += `</table>`;
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

  exportDocument(`PCDO ${period.label}`, body, "pcdo");
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
 * a single "AVAILED …" row. Times are derived from the TA rate and the
 * station's travel range (see src/lib/travel.ts).
 */
export function exportDiary(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  me: Staff | undefined
) {
  const hq = stations.find((s) => s.id === me?.headquartersStationId);
  const hqCode = hqLabel(hq);

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
    const t = tripTimes(date, primary.taPercent ?? 100, st.travelMin, st.travelMax);
    const r = grid.length;
    grid.push([dmy(date), "ROAD", t.outDep, t.outArr, hqCode, st.code, work]);
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
    body += `<tr><th class="date" data-width="76">DATE</th><th data-width="84">TRAIN NO</th><th data-width="70">TIME DEP</th><th data-width="70">TIME ARR</th><th data-width="58">FROM</th><th data-width="58">TO</th><th>NATURE OF WORK</th></tr>`;
    for (const g of grid) {
      body += `<tr>${g.map((c, i) => (i === 0 ? `<td class="date">${esc(String(c))}</td>` : `<td>${esc(String(c))}</td>`)).join("")}</tr>`;
    }
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
      ...grid,
    ],
    merges: allMerges,
    colWidths: [12, 9, 9, 9, 8, 8, 46],
  };

  exportDocument(`Diary ${period.label}`, body, "diary", sheet);
}


/**
 * TA Journal export — the reference TA.xlsx layout. Includes only days where
 * TA is actually claimed (a non-HQ station movement with a 100 / 70 / 30 rate),
 * one two-leg row pair per day, a KMS note, a month summary by rate, and the
 * certification + signature block.
 */
export function exportTaJournal(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  me: Staff | undefined
) {
  const hq = stations.find((s) => s.id === me?.headquartersStationId);
  const hqCode = hqLabel(hq);

  // One entry per TA day. A date with two movements (two daily logs) counts as
  // a single TA day: the TA movement drives the route, and the nature of work
  // merges both logs with " and ".
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
    const st = movementStation(primary, stations);
    if (!st || (hq && st.match?.id === hq.id)) continue;
    const p = primary.taPercent ?? 100;
    if (p !== 100 && p !== 70 && p !== 30) continue;
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
  const totalAmount = totalDays * 1000;
  const amt = (d: number) => Math.round(d * 1000);

  const grid: (string | number)[][] = [];
  const merges: XlsxMerge[] = [];
  const dataStart = grid.length;
  for (const d of taDays) {
    const l = d.log;
    const st = movementStation(l, stations)!;
    const p = l.taPercent ?? 100;
    const t = tripTimes(l.logDate, p, st.travelMin, st.travelMax);
    const r = grid.length;
    grid.push([
      dmy(l.logDate),
      "ROAD",
      t.outDep,
      t.outArr,
      hqCode,
      st.code,
      "ALL ARE ABOVE 8 KMS",
      (p / 100).toFixed(1),
      p * 10,
      d.work,
    ]);
    grid.push(["", "ROAD", t.retDep, t.retArr, st.code, hqCode, "", "", "", ""]);
    merges.push([r, 0, r + 1, 0], [r, 7, r + 1, 7], [r, 8, r + 1, 8], [r, 9, r + 1, 9]);
  }
  const dataEnd = grid.length - 1;
  if (dataStart <= dataEnd) merges.push([dataStart, 6, dataEnd, 6]); // KMS note spans all rows

  const month = monthStamp(period.label);
  const name = me?.name ? `Name: ${me.name}` : "Name: —";
  const designation = me?.designation ? `Designation: ${me.designation}` : "Designation: —";
  const pf = me?.pfNo ? `P.F.NO: ${me.pfNo}` : "P.F.NO: —";
  const bu = me?.buNo ? `B.U.No: ${me.buNo}` : "B.U.No: —";

  const cert =
    "I here certify that the above mentioned employee was absent on duty from his headquarters station during the period charged for in the bill on Railway Business.";

  let body = `<h1>SOUTH CENTRAL RAILWAY. GUNTAKAL DIVISION</h1>`;
  body += `<h2>TRAVELLING ALLOWANCE JOURNAL</h2>`;
  body += `<p class="meta">${esc(name)} · ${esc(designation)} · ${esc(pf)}</p>`;
  body += `<p class="meta">${esc(`Headquarters: ${hqCode}`)} · Month: ${esc(month)} · ${esc(bu)}</p>`;

  if (taDays.length === 0) {
    body += `<p class="empty">No TA days in this period.</p>`;
  } else {
    body += `<table>`;
    body += `<tr><th class="date" data-width="76">DATE</th><th data-width="58">TRAIN NO</th><th data-width="64">TIME DEP</th><th data-width="64">TIME ARR</th><th data-width="52">FROM</th><th data-width="52">TO</th><th data-width="92">KMS</th><th data-width="46">DAYS</th><th data-width="52">AMOUNT</th><th>NATURE OF WORK</th></tr>`;
    for (const g of grid) {
      body += `<tr>${g.map((c, i) => (i === 0 ? `<td class="date">${esc(String(c))}</td>` : `<td>${esc(String(c))}</td>`)).join("")}</tr>`;
    }
    body += `</table>`;

    body += `<h2>Summary</h2>`;
    body += `<table>`;
    body += `<tr><th>Rate</th><th>Calculation</th><th>Days</th><th>Amount (₹)</th></tr>`;
    body += `<tr><td><strong>TOTAL NO. OF DAYS</strong></td><td></td><td><strong>${daysLabel(totalDays)} DAYS</strong></td><td><strong>${totalAmount}</strong></td></tr>`;
    body += `<tr><td>1.0</td><td>X ${n100} = ${daysLabel(days100)} DAYS</td><td>${daysLabel(days100)}</td><td>${amt(days100)}</td></tr>`;
    body += `<tr><td>0.7</td><td>X ${n70} = ${daysLabel(days70)} DAYS</td><td>${daysLabel(days70)}</td><td>${amt(days70)}</td></tr>`;
    body += `<tr><td>0.3</td><td>X ${n30} = ${daysLabel(days30)} DAYS</td><td>${daysLabel(days30)}</td><td>${amt(days30)}</td></tr>`;
    body += `<tr><td><strong>TOTAL</strong></td><td>= ${daysLabel(totalDays)} DAYS</td><td><strong>${daysLabel(totalDays)}</strong></td><td><strong>${totalAmount}</strong></td></tr>`;
    body += `</table>`;

    body += `<p class="meta" style="margin-top:12px">${esc(cert)}</p>`;
    body += `<p class="meta" style="margin-top:28px">____________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;____________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;________________________</p>`;
    body += `<p class="meta">CONTROLLING OFFICER&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;HEAD OF OFFICE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;SIGNATURE OF OFFICER/ CLAIMING TA</p>`;
  }

  const summaryRows: XlsxSheet["rows"] = [
    [{ v: "SOUTH CENTRAL RAILWAY. GUNTAKAL DIVISION", bold: true }],
    [{ v: "TRAVELLING ALLOWANCE JOURNAL", bold: true }],
    [name, "", "", designation, "", "", "", { v: pf, bold: false }, ""],
    [`Headquarters: ${hqCode}`, "", "", `Month: ${month}`, "", "", "", { v: bu, bold: false }, ""],
    ["DATE", "TRAIN NO", "TIME", "", "STATION", "", "KMS", "DAYS", "AMOUNT", "NATURE OF WORK"],
    ["", "", "TIME DEPT", "TIME ARR", "FROM", "TO", "", "", "", ""],
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
  const t1 = s, t2 = s + 1, t3 = s + 2, line = s + 3, tot = s + 4, certRow = s + 5, sigRow = s + 6, sigLab = s + 7;
  mergesAll.push(
    [t1, 0, t1, 6], // TOTAL NO. OF DAYS spans A:G
    [line, 1, line, 4], // underline
    [tot, 1, tot, 2], // TOTAL label
    [certRow, 0, certRow, 9],
    [sigRow, 0, sigRow, 0],
    [sigRow, 5, sigRow, 5],
    [sigRow, 9, sigRow, 9],
    [sigLab, 0, sigLab, 2],
    [sigLab, 5, sigLab, 7],
    [sigLab, 9, sigLab, 9]
  );
  summaryRows.push(
    [{ v: "TOTAL NO. OF DAYS", bold: true }, "", "", "", "", "", "", `${daysLabel(totalDays)} DAYS`, totalAmount, ""],
    ["", 1.0, `X ${n100}`, `= ${daysLabel(days100)} DAYS`, "", "", "", "", "", "", days100],
    ["", 0.7, `X ${n70}`, `= ${daysLabel(days70)} DAYS`, "", "", "", "", "", "", days70],
    ["", 0.3, `X ${n30}`, `= ${daysLabel(days30)} DAYS`, "", "", "", "", "", "", days30],
    ["", "____________________", "", "", ""],
    ["", "TOTAL", "", `= ${daysLabel(totalDays)} DAYS`],
    [{ v: cert, bold: false }, "", "", "", "", "", "", "", "", ""],
    ["____________________", "", "", "", "", "____________________", "", "", "", "________________________"],
    ["CONTROLLING OFFICER", "", "", "", "", "HEAD OF OFFICE", "", "", "", "SIGNATURE OF OFFICER/ CLAIMING TA"]
  );

  const sheet: XlsxSheet = {
    rows: summaryRows,
    merges: mergesAll,
    colWidths: [12, 9, 9, 9, 8, 8, 18, 9, 10, 44, 8],
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
        body += `<tr><td>${fmtDate(l.logDate)}</td><td>${esc(l.stationMovement)}</td><td>${esc(l.workDone)}</td><td>${l.ta ? "₹" + l.ta : "-"}</td><td>${l.tagIds.map(tagName).filter(Boolean).map(esc).join(", ")}</td></tr>`;
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

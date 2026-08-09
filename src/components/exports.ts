import { exportDocument } from "@/lib/pdf";
import { fmtDate, toISODate, formatFootplateShifts, footplateTrainList } from "@/lib/api";
import { formatInspectionDates } from "@/lib/inspections";
import { isSpecialMovement } from "@/lib/types";
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
 * Diary export — Date | Movement (HQ → visited station) | TA (days) | Work Done,
 * closed by a tally of 1.0 / 0.7 / 0.3 day claims and the total TA in days.
 */
export function exportDiary(
  period: { from: string; to: string; label: string },
  logs: DailyLog[],
  stations: Station[],
  me: Staff | undefined
) {
  const hqName =
    stations.find((s) => s.id === me?.headquartersStationId)?.name ?? "Headquarters";

  const rows = logs
    .filter((l) => l.logDate >= period.from && l.logDate <= period.to)
    .sort((a, b) => a.logDate.localeCompare(b.logDate));

  // Tally by claim percentage (0% covers rest / leave / CR and HQ days)
  const tally = { p100: 0, p70: 0, p30: 0, p0: 0 };
  for (const r of rows) {
    const p = r.taPercent ?? 100;
    if (p === 100) tally.p100++;
    else if (p === 70) tally.p70++;
    else if (p === 30) tally.p30++;
    else tally.p0++;
  }
  const totalDays = tally.p100 * 1 + tally.p70 * 0.7 + tally.p30 * 0.3;

  let body = `<h1>Diary — ${esc(period.label)}</h1>`;
  body += `<p class="meta">${fmtDate(period.from)} to ${fmtDate(period.to)}`;
  if (me?.name) body += ` · ${esc(me.name)}${me.designation ? `, ${esc(me.designation)}` : ""}`;
  body += ` · Headquarters: ${esc(hqName)}</p>`;

  if (rows.length === 0) {
    body += `<p class="empty">No diary entries in this period.</p>`;
  } else {
    body += `<table>`;
    body += `<tr><th data-width="72">Date</th><th data-width="185">Movement</th><th data-width="45">TA</th><th>Work Done</th></tr>`;
    for (const r of rows) {
      const to = r.stationMovement && r.stationMovement.trim() ? r.stationMovement : "—";
      const days = ((r.taPercent ?? 100) / 100).toFixed(1);
      const movement = isSpecialMovement(r) ? to : `From ${esc(hqName)} to ${esc(to)}`;
      body += `<tr><td>${fmtDate(r.logDate)}</td><td>${movement}</td><td>${days}</td><td>${esc(r.workDone) || "-"}</td></tr>`;
    }
    body += `</table>`;

    body += `<h2>TA Summary</h2>`;
    body += `<table>`;
    body += `<tr><th>Rate</th><th>No. of TA</th><th>Days</th></tr>`;
    body += `<tr><td>Full day (100%)</td><td>${tally.p100}</td><td>${(tally.p100 * 1).toFixed(1)}</td></tr>`;
    body += `<tr><td>70%</td><td>${tally.p70}</td><td>${(tally.p70 * 0.7).toFixed(1)}</td></tr>`;
    body += `<tr><td>30%</td><td>${tally.p30}</td><td>${(tally.p30 * 0.3).toFixed(1)}</td></tr>`;
    body += `<tr><td>No TA (0%) — Rest / Leave / CR / HQ</td><td>${tally.p0}</td><td>0.0</td></tr>`;
    body += `<tr><td><strong>Total</strong></td><td><strong>${rows.length}</strong></td><td><strong>${totalDays.toFixed(1)}</strong></td></tr>`;
    body += `</table>`;
    body += `<p class="meta" style="margin-top:10px"><strong>Total TA claimed: ${totalDays.toFixed(1)} day${totalDays === 1 ? "" : "s"}</strong></p>`;
  }

  exportDocument(`Diary ${period.label}`, body, "diary");
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

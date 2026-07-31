import { toISODate } from "./api";

export type InspectionKind = "monthly" | "quarterly" | "maintenance" | "joint" | "footplate";

/** Recurrence interval in days, and how many days ahead to warn. */
export const INSPECTION_RULES: Record<
  InspectionKind,
  { label: string; intervalDays: number; remindBefore: number; color: string }
> = {
  monthly: { label: "Monthly Inspection", intervalDays: 30, remindBefore: 5, color: "#2563eb" },
  maintenance: { label: "Maintenance", intervalDays: 14, remindBefore: 5, color: "#059669" },
  quarterly: { label: "Quarterly Inspection", intervalDays: 90, remindBefore: 5, color: "#7c3aed" },
  // Joint inspection follows the quarterly cycle, carried out with another dept
  joint: { label: "Joint Inspection", intervalDays: 90, remindBefore: 5, color: "#c026d3" },
  // Footplate follows whichever periodicity the user picks
  footplate: { label: "Footplate Inspection", intervalDays: 30, remindBefore: 5, color: "#0891b2" },
};

/** Joint & footplate inspections may run monthly or quarterly. */
export const PERIODICITIES = ["monthly", "quarterly"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];
export const PERIODICITY_DAYS: Record<Periodicity, number> = { monthly: 30, quarterly: 90 };

/** Kinds whose cycle length is chosen by the user. */
export const PERIODIC_KINDS: InspectionKind[] = ["joint", "footplate"];

export function intervalFor(kind: InspectionKind, periodicity?: string | null) {
  if (PERIODIC_KINDS.includes(kind) && periodicity && periodicity in PERIODICITY_DAYS) {
    return PERIODICITY_DAYS[periodicity as Periodicity];
  }
  return INSPECTION_RULES[kind].intervalDays;
}

export const FOOTPLATE_SHIFTS = ["Day", "Night"] as const;
export const FOOTPLATE_DIRECTIONS = ["Up", "Down", "Both"] as const;

/** Departments a joint inspection can be carried out with. */
export const JOINT_DEPARTMENTS = ["Engg", "OHE"] as const;
export type JointDepartment = (typeof JOINT_DEPARTMENTS)[number];

export const INSPECTION_KINDS = Object.keys(INSPECTION_RULES) as InspectionKind[];

/** Detect which inspection kind a tag name refers to (null if none). */
export function kindFromTagName(name: string): InspectionKind | null {
  const n = name.toLowerCase();
  // Check "joint" first — a joint inspection may also mention "quarterly"
  if (n.includes("footplate")) return "footplate";
  if (n.includes("joint")) return "joint";
  if (n.includes("monthly")) return "monthly";
  if (n.includes("quarterly")) return "quarterly";
  if (n.includes("maintenance")) return "maintenance";
  return null;
}

/** Given selected tag names, return the inspection kind implied (first match). */
export function kindFromTags(tagNames: string[]): InspectionKind | null {
  for (const t of tagNames) {
    const k = kindFromTagName(t);
    if (k) return k;
  }
  return null;
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export type InspectionRecord = {
  id?: number;
  logDate: string;
  inspectionKind: string | null;
  inspectionStationId?: number | null;
  inspectionTowardsStationId?: number | null;
  inspectionJointDept?: string | null;
  inspectionPeriodicity?: string | null;
  footplateShift?: string | null;
  footplateDirection?: string | null;
  stationMovement?: string | null;
};

export type InspectionDue = {
  key: string;
  kind: InspectionKind;
  /** Station the inspection was done AT */
  station: string;
  stationId: number | null;
  /** Side of that station it was done TOWARDS */
  towards: string;
  towardsId: number | null;
  /** For joint inspections: the partnering department */
  jointDept?: string | null;
  /** For joint/footplate: the chosen monthly or quarterly cycle */
  periodicity?: string | null;
  lastDone: string;
  nextDue: string;
  daysLeft: number;
  overdue: boolean;
  /** Log entry the schedule was derived from */
  sourceLogId?: number;
};

/**
 * For each (kind + side) pair, find the most recent inspection and work out
 * when the next one falls due. Only pairs already inside their reminder
 * window (or overdue) are returned.
 */
type Resolved = { id: number | null; name: string; towardsId: number | null; towards: string };
type StationResolver = (r: InspectionRecord) => Resolved;

function collectLatest(records: InspectionRecord[], resolve: StationResolver) {
  const latest = new Map<
    string,
    {
      kind: InspectionKind;
      station: string;
      stationId: number | null;
      towards: string;
      towardsId: number | null;
      date: string;
      id?: number;
      jointDept?: string | null;
      periodicity?: string | null;
    }
  >();
  for (const r of records) {
    const kind = r.inspectionKind as InspectionKind | null;
    if (!kind || !INSPECTION_RULES[kind]) continue;
    const st = resolve(r);
    // A station has multiple sides — each side keeps its own schedule
    // Joint inspections track each partner department separately
    const dept = kind === "joint" ? (r.inspectionJointDept || "").toLowerCase() : "";
    const per = PERIODIC_KINDS.includes(kind) ? (r.inspectionPeriodicity || "").toLowerCase() : "";
    // Footplate has no "towards side" — it is keyed by shift and direction instead,
    // so a Day and a Night run on the same date are two separate schedules.
    const variant =
      kind === "footplate"
        ? `${(r.footplateShift || "").toLowerCase()}::${(r.footplateDirection || "").toLowerCase()}`
        : String(st.towardsId ?? st.towards.toLowerCase());
    const key = `${kind}::${st.id ?? st.name.toLowerCase()}::${variant}::${dept}::${per}`;
    const prev = latest.get(key);
    if (!prev || r.logDate > prev.date)
      latest.set(key, {
        kind,
        station: st.name,
        stationId: st.id,
        towards: st.towards,
        towardsId: st.towardsId,
        date: r.logDate,
        id: r.id,
        jointDept: r.inspectionJointDept ?? null,
        periodicity: r.inspectionPeriodicity ?? null,
      });
  }
  return latest;
}

const defaultResolver: StationResolver = (r) => ({
  id: r.inspectionStationId ?? null,
  name: (r.stationMovement || "").trim() || "Unspecified station",
  towardsId: r.inspectionTowardsStationId ?? null,
  towards: "Unspecified side",
});

export function computeInspectionDues(
  records: InspectionRecord[],
  today: string = toISODate(new Date()),
  resolveStation: StationResolver = defaultResolver
): InspectionDue[] {
  const latest = collectLatest(records, resolveStation);

  const out: InspectionDue[] = [];
  for (const [key, v] of latest) {
    const rule = INSPECTION_RULES[v.kind];
    const nextDue = addDays(v.date, intervalFor(v.kind, v.periodicity));
    const daysLeft = daysBetween(today, nextDue);
    if (daysLeft <= rule.remindBefore) {
      out.push({
        key,
        kind: v.kind,
        station: v.station,
        stationId: v.stationId,
        towards: v.towards,
        towardsId: v.towardsId,
        jointDept: v.jointDept,
        periodicity: v.periodicity,
        lastDone: v.date,
        nextDue,
        daysLeft,
        overdue: daysLeft < 0,
        sourceLogId: v.id,
      });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** All tracked schedules, whether due soon or not (for the Reports view). */
export function computeAllSchedules(
  records: InspectionRecord[],
  today: string = toISODate(new Date()),
  resolveStation: StationResolver = defaultResolver
): InspectionDue[] {
  const latest = collectLatest(records, resolveStation);
  return [...latest.entries()]
    .map(([key, v]) => {
      const nextDue = addDays(v.date, intervalFor(v.kind, v.periodicity));
      const daysLeft = daysBetween(today, nextDue);
      return { key, kind: v.kind, station: v.station, stationId: v.stationId, towards: v.towards, towardsId: v.towardsId, jointDept: v.jointDept, periodicity: v.periodicity, lastDone: v.date, nextDue, daysLeft, overdue: daysLeft < 0, sourceLogId: v.id };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Compact multi-date label: "04, 09, 16/07/2026".
 * The month/year is printed only on the last date of each month run,
 * so a single-month list stays short while spanning months stays clear.
 */
export function formatInspectionDates(isoDates: string[]) {
  const sorted = [...isoDates].sort();
  return sorted
    .map((iso, i) => {
      const [y, m, d] = iso.split("-");
      const next = sorted[i + 1];
      const sameMonthAsNext = next && next.slice(0, 7) === iso.slice(0, 7);
      return sameMonthAsNext ? d : `${d}/${m}/${y}`;
    })
    .join(", ");
}

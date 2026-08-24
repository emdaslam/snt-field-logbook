import { toISODate } from "./api";
import type { FootplateBlock } from "@/db/schema";

export type InspectionKind =
  | "monthly"
  | "quarterly"
  | "maintenance"
  | "joint"
  | "footplate"
  | "poiling"
  | "battery";

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
  // Point oiling & battery distilled water: the user sets the reminder cycle per entry
  poiling: { label: "Point Oiling", intervalDays: 15, remindBefore: 5, color: "#ea580c" },
  battery: { label: "Battery Distilled Water", intervalDays: 15, remindBefore: 5, color: "#0d9488" },
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
  // Point oiling & battery distilled water — user-defined reminder cycle
  if (n.includes("point oiling") || n.includes("oiling")) return "poiling";
  if (n.includes("battery") || n.includes("distilled water")) return "battery";
  if (n.includes("monthly")) return "monthly";
  if (n.includes("quarterly")) return "quarterly";
  if (n.includes("maintenance")) return "maintenance";
  return null;
}

/**
 * Per-tag reminder configuration. A tag whose name matches an inspection kind
 * (via kindFromTagName) can switch its reminder on/off and override the cycle
 * length and the "days before due" warning window.
 */
export type TagReminderConfig = {
  enabled: boolean;
  intervalDays?: number | null;
  remindBeforeDays?: number | null;
};

export type TagReminderConfigMap = Partial<Record<InspectionKind, TagReminderConfig>>;

/**
 * Build a kind→config map from the tag list, so the inspection scheduler can
 * honour the Settings-page per-tag reminder settings. The first matching tag
 * for each kind wins (tags are pre-sorted by name). A tag that was never
 * configured (remindEnabled unset) is skipped, leaving the built-in rule —
 * reminder on, using the kind's default interval and warning window.
 */
export function tagReminderConfigs(tags: { name: string; remindEnabled?: boolean | null; remindIntervalDays?: number | null; remindBeforeDays?: number | null }[]): TagReminderConfigMap {
  const out: TagReminderConfigMap = {};
  for (const t of tags) {
    const kind = kindFromTagName(t.name);
    if (!kind || out[kind]) continue;
    if (t.remindEnabled === undefined || t.remindEnabled === null) continue;
    out[kind] = {
      enabled: Boolean(t.remindEnabled),
      intervalDays: t.remindIntervalDays,
      remindBeforeDays: t.remindBeforeDays,
    };
  }
  return out;
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
  inspectionSide?: string | null;
  inspectionJointDept?: string | null;
  inspectionPeriodicity?: string | null;
  inspectionRemindDays?: number | null;
  footplateShift?: string | null;
  footplateDirection?: string | null;
  footplateDay?: FootplateBlock | null;
  footplateNight?: FootplateBlock | null;
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

function isBlock(b: FootplateBlock | null | undefined): b is FootplateBlock {
  return Boolean(b && "direction" in b);
}

/** Footplate schedules are keyed by shift + direction (Day Both ≠ Day Up). */
function footplateVariant(r: InspectionRecord) {
  const shift = (r.footplateShift || "").toLowerCase();
  if (isBlock(r.footplateDay) || isBlock(r.footplateNight)) {
    const day = (r.footplateDay?.direction || "").toLowerCase();
    const night = (r.footplateNight?.direction || "").toLowerCase();
    return `${shift}::d:${day}|n:${night}`;
  }
  return `${shift}::${(r.footplateDirection || "").toLowerCase()}`;
}

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
      intervalDays?: number | null;
    }
  >();
  for (const r of records) {
    const kind = r.inspectionKind as InspectionKind | null;
    if (!kind || !INSPECTION_RULES[kind]) continue;
    const st = resolve(r);
    // A station's inspection is one schedule: the most recent entry for that
    // station (a specific side, or "Both sides") is its "last done" date. Sides
    // used to each keep their own schedule, which left a stale due/overdue
    // notification behind when the station was done as "Both sides" in one
    // period and side-by-side on two different days in the next — the old
    // "Both sides" schedule was never refreshed by the side entries.
    // Joint inspections still track each partner department separately.
    const dept = kind === "joint" ? (r.inspectionJointDept || "").toLowerCase() : "";
    const per = PERIODIC_KINDS.includes(kind) ? (r.inspectionPeriodicity || "").toLowerCase() : "";
    // Footplate has no "towards side" — it is keyed by shift and direction instead,
    // so a Day and a Night run on the same date are two separate schedules.
    const stationKey = st.id ?? st.name.toLowerCase();
    const key =
      kind === "footplate"
        ? `${kind}::${stationKey}::${footplateVariant(r)}::${dept}::${per}`
        : `${kind}::${stationKey}::${dept}::${per}`;
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
        intervalDays: r.inspectionRemindDays ?? null,
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

/**
 * Effective cycle length: a per-entry custom reminder (point oiling / battery
 * distilled water) wins, then the tag's configured periodicity, then the kind's
 * rule or the chosen inspection periodicity.
 */
function intervalForSchedule(
  v: {
    kind: InspectionKind;
    periodicity?: string | null;
    intervalDays?: number | null;
  },
  cfg?: TagReminderConfig
) {
  if (v.intervalDays && v.intervalDays > 0) return v.intervalDays;
  if (cfg?.intervalDays && cfg.intervalDays > 0) return cfg.intervalDays;
  return intervalFor(v.kind, v.periodicity);
}

export function computeInspectionDues(
  records: InspectionRecord[],
  today: string = toISODate(new Date()),
  resolveStation: StationResolver = defaultResolver,
  tagConfig?: TagReminderConfigMap
): InspectionDue[] {
  const latest = collectLatest(records, resolveStation);

  const out: InspectionDue[] = [];
  for (const [key, v] of latest) {
    const rule = INSPECTION_RULES[v.kind];
    const cfg = tagConfig?.[v.kind];
    if (cfg && !cfg.enabled) continue; // reminder switched off for this tag
    const remindBefore =
      cfg?.remindBeforeDays && cfg.remindBeforeDays > 0 ? cfg.remindBeforeDays : rule.remindBefore;
    const nextDue = addDays(v.date, intervalForSchedule(v, cfg));
    const daysLeft = daysBetween(today, nextDue);
    if (daysLeft <= remindBefore) {
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
  resolveStation: StationResolver = defaultResolver,
  tagConfig?: TagReminderConfigMap
): InspectionDue[] {
  const latest = collectLatest(records, resolveStation);
  return [...latest.entries()]
    .map(([key, v]) => {
      const cfg = tagConfig?.[v.kind];
      const nextDue = addDays(v.date, intervalForSchedule(v, cfg));
      const daysLeft = daysBetween(today, nextDue);
      return { key, kind: v.kind, station: v.station, stationId: v.stationId, towards: v.towards, towardsId: v.towardsId, jointDept: v.jointDept, periodicity: v.periodicity, lastDone: v.date, nextDue, daysLeft, overdue: daysLeft < 0, sourceLogId: v.id };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export type TagDue = {
  tagId: number;
  tagName: string;
  color: string;
  lastDone: string;
  nextDue: string;
  daysLeft: number;
  overdue: boolean;
  sourceLogId?: number;
};

/**
 * Reminders for ANY tag that has one switched on in Settings — not just the
 * inspection-named ones. Each tag tracks the latest log entry it was used in
 * and falls due `remindIntervalDays` later; it is reported inside the warning
 * window (`remindBeforeDays`) or when overdue. Tags whose name matches an
 * inspection kind are left to the inspection scheduler, which already tracks
 * them per station/side.
 */
export function computeTagDues(
  records: { id?: number; logDate: string; tagIds?: number[] }[],
  tags: {
    id: number;
    name: string;
    color: string;
    remindEnabled?: boolean | null;
    remindIntervalDays?: number | null;
    remindBeforeDays?: number | null;
  }[],
  today: string = toISODate(new Date())
): TagDue[] {
  const latest = new Map<number, { date: string; id?: number }>();
  for (const l of records) {
    for (const id of l.tagIds ?? []) {
      const prev = latest.get(id);
      if (!prev || l.logDate > prev.date) latest.set(id, { date: l.logDate, id: l.id });
    }
  }
  const out: TagDue[] = [];
  for (const t of tags) {
    if (!t.remindEnabled) continue;
    if (kindFromTagName(t.name)) continue; // handled by the inspection scheduler
    const last = latest.get(t.id);
    if (!last) continue;
    const interval = t.remindIntervalDays && t.remindIntervalDays > 0 ? t.remindIntervalDays : 30;
    const before = t.remindBeforeDays != null && t.remindBeforeDays >= 0 ? t.remindBeforeDays : 5;
    const nextDue = addDays(last.date, interval);
    const daysLeft = daysBetween(today, nextDue);
    if (daysLeft <= before) {
      out.push({
        tagId: t.id,
        tagName: t.name,
        color: t.color,
        lastDone: last.date,
        nextDue,
        daysLeft,
        overdue: daysLeft < 0,
        sourceLogId: last.id,
      });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
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

import { toISODate } from "./api";
import type { FootplateBlock, FootplateDetail } from "@/db/schema";

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
  // Joint inspection follows the half yearly or quarterly cycle (user's pick)
  joint: { label: "Joint Inspection", intervalDays: 90, remindBefore: 5, color: "#c026d3" },
  // Footplate follows whichever periodicity the user picks
  footplate: { label: "Footplate Inspection", intervalDays: 30, remindBefore: 5, color: "#0891b2" },
  // Point oiling & battery distilled water: the user sets the reminder cycle per entry
  poiling: { label: "Point Oiling", intervalDays: 15, remindBefore: 5, color: "#ea580c" },
  battery: { label: "Battery Distilled Water", intervalDays: 15, remindBefore: 5, color: "#0d9488" },
};

/** Cycle lengths in days. Footplate runs monthly or quarterly; joint runs
 *  half yearly or quarterly (its former "monthly" entries read as half yearly). */
export const PERIODICITIES = ["monthly", "quarterly"] as const;
export type Periodicity = "monthly" | "quarterly" | "half yearly";
export const PERIODICITY_DAYS: Record<Periodicity, number> = { monthly: 30, quarterly: 90, "half yearly": 180 };

/** The cycle options each periodic kind offers in the entry form. */
export const KIND_PERIODICITIES: Record<Extract<InspectionKind, "joint" | "footplate">, readonly string[]> = {
  joint: ["half yearly", "quarterly"],
  footplate: ["monthly", "quarterly"],
};

/** Kinds whose cycle length is chosen by the user. */
export const PERIODIC_KINDS: InspectionKind[] = ["joint", "footplate"];

/** A joint entry's effective cycle: legacy "monthly" (and blanks) read as
 *  "half yearly", since monthly is no longer an option for joint. */
export function jointPeriodOf(raw?: string | null): "half yearly" | "quarterly" {
  return (raw ?? "").toLowerCase() === "quarterly" ? "quarterly" : "half yearly";
}

/** First letter uppercased: "half yearly" → "Half yearly". */
export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function intervalFor(kind: InspectionKind, periodicity?: string | null) {
  if (kind === "joint") return PERIODICITY_DAYS[jointPeriodOf(periodicity)];
  if (kind === "footplate" && periodicity && periodicity in PERIODICITY_DAYS) {
    return PERIODICITY_DAYS[periodicity as Periodicity];
  }
  return INSPECTION_RULES[kind].intervalDays;
}

export const FOOTPLATE_SHIFTS = ["Day", "Night"] as const;
export const FOOTPLATE_DIRECTIONS = ["Up", "Down", "Both"] as const;

/**
 * Dedicated footplate reminder settings (Settings → Notifications → Footplate
 * inspection reminder). Each periodicity gets its own cycle length and its own
 * "warn N days before due" window; a null cycle day-count keeps the built-in
 * default (30 for monthly, 90 for quarterly) and a null warn count means 5.
 */
export type FootplatePeriodSetting = {
  enabled: boolean;
  periodicityDays: number | null;
  warnDays: number | null;
};
export type FootplateReminderSettings = {
  monthly: FootplatePeriodSetting;
  quarterly: FootplatePeriodSetting;
};
export const DEFAULT_FOOTPLATE_REMINDER: FootplateReminderSettings = {
  monthly: { enabled: true, periodicityDays: null, warnDays: null },
  quarterly: { enabled: true, periodicityDays: null, warnDays: null },
};

/** Parse the persisted JSON (localStorage) into a full settings object. */
export function normalizeFootplateReminder(v: unknown): FootplateReminderSettings {
  const num = (x: unknown): number | null =>
    typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : null;
  const period = (x: unknown, def: FootplatePeriodSetting): FootplatePeriodSetting => {
    if (!x || typeof x !== "object") return def;
    const o = x as Record<string, unknown>;
    return {
      enabled: o.enabled === undefined ? def.enabled : o.enabled === true,
      periodicityDays: num(o.periodicityDays) ?? null,
      warnDays:
        o.warnDays === undefined || o.warnDays === null
          ? null
          : typeof o.warnDays === "number" && Number.isFinite(o.warnDays)
            ? Math.max(0, Math.round(o.warnDays))
            : null,
    };
  };
  if (!v || typeof v !== "object") return DEFAULT_FOOTPLATE_REMINDER;
  const o = v as Record<string, unknown>;
  return {
    monthly: period(o.monthly, DEFAULT_FOOTPLATE_REMINDER.monthly),
    quarterly: period(o.quarterly, DEFAULT_FOOTPLATE_REMINDER.quarterly),
  };
}

/**
 * Dedicated joint inspection reminder settings (Settings → Notifications →
 * Joint inspection reminder). Each cycle gets its own cycle length and its own
 * "warn N days before due" window; a null cycle day-count keeps the built-in
 * default (180 for half yearly, 90 for quarterly) and a null warn count means
 * 5. Joint schedules stay tracked per station AND per partner department.
 */
export type JointPeriodSetting = {
  enabled: boolean;
  periodicityDays: number | null;
  warnDays: number | null;
};
export type JointReminderSettings = {
  "half yearly": JointPeriodSetting;
  quarterly: JointPeriodSetting;
};
export const DEFAULT_JOINT_REMINDER: JointReminderSettings = {
  "half yearly": { enabled: true, periodicityDays: null, warnDays: null },
  quarterly: { enabled: true, periodicityDays: null, warnDays: null },
};

/** Parse the persisted JSON (localStorage) into a full joint settings object. */
export function normalizeJointReminder(v: unknown): JointReminderSettings {
  const num = (x: unknown): number | null =>
    typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : null;
  const period = (x: unknown, def: JointPeriodSetting): JointPeriodSetting => {
    if (!x || typeof x !== "object") return def;
    const o = x as Record<string, unknown>;
    return {
      enabled: o.enabled === undefined ? def.enabled : o.enabled === true,
      periodicityDays: num(o.periodicityDays) ?? null,
      warnDays:
        o.warnDays === undefined || o.warnDays === null
          ? null
          : typeof o.warnDays === "number" && Number.isFinite(o.warnDays)
            ? Math.max(0, Math.round(o.warnDays))
            : null,
    };
  };
  if (!v || typeof v !== "object") return DEFAULT_JOINT_REMINDER;
  const o = v as Record<string, unknown>;
  return {
    "half yearly": period(o["half yearly"], DEFAULT_JOINT_REMINDER["half yearly"]),
    quarterly: period(o.quarterly, DEFAULT_JOINT_REMINDER.quarterly),
  };
}

/** Departments a joint inspection can be carried out with. */
export const JOINT_DEPARTMENTS = ["Engg", "OHE"] as const;
export type JointDepartment = (typeof JOINT_DEPARTMENTS)[number];

export const INSPECTION_KINDS = Object.keys(INSPECTION_RULES) as InspectionKind[];

/**
 * Generic side labels used while a station's sides are not (yet) fully named:
 * "Both sides" when never a specific side was picked for the station, "The
 * other side" when exactly one side is named and the work may have been done
 * toward the other one.
 */
export const GENERIC_SIDE_LABELS = {
  both: "Both sides",
  other: "The other side",
} as const;

export function isGenericSideLabel(towards: string): boolean {
  return towards === GENERIC_SIDE_LABELS.both || towards === GENERIC_SIDE_LABELS.other;
}

/** Kinds whose tags ask for the station side the work was done towards. */
export function sideAskingKinds(tags: { name: string; needsSide?: boolean | null }[]): Set<InspectionKind> {
  const out = new Set<InspectionKind>();
  for (const t of tags) {
    const k = kindFromTagName(t.name);
    if (k && t.needsSide) out.add(k);
  }
  return out;
}

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
  footplateUp?: FootplateDetail | null;
  footplateDown?: FootplateDetail | null;
  footplateJourney?: { boardingStationId?: number | null } | null;
  footplateJourneys?: { boardingStationId?: number | null; day?: FootplateBlock | null; night?: FootplateBlock | null }[] | null;
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
  /** For joint/footplate: the chosen cycle (joint: half yearly / quarterly,
   *  footplate: monthly / quarterly) */
  periodicity?: string | null;
  /** Footplate only: which shift (Day / Night) and direction (Up / Down) this schedule tracks */
  fpShift?: string | null;
  fpDir?: string | null;
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

/**
 * The individual (shift, direction) facts a footplate log records. A direction
 * of "Both" (or an old block with train details for both) splits into separate
 * Up and Down facts, so each entered direction tracks its own schedule. Chain
 * logs contribute one fact per ride, each at its own boarding station;
 * standalone logs use the logged station.
 */
export function footplateFactsOf(r: InspectionRecord): {
  stationId: number | null;
  shift: "Day" | "Night";
  dir: "Up" | "Down";
  date: string;
  periodicity: string | null;
  logId?: number;
}[] {
  const per = r.inspectionPeriodicity ?? null;
  const out: { stationId: number | null; shift: "Day" | "Night"; dir: "Up" | "Down"; date: string; periodicity: string | null; logId?: number }[] = [];
  const add = (shift: "Day" | "Night", dir: "Up" | "Down", stationId: number | null) =>
    out.push({ stationId, shift, dir, date: r.logDate, periodicity: per, logId: r.id });
  const blockDirs = (b: FootplateBlock | null | undefined): ("Up" | "Down")[] => {
    if (!isBlock(b)) return [];
    const d = (b.direction || "").toLowerCase();
    if (d === "up") return ["Up"];
    if (d === "down") return ["Down"];
    if (d === "both") return ["Up", "Down"];
    // Old entries where the train details were filled but the direction
    // selection is missing/stale — take it from the details that exist
    const dirs: ("Up" | "Down")[] = [];
    if (b.up) dirs.push("Up");
    if (b.down) dirs.push("Down");
    return dirs;
  };
  const rides = Array.isArray(r.footplateJourneys) ? r.footplateJourneys : [];
  if (rides.length > 0) {
    for (const ride of rides) {
      const st = ride?.boardingStationId ?? r.inspectionStationId ?? null;
      for (const dir of blockDirs(ride?.day ?? null)) add("Day", dir, st);
      for (const dir of blockDirs(ride?.night ?? null)) add("Night", dir, st);
    }
    return out;
  }
  for (const dir of blockDirs(r.footplateDay ?? null)) add("Day", dir, r.inspectionStationId ?? null);
  for (const dir of blockDirs(r.footplateNight ?? null)) add("Night", dir, r.inspectionStationId ?? null);
  // Legacy form (before the per-shift blocks): one shifted direction for
  // whichever shift(es) were picked
  if (out.length === 0 && (r.footplateShift || r.footplateDirection)) {
    const shifts = (r.footplateShift || "Day").split(",").map((s) => s.trim().toLowerCase());
    const d = (r.footplateDirection || "").toLowerCase();
    let dirs: ("Up" | "Down")[] =
      d === "down" ? ["Down"] : d === "both" ? ["Up", "Down"] : d === "up" ? ["Up"] : [];
    if (dirs.length === 0) {
      if (r.footplateUp) dirs.push("Up");
      if (r.footplateDown) dirs.push("Down");
    }
    for (const s of shifts) {
      const shift = s === "night" ? "Night" : "Day";
      for (const dir of dirs) add(shift, dir, r.inspectionStationId ?? null);
    }
  }
  return out;
}

function collectLatest(
  records: InspectionRecord[],
  resolve: StationResolver,
  sideKinds?: Set<InspectionKind>
) {
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

  // For kinds that ask for the station side, remember the sides the user has
  // named per station (from specific-side entries, any period) so a "Both
  // sides" entry can refresh EVERY of them at once.
  const namedSides = new Map<string, Map<string, { name: string; date: string }>>();
  if (sideKinds && sideKinds.size > 0) {
    for (const r of records) {
      const k = r.inspectionKind as InspectionKind | null;
      if (!k || !INSPECTION_RULES[k] || k === "footplate") continue;
      if (!sideKinds.has(k)) continue;
      if (r.inspectionSide === "Both" || !r.inspectionTowardsStationId) continue;
      const st = resolve(r);
      if (!st.towards || st.towards === "Unspecified side") continue;
      const stationKey = st.name.toLowerCase();
      const sideKey = st.towards.toLowerCase();
      const sides = namedSides.get(stationKey) ?? new Map<string, { name: string; date: string }>();
      const prev = sides.get(sideKey);
      if (!prev || r.logDate > prev.date) sides.set(sideKey, { name: st.towards, date: r.logDate });
      namedSides.set(stationKey, sides);
    }
  }

  for (const r of records) {
    const kind = r.inspectionKind as InspectionKind | null;
    if (!kind || !INSPECTION_RULES[kind]) continue;
    // Footplate is scheduled per shift + direction by collectFootplate (a "Both"
    // ride counts as BOTH directions), which the generic collector would key
    // as a third "both" schedule that side entries never refresh.
    if (kind === "footplate") continue;
    const st = resolve(r);
    const dept = kind === "joint" ? (r.inspectionJointDept || "").toLowerCase() : "";
    const per =
      kind === "joint"
        ? jointPeriodOf(r.inspectionPeriodicity)
        : (r.inspectionPeriodicity || "").toLowerCase();
    // A station's schedule is keyed by its resolved name (normalised). The same
    // station can be recorded once with a station id and once as free text
    // (or under a slightly different spelling); keying by name keeps both on
    // ONE schedule so the reminder doesn't fire twice for the same station.
    const stationKey = st.name.toLowerCase();

    // Side-asking kinds track EACH side of the station as its own schedule
    // (like footplate tracks Up / Down): an entry towards one side refreshes
    // only that side, a "Both sides" entry refreshes every named side at once.
    // While the user has not yet named both sides, a generic slot keeps the
    // unnamed side's own countdown: "Both sides" until the first side is named,
    // then "The other side". Joint inspections still track each partner
    // department separately.
    if (sideKinds?.has(kind)) {
      const named = namedSides.get(stationKey);
      const bothLike = r.inspectionSide === "Both" || !r.inspectionTowardsStationId;
      const facts: { sideKey: string; towards: string; towardsId: number | null }[] = bothLike
        ? [
            ...(named?.values() ?? []).map((s) => ({
              sideKey: s.name.toLowerCase(),
              towards: s.name,
              towardsId: null,
            })),
            // A "Both sides" entry (or one with no side picked, which used to
            // clear the whole station) also covers whichever side is not named:
            ...(named?.size ?? 0) === 0
              ? [{ sideKey: "__both__", towards: GENERIC_SIDE_LABELS.both, towardsId: null }]
              : named && named.size === 1
                ? [{ sideKey: "__other__", towards: GENERIC_SIDE_LABELS.other, towardsId: null }]
                : [],
          ]
        : [{ sideKey: (st.towards || "").toLowerCase(), towards: st.towards, towardsId: st.towardsId }];
      for (const f of facts) {
        const key = `${kind}::${stationKey}::${dept}::${per}::${f.sideKey}`;
        const prev = latest.get(key);
        if (!prev || r.logDate > prev.date)
          latest.set(key, {
            kind,
            station: st.name,
            stationId: st.id,
            towards: f.towards,
            towardsId: f.towardsId,
            date: r.logDate,
            id: r.id,
            jointDept: r.inspectionJointDept ?? null,
            periodicity: kind === "joint" ? jointPeriodOf(r.inspectionPeriodicity) : r.inspectionPeriodicity ?? null,
            intervalDays: r.inspectionRemindDays ?? null,
          });
      }
      continue;
    }

    // All other kinds keep ONE schedule per station: the most recent entry for
    // that station (a specific side, or "Both sides") is its "last done" date.
    const key = `${kind}::${stationKey}::${dept}::${per}`;
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
        periodicity: kind === "joint" ? jointPeriodOf(r.inspectionPeriodicity) : r.inspectionPeriodicity ?? null,
        intervalDays: r.inspectionRemindDays ?? null,
      });
  }
  return latest;
}

/** A log row extended with the footplate ride columns. */
export type FootplateLogRecord = InspectionRecord & {
  footplateJourney?: { boardingStationId?: number | null } | null;
  footplateJourneys?: { boardingStationId?: number | null }[] | null;
};

type FootplateLatest = {
  station: string;
  stationId: number | null;
  shift: "Day" | "Night";
  dir: "Up" | "Down";
  date: string;
  periodicity: string | null;
  id?: number;
};

/**
 * Most recent fact per (station, shift, direction). This is what makes footplate
 * behave per direction: doing only Up leaves the Down schedule at its own last
 * done date (due again after the periodicity), and a "Both" entry refreshes
 * BOTH directions at once.
 */
function collectFootplate(records: InspectionRecord[], resolve: StationResolver): Map<string, FootplateLatest> {
  const latest = new Map<string, FootplateLatest>();
  for (const r of records) {
    if (r.inspectionKind !== "footplate") continue;
    const base = resolve(r);
    for (const f of footplateFactsOf(r)) {
      // Chain-ride facts resolve at their own boarding station
      const st =
        f.stationId === null || f.stationId === base.id
          ? base
          : resolve({ ...r, inspectionStationId: f.stationId, inspectionTowardsStationId: null, stationMovement: null });
      const key = `${st.name.toLowerCase()}::${f.shift}::${f.dir}`;
      const prev = latest.get(key);
      if (!prev || f.date > prev.date)
        latest.set(key, {
          station: st.name,
          stationId: st.id,
          shift: f.shift,
          dir: f.dir,
          date: f.date,
          periodicity: f.periodicity,
          id: f.logId,
        });
    }
  }
  return latest;
}

/**
 * One schedule per (station, shift, direction) that the user has ever entered.
 * Each is due `interval` days after its own last done date (the period set on
 * that entry — monthly / quarterly, with the dedicated settings overriding the
 * lengths), warned from `warnDays` before due and tracked once overdue.
 * `all` (Reports) lists every tracked schedule; otherwise only the ones inside
 * their warning window or overdue — and the reminder is suppressed when the
 * footplate tag's "Remind me" is off or that periodicity is switched off in
 * the footplate reminder settings.
 */
function footplateSchedules(
  records: InspectionRecord[],
  today: string,
  resolve: StationResolver,
  tagConfig?: TagReminderConfigMap,
  footplateSettings?: FootplateReminderSettings,
  all = false
): InspectionDue[] {
  const latest = collectFootplate(records, resolve);
  const out: InspectionDue[] = [];
  for (const [key, v] of latest) {
    const perKey = (v.periodicity ?? "").toLowerCase() === "quarterly" ? "quarterly" : "monthly";
    const ps = footplateSettings?.[perKey] ?? DEFAULT_FOOTPLATE_REMINDER[perKey];
    if (!all && tagConfig?.footplate?.enabled === false) continue;
    if (!all && !ps.enabled) continue;
    const interval =
      ps.periodicityDays && ps.periodicityDays > 0 ? ps.periodicityDays : PERIODICITY_DAYS[perKey];
    const warn =
      ps.warnDays !== null && ps.warnDays !== undefined && ps.warnDays >= 0
        ? ps.warnDays
        : INSPECTION_RULES.footplate.remindBefore;
    const nextDue = addDays(v.date, interval);
    const daysLeft = daysBetween(today, nextDue);
    if (!all && daysLeft > warn) continue;
    out.push({
      key: `footplate::${key}`,
      kind: "footplate",
      station: v.station,
      stationId: v.stationId,
      towards: "Unspecified side",
      towardsId: null,
      periodicity: perKey,
      fpShift: v.shift,
      fpDir: v.dir,
      lastDone: v.date,
      nextDue,
      daysLeft,
      overdue: daysLeft < 0,
      sourceLogId: v.id,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * One schedule per (station, partner department, cycle) that the user has ever
 * entered. Each is due `interval` days after its own last done date (the cycle
 * set on that entry — half yearly / quarterly, with the dedicated settings
 * overriding the lengths), warned from `warnDays` before due and tracked once
 * overdue. `all` (Reports) lists every tracked schedule; otherwise only the
 * ones inside their warning window or overdue — and the reminder is suppressed
 * when the joint tag's "Remind me" is off or that cycle is switched off in the
 * joint reminder settings.
 */
function jointSchedules(
  records: InspectionRecord[],
  today: string,
  resolve: StationResolver,
  tagConfig?: TagReminderConfigMap,
  jointSettings?: JointReminderSettings,
  sideKinds?: Set<InspectionKind>,
  all = false
): InspectionDue[] {
  const latest = collectLatest(records, resolve, sideKinds);
  const out: InspectionDue[] = [];
  for (const [key, v] of latest) {
    if (v.kind !== "joint") continue;
    const perKey = jointPeriodOf(v.periodicity);
    const js = jointSettings?.[perKey] ?? DEFAULT_JOINT_REMINDER[perKey];
    if (!all && tagConfig?.joint?.enabled === false) continue;
    if (!all && !js.enabled) continue;
    const interval =
      js.periodicityDays && js.periodicityDays > 0 ? js.periodicityDays : PERIODICITY_DAYS[perKey];
    const warn =
      js.warnDays !== null && js.warnDays !== undefined && js.warnDays >= 0
        ? js.warnDays
        : INSPECTION_RULES.joint.remindBefore;
    const nextDue = addDays(v.date, interval);
    const daysLeft = daysBetween(today, nextDue);
    if (!all && daysLeft > warn) continue;
    out.push({
      key,
      kind: "joint",
      station: v.station,
      stationId: v.stationId,
      towards: v.towards,
      towardsId: v.towardsId,
      jointDept: v.jointDept,
      periodicity: perKey,
      lastDone: v.date,
      nextDue,
      daysLeft,
      overdue: daysLeft < 0,
      sourceLogId: v.id,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * One log can record two inspection facts: the tagged periodic inspection kept
 * in the log's own columns (e.g. a monthly inspection at a station) and a
 * footplate ride inside the day's movement chain, whose data lives in the
 * footplate columns. Expand each such ride into a synthetic "footplate" record
 * so both schedules coexist; logs that are already footplate (or carry no ride
 * data) pass through unchanged.
 */
export function expandInspectionRecords(logs: FootplateLogRecord[]): InspectionRecord[] {
  const out: InspectionRecord[] = [];
  for (const l of logs) {
    out.push(l);
    if (l.inspectionKind === "footplate") continue;
    const rides = Array.isArray(l.footplateJourneys) ? l.footplateJourneys : [];
    if (rides.length === 0 && !l.footplateJourney && !l.footplateDay && !l.footplateNight) continue;
    const boarding =
      rides.find((r) => r?.boardingStationId)?.boardingStationId ??
      l.footplateJourney?.boardingStationId ??
      null;
    out.push({
      ...l,
      inspectionKind: "footplate",
      inspectionStationId: boarding || null,
      inspectionTowardsStationId: null,
      inspectionSide: null,
      inspectionJointDept: null,
    });
  }
  return out;
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
  tagConfig?: TagReminderConfigMap,
  footplateSettings?: FootplateReminderSettings,
  sideKinds?: Set<InspectionKind>,
  jointSettings?: JointReminderSettings
): InspectionDue[] {
  const latest = collectLatest(records, resolveStation, sideKinds);

  const out: InspectionDue[] = [];
  for (const [key, v] of latest) {
    // Joint is scheduled by jointSchedules (its own per-cycle settings)
    // exactly like footplate, so the generic loop skips it.
    if (v.kind === "joint") continue;
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
  out.push(
    ...jointSchedules(records, today, resolveStation, tagConfig, jointSettings, sideKinds)
  );
  out.push(...footplateSchedules(records, today, resolveStation, tagConfig, footplateSettings));
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** All tracked schedules, whether due soon or not (for the Reports view). */
export function computeAllSchedules(
  records: InspectionRecord[],
  today: string = toISODate(new Date()),
  resolveStation: StationResolver = defaultResolver,
  tagConfig?: TagReminderConfigMap,
  footplateSettings?: FootplateReminderSettings,
  sideKinds?: Set<InspectionKind>,
  jointSettings?: JointReminderSettings
): InspectionDue[] {
  const latest = collectLatest(records, resolveStation, sideKinds);
  const out: InspectionDue[] = [...latest.entries()]
    .filter(([, v]) => v.kind !== "joint") // joint is listed by jointSchedules
    .map(([key, v]) => {
      const cfg = tagConfig?.[v.kind];
      const nextDue = addDays(v.date, intervalForSchedule(v, cfg));
      const daysLeft = daysBetween(today, nextDue);
      return { key, kind: v.kind, station: v.station, stationId: v.stationId, towards: v.towards, towardsId: v.towardsId, jointDept: v.jointDept, periodicity: v.periodicity, lastDone: v.date, nextDue, daysLeft, overdue: daysLeft < 0, sourceLogId: v.id };
    });
  out.push(
    ...jointSchedules(records, today, resolveStation, tagConfig, jointSettings, sideKinds, true)
  );
  out.push(...footplateSchedules(records, today, resolveStation, tagConfig, footplateSettings, true));
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
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

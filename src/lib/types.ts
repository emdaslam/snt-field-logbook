import { AUTO_TIMINGS } from "./timingsMode";

export const DEPARTMENTS = ["Signalling", "Engg", "OHE", "Telecom"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** One PCDO special work reported for a department. An empty `department`
 * marks a legacy entry that predates department-wise PCDO reporting. */
export type PcdoWork = {
  department: string;
  work: string;
};

/** The equipment that carries a counter (register) whose resets are reported
 *  in the monthly PCDO return. MSDAC counters belong to a single station;
 *  UFSBI Block Instrument and BPAC counters belong to the section between two
 *  stations. */
export const COUNTER_EQUIPMENT = ["MSDAC", "UFSBI Block Instrument", "BPAC"] as const;
export type CounterEquipment = (typeof COUNTER_EQUIPMENT)[number];

/** A counter reset recorded on a daily log for the PCDO return. The reset is
 *  either due to an equipment failure or due to testing. The station a counter
 *  belongs to mirrors the log's PCDO station (see the disconnection counts);
 *  only UFSBI / BPAC counters also carry user-picked section end stations. */
export type CounterReset = {
  equipment: CounterEquipment;
  /** For UFSBI / BPAC only: the near end of the section. Null when the near
   *  end is the daily-log station itself (a plain station movement); set
   *  explicitly when the movement is special (Rest/Leave/CR/NH/Footplate) so
   *  both ends of the section are recorded. Always null for MSDAC. */
  stationId: number | null;
  /** For UFSBI / BPAC only: the other end of the section, i.e. the station
   *  the counter is between the near station and. Always null for MSDAC. */
  nextStationId: number | null;
  /** Counter resets due to equipment failures. */
  failures: number;
  /** Counter resets due to testing. */
  testing: number;
};

export const PRIORITIES = ["Urgent", "Normal", "Later"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["Pending", "Planned", "Completed"] as const;
export type Status = (typeof STATUSES)[number];

export const DEFAULT_TAGS = [
  { name: "monthly inspection", color: "#2563eb" },
  { name: "quarterly inspection", color: "#0e7490" },
  { name: "joint inspection", color: "#059669" },
  { name: "maintenance", color: "#0d9488" },
  { name: "footplate", color: "#0891b2" },
  { name: "failures", color: "#dc2626" },
  { name: "point oiling", color: "#ea580c" },
  { name: "battery distilled water", color: "#0d9488" },
];

export const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "#dc2626",
  Normal: "#2563eb",
  Later: "#64748b",
};

export const DEPARTMENT_COLORS: Record<string, string> = {
  Signalling: "#2563eb",
  Engg: "#059669",
  OHE: "#d97706",
  Telecom: "#0e7490",
};

/** Units a material requirement/receipt/usage is counted in. */
export const MATERIAL_UNITS = ["Nos", "Kg", "Sets", "Units"] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

/** The equipment groups materials are filed under, in display order.
 *  "general" is the catch-all every material starts in. */
export const EQUIPMENT_DEFAULTS = [
  "general",
  "point",
  "signal",
  "block instrument",
  "IPS",
  "BPAC",
  "MSDAC",
  "TRACK CIRCUIT",
  "PANEL",
  "WIRE COILS",
  "CABLE",
  "BATTERY",
  "GENERATOR",
  "RELAYS",
  "DATALOGGER",
  "EI",
  "records",
] as const;
export type EquipmentName = (typeof EQUIPMENT_DEFAULTS)[number] | (string & {});

/** Non-station movement options shown in the daily log's Movement selector. */
export const MOVEMENT_TYPES = [
  { value: "rest", label: "Rest" },
  { value: "leave", label: "Leave" },
  { value: "cr", label: "CR" },
  { value: "nh", label: "NH" },
  { value: "footplate", label: "Footplate" },
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number]["value"] | "station";

/** value → display label for non-station movements (NH = Night Halt). */
export const MOVEMENT_LABEL: Record<string, string> = {
  rest: "Rest",
  leave: "Leave",
  cr: "CR",
  nh: "NH",
  footplate: "Footplate",
};

export const LEAVE_KINDS = ["CL", "LAP", "SICK"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

/** True for Rest / Leave / CR / NH entries — no work done and no TA. */
export function isSpecialMovement(l: { movementKind?: string | null }): boolean {
  return (
    l.movementKind === "rest" ||
    l.movementKind === "leave" ||
    l.movementKind === "cr" ||
    l.movementKind === "nh"
  );
}

/** Color theme of the app. "light" is the default look. */
export type AppTheme = "light" | "dark";
export const THEMES: AppTheme[] = ["light", "dark"];
export const THEME_LABEL: Record<AppTheme, string> = {
  light: "Light",
  dark: "Dark",
};

/** App-wide font size preference, applied to the UI and the exported PDFs. */
export type FontSize = "small" | "medium" | "large";
export const FONT_SIZES: FontSize[] = ["small", "medium", "large"];
export const FONT_SIZE_LABEL: Record<FontSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};
/** Root html font-size in px — rem-based Tailwind utilities scale with this. */
export const FONT_SIZE_ROOT: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};
/** Multiplier applied to the fixed pt sizes used by the PDF builder. */
export const FONT_SIZE_SCALE: Record<FontSize, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125,
};

/**
 * Numeric text size (points, 10–96) for the written content inside exported
 * PDFs. This scales only the PDF body — the app UI keeps using the
 * small/medium/large setting above.
 */
export const CONTENT_FONT_MIN = 10;
export const CONTENT_FONT_MAX = 96;
export const DEFAULT_CONTENT_FONT_SIZE = 10;

/**
 * Distance of a station from the headquarters station: "below8" means at or
 * under 8 km, "above8" means over 8 km, "variable" means one side of the
 * station is within 8 km and the other side is beyond it (a station-level TA
 * split whose marker is stored in stations.variableKm). The headquarters
 * station itself is always "below8" with 0 minutes of travel time.
 */
export const STATION_DISTANCE_OPTIONS = [
  { value: "below8", label: "Below 8 km" },
  { value: "above8", label: "Above 8 km" },
  { value: "variable", label: "Variable (split at a KMs marker)" },
] as const;
export type StationDistance = (typeof STATION_DISTANCE_OPTIONS)[number]["value"];

export const STATION_DISTANCE_LABEL: Record<StationDistance, string> = {
  below8: "Below 8 km",
  above8: "Above 8 km",
  variable: "Variable",
};

/**
 * Normalises a station's variable KMs marker to a trimmed non-empty string.
 * The marker is free text (e.g. "8+", "12/4"); legacy rows may still hold a
 * number, which is converted here.
 */
export function variableKmText(km: number | string | null | undefined): string | null {
  if (km == null) return null;
  const s = String(km).trim();
  return s === "" ? null : s;
}

/** App version shown in Settings → About. Bump alongside android/app/build.gradle. */
export const APP_VERSION_BASE = "1.7.6.71";
export const APP_VERSION = `${APP_VERSION_BASE}${AUTO_TIMINGS ? "p" : ""}`;

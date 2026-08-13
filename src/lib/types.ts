import { AUTO_TIMINGS } from "./timingsMode";

export const DEPARTMENTS = ["Signalling", "Engg", "OHE", "Telecom"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const PRIORITIES = ["Urgent", "Normal", "Later"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["Pending", "Completed"] as const;
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

/** Non-station movement options shown in the daily log's Movement selector. */
export const MOVEMENT_TYPES = [
  { value: "rest", label: "Rest" },
  { value: "leave", label: "Leave" },
  { value: "cr", label: "CR" },
  { value: "nh", label: "NH" },
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number]["value"] | "station";

/** value → display label for non-station movements (NH = Night Halt). */
export const MOVEMENT_LABEL: Record<string, string> = {
  rest: "Rest",
  leave: "Leave",
  cr: "CR",
  nh: "NH",
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
 * under 8 km, "above8" means over 8 km. The headquarters station itself is
 * always "below8" with 0 minutes of travel time.
 */
export const STATION_DISTANCE_OPTIONS = [
  { value: "below8", label: "Below 8 km" },
  { value: "above8", label: "Above 8 km" },
] as const;
export type StationDistance = (typeof STATION_DISTANCE_OPTIONS)[number]["value"];

export const STATION_DISTANCE_LABEL: Record<StationDistance, string> = {
  below8: "Below 8 km",
  above8: "Above 8 km",
};

/** App version shown in Settings → About. Bump alongside android/app/build.gradle. */
export const APP_VERSION_BASE = "1.7.6.28";
export const APP_VERSION = `${APP_VERSION_BASE}${AUTO_TIMINGS ? "p" : ""}`;

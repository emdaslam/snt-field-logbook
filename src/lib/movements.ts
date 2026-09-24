export const FOOTPLATE_SLOT = "__footplate__";
export const TEMP_STATION_SLOT = "__temp__";

const MONTHLY_INSPECTION = "monthly inspection";
const QUARTERLY_INSPECTION = "quarterly inspection";
const DEFAULT_MONTHLY_COLOR = "#2563eb";
const DEFAULT_QUARTERLY_COLOR = "#0e7490";

export function movementLabel(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t || t === TEMP_STATION_SLOT) return null;
  if (t === FOOTPLATE_SLOT) return "Footplate";
  return t;
}

export function logMovementLabels(l: {
  stationMovement?: string | null;
  extraStops?: string[] | null;
}): string[] {
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const k = movementLabel(raw);
    if (k && !out.includes(k)) out.push(k);
  };
  add(l.stationMovement);
  if (Array.isArray(l.extraStops)) {
    for (const s of l.extraStops) add(s);
  }
  return out;
}

export function isFootplateLabel(label: string): boolean {
  const lower = label.trim().toLowerCase();
  return lower === "footplate" || lower.startsWith("footplate:") || lower.startsWith("footplate ");
}

export function isFootplateStop(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim();
  if (!t) return false;
  if (t === FOOTPLATE_SLOT) return true;
  return isFootplateLabel(t);
}

export function isFootplateLog(l: {
  movementKind?: string | null;
  stationMovement?: string | null;
  extraStops?: string[] | null;
}): boolean {
  if ((l.movementKind ?? "").toLowerCase() === "footplate") return true;
  if (isFootplateStop(l.stationMovement)) return true;
  return Array.isArray(l.extraStops) && l.extraStops.some(isFootplateStop);
}

function tagColor(
  tags: { name: string; color: string }[],
  name: string,
  fallback: string
): string {
  const t = tags.find((x) => x.name.trim().toLowerCase() === name);
  return t?.color || fallback;
}

export function monthlyInspectionColor(
  tags: { name: string; color: string }[],
  fallback = DEFAULT_MONTHLY_COLOR
): string {
  return tagColor(tags, MONTHLY_INSPECTION, fallback);
}

export function quarterlyInspectionColor(
  tags: { name: string; color: string }[],
  fallback = DEFAULT_QUARTERLY_COLOR
): string {
  return tagColor(tags, QUARTERLY_INSPECTION, fallback);
}

export function isQuarterlyFootplate(l: { inspectionPeriodicity?: string | null }): boolean {
  return (l.inspectionPeriodicity ?? "").toLowerCase() === "quarterly";
}

export function footplateDotColor(
  l: { inspectionPeriodicity?: string | null },
  tags: { name: string; color: string }[]
): string {
  return isQuarterlyFootplate(l)
    ? quarterlyInspectionColor(tags)
    : monthlyInspectionColor(tags);
}

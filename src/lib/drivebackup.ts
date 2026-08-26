/**
 * Per-day Drive backup format.
 *
 * Instead of one giant JSON blob (which is fully re-uploaded on every sync and
 * quickly eats the app-data quota), the Drive app-data folder holds:
 *
 *   - snt-index.json          tiny index: backup version + exportedAt + the
 *                             list of day dates (rewritten only on a change)
 *   - snt-data.json           all non-log tables (stations, staff, tags,
 *                             deficiencies, planned works, notes, categories)
 *                             with their attachments embedded
 *   - snt-day-<date>.json     one small file per log date holding that day's
 *                             daily logs (photos/files embedded)
 *
 * Change tracking uses localStorage dirty flags set by the api layer on every
 * write, so a normal sync serialises and uploads only the touched day(s) plus
 * the tiny index — never the whole database. Restore downloads the index, the
 * data file and every day file and imports them all at once.
 */

const DAY_PREFIX = "snt-day-";

export const INDEX_NAME = "snt-index.json";
export const DATA_NAME = "snt-data.json";
export const LEGACY_NAME = "snt-logbook-backup.json";

const SEEDED_KEY = "snt.drive.shardedSeeded";
const DIRTY_DAYS_KEY = "snt.drive.dirtyDays";
const DIRTY_DATA_KEY = "snt.drive.dirtyData";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** "2026-08-09" → "snt-day-2026-08-09.json" */
export function dayFileName(date: string) {
  return `${DAY_PREFIX}${date}.json`;
}

/** "snt-day-2026-08-09.json" → "2026-08-09", or null when not a day file. */
export function dateFromDayFile(name: string): string | null {
  if (!name.startsWith(DAY_PREFIX) || !name.endsWith(".json")) return null;
  return name.slice(DAY_PREFIX.length, -".json".length);
}

/** True once the sharded format has been pushed at least once. */
export function isSeededSharded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markShardedSeeded() {
  try {
    localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function markDayDirty(date: string) {
  const set = new Set<string>(readJson<string[]>(DIRTY_DAYS_KEY, []));
  set.add(date);
  writeJson(DIRTY_DAYS_KEY, [...set]);
}

export function markDataDirty() {
  try {
    localStorage.setItem(DIRTY_DATA_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

/** Every table changed (manual restore) — force a full re-push next sync. */
export function markAllDirty() {
  try {
    localStorage.removeItem(SEEDED_KEY);
  } catch {
    /* storage unavailable */
  }
  markDataDirty();
}

/** Dates touched since the last successful push (non-destructive read). */
export function readDirtyDays(): string[] {
  return readJson<string[]>(DIRTY_DAYS_KEY, []);
}

export function readDataDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_DATA_KEY) === "1";
  } catch {
    return false;
  }
}

/** Forget the dirty flags — call only after the data made it to Drive. */
export function clearDirty() {
  try {
    localStorage.removeItem(DIRTY_DAYS_KEY);
    localStorage.removeItem(DIRTY_DATA_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The non-log tables that live in snt-data.json. */
const DATA_KEYS = [
  "stations",
  "staff",
  "tags",
  "deficiencyTasks",
  "plannedWorks",
  "notes",
  "noteCategories",
  "materials",
  "materialReceipts",
  "materialUsages",
  "materialTransfers",
  "materialStations",
  "equipmentTypes",
] as const;

export function buildDataPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of DATA_KEYS) {
    const v = payload[k];
    if (Array.isArray(v)) out[k] = v;
  }
  return out;
}

/** Group daily logs by their date (missing date falls into a fallback bucket). */
export function groupLogsByDate(logs: unknown[]): Map<string, unknown[]> {
  const m = new Map<string, unknown[]>();
  for (const l of logs) {
    const d = (l as { logDate?: string }).logDate || "0000-00-00";
    if (!m.has(d)) m.set(d, []);
    m.get(d)!.push(l);
  }
  return m;
}

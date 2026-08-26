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

/* ------------------------------------------------------------------ */
/* Dataset fingerprints — compare two backups without heavy I/O        */
/* ------------------------------------------------------------------ */

/** Every table that lands in the Drive backup and participates in the
 *  "is this the same data?" comparison. Settings are deliberately excluded —
 *  they are device preferences, not data that a wrong sync could lose. */
const COMPARE_KEYS = [...DATA_KEYS, "dailyLogs"] as const;

/** Deterministic JSON: object keys are sorted so identical data always
 *  stringifies identically regardless of insertion order. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const val = obj[k];
    if (val === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${stableStringify(val)}`);
  }
  return `{${parts.join(",")}}`;
}

/** FNV-1a 32-bit — small, deterministic, fast. */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** djb2 32-bit — a second independent hash, combined with FNV-1a into a
 *  64-bit key so two records can never collide in practice. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** A stable identity for one record. Attached photos/files are not hashed —
 *  they are large base64 blobs; only their count participates, which keeps
 *  the comparison cheap while still noticing a missing attachment. */
function recordFingerprint(r: Record<string, unknown>): string {
  const { attachments, ...rest } = r;
  const n = Array.isArray(attachments) ? attachments.length : 0;
  const s = `${stableStringify(rest)}#att=${n}`;
  return `${fnv1a(s)}-${djb2(s)}`;
}

export type BackupFingerprint = {
  records: number;
  days: number;
  hashes: string[];
};

/** Cheap, deterministic digest of a whole backup payload: total records, the
 *  number of distinct log dates and one hash per record (sorted-keys JSON so
 *  field order never matters). */
export function fingerprintPayload(payload: Record<string, unknown>): BackupFingerprint {
  const hashes: string[] = [];
  let records = 0;
  const days = new Set<string>();
  for (const k of COMPARE_KEYS) {
    const rows = payload[k];
    if (!Array.isArray(rows)) continue;
    records += rows.length;
    for (const row of rows) {
      if (row && typeof row === "object")
        hashes.push(`${k}:${recordFingerprint(row as Record<string, unknown>)}`);
    }
    if (k === "dailyLogs") {
      for (const l of rows) {
        const d = (l as { logDate?: string }).logDate;
        if (d) days.add(d);
      }
    }
  }
  return { records, days: days.size, hashes };
}

/** True when two fingerprints describe exactly the same records. */
export function payloadsMatch(a: BackupFingerprint, b: BackupFingerprint): boolean {
  if (a.records !== b.records || a.days !== b.days) return false;
  const set = new Set(a.hashes);
  return set.size === a.hashes.length && b.hashes.every((h) => set.has(h));
}

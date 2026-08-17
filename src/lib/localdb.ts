/**
 * Fully offline data store.
 *
 * Everything the logbook records lives in the device's own IndexedDB — there is
 * no server, no network call and no external service anywhere in this file.
 * Each "table" is a keyed array of rows, mirroring the shape the UI already
 * expects, with a simple auto-increment id per table.
 */

import { collectAppSettings, applyAppSettings } from "./appSettings";

export const TABLES = [
  "stations",
  "staff",
  "tags",
  "dailyLogs",
  "deficiencyTasks",
  "plannedWorks",
  "notes",
  "noteCategories",
  "materials",
  "materialReceipts",
  "materialUsages",
] as const;

export type TableName = (typeof TABLES)[number];

type Row = { id: number; [k: string]: unknown };

const DB_NAME = "snt-logbook";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This device has no offline storage available."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline storage"));
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ------------------------------------------------------------------ */
/* In-memory cache so reads stay instant after the first load          */
/* ------------------------------------------------------------------ */

const cache = new Map<TableName, Row[]>();

export async function readTable<T = Row>(table: TableName): Promise<T[]> {
  if (cache.has(table)) return cache.get(table)! as unknown as T[];
  const rows = (await idbGet<Row[]>(table)) ?? [];
  cache.set(table, rows);
  return rows as unknown as T[];
}

export async function writeTable(table: TableName, rows: Row[]) {
  cache.set(table, rows);
  await idbSet(table, rows);
}
function nextId(rows: Row[]) {
  return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Generic CRUD                                                        */
/* ------------------------------------------------------------------ */

export async function insert<T extends object>(table: TableName, values: T): Promise<T & Row> {
  const rows = await readTable(table);
  const row = {
    ...(values as Record<string, unknown>),
    id: nextId(rows),
    createdAt: (values as Record<string, unknown>).createdAt ?? new Date().toISOString(),
  } as unknown as T & Row;
  await writeTable(table, [...rows, row]);
  return row;
}

export async function update<T extends object>(
  table: TableName,
  id: number,
  patch: T
): Promise<(T & Row) | null> {
  const rows = await readTable(table);
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const merged = { ...rows[i], ...(patch as Record<string, unknown>), id } as unknown as T & Row;
  const next = [...rows];
  next[i] = merged;
  await writeTable(table, next);
  return merged;
}

export async function remove(table: TableName, id: number): Promise<void> {
  const rows = await readTable(table);
  await writeTable(
    table,
    rows.filter((r) => r.id !== id)
  );
}

/* ------------------------------------------------------------------ */
/* Whole-database export / import (the backup file)                    */
/* ------------------------------------------------------------------ */

export async function exportAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    version: 4,
    offline: true,
    settings: collectAppSettings(),
  };
  for (const t of TABLES) out[t] = await readTable(t);
  return out;
}

export async function importAll(payload: Record<string, unknown>): Promise<void> {
  for (const t of TABLES) {
    const rows = payload[t];
    if (Array.isArray(rows)) {
      // Guarantee every row has a usable numeric id
      let auto = 0;
      const clean = rows.map((r) => {
        const row = { ...(r as Record<string, unknown>) };
        const n = Number(row.id);
        row.id = Number.isFinite(n) && n > 0 ? n : ++auto;
        return row as Row;
      });
      await writeTable(t, clean);
    }
  }
  if (payload.settings && typeof payload.settings === "object") {
    applyAppSettings(payload.settings as Record<string, string>);
  }
}

export async function clearAll(): Promise<void> {
  for (const t of TABLES) await writeTable(t, []);
}

/* ------------------------------------------------------------------ */
/* First-run defaults                                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_TAGS = [
  { name: "monthly inspection", color: "#2563eb" },
  { name: "quarterly inspection", color: "#0e7490" },
  { name: "joint inspection", color: "#059669" },
  { name: "maintenance", color: "#0d9488" },
  { name: "footplate", color: "#0891b2" },
  { name: "failures", color: "#dc2626" },
  { name: "point oiling", color: "#ea580c" },
  { name: "battery distilled water", color: "#0d9488" },
];

const DEFAULT_NOTE_CATEGORIES = [
  { name: "Installation", color: "#2563eb" },
  { name: "Equipment", color: "#0e7490" },
  { name: "Contact", color: "#059669" },
  { name: "Instruction", color: "#b45309" },
  { name: "General", color: "#64748b" },
];

/** Seed only on a genuinely empty database, so a restore is never polluted. */
export async function seedIfEmpty(): Promise<void> {
  const [tags, cats, stations, staff, logs] = await Promise.all([
    readTable("tags"),
    readTable("noteCategories"),
    readTable("stations"),
    readTable("staff"),
    readTable("dailyLogs"),
  ]);

  if (tags.length === 0 && cats.length === 0 && stations.length === 0 && staff.length === 0 && logs.length === 0) {
    await writeTable(
      "tags",
      DEFAULT_TAGS.map((t, i) => ({ ...t, id: i + 1, createdAt: new Date().toISOString() }))
    );
    await writeTable(
      "noteCategories",
      DEFAULT_NOTE_CATEGORIES.map((c, i) => ({ ...c, id: i + 1, createdAt: new Date().toISOString() }))
    );
    return;
  }

  // Top up the two reference tables if they alone are empty
  if (tags.length === 0) {
    await writeTable(
      "tags",
      DEFAULT_TAGS.map((t, i) => ({ ...t, id: i + 1, createdAt: new Date().toISOString() }))
    );
  }
  if (cats.length === 0) {
    await writeTable(
      "noteCategories",
      DEFAULT_NOTE_CATEGORIES.map((c, i) => ({ ...c, id: i + 1, createdAt: new Date().toISOString() }))
    );
  }

  // Top up default tags added after first install (e.g. "point oiling").
  const tagRows = await readTable<Row>("tags");
  const have = new Set(tagRows.map((t) => String(t.name).toLowerCase()));
  const missing = DEFAULT_TAGS.filter((t) => !have.has(t.name.toLowerCase()));
  if (missing.length > 0) {
    let auto = tagRows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
    await writeTable("tags", [
      ...tagRows,
      ...missing.map((t) => ({
        ...t,
        id: ++auto,
        createdAt: new Date().toISOString(),
      })),
    ]);
  }
}

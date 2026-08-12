/**
 * Global per-TA-rate auto-generation configuration for the personal (auto
 * timings) build.
 *
 * Each TA rate (100 % = 1 TA, 70 % = 0.7 TA, 30 % = 0.3 TA) has its own
 * departure window (HQ → station), return-arrival window (station → HQ) and
 * tour-duration condition. The generated tour length (return arrival minus
 * departure) must be more than minHrs and less than maxHrs. Times are stored
 * as "HH:MM".
 *
 * Like font size and reminder days, this is a device setting (localStorage) —
 * it is not part of the synced logbook data. The normal (manual timings) build
 * never generates timings and ignores this config.
 */

export type TaGenWindow = {
  depStart: string;
  depEnd: string;
  retStart: string;
  retEnd: string;
  minHrs: number;
  maxHrs: number;
};

export type TaRateKey = "100" | "70" | "30";

export type TaGenConfig = Record<TaRateKey, TaGenWindow>;

export const TA_RATE_KEYS: TaRateKey[] = ["100", "70", "30"];

export const TA_RATE_LABEL: Record<TaRateKey, string> = {
  "100": "1 TA (100 %)",
  "70": "0.7 TA (70 %)",
  "30": "0.3 TA (30 %)",
};

export const TA_GEN_DEFAULTS: TaGenConfig = {
  "100": { depStart: "06:30", depEnd: "07:30", retStart: "18:30", retEnd: "20:00", minHrs: 12, maxHrs: 14 },
  "70": { depStart: "08:00", depEnd: "09:00", retStart: "16:30", retEnd: "18:30", minHrs: 7, maxHrs: 11 },
  "30": { depStart: "08:45", depEnd: "09:30", retStart: "14:00", retEnd: "16:00", minHrs: 4, maxHrs: 8 },
};

const STORAGE_KEY = "snt.taGenConfig";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function isWindow(v: unknown): v is TaGenWindow {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const time = (s: unknown) => typeof s === "string" && HHMM.test(s);
  const hours = (s: unknown) => typeof s === "number" && Number.isFinite(s);
  return time(o.depStart) && time(o.depEnd) && time(o.retStart) && time(o.retEnd) && hours(o.minHrs) && hours(o.maxHrs);
}

/** Read the saved config, merging over the defaults so old/partial data works. */
export function loadTaGenConfig(): TaGenConfig {
  const base: TaGenConfig = JSON.parse(JSON.stringify(TA_GEN_DEFAULTS));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Record<TaRateKey, unknown>>;
    for (const k of TA_RATE_KEYS) {
      const w = saved[k];
      if (isWindow(w)) base[k] = w;
    }
  } catch {
    // Corrupt or unavailable storage — the defaults keep working.
  }
  return base;
}

export function saveTaGenConfig(cfg: TaGenConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Storage unavailable — the defaults keep working.
  }
}

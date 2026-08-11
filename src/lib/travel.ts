/**
 * Deterministic (seeded) travel timings for the Diary / TA Journal exports.
 *
 * A daily log records a station movement and a TA rate, but no clock times.
 * The exports therefore derive departure / arrival times from the TA rate
 * windows below and the visited station's stored travel range (travelMin →
 * travelMax). A stable seed keeps re-exporting the same period identical.
 */

export type TripTimes = {
  /** HQ → station journey */
  outDep: string;
  outArr: string;
  /** station → HQ return journey */
  retDep: string;
  retArr: string;
};

/** Departure / return-arrival windows (minutes after midnight) per TA rate. */
const TA_WINDOWS: Record<number, { dep: [number, number]; ret: [number, number] }> = {
  100: { dep: [6 * 60 + 30, 7 * 60 + 30], ret: [18 * 60 + 40, 20 * 60] },
  70: { dep: [8 * 60, 9 * 60], ret: [16 * 60 + 30, 18 * 60 + 30] },
  30: { dep: [8 * 60 + 45, 9 * 60 + 30], ret: [14 * 60, 16 * 60] },
};

/** Fallback one-way road travel time when a station has no range recorded. */
const DEFAULT_TRAVEL_MIN = 40;
const DEFAULT_TRAVEL_MAX = 60;

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(min: number, max: number, rnd: () => number): number {
  if (max <= min) return min;
  return min + Math.floor(rnd() * (max - min + 1));
}

/** Round a minute count to the nearest multiple of 5 (all generated times are). */
function step5(v: number): number {
  return Math.round(v / 5) * 5;
}

function fmt(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * One day's HQ → station → HQ timings. The one-way travel duration is drawn
 * from the station's travel range; the HQ departure and return-arrival times
 * are drawn from the TA-rate windows. All values are derived from a seed of
 * (date, TA rate, travel range) so exports are stable, and every generated
 * time is a multiple of 5 minutes.
 */
export function tripTimes(
  logDate: string,
  taPercent: number,
  travelMin: number | null | undefined,
  travelMax: number | null | undefined
): TripTimes {
  const win = TA_WINDOWS[taPercent] ?? TA_WINDOWS[70];
  const rnd = mulberry32(hashSeed(logDate, taPercent, travelMin ?? 0, travelMax ?? 0));
  const oneWay = Math.max(
    5,
    step5(
      travelMin != null && travelMax != null && travelMax > 0
        ? randInt(travelMin, travelMax, rnd)
        : randInt(DEFAULT_TRAVEL_MIN, DEFAULT_TRAVEL_MAX, rnd)
    )
  );
  const outDep = step5(randInt(win.dep[0], win.dep[1], rnd));
  const retArr = step5(randInt(win.ret[0], win.ret[1], rnd));
  return {
    outDep: fmt(outDep),
    outArr: fmt(outDep + oneWay),
    retDep: fmt(retArr - oneWay),
    retArr: fmt(retArr),
  };
}

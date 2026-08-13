/**
 * Deterministic (seeded) travel timings for the Diary / TA Journal exports.
 *
 * A daily log records a station movement and a TA rate, but no clock times.
 * The exports therefore derive departure / arrival times from the TA rate's
 * window (configurable in Settings → TA Auto-Generation) and the visited
 * station's stored travel range (travelMin → travelMax). A stable seed keeps
 * re-exporting the same period identical.
 */

import { TA_GEN_DEFAULTS, type TaGenWindow, type TaRateKey } from "./taGenConfig";

export type TripTimes = {
  /** HQ → station journey */
  outDep: string;
  outArr: string;
  /** station → HQ return journey */
  retDep: string;
  retArr: string;
};

/** "HH:MM" → minutes after midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

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

/** Round up / down to the next / previous multiple of 5. */
const ceil5 = (v: number) => Math.ceil(v / 5) * 5;
const floor5 = (v: number) => Math.floor(v / 5) * 5;

function fmt(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * One day's HQ → station → HQ timings. The one-way travel duration is drawn
 * from the station's travel range; the HQ departure and return-arrival times
 * are drawn from the TA rate's window (passed in, or the default when absent).
 * The generated tour length (return arrival − departure) stays within the
 * window's duration condition (minHrs → maxHrs) whenever the windows allow it.
 * All values are derived from a seed of (date, TA rate, travel range) so
 * exports are stable, and every generated time is a multiple of 5 minutes.
 */
export function tripTimes(
  logDate: string,
  taPercent: number,
  travelMin: number | null | undefined,
  travelMax: number | null | undefined,
  win?: TaGenWindow
): TripTimes {
  const rate: TaRateKey = String(taPercent) === "100" || String(taPercent) === "30" ? (String(taPercent) as TaRateKey) : "70";
  const w = win ?? TA_GEN_DEFAULTS[rate];
  const rnd = mulberry32(hashSeed(logDate, taPercent, travelMin ?? 0, travelMax ?? 0));
  const oneWay = Math.max(
    5,
    step5(
      travelMin != null && travelMax != null && travelMax > 0
        ? randInt(travelMin, travelMax, rnd)
        : randInt(DEFAULT_TRAVEL_MIN, DEFAULT_TRAVEL_MAX, rnd)
    )
  );

  const d0 = toMinutes(w.depStart);
  const d1 = toMinutes(w.depEnd);
  const r0 = toMinutes(w.retStart);
  const r1 = toMinutes(w.retEnd);
  const minDur = Math.max(0, Math.round(w.minHrs * 60));
  const maxDur = Math.max(minDur, Math.round(w.maxHrs * 60));

  // Departures that can still leave room for a return arrival satisfying
  // minDur < tour < maxDur, on the 5-minute grid. If the windows cannot
  // satisfy the condition, fall back to the raw departure window.
  const depLo = Math.max(d0, ceil5(r0 - maxDur + 1));
  const depHi = Math.min(d1, floor5(r1 - minDur - 1));
  const outDep = step5(randInt(depHi >= depLo ? depLo : d0, depHi >= depLo ? depHi : d1, rnd));

  // A return arrival keeping the tour strictly inside the condition, rounded
  // inward so the 5-minute grid never breaks it. Fall back to the raw window.
  const retLo = ceil5(Math.max(r0, outDep + minDur + 1));
  const retHi = floor5(Math.min(r1, outDep + maxDur - 1));
  const retArr = step5(randInt(retHi >= retLo ? retLo : r0, retHi >= retLo ? retHi : r1, rnd));

  return {
    outDep: fmt(outDep),
    outArr: fmt(outDep + oneWay),
    retDep: fmt(retArr - oneWay),
    retArr: fmt(retArr),
  };
}

/**
 * Timings for a Footplate movement day: the HQ → boarding-station → HQ legs
 * come from {@link tripTimes} (keyed by the boarding station's travel range),
 * and the train-leg window between arriving at and leaving the boarding
 * station is split into the outbound (and, when riding back, the return) train
 * ride. All values sit on the deterministic 5-minute grid.
 */
export type JourneyTimes = TripTimes & {
  trOutDep: string;
  trOutArr: string;
  trInDep: string;
  trInArr: string;
};

export function journeyTripTimes(
  logDate: string,
  taPercent: number,
  travelMin: number | null | undefined,
  travelMax: number | null | undefined,
  hasInbound: boolean,
  win?: TaGenWindow
): JourneyTimes {
  const base = tripTimes(logDate, taPercent, travelMin, travelMax, win);
  const windowStart = toMinutes(base.outArr);
  const windowEnd = toMinutes(base.retDep);
  const span = Math.max(5, windowEnd - windowStart);
  const trOutDep = step5(windowStart);
  const trOutArr = step5(hasInbound ? windowStart + Math.floor(span / 2) : windowEnd);
  const trInDep = step5(windowStart + Math.floor(span / 2));
  const trInArr = step5(windowEnd);
  return {
    ...base,
    trOutDep: fmt(trOutDep),
    trOutArr: fmt(trOutArr),
    trInDep: fmt(trInDep),
    trInArr: fmt(trInArr),
  };
}

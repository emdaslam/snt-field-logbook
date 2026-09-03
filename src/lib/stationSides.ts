/**
 * The two sides remembered per station — the neighbouring stations the user
 * has picked in the "towards which side?" picker. The picker offers only
 * these two sides (plus "Both sides" and "pick another station"), and picking
 * a station that is not remembered for a station with two remembered sides
 * asks which remembered side the new one replaces.
 *
 * A missing pair is seeded from the log history (the two most recently used
 * sides), so stations the user has already worked get their sides without the
 * "pick another station" dance.
 */

const LS_KEY = "snt.stationSides";
export type StationSides = Record<number, number[]>; // stationId -> up to 2 side station ids

function cleanPair(x: unknown): number[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of x) {
    if (typeof n === "number" && Number.isInteger(n) && n > 0 && !seen.has(n)) {
      out.push(n);
      seen.add(n);
    }
    if (out.length === 2) break;
  }
  return out;
}

export function loadStationSides(): StationSides {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: StationSides = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const pair = cleanPair(x);
      if (pair.length) out[Number(k)] = pair;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStationSidesFor(stationId: number, pair: number[]): StationSides {
  const out = loadStationSides();
  out[stationId] = cleanPair(pair);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(out));
  } catch {
    // Storage unavailable — the pair simply won't persist.
  }
  return out;
}

/** The remembered (or history-seeded) sides of a station, at most two. */
export function savedSidesFor(
  stationId: number | null | undefined,
  stored: StationSides,
  history: { logDate: string; inspectionStationId?: number | null; inspectionTowardsStationId?: number | null }[]
): number[] {
  if (!stationId) return [];
  const s = stored[stationId];
  if (s && s.length) return s.slice(0, 2);
  const lastUsed = new Map<number, string>();
  for (const l of history) {
    if (l.inspectionStationId !== stationId || !l.inspectionTowardsStationId) continue;
    const prev = lastUsed.get(l.inspectionTowardsStationId);
    if (!prev || l.logDate > prev) lastUsed.set(l.inspectionTowardsStationId, l.logDate);
  }
  return [...lastUsed.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] - b[0]))
    .slice(0, 2)
    .map(([id]) => id);
}

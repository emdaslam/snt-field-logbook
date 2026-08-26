import type {
  Material,
  MaterialReceipt,
  MaterialUsage,
  MaterialTransfer,
  MaterialStation,
} from "@/db/schema";

/** One station whose in-hand stock for a material has fallen below the
 *  material's minimum required spare. */
export type LowStockAlert = {
  material: Material;
  stationId: number | null;
  stationLabel: string;
  inHand: number;
  minRequiredSpare: number;
  /** How much is needed to get back to the minimum (min − inHand). */
  shortage: number;
};

/** Format a quantity, dropping trailing zeros (50 → "50", 2.5 → "2.5"). */
export function fmtQty(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** Quantity with its unit, omitting the unit when none is set. */
export function qtyWithUnit(qty: number, unit?: string): string {
  const q = fmtQty(qty);
  return unit ? `${q} ${unit}` : q;
}

/** Per-station in-hand balances for every material, keyed station → material →
 *  balance (received − used − transferred out + transferred in). A material
 *  only appears for stations it has receipts, usages or transfers on. */
export function stationInHand(
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  transfers?: MaterialTransfer[]
): Map<number | null, Map<number, number>> {
  const byStation = new Map<number | null, Map<number, number>>();
  const add = (stationId: number | null, materialId: number, delta: number) => {
    const mat = byStation.get(stationId) ?? new Map<number, number>();
    mat.set(materialId, (mat.get(materialId) ?? 0) + delta);
    byStation.set(stationId, mat);
  };
  for (const r of receipts) add(r.stationId, r.materialId, r.qty);
  for (const u of usages) add(u.stationId, u.materialId, -u.qty);
  if (transfers) {
    for (const t of transfers) {
      add(t.fromStationId, t.materialId, -t.qty);
      add(t.toStationId, t.materialId, t.qty);
    }
  }
  return byStation;
}

/** The requirement that applies to a material at one station: the station's own
 *  override when a materialStations row exists, otherwise the material's
 *  requiredQty / minRequiredSpare defaults. */
export function effectiveRequirement(
  material: Material,
  materialStations: MaterialStation[],
  stationId: number | null
): { requiredQty: number; minRequiredSpare: number } {
  const row = materialStations.find(
    (s) => s.materialId === material.id && s.stationId === stationId
  );
  if (row) return { requiredQty: row.requiredQty, minRequiredSpare: row.minRequiredSpare };
  return {
    requiredQty: material.requiredQty,
    minRequiredSpare: Number(material.minRequiredSpare) || 0,
  };
}

/**
 * Every (material × station) whose in-hand balance is below that station's
 * effective minimum required spare, sorted by material name then station.
 *
 * The minimum is taken per station: an explicit materialStations row overrides
 * the material's own minRequiredSpare. Only stations that have a minimum set
 * (via their own row or the material default) are considered, and a station is
 * checked even when it holds no stock at all (in-hand 0) — that is the whole
 * point of a per-station minimum. A material is only ever checked at stations
 * where it is actually present — it has stock there or its own requirement
 * override names that station — so a material kept at one station never raises
 * alerts at other stations. The station label comes from the caller's
 * stationName callback.
 */
export function lowStockAlerts(
  materials: Material[],
  materialStations: MaterialStation[],
  receipts: MaterialReceipt[],
  usages: MaterialUsage[],
  stationName: (id: number | null) => string,
  transfers?: MaterialTransfer[]
): LowStockAlert[] {
  const byStation = stationInHand(receipts, usages, transfers);
  const alerts: LowStockAlert[] = [];
  for (const material of materials) {
    const min = Number(material.minRequiredSpare) || 0;
    if (min <= 0 && !materialStations.some((s) => s.materialId === material.id && s.minRequiredSpare > 0)) {
      continue;
    }
    // Stations to check: every station that holds stock of this material, plus
    // every station with its own requirement override for it. Stations holding
    // stock of other materials are never checked — a material kept at one
    // station must not raise alerts at the others.
    const stationIds = new Set<number | null>();
    for (const [stationId, mat] of byStation) {
      if (mat.has(material.id)) stationIds.add(stationId);
    }
    for (const s of materialStations) {
      if (s.materialId === material.id) stationIds.add(s.stationId);
    }
    for (const stationId of stationIds) {
      const { minRequiredSpare } = effectiveRequirement(material, materialStations, stationId);
      if (minRequiredSpare <= 0) continue;
      const inHand = byStation.get(stationId)?.get(material.id) ?? 0;
      if (inHand >= minRequiredSpare) continue;
      alerts.push({
        material,
        stationId,
        stationLabel: stationName(stationId),
        inHand,
        minRequiredSpare,
        shortage: minRequiredSpare - inHand,
      });
    }
  }
  alerts.sort(
    (a, b) =>
      a.material.name.localeCompare(b.material.name) ||
      a.stationLabel.localeCompare(b.stationLabel)
  );
  return alerts;
}

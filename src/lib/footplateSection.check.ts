import assert from "node:assert/strict";
import { computeAllSchedules, expandInspectionRecords, footplateFactsOf } from "./inspections";
import type { InspectionRecord } from "./inspections";

const stations: Record<number, string> = {
  3: "YERRAGUNTLA",
  7: "KOILAKUNTLA",
};

const resolve = (r: InspectionRecord) => {
  const id = r.inspectionStationId ?? null;
  return {
    id,
    name: (id && stations[id]) || (r.stationMovement || "").trim() || "Unspecified station",
    towardsId: null,
    towards: "Unspecified side",
  };
};

const aug30: InspectionRecord = {
  id: 40,
  logDate: "2026-08-30",
  inspectionKind: null,
  inspectionPeriodicity: "monthly",
  footplateJourneys: [
    {
      boardingStationId: 3,
      otherEndStationId: 7,
      day: null,
      night: { direction: "Both", up: { trainNo: "77212" } as never, down: { trainNo: "17261" } as never },
    },
  ],
};

const sep9: InspectionRecord = {
  id: 49,
  logDate: "2026-09-09",
  inspectionKind: null,
  inspectionPeriodicity: "monthly",
  footplateJourneys: [
    {
      boardingStationId: 7,
      otherEndStationId: 3,
      day: null,
      night: { direction: "Up", up: { trainNo: "17215" } as never, down: null },
    },
  ],
};

const facts30 = footplateFactsOf({ ...aug30, inspectionKind: "footplate" });
assert.deepEqual(
  facts30.map((f) => `${f.shift}-${f.dir}-${f.stationId}-${f.otherEndStationId}`).sort(),
  ["Night-Down-3-7", "Night-Up-3-7"]
);

const facts9 = footplateFactsOf({ ...sep9, inspectionKind: "footplate" });
assert.deepEqual(
  facts9.map((f) => `${f.shift}-${f.dir}-${f.stationId}-${f.otherEndStationId}`),
  ["Night-Up-7-3"]
);

const dues = computeAllSchedules(expandInspectionRecords([aug30, sep9]), "2026-09-24", resolve);
const night = dues.filter((d) => d.kind === "footplate" && d.fpShift === "Night");
const up = night.find((d) => d.fpDir === "Up");
const down = night.find((d) => d.fpDir === "Down");
assert.equal(up?.lastDone, "2026-09-09");
assert.equal(down?.lastDone, "2026-08-30");
assert.equal(night.length, 2);

console.log("footplateSection check ok");

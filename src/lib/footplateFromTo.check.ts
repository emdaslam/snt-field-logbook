import assert from "node:assert/strict";
import {
  footplateFromTo,
  footplateEndsForDir,
  footplateInspectionRows,
  footplateTrainHops,
  footplateTrainsInRideOrder,
  rideHasBothDirections,
} from "./api";
import type { FootplateRide } from "@/db/schema";

const nameOf = (id: number | null) =>
  id === 3 ? "YERRAGUNTLA" : id === 7 ? "KOILAKUNTLA" : "Unspecified station";

assert.deepEqual(footplateFromTo({ boardingStationId: 3, otherEndStationId: 7 }, nameOf), {
  from: "YERRAGUNTLA",
  to: "KOILAKUNTLA",
});
assert.deepEqual(footplateFromTo({ boardingStationId: 0, otherEndStationId: 0 }, nameOf), {
  from: "-",
  to: "-",
});
assert.deepEqual(footplateFromTo(null, nameOf), { from: "-", to: "-" });

const both: FootplateRide = {
  boardingStationId: 3,
  otherEndStationId: 7,
  shift: "Day",
  upFromBoarding: true,
  day: {
    direction: "Both",
    up: { trainNo: "17215", engineNo: "", lpName: "", alpName: "", tmrName: "", remarks: "" },
    down: { trainNo: "17216", engineNo: "", lpName: "", alpName: "", tmrName: "", remarks: "" },
  },
  night: null,
};

assert.equal(rideHasBothDirections(both), true);
assert.deepEqual(footplateEndsForDir(both, "Up", nameOf), { from: "YERRAGUNTLA", to: "KOILAKUNTLA" });
assert.deepEqual(footplateEndsForDir(both, "Down", nameOf), { from: "KOILAKUNTLA", to: "YERRAGUNTLA" });

const reversed = { ...both, upFromBoarding: false };
assert.deepEqual(footplateEndsForDir(reversed, "Up", nameOf), { from: "KOILAKUNTLA", to: "YERRAGUNTLA" });
assert.deepEqual(footplateEndsForDir(reversed, "Down", nameOf), { from: "YERRAGUNTLA", to: "KOILAKUNTLA" });

const onlyUp: FootplateRide = {
  boardingStationId: 3,
  otherEndStationId: 7,
  shift: "Day",
  upFromBoarding: true,
  day: {
    direction: "Up",
    up: { trainNo: "17215", engineNo: "", lpName: "", alpName: "", tmrName: "", remarks: "" },
    down: null,
  },
  night: null,
};
assert.equal(rideHasBothDirections(onlyUp), false);
assert.deepEqual(footplateEndsForDir(onlyUp, "Up", nameOf), { from: "YERRAGUNTLA", to: "KOILAKUNTLA" });
assert.deepEqual(footplateEndsForDir(onlyUp, "Down", nameOf), { from: "YERRAGUNTLA", to: "KOILAKUNTLA" });

const rows = footplateInspectionRows(both, {}, nameOf);
assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  shift: "Day Up footplate",
  trainNo: "17215",
  from: "YERRAGUNTLA",
  to: "KOILAKUNTLA",
});
assert.deepEqual(rows[1], {
  shift: "Day Down footplate",
  trainNo: "17216",
  from: "KOILAKUNTLA",
  to: "YERRAGUNTLA",
});

const hopTrue = footplateTrainHops(both, "YERRAGUNTLA", "KOILAKUNTLA");
assert.equal(hopTrue.length, 2);
assert.deepEqual(
  hopTrue.map((h) => [h.from, h.to, h.dir, h.train.trainNo]),
  [
    ["YERRAGUNTLA", "KOILAKUNTLA", "Up", "17215"],
    ["KOILAKUNTLA", "YERRAGUNTLA", "Down", "17216"],
  ]
);

const hopRev = footplateTrainHops(reversed, "YERRAGUNTLA", "KOILAKUNTLA");
assert.deepEqual(
  hopRev.map((h) => [h.from, h.to, h.dir, h.train.trainNo]),
  [
    ["YERRAGUNTLA", "KOILAKUNTLA", "Down", "17216"],
    ["KOILAKUNTLA", "YERRAGUNTLA", "Up", "17215"],
  ]
);

const hopOnlyUp = footplateTrainHops(onlyUp, "YERRAGUNTLA", "KOILAKUNTLA");
assert.deepEqual(
  hopOnlyUp.map((h) => [h.from, h.to, h.dir, h.train.trainNo]),
  [["YERRAGUNTLA", "KOILAKUNTLA", "Up", "17215"]]
);

const dayNightBoth: FootplateRide = {
  ...both,
  shift: "Day,Night",
  night: {
    direction: "Both",
    up: { trainNo: "17217", engineNo: "", lpName: "", alpName: "", tmrName: "", remarks: "" },
    down: { trainNo: "17218", engineNo: "", lpName: "", alpName: "", tmrName: "", remarks: "" },
  },
};
assert.deepEqual(
  footplateTrainsInRideOrder(dayNightBoth).map((t) => [t.shift, t.dir, t.train.trainNo]),
  [
    ["Day", "Up", "17215"],
    ["Day", "Down", "17216"],
    ["Night", "Up", "17217"],
    ["Night", "Down", "17218"],
  ]
);
assert.deepEqual(
  footplateTrainHops(dayNightBoth, "YERRAGUNTLA", "KOILAKUNTLA").map((h) => [h.from, h.to]),
  [
    ["YERRAGUNTLA", "KOILAKUNTLA"],
    ["KOILAKUNTLA", "YERRAGUNTLA"],
    ["YERRAGUNTLA", "KOILAKUNTLA"],
    ["KOILAKUNTLA", "YERRAGUNTLA"],
  ]
);

console.log("footplateFromTo.check.ts: ok");

import assert from "node:assert/strict";
import { footplateFromTo } from "./api";

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
assert.deepEqual(footplateFromTo(undefined, nameOf), { from: "-", to: "-" });

console.log("footplateFromTo.check.ts: ok");

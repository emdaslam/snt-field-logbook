import assert from "node:assert/strict";
import { pcdoEntriesOf, pcdoWorkEntries, counterResetsOf, pcdoDiscTotals } from "./api";

const legacy = {
  pcdoWork: "old free text",
  pcdoStationId: 7,
  hasDisconnections: true,
  discSpecialWork: 2,
  discFailure: 1,
  discMaintenance: 0,
  discNotPermitted: 0,
  counterResets: [
    { equipment: "MSDAC" as const, stationId: null, nextStationId: null, failures: 3, testing: 1 },
  ],
};
const wrapped = pcdoEntriesOf(legacy);
assert.equal(wrapped.length, 1);
assert.equal(wrapped[0].stationId, 7);
assert.equal(wrapped[0].works[0].work, "old free text");
assert.equal(wrapped[0].discSpecialWork, 2);
assert.equal(wrapped[0].counterResets[0].failures, 3);
assert.equal(pcdoWorkEntries(legacy).length, 1);
assert.equal(counterResetsOf(legacy).reduce((n, r) => n + r.failures + r.testing, 0), 4);

const multi = {
  pcdoEntries: [
    {
      stationId: 1,
      works: [{ department: "Signalling", work: "A" }],
      discSpecialWork: 1,
      discFailure: 0,
      discMaintenance: 0,
      discNotPermitted: 0,
      counterResets: [],
    },
    {
      stationId: 2,
      works: [{ department: "OHE", work: "B" }],
      discSpecialWork: 0,
      discFailure: 4,
      discMaintenance: 0,
      discNotPermitted: 0,
      counterResets: [
        { equipment: "BPAC" as const, stationId: 2, nextStationId: 3, failures: 1, testing: 0 },
      ],
    },
  ],
};
assert.equal(pcdoEntriesOf(multi).length, 2);
assert.equal(pcdoWorkEntries(multi).map((w) => w.work).join(","), "A,B");
assert.deepEqual(pcdoDiscTotals(multi), { sw: 1, fa: 4, mt: 0, np: 0 });
assert.equal(counterResetsOf(multi).length, 1);
assert.equal(pcdoEntriesOf({}).length, 0);

console.log("pcdoEntries check ok");

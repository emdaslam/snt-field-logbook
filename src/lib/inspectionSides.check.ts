import assert from "node:assert/strict";
import { defaultNeedsSide, sideAskingKinds } from "./inspections";

assert.equal(defaultNeedsSide("monthly inspection"), true);
assert.equal(defaultNeedsSide("quarterly inspection"), true);
assert.equal(defaultNeedsSide("maintenance"), true);
assert.equal(defaultNeedsSide("joint inspection"), false);
assert.equal(defaultNeedsSide("failures"), false);

const kinds = sideAskingKinds([
  { name: "monthly inspection", needsSide: false },
  { name: "failures", needsSide: false },
]);
assert.equal(kinds.has("monthly"), true);
assert.equal(kinds.has("maintenance"), false);

console.log("inspectionSides check ok");

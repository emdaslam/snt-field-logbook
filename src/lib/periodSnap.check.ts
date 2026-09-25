import assert from "node:assert/strict";
import { snapToMonth } from "./period";

const sep = { from: "2026-09-01", to: "2026-09-30", label: "September 2026" };
const aug = { from: "2026-08-01", to: "2026-08-31", label: "August 2026" };
const months = [sep, aug];

assert.equal(snapToMonth(sep, months).from, sep.from);
assert.equal(snapToMonth(aug, months).label, aug.label);
assert.deepEqual(
  snapToMonth({ from: "2026-09-01", to: "2026-09-10", label: "Custom range" }, months),
  sep
);
assert.deepEqual(
  snapToMonth({ from: "2025-01-01", to: "2025-01-31", label: "Custom range" }, months),
  sep
);

console.log("periodSnap check ok");

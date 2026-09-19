import assert from "node:assert/strict";
import { totalListedBytes, applyListedSizes } from "./drivebackup";

assert.equal(totalListedBytes([]), 0);
assert.equal(totalListedBytes([{ size: "100" }, { size: 20 }, { size: "nope" }, {}]), 120);

const listed = [
  { name: "snt-index.json", size: "10" },
  { name: "snt-data.json", size: "50" },
  { name: "snt-day-2026-01-01.json", size: "30" },
  { name: "snt-day-gone.json", size: "7" },
];
const after = applyListedSizes(
  listed,
  [
    { name: "snt-day-2026-01-01.json", bytes: 40 },
    { name: "snt-day-2026-01-02.json", bytes: 8 },
  ],
  ["snt-day-gone.json"],
);
assert.equal(after.bytes, 10 + 50 + 40 + 8);
assert.equal(after.files, 4);

console.log("driveTotal check ok");

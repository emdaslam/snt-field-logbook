import assert from "node:assert/strict";
import { fitLeftoverWidths } from "./fitLeftover";

const avail = 547.28;
const diaryPinned = { 0: 50.9, 1: 31.1, 2: 29.3, 3: 29.3, 4: 31.1, 5: 31.0 };
const diary = fitLeftoverWidths(diaryPinned, 6, avail);
assert.equal(diary[0], 50.9);
assert.equal(diary[1], 31.1);
assert.equal(diary[5], 31.0);
assert.equal(Number(diary[6]!.toFixed(2)), Number((avail - 202.7).toFixed(2)));
assert.ok(diary[6]! > 300);

const taPinned = { 0: 56, 1: 40, 2: 36, 3: 36, 4: 40, 5: 40, 6: 30, 7: 32, 8: 56 };
const ta = fitLeftoverWidths(taPinned, 9, avail);
assert.equal(ta[0], 56);
assert.ok(ta[9]! > 150);

const muster = fitLeftoverWidths({ 0: 20, 1: 20, 2: 20 }, undefined, 90);
assert.equal(muster[0], 30);
assert.equal(muster[1], 30);
assert.equal(muster[2], 30);

console.log("fitLeftover check ok");

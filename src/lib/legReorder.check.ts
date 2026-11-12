import assert from "node:assert/strict";
import { moveLeg } from "./api";

const legs = ["HQ→A", "A→B", "B→C", "C→HQ"];

// Drag the first leg down two positions.
assert.deepEqual(moveLeg(legs, 0, 2), ["A→B", "B→C", "HQ→A", "C→HQ"]);

// Drag the last leg to the top.
assert.deepEqual(moveLeg(legs, 3, 0), ["C→HQ", "HQ→A", "A→B", "B→C"]);

// Dropping in place keeps the order (and returns the same array).
assert.equal(moveLeg(legs, 1, 1), legs);

// Pointer past the last row clamps to the end; above the first clamps to 0.
assert.deepEqual(moveLeg(legs, 0, 99), ["A→B", "B→C", "C→HQ", "HQ→A"]);
assert.deepEqual(moveLeg(legs, 2, -5), ["B→C", "HQ→A", "A→B", "C→HQ"]);

// Bad start index and the source list are left untouched.
assert.deepEqual(moveLeg(legs, -1, 0), legs);
assert.deepEqual(legs, ["HQ→A", "A→B", "B→C", "C→HQ"]);

console.log("legReorder check ok");

import assert from "node:assert/strict";
import { isSpecialMovement, printedWork } from "./types";

assert.equal(printedWork({ movementKind: "rest", workDone: "personal note" }), "");
assert.equal(printedWork({ movementKind: "nh", workDone: "note" }), "");
assert.equal(printedWork({ movementKind: "leave", workDone: "note" }), "");
assert.equal(printedWork({ movementKind: "cr", workDone: "note" }), "");
assert.equal(printedWork({ movementKind: "station", workDone: "Point machine" }), "Point machine");
assert.equal(printedWork({ movementKind: "footplate", workDone: "  ride  " }), "ride");
assert.equal(printedWork({ movementKind: null, workDone: "HQ work" }), "HQ work");
assert.equal(printedWork({ workDone: "  " }), "");
assert.equal(isSpecialMovement({ movementKind: "rest" }), true);
assert.equal(isSpecialMovement({ movementKind: "footplate" }), false);

console.log("printedWork check ok");

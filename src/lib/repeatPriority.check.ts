import assert from "node:assert/strict";
import { escalatedPriority, repeatBadge, titleSuggestions } from "./repeatPriority";

assert.equal(escalatedPriority("Normal", 0), "Normal");
assert.equal(escalatedPriority("Later", 1), "Later"); // one repeat: base stands
assert.equal(escalatedPriority("Later", 2), "Normal"); // 2+ repeats: at least Normal
assert.equal(escalatedPriority("Normal", 2), "Normal");
assert.equal(escalatedPriority("Normal", 3), "Urgent"); // 3+ repeats: Urgent
assert.equal(escalatedPriority("Later", 5), "Urgent");
assert.equal(escalatedPriority("Urgent", 2), "Urgent"); // never downgraded
assert.equal(repeatBadge(0), "");
assert.equal(repeatBadge(undefined), "");
assert.equal(repeatBadge(3), " ×3");

assert.deepEqual(titleSuggestions("", ["Signal dead"]), []); // too short: quiet
assert.deepEqual(
  titleSuggestions("signal de", ["DSB signal dead", "Point machine loose", "Signal dead at ASK"]),
  ["Signal dead at ASK", "DSB signal dead"]
);
assert.deepEqual(
  titleSuggestions("track circuit", ["Track-circuit failure DSB", "Block instrument repair"],
    ),
  ["Track-circuit failure DSB"]
);
assert.deepEqual(
  titleSuggestions("axle counter bad", ["Axle counter intermittent", "LC gate hurdle"]),
  ["Axle counter intermittent"]
);
// duplicate titles collapse; recency order wins ties
assert.deepEqual(
  titleSuggestions("point", ["Point tight ASK", "Point tight DSB", "Signal off"]),
  ["Point tight ASK", "Point tight DSB"]
);

console.log("repeatPriority check ok");

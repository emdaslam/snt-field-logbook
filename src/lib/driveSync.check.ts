import assert from "node:assert/strict";
import {
  shouldPullRemote,
  backupIndexDays,
  shouldAskDirtyDayConflict,
  countDivergentDirtyDays,
  dayLogsMatch,
  DIRTY_DAY_ASK_THRESHOLD,
} from "./drivebackup";

assert.equal(DIRTY_DAY_ASK_THRESHOLD, 3);

assert.equal(shouldPullRemote("2026-01-02", "2026-01-01", false), true);
assert.equal(shouldPullRemote("2026-01-02", "2026-01-01", true), false);
assert.equal(shouldPullRemote("2026-01-01", "2026-01-02", false), false);
assert.equal(shouldPullRemote(null, null, false), false);

assert.deepEqual(
  backupIndexDays(["2026-01-02"], ["snt-day-2026-01-01.json", "snt-data.json"], true),
  ["2026-01-01", "2026-01-02"]
);
assert.deepEqual(
  backupIndexDays(["2026-01-02"], ["snt-day-2026-01-01.json"], false),
  ["2026-01-02"]
);

const log = (date: string, work: string) => ({ logDate: date, workDone: work });
assert.equal(dayLogsMatch([log("2026-01-01", "a")], [log("2026-01-01", "a")]), true);
assert.equal(dayLogsMatch([log("2026-01-01", "a")], [log("2026-01-01", "b")]), false);

const local = new Map<string, unknown[]>([
  ["2026-01-01", [log("2026-01-01", "new")]],
  ["2026-01-02", [log("2026-01-02", "same")]],
  ["2026-01-03", [log("2026-01-03", "new")]],
  ["2026-01-04", [log("2026-01-04", "new")]],
  ["2026-01-05", [log("2026-01-05", "new")]],
]);
const remote = new Map<string, unknown[]>([
  ["2026-01-01", [log("2026-01-01", "old")]],
  ["2026-01-02", [log("2026-01-02", "same")]],
  ["2026-01-03", [log("2026-01-03", "old")]],
  ["2026-01-04", [log("2026-01-04", "old")]],
  ["2026-01-05", [log("2026-01-05", "old")]],
]);

assert.equal(
  countDivergentDirtyDays(["2026-01-01", "2026-01-02"], local, remote),
  1
);
assert.equal(shouldAskDirtyDayConflict(3), false);
assert.equal(shouldAskDirtyDayConflict(4), true);
assert.equal(
  countDivergentDirtyDays(
    ["2026-01-01", "2026-01-03", "2026-01-04", "2026-01-05"],
    local,
    remote
  ),
  4
);
assert.equal(
  shouldAskDirtyDayConflict(
    countDivergentDirtyDays(
      ["2026-01-01", "2026-01-03", "2026-01-04", "2026-01-05"],
      local,
      remote
    )
  ),
  true
);

console.log("driveSync check ok");

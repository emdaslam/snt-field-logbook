import assert from "node:assert/strict";
import { notifGroup, sortNotifications } from "./notificationOrder";

assert.equal(notifGroup("inspection"), "inspection");
assert.equal(notifGroup("tag"), "inspection");
assert.equal(notifGroup("planned"), "planned");
assert.equal(notifGroup("due"), "due");
assert.equal(notifGroup("stock"), "stock");

assert.deepEqual(
  sortNotifications([
    { kind: "stock", id: "s" },
    { kind: "due", id: "d-later", priority: "Later", dueDays: -5 },
    { kind: "due", id: "d-urgent-soon", priority: "Urgent", dueDays: 2 },
    { kind: "due", id: "d-urgent-overdue", priority: "Urgent", dueDays: -3 },
    { kind: "planned", id: "p", dueDays: 1 },
    { kind: "inspection", id: "i", dueDays: 0 },
    { kind: "tag", id: "t", dueDays: -1 },
  ]).map((n) => n.id),
  ["t", "i", "p", "d-urgent-overdue", "d-urgent-soon", "d-later", "s"]
);

console.log("notificationOrder check ok");

import assert from "node:assert/strict";
import { isSaveCancelled, toBase64Utf8 } from "./documentSave";

assert.equal(isSaveCancelled("Save cancelled"), true);
assert.equal(isSaveCancelled(new Error("Save cancelled")), true);
assert.equal(isSaveCancelled("Could not save"), false);

const round = (s: string) => Buffer.from(toBase64Utf8(s), "base64").toString("utf8");
assert.equal(round("hello"), "hello");
assert.equal(round("snt-backup"), "snt-backup");
assert.equal(round("café"), "café");

console.log("documentSave check ok");

import assert from "node:assert/strict";
import { resolveExportPageMode } from "./exportPageMode";

assert.equal(resolveExportPageMode(false, "fit", null, false), "earlier");
assert.equal(resolveExportPageMode(false, "two", null, true), "earlier");
assert.equal(resolveExportPageMode(false, "earlier", "1", false), "earlier");
assert.equal(resolveExportPageMode(false, null, "1", false), "earlier");

assert.equal(resolveExportPageMode(true, "fit", null, true), "fit");
assert.equal(resolveExportPageMode(true, "two", null, true), "two");
assert.equal(resolveExportPageMode(true, "two", null, false), "fit");
assert.equal(resolveExportPageMode(true, "earlier", null, true), "earlier");
assert.equal(resolveExportPageMode(true, null, "1", false), "fit");
assert.equal(resolveExportPageMode(true, null, "0", false), "earlier");
assert.equal(resolveExportPageMode(true, null, null, true), "fit");

console.log("exportPageMode check ok");

import assert from "node:assert/strict";
import { parsePolishResponse } from "./aiExport";

// fitFontNudge is clamped to 0..2 — the AI can never shrink the fitted font below max.
const shrink = parsePolishResponse(
  JSON.stringify({ palette: "classic", cellPadding: 3, fitFontNudge: -5, columnWidths: [10, 10, 40] }),
  3
)!;
assert.equal(shrink.fitFontNudge, 0);
const grow = parsePolishResponse(
  JSON.stringify({ palette: "classic", cellPadding: 3, fitFontNudge: 5, columnWidths: [10, 10, 40] }),
  3
)!;
assert.equal(grow.fitFontNudge, 2);

// columnWidths still parse and normalise to 100.
const widths = parsePolishResponse(
  JSON.stringify({ palette: "classic", cellPadding: 3, fitFontNudge: 1, columnWidths: [50, 30, 20] }),
  3
)!;
assert.ok(widths.columnWidths);
assert.equal(widths.columnWidths.reduce((a, b) => a + b, 0), 100);
assert.equal(widths.columnWidths.length, 3);

console.log("aiExport check ok");

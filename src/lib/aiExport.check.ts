import assert from "node:assert/strict";
import { parsePolishResponse, paletteOf, PALETTE_NAMES } from "./aiExport";

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

assert.ok(PALETTE_NAMES.includes("modern"));
const modern = parsePolishResponse(
  JSON.stringify({ palette: "modern", cellPadding: 4, zebra: true, highlightTotals: true, borders: "grid" }),
  3
)!;
assert.equal(modern.palette, "modern");
const pal = paletteOf("modern");
assert.equal(pal.headHex, "1E1B4B");
assert.equal(pal.headTextHex, "FFFFFF");
assert.equal(pal.inkHex, "1E1B4B");
assert.equal(pal.accentHex, "0F766E");
assert.equal(pal.zebraHex, "EEF2FF");
assert.equal(pal.totalHex, "C7D2FE");
assert.equal(pal.lineHex, "C7D2FE");
assert.deepEqual(pal.head, [30, 27, 75]);
assert.deepEqual(pal.headText, [255, 255, 255]);
assert.deepEqual(pal.accent, [15, 118, 110]);

console.log("aiExport check ok");

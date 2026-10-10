import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx";

const xml = new TextDecoder().decode(
  buildXlsx({
    rows: [
      ["plain", { v: "bold", bold: true }, { v: "REST", center: true, stacked: true, color: "FF0000" }],
      [{ v: "OL", center: true, stacked: true }],
    ],
  })
);

// three fonts: normal, bold, one per distinct colour (red)
assert.match(xml, /<fonts count="3">/);
assert.match(xml, /<font><b\/>/);
assert.match(xml, /<font><color rgb="FFFF0000"\/>/);
// stacked (vertical) text rides on the alignment element, combined with centring
assert.match(xml, /horizontal="center" vertical="center" textRotation="255"/);
// the red cell's xf points at the red font (id 2); the stacked-but-black cell keeps font 0
assert.match(xml, /fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"/);

console.log("xlsx check ok");

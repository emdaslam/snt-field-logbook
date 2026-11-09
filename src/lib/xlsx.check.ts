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

assert.match(xml, /<fonts count="3">/);
assert.match(xml, /<font><b\/>/);
assert.match(xml, /<font><color rgb="FFFF0000"\/>/);
assert.match(xml, /horizontal="center" vertical="center" textRotation="255"/);
assert.match(xml, /<left style="medium">/);
assert.match(xml, /fontId="2" fillId="0" borderId="1" xfId="0" applyBorder="1" applyFont="1" applyAlignment="1"/);

const kms = "A\nL\nL\n\nA\nR\nE";
const ta = new TextDecoder().decode(
  buildXlsx({
    rows: [
      ["DATE", "TRAIN", "KMS"],
      ["01-10-2026", "ROAD", { v: kms, center: true, wrap: true }],
      ["02-10-2026", "ROAD", ""],
      ["15-10-2026", "ROAD", ""],
      ["31-10-2026", "ROAD", ""],
    ],
  })
);

assert.match(ta, /<dimension ref="A1:C5"\/>/);
assert.match(ta, /01-10-2026/);
assert.match(ta, /31-10-2026/);
assert.match(ta, /&#10;/);
assert.doesNotMatch(ta, /<t[^>]*>[^<]*\n[^<]*<\/t>/);

const cert = new TextDecoder().decode(
  buildXlsx({
    rows: [
      ["01-10-2026"],
      ["15-10-2026"],
      [{ v: "the employee was absent", underlineWord: "employee" }],
      ["31-10-2026"],
    ],
    merges: [
      [0, 0, 1, 0],
      [2, 0, 2, 0],
    ],
  })
);
assert.match(cert, /<rPr><u val="single"\/><\/rPr>/);
assert.doesNotMatch(cert, /\bw:/);
assert.match(cert, /<mergeCells count="1">/);
assert.match(cert, /31-10-2026/);

console.log("xlsx check ok");

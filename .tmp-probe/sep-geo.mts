import { readFileSync } from "node:fs";
import { getDocument } from "/workspace/node_modules/pdfjs-dist/legacy/build/pdf.mjs";

const bytes = new Uint8Array(readFileSync("/workspace/Pdf samples/JMDG PCDO SEPT-26.pdf"));
const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
const pageNo = Number(process.argv[2] ?? 4);
const page = await doc.getPage(pageNo);
const tc = await page.getTextContent();
type W = { s: string; x: number; y: number; e: number };
const ws: W[] = (tc.items as any[])
  .filter((it) => it.str && it.str.trim())
  .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], e: it.width + it.transform[4] }));
ws.sort((a, b) => b.y - a.y || a.x - b.x);
let rowY = NaN; let line = ""; let prevE = 0;
const rows: { y: number; cells: W[] }[] = [];
for (const w of ws) {
  if (Math.abs(w.y - rowY) > 2.5) {
    if (line.trim()) rows.push({ y: rowY, cells: [] });
    line = ""; rowY = w.y;
  }
  rows.at(-1)?.cells.length && null;
  rows.push(); void prevE;
}
void line;
// simpler: cluster
const clustered: { y: number; items: W[] }[] = [];
for (const w of ws) {
  const c = clustered.find((c) => Math.abs(c.y - w.y) <= 2.5);
  if (c) c.items.push(w);
  else clustered.push({ y: w.y, items: [w] });
}
clustered.sort((a, b) => b.y - a.y);
for (const c of clustered) {
  c.items.sort((a, b) => a.x - b.x);
  const segs = c.items.map((w) => `${w.s.replace(/\s+/g, "_")}[${Math.round(w.x)}-${Math.round(w.e)}]`).join(" ");
  console.log(`${c.y.toFixed(1).padStart(6)}  ${segs}`);
}

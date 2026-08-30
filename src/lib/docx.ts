/**
 * Minimal, dependency-free DOCX (Word) export.
 *
 * A .docx is a ZIP archive holding OOXML parts. The exports builders produce a
 * small, known HTML subset (h1 / h2 / h3 / p / ul>li / table), so we translate
 * that into WordprocessingML and pack it into a STORE-method ZIP — no external
 * docx/zip library required, works fully offline in the Capacitor shell.
 */

import type { ExportStyle } from "./types";

const XML_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Collapse whitespace and normalise the · / — separators (mirrors pdf.ts). */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*([·—])\s*/g, " $1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Printable width of the A4 body in points (page 11906 twips minus the
 *  800 + 800 twip side margins), used to size the heading so it fits one line. */
const WORD_PRINTABLE_PT = (11906 - 800 - 800) / 20;

/**
 * Word lets a long paragraph wrap, so an over-long "DIARY OF SRI … FOR THE
 * MONTH OF …" heading would spill onto a second line. Estimate its width with
 * a canvas measure at the base size and shrink the heading font until it fits
 * the printable width, mirroring the PDF's one-line heading. The measurement
 * is approximate (Calibri isn't always available to canvas), so a 0.95 factor
 * keeps a small safety margin; a 5pt floor keeps it readable.
 */
function headingSizeFor(text: string, baseSz: number): number {
  let sz = baseSz;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return sz;
    ctx.font = `700 ${baseSz / 2}pt Calibri, Arial, sans-serif`;
    const w = ctx.measureText(text).width;
    if (w > WORD_PRINTABLE_PT) {
      sz = Math.max(10, Math.round(((baseSz / 2) * WORD_PRINTABLE_PT * 0.95) / w * 2));
    }
  } catch {
    /* ignore */
  }
  return sz;
}

function liText(el: HTMLElement): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      out += node.tagName === "BR" ? "\n" : node.textContent ?? "";
    }
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

function runProps(opts: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  sz?: number;
}): string {
  const inner =
    (opts.bold ? "<w:b/>" : "") +
    (opts.italic ? "<w:i/>" : "") +
    (opts.underline ? `<w:u w:val="single"/>` : "") +
    (opts.color ? `<w:color w:val="${opts.color}"/>` : "") +
    `<w:sz w:val="${opts.sz ?? 18}"/>` +
    `<w:szCs w:val="${opts.sz ?? 18}"/>`;
  return `<w:rPr>${inner}</w:rPr>`;
}

/** One paragraph of text; newlines inside `text` become line breaks. */
function para(
  text: string,
  opts: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    sz?: number;
    before?: number;
    after?: number;
    bullet?: boolean;
    keepNext?: boolean;
    borderBottom?: string;
    centered?: boolean;
    alignRight?: boolean;
    indent?: number;
    indentRight?: number;
  } = {}
): string {
  if (!text.trim()) return "";
  const pPrParts = [];
  if (opts.keepNext) pPrParts.push("<w:keepNext/>");
  pPrParts.push(`<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 160}"/>`);
  if (opts.centered) pPrParts.push(`<w:jc w:val="center"/>`);
  if (opts.alignRight) pPrParts.push(`<w:jc w:val="right"/>`);
  if (opts.bullet) pPrParts.push(`<w:ind w:left="283" w:hanging="283"/>`);
  if (opts.indent) pPrParts.push(`<w:ind w:left="${opts.indent}"/>`);
  if (opts.indentRight) pPrParts.push(`<w:ind w:right="${opts.indentRight}"/>`);
  if (opts.borderBottom) {
    pPrParts.push(
      `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="${opts.borderBottom}"/></w:pBdr>`
    );
  }
  const pPr = `<w:pPr>${pPrParts.join("")}</w:pPr>`;
  const runs = text
    .split("\n")
    .map((line, i) => {
      const prefix = opts.bullet && i === 0 ? "•  " : "";
      const content = esc(line.trim());
      if (!content && !prefix) return i > 0 ? "<w:r><w:br/></w:r>" : "";
      const br = i > 0 ? "<w:br/>" : "";
      return `<w:r>${runProps(opts)}${br}<w:t xml:space="preserve">${prefix}${content}</w:t></w:r>`;
    })
    .join("");
  return `<w:p>${pPr}${runs}</w:p>`;
}

/** One paragraph with fixed columns: each <span> jumps to the next tab stop
 *  (offsets in pts become twips). Used by the TA Journal's header info block
 *  and the days summary so Word mirrors the PDF column alignment. */
function colsPara(spans: string[], offsets: number[], before = 0): string {
  const indent = Math.round((offsets[0] ?? 0) * 20);
  const tabs = offsets
    .slice(1)
    .map(
      (o) =>
        `<w:tab w:val="left" w:pos="${Math.round(Math.max(0, o - (offsets[0] ?? 0)) * 20)}"/>`
    )
    .join("");
  const runs = spans
    .map((t, i) => {
      if (!t) return "";
      const tab = i === 0 ? "" : "<w:tab/>";
      return `<w:r>${runProps({ sz: 18 })}${tab}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    })
    .join("");
  const pPr = `<w:pPr>${tabs ? `<w:tabs>${tabs}</w:tabs>` : ""}<w:ind w:left="${indent}"/><w:spacing w:before="${before}" w:after="160"/></w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function tableCell(
  text: string,
  isHead: boolean,
  width: string,
  rowSpan: number,
  colSpan: number,
  centered = false,
  vAlignMiddle = false,
  plain = false
): string {
  const fill = isHead ? (plain ? "FFFFFF" : "DBEAFE") : "FFFFFF";
  const valign = isHead || vAlignMiddle ? '<w:vAlign w:val="center"/>' : "";
  const tcPr =
    `<w:tcPr>` +
    (width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : "") +
    (colSpan > 1 ? `<w:gridSpan w:val="${colSpan}"/>` : "") +
    (rowSpan > 1 ? '<w:vMerge w:val="restart"/>' : "") +
    `<w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` +
    valign +
    `</w:tcPr>` +
    para(text, {
      bold: isHead,
      color: isHead && !plain ? "1E3A8A" : undefined,
      sz: isHead ? 16 : 18,
      after: 60,
      before: 40,
      centered,
    });
  return `<w:tc>${tcPr}</w:tc>`;
}

function buildTable(html: string, plain = false): string {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const trs = Array.from(parsed.body.firstElementChild?.querySelectorAll("tr") ?? []);
  if (trs.length === 0) return "";
  // Consecutive leading <tr> rows whose cells are <th> form the header (the TA
  // Journal uses a two-tier header with rowspan/colspan merges).
  let headCount = 0;
  while (headCount < trs.length && trs[headCount].querySelector("th")) headCount++;
  const hasHead = headCount > 0;

  // Pin a fixed-width first "date" column if any cell is marked class="date".
  let dateCol = false;
  for (const r of trs) {
    if (r.querySelector("td.date, th.date")) {
      dateCol = true;
      break;
    }
  }
  // Honour explicit per-column widths from data-width on the header cells,
  // resolved to real column indexes through the rowspan/colspan walk so a
  // two-tier header maps "TIME DEPT" etc. to the right grid column.
  const widths: string[] = [];
  if (hasHead) {
    const active = new Map<number, number>();
    for (const r of trs.slice(0, headCount)) {
      const els = Array.from(r.querySelectorAll("td, th"));
      let col = 0;
      for (const el of els) {
        while (active.has(col)) {
          const left = active.get(col)! - 1;
          if (left <= 0) active.delete(col);
          else active.set(col, left);
          col++;
        }
        const w = el.getAttribute("data-width");
        if (w) widths[col] = String(Math.round(Number(w) * 20));
        const rowSpan = Math.max(1, parseInt(el.getAttribute("rowspan") || "1", 10) || 1);
        const colSpan = Math.max(1, parseInt(el.getAttribute("colspan") || "1", 10) || 1);
        if (rowSpan > 1) active.set(col, rowSpan - 1);
        col += colSpan;
      }
    }
  }

  // A cell's width for its grid column: an explicit header width when present,
  // else the pinned 1080 twips for the first "date" column, else autofit.
  const colWidth = (col: number): string =>
    widths[col] ?? (dateCol && col === 0 ? "1080" : "");

  // Walk the rows column-accurately so vertical merges (rowspan) become Word
  // vMerge cells and horizontal merges (colspan) become gridSpan cells; cells
  // covered by a running merge become empty continuation cells.
  const active = new Map<number, number>();
  const rowsHtml: string[] = [];
  let colCount = 0;
  for (const r of trs) {
    const els = Array.from(r.querySelectorAll("td, th"));
    if (els.length === 0) continue;
    const cellsHtml: string[] = [];
    let col = 0;
    const contCell = () => {
      const w = colWidth(col);
      cellsHtml.push(
        `<w:tc><w:tcPr>` +
          (w ? `<w:tcW w:w="${w}" w:type="dxa"/>` : "") +
          `<w:vMerge/><w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>` +
          `</w:tcPr><w:p/></w:tc>`
      );
      col++;
    };
    for (const el of els) {
      while (active.has(col)) {
        const left = active.get(col)! - 1;
        if (left <= 0) active.delete(col);
        else active.set(col, left);
        contCell();
      }
      const rowSpan = Math.max(1, parseInt(el.getAttribute("rowspan") || "1", 10) || 1);
      const colSpan = Math.max(1, parseInt(el.getAttribute("colspan") || "1", 10) || 1);
      const width = colWidth(col);
      // A <th> is a header cell wherever it appears (so a two-tier header is
      // styled and centred like the reference sheet).
      const isHead = el.tagName === "TH";
      // Cells marked class="vtext" render vertically, one character per line
      // (the TA journal's KMS note, which already carries per-word blank lines);
      // other cells are tidied normally.
      const isV = (el.getAttribute("class") || "").split(/\s+/).includes("vtext");
      const text = isV
        ? (el.textContent ?? "").replace(/ +/g, "\n")
        : tidy(el.textContent ?? "");
      const centered = isV || el.getAttribute("data-align") === "center";
      const vAlignMiddle = centered || el.getAttribute("data-valign") === "middle";
      cellsHtml.push(
        tableCell(text, isHead, width, rowSpan, colSpan, centered, vAlignMiddle, plain)
      );
      if (rowSpan > 1) active.set(col, rowSpan - 1);
      col += colSpan;
    }
    while (active.has(col)) {
      const left = active.get(col)! - 1;
      if (left <= 0) active.delete(col);
      else active.set(col, left);
      contCell();
    }
    if (col > colCount) colCount = col;
    rowsHtml.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cellsHtml.join("")}</w:tr>`);
  }

  const gridCols = Array.from(
    { length: colCount },
    (_, i) => (colWidth(i) ? `<w:gridCol w:w="${colWidth(i)}"/>` : "<w:gridCol/>")
  ).join("");

  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="${plain ? "000000" : "CBD5E1"}"/>`)
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr>` +
    `<w:tblGrid>${gridCols}</w:tblGrid>` +
    rowsHtml.join("") +
    `</w:tbl>`
  );
}

/**
 * Convert the HTML produced by the export builders into a standalone Word
 * document. Returns the raw .docx bytes (a STORE-method ZIP).
 */
export function buildDocx(title: string, bodyHtml: string, style: ExportStyle = "colour"): Uint8Array {
  const plain = style === "plain";
  const parsed = new DOMParser().parseFromString(`<div>${bodyHtml}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  const parts: string[] = [];
  const els = root ? Array.from(root.children) : [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const next = els[i + 1];
    const nextIsTable = next?.tagName?.toLowerCase() === "table";
    const tag = el.tagName.toLowerCase();
    const text = tidy(el.textContent ?? "");

    // Explicit page-break marker (the diary's two-page layout): start a fresh
    // page so the second half of the month begins at the top of page 2.
    if (tag === "div" && (el.className || "").split(/\s+/).includes("page-break")) {
      parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`);
      continue;
    }

    if (tag === "h1") {
      if (!text) continue;
      const rightNote = el.getAttribute("data-right-note");
      if (rightNote) {
        parts.push(
          `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:spacing w:before="0" w:after="280"/><w:keepNext/><w:jc w:val="center"/></w:pPr>` +
            `<w:r>${runProps({ bold: true, color: plain ? "000000" : "1E3A8A", sz: 30 })}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
            `<w:r>${runProps({ color: "1E293B", sz: 16 })}<w:tab/><w:t xml:space="preserve">${esc(rightNote)}</w:t></w:r>` +
            `</w:p>`
        );
      } else {
        parts.push(
          para(text, {
            bold: true,
            color: plain ? "000000" : "1E3A8A",
            sz: headingSizeFor(text, 30),
            after: 280,
            keepNext: true,
            borderBottom: plain ? "000000" : "1E3A8A",
            centered: el.className.includes("centered"),
          })
        );
      }
    } else if (tag === "h2") {
      if (!text) continue;
      parts.push(
        para(text, {
          bold: true,
          color: plain ? "000000" : "056346",
          sz: 22,
          after: nextIsTable ? 80 : 200,
          keepNext: true,
          centered: el.className.includes("centered"),
        })
      );
    } else if (tag === "h3") {
      if (!text) continue;
      parts.push(
        para(text, {
          bold: true,
          color: plain ? "000000" : "1E3A8A",
          sz: 19,
          after: nextIsTable ? 80 : 180,
          keepNext: true,
        })
      );
    } else if (tag === "p") {
      if (!text) continue;
      const colsAttr = el.getAttribute("data-cols");
      if (colsAttr) {
        const spans = Array.from(el.querySelectorAll("span")).map((s) => tidy(s.textContent ?? ""));
        const offsets = colsAttr.split(",").map((s) => Number(s.trim()) || 0);
        const before = Math.round((Number(el.getAttribute("data-space-top")) || 0) * 20);
        parts.push(colsPara(spans, offsets, before));
        continue;
      }
      const meta = el.className.includes("meta") || el.className.includes("empty");
      const rightPad = Math.round((Number(el.getAttribute("data-right-pad")) || 0) * 20);
      const uEl = el.querySelector("u");
      if (uEl) {
        // Paragraph with an underlined word (the TA certification line): emit
        // one run per text segment so "employee" can carry <w:u/>. Whitespace
        // between segments is collapsed but not trimmed, keeping word spacing.
        const norm = (s: string) => s.replace(/\s+/g, " ");
        const indent = Math.round((Number(el.getAttribute("data-left")) || 0) * 20);
        const pPrParts = [`<w:spacing w:before="0" w:after="160"/>`];
        if (indent) pPrParts.push(`<w:ind w:left="${indent}"/>`);
        if (el.className.includes("right")) pPrParts.push(`<w:jc w:val="right"/>`);
        const base = {
          italic: meta,
          color: meta ? (plain ? undefined : "64748B") : undefined,
          sz: 18,
        };
        let runs = "";
        for (const node of Array.from(el.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = norm(node.textContent ?? "");
            if (t) runs += `<w:r>${runProps(base)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
          } else if (node instanceof HTMLElement) {
            const t = norm(node.textContent ?? "");
            if (t)
              runs += `<w:r>${runProps({ ...base, underline: node.tagName === "U" })}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
          }
        }
        parts.push(`<w:p><w:pPr>${pPrParts.join("")}</w:pPr>${runs}</w:p>`);
      } else {
        parts.push(
          para(text, {
            bold: !!el.querySelector("strong"),
            italic: meta,
            color: meta ? (plain ? undefined : "64748B") : undefined,
            sz: 18,
            after: 160,
            indent: Math.round((Number(el.getAttribute("data-left")) || 0) * 20),
            alignRight: el.className.includes("right"),
            indentRight: el.className.includes("right") ? rightPad : undefined,
          })
        );
      }
    } else if (tag === "ul") {
      for (const li of Array.from(el.children)) {
        const pieces = liText(li as HTMLElement).split("\n").filter((p) => p.trim());
        for (const piece of pieces) {
          parts.push(para(piece, { bullet: true, sz: 18, after: 60 }));
        }
      }
    } else if (tag === "table") {
      const tbl = buildTable(el.outerHTML, plain);
      if (tbl) {
        parts.push(tbl);
        // Spacer so content after the table isn't glued to its border.
        parts.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="480"/></w:pPr></w:p>`);
      }
    }
  }

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document ${XML_NS}><w:body>` +
    parts.filter((p) => p).join("") +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="800" w:right="800" w:bottom="800" w:left="800"/></w:sectPr>` +
    `</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  return makeZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: documentXml },
  ]);
}

/* ------------------------------------------------------------------ */
/* Store-only ZIP writer                                               */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(entries: { name: string; data: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const packed = entries.map((e) => {
    const bytes = enc.encode(e.data);
    return {
      name: enc.encode(e.name),
      data: bytes,
      crc: crc32(bytes),
    };
  });

  const chunks: Uint8Array[] = [];
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  let offset = 0;

  for (const p of packed) {
    const local = new Uint8Array(30 + p.name.length + p.data.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); // local file header signature
    v.setUint16(4, 20, true); // version needed
    v.setUint16(6, 0x0800, true); // UTF-8 name flag
    v.setUint16(8, 0, true); // store (no compression)
    v.setUint16(10, 0, true); // mod time
    v.setUint16(12, 0, true); // mod date
    v.setUint32(14, p.crc, true);
    v.setUint32(18, p.data.length, true); // compressed size
    v.setUint32(22, p.data.length, true); // uncompressed size
    v.setUint16(26, p.name.length, true);
    v.setUint16(28, 0, true); // extra length
    local.set(p.name, 30);
    local.set(p.data, 30 + p.name.length);
    chunks.push(local);
    central.push({ name: p.name, crc: p.crc, size: p.data.length, offset });
    offset += local.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) {
    const entry = new Uint8Array(46 + c.name.length);
    const v = new DataView(entry.buffer);
    v.setUint32(0, 0x02014b50, true); // central directory signature
    v.setUint16(4, 20, true); // version made by
    v.setUint16(6, 20, true); // version needed
    v.setUint16(8, 0x0800, true); // UTF-8 name flag
    v.setUint16(10, 0, true); // method: store
    v.setUint16(12, 0, true);
    v.setUint16(14, 0, true);
    v.setUint32(16, c.crc, true);
    v.setUint32(20, c.size, true);
    v.setUint32(24, c.size, true);
    v.setUint16(28, c.name.length, true);
    v.setUint16(30, 0, true); // extra
    v.setUint16(32, 0, true); // comment
    v.setUint16(34, 0, true); // disk number
    v.setUint16(36, 0, true); // internal attrs
    v.setUint32(38, 0, true); // external attrs
    v.setUint32(42, c.offset, true);
    entry.set(c.name, 46);
    chunks.push(entry);
    centralSize += entry.length;
  }

  const eocd = new Uint8Array(22);
  const v = new DataView(eocd.buffer);
  v.setUint32(0, 0x06054b50, true); // end of central directory signature
  v.setUint16(4, 0, true);
  v.setUint16(6, 0, true);
  v.setUint16(8, central.length, true);
  v.setUint16(10, central.length, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, centralStart, true);
  v.setUint16(20, 0, true);
  chunks.push(eocd);

  const total = chunks.reduce((m, c) => m + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Base64 of the built .docx (used by native save/share). */
export function docxToBase64(docx: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < docx.length; i++) binary += String.fromCharCode(docx[i]);
  return btoa(binary);
}

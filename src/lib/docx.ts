/**
 * Minimal, dependency-free DOCX (Word) export.
 *
 * A .docx is a ZIP archive holding OOXML parts. The exports builders produce a
 * small, known HTML subset (h1 / h2 / h3 / p / ul>li / table), so we translate
 * that into WordprocessingML and pack it into a STORE-method ZIP — no external
 * docx/zip library required, works fully offline in the Capacitor shell.
 */

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
  color?: string;
  sz?: number;
}): string {
  const inner =
    (opts.bold ? "<w:b/>" : "") +
    (opts.italic ? "<w:i/>" : "") +
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
  } = {}
): string {
  if (!text.trim()) return "";
  const pPrParts = [];
  if (opts.keepNext) pPrParts.push("<w:keepNext/>");
  pPrParts.push(`<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 160}"/>`);
  if (opts.bullet) pPrParts.push(`<w:ind w:left="283" w:hanging="283"/>`);
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
      if (!content && !prefix) return "";
      return `<w:r>${runProps(opts)}<w:t xml:space="preserve">${prefix}${content}</w:t></w:r>`;
    })
    .join("");
  return `<w:p>${pPr}${runs}</w:p>`;
}

function tableCells(
  cells: string[],
  isHead: boolean,
  rowHasDateCol: boolean,
  widths: string[]
): string {
  return cells
    .map((c, i) => {
      const fill = isHead ? "DBEAFE" : "FFFFFF";
      const dateCls = rowHasDateCol && i === 0 ? '<w:tcW w:w="1080" w:type="dxa"/>' : "";
      const w = widths[i] ? `<w:tcW w:w="${widths[i]}" w:type="dxa"/>` : dateCls;
      return (
        `<w:tc><w:tcPr>` +
        (w || "") +
        `<w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>` +
        para(c, {
          bold: isHead,
          color: isHead ? "1E3A8A" : undefined,
          sz: isHead ? 16 : 18,
          after: 60,
          before: 40,
        }) +
        `</w:tc>`
      );
    })
    .join("");
}

function buildTable(html: string): string {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const trs = Array.from(parsed.body.firstElementChild?.querySelectorAll("tr") ?? []);
  if (trs.length === 0) return "";
  const headCells = Array.from(trs[0].querySelectorAll("th"));
  const hasHead = headCells.length > 0;

  // Pin a fixed-width first "date" column if any cell is marked class="date".
  let dateCol = false;
  for (const r of trs) {
    if (r.querySelector("td.date, th.date")) {
      dateCol = true;
      break;
    }
  }
  // Honour explicit per-column widths from data-width on the header row.
  const widths: string[] = [];
  if (hasHead) {
    headCells.forEach((c, i) => {
      const w = c.getAttribute("data-width");
      if (w) widths[i] = String(Math.round(Number(w) * 20));
    });
  }

  const rows = trs
    .map((r) => {
      const cells = Array.from(r.querySelectorAll("td, th")).map((c) =>
        tidy(c.textContent ?? "")
      );
      if (cells.length === 0) return "";
      const isHead = hasHead && r === trs[0];
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tableCells(
        cells,
        isHead,
        dateCol,
        widths
      )}</w:tr>`;
    })
    .join("");

  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`)
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr>` +
    rows +
    `</w:tbl>`
  );
}

/**
 * Convert the HTML produced by the export builders into a standalone Word
 * document. Returns the raw .docx bytes (a STORE-method ZIP).
 */
export function buildDocx(title: string, bodyHtml: string): Uint8Array {
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

    if (tag === "h1") {
      if (!text) continue;
      parts.push(
        para(text, {
          bold: true,
          color: "1E3A8A",
          sz: 30,
          after: 280,
          keepNext: true,
          borderBottom: "1E3A8A",
        })
      );
    } else if (tag === "h2") {
      if (!text) continue;
      parts.push(
        para(text, {
          bold: true,
          color: "056346",
          sz: 22,
          after: nextIsTable ? 80 : 200,
          keepNext: true,
        })
      );
    } else if (tag === "h3") {
      if (!text) continue;
      parts.push(
        para(text, {
          bold: true,
          color: "1E3A8A",
          sz: 19,
          after: nextIsTable ? 80 : 180,
          keepNext: true,
        })
      );
    } else if (tag === "p") {
      if (!text) continue;
      const meta = el.className.includes("meta") || el.className.includes("empty");
      parts.push(
        para(text, {
          italic: meta,
          color: meta ? "64748B" : undefined,
          sz: 18,
          after: 160,
        })
      );
    } else if (tag === "ul") {
      for (const li of Array.from(el.children)) {
        const pieces = liText(li as HTMLElement).split("\n").filter((p) => p.trim());
        for (const piece of pieces) {
          parts.push(para(piece, { bullet: true, sz: 18, after: 60 }));
        }
      }
    } else if (tag === "table") {
      const tbl = buildTable(el.outerHTML);
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

function makeZip(entries: { name: string; data: string }[]): Uint8Array {
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

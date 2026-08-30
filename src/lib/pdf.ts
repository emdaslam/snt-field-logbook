import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CONTENT_FONT_MAX,
  CONTENT_FONT_MIN,
  DEFAULT_CONTENT_FONT_SIZE,
  type ExportStyle,
} from "@/lib/types";
import { registerPdfFonts } from "./pdfFonts";
import type { XlsxSheet } from "./xlsx";

const NAVY: [number, number, number] = [30, 58, 138];
const GREEN: [number, number, number] = [5, 95, 70];
const GREY: [number, number, number] = [100, 116, 139];

/**
 * Last-used numeric export text size for a given export type (points, 10–96).
 * Each export kind (monthly, tomorrow, diary, pcdo, inspection…) remembers its
 * own size so the next export of that type reuses it. Falls back to the
 * legacy single global value, then to the default.
 */
function contentFontSizeSetting(type: string): number {
  try {
    const v = Number(localStorage.getItem(`snt.contentFontSize.${type}`));
    if (Number.isFinite(v) && v >= CONTENT_FONT_MIN && v <= CONTENT_FONT_MAX) {
      return Math.round(v);
    }
    const legacy = Number(localStorage.getItem("snt.contentFontSize"));
    if (Number.isFinite(legacy) && legacy >= CONTENT_FONT_MIN && legacy <= CONTENT_FONT_MAX) {
      return Math.round(legacy);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONTENT_FONT_SIZE;
}

function persistContentFontSize(type: string, v: number) {
  try {
    localStorage.setItem(`snt.contentFontSize.${type}`, String(v));
  } catch {
    /* ignore */
  }
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report";
}

/**
 * Collapse whitespace and guarantee a single space around the · and — separators
 * used across the export builders, so markup adjacency never drops a space.
 */
function tidy(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*([·—])\s*/g, " $1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parse the <tr> elements of an export table into the autoTable body format,
 * honouring vertical merges (rowspan) and horizontal merges (colspan): a cell
 * carrying a span becomes a CellDef with that span, and the cells it covers
 * are omitted from the later rows / columns.
 *
 * A full-column class="vtext" note (the TA journal's KMS note) is handled
 * separately: instead of reaching autoTable as one cell spanning every row it
 * is kept out of the table (each covered row gets an empty cell so the column
 * stays aligned) and returned as a note for the renderer to draw over the
 * column afterwards. A table-wide rowspan poisons autoTable's rowspan height
 * bookkeeping, so the day-group rows below it stop growing to fit their
 * content and the nature-of-work text overflows into the next row.
 */
type PdfCellStyle = {
  font?: string;
  fontStyle?: "bold";
  halign?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineWidth?: { top?: number; bottom?: number; left?: number; right?: number };
};

type PdfCell = string | { content: string; rowSpan: number; colSpan: number; styles?: PdfCellStyle };

type VtextNote = { colIndex: number; text: string };

// Body-cell border width in jsPDF AutoTable's "grid" theme (see getTheme in
// jspdf-autotable). Kept here so a vtext note column can drop its horizontal
// borders while its vertical frame matches the neighbouring cells.
const GRID_LINE_WIDTH = 0.1;
const NOTE_CELL_LINE_WIDTH = { top: 0, bottom: 0, left: GRID_LINE_WIDTH, right: GRID_LINE_WIDTH } as const;

function parseTableBody(trs: Element[]): { body: PdfCell[][]; notes: VtextNote[] } {
  const active = new Map<number, number>();
  const vtextRows = new Map<number, number>();
  const notes: VtextNote[] = [];
  const body: PdfCell[][] = [];
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll("td"));
    const row: PdfCell[] = [];
    let col = 0;
    for (const el of cells) {
      while (active.has(col)) {
        const left = active.get(col)! - 1;
        if (left <= 0) active.delete(col);
        else active.set(col, left);
        col++;
      }
      // Columns covered by a vtext note stay present (empty) in every row so
      // the table's column positions never shift. They draw no horizontal
      // borders so the note column reads as one merged cell.
      while (vtextRows.has(col)) {
        row.push({ content: "", rowSpan: 1, colSpan: 1, styles: { halign: "center", valign: "middle", lineWidth: NOTE_CELL_LINE_WIDTH } });
        const left = vtextRows.get(col)! - 1;
        if (left <= 0) vtextRows.delete(col);
        else vtextRows.set(col, left);
        col++;
      }
      const rowSpan = Math.max(1, parseInt(el.getAttribute("rowspan") || "1", 10) || 1);
      const colSpan = Math.max(1, parseInt(el.getAttribute("colspan") || "1", 10) || 1);
      // Cells marked class="vtext" render vertically, one character per line
      // (the TA journal's KMS note, which already carries per-word blank lines);
      // other cells are tidied normally.
      const isV = (el.getAttribute("class") || "").split(/\s+/).includes("vtext");
      const text = isV
        ? (el.textContent ?? "").replace(/ +/g, "\n")
        : tidy(el.textContent ?? "");
      const styles: PdfCellStyle = {};
      const font = el.getAttribute("data-font");
      if (font) styles.font = font;
      if (el.querySelector("strong")) styles.fontStyle = "bold";
      const align = el.getAttribute("data-align");
      if (align === "center") {
        styles.halign = "center";
        styles.valign = "middle";
      } else if (align === "left") {
        styles.halign = "left";
      }
      const valign = el.getAttribute("data-valign");
      if (valign === "middle") styles.valign = "middle";
      const isVSpan = isV && rowSpan > 1;
      // A full-column vtext note (the TA journal's KMS note) spans many rows
      // but is emitted as separate empty cells; removing their horizontal
      // borders makes the column render as one merged cell without stray
      // lines crossing the vertical text.
      if (isVSpan) styles.lineWidth = NOTE_CELL_LINE_WIDTH;
      const styled = Object.keys(styles).length > 0 ? { styles } : {};
      if (isVSpan) {
        notes.push({ colIndex: col, text });
        row.push({ content: "", rowSpan: 1, colSpan, ...styled });
        vtextRows.set(col, rowSpan - 1);
        col += colSpan;
      } else {
        const cell: PdfCell =
          rowSpan > 1 || colSpan > 1
            ? { content: text, rowSpan, colSpan, ...styled }
            : Object.keys(styles).length > 0
              ? { content: text, rowSpan: 1, colSpan: 1, ...styled }
              : text;
        if (rowSpan > 1) active.set(col, rowSpan - 1);
        col += colSpan;
        row.push(cell);
      }
    }
    // A row may end before a column still covered by a vtext note (the TA
    // journal's return-leg rows carry no cell after their fifth column). Emit
    // the pending borderless empty cells so autoTable does not synthesize a
    // default-styled cell that draws full borders across the note column.
    // (`active` is deliberately not flushed: real rowspans are tracked by
    // autoTable itself, and adding cells here would shift its raw-row indexing.)
    while (vtextRows.has(col)) {
      row.push({ content: "", rowSpan: 1, colSpan: 1, styles: { halign: "center", valign: "middle", lineWidth: NOTE_CELL_LINE_WIDTH } });
      const left = vtextRows.get(col)! - 1;
      if (left <= 0) vtextRows.delete(col);
      else vtextRows.set(col, left);
      col++;
    }
    body.push(row);
  }
  return { body, notes };
}

/**
 * Draw a vertical note (one line of text per row, e.g. the TA journal's KMS
 * note) down the middle of a table column after the table has been rendered.
 * The note is drawn in full on every page the column appears on, centred
 * within that page's column span, and only when the whole note fits the
 * available space — a page too short to hold it gets no note rather than a
 * clipped fragment, so the note never overflows the column. The column's
 * bottom border is also closed on every page, so the merged column reads as a
 * finished cell at the bottom of each page instead of trailing open.
 */
function drawVtextNotes(
  doc: jsPDF,
  notes: VtextNote[],
  cells: { page: number; col: number; x: number; width: number; top: number; bottom: number }[],
  fontSize: number,
  lineColor: [number, number, number],
  lineWidth: number
) {
  if (!notes.length || !cells.length) return;
  const lineHeight = doc.getLineHeightFactor() * fontSize;
  doc.setFont("helvetica", "normal").setFontSize(fontSize).setTextColor(15, 23, 42);
  for (const note of notes) {
    const colCells = cells.filter((c) => c.col === note.colIndex);
    if (!colCells.length) continue;
    const lines = note.text.split("\n");
    if (!lines.length) continue;
    const noteHeight = (lines.length - 1) * lineHeight;
    const x = colCells[0].x + colCells[0].width / 2;
    // Group the column's cells by page: each page's span runs from the top of
    // its first cell to the bottom of its last, so the note and the closing
    // bottom border are placed per page instead of flowing across pages.
    const byPage = new Map<number, { top: number; bottom: number }>();
    for (const c of colCells) {
      const span = byPage.get(c.page);
      if (span) {
        if (c.top < span.top) span.top = c.top;
        if (c.bottom > span.bottom) span.bottom = c.bottom;
      } else {
        byPage.set(c.page, { top: c.top, bottom: c.bottom });
      }
    }
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
      const { top, bottom } = byPage.get(page)!;
      doc.setPage(page);
      // Set the stroke state after switching page: jsPDF writes setDrawColor /
      // setLineWidth into the *current* page's content buffer, so setting them
      // before setPage would bind them to the previous page and leave these
      // lines drawn with a stale/default style on the target page.
      doc.setDrawColor(...lineColor).setLineWidth(lineWidth);
      // The page's span runs from the top of the first body cell to the bottom
      // of the last, so the first body cell's top is the head→body boundary:
      // re-draw the horizontal grid line there for this column, which autotable
      // can drop on a split page (the head has a rowspan cell) and so leave the
      // column's top edge open while every other column stays bordered.
      const first = colCells.find((c) => c.page === page)!;
      doc.line(first.x, first.top, first.x + first.width, first.top);
      // Close the column: the horizontal border at the bottom of every page.
      doc.line(colCells[0].x, bottom, colCells[0].x + colCells[0].width, bottom);
      // The note only when it fits entirely inside this page's column span.
      if (noteHeight <= bottom - top) {
        const start = top + (bottom - top - noteHeight) / 2;
        lines.forEach((line, i) => {
          if (!line) return;
          doc.text(line, x, start + i * lineHeight, { align: "center" });
        });
      }
    }
  }
}

/**
 * Text of a list item with <br/> converted to line breaks, so an item can
 * carry a second line (e.g. "Material/Remarks:"). Other inline elements keep
 * their text on the current line.
 */
function liText(el: HTMLElement): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      out += node.tagName === "BR" ? "\n" : (node.textContent ?? "");
    }
  }
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([·—])\s*/g, " $1 ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Smallest side margin the PDF will use when a table needs more room than the
 *  default margins allow. */
const MIN_MARGIN = 20;

/**
 * Per-column fit of a table's body cells, measured at the table body font
 * (8·fs): `full` is the widest single-line cell text plus horizontal padding —
 * the column width that lets every cell fit on one line — and `word` is the
 * widest single word plus padding (the narrowest the column can be and still
 * be readable, mirroring autoTable's minReadableWidth).
 */
type ColFit = { full: number; word: number };

/** Walk a table's body rows column-accurately (skipping rowspan/colspan
 *  covered cells) and measure each visible cell's text width. */
function measureBodyColumns(table: Element, doc: jsPDF, fs: number, cellPad: number): Record<number, ColFit> {
  const pad2 = 2 * cellPad;
  const out: Record<number, ColFit> = {};
  const trs = Array.from(table.querySelectorAll("tr"));
  let headCount = 0;
  while (headCount < trs.length && trs[headCount].querySelector("th")) headCount++;
  const active = new Map<number, number>();
  for (const tr of trs.slice(headCount)) {
    const cells = Array.from(tr.querySelectorAll("td"));
    let col = 0;
    for (const el of cells) {
      while (active.has(col)) {
        const left = active.get(col)! - 1;
        if (left <= 0) active.delete(col);
        else active.set(col, left);
        col++;
      }
      const rowSpan = Math.max(1, parseInt(el.getAttribute("rowspan") || "1", 10) || 1);
      const colSpan = Math.max(1, parseInt(el.getAttribute("colspan") || "1", 10) || 1);
      // A colspan cell spans several columns, so its text (e.g. the TA total
      // row) doesn't drive any single column's width — skip measuring it.
      if (colSpan === 1) {
        const cls = (el.getAttribute("class") || "").split(/\s+/);
        const isV = cls.includes("vtext");
        const font = el.getAttribute("data-font") === "rupee" ? "rupee" : "helvetica";
        const bold = el.querySelector("strong") ? "bold" : "normal";
        doc.setFont(font, bold).setFontSize(8 * fs);
        const raw = el.textContent ?? "";
        // vtext cells render one token per line; other cells render the full text.
        const lines = isV ? raw.split(/\s+/).filter(Boolean) : [tidy(raw)].filter(Boolean);
        let fullW = 0;
        let wordW = 0;
        for (const line of lines) {
          const w = doc.getTextWidth(line);
          if (w > fullW) fullW = w;
          for (const tok of line.split(/[^\S\u00A0]+/)) {
            const tw = doc.getTextWidth(tok);
            if (tw > wordW) wordW = tw;
          }
        }
        const m = out[col] ?? { full: 0, word: 0 };
        m.full = Math.max(m.full, fullW + pad2);
        m.word = Math.max(m.word, wordW + pad2);
        out[col] = m;
      }
      if (rowSpan > 1) active.set(col, rowSpan - 1);
      col += colSpan;
    }
  }
  return out;
}

/** Extra width added to a measured header word. jsPDF's line-wrapper compares
 *  the sum of the character widths against the column width, which can round
 *  a hair above the same string's getTextWidth() and split the word anyway —
 *  a small buffer keeps e.g. "TRAIN" on one line. */
const HEAD_WORD_BUFFER = 0.5;

/** Walk a table's header rows and measure each header cell's text width in the
 *  bold header font. A fixed column is floored at the header's widest single
 *  word, so a header like "TRAIN NO" never breaks mid-word — it wraps cleanly
 *  to "TRAIN" / "NO" instead of "TRAI" / "N NO". Cells that span several
 *  columns are skipped (their text belongs to no single column). */
function measureHeadColumns(table: Element, doc: jsPDF, fs: number, cellPad: number): Record<number, ColFit> {
  const pad2 = 2 * cellPad;
  const out: Record<number, ColFit> = {};
  const trs = Array.from(table.querySelectorAll("tr"));
  let headCount = 0;
  while (headCount < trs.length && trs[headCount].querySelector("th")) headCount++;
  const active = new Map<number, number>();
  for (const tr of trs.slice(0, headCount)) {
    const cells = Array.from(tr.querySelectorAll("th"));
    let col = 0;
    for (const c of cells) {
      while (active.has(col)) {
        const left = active.get(col)! - 1;
        if (left <= 0) active.delete(col);
        else active.set(col, left);
        col++;
      }
      const rowSpan = Math.max(1, parseInt(c.getAttribute("rowspan") || "1", 10) || 1);
      const colSpan = Math.max(1, parseInt(c.getAttribute("colspan") || "1", 10) || 1);
      if (colSpan === 1) {
        const font = c.getAttribute("data-font") === "rupee" ? "rupee" : "helvetica";
        doc.setFont(font, "bold").setFontSize(8 * fs);
        const text = tidy(c.textContent ?? "");
        let fullW = 0;
        let wordW = 0;
        if (text) {
          fullW = doc.getTextWidth(text) + pad2;
          for (const tok of text.split(/[^\S\u00A0]+/)) {
            const tw = doc.getTextWidth(tok);
            if (tw > wordW) wordW = tw;
          }
          wordW += pad2 + HEAD_WORD_BUFFER;
        }
        const m = out[col] ?? { full: 0, word: 0 };
        m.full = Math.max(m.full, fullW);
        m.word = Math.max(m.word, wordW);
        out[col] = m;
      }
      if (rowSpan > 1) active.set(col, rowSpan - 1);
      col += colSpan;
    }
  }
  return out;
}

/** Per-column reference widths from a table's header: an explicit data-width
 *  or the pinned 72pt for a date column. Columns without either are undefined. */
function headerBaseWidths(trs: Element[], headCount: number): (number | undefined)[] {
  const widths: (number | undefined)[] = [];
  const active = new Map<number, number>();
  for (const r of trs.slice(0, headCount)) {
    const cells = Array.from(r.querySelectorAll("th"));
    let col = 0;
    for (const c of cells) {
      while (active.has(col)) {
        const left = active.get(col)! - 1;
        if (left <= 0) active.delete(col);
        else active.set(col, left);
        col++;
      }
      const rowSpan = Math.max(1, parseInt(c.getAttribute("rowspan") || "1", 10) || 1);
      const colSpan = Math.max(1, parseInt(c.getAttribute("colspan") || "1", 10) || 1);
      if (colSpan === 1) {
        const w = c.getAttribute("data-width");
        const isDate = (c.getAttribute("class") || "").split(/\s+/).includes("date");
        const current = widths[col] ?? 0;
        if (w) widths[col] = Math.max(current, Number(w));
        else if (isDate) widths[col] = Math.max(current, 72);
      }
      if (rowSpan > 1) active.set(col, rowSpan - 1);
      col += colSpan;
    }
  }
  return widths;
}

/**
 * Side margin that fits the widest fixed-column table on the page. A column
 * with a reference width keeps at least that width but grows to hold its body
 * content on one line (`full`); a column without one reserves at least its
 * widest word (`word`). When the required table width exceeds what the default
 * margins leave, the side margins shrink to fit — but never below MIN_MARGIN.
 * Tables with no fixed-width columns are skipped (autoTable already fits those
 * by wrapping content).
 */
function effectiveMargin(
  root: Element,
  bodyFit: Map<Element, Record<number, ColFit>>,
  headFit: Map<Element, Record<number, ColFit>>,
  pageW: number,
  baseMargin: number
): number {
  let widest = 0;
  for (const tbl of Array.from(root.querySelectorAll("table"))) {
    const trs = Array.from(tbl.querySelectorAll("tr"));
    if (!trs.length) continue;
    let headCount = 0;
    while (headCount < trs.length && trs[headCount].querySelector("th")) headCount++;
    if (!headCount) continue;
    const base = headerBaseWidths(trs, headCount);
    if (!base.some((w) => w != null)) continue;
    const fit = bodyFit.get(tbl) ?? {};
    const hf = headFit.get(tbl) ?? {};
    let total = 0;
    base.forEach((w, col) => {
      const f = fit[col];
      const word = Math.max(f?.word ?? 0, hf[col]?.word ?? 0);
      total += w != null ? Math.max(w, f?.full ?? 0, hf[col]?.word ?? 0) : word;
    });
    if (total > widest) widest = total;
  }
  if (widest <= 0) return baseMargin;
  const fitted = (pageW - widest) / 2;
  return Math.max(MIN_MARGIN, Math.min(baseMargin, fitted));
}

/**
 * Render the HTML produced by the export builders into a real PDF.
 * We control the markup shape (h1 / h2 / h3 / p / table / ul>li), so a small
 * DOM walk is enough and avoids pulling in a heavyweight rasteriser.
 * `contentSize` is the numeric pt size of the body text (10–96); headings and
 * tables scale relative to it so the whole document stays proportional.
 */
export function buildPdf(
  title: string,
  bodyHtml: string,
  contentSize: number,
  opts: { margin?: number; footer?: boolean; style?: ExportStyle; cellPad?: number; fixedHeader?: boolean } = {}
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  registerPdfFonts(doc);
  const fs = contentSize / 9;
  // The TA journal's header/footer block — the SOUTH COAST RAILWAY title, the
  // TRAVELLING ALLOWANCE JOURNAL heading, the profile rows and the signature
  // lines — stays at its default size (the size it renders at content size 10).
  // Raising the content-size setting never shrinks or wraps them, and only the
  // table grows; the fixed block also sidesteps the cramped 5pt "Pay" column
  // that the proportional column layout produced at every size.
  const headFs = opts.fixedHeader ? DEFAULT_CONTENT_FONT_SIZE / 9 : fs;
  const baseMargin = opts.margin ?? 40;
  const withFooter = opts.footer ?? true;
  // "plain" drops every fill and colour so the report renders as the reference
  // black-and-white layout (no navy/green headings, no shaded header, no
  // alternating rows); "colour" keeps the branded look.
  const plain = opts.style === "plain";
  const INK: [number, number, number] = plain ? [0, 0, 0] : NAVY;
  const HEAD_FILL: [number, number, number] = plain ? [255, 255, 255] : [219, 234, 254];
  const cellPad = opts.cellPad ?? 4;
  const pageW = doc.internal.pageSize.getWidth();

  const parsed = new DOMParser().parseFromString(`<div>${bodyHtml}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return doc;

  // Pre-measure every table's body cells once: `full` is the width that lets a
  // column's content sit on one line, `word` the width of its widest word. A
  // fixed column then keeps at least its reference width but never goes narrower
  // than its content, so the dates / train numbers / times / stations in the
  // Diary and TA Journal stay on a single line even when the text size is
  // raised. Header cells are measured too, so a header word (e.g. "TRAIN" in
  // "TRAIN NO") never gets split mid-word. The widest table also decides the
  // side margins: when it needs more room than the default margins allow, the
  // margins shrink down to MIN_MARGIN.
  const bodyFit = new Map<Element, Record<number, ColFit>>();
  const headFit = new Map<Element, Record<number, ColFit>>();
  for (const tbl of Array.from(root.querySelectorAll("table"))) {
    bodyFit.set(tbl, measureBodyColumns(tbl, doc, fs, cellPad));
    headFit.set(tbl, measureHeadColumns(tbl, doc, fs, cellPad));
  }
  doc.setFont("helvetica", "normal").setFontSize(8 * fs);
  const margin = effectiveMargin(root, bodyFit, headFit, pageW, baseMargin);
  const maxW = pageW - margin * 2;
  let y = margin;
  // Column segments (x start + drawn width) of the last "cols" paragraph, so a
  // following signature-labels paragraph can centre each label over the line
  // drawn just above it.
  let lastColsSegs: { x: number; w: number }[] | null = null;

  const pageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const els = Array.from(root.children);
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const next = els[i + 1];
    const nextIsTable = next?.tagName?.toLowerCase() === "table";
    const tag = el.tagName.toLowerCase();
    const text = tidy(el.textContent ?? "");

    // Explicit page-break marker (the diary's two-page layout): start a fresh
    // page so the second half of the month begins at the top of page 2.
    if (tag === "div" && (el.className || "").split(/\s+/).includes("page-break")) {
      doc.addPage();
      y = margin;
      continue;
    }

    if (tag === "h1") {
      pageBreak(38 * headFs);
      doc.setFont("helvetica", "bold").setTextColor(...INK);
      // The title stays on a single line — when it would wrap (e.g. a long
      // "DIARY OF SRI … FOR THE MONTH OF …"), shrink the heading font until it
      // fits the printable width. A right-hand note (the TA Journal's "In lieu
      // of G.A.31") reserves room on the baseline so the heading never crowds it.
      const rightNote = el.getAttribute("data-right-note");
      // Reserve just enough room for the right-hand note at its own size plus a
      // gap, so a wide heading never slides under it at large text sizes.
      let headingW = maxW;
      let noteW = 0;
      if (rightNote) {
        doc.setFont("helvetica", "normal").setFontSize(8 * headFs);
        noteW = doc.getTextWidth(rightNote) + 16;
        headingW = maxW - noteW;
      }
      let headingSize = 15 * headFs;
      let tw = 0;
      if (text) {
        // Measure at the real base size — otherwise getTextWidth reports the
        // previous/default size and the shrink factor comes out too big, so a
        // long heading still wraps onto a second line.
        doc.setFont("helvetica", "bold").setFontSize(headingSize);
        tw = doc.getTextWidth(text);
        if (tw > headingW) headingSize = Math.max(5, headingSize * (headingW / tw) * 0.98);
      }
      doc.setFontSize(headingSize);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      // Centered headings (e.g. the TA Journal header) are centred on the page,
      // except when a right-hand note is present and the heading would reach it
      // — then the heading is pulled left so the two never overlap. Other
      // headings stay left-aligned at the margin.
      const centered = el.className.includes("centered");
      let centerX = centered ? pageW / 2 : margin;
      if (centered && rightNote && text) {
        const drawnW = Math.min(tw, headingW);
        const noteLeft = pageW - margin - noteW;
        if (pageW / 2 + drawnW / 2 > noteLeft) centerX = noteLeft - drawnW / 2;
      }
      doc.text(lines, centerX, y, centered ? { align: "center" } : undefined);
      // A right-hand note on the title's baseline (the TA Journal's "In lieu of
      // G.A.31"), drawn small and light so it never competes with the heading.
      if (rightNote) {
        doc.setFont("helvetica", "normal").setFontSize(8 * headFs).setTextColor(plain ? 15 : 30, 23, 59);
        doc.text(rightNote, pageW - margin, y, { align: "right" });
        doc.setFont("helvetica", "bold").setFontSize(headingSize).setTextColor(...INK);
      }
      const tight = el.className.includes("tight");
      y += lines.length * (tight ? 14 * headFs : 18 * headFs) + (tight ? 2 : 4);
      doc.setDrawColor(...INK).setLineWidth(plain ? 0.75 : 1.5).line(margin, y, pageW - margin, y);
      y += 14;
    } else if (tag === "h2") {
      pageBreak(30 * headFs);
      doc.setFont("helvetica", "bold").setFontSize(11 * headFs).setTextColor(...INK);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      const centered = el.className.includes("centered");
      doc.text(lines, centered ? pageW / 2 : margin, y, centered ? { align: "center" } : undefined);
      // A heading sits right above the table under it, leaving a small visible
      // gap (~4pt) between the glyphs and the table border; otherwise keep
      // normal line spacing for whatever follows (e.g. another heading, which
      // needs room for its ascenders).
      const size = 11 * headFs;
      y += nextIsTable
        ? (lines.length - 1) * (1.15 * size) + 0.21 * size + 4
        : lines.length * (1.15 * size);
    } else if (tag === "h3") {
      pageBreak(24 * fs);
      doc.setFont("helvetica", "bold").setFontSize(9.5 * fs).setTextColor(...INK);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      doc.text(lines, margin, y);
      const size = 9.5 * fs;
      y += nextIsTable
        ? (lines.length - 1) * (1.15 * size) + 0.21 * size + 4
        : lines.length * (1.15 * size);
    } else if (tag === "p") {
      if (!text) continue;
      const cls = el.className;
      // A "cols" paragraph renders its <span> children at fixed column offsets
      // (from data-cols="40,200,...") — used by the TA Journal header info
      // block and the days summary, where the reference sheet aligns columns.
      const colsAttr = el.getAttribute("data-cols");
      if (cls.includes("cols") && colsAttr) {
        const baseSize = 9 * headFs;
        const offsets = colsAttr.split(",").map((s) => Number(s.trim()) || 0);
        const gap = 8;
        const right = pageW - margin;
        doc.setFont("helvetica", "normal").setFontSize(baseSize).setTextColor(15, 23, 42);

        // A "cols sigs" paragraph (the TA Journal's signature block) centres
        // each label over the underline drawn by the preceding cols paragraph.
        // When a label is wider than its line it is still centred on the line's
        // midpoint — never left-aligned to the line — so the line stays in the
        // middle of the label; the label is pulled back only if it would cross
        // the page margins.
        const sigs = cls.split(/\s+/).includes("sigs");
        if (sigs) {
          pageBreak(22 * headFs);
          const spans = Array.from(el.querySelectorAll("span")).map((s) => tidy(s.textContent ?? ""));
          spans.forEach((t, i) => {
            if (!t) return;
            const w = doc.getTextWidth(t);
            const seg = lastColsSegs ? lastColsSegs[i] : undefined;
            const x = seg
              ? Math.max(margin, Math.min(seg.x + (seg.w - w) / 2, right - w))
              : Math.max(margin, Math.min(margin + (offsets[i] ?? 0), right - w));
            doc.text(t, x, y);
          });
          y += 13 * headFs + 4;
          continue;
        }

        // Consecutive cols paragraphs that share data-cols are laid out as one
        // block: the column positions come from the widest value in each column
        // across the whole block, so vertically matching fields (the two TA
        // Journal profile lines) start at the same x on every line.
        const group: Element[] = [el];
        while (i + 1 < els.length) {
          const nxt = els[i + 1];
          const nxtCls = nxt.className || "";
          if (
            nxt.tagName.toLowerCase() === "p" &&
            nxt.getAttribute("data-cols") === colsAttr &&
            nxtCls.includes("cols") &&
            !nxtCls.split(/\s+/).includes("sigs")
          ) {
            group.push(nxt);
            i++;
          } else break;
        }
        const rows = group.map((g) => Array.from(g.querySelectorAll("span")).map((s) => tidy(s.textContent ?? "")));
        const nCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
        // Width of what this paragraph actually draws in each column.
        const drawW = Array.from({ length: nCols }, (_, c) =>
          rows.reduce((m, r) => Math.max(m, r[c] ? doc.getTextWidth(r[c]) : 0), 0)
        );
        // A signature-labels paragraph following this one and sharing data-cols
        // centres its labels over the lines drawn here — reserve room for the
        // widest label so those lines sit far enough left for a centred label
        // to stay on the page.
        const nxtEl = els[i + 1];
        const sigW: number[] = [];
        if (
          nxtEl &&
          nxtEl.tagName.toLowerCase() === "p" &&
          (nxtEl.className || "").split(/\s+/).includes("sigs") &&
          nxtEl.getAttribute("data-cols") === colsAttr
        ) {
          Array.from(nxtEl.querySelectorAll("span")).forEach((s, c) => {
            const t = tidy(s.textContent ?? "");
            if (t) sigW[c] = Math.max(sigW[c] ?? 0, doc.getTextWidth(t));
          });
        }
        // Column positions reserve the widest of the drawn content and the
        // signature labels, but lastColsSegs keeps the actual drawn width so
        // the centring uses the real line.
        const colW = drawW.map((w, c) => Math.max(w, sigW[c] ?? 0));
        // Every value renders at the full base size on one line — never shrunk
        // and never wrapped. Columns start at their reference offsets scaled by
        // the base size; when a column would run over its neighbour it is pushed
        // right, and if the last column would pass the page edge the spacing
        // shrinks so it still ends at the right margin. Only the column
        // positions move — the text keeps its natural size.
        const lastOffset = offsets[offsets.length - 1] ?? 0;
        const kMax = lastOffset > 0 ? Math.min(headFs, maxW / lastOffset) : headFs;
        const place = (k: number) => {
          const xs: number[] = [];
          for (let i = 0; i < offsets.length; i++) {
            const natural = margin + offsets[i] * k;
            xs.push(i === 0 ? natural : Math.max(natural, xs[i - 1] + colW[i - 1] + gap));
          }
          return xs;
        };
        const fits = (xs: number[]) => xs.length === 0 || xs[xs.length - 1] + (colW[colW.length - 1] ?? 0) <= right;
        // Largest k in [0, kMax] that still fits the widest (last) column on the
        // page; column positions are monotonic in k, so binary search applies.
        let lo = 0;
        let hi = kMax;
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          if (fits(place(mid))) lo = mid;
          else hi = mid;
        }
        const cols = place(lo);
        lastColsSegs = cols.map((x, i) => ({ x, w: drawW[i] ?? 0 }));
        rows.forEach((row) => {
          pageBreak(22 * headFs);
          row.forEach((t, i) => {
            if (!t) return;
            doc.text(t, cols[i] ?? margin, y);
          });
          y += 13 * headFs + 4;
        });
        continue;
      }
      const left = Number(el.getAttribute("data-left")) || 0;
      const meta = cls.includes("meta") || cls.includes("empty");
      const right = cls.includes("right");
      const rightPad = right ? Number(el.getAttribute("data-right-pad")) || 0 : 0;
      const bold = el.querySelector("strong") ? "bold" : "normal";
      y += Number(el.getAttribute("data-space-top")) || 0;
      doc.setFont("helvetica", meta ? "italic" : bold).setFontSize(9 * headFs);
      if (meta) doc.setTextColor(plain ? 15 : GREY[0], 23, 42);
      else doc.setTextColor(15, 23, 42);
      const lines = doc.splitTextToSize(text, right ? maxW - rightPad : maxW - left) as string[];
      doc.text(lines, right ? pageW - margin - rightPad : margin + left, y, right ? { align: "right" } : undefined);
      // Underline support for a single <u>word</u> inside a paragraph (the TA
      // certification line): locate the word on its wrapped line and draw a
      // short rule beneath it, tracking jsPDF's per-line baseline spacing.
      const uEl = el.querySelector("u");
      if (uEl) {
        const uText = tidy(uEl.textContent ?? "");
        const lineIdx = lines.findIndex((l) => l.includes(uText));
        if (lineIdx >= 0) {
          const line = lines[lineIdx];
          const baseline = y + lineIdx * (1.15 * 9 * headFs);
          const w = doc.getTextWidth(uText);
          const x = right
            ? pageW - margin - rightPad - doc.getTextWidth(line.slice(line.indexOf(uText)))
            : margin + left + doc.getTextWidth(line.slice(0, line.indexOf(uText)));
          doc.setDrawColor(...INK).setLineWidth(0.7).line(x, baseline + 1.4, x + w, baseline + 1.4);
        }
      }
      y += lines.length * (12 * headFs) + 8;
    } else if (tag === "ul") {
      for (const li of Array.from(el.children)) {
        const parts = liText(li as HTMLElement).split("\n").filter((p) => p.trim());
        if (parts.length === 0) continue;
        pageBreak(20 * fs);
        doc.setFont("helvetica", "normal").setFontSize(9 * fs).setTextColor(15, 23, 42);
        const first = doc.splitTextToSize("•  " + parts[0], maxW - 10) as string[];
        doc.text(first, margin + 8, y);
        y += first.length * (12 * fs) + 3;
        for (const extra of parts.slice(1)) {
          pageBreak(20 * fs);
          const lines = doc.splitTextToSize(extra, maxW - 10) as string[];
          doc.text(lines, margin + 20, y);
          y += lines.length * (12 * fs) + 3;
        }
      }
      y += 16;
    } else if (tag === "table") {
      const allRows = Array.from(el.querySelectorAll("tr"));
      if (!allRows.length) continue;
      // Consecutive leading <tr> rows whose cells are <th> form the header
      // (the TA Journal uses a two-tier header with rowspan/colspan merges).
      let headCount = 0;
      while (headCount < allRows.length && allRows[headCount].querySelector("th")) headCount++;
      const headRows = allRows.slice(0, headCount);
      const bodyRows = allRows.slice(headCount);
      const hasHead = headRows.length > 0;

      type HeadCell = { content: string; rowSpan: number; colSpan: number; colIndex: number; el: Element };
      const headCells: HeadCell[][] = [];
      const activeSpan = new Map<number, number>();
      for (const tr of headRows) {
        const cells = Array.from(tr.querySelectorAll("th"));
        const row: HeadCell[] = [];
        let col = 0;
        for (const c of cells) {
          while (activeSpan.has(col)) {
            const left = activeSpan.get(col)! - 1;
            if (left <= 0) activeSpan.delete(col);
            else activeSpan.set(col, left);
            col++;
          }
          const rowSpan = Math.max(1, parseInt(c.getAttribute("rowspan") || "1", 10) || 1);
          const colSpan = Math.max(1, parseInt(c.getAttribute("colspan") || "1", 10) || 1);
          row.push({ content: tidy(c.textContent ?? ""), rowSpan, colSpan, colIndex: col, el: c });
          if (rowSpan > 1) activeSpan.set(col, rowSpan - 1);
          col += colSpan;
        }
        headCells.push(row);
      }

      // Per-column width / alignment from the header cells' data-width and
      // data-align (single-column cells only — a colspan cell carries its own
      // styles instead, so a merged "TIME" label can stay centred across the
      // two timing columns).
      type ColStyle = {
        cellWidth?: number;
        halign?: "left" | "center" | "right";
        valign?: "top" | "middle" | "bottom";
      };
      const columnStyles: Record<number, ColStyle> = {};
      const fit = bodyFit.get(el) ?? {};
      const hf = headFit.get(el) ?? {};
      for (const row of headCells) {
        for (const c of row) {
          const w = c.el.getAttribute("data-width");
          const a = c.el.getAttribute("data-align");
          const entry: ColStyle = { ...columnStyles[c.colIndex] };
          if (w && c.colSpan === 1) {
            // Keep the reference width but never narrower than the column's body
            // content or the header's widest word, so the dates / times / train
            // numbers / stations stay on a single line and a header like
            // "TRAIN NO" wraps between words instead of mid-word, even when the
            // text size is increased.
            entry.cellWidth = Math.max(
              Number(w),
              fit[c.colIndex]?.full ?? Number(w),
              hf[c.colIndex]?.word ?? 0
            );
          }
          if (a === "center" && c.colSpan === 1) {
            entry.halign = "center";
            entry.valign = "middle";
          }
          columnStyles[c.colIndex] = entry;
        }
      }

      // A fixed-width "date" column (cells marked class="date") keeps dates on
      // one line instead of wrapping in a proportionally-narrow column.
      let dateCol: number | null = null;
      outer: for (const row of headCells) {
        for (const c of row) {
          if ((c.el.getAttribute("class") || "").split(/\s+/).includes("date")) {
            dateCol = c.colIndex;
            break outer;
          }
        }
      }
      if (dateCol === null) {
        for (const r of bodyRows) {
          const marked = r.querySelector("td.date");
          if (marked) {
            dateCol = Array.from(r.querySelectorAll("td")).indexOf(marked as HTMLTableCellElement);
            break;
          }
        }
      }
      if (dateCol !== null && !columnStyles[dateCol]?.cellWidth) {
        columnStyles[dateCol] = {
          ...(columnStyles[dateCol] ?? {}),
          cellWidth: Math.max(72, fit[dateCol]?.full ?? 72, hf[dateCol]?.word ?? 0),
        };
      }

      const head: { content: string; rowSpan?: number; colSpan?: number; styles?: ColStyle }[][] | undefined =
        hasHead
          ? headCells.map((row) =>
              row.map((c) => {
                const cell: { content: string; rowSpan?: number; colSpan?: number; styles?: ColStyle } = {
                  content: c.content,
                };
                if (c.rowSpan > 1) cell.rowSpan = c.rowSpan;
                if (c.colSpan > 1) cell.colSpan = c.colSpan;
                if (c.el.getAttribute("data-align") === "center") {
                  cell.styles = { halign: "center", valign: "middle" };
                }
                return cell;
              })
            )
          : undefined;
      const { body, notes } = parseTableBody(bodyRows);
      // Capture the drawn geometry of every vtext column cell so the vertical
      // note can be drawn over it after the table (see drawVtextNotes).
      const vtextCols = new Set(notes.map((n) => n.colIndex));
      const vtextCells: { page: number; col: number; x: number; width: number; top: number; bottom: number }[] = [];
      const didDrawCell = notes.length
        ? (data: {
            section?: string;
            column: { index: number };
            cell: { x: number; width: number; y: number; height: number };
            table: { pageNumber: number };
          }) => {
            if (data.section !== "body" || !vtextCols.has(data.column.index)) return;
            vtextCells.push({
              page: data.table.pageNumber,
              col: data.column.index,
              x: data.cell.x,
              width: data.cell.width,
              top: data.cell.y,
              bottom: data.cell.y + data.cell.height,
            });
          }
        : undefined;
      autoTable(doc, {
        head,
        body,
        startY: y,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8 * fs,
          cellPadding: cellPad,
          overflow: "linebreak",
          textColor: [15, 23, 42],
          ...(plain ? { lineColor: INK } : {}),
        },
        headStyles: {
          fillColor: HEAD_FILL,
          textColor: INK,
          fontStyle: "bold",
          ...(plain ? { lineWidth: 0.1, lineColor: INK } : {}),
        },
        ...(plain ? {} : { alternateRowStyles: { fillColor: [248, 250, 252] } }),
        theme: "grid",
        // Never split a row across pages: a day's movements (or the TOTAL row)
        // moves whole to the next page instead of leaving a fragment behind.
        rowPageBreak: "avoid",
        columnStyles: Object.keys(columnStyles).length ? columnStyles : undefined,
        ...(didDrawCell ? { didDrawCell } : {}),
      });
      const last = (doc as unknown as {
        lastAutoTable?: { finalY: number; startY: number; pageNumber?: number; startPageNumber?: number };
      }).lastAutoTable;
      // Close the KMS column and repeat its note per page (see drawVtextNotes).
      // The closing line matches the table's grid: grey in the colour export,
      // black ink in the plain export.
      drawVtextNotes(doc, notes, vtextCells, 8 * fs, plain ? INK : [200, 200, 200], GRID_LINE_WIDTH);
      if (process.env.DEBUG_VTEXT) {
        const dbg = vtextCells.map((c) => `page${c.page} col${c.col} top${c.top.toFixed(1)} bot${c.bottom.toFixed(1)} x${c.x.toFixed(1)} w${c.width.toFixed(1)}`);
        const spans: string[] = [];
        for (const note of notes) {
          const colCells = vtextCells.filter((c) => c.col === note.colIndex);
          const byPage = new Map<number, { top: number; bottom: number }>();
          for (const c of colCells) { const s = byPage.get(c.page) ?? { top: c.top, bottom: c.bottom }; s.top = Math.min(s.top, c.top); s.bottom = Math.max(s.bottom, c.bottom); byPage.set(c.page, s); }
          for (const [pg, s] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) spans.push(`note col${note.colIndex} page${pg}: top${s.top.toFixed(1)} bot${s.bottom.toFixed(1)} (${(s.bottom - s.top).toFixed(1)}pt)`);
        }
        console.error('DEBUG_VTEXT cells:\n' + dbg.join('\n'));
        console.error('DEBUG_VTEXT spans:\n' + spans.join('\n'));
      }
      // The table may span pages; its last drawn page is where finalY lives.
      // Jump back there so the following block (summary, certificate, …) starts
      // right after the table instead of on the page drawVtextNotes last left.
      const tableStartPage = last?.startPageNumber ?? doc.getCurrentPageInfo().pageNumber;
      const tablePageCount = last?.pageNumber ?? 1;
      doc.setPage(tableStartPage + tablePageCount - 1);
      y = (last?.finalY ?? y + 40) + 24;
    }
  }

  // Footer on every page (skipped for the fit-on-one-page mode and for the
  // plain black-and-white export, which must match the reference report exactly)
  if (withFooter && !plain) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...GREY);
      doc.text(
        `Railway S&T Field Logbook · generated ${new Date().toLocaleString()}`,
        margin,
        doc.internal.pageSize.getHeight() - 20
      );
      doc.text(
        `Page ${i} of ${pages}`,
        pageW - margin,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" }
      );
    }
  }
  return doc;
}

/**
 * Fit-on-one-page rendering for the TA journal. Rebuilds the PDF with reduced
 * margins and no footer, shrinking the content size until it lands on a single
 * page (or hits the fit floor, below which the text would be unreadable).
 */
export function buildFitOnePagePdf(
  title: string,
  bodyHtml: string,
  startSize: number,
  style: ExportStyle = "colour",
  cellPad?: number,
  fixedHeader = false
): jsPDF {
  const FIT_MARGIN = 24;
  const FIT_FONT_MIN = 6;
  let size = startSize;
  let doc = buildPdf(title, bodyHtml, size, { margin: FIT_MARGIN, footer: false, style, fixedHeader, ...(cellPad != null ? { cellPad } : {}) });
  while (doc.getNumberOfPages() > 1 && size > FIT_FONT_MIN) {
    size -= 1;
    doc = buildPdf(title, bodyHtml, size, { margin: FIT_MARGIN, footer: false, style, fixedHeader, ...(cellPad != null ? { cellPad } : {}) });
  }
  return doc;
}

/**
 * Fit-on-two-pages rendering for the two-page diary / TA journal layout. The
 * layout carries no manual text size — instead this picks the largest content
 * size that keeps the whole split on exactly two pages, so the first-page
 * table fills page 1 and the same size carries over to page 2. Page count is
 * monotonic in the size (a larger size never produces fewer pages), so the
 * boundary is found with a binary search.
 */
export function buildFitTwoPagePdf(
  title: string,
  bodyHtml: string,
  style: ExportStyle = "colour",
  cellPad?: number,
  fixedHeader = false
): jsPDF {
  const TWO_PAGE_FONT_MIN = 6;
  const TWO_PAGE_FONT_MAX = 30;
  const render = (size: number) =>
    buildPdf(title, bodyHtml, size, {
      style,
      fixedHeader,
      ...(cellPad != null ? { cellPad } : {}),
    });
  // Even the smallest size may still exceed two pages for a very dense month —
  // fall back to it (best effort) when the search finds no fitting size.
  let best = render(TWO_PAGE_FONT_MIN);
  let lo = TWO_PAGE_FONT_MIN;
  let hi = TWO_PAGE_FONT_MAX;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const doc = render(mid);
    if (doc.getNumberOfPages() <= 2) {
      best = doc;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * @param type export kind used to remember the last chosen text size per
 * export type (e.g. "monthly", "tomorrow", "diary", "ta", "pcdo",
 * "inspection").
 * @param sheet optional Excel grid — when provided the bottom sheet offers an
 * "Excel (.xlsx)" format alongside PDF and Word.
 */
export function exportDocument(
  title: string,
  bodyHtml: string,
  type = "general",
  sheet?: XlsxSheet,
  opts?: { onePage?: boolean; twoPageBody?: string; style?: ExportStyle; cellPad?: number }
) {
  // Bottom sheet that offers the report as PDF, Word (.docx) or Excel (.xlsx),
  // with a text size prompt for the PDF path. The last chosen format is remembered.
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center";
  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--surface);color:var(--n-800);width:100%;max-width:28rem;border-radius:16px 16px 0 0;padding:16px 16px 28px;font-family:system-ui,sans-serif";
  box.innerHTML =
    '<div style="width:40px;height:4px;background:var(--n-300);border-radius:99px;margin:0 auto 14px"></div>' +
    '<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:var(--b-900);text-align:center">Export Report</p>';
  const status = document.createElement("p");
  status.style.cssText = "margin:0 0 10px;font-size:12px;color:var(--n-500);text-align:center;min-height:16px";
  const close = () => overlay.remove();

  // Format toggle — PDF, Word or Excel (Excel only when a grid was provided).
  type Format = "pdf" | "docx" | "xlsx";
  let format: Format = "pdf";
  try {
    const saved = localStorage.getItem("snt.exportFormat");
    if (saved === "docx" || (saved === "xlsx" && sheet)) format = saved;
  } catch {
    /* ignore */
  }
  // Style toggle — "colour" (branded navy/green fills) or "plain" (reference
  // black-and-white, no fills). Each export type remembers its own choice; the
  // default comes from the export builder (diary / TA journal default to plain).
  let style: ExportStyle = opts?.style ?? "colour";
  try {
    const saved = localStorage.getItem(`snt.exportStyle.${type}`);
    if (saved === "colour" || saved === "plain") style = saved;
  } catch {
    /* ignore */
  }
  const seg = document.createElement("div");
  seg.style.cssText = "display:flex;gap:8px;margin:0 0 14px";
  const segStyle = (active: boolean) =>
    `flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${
      active ? "var(--b-900)" : "var(--n-200)"
    };background:${active ? "var(--b-900)" : "var(--n-50)"};color:${active ? "#fff" : "var(--n-700)"}`;
  const makeSegButton = (label: string, f: Format, enabled: boolean) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !enabled;
    b.style.cssText = segStyle(format === f) + (enabled ? "" : "opacity:.45;cursor:not-allowed");
    return b;
  };
  const pdfBtn = makeSegButton("PDF", "pdf", true);
  const wordBtn = makeSegButton("Word (.docx)", "docx", true);
  const excelBtn = makeSegButton("Excel (.xlsx)", "xlsx", Boolean(sheet));
  const buttons = [pdfBtn, wordBtn, excelBtn];
  const applyFormat = (f: Format) => {
    format = f;
    buttons.forEach((b, i) => {
      const target = (["pdf", "docx", "xlsx"] as Format[])[i];
      b.style.cssText = segStyle(f === target) + (b.disabled ? ";opacity:.45;cursor:not-allowed" : "");
    });
    refreshPdfOptions();
    try {
      localStorage.setItem("snt.exportFormat", f);
    } catch {
      /* ignore */
    }
  };
  pdfBtn.onclick = () => applyFormat("pdf");
  wordBtn.onclick = () => applyFormat("docx");
  excelBtn.onclick = () => applyFormat("xlsx");
  seg.appendChild(pdfBtn);
  seg.appendChild(wordBtn);
  seg.appendChild(excelBtn);
  box.appendChild(seg);

  // Style toggle — plain (no colours, the reference layout) or the branded
  // coloured output. Only relevant for PDF and Word; Excel carries no fills.
  const styleRow = document.createElement("div");
  styleRow.style.cssText = "display:flex;gap:8px;margin:0 0 14px";
  const styleBtnStyle = (active: boolean) =>
    `flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${
      active ? "var(--b-900)" : "var(--n-200)"
    };background:${active ? "var(--b-900)" : "var(--n-50)"};color:${active ? "#fff" : "var(--n-700)"}`;
  const colourBtn = document.createElement("button");
  colourBtn.textContent = "Colour";
  const plainBtn = document.createElement("button");
  plainBtn.textContent = "Plain (no colour)";
  const applyStyle = (s: ExportStyle) => {
    style = s;
    colourBtn.style.cssText = styleBtnStyle(style === "colour");
    plainBtn.style.cssText = styleBtnStyle(style === "plain");
    try {
      localStorage.setItem(`snt.exportStyle.${type}`, s);
    } catch {
      /* ignore */
    }
  };
  colourBtn.onclick = () => applyStyle("colour");
  plainBtn.onclick = () => applyStyle("plain");
  styleRow.appendChild(colourBtn);
  styleRow.appendChild(plainBtn);
  applyStyle(style);
  box.appendChild(styleRow);

  // Font size prompt — PDF written content only, 10–96.
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:12px;background:var(--n-50);border:1px solid var(--n-200);border-radius:10px";
  row.innerHTML =
    '<label style="flex:1;font-size:13px;font-weight:600;color:var(--n-700)">Text size<span style="display:block;font-weight:400;font-size:11px;color:var(--n-500);margin-top:2px">Written content only — 10 to 96</span></label>';
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(CONTENT_FONT_MIN);
  input.max = String(CONTENT_FONT_MAX);
  input.value = String(contentFontSizeSetting(type));
  input.style.cssText =
    "width:76px;padding:8px;border:1px solid var(--n-300);border-radius:8px;font-size:15px;text-align:center;font-weight:600;color:var(--b-900)";
  row.appendChild(input);
  row.style.display = format === "pdf" ? "flex" : "none";
  box.appendChild(row);

  // Page layout option (diary / TA journal): squeeze the whole report onto a
  // single page (reduced margins, no footer, auto-shrunk text), split the diary
  // roughly in half over two pages (first ~15/16 days then the rest), or keep
  // the earlier font-size driven output. The two-page body is provided by the
  // export builder as `twoPageBody`.
  const onePage = Boolean(opts?.onePage);
  const twoBody = opts?.twoPageBody;
  type PageMode = "fit" | "two" | "earlier";
  let pageMode: PageMode = "fit";
  try {
    const saved = localStorage.getItem("snt.exportPageMode");
    if (saved === "fit" || saved === "earlier" || (saved === "two" && twoBody)) pageMode = saved;
    else {
      const legacy = localStorage.getItem("snt.exportOnePage");
      if (legacy != null) pageMode = legacy === "1" ? "fit" : "earlier";
    }
  } catch {
    /* ignore */
  }
  const fitNote = document.createElement("p");
  fitNote.style.cssText =
    "margin:0 0 14px;font-size:12px;color:var(--n-500);text-align:center";
  fitNote.textContent = "Auto-shrinks the text and trims margins so the whole report fits on one page.";
  fitNote.style.display = "none";
  box.appendChild(fitNote);
  // The two-page layout has no manual text size — the renderer picks the
  // largest size that keeps the split on exactly two pages.
  const twoNote = document.createElement("p");
  twoNote.style.cssText =
    "margin:0 0 14px;font-size:12px;color:var(--n-500);text-align:center";
  twoNote.textContent = "Text size is chosen automatically so the split fills both pages.";
  twoNote.style.display = "none";
  box.appendChild(twoNote);
  const refreshPdfOptions = () => {
    const fit = pageMode === "fit";
    const two = pageMode === "two";
    row.style.display = format === "pdf" && !fit && !two ? "flex" : "none";
    fitNote.style.display = format === "pdf" && fit ? "block" : "none";
    twoNote.style.display = format === "pdf" && two ? "block" : "none";
    styleRow.style.display = format === "pdf" || format === "docx" ? "flex" : "none";
  };
  if (onePage) {
    const pageSeg = document.createElement("div");
    pageSeg.style.cssText = "display:flex;gap:8px;margin:0 0 14px";
    const pageStyle = (active: boolean) =>
      `flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${
        active ? "var(--b-900)" : "var(--n-200)"
      };background:${active ? "var(--b-900)" : "var(--n-50)"};color:${active ? "#fff" : "var(--n-700)"}`;
    const fitBtn = document.createElement("button");
    fitBtn.textContent = "Fit on one page";
    const twoBtn = twoBody ? document.createElement("button") : null;
    if (twoBtn) twoBtn.textContent = "Two pages (split by days)";
    const stdBtn = document.createElement("button");
    stdBtn.textContent = "Earlier output (font size)";
    const applyPage = (mode: PageMode) => {
      pageMode = mode;
      fitBtn.style.cssText = pageStyle(mode === "fit");
      if (twoBtn) twoBtn.style.cssText = pageStyle(mode === "two");
      stdBtn.style.cssText = pageStyle(mode === "earlier");
      refreshPdfOptions();
      try {
        localStorage.setItem("snt.exportPageMode", mode);
      } catch {
        /* ignore */
      }
    };
    fitBtn.onclick = () => applyPage("fit");
    if (twoBtn) twoBtn.onclick = () => applyPage("two");
    stdBtn.onclick = () => applyPage("earlier");
    pageSeg.appendChild(fitBtn);
    if (twoBtn) pageSeg.appendChild(twoBtn);
    pageSeg.appendChild(stdBtn);
    box.appendChild(pageSeg);
    applyPage(pageMode);
  }
  refreshPdfOptions();

  const chosenSize = () => {
    const v = Math.round(Number(input.value));
    if (!Number.isFinite(v)) return contentFontSizeSetting(type);
    return Math.min(CONTENT_FONT_MAX, Math.max(CONTENT_FONT_MIN, v));
  };

  type ExportArtifact = { filename: string; mimeType: string; base64: string };

  const share = async (a: ExportArtifact) => {
    if (isNative()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/share"),
      ]);
      const written = await Filesystem.writeFile({
        path: `exports/${a.filename}`,
        data: a.base64,
        directory: Directory.Cache,
        recursive: true,
      });
      await Share.share({
        title,
        text: title,
        url: written.uri,
        dialogTitle: "Share export",
      });
      return;
    }
    // Browser fallback
    const bytes = base64ToBytes(a.base64);
    const file = new File([bytes], a.filename, { type: a.mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, text: title });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    throw new Error("Sharing isn’t available here — use Save instead.");
  };

  const save = async (a: ExportArtifact) => {
    if (isNative()) {
      try {
        const { saveViaPicker } = await import("./documentSave");
        await saveViaPicker({ filename: a.filename, data: a.base64, mimeType: a.mimeType });
      } catch (e) {
        const { isSaveCancelled } = await import("./documentSave");
        if (isSaveCancelled(e)) return; // user backed out — close quietly
        throw e;
      }
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([base64ToBytes(a.base64)], { type: a.mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = a.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      throw new Error("Saving was blocked by the browser.");
    }
  };

  const makeButton = (label: string, primary: boolean, run: (a: ExportArtifact) => Promise<void>) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `display:block;width:100%;margin-bottom:8px;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${
      primary ? "var(--b-800)" : "var(--n-300)"
    };background:${primary ? "var(--b-800)" : "var(--surface)"};color:${primary ? "#fff" : "var(--n-700)"}`;
    b.onclick = async () => {
      status.textContent = "Working…";
      try {
        let artifact: ExportArtifact;
        if (format === "docx") {
          const { buildDocx, docxToBase64 } = await import("./docx");
          artifact = {
            filename: `${slug(title)}.docx`,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            base64: docxToBase64(buildDocx(title, pageMode === "two" && twoBody ? twoBody : bodyHtml, style)),
          };
        } else if (format === "xlsx") {
          const { buildXlsx, xlsxToBase64 } = await import("./xlsx");
          artifact = {
            filename: `${slug(title)}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            base64: xlsxToBase64(buildXlsx(sheet ?? { rows: [] })),
          };
        } else {
          const cellPad = opts?.cellPad;
          // The TA journal keeps its header/footer (title, heading, profile
          // rows, signature lines) at the default size — only the table grows
          // with the chosen content size.
          const fixedHeader = type === "ta";
          let doc: jsPDF;
          if (pageMode === "fit") {
            doc = buildFitOnePagePdf(title, bodyHtml, chosenSize(), style, cellPad, fixedHeader);
          } else if (pageMode === "two" && twoBody) {
            // The two-page layout has no manual size — the largest size that
            // keeps the split on exactly two pages fills page 1 and applies
            // the same size to page 2.
            doc = buildFitTwoPagePdf(title, twoBody, style, cellPad, fixedHeader);
          } else {
            const size = chosenSize();
            doc = buildPdf(title, bodyHtml, size, { style, fixedHeader, ...(cellPad != null ? { cellPad } : {}) });
            persistContentFontSize(type, size);
          }
          artifact = {
            filename: `${slug(title)}.pdf`,
            mimeType: "application/pdf",
            base64: doc.output("datauristring").split(",")[1],
          };
        }
        await run(artifact);
        close();
      } catch (e) {
        status.textContent = String(e);
      }
    };
    return b;
  };

  box.appendChild(makeButton("📤  Share to other apps (WhatsApp, Telegram…)", true, share));
  box.appendChild(makeButton("⬇  Save file", false, save));
  box.appendChild(status);
  const c = document.createElement("button");
  c.textContent = "Cancel";
  c.style.cssText =
    "display:block;width:100%;padding:10px;border:none;background:none;color:var(--n-400);font-size:14px;cursor:pointer";
  c.onclick = close;
  box.appendChild(c);
  overlay.appendChild(box);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.body.appendChild(overlay);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** True when running inside the Capacitor Android shell. */
function isNative() {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

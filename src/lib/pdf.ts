import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CONTENT_FONT_MAX,
  CONTENT_FONT_MIN,
  DEFAULT_CONTENT_FONT_SIZE,
} from "@/lib/types";
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
 */
function parseTableBody(
  trs: Element[]
): (string | { content: string; rowSpan: number; colSpan?: number })[][] {
  const active = new Map<number, number>();
  const body: (string | { content: string; rowSpan: number; colSpan?: number })[][] = [];
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll("td"));
    const row: (string | { content: string; rowSpan: number; colSpan?: number })[] = [];
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
      // Cells marked class="vtext" render vertically, one character per line
      // (the TA journal's KMS note, which already carries per-word blank lines);
      // other cells are tidied normally.
      const isV = (el.getAttribute("class") || "").split(/\s+/).includes("vtext");
      const text = isV
        ? (el.textContent ?? "").replace(/ +/g, "\n")
        : tidy(el.textContent ?? "");
      row.push(
        rowSpan > 1 || colSpan > 1 ? { content: text, rowSpan, colSpan } : text
      );
      if (rowSpan > 1) active.set(col, rowSpan - 1);
      col += colSpan;
    }
    body.push(row);
  }
  return body;
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

/**
 * Render the HTML produced by the export builders into a real PDF.
 * We control the markup shape (h1 / h2 / h3 / p / table / ul>li), so a small
 * DOM walk is enough and avoids pulling in a heavyweight rasteriser.
 * `contentSize` is the numeric pt size of the body text (10–96); headings and
 * tables scale relative to it so the whole document stays proportional.
 */
function buildPdf(title: string, bodyHtml: string, contentSize: number): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const fs = contentSize / 9;
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = margin;

  const parsed = new DOMParser().parseFromString(`<div>${bodyHtml}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return doc;

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

    if (tag === "h1") {
      pageBreak(38 * fs);
      doc.setFont("helvetica", "bold").setFontSize(15 * fs).setTextColor(...NAVY);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      // Centered headings (e.g. the TA Journal header) are centred on the page.
      const centered = el.className.includes("centered");
      doc.text(lines, centered ? pageW / 2 : margin, y, centered ? { align: "center" } : undefined);
      y += lines.length * (18 * fs) + 4;
      doc.setDrawColor(...NAVY).setLineWidth(1.5).line(margin, y, pageW - margin, y);
      y += 14;
    } else if (tag === "h2") {
      pageBreak(30 * fs);
      doc.setFont("helvetica", "bold").setFontSize(11 * fs).setTextColor(...GREEN);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      const centered = el.className.includes("centered");
      doc.text(lines, centered ? pageW / 2 : margin, y, centered ? { align: "center" } : undefined);
      // A heading sits right above the table under it, leaving a small visible
      // gap (~4pt) between the glyphs and the table border; otherwise keep
      // normal line spacing for whatever follows (e.g. another heading, which
      // needs room for its ascenders).
      const size = 11 * fs;
      y += nextIsTable
        ? (lines.length - 1) * (1.15 * size) + 0.21 * size + 4
        : lines.length * (1.15 * size);
    } else if (tag === "h3") {
      pageBreak(24 * fs);
      doc.setFont("helvetica", "bold").setFontSize(9.5 * fs).setTextColor(...NAVY);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      doc.text(lines, margin, y);
      const size = 9.5 * fs;
      y += nextIsTable
        ? (lines.length - 1) * (1.15 * size) + 0.21 * size + 4
        : lines.length * (1.15 * size);
    } else if (tag === "p") {
      if (!text) continue;
      pageBreak(22 * fs);
      const meta = el.className.includes("meta") || el.className.includes("empty");
      doc.setFont("helvetica", meta ? "italic" : "normal").setFontSize(9 * fs);
      if (meta) doc.setTextColor(...GREY);
      else doc.setTextColor(15, 23, 42);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      doc.text(lines, margin, y);
      y += lines.length * (12 * fs) + 8;
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
      const rows = Array.from(el.querySelectorAll("tr"));
      if (!rows.length) continue;
      const headCells = Array.from(rows[0].querySelectorAll("th"));
      const hasHead = headCells.length > 0;
      // A fixed-width "date" column (cells marked class="date") keeps dates on
      // one line instead of wrapping in a proportionally-narrow column.
      const columnStyles: Record<
        number,
        { cellWidth?: number; halign?: "left" | "center" | "right"; valign?: "top" | "middle" | "bottom" }
      > = {};
      let dateCol: number | null = null;
      for (const r of rows) {
        const marked = r.querySelector("td.date, th.date");
        if (marked) {
          dateCol = Array.from(r.querySelectorAll("td, th")).indexOf(marked as Element);
          break;
        }
      }
      if (dateCol !== null) columnStyles[dateCol] = { cellWidth: 72 };
      // Explicit per-column widths via data-width on the header row; these let
      // a report pin narrow date/movement columns and hand the rest to a wide
      // "Work Done" column instead of letting autoTable squeeze it.
      // data-align="center" centres that column on both axes (used by the TA
      // journal for dates / timings / from / to / KMS).
      if (hasHead) {
        headCells.forEach((c, i) => {
          const w = c.getAttribute("data-width");
          const a = c.getAttribute("data-align");
          const entry: {
            cellWidth?: number;
            halign?: "left" | "center" | "right";
            valign?: "top" | "middle" | "bottom";
          } = { ...columnStyles[i] };
          if (w) entry.cellWidth = Number(w);
          if (a === "center") {
            entry.halign = "center";
            entry.valign = "middle";
          }
          columnStyles[i] = entry;
        });
      }
      const head = hasHead ? [headCells.map((c) => tidy(c.textContent ?? ""))] : undefined;
      const bodyRows = parseTableBody(hasHead ? rows.slice(1) : rows);
      autoTable(doc, {
        head,
        body: bodyRows,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8 * fs, cellPadding: 4, overflow: "linebreak", textColor: [15, 23, 42] },
        headStyles: { fillColor: [219, 234, 254], textColor: NAVY, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        theme: "grid",
        columnStyles: Object.keys(columnStyles).length ? columnStyles : undefined,
      });
      const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      // Generous gap after a table before the next heading/group — clearly
      // larger than the (zero-ish) gap between a heading and its own table.
      y = (last?.finalY ?? y + 40) + 24;
    }
  }

  // Footer on every page
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
  return doc;
}

/**
 * @param type export kind used to remember the last chosen text size per
 * export type (e.g. "monthly", "tomorrow", "diary", "ta", "pcdo",
 * "inspection").
 * @param sheet optional Excel grid — when provided the bottom sheet offers an
 * "Excel (.xlsx)" format alongside PDF and Word.
 */
export function exportDocument(title: string, bodyHtml: string, type = "general", sheet?: XlsxSheet) {
  // Bottom sheet that offers the report as PDF, Word (.docx) or Excel (.xlsx),
  // with a text size prompt for the PDF path. The last chosen format is remembered.
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center";
  const box = document.createElement("div");
  box.style.cssText =
    "background:#fff;width:100%;max-width:28rem;border-radius:16px 16px 0 0;padding:16px 16px 28px;font-family:system-ui,sans-serif";
  box.innerHTML =
    '<div style="width:40px;height:4px;background:#cbd5e1;border-radius:99px;margin:0 auto 14px"></div>' +
    '<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e3a8a;text-align:center">Export Report</p>';
  const status = document.createElement("p");
  status.style.cssText = "margin:0 0 10px;font-size:12px;color:#64748b;text-align:center;min-height:16px";
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
  const seg = document.createElement("div");
  seg.style.cssText = "display:flex;gap:8px;margin:0 0 14px";
  const segStyle = (active: boolean) =>
    `flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${
      active ? "#1e3a8a" : "#e2e8f0"
    };background:${active ? "#1e3a8a" : "#f8fafc"};color:${active ? "#fff" : "#334155"}`;
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
    row.style.display = f === "pdf" ? "flex" : "none";
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

  // Font size prompt — PDF written content only, 10–96.
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px";
  row.innerHTML =
    '<label style="flex:1;font-size:13px;font-weight:600;color:#334155">Text size<span style="display:block;font-weight:400;font-size:11px;color:#64748b;margin-top:2px">Written content only — 10 to 96</span></label>';
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(CONTENT_FONT_MIN);
  input.max = String(CONTENT_FONT_MAX);
  input.value = String(contentFontSizeSetting(type));
  input.style.cssText =
    "width:76px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;text-align:center;font-weight:600;color:#1e3a8a";
  row.appendChild(input);
  row.style.display = format === "pdf" ? "flex" : "none";
  box.appendChild(row);

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
      primary ? "#1e40af" : "#cbd5e1"
    };background:${primary ? "#1e40af" : "#fff"};color:${primary ? "#fff" : "#334155"}`;
    b.onclick = async () => {
      status.textContent = "Working…";
      try {
        let artifact: ExportArtifact;
        if (format === "docx") {
          const { buildDocx, docxToBase64 } = await import("./docx");
          artifact = {
            filename: `${slug(title)}.docx`,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            base64: docxToBase64(buildDocx(title, bodyHtml)),
          };
        } else if (format === "xlsx") {
          const { buildXlsx, xlsxToBase64 } = await import("./xlsx");
          artifact = {
            filename: `${slug(title)}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            base64: xlsxToBase64(buildXlsx(sheet ?? { rows: [] })),
          };
        } else {
          const size = chosenSize();
          const doc = buildPdf(title, bodyHtml, size);
          persistContentFontSize(type, size);
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
    "display:block;width:100%;padding:10px;border:none;background:none;color:#94a3b8;font-size:14px;cursor:pointer";
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

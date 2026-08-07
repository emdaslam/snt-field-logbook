import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CONTENT_FONT_MAX,
  CONTENT_FONT_MIN,
  DEFAULT_CONTENT_FONT_SIZE,
} from "@/lib/types";

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
      doc.text(lines, margin, y);
      y += lines.length * (18 * fs) + 4;
      doc.setDrawColor(...NAVY).setLineWidth(1.5).line(margin, y, pageW - margin, y);
      y += 14;
    } else if (tag === "h2") {
      pageBreak(30 * fs);
      doc.setFont("helvetica", "bold").setFontSize(11 * fs).setTextColor(...GREEN);
      const lines = doc.splitTextToSize(text, maxW) as string[];
      doc.text(lines, margin, y);
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
      const columnStyles: Record<number, { cellWidth: number }> = {};
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
      if (hasHead) {
        headCells.forEach((c, i) => {
          const w = c.getAttribute("data-width");
          if (w) columnStyles[i] = { cellWidth: Number(w) };
        });
      }
      const head = hasHead ? [headCells.map((c) => tidy(c.textContent ?? ""))] : undefined;
      const bodyRows = (hasHead ? rows.slice(1) : rows).map((r) =>
        Array.from(r.querySelectorAll("td")).map((c) => tidy(c.textContent ?? ""))
      );
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
 * export type (e.g. "monthly", "tomorrow", "diary", "pcdo", "inspection").
 */
export function exportHtmlAsPdf(title: string, bodyHtml: string, type = "general") {
  // Ask for the text size at the top of every export sheet. It defaults to the
  // last size used for this export type; changing it here is remembered for
  // the next export of the same type.
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.5);display:flex;align-items:flex-end;justify-content:center";
  const box = document.createElement("div");
  box.style.cssText =
    "background:#fff;width:100%;max-width:28rem;border-radius:16px 16px 0 0;padding:16px 16px 28px;font-family:system-ui,sans-serif";
  box.innerHTML =
    '<div style="width:40px;height:4px;background:#cbd5e1;border-radius:99px;margin:0 auto 14px"></div>' +
    '<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e3a8a;text-align:center">Export PDF</p>';
  const status = document.createElement("p");
  status.style.cssText = "margin:0 0 10px;font-size:12px;color:#64748b;text-align:center;min-height:16px";
  const close = () => overlay.remove();

  // Font size prompt — written content only, 10–96.
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
  box.appendChild(row);

  const chosenSize = () => {
    const v = Math.round(Number(input.value));
    if (!Number.isFinite(v)) return contentFontSizeSetting(type);
    return Math.min(CONTENT_FONT_MAX, Math.max(CONTENT_FONT_MIN, v));
  };

  const makeButton = (
    label: string,
    primary: boolean,
    run: (doc: jsPDF, filename: string) => Promise<void>
  ) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `display:block;width:100%;margin-bottom:8px;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${
      primary ? "#1e40af" : "#cbd5e1"
    };background:${primary ? "#1e40af" : "#fff"};color:${primary ? "#fff" : "#334155"}`;
    b.onclick = async () => {
      status.textContent = "Working…";
      try {
        const size = chosenSize();
        const doc = buildPdf(title, bodyHtml, size);
        persistContentFontSize(type, size);
        const filename = `${slug(title)}.pdf`;
        await run(doc, filename);
        close();
      } catch (e) {
        status.textContent = String(e);
      }
    };
    return b;
  };

  const share = async (doc: jsPDF, filename: string) => {
    if (isNative()) {
      await nativeSharePdf(doc, filename, title);
      return;
    }
    // Browser fallback
    const blob = doc.output("blob");
    const file = new File([blob], filename, { type: "application/pdf" });
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

  const save = async (doc: jsPDF, filename: string) => {
    if (isNative()) {
      try {
        await nativeSavePdf(doc, filename);
      } catch (e) {
        const { isSaveCancelled } = await import("./documentSave");
        if (isSaveCancelled(e)) return; // user backed out — close quietly
        throw e;
      }
      return;
    }
    try {
      doc.save(filename);
    } catch {
      throw new Error("Saving was blocked by the browser.");
    }
  };

  box.appendChild(
    makeButton("📤  Share to other apps (WhatsApp, Telegram…)", true, share)
  );
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

/** True when running inside the Capacitor Android shell. */
function isNative() {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Hand a PDF to Android's share sheet. The file is written to the app's
 * private cache (always writable) and shared from there — the receiving app
 * (WhatsApp, Telegram, Drive…) stores it. Runs entirely on-device.
 */
async function nativeSharePdf(doc: jsPDF, filename: string, title: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const base64 = doc.output("datauristring").split(",")[1];
  const written = await Filesystem.writeFile({
    path: `pdf/${filename}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({
    title,
    text: title,
    url: written.uri,
    dialogTitle: "Share PDF",
  });
}

/**
 * Save a PDF to a user-chosen location through Android's system "Save to…"
 * picker (Storage Access Framework). Direct writes to /Documents are blocked
 * by scoped storage on Android 10+, so the picker grants access to the file.
 */
async function nativeSavePdf(doc: jsPDF, filename: string) {
  const { saveViaPicker } = await import("./documentSave");
  const base64 = doc.output("datauristring").split(",")[1];
  await saveViaPicker({ filename, data: base64, mimeType: "application/pdf" });
}

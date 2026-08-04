import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FONT_SIZE_SCALE } from "@/lib/types";
import type { FontSize } from "@/lib/types";

const NAVY: [number, number, number] = [30, 58, 138];
const GREEN: [number, number, number] = [5, 95, 70];
const GREY: [number, number, number] = [100, 116, 139];

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

/** Active app font size, persisted by DataProvider under `snt.fontSize`. */
function activeFontSize(): FontSize {
  try {
    const v = localStorage.getItem("snt.fontSize");
    if (v === "small" || v === "medium" || v === "large") return v;
  } catch {
    /* ignore */
  }
  return "medium";
}

/**
 * Render the HTML produced by the export builders into a real PDF.
 * We control the markup shape (h1 / h2 / p / table / ul>li), so a small
 * DOM walk is enough and avoids pulling in a heavyweight rasteriser.
 */
function buildPdf(title: string, bodyHtml: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const fs = FONT_SIZE_SCALE[activeFontSize()];
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

  for (const el of Array.from(root.children)) {
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
      y += lines.length * (14 * fs) + 6;
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
      y += 6;
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
      y = (last?.finalY ?? y + 40) + 16;
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

function sheet(opts: { label: string; primary?: boolean; run: () => void | Promise<void> }[]) {
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

  for (const o of opts) {
    const b = document.createElement("button");
    b.textContent = o.label;
    b.style.cssText = `display:block;width:100%;margin-bottom:8px;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${
      o.primary ? "#1e40af" : "#cbd5e1"
    };background:${o.primary ? "#1e40af" : "#fff"};color:${o.primary ? "#fff" : "#334155"}`;
    b.onclick = async () => {
      status.textContent = "Working…";
      try {
        await o.run();
        close();
      } catch (e) {
        status.textContent = String(e);
      }
    };
    box.appendChild(b);
  }
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
 * Write the PDF into the device's Documents folder and hand it to Android's
 * share sheet. Runs entirely on-device — no server, no network.
 */
async function nativeSaveAndShare(doc: jsPDF, filename: string, title: string, share: boolean) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const base64 = doc.output("datauristring").split(",")[1];

  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });

  if (!share) {
    alert(`Saved to Documents/${filename}`);
    return;
  }
  await Share.share({
    title,
    text: title,
    url: written.uri,
    dialogTitle: "Share PDF",
  });
}

export function exportHtmlAsPdf(title: string, bodyHtml: string) {
  let doc: jsPDF;
  try {
    doc = buildPdf(title, bodyHtml);
  } catch (e) {
    alert("Could not build the PDF: " + String(e));
    return;
  }
  const filename = `${slug(title)}.pdf`;

  const share = async () => {
    if (isNative()) {
      await nativeSaveAndShare(doc, filename, title, true);
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

  const save = async () => {
    if (isNative()) {
      await nativeSaveAndShare(doc, filename, title, false);
      return;
    }
    try {
      doc.save(filename);
    } catch {
      throw new Error("Saving was blocked by the browser.");
    }
  };

  sheet([
    { label: "📤  Share to other apps (WhatsApp, Telegram…)", primary: true, run: share },
    { label: "⬇  Save file", run: save },
  ]);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// The legacy build runs inside Node too (SSR / static prerendering) without
// needing browser globals like DOMMatrix. The worker ships in public/ (copied
// from pdfjs-dist/legacy/build) so the offline app never needs a CDN.
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

/**
 * Render a PDF (as a data URL) into canvases inside the app itself. The Android
 * WebView cannot show PDFs in an iframe, so we draw every page with pdf.js —
 * this works identically in the web preview and in the APK.
 */
export function PdfViewer({ dataUrl, name }: { dataUrl: string; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading PDF…");

  // Decode the data URL outside the effect so a malformed file can render an
  // error without setting state synchronously inside the effect body.
  const bytes = useMemo(() => {
    try {
      const b64 = dataUrl.split(",")[1] ?? "";
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }, [dataUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = "";
    if (bytes) {
      (async () => {
        try {
          const doc = await getDocument({ data: bytes }).promise;
          if (cancelled) return;
          const scale = 1.5;
          for (let p = 1; p <= doc.numPages; p++) {
            if (cancelled) return;
            const page = await doc.getPage(p);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            canvas.style.width = "100%";
            canvas.style.height = "auto";
            canvas.style.backgroundColor = "#fff";
            await page.render({ canvas, viewport }).promise;
            if (cancelled) return;
            el.appendChild(canvas);
          }
          setStatus("");
        } catch (e) {
          if (!cancelled) setStatus("Could not render this PDF: " + String(e));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [bytes, dataUrl]);

  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-200 p-1">
      <div ref={containerRef} className="space-y-1" />
      {bytes === null ? (
        <p className="p-4 text-center text-sm text-slate-500">Could not read this file.</p>
      ) : (
        status && <p className="p-4 text-center text-sm text-slate-500">{status}</p>
      )}
      <p className="px-2 pb-1 pt-2 text-center text-[10px] text-slate-400">{name}</p>
    </div>
  );
}

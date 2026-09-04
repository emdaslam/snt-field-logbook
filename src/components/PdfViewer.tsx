"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// The legacy build runs inside Node too (SSR / static prerendering) without
// needing browser globals like DOMMatrix. The worker ships in public/ (copied
// from pdfjs-dist/legacy/build) so the offline app never needs a CDN.
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * Render a PDF (as a data URL) into canvases inside the app itself. The Android
 * WebView cannot show PDFs in an iframe, so we draw every page with pdf.js —
 * this works identically in the web preview and in the APK. Pages are zoomable
 * by pinch, double-tap or the -/+ controls (mouse wheel + double-click in the
 * web preview); at 100% the document is width-fitted.
 */
export function PdfViewer({ dataUrl, name }: { dataUrl: string; name: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading PDF...");
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  // Scroll anchor to apply once the new zoom has committed to the layout, so
  // the point under the fingers / cursor stays put while zooming.
  const pendingScroll = useRef<{ u: number; v: number; px: number; py: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const p = pendingScroll.current;
    if (!el || !p) return;
    pendingScroll.current = null;
    el.scrollLeft = p.u * zoom - p.px;
    el.scrollTop = p.v * zoom - p.py;
  }, [zoom]);

  /** Zoom to `z`, anchoring the page point under (cx, cy) (or centre). */
  const setZoomAt = useCallback((z: number, cx?: number, cy?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const z0 = zoomRef.current;
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    if (z === z0) return;
    const r = el.getBoundingClientRect();
    const px = cx != null ? cx - r.left : r.width / 2;
    const py = cy != null ? cy - r.top : r.height / 2;
    pendingScroll.current = { u: (el.scrollLeft + px) / z0, v: (el.scrollTop + py) / z0, px, py };
    setZoom(z);
  }, []);

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

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{
    pinch: { d0: number; z0: number; u: number; v: number } | null;
    pan: { px0: number; py0: number; sl0: number; st0: number; moved: boolean } | null;
    lastTap: { t: number; x: number; y: number } | null;
  }>({ pinch: null, pan: null, lastTap: null });

  const pointOf = (e: { clientX: number; clientY: number }) => {
    const el = scrollRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, pointOf(e));
    const g = gest.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const z0 = zoomRef.current;
      const px = (a.x + b.x) / 2;
      const py = (a.y + b.y) / 2;
      g.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0, u: (el.scrollLeft + px) / z0, v: (el.scrollTop + py) / z0 };
      g.pan = null;
    } else if (pointers.current.size === 1) {
      g.pan = { px0: e.clientX, py0: e.clientY, sl0: el.scrollLeft, st0: el.scrollTop, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, pointOf(e));
    const g = gest.current;
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.pinch.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.d0)));
      if (z !== zoomRef.current) {
        pendingScroll.current = { u: g.pinch.u, v: g.pinch.v, px: (a.x + b.x) / 2, py: (a.y + b.y) / 2 };
        setZoom(z);
      }
    } else if (g.pan && pointers.current.size === 1) {
      const dx = e.clientX - g.pan.px0;
      const dy = e.clientY - g.pan.py0;
      if (!g.pan.moved && Math.hypot(dx, dy) > 6) g.pan.moved = true;
      if (g.pan.moved) {
        el.scrollLeft = g.pan.sl0 - dx;
        el.scrollTop = g.pan.st0 - dy;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinch = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    const g = gest.current;
    if (pointers.current.size < 2) g.pinch = null;
    if (g.pan && !wasPinch && !g.pan.moved && e.pointerType === "touch") {
      const p = pointOf(e);
      const now = Date.now();
      const lt = g.lastTap;
      if (lt && now - lt.t < 300 && Math.hypot(p.x - lt.x, p.y - lt.y) < 40) {
        g.lastTap = null;
        setZoomAt(zoomRef.current > 1 ? MIN_ZOOM : 2, e.clientX, e.clientY);
      } else {
        g.lastTap = { t: now, x: p.x, y: p.y };
      }
    }
    if (pointers.current.size === 0) g.pan = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    setZoomAt(zoomRef.current > 1 ? MIN_ZOOM : 2, e.clientX, e.clientY);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoomAt(zoomRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoomAt]);

  const step = (d: number) => setZoomAt(zoomRef.current + d);

  return (
    <div
      ref={scrollRef}
      className="relative max-h-[70vh] select-none overflow-auto rounded-lg border border-slate-200 bg-slate-200"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div className="sticky top-0 z-10 flex items-center justify-end gap-1 bg-slate-100/95 px-1.5 pb-1 pt-1.5 backdrop-blur">
        <button
          onClick={() => step(-0.5)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-surface text-sm font-bold text-slate-600 active:bg-slate-200"
          aria-label="Zoom out"
        >
          -
        </button>
        <span className="min-w-11 text-center text-[11px] font-semibold tabular-nums text-slate-500">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => step(0.5)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-surface text-sm font-bold text-slate-600 active:bg-slate-200"
          aria-label="Zoom in"
        >
          +
        </button>
        {zoom > MIN_ZOOM && (
          <button
            onClick={() => setZoomAt(MIN_ZOOM)}
            className="rounded-md border border-slate-300 bg-surface px-2 py-1 text-[11px] font-semibold text-slate-600 active:bg-slate-200"
          >
            Fit
          </button>
        )}
      </div>
      <div className="p-1" style={{ width: `${zoom * 100}%` }}>
        <div ref={containerRef} className="space-y-1" />
      </div>
      {bytes === null ? (
        <p className="p-4 text-center text-sm text-slate-500">Could not read this file.</p>
      ) : (
        status && <p className="p-4 text-center text-sm text-slate-500">{status}</p>
      )}
      <p className="px-2 pb-1 pt-2 text-center text-[10px] text-slate-400">{name}</p>
    </div>
  );
}

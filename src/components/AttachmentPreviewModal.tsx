"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { PdfViewer } from "./PdfViewer";
import { shareAttachmentNative, openAttachmentNative } from "@/lib/native";
import type { Attachment } from "@/db/schema";

function blobUrlFromDataUrl(dataUrl: string): string {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** Web-preview fallback for "Open with": hand the file to the browser. */
function openAttachmentWeb(name: string, dataUrl: string): boolean {
  try {
    const url = blobUrlFromDataUrl(dataUrl);
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

const MAX_ZOOM = 6;

/**
 * Moves a vertical drag onto the scrollable ancestor (the modal card). The
 * zoom stage blocks native touch scrolling while it owns the gesture, so at
 * 100% a drag that the stage can't consume is forwarded upwards, exactly like
 * native multi-level scrolling.
 */
function passScrollDelta(node: HTMLElement | null, dy: number) {
  let n = node;
  let rest = dy;
  while (n && Math.abs(rest) > 0.5) {
    const sc = n.scrollHeight - n.clientHeight;
    if (
      sc > 0 &&
      /(auto|scroll)/.test(getComputedStyle(n).overflowY) &&
      (rest > 0 ? n.scrollTop > 0 : n.scrollTop < sc)
    ) {
      const before = n.scrollTop;
      n.scrollTop = Math.max(0, Math.min(sc, before - rest));
      rest = rest - (before - n.scrollTop);
    }
    n = n.parentElement;
  }
}

/**
 * Clamps the translate of a scaled image so its zoomed box stays anchored
 * inside the stage (centre-locked while smaller than the stage).
 */
function clampAxis(viewLen: number, offset: number, s: number, itemLen: number, v: number): number {
  const len = itemLen * s;
  if (len >= viewLen) return Math.min(-offset, Math.max(v, viewLen - offset - len));
  return (viewLen - len) / 2 - offset;
}

/**
 * Image preview with pinch / double-tap / drag zoom (plus mouse wheel and
 * double-click in the web preview). One-finger drags only pan once zoomed in;
 * at 100% the picture shows exactly as before.
 */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{
    pinch: { d0: number; s0: number; lx: number; ly: number } | null;
    pan: { cx0: number; cy0: number; tx: number; ty: number; lastY: number; moved: boolean } | null;
    lastTap: { t: number; x: number; y: number } | null;
  }>({ pinch: null, pan: null, lastTap: null });

  const pointOf = (e: { clientX: number; clientY: number }) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const apply = useCallback((s: number, x: number, y: number) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return { s: 1, x: 0, y: 0 };
    s = Math.min(MAX_ZOOM, Math.max(1, s));
    if (s === 1) return { s: 1, x: 0, y: 0 };
    return {
      s,
      x: clampAxis(stage.clientWidth, img.offsetLeft, s, img.offsetWidth, x),
      y: clampAxis(stage.clientHeight, img.offsetTop, s, img.offsetHeight, y),
    };
  }, []);

  const reset = useCallback(() => setView({ s: 1, x: 0, y: 0 }), []);

  /** Zoom to `s`, keeping the stage point (px, py) fixed under the cursor. */
  const zoomAt = useCallback(
    (s: number, px: number, py: number) => {
      const img = imgRef.current;
      if (!img) return;
      s = Math.min(MAX_ZOOM, Math.max(1, s));
      if (s === 1) {
        reset();
        return;
      }
      const v = viewRef.current;
      const lx = (px - img.offsetLeft - v.x) / v.s;
      const ly = (py - img.offsetTop - v.y) / v.s;
      setView(apply(s, px - img.offsetLeft - lx * s, py - img.offsetTop - ly * s));
    },
    [apply, reset]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(viewRef.current.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX - r.left, e.clientY - r.top);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, pointOf(e));
    const g = gest.current;
    const v = viewRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const img = imgRef.current!;
      g.pinch = {
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        s0: v.s,
        lx: ((a.x + b.x) / 2 - img.offsetLeft - v.x) / v.s,
        ly: ((a.y + b.y) / 2 - img.offsetTop - v.y) / v.s,
      };
      g.pan = null;
    } else if (pointers.current.size === 1) {
      g.pan = { cx0: e.clientX, cy0: e.clientY, tx: v.x, ty: v.y, lastY: e.clientY, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const img = imgRef.current;
    if (!img) return;
    pointers.current.set(e.pointerId, pointOf(e));
    const g = gest.current;
    const v = viewRef.current;
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const s = Math.min(MAX_ZOOM, Math.max(1, g.pinch.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.d0)));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      setView(apply(s, mx - img.offsetLeft - g.pinch.lx * s, my - img.offsetTop - g.pinch.ly * s));
    } else if (g.pan && pointers.current.size === 1) {
      const dx = e.clientX - g.pan.cx0;
      const dy = e.clientY - g.pan.cy0;
      if (!g.pan.moved && Math.hypot(dx, dy) > 8) g.pan.moved = true;
      if (!g.pan.moved) {
        g.pan.lastY = e.clientY;
        return;
      }
      if (v.s > 1) {
        setView(apply(v.s, g.pan.tx + dx, g.pan.ty + dy));
      } else {
        // Not zoomed: forward the vertical drag to the modal card so the
        // buttons below the picture stay reachable (the stage blocks native
        // touch scrolling while it owns the gesture).
        passScrollDelta(stageRef.current, e.clientY - g.pan.lastY);
      }
      g.pan.lastY = e.clientY;
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
        zoomAt(viewRef.current.s > 1 ? 1 : 2.5, p.x, p.y);
      } else {
        g.lastTap = { t: now, x: p.x, y: p.y };
      }
    }
    if (pointers.current.size === 0) g.pan = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = pointOf(e);
    zoomAt(viewRef.current.s > 1 ? 1 : 2.5, p.x, p.y);
  };

  return (
    <div
      ref={stageRef}
      className={`relative h-[70vh] w-full touch-none select-none overflow-hidden rounded-lg ${
        view.s > 1 ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full rounded-lg"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      />
      {view.s > 1 ? (
        <button
          onClick={reset}
          className="absolute right-2 top-2 z-10 rounded-full bg-slate-900/75 px-3 py-1 text-[11px] font-semibold text-white"
        >
          {Math.round(view.s * 100)}% · Reset
        </button>
      ) : (
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/60 px-3 py-1 text-[10px] text-white">
          Double-tap or pinch to zoom
        </p>
      )}
    </div>
  );
}

/**
 * Shared attachment preview: images and PDFs open inside the app (both
 * zoomable), plus "Open with another app" (Android ACTION_VIEW) and "Share"
 * actions.
 */
export function AttachmentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState("");

  return (
    <Modal open={Boolean(attachment)} onClose={onClose} title={attachment?.name ?? "Attachment"} wide>
      {attachment?.type.startsWith("image/") ? (
        <ZoomableImage key={attachment.dataUrl} src={attachment.dataUrl} alt={attachment.name} />
      ) : attachment?.type === "application/pdf" ? (
        <PdfViewer key={attachment.dataUrl} dataUrl={attachment.dataUrl} name={attachment.name} />
      ) : attachment ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-sm text-slate-600">This file type cannot be previewed here.</p>
        </div>
      ) : null}

      {attachment && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy("open");
              const ok = await openAttachmentNative(attachment.name, attachment.dataUrl);
              if (!ok && !openAttachmentWeb(attachment.name, attachment.dataUrl)) {
                alert("Couldn't open this file on this device.");
              }
              setBusy("");
            }}
            className="rounded-lg border border-blue-800 px-4 py-2 text-sm font-semibold text-blue-800"
          >
            Open with another app
          </button>
          <button
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy("share");
              const ok = await shareAttachmentNative(attachment.name, attachment.dataUrl);
              if (!ok) alert("Sharing isn't available on this device.");
              setBusy("");
            }}
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Share
          </button>
        </div>
      )}
    </Modal>
  );
}

"use client";

import { type ReactNode, useEffect } from "react";

export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let idx = tl.indexOf(ql);
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={idx} className="rounded-sm bg-amber-200 px-0.5 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
    idx = tl.indexOf(ql, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

export function Chip({
  label,
  color = "#2563eb",
  onClick,
  active,
}: {
  label: string;
  color?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
        onClick ? "cursor-pointer" : ""
      }`}
      style={{
        backgroundColor: active === false ? "#f1f5f9" : color + "22",
        color: active === false ? "#64748b" : color,
        border: `1px solid ${active === false ? "#e2e8f0" : color + "55"}`,
      }}
    >
      {label}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className={`w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92vh] overflow-y-auto rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-surface px-5 py-3.5">
          <h3 className="text-base font-semibold text-blue-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  as = "label",
}: {
  label: string;
  children: ReactNode;
  /** A `<label>` forwards any click in its blank area to its first form control.
   *  For a section that wraps several controls (e.g. the export-rows editor,
   *  whose first control is a leg's "Remove" button) use `as="div"` so stray
   *  clicks can't be re-targeted onto one of them. */
  as?: "label" | "div";
}) {
  const cls = "mb-3 block";
  const heading = <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>;
  return as === "div" ? (
    <div className={cls}>
      {heading}
      {children}
    </div>
  ) : (
    <label className={cls}>
      {heading}
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

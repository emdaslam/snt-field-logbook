"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { fmtDate } from "@/lib/api";
import type { Attachment } from "@/db/schema";

type Item = { logDate: string; station: string; attachment: Attachment };
type Kind = "all" | "image" | "pdf" | "other";

function kindOf(a: Attachment): Exclude<Kind, "all"> {
  if (a.type.startsWith("image/")) return "image";
  if (a.type === "application/pdf" || a.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "other";
}

function FileGlyph({ kind }: { kind: Kind }) {
  if (kind === "pdf") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    );
  }
  if (kind === "image") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10.5" r="1.5" />
        <path d="M21 16l-5-5-4 4-2-2-5 5" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

const KIND_COLOR: Record<Kind, string> = {
  all: "#334155",
  image: "#0d9488",
  pdf: "#dc2626",
  other: "#7c3aed",
};

const KIND_LABEL: Record<Exclude<Kind, "all">, string> = {
  image: "Photo",
  pdf: "PDF",
  other: "File",
};

/**
 * Hamburger "Attachments" tab — every photo / PDF across all log entries,
 * newest first, each with a thumbnail that opens the shared preview modal.
 */
export function AttachmentsView({ onSelect }: { onSelect: (a: Attachment | null) => void }) {
  const { logs } = useData();
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const l of logs) {
      if (!l.attachments?.length) continue;
      const station = l.stationMovement || "Daily Log";
      for (const attachment of l.attachments) out.push({ logDate: l.logDate, station, attachment });
    }
    return out.sort((a, b) => b.logDate.localeCompare(a.logDate));
  }, [logs]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((it) => {
      if (kind !== "all" && kindOf(it.attachment) !== kind) return false;
      if (!ql) return true;
      return `${it.attachment.name} ${it.station}`.toLowerCase().includes(ql);
    });
  }, [items, kind, q]);

  const counts = useMemo(() => {
    let image = 0, pdf = 0, other = 0;
    for (const it of items) {
      const k = kindOf(it.attachment);
      if (k === "image") image++;
      else if (k === "pdf") pdf++;
      else other++;
    }
    return { all: items.length, image, pdf, other };
  }, [items]);

  const chips: { id: Kind; label: string }[] = [
    { id: "all", label: `All ${counts.all}` },
    { id: "image", label: `Photos ${counts.image}` },
    { id: "pdf", label: `PDFs ${counts.pdf}` },
    ...(counts.other ? [{ id: "other" as const, label: `Other ${counts.other}` }] : []),
  ];

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 space-y-2 bg-slate-100/95 p-3 backdrop-blur">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search photos and PDFs…"
          className="w-full rounded-2xl border border-slate-200 bg-surface px-4 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setKind(c.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition active:scale-95 ${
                kind === c.id
                  ? "text-white shadow-sm"
                  : "bg-surface text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              }`}
              style={kind === c.id ? { backgroundColor: KIND_COLOR[c.id] } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 p-3">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-surface p-8 text-center text-sm text-slate-400">
            {items.length === 0
              ? "No attachments yet — add photos or PDFs to a daily log."
              : "Nothing matches those filters."}
          </p>
        ) : (
          filtered.map((it, i) => {
            const k = kindOf(it.attachment);
            const accent = KIND_COLOR[k];
            return (
              <button
                key={`${it.logDate}-${it.attachment.name}-${i}`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                onClick={() => onSelect(it.attachment)}
                className="card-rise group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow active:scale-[0.99]"
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} aria-hidden />
                <span className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-slate-200">
                  {k === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.attachment.dataUrl}
                      alt={it.attachment.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center"
                      style={{ backgroundColor: accent + "1a", color: accent }}
                    >
                      <FileGlyph kind={k} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 pl-0.5">
                  <span className="block truncate text-sm font-semibold tracking-tight text-slate-800">
                    {it.attachment.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <span
                      className="rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: accent + "1f", color: accent }}
                    >
                      {KIND_LABEL[k]}
                    </span>
                    <span className="truncate">
                      {fmtDate(it.logDate)} · {it.station}
                    </span>
                  </span>
                </span>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-slate-300 transition group-hover:bg-slate-50 group-hover:text-slate-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

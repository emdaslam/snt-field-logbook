"use client";

import { useMemo } from "react";
import { useData } from "./DataProvider";
import { fmtDate } from "@/lib/api";
import type { Attachment } from "@/db/schema";

type Item = { logDate: string; station: string; attachment: Attachment };

/**
 * Hamburger "Attachments" tab — every photo / PDF across all log entries,
 * newest first, each with a thumbnail that opens the shared preview modal.
 */
export function AttachmentsView({ onSelect }: { onSelect: (a: Attachment | null) => void }) {
  const { logs } = useData();

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const l of logs) {
      if (!l.attachments?.length) continue;
      const station = l.stationMovement || "Daily Log";
      for (const attachment of l.attachments) out.push({ logDate: l.logDate, station, attachment });
    }
    return out.sort((a, b) => b.logDate.localeCompare(a.logDate));
  }, [logs]);

  return (
    <div className="pb-24">
      <div className="border-b border-slate-200 bg-blue-50 px-3 py-2">
        <p className="text-xs text-slate-600">
          <strong>{items.length}</strong> attachment{items.length !== 1 ? "s" : ""} across all entries
        </p>
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">
          No attachments yet — add photos or PDFs to a daily log.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 bg-surface">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => onSelect(it.attachment)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <span className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200">
                {it.attachment.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.attachment.dataUrl}
                    alt={it.attachment.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-red-50 text-[10px] font-bold text-red-600">
                    PDF
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {it.attachment.name}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {fmtDate(it.logDate)} · {it.station}
                </span>
              </span>
              <span className="flex-shrink-0 text-slate-300">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

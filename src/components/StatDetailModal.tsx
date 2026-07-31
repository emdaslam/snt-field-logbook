"use client";

import { Modal } from "./ui";
import { fmtDate } from "@/lib/api";

export type StatRow = {
  key: string;
  date: string;
  title: string;
  sub?: string;
  badge?: string;
};

export function StatDetailModal({
  open,
  onClose,
  title,
  rows,
  emptyText = "No entries in this period.",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  rows: StatRow[];
  emptyText?: string;
  footer?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <p className="mb-3 text-sm text-slate-500">
        {rows.length} entr{rows.length === 1 ? "y" : "ies"}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {[...rows]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((r) => (
              <li key={r.key} className="flex items-start gap-3 px-3 py-2.5">
                <span className="w-24 flex-shrink-0 text-xs font-medium text-blue-800">
                  {fmtDate(r.date)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{r.title}</p>
                  {r.sub && <p className="text-xs text-slate-500">{r.sub}</p>}
                </div>
                {r.badge && (
                  <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {r.badge}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}

      {footer && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">{footer}</p>
      )}
    </Modal>
  );
}

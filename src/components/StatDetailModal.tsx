"use client";

import { Modal } from "./ui";
import { fmtDate } from "@/lib/api";

export type StatRow = {
  key: string;
  date: string;
  title: string;
  sub?: string;
  badge?: string;
  logId?: number;
  defId?: number;
  planId?: number;
};

function rowOpens(r: StatRow) {
  return r.logId != null || r.defId != null || r.planId != null;
}

export function StatDetailModal({
  open,
  onClose,
  title,
  rows,
  emptyText = "No entries in this period.",
  footer,
  onOpenRow,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  rows: StatRow[];
  emptyText?: string;
  footer?: string;
  onOpenRow?: (row: StatRow) => void;
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
            .map((r) => {
              const clickable = Boolean(onOpenRow && rowOpens(r));
              const body = (
                <>
                  <span className="w-24 flex-shrink-0 text-xs font-medium text-blue-800">
                    {fmtDate(r.date)}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm text-slate-800">{r.title}</p>
                    {r.sub && <p className="text-xs text-slate-500">{r.sub}</p>}
                  </div>
                  {r.badge && (
                    <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {r.badge}
                    </span>
                  )}
                </>
              );
              return (
                <li key={r.key}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => onOpenRow!(r)}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 active:bg-slate-100"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 px-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {footer && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">{footer}</p>
      )}
    </Modal>
  );
}

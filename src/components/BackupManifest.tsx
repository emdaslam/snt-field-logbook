"use client";

import { BACKUP_TABLES, type BackupSummary } from "@/lib/backup";

export function BackupManifest({
  summary,
  title = "This backup contains",
}: {
  summary: BackupSummary;
  title?: string;
}) {
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {BACKUP_TABLES.map((t) => (
          <div key={t.key} className="flex items-baseline justify-between text-sm">
            <span className="text-slate-600">{t.label}</span>
            <span
              className={`font-semibold tabular-nums ${
                summary.counts[t.key] > 0 ? "text-emerald-700" : "text-slate-300"
              }`}
            >
              {summary.counts[t.key]}
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-600">Photos / Files</span>
          <span
            className={`font-semibold tabular-nums ${
              summary.attachments > 0 ? "text-emerald-700" : "text-slate-300"
            }`}
          >
            {summary.attachments}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-2 text-sm">
        <span className="font-medium text-slate-700">Total records</span>
        <span className="font-bold tabular-nums text-blue-900">{summary.totalRecords}</span>
      </div>
    </div>
  );
}

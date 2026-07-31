"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton } from "./ui";
import { exportDiary } from "./exports";
import { PeriodPicker, monthPeriod, type Period } from "./PeriodPicker";
import { fmtDate } from "@/lib/api";
import { isSharedLog } from "@/lib/backup";

export function DiaryExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, currentUser } = useData();
  const [period, setPeriod] = useState<Period>(() => monthPeriod(0));
  const [custom, setCustom] = useState(false);

  const hqName =
    stations.find((s) => s.id === currentUser?.headquartersStationId)?.name ?? null;

  // Only own entries belong in a personal diary
  const rows = logs
    .filter((l) => !isSharedLog(l) && l.logDate >= period.from && l.logDate <= period.to)
    .sort((a, b) => a.logDate.localeCompare(b.logDate));

  const tally = rows.reduce(
    (a, r) => {
      const p = r.taPercent || 100;
      if (p === 100) a.p100++;
      else if (p === 70) a.p70++;
      else if (p === 30) a.p30++;
      return a;
    },
    { p100: 0, p70: 0, p30: 0 }
  );
  const totalDays = tally.p100 + tally.p70 * 0.7 + tally.p30 * 0.3;

  return (
    <Modal open={open} onClose={onClose} title="Export Diary" wide>
      <div className="mb-3">
        <PeriodPicker period={period} onChange={setPeriod} custom={custom} setCustom={setCustom} />
      </div>

      {!hqName && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No headquarters station set on your profile. Set it in <strong>Settings → My Profile</strong> so
          the “from” column is filled in.
        </div>
      )}

      <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {fmtDate(period.from)} — {fmtDate(period.to)} · {rows.length} entr
        {rows.length === 1 ? "y" : "ies"} · Headquarters: <strong>{hqName ?? "not set"}</strong>
      </div>

      <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">No diary entries in this period.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-1.5">Date</th>
                <th className="px-2 py-1.5">Movement</th>
                <th className="px-2 py-1.5">TA</th>
                <th className="px-2 py-1.5">Work Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(r.logDate)}</td>
                  <td className="px-2 py-1.5 text-slate-600">
                    From {hqName ?? "HQ"} to {r.stationMovement || "—"}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{((r.taPercent || 100) / 100).toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{r.workDone || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-emerald-900">TA Summary</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-emerald-900">
          <span>Full day: <strong>{tally.p100}</strong></span>
          <span>70%: <strong>{tally.p70}</strong></span>
          <span>30%: <strong>{tally.p30}</strong></span>
          <span className="border-l border-emerald-300 pl-5">
            Total TA: <strong>{totalDays.toFixed(1)} day{totalDays === 1 ? "" : "s"}</strong>
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <PrimaryButton onClick={() => { exportDiary(period, rows, stations, currentUser); onClose(); }}>
          Generate Diary PDF
        </PrimaryButton>
      </div>
    </Modal>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton } from "./ui";
import { exportPcdo } from "./exports";
import { recentPcdoPeriods } from "@/lib/pcdo";
import { fmtDate } from "@/lib/api";

export function PcdoExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, stationName } = useData();
  const periods = useMemo(() => recentPcdoPeriods(12), []);
  const [idx, setIdx] = useState(0);
  const [stationFilter, setStationFilter] = useState<number | "">("");

  const period = periods[idx];

  const entries = logs.filter((l) => {
    if (!l.pcdoWork || !l.pcdoWork.trim()) return false;
    const d = l.pcdoDate || l.logDate;
    if (d < period.from || d > period.to) return false;
    if (stationFilter && l.pcdoStationId !== stationFilter) return false;
    return true;
  });

  // Preview grouped station-wise
  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = stationName(e.pcdoStationId);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(e);
  }

  // Disconnections in the same period
  const resolveStationId = (movement: string | null, pcdoId: number | null) => {
    if (pcdoId) return pcdoId;
    const m = stations.find(
      (s) => movement === s.name || (movement && movement.toLowerCase().includes(s.name.toLowerCase()))
    );
    return m ? m.id : null;
  };
  const discEntries = logs.filter((l) => {
    if (!l.hasDisconnections) return false;
    if (l.discSpecialWork + l.discFailure + l.discMaintenance <= 0) return false;
    const d = l.pcdoDate || l.logDate;
    if (d < period.from || d > period.to) return false;
    if (stationFilter && resolveStationId(l.stationMovement, l.pcdoStationId) !== stationFilter) return false;
    return true;
  });
  const discTotals = discEntries.reduce(
    (a, r) => ({
      sw: a.sw + r.discSpecialWork,
      fa: a.fa + r.discFailure,
      mt: a.mt + r.discMaintenance,
    }),
    { sw: 0, fa: 0, mt: 0 }
  );
  const discGrand = discTotals.sw + discTotals.fa + discTotals.mt;

  return (
    <Modal open={open} onClose={onClose} title="Export PCDO (Special Works)" wide>
      <p className="mb-3 text-sm text-slate-600">
        A PCDO period always runs from the <strong>26th of the previous month</strong> to the{" "}
        <strong>25th of the current month</strong>. The report is grouped station-wise with the date of each
        special work.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="PCDO Period">
          <select className={inputClass} value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {periods.map((p, i) => (
              <option key={p.from} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Station">
          <select
            className={inputClass}
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
        Covering <strong>{fmtDate(period.from)}</strong> to <strong>{fmtDate(period.to)}</strong> ·{" "}
        {entries.length} special work{entries.length !== 1 ? "s" : ""}
      </div>

      <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            No special works recorded in the PCDO section for this period.
          </p>
        ) : (
          [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([station, items]) => (
              <div key={station} className="border-b border-slate-100 last:border-0">
                <p className="bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                  {station} ({items.length})
                </p>
                {items.map((it) => (
                  <div key={it.id} className="flex gap-3 px-3 py-2 text-sm">
                    <span className="w-24 flex-shrink-0 text-xs text-slate-500">
                      {fmtDate(it.pcdoDate || it.logDate)}
                    </span>
                    <span className="min-w-0 flex-1 text-slate-800">{it.pcdoWork}</span>
                  </div>
                ))}
              </div>
            ))
        )}
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
          Disconnections in this period
        </p>
        {discGrand === 0 ? (
          <p className="text-sm text-amber-800/70">None recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-amber-900">
            <span>Special Work: <strong>{discTotals.sw}</strong></span>
            <span>Failure: <strong>{discTotals.fa}</strong></span>
            <span>Maintenance: <strong>{discTotals.mt}</strong></span>
            <span className="border-l border-amber-300 pl-5">Total: <strong>{discGrand}</strong></span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <PrimaryButton onClick={() => { exportPcdo(period, logs, stations, stationFilter); onClose(); }}>
          Generate PCDO PDF
        </PrimaryButton>
      </div>
    </Modal>
  );
}

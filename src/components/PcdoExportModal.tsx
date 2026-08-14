"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton } from "./ui";
import { exportPcdo } from "./exports";
import { recentPcdoPeriods } from "@/lib/pcdo";
import { fmtDate, pcdoWorkEntries } from "@/lib/api";

export function PcdoExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, stationName, myStationIds } = useData();
  const periods = useMemo(() => recentPcdoPeriods(12), []);
  const [idx, setIdx] = useState(0);
  const [stationFilter, setStationFilter] = useState<number | "">("");
  // Rows unchecked by the user; everything is selected by default.
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

  const period = periods[idx];

  // Disconnections in the same period
  const resolveStationId = (movement: string | null, pcdoId: number | null) => {
    if (pcdoId) return pcdoId;
    const m = stations.find(
      (s) => movement === s.name || (movement && movement.toLowerCase().includes(s.name.toLowerCase()))
    );
    return m ? m.id : null;
  };

  // The report covers only the current user's mapped stations.
  const mapped = myStationIds;
  const inMappedScope = (l: (typeof logs)[number]) => {
    if (mapped.length === 0) return true;
    const sid = l.pcdoStationId ?? resolveStationId(l.stationMovement, l.pcdoStationId);
    return sid != null && mapped.includes(sid);
  };
  const baseLogs = mapped.length ? logs.filter(inMappedScope) : logs;

  const entries = baseLogs.filter((l) => {
    if (pcdoWorkEntries(l).length === 0) return false;
    const d = l.pcdoDate || l.logDate;
    if (d < period.from || d > period.to) return false;
    if (stationFilter && l.pcdoStationId !== stationFilter) return false;
    return true;
  });

  // Preview rows: one per (log × department), so a multi-department entry
  // shows each of its works under the right department.
  type PreviewRow = { id: number; station: string; date: string; department: string; work: string };
  const previewRows: PreviewRow[] = [];
  for (const e of entries) {
    const st = stationName(e.pcdoStationId);
    for (const w of pcdoWorkEntries(e)) {
      previewRows.push({
        id: e.id,
        station: st,
        date: e.pcdoDate || e.logDate,
        department: w.department || "General",
        work: w.work,
      });
    }
  }

  // Preview grouped station-wise
  const grouped = new Map<string, PreviewRow[]>();
  for (const r of previewRows) {
    if (!grouped.has(r.station)) grouped.set(r.station, []);
    grouped.get(r.station)!.push(r);
  }

  const discEntries = baseLogs.filter((l) => {
    if (!l.hasDisconnections) return false;
    if (l.discSpecialWork + l.discFailure + l.discMaintenance + l.discNotPermitted <= 0) return false;
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
      np: a.np + r.discNotPermitted,
    }),
    { sw: 0, fa: 0, mt: 0, np: 0 }
  );
  const discGrand = discTotals.sw + discTotals.fa + discTotals.mt + discTotals.np;

  // Only ids still present in the current listing count as deselected, so
  // switching period/station simply starts everyone selected again.
  const selectedIds = (() => {
    const s = new Set<number>();
    for (const e of entries) if (!deselected.has(e.id)) s.add(e.id);
    return s;
  })();

  const toggleRow = (id: number) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAll = (select: boolean) => {
    setDeselected(new Set(select ? [] : entries.map((e) => e.id)));
  };

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
            <option value="">{mapped.length ? "All my stations" : "All stations"}</option>
            {(mapped.length ? stations.filter((s) => mapped.includes(s.id)) : stations).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {mapped.length > 0 && (
            <span className="mt-1 block text-xs text-slate-500">
              Only the stations mapped to you are exported.
            </span>
          )}
        </Field>
      </div>

      <div className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
        Covering <strong>{fmtDate(period.from)}</strong> to <strong>{fmtDate(period.to)}</strong> ·{" "}
        {previewRows.filter((r) => selectedIds.has(r.id)).length} of {previewRows.length} special work
        {previewRows.length !== 1 ? "s" : ""} selected
      </div>

      {entries.length > 0 && (
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">Tick the rows you want in the PDF.</span>
          <span className="flex gap-3">
            <button onClick={() => setAll(true)} className="font-medium text-blue-700">Select all</button>
            <button onClick={() => setAll(false)} className="font-medium text-slate-500">Clear</button>
          </span>
        </div>
      )}

      <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
        {previewRows.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            No special works recorded in the PCDO section for this period.
          </p>
        ) : (
          [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([station, rows]) => (
              <div key={station} className="border-b border-slate-100 last:border-0">
                <p className="bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                  {station} ({rows.length})
                </p>
                {rows.map((r) => {
                  const checked = selectedIds.has(r.id);
                  return (
                    <label
                      key={`${r.id}-${r.department}`}
                      className={`flex cursor-pointer gap-3 px-3 py-2 text-sm ${
                        checked ? "" : "bg-slate-50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(r.id)}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-indigo-600"
                      />
                      <span className="w-24 flex-shrink-0 text-xs text-slate-500">
                        {fmtDate(r.date)}
                      </span>
                      <span className="w-20 flex-shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-center text-[10px] font-semibold text-indigo-700">
                        {r.department}
                      </span>
                      <span className={`min-w-0 flex-1 ${checked ? "text-slate-800" : "line-through text-slate-400"}`}>
                        {r.work}
                      </span>
                    </label>
                  );
                })}
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
            <span>Not Permitted: <strong>{discTotals.np}</strong></span>
            <span className="border-l border-amber-300 pl-5">Total: <strong>{discGrand}</strong></span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => {
            exportPcdo(period, baseLogs, stations, stationFilter, selectedIds);
            onClose();
          }}
        >
          Generate PCDO PDF ({selectedIds.size})
        </PrimaryButton>
      </div>
    </Modal>
  );
}

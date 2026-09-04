"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton } from "./ui";
import { exportInspections } from "./exports";
import { PeriodPicker, monthPeriod, type Period } from "./PeriodPicker";
import {
  INSPECTION_RULES,
  INSPECTION_KINDS,
  PERIODIC_KINDS,
  PERIODICITIES,
  expandInspectionRecords,
  formatInspectionDates,
  type InspectionKind,
} from "@/lib/inspections";
import {
  fmtDate,
  footplateTrainList,
  footplateRidesOf,
  footplateTrainListFromRide,
  formatFootplateShifts,
  formatFootplateSummary,
  logMatchesInspectionStation,
} from "@/lib/api";

export function InspectionExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, stationName } = useData();
  const [kinds, setKinds] = useState<InspectionKind[]>(["monthly"]);
  const toggleKind = (k: InspectionKind) =>
    setKinds((prev) =>
      prev.includes(k) ? (prev.length > 1 ? prev.filter((x) => x !== k) : prev) : [...prev, k]
    );
  const hasKind = (k: InspectionKind) => kinds.includes(k);
  const [period, setPeriod] = useState<Period>(() => monthPeriod(0));
  const [custom, setCustom] = useState(false);
  const [stationFilter, setStationFilter] = useState<number | "">("");
  const [periodicity, setPeriodicity] = useState<string>("");
  // Rows start all-selected; unchecking a row adds it here. New filters simply
  // don't match the deselected ids, so no effect is needed to re-sync.
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

  const rows = useMemo(
    () =>
      logs
        .filter((l) => {
          // Footplate also matches logs whose movement chain carries a ride
          // (tracked as a footplate inspection even when the log's own kind is
          // another tag).
          const matches = kinds.some(
            (k) =>
              k === "footplate"
                ? l.inspectionKind === "footplate" || footplateRidesOf(l).length > 0
                : l.inspectionKind === k
          );
          if (!matches) return false;
          if (l.logDate < period.from || l.logDate > period.to) return false;
          if (stationFilter && !logMatchesInspectionStation(l, stationFilter)) return false;
          if (periodicity && l.inspectionPeriodicity !== periodicity) return false;
          return true;
        })
        .sort((a, b) => a.logDate.localeCompare(b.logDate)),
    [logs, kinds, period, stationFilter, periodicity]
  );

  const selected = rows.filter((r) => !deselected.has(r.id));

  // Preview grouping: footplate lists train numbers, others merge dates per
  // station. A log whose movement chain carries a footplate ride yields an
  // extra footplate group in addition to its tagged-inspection group.
  const grouped = new Map<string, { footplate: boolean; items: (typeof rows)[number][] }>();
  const addToGroup = (k: string, footplate: boolean, item: (typeof rows)[number]) => {
    const g = grouped.get(k);
    if (!g) grouped.set(k, { footplate, items: [item] });
    else g.items.push(item);
  };
  for (const rec of expandInspectionRecords(selected)) {
    const r = rec.id != null ? (selected.find((x) => x.id === rec.id) ?? null) : null;
    if (!r) continue;
    const kd = rec.inspectionKind as InspectionKind;
    const prefix = kinds.length > 1 ? `${INSPECTION_RULES[kd].label.replace(" Inspection", "")} · ` : "";
    if (kd === "footplate") {
      const rides = footplateRidesOf(r);
      addToGroup(
        `${prefix}${formatFootplateShifts(rides[0]?.shift ?? r.footplateShift) || "-"} footplate`,
        true,
        r
      );
    } else {
      const at = stationName(r.inspectionStationId);
      addToGroup(
        prefix + (kd === "joint" && r.inspectionJointDept ? `${at} (with ${r.inspectionJointDept})` : at),
        false,
        r
      );
    }
  }
  const trainsOf = (r: (typeof rows)[number]) => {
    const rides = footplateRidesOf(r);
    if (rides.length === 0) return footplateTrainList(r);
    return rides
      .map((ride) => footplateTrainListFromRide(ride))
      .filter(Boolean)
      .join("; ");
  };

  const toggle = (id: number) => {
    const n = new Set(deselected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setDeselected(n);
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Inspections" wide>
      {/* Kind */}
      <p className="mb-1 text-sm font-medium text-slate-700">
        Inspection types <span className="text-xs text-slate-400">(select one or more)</span>
      </p>
      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {INSPECTION_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => toggleKind(k)}
            className={`rounded-lg border px-0.5 py-2 text-[11px] font-medium capitalize ${
              hasKind(k) ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-300 text-slate-600"
            }`}
          >
            {hasKind(k) ? "✓ " : ""}
            {INSPECTION_RULES[k].label.replace(" Inspection", "")}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <PeriodPicker period={period} onChange={setPeriod} custom={custom} setCustom={setCustom} />
      </div>

      {kinds.some((k) => PERIODIC_KINDS.includes(k)) && (
        <div className="mb-3">
          <p className="mb-1 text-sm font-medium text-slate-700">Periodicity</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPeriodicity("")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm capitalize ${
                periodicity === "" ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-300 text-slate-600"
              }`}
            >
              Both
            </button>
            {PERIODICITIES.map((pd) => (
              <button
                key={pd}
                onClick={() => setPeriodicity(pd)}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-sm capitalize ${
                  periodicity === pd
                    ? "border-sky-600 bg-sky-50 text-sky-800"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                {pd}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Station inspected</span>
        <select
          className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm"
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
      </label>

      {/* Date picker list */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
          Select dates ({selected.length}/{rows.length})
        </p>
        {rows.length > 0 && (
          <button
            onClick={() =>
              setDeselected(selected.length === rows.length ? new Set(rows.map((r) => r.id)) : new Set())
            }
            className="text-xs font-medium text-blue-600 underline"
          >
            {selected.length === rows.length ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            No inspections of the selected type(s) recorded in this period.
          </p>
        ) : (
          rows.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 ${
                !deselected.has(r.id) ? "bg-sky-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={!deselected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="h-4 w-4 accent-sky-600"
              />
              <span className="w-24 flex-shrink-0 text-xs text-slate-500">{fmtDate(r.logDate)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                {kinds.length > 1
                  ? `[${INSPECTION_RULES[r.inspectionKind as InspectionKind].label.replace(" Inspection", "")}] `
                  : ""}
                {r.inspectionKind === "footplate"
                  ? trainsOf(r) || "no train no."
                  : stationName(r.inspectionStationId)}
                {r.inspectionKind !== "footplate" && r.inspectionSide === "Both"
                  ? " — towards Both sides"
                  : r.inspectionKind !== "footplate" && r.inspectionTowardsStationId
                    ? ` — towards ${stationName(r.inspectionTowardsStationId)} side`
                    : ""}
                {r.inspectionJointDept ? ` · with ${r.inspectionJointDept}` : ""}
                {r.footplateShift ? ` · ${formatFootplateSummary(r)}` : ""}
              </span>
            </label>
          ))
        )}
      </div>

      {/* Preview */}
      {grouped.size > 0 && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-sky-900">
            Will export — Station Inspected · Dates
          </p>
            {[...grouped.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([st, g]) => (
                <p key={st} className="text-sm text-sky-900">
                  <strong>{st}</strong>:{" "}
                  {g.footplate
                    ? g.items
                        .flatMap((i) => {
                          const rides = footplateRidesOf(i);
                          const lists =
                            rides.length > 0
                              ? rides.map((ride) => footplateTrainListFromRide(ride) || "-")
                              : [trainsOf(i) || "-"];
                          return lists.map((t) => `${t} (${i.logDate.slice(8)})`);
                        })
                        .join("; ")
                    : formatInspectionDates(g.items.map((i) => i.logDate))}
                </p>
              ))}
        </div>
      )}

      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => {
            exportInspections(
              kinds,
              kinds.length === 1
                ? INSPECTION_RULES[kinds[0]].label
                : "Inspections — " +
                  kinds.map((k) => INSPECTION_RULES[k].label.replace(" Inspection", "")).join(" + "),
              period,
              selected,
              stations,
              stationFilter,
              (k) => INSPECTION_RULES[k as InspectionKind].label,
              onClose
            );
          }}
        >
          Generate PDF
        </PrimaryButton>
      </div>
    </Modal>
  );
}

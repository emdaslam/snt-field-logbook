"use client";

import { useEffect, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Chip, PrimaryButton } from "./ui";
import { exportTomorrowsWork } from "./exports";
import { api, fmtDate, toISODate } from "@/lib/api";
import { PRIORITY_COLORS, DEPARTMENT_COLORS } from "@/lib/types";

export function TomorrowWorkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deficiencies, planned, stations, stationName, refresh, autoSync } = useData();
  const [selDef, setSelDef] = useState<Set<number>>(new Set());
  const [selPlan, setSelPlan] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [stationFilter, setStationFilter] = useState<number[]>([]);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toISODate(tomorrow);

  const pendingDef = deficiencies.filter((d) => d.status === "Pending");
  const pendingPlan = planned.filter((p) => p.status === "Pending");

  // Station filter — empty array means all stations.
  const toggleFilterStation = (id: number) =>
    setStationFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const stationMatched = (id: number | null) =>
    stationFilter.length === 0 || (id != null && stationFilter.includes(id));

  const filteredDef = pendingDef.filter((d) => stationMatched(d.stationId));
  const filteredPlan = pendingPlan.filter((p) => stationMatched(p.stationId));

  const selectAllDef = () => {
    const next = new Set(selDef);
    for (const d of filteredDef) next.add(d.id);
    setSelDef(next);
  };
  const clearDef = () => {
    const next = new Set(selDef);
    for (const d of filteredDef) next.delete(d.id);
    setSelDef(next);
  };
  const selectAllPlan = () => {
    const next = new Set(selPlan);
    for (const p of filteredPlan) next.add(p.id);
    setSelPlan(next);
  };
  const clearPlan = () => {
    const next = new Set(selPlan);
    for (const p of filteredPlan) next.delete(p.id);
    setSelPlan(next);
  };

  // Pre-select items already flagged or planned exactly for tomorrow
  useEffect(() => {
    if (!open) return;
    setSelDef(new Set(pendingDef.filter((d) => d.selectedForTomorrow).map((d) => d.id)));
    setSelPlan(
      new Set(
        pendingPlan
          .filter((p) => p.selectedForTomorrow || p.plannedDate === tomorrowIso)
          .map((p) => p.id)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(set: Set<number>, id: number, setter: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function generate() {
    setSaving(true);
    // Persist the selection so it stays consistent with Task Manager checkboxes
    await Promise.all([
      ...pendingDef.map((d) =>
        d.selectedForTomorrow !== selDef.has(d.id)
          ? api.deficiencies.update({ id: d.id, selectedForTomorrow: selDef.has(d.id) })
          : Promise.resolve()
      ),
      ...pendingPlan.map((p) =>
        p.selectedForTomorrow !== selPlan.has(p.id)
          ? api.planned.update({ id: p.id, selectedForTomorrow: selPlan.has(p.id) })
          : Promise.resolve()
      ),
    ]);
    void autoSync();

    // Build export from the current in-modal selection directly
    const selectedDefs = pendingDef
      .filter((d) => selDef.has(d.id))
      .map((d) => ({ ...d, selectedForTomorrow: true }));
    const selectedPlans = pendingPlan
      .filter((p) => selPlan.has(p.id))
      .map((p) => ({ ...p, selectedForTomorrow: true, plannedDate: p.plannedDate }));

    exportTomorrowsWork(selectedDefs, selectedPlans, stations, note);
    await refresh();
    setSaving(false);
    onClose();
  }

  const total = selDef.size + selPlan.size;

  return (
    <Modal open={open} onClose={onClose} title={`Tomorrow's Work · ${fmtDate(tomorrowIso)}`} wide>
      <p className="mb-3 text-sm text-slate-600">
        Select the deficiency tasks and planned works to be done tomorrow, then export the station-wise PDF.
      </p>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">
          Stations ({stationFilter.length} selected — none means all)
        </p>
        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-surface p-2">
          {stations.length === 0 && <p className="text-xs text-slate-400">No stations yet.</p>}
          {stations.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={stationFilter.includes(s.id)}
                onChange={() => toggleFilterStation(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Use this to focus on one or a few stations, then press &quot;Select all&quot; in a section to tick that station&apos;s items.
        </p>
      </div>

      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Deficiency Tasks</h4>
        <div className="flex gap-2">
          <button onClick={clearDef} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100">
            Clear
          </button>
          <button onClick={selectAllDef} className="rounded border border-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
            Select all
          </button>
        </div>
      </div>
      {filteredDef.length === 0 && (
        <p className="mb-3 text-sm text-slate-400">
          {pendingDef.length === 0 ? "No pending deficiency tasks." : "No deficiency tasks for the selected stations."}
        </p>
      )}
      <div className="mb-4 space-y-2">
        {filteredDef.map((d) => (
          <label
            key={d.id}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
              selDef.has(d.id) ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
            }`}
          >
            <input
              type="checkbox"
              checked={selDef.has(d.id)}
              onChange={() => toggle(selDef, d.id, setSelDef)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{d.title}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip label={d.department} color={DEPARTMENT_COLORS[d.department] ?? "#2563eb"} />
                <Chip label={d.priority} color={PRIORITY_COLORS[d.priority] ?? "#2563eb"} />
                <Chip label={stationName(d.stationId)} color="#0e7490" />
                {d.dueDate && <Chip label={"Due " + fmtDate(d.dueDate)} color="#b45309" />}
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">Future Planned Works</h4>
        <div className="flex gap-2">
          <button onClick={clearPlan} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100">
            Clear
          </button>
          <button onClick={selectAllPlan} className="rounded border border-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
            Select all
          </button>
        </div>
      </div>
      {filteredPlan.length === 0 && (
        <p className="mb-3 text-sm text-slate-400">
          {pendingPlan.length === 0 ? "No pending planned works." : "No planned works for the selected stations."}
        </p>
      )}
      <div className="mb-4 space-y-2">
        {filteredPlan.map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
              selPlan.has(p.id) ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
            }`}
          >
            <input
              type="checkbox"
              checked={selPlan.has(p.id)}
              onChange={() => toggle(selPlan, p.id, setSelPlan)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{p.title}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip label={"Planned " + fmtDate(p.plannedDate)} color="#059669" />
                <Chip label={stationName(p.stationId)} color="#0e7490" />
                {p.plannedDate === tomorrowIso && <Chip label="Scheduled tomorrow" color="#7c3aed" />}
              </div>
            </div>
          </label>
        ))}
      </div>

      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">Note (optional)</h4>
      <textarea
        className="mb-4 w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        rows={2}
        placeholder="Anything to print on the PDF, e.g. tools, safety reminders…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="sticky bottom-0 -mx-5 flex items-center justify-between border-t border-slate-200 bg-surface px-5 pt-3">
        <span className="text-sm text-slate-500">{total} item{total !== 1 ? "s" : ""} selected</span>
        <PrimaryButton onClick={generate}>{saving ? "Generating…" : "Export PDF"}</PrimaryButton>
      </div>
    </Modal>
  );
}

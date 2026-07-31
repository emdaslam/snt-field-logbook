"use client";

import { useEffect, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Chip, PrimaryButton } from "./ui";
import { exportTomorrowsWork } from "./exports";
import { api, fmtDate, toISODate } from "@/lib/api";
import { PRIORITY_COLORS, DEPARTMENT_COLORS } from "@/lib/types";

export function TomorrowWorkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deficiencies, planned, stations, stationName, refresh } = useData();
  const [selDef, setSelDef] = useState<Set<number>>(new Set());
  const [selPlan, setSelPlan] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toISODate(tomorrow);

  const pendingDef = deficiencies.filter((d) => d.status === "Pending");
  const pendingPlan = planned.filter((p) => p.status === "Pending");

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

    // Build export from the current in-modal selection directly
    const selectedDefs = pendingDef
      .filter((d) => selDef.has(d.id))
      .map((d) => ({ ...d, selectedForTomorrow: true }));
    const selectedPlans = pendingPlan
      .filter((p) => selPlan.has(p.id))
      .map((p) => ({ ...p, selectedForTomorrow: true, plannedDate: p.plannedDate }));

    exportTomorrowsWork(selectedDefs, selectedPlans, stations);
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

      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">Deficiency Tasks</h4>
      {pendingDef.length === 0 && <p className="mb-3 text-sm text-slate-400">No pending deficiency tasks.</p>}
      <div className="mb-4 space-y-2">
        {pendingDef.map((d) => (
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

      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">Future Planned Works</h4>
      {pendingPlan.length === 0 && <p className="mb-3 text-sm text-slate-400">No pending planned works.</p>}
      <div className="mb-4 space-y-2">
        {pendingPlan.map((p) => (
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

      <div className="sticky bottom-0 -mx-5 flex items-center justify-between border-t border-slate-200 bg-white px-5 pt-3">
        <span className="text-sm text-slate-500">{total} item{total !== 1 ? "s" : ""} selected</span>
        <PrimaryButton onClick={generate}>{saving ? "Generating…" : "Export PDF"}</PrimaryButton>
      </div>
    </Modal>
  );
}

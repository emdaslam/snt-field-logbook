"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton, Chip } from "./ui";
import { exportMonthly, type MonthlyFilters } from "./exports";
import { toISODate } from "@/lib/api";
import { DEPARTMENTS, STATUSES } from "@/lib/types";

export function MonthlyExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, deficiencies, planned, stations, tags } = useData();

  const today = new Date();
  const monthBack = new Date();
  monthBack.setMonth(monthBack.getMonth() - 1);

  const [f, setF] = useState<MonthlyFilters>({
    includeLogs: true,
    includeDeficiencies: true,
    includePlanned: true,
    from: toISODate(monthBack),
    to: toISODate(today),
    stationIds: [],
    departments: [],
    status: "",
    tagId: "",
  });

  const toggleStation = (id: number) =>
    setF((prev) => ({
      ...prev,
      stationIds: prev.stationIds.includes(id)
        ? prev.stationIds.filter((x) => x !== id)
        : [...prev.stationIds, id],
    }));
  const toggleDept = (d: string) =>
    setF((prev) => ({
      ...prev,
      departments: prev.departments.includes(d)
        ? prev.departments.filter((x) => x !== d)
        : [...prev.departments, d],
    }));

  return (
    <Modal open={open} onClose={onClose} title="Export Monthly List" wide>
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Sections to include</p>
        <div className="space-y-1.5">
          <Toggle
            label="Daily Logs"
            checked={f.includeLogs}
            onChange={(v) => setF({ ...f, includeLogs: v })}
          />
          <Toggle
            label="Deficiency List"
            checked={f.includeDeficiencies}
            onChange={(v) => setF({ ...f, includeDeficiencies: v })}
          />
          <Toggle
            label="Future Planned Works"
            checked={f.includePlanned}
            onChange={(v) => setF({ ...f, includePlanned: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="date" className={inputClass} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClass} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className={inputClass} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Tag">
          <select className={inputClass} value={f.tagId} onChange={(e) => setF({ ...f, tagId: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">All</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label={`Stations (${f.stationIds.length} selected — none means all)`}>
        <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {stations.length === 0 && <p className="text-xs text-slate-400">No stations yet.</p>}
          {stations.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={f.stationIds.includes(s.id)}
                onChange={() => toggleStation(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Departments (none means all)">
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((d) => (
            <Chip
              key={d}
              label={d}
              color="#0e7490"
              active={f.departments.includes(d)}
              onClick={() => toggleDept(d)}
            />
          ))}
        </div>
      </Field>

      <p className="mb-3 text-xs text-slate-400">
        Default range is today back to exactly one month prior. Daily logs export in ascending date order;
        deficiencies and planned works are grouped station-wise.
      </p>
      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => {
            exportMonthly(f, logs, deficiencies, planned, stations, tags);
            onClose();
          }}
        >
          Generate PDF
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-600"
      />
      {label}
    </label>
  );
}

"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton } from "./ui";
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

  const [openMenu, setOpenMenu] = useState<null | "stations" | "depts">(null);

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

      <MultiSelectDropdown
        label="Stations"
        hint={
          f.stationIds.length === 0
            ? "None selected — all stations included"
            : `${f.stationIds.length} station${f.stationIds.length !== 1 ? "s" : ""} selected`
        }
        options={stations.map((s) => ({ value: s.id, label: s.name }))}
        selected={f.stationIds}
        onToggle={(v) => toggleStation(v as number)}
        open={openMenu === "stations"}
        onOpenChange={(o) => setOpenMenu(o ? "stations" : null)}
        emptyText="No stations yet."
      />

      <MultiSelectDropdown
        label="Departments"
        hint={
          f.departments.length === 0
            ? "None selected — all departments included"
            : `${f.departments.length} department${f.departments.length !== 1 ? "s" : ""} selected`
        }
        options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
        selected={f.departments}
        onToggle={(v) => toggleDept(v as string)}
        open={openMenu === "depts"}
        onOpenChange={(o) => setOpenMenu(o ? "depts" : null)}
      />

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

function MultiSelectDropdown({
  label,
  hint,
  options,
  selected,
  onToggle,
  open,
  onOpenChange,
  emptyText,
}: {
  label: string;
  hint?: string;
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onToggle: (v: string | number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emptyText?: string;
}) {
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? options.find((o) => selected.includes(o.value))?.label ?? "1 selected"
        : `${selected.length} selected`;
  return (
    <div className="relative mb-3">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      >
        <span className="truncate">{summary}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`flex-shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-surface p-2 shadow-lg">
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-slate-400">{emptyText ?? "Nothing to choose"}</p>
          )}
          {options.map((o) => (
            <label
              key={String(o.value)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

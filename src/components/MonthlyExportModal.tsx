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
    stationId: "",
    department: "",
    status: "",
    tagId: "",
  });

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
        <Field label="Station">
          <select className={inputClass} value={f.stationId} onChange={(e) => setF({ ...f, stationId: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">All</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select className={inputClass} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
            <option value="">All</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
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
      <p className="mb-3 text-xs text-slate-400">Default range is today back to exactly one month prior.</p>
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

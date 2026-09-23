"use client";

import { toISODate } from "@/lib/api";

export type Period = { from: string; to: string; label: string };

/** Calendar month period for an offset from the current month (0 = this month). */
export function monthPeriod(offset = 0, ref: Date = new Date()): Period {
  const d = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    from: toISODate(d),
    to: toISODate(end),
    label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export function recentMonths(count = 12, ref: Date = new Date()): Period[] {
  return Array.from({ length: count }, (_, i) => monthPeriod(-i, ref));
}

export function PeriodPicker({
  period,
  onChange,
  custom,
  setCustom,
}: {
  period: Period;
  onChange: (p: Period) => void;
  custom: boolean;
  setCustom: (v: boolean) => void;
}) {
  const months = recentMonths(12);
  const activeIdx = months.findIndex((m) => m.from === period.from && m.to === period.to);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900">Report Period</span>
        <button
          onClick={() => setCustom(!custom)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
            custom ? "bg-emerald-600 text-white shadow-sm shadow-emerald-700/20" : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-200"
          }`}
        >
          {custom ? "Custom range" : "By month"}
        </button>
      </div>

      {custom ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            From
            <input
              type="date"
              value={period.from}
              onChange={(e) =>
                onChange({ ...period, from: e.target.value, label: "Custom range" })
              }
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:bg-surface focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            To
            <input
              type="date"
              value={period.to}
              onChange={(e) => onChange({ ...period, to: e.target.value, label: "Custom range" })}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:bg-surface focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>
      ) : (
        <select
          value={activeIdx < 0 ? 0 : activeIdx}
          onChange={(e) => onChange(months[Number(e.target.value)])}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:bg-surface focus:ring-4 focus:ring-blue-100"
        >
          {months.map((m, i) => (
            <option key={m.from} value={i}>
              {m.label}
              {i === 0 ? " (current)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

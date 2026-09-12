"use client";

import { useMemo, useState } from "react";
import { useBackClose } from "@/lib/backButton";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton, inputClass } from "./ui";
import { api, cloneLogForDate, fmtDate, dayName } from "@/lib/api";
import { isSharedLog } from "@/lib/backup";
import type { DailyLog } from "@/db/schema";

export function CopyLogToDatesModal({
  log,
  onClose,
  onCopied,
}: {
  log: DailyLog;
  onClose: () => void;
  onCopied: () => void;
}) {
  const { logs, refresh, autoSync } = useData();
  const source = log.logDate;
  const [cursor, setCursor] = useState(() => new Date(source + "T00:00:00"));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [addDate, setAddDate] = useState("");
  const [saving, setSaving] = useState(false);

  useBackClose(true, onClose);

  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const l of logs) {
      if (l.id === log.id || isSharedLog(l)) continue;
      s.add(l.logDate);
    }
    return s;
  }, [logs, log.id]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function toggle(iso: string) {
    if (iso === source) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  const chosen = useMemo(() => [...selected].sort(), [selected]);

  async function copy() {
    if (chosen.length === 0 || saving) return;
    const clash = chosen.filter((d) => occupied.has(d));
    if (clash.length > 0) {
      const ok = confirm(
        `${clash.length} of the chosen date${clash.length === 1 ? "" : "s"} already ${
          clash.length === 1 ? "has" : "have"
        } a daily log. Copy anyway? A new entry is added on each date — existing logs are not replaced.`
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      for (const d of chosen) {
        await api.logs.create(cloneLogForDate(log, d));
      }
      void autoSync();
      await refresh();
      onCopied();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Copy to dates">
      <p className="mb-3 text-sm text-slate-600">
        Copies this entry onto each date you pick. Movement, work, timings, tags and
        attachments stay the same; each copy can be edited on its own. The original{" "}
        <span className="font-semibold text-slate-800">
          {dayName(source)}, {fmtDate(source)}
        </span>{" "}
        is not changed.
      </p>

      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-full p-1 text-blue-800 hover:bg-blue-100"
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-blue-900">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-full p-1 text-blue-800 hover:bg-blue-100"
          aria-label="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-0.5 text-[10px] font-semibold text-slate-400">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSource = iso === source;
          const isPicked = selected.has(iso);
          const hasLog = occupied.has(iso);
          return (
            <button
              key={i}
              type="button"
              disabled={isSource}
              onClick={() => toggle(iso)}
              className={`relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs transition ${
                isSource
                  ? "bg-slate-200 font-semibold text-slate-500"
                  : isPicked
                    ? "bg-blue-800 font-semibold text-white"
                    : "text-slate-700 hover:bg-blue-50"
              }`}
              aria-label={iso}
              title={isSource ? "Original date" : iso}
            >
              <span className="leading-none">{day}</span>
              {hasLog && !isSource && !isPicked && (
                <span className="mt-[3px] h-[3px] w-3 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[11px] text-slate-500">
        Grey = this entry&apos;s date. Green dot = that day already has a log.
      </p>

      <label className="mt-3 mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Add a date</span>
        <input
          type="date"
          className={inputClass}
          value={addDate}
          onChange={(e) => {
            const v = e.target.value;
            setAddDate(v);
            if (v && v !== source) {
              setSelected((prev) => {
                const next = new Set(prev);
                next.add(v);
                return next;
              });
              setCursor(new Date(v + "T00:00:00"));
            }
          }}
        />
      </label>

      {chosen.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chosen.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-900"
            >
              {dayName(d)} {fmtDate(d)}
              {occupied.has(d) ? " · has log" : ""}
              <span className="text-blue-500">x</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <PrimaryButton onClick={copy} disabled={chosen.length === 0 || saving}>
          {saving
            ? "Copying…"
            : chosen.length === 0
              ? "Copy"
              : `Copy to ${chosen.length} date${chosen.length === 1 ? "" : "s"}`}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

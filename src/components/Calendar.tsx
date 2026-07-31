"use client";

import { toISODate } from "@/lib/api";

export function Calendar({
  activeDates,
  selectedDate,
  focusedDate,
  onSelect,
  collapsed,
  cursor,
  setCursor,
}: {
  activeDates: Set<string>;
  selectedDate: string | null;
  focusedDate: string | null;
  onSelect: (d: string | null) => void;
  collapsed: boolean;
  cursor: Date;
  setCursor: (d: Date) => void;
}) {
  const today = toISODate(new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (collapsed) {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm font-medium text-blue-900">
        <span>{monthLabel}</span>
        {focusedDate && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            {new Date(focusedDate + "T00:00:00").toLocaleDateString("en-GB", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-full p-1.5 text-blue-800 hover:bg-blue-100"
          aria-label="Previous month"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-blue-900">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-full p-1.5 text-blue-800 hover:bg-blue-100"
          aria-label="Next month"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-1 text-[11px] font-semibold text-slate-400">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const isFocused = iso === focusedDate;
          const hasEntry = activeDates.has(iso);
          return (
            <button
              key={i}
              onClick={() => onSelect(isSelected ? null : iso)}
              className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition ${
                isToday
                  ? "bg-blue-800 font-bold text-white"
                  : isSelected
                    ? "bg-emerald-600 font-semibold text-white"
                    : isFocused
                      ? "bg-emerald-100 font-semibold text-emerald-800"
                      : "text-slate-700 hover:bg-blue-50"
              } ${isFocused && !isSelected ? "ring-2 ring-emerald-500" : ""}`}
            >
              {day}
              {hasEntry && !isToday && !isSelected && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

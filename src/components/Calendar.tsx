"use client";

import { useRef } from "react";
import { toISODate } from "@/lib/api";

export function Calendar({
  activeDates,
  dateTagColors,
  selectedDate,
  focusedDate,
  onSelect,
  collapsed,
  cursor,
  setCursor,
}: {
  activeDates: Set<string>;
  dateTagColors: Map<string, string[]>;
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

  // Horizontal swipe flips the month: swipe left = next, right = previous.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touchStart.current;
    touchStart.current = null;
    if (!t || collapsed) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    // Require a clear horizontal gesture so vertical scrolling is untouched.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClick.current = true;
      setCursor(new Date(year, month + (dx < 0 ? 1 : -1), 1));
      setTimeout(() => (suppressClick.current = false), 120);
    }
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (collapsed) {
    return (
      <div className="flex items-center justify-between px-4 py-1.5 text-sm font-medium text-blue-900">
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
    <div className="px-2 pb-2 pt-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-full p-1 text-blue-800 hover:bg-blue-100"
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-blue-900">{monthLabel}</span>
        <button
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
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const isFocused = iso === focusedDate;
          const hasEntry = activeDates.has(iso);
          const tagColors = dateTagColors.get(iso) ?? [];
          return (
            <button
              key={i}
              onClick={() => {
                if (suppressClick.current) return;
                onSelect(isSelected ? null : iso);
              }}
              className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
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
                <span className="absolute inset-x-0 bottom-0.5 flex items-center justify-center">
                  <span className="h-[3px] w-3 rounded-full bg-emerald-500" />
                </span>
              )}
              {tagColors.length > 0 && !isToday && !isSelected && (
                <span className="absolute inset-x-0 bottom-[7px] flex items-center justify-center gap-[2px]">
                  {tagColors.slice(0, 3).map((c, j) => (
                    <span key={j} className="h-1 w-1 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                  {tagColors.length > 3 && (
                    <span className="text-[7px] font-semibold leading-none text-slate-400">
                      +{tagColors.length - 3}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

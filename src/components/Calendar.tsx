"use client";

import { useRef, useState } from "react";
import { toISODate } from "@/lib/api";

function MonthGrid({
  month,
  activeDates,
  dateTagColors,
  selectedDate,
  focusedDate,
  today,
  suppressClick,
  onSelect,
}: {
  month: Date;
  activeDates: Set<string>;
  dateTagColors: Map<string, string[]>;
  selectedDate: string | null;
  focusedDate: string | null;
  today: string;
  suppressClick: React.MutableRefObject<boolean>;
  onSelect: (d: string | null) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="w-full flex-shrink-0">
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  // Drag-follow horizontal sliding: the grid follows the finger, then eases to
  // the neighbouring month (or springs back) on release.
  const [dragX, setDragX] = useState(0);
  const [settling, setSettling] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const commitDir = useRef(0);

  const goMonth = (dir: number) => {
    if (settling) return;
    const W = slideRef.current?.offsetWidth ?? 320;
    suppressClick.current = true;
    commitDir.current = dir;
    setSettling(true);
    setDragX(dir > 0 ? -W : W);
    setTimeout(() => {
      setCursor(new Date(year, month + dir, 1));
      setDragX(0);
      setSettling(false);
    }, 240);
    setTimeout(() => (suppressClick.current = false), 380);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (settling) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchStart.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Only track clearly horizontal gestures; pan-y keeps vertical scrolling.
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 4) return;
    const W = slideRef.current?.offsetWidth ?? 320;
    setDragX(Math.max(-W, Math.min(W, dx)));
  };
  const onTouchEnd = () => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s || dragX === 0) return;
    const W = slideRef.current?.offsetWidth ?? 320;
    const threshold = Math.max(60, W * 0.25);
    if (Math.abs(dragX) >= threshold) {
      goMonth(dragX < 0 ? 1 : -1);
    } else {
      setSettling(true);
      setDragX(0);
      setTimeout(() => setSettling(false), 220);
    }
  };

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

  const draggingNext = dragX < 0;
  const draggingPrev = dragX > 0;
  const rowTransform =
    dragX === 0
      ? "translateX(0px)"
      : draggingNext
        ? `translateX(${dragX}px)`
        : `translateX(calc(-100% + ${dragX}px))`;

  const gridProps = { activeDates, dateTagColors, selectedDate, focusedDate, today, suppressClick, onSelect };

  return (
    <div className="px-2 pb-2 pt-1">
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={() => goMonth(-1)}
          className="rounded-full p-1 text-blue-800 hover:bg-blue-100"
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-blue-900">{monthLabel}</span>
        <button
          onClick={() => goMonth(1)}
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
      </div>
      <div
        ref={slideRef}
        className="overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="flex items-start"
          style={{
            transform: rowTransform,
            transition: settling ? "transform 240ms cubic-bezier(0.32, 0.72, 0.28, 1)" : "none",
          }}
        >
          {draggingPrev && <MonthGrid month={new Date(year, month - 1, 1)} {...gridProps} />}
          <MonthGrid month={cursor} {...gridProps} />
          {draggingNext && <MonthGrid month={new Date(year, month + 1, 1)} {...gridProps} />}
        </div>
      </div>
    </div>
  );
}

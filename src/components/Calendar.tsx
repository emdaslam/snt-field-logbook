"use client";

import { useRef, useState } from "react";
import { toISODate } from "@/lib/api";

/**
 * Compact "Go to date" button. An invisible date input covers the small
 * calendar icon, so tapping it opens the native date picker straight away and
 * the chosen date jumps the calendar/timeline immediately — no extra sheet or
 * "Go" step. A "Go to today" button sits beside it as a quick shortcut back
 * to today.
 */
function GoToDateButton({
  initial,
  today,
  onGo,
}: {
  initial: string;
  today: string;
  onGo: (iso: string) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <span className="relative inline-flex items-center gap-1.5">
      <span className="relative inline-flex">
        <button
          className="flex h-[26px] items-center rounded-full border border-blue-200/80 bg-blue-50/80 px-2 text-blue-900 shadow-sm shadow-blue-100/60 backdrop-blur-sm transition hover:bg-blue-100 active:scale-95"
          type="button"
          aria-label="Go to date"
          title="Go to date"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
        <input
          type="date"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            if (e.target.value) onGo(e.target.value);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Go to date"
          title="Go to date"
        />
      </span>
      <button
        type="button"
        onClick={() => onGo(today)}
        className="flex h-[26px] items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50/80 px-2.5 text-[11px] font-semibold text-blue-900 shadow-sm shadow-blue-100/60 backdrop-blur-sm transition hover:bg-blue-100 active:scale-95"
        aria-label="Go to today"
        title="Go to today"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        Today
      </button>
    </span>
  );
}

/** Single month grid — 7-column layout with styled day cells. */
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
    <div className="w-full flex-shrink-0 px-1">
      <div className="grid grid-cols-7 gap-[2px] text-center">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="h-[28px]" />;
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
              className={`relative mx-auto flex h-[28px] w-[28px] items-center justify-center rounded-lg text-[12px] transition-all duration-150 active:scale-90 ${
                hasEntry && !isToday && !isSelected ? "pb-[5px]" : ""
              } ${
                isToday
                  ? "bg-gradient-to-br from-blue-700 to-blue-900 font-bold text-white shadow-md shadow-blue-800/30"
                  : isSelected
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-700 font-semibold text-white shadow-md shadow-emerald-600/30"
                    : isFocused
                      ? "bg-emerald-50 font-semibold text-emerald-800 ring-[1.5px] ring-emerald-400"
                      : hasEntry
                        ? "font-medium text-slate-800 hover:bg-blue-50 hover:shadow-sm"
                        : "text-slate-500 hover:bg-blue-50/60"
              }`}
            >
              <span className="leading-none">{day}</span>
              {hasEntry && !isToday && !isSelected && (
                <span className="absolute bottom-[2px] flex items-center justify-center gap-[2px] leading-none">
                  {tagColors.length > 0 ? (
                    <>
                      {tagColors.slice(0, 3).map((c, j) => (
                        <span
                          key={j}
                          className="h-[4px] w-[4px] rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      {tagColors.length > 3 && (
                        <span className="text-[6px] font-bold leading-none text-slate-400">
                          +{tagColors.length - 3}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="h-[3px] w-3 rounded-full bg-emerald-500/80" />
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
  onGoToDate,
  onMonthJump,
}: {
  activeDates: Set<string>;
  dateTagColors: Map<string, string[]>;
  selectedDate: string | null;
  focusedDate: string | null;
  onSelect: (d: string | null) => void;
  collapsed: boolean;
  cursor: Date;
  setCursor: (d: Date) => void;
  /** Opens the "go to date" picker and asks the caller to navigate. */
  onGoToDate?: (iso: string) => void;
  /** Fired after a horizontal slide commits to another month, so the caller
   *  can point the timeline at that month (e.g. its 1st). */
  onMonthJump?: (d: Date) => void;
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

  const goMonth = (dir: number, jump = false) => {
    if (settling) return;
    const W = slideRef.current?.offsetWidth ?? 320;
    suppressClick.current = true;
    commitDir.current = dir;
    setSettling(true);
    setDragX(dir > 0 ? -W : W);
    const target = new Date(year, month + dir, 1);
    setTimeout(() => {
      setCursor(target);
      setDragX(0);
      setSettling(false);
      if (jump) onMonthJump?.(target);
    }, 260);
    setTimeout(() => (suppressClick.current = false), 400);
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
    // Rubber-band resistance near the edges
    const clamped = Math.max(-W, Math.min(W, dx));
    const resistance = Math.abs(clamped) > W * 0.7 ? 1 - (Math.abs(clamped) - W * 0.7) / (W * 0.6) : 1;
    setDragX(clamped * resistance);
  };
  const onTouchEnd = () => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s || dragX === 0) return;
    const W = slideRef.current?.offsetWidth ?? 320;
    // Kept deliberately short so a light, quick swipe flips the month.
    const threshold = Math.max(18, W * 0.06);
    if (Math.abs(dragX) >= threshold) {
      goMonth(dragX < 0 ? 1 : -1, true);
    } else {
      setSettling(true);
      setDragX(0);
      setTimeout(() => setSettling(false), 220);
    }
  };

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const shortMonth = cursor.toLocaleDateString("en-US", { month: "short" });
  const shortYear = String(cursor.getFullYear());

  if (collapsed) {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm font-medium text-blue-900">
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-700">
            <rect x="3" y="4" width="18" height="18" rx="3" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {shortMonth} {shortYear}
        </span>
        <div className="flex items-center gap-2">
          <GoToDateButton
            initial={focusedDate ?? selectedDate ?? today}
            today={today}
            onGo={(iso) => onGoToDate?.(iso)}
          />
          {focusedDate && (
            <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 shadow-sm">
              {new Date(focusedDate + "T00:00:00").toLocaleDateString("en-GB", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Current month stays in-flow so height matches its week count. Prev/next
  // sit off-screen; a 6-week neighbour must not stretch a 5-week month.
  const rowTransform = `translateX(${dragX}px)`;

  const gridProps = { activeDates, dateTagColors, selectedDate, focusedDate, today, suppressClick, onSelect };
  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);

  return (
    <div className="px-3 pb-1.5 pt-1">
      {/* Header row */}
      <div className="mb-0.5 flex items-center justify-between">
        <button
          onClick={() => goMonth(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-blue-800 transition hover:bg-blue-100/80 active:scale-90"
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-2.5">
          <span className="text-[14px] font-bold tracking-tight text-blue-900">{monthLabel}</span>
          <GoToDateButton
            initial={focusedDate ?? selectedDate ?? today}
            today={today}
            onGo={(iso) => onGoToDate?.(iso)}
          />
        </div>
        <button
          onClick={() => goMonth(1)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-blue-800 transition hover:bg-blue-100/80 active:scale-90"
          aria-label="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-[2px] text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
          <div
            key={i}
            className={`pb-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              i === 0 || i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 3-month carousel */}
      <div
        ref={slideRef}
        className="overflow-hidden py-1"
        style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="relative"
          style={{
            transform: rowTransform,
            transition: settling
              ? "transform 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94)"
              : "none",
            willChange: "transform",
          }}
        >
          <div className="absolute top-0 right-full w-full">
            <MonthGrid month={prevMonth} {...gridProps} />
          </div>
          <MonthGrid month={cursor} {...gridProps} />
          <div className="absolute top-0 left-full w-full">
            <MonthGrid month={nextMonth} {...gridProps} />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "./DataProvider";
import { Chip } from "./ui";
import { dayName, toISODate, formatFootplateSummary, pcdoEntriesOf, pcdoWorkEntries, counterResetTotal } from "@/lib/api";
import { DEPARTMENT_COLORS } from "@/lib/types";
import { isSharedLog } from "@/lib/backup";
import { logMovementLabels } from "@/lib/movements";
import type { DailyLog } from "@/db/schema";

/** Build a continuous, descending list of ISO dates spanning all known data. */
function buildDateRange(
  logDates: string[],
  taskDates: string[],
  planDates: string[]
): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const all = [...logDates, ...taskDates, ...planDates].filter(Boolean).sort();

  // Newest boundary: furthest future planned date, or today (whichever later)
  const maxKnown = all.length ? new Date(all[all.length - 1] + "T00:00:00") : today;
  const end = maxKnown > today ? maxKnown : today;

  // Oldest boundary: earliest known date, or 45 days back (whichever earlier)
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 45);
  const minKnown = all.length ? new Date(all[0] + "T00:00:00") : defaultStart;
  const start = minKnown < defaultStart ? minKnown : defaultStart;

  const out: string[] = [];
  const cur = new Date(end);
  // Hard cap to keep DOM reasonable
  let guard = 0;
  while (cur >= start && guard < 1200) {
    out.push(toISODate(cur));
    cur.setDate(cur.getDate() - 1);
    guard++;
  }
  return out;
}

export function Timeline({
  selectedDate,
  goToSignal = 0,
  onOpen,
  onAddEntry,
  onVisibleDateChange,
}: {
  selectedDate: string | null;
  /** Increments each time the caller explicitly asks to navigate to a date, so
   *  the list re-scrolls even if selectedDate itself did not change. */
  goToSignal?: number;
  onOpen: (log: DailyLog) => void;
  /** Tapping a date row that has no daily log opens the add form for that date. */
  onAddEntry?: (iso: string) => void;
  onVisibleDateChange?: (iso: string) => void;
}) {
  const {
    logs: allLogs,
    tags,
    deficiencies: allDefs,
    planned: allPlans,
    stationName,
    inScopeStation,
    inScopeMovement,
  } = useData();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const suppressScroll = useRef(false);

  /**
   * Distance from the container's scroll origin to a row.
   * offsetTop is relative to the nearest *positioned* ancestor, which is not
   * necessarily the scroller — measuring rects avoids that mismatch entirely.
   */
  const [spacer, setSpacer] = useState(400);

  function offsetOf(el: HTMLElement, container: HTMLElement) {
    return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  }

  // Scope to the stations mapped to the signed-in staff member
  // Shared records are already station-scoped by the server
  const logs = useMemo(
    () => allLogs.filter((l) => isSharedLog(l) || inScopeMovement(l.stationMovement)),
    [allLogs, inScopeMovement]
  );
  const deficiencies = useMemo(() => allDefs.filter((d) => inScopeStation(d.stationId)), [allDefs, inScopeStation]);
  const planned = useMemo(() => allPlans.filter((p) => inScopeStation(p.stationId)), [allPlans, inScopeStation]);

  const dates = useMemo(
    () =>
      buildDateRange(
        logs.map((l) => l.logDate),
        deficiencies.map((d) => d.dueDate ?? ""),
        planned.map((p) => p.plannedDate)
      ),
    [logs, deficiencies, planned]
  );

  const todayIso = toISODate(new Date());
  const tagById = (id: number) => tags.find((t) => t.id === id);

  // Group data by date for O(1) lookup
  const byDate = useMemo(() => {
    const m = new Map<string, { logs: DailyLog[]; defs: typeof deficiencies; plans: typeof planned }>();
    const get = (d: string) => {
      if (!m.has(d)) m.set(d, { logs: [], defs: [], plans: [] });
      return m.get(d)!;
    };
    for (const l of logs) get(l.logDate).logs.push(l);
    for (const d of deficiencies) if (d.dueDate) get(d.dueDate).defs.push(d);
    for (const p of planned) get(p.plannedDate).plans.push(p);
    return m;
  }, [logs, deficiencies, planned]);

  // Scroll the picked date to the very top so it sits directly under the calendar.
  // While the smooth scroll runs, suppress the scroll handler so it can't report a
  // different date and knock the calendar highlight off the one just tapped.
  useEffect(() => {
    if (!selectedDate) return;
    const el = rowRefs.current[selectedDate];
    const container = scrollRef.current;
    if (!el || !container) return;

    suppressScroll.current = true;
    const target = Math.max(
      0,
      Math.min(offsetOf(el, container), container.scrollHeight - container.clientHeight)
    );
    container.scrollTo({ top: target, behavior: "smooth" });
    onVisibleDateChange?.(selectedDate);

    // Release once the animation has settled (or immediately if already there)
    let done = 0;
    const settle = setInterval(() => {
      if (Math.abs(container.scrollTop - target) < 2 || ++done > 20) {
        clearInterval(settle);
        suppressScroll.current = false;
      }
    }, 60);
    return () => {
      clearInterval(settle);
      suppressScroll.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, goToSignal]);

  // Keep the trailing spacer as tall as the viewport
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const apply = () => setSpacer(Math.max(120, container.clientHeight - 90));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // On mount, jump to today
  useEffect(() => {
    const el = rowRefs.current[todayIso];
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTop = Math.max(
        0,
        Math.min(offsetOf(el, container), container.scrollHeight - container.clientHeight)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length]);

  // Report the topmost visible date so the calendar can follow along
  function handleScroll() {
    const container = scrollRef.current;
    if (!container || !onVisibleDateChange) return;
    if (suppressScroll.current) return;
    const top = container.scrollTop;
    let best: string | null = null;
    for (const d of dates) {
      const el = rowRefs.current[d];
      if (!el) continue;
      // 2px tolerance for sub-pixel rounding during smooth scrolling
      if (offsetOf(el, container) <= top + 2) best = d;
      else break;
    }
    if (best) onVisibleDateChange(best);
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
      <div className="space-y-2.5 px-3 pb-2 pt-2">
        {dates.map((iso, i) => {
          const bucket = byDate.get(iso);
          const dayLogs = bucket?.logs ?? [];
          const dayDefs = bucket?.defs ?? [];
          const dayPlans = bucket?.plans ?? [];
          const isToday = iso === todayIso;
          const isSelected = iso === selectedDate;
          const empty = dayLogs.length === 0 && dayDefs.length === 0 && dayPlans.length === 0;
          // A date without any daily log is tappable: it opens the add form
          // for that date (true even when the day only shows deficiency /
          // planned-work lines).
          const addable = dayLogs.length === 0 && !!onAddEntry;
          const d = new Date(iso + "T00:00:00");

          return (
            <div
              key={iso}
              ref={(el) => {
                rowRefs.current[iso] = el;
              }}
              onClick={addable ? () => onAddEntry(iso) : undefined}
              style={{ animationDelay: `${Math.min(i, 16) * 40}ms` }}
              className={`card-rise relative flex gap-3 overflow-hidden rounded-2xl border bg-surface p-3 shadow-sm transition duration-300 ease-[cubic-bezier(0.32,0.72,0.28,1)] ${
                isSelected
                  ? "border-emerald-400 ring-2 ring-emerald-100 shadow-emerald-500/10"
                  : isToday
                    ? "border-blue-300 shadow-blue-500/10"
                    : "border-slate-200/80 hover:border-slate-300 hover:shadow"
              } ${addable ? "cursor-pointer active:scale-[0.99] active:bg-blue-50" : ""}`}
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${
                  isSelected ? "bg-emerald-400" : isToday ? "bg-gradient-to-b from-blue-500 to-blue-700" : "bg-transparent"
                }`}
                aria-hidden
              />
              <div className="flex w-[3.75rem] flex-shrink-0 flex-col items-center justify-center gap-1 self-stretch text-center">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide ${
                    isToday
                      ? "text-blue-700"
                      : d.getDay() === 0
                        ? "text-rose-600"
                        : d.getDay() === 6
                          ? "text-amber-600"
                          : "text-slate-700"
                  }`}
                >
                  {dayName(iso)}
                </span>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold transition duration-300 ${
                    isToday
                      ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md shadow-blue-500/30"
                      : isSelected
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className="text-[10px] font-medium text-slate-400">
                  {d.toLocaleDateString("en-US", { month: "short" })} {d.getFullYear()}
                </span>
                {isToday && (
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-blue-700">
                    TODAY
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {empty && (
                  addable ? (
                    <span className="flex items-center gap-1.5 py-2 text-sm font-semibold text-blue-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                      No entry — tap to add
                    </span>
                  ) : (
                    <p className="py-2 text-sm italic text-slate-400">No entry</p>
                  )
                )}

                {dayLogs.map((log) => {
                  const bundles = pcdoEntriesOf(log);
                  const discTotal = bundles.reduce(
                    (n, b) => n + b.discSpecialWork + b.discFailure + b.discMaintenance + b.discNotPermitted,
                    0
                  );
                  const hasDisc = discTotal > 0;
                  const counterTotal = counterResetTotal(log);
                  const hasCounter = counterTotal > 0;
                  const pcdoWorks = pcdoWorkEntries(log);
                  const hasPcdo = bundles.length > 0;
                  const shared = isSharedLog(log);
                  const movements = logMovementLabels(log);
                  const summary = shared
                    ? pcdoWorks
                        .map((w) => w.work)
                        .filter(Boolean)
                        .join(" · ") ||
                      (log.inspectionKind
                        ? `${log.inspectionKind} inspection at ${stationName(log.inspectionStationId)}`
                        : "Shared record")
                    : log.workDone?.trim() || log.stationMovement?.trim() || "No entry";
                  return (
                    <button
                      key={log.id}
                      onClick={() => onOpen(log)}
                      className="-mx-1.5 mb-1.5 block w-[calc(100%+0.75rem)] rounded-xl px-1.5 py-1.5 text-left transition duration-200 last:mb-0 hover:bg-slate-50 active:scale-[0.99] active:bg-slate-100"
                    >
                      {shared ? (
                        <p className="flex items-center gap-1 truncate text-xs font-semibold text-teal-700">
                          🔗 Shared ·{" "}
                          {stationName(bundles[0]?.stationId ?? log.pcdoStationId ?? log.inspectionStationId)}
                        </p>
                      ) : (
                        movements.length > 0 && (
                          <p className="mb-1 flex flex-wrap gap-1">
                            {movements.map((m) => (
                              <span
                                key={m}
                                className="entry-text-xs inline-flex rounded-full bg-gradient-to-r from-blue-50 to-sky-50 px-2.5 py-[3px] text-[11px] font-bold tracking-wide text-blue-800 shadow-sm ring-1 ring-inset ring-blue-100/80"
                              >
                                {m}
                              </span>
                            ))}
                          </p>
                        )
                      )}
                      <p className="entry-text-sm line-clamp-2 font-medium leading-snug text-slate-800">{summary}</p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {hasPcdo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100">
                            ⭐ PCDO
                          </span>
                        )}
                        {hasPcdo &&
                          pcdoWorks.map(
                            (w) =>
                              w.department && (
                                <span
                                  key={w.department}
                                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                                  style={{ backgroundColor: DEPARTMENT_COLORS[w.department] }}
                                >
                                  {w.department}
                                </span>
                              )
                          )}
                        {hasDisc && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-100">
                            ⚡ {discTotal} disc.
                          </span>
                        )}
                        {hasCounter && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 ring-1 ring-inset ring-teal-100">
                            🔢 {counterTotal} resets
                          </span>
                        )}
                        {log.inspectionKind && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-100">
                            🔁 {stationName(log.inspectionStationId)}
                            {log.inspectionKind !== "footplate" &&
                              (log.inspectionSide === "Both"
                                ? " → Both sides"
                                : log.inspectionTowardsStationId
                                  ? ` → ${stationName(log.inspectionTowardsStationId)} side`
                                  : "")}
                            {log.inspectionJointDept ? ` · ${log.inspectionJointDept}` : ""}
                            {log.footplateShift ? ` · ${formatFootplateSummary(log)}` : ""}
                          </span>
                        )}
                        {log.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                            📎 {log.attachments.length}
                          </span>
                        )}
                        {log.tagIds.map((id) => {
                          const t = tagById(id);
                          return t ? <Chip key={id} label={t.name} color={t.color} /> : null;
                        })}
                      </div>

                      {log.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {log.attachments.slice(0, 4).map((a, i) =>
                            a.type.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={a.dataUrl}
                                alt={a.name}
                                className="h-9 w-9 rounded-md border border-slate-200 object-cover"
                              />
                            ) : a.type === "application/pdf" ? (
                              <span
                                key={i}
                                className="flex max-w-[9rem] items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                              >
                                <span>PDF</span>
                                <span className="truncate">{a.name}</span>
                              </span>
                            ) : (
                              <span
                                key={i}
                                className="max-w-[7rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                              >
                                {a.name}
                              </span>
                            )
                          )}
                          {log.attachments.length > 4 && (
                            <span className="text-[10px] text-slate-400">
                              +{log.attachments.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}

                {(dayDefs.length > 0 || dayPlans.length > 0) && (
                  <div className={`space-y-1 ${dayLogs.length ? "mt-1.5 border-t border-slate-100 pt-2" : ""}`}>
                    {dayDefs.map((t) => (
                      <p
                        key={"d" + t.id}
                        className="entry-text-xs flex items-start gap-1.5 rounded-lg bg-amber-50/70 px-2 py-1 text-xs text-amber-900/80"
                      >
                        <span>
                          🔧 Deficiency due: <span className="font-semibold">{t.title}</span> ·{" "}
                          {stationName(t.stationId)} ({t.status})
                        </span>
                      </p>
                    ))}
                    {dayPlans.map((p) => (
                      <p
                        key={"p" + p.id}
                        className="entry-text-xs flex items-start gap-1.5 rounded-lg bg-emerald-50/70 px-2 py-1 text-xs text-emerald-900/80"
                      >
                        <span>
                          📅 Planned: <span className="font-semibold">{p.title}</span> ·{" "}
                          {stationName(p.stationId)} ({p.status})
                        </span>
                      </p>
                    ))}
                  </div>
                )}

                {addable && !empty && (
                  <p className="mt-1.5 flex items-center gap-1 border-t border-slate-100 pt-1.5 text-xs font-semibold text-blue-700">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add daily log for this date
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {/* Lets even the last date scroll flush to the top of the viewport */}
        <div style={{ height: spacer }} aria-hidden />
      </div>
    </div>
  );
}

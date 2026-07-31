"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "./DataProvider";
import { Chip } from "./ui";
import { dayName, toISODate } from "@/lib/api";
import { isSharedLog } from "@/lib/backup";
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
  onOpen,
  onVisibleDateChange,
}: {
  selectedDate: string | null;
  onOpen: (log: DailyLog) => void;
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
  }, [selectedDate]);

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
        {dates.map((iso) => {
          const bucket = byDate.get(iso);
          const dayLogs = bucket?.logs ?? [];
          const dayDefs = bucket?.defs ?? [];
          const dayPlans = bucket?.plans ?? [];
          const isToday = iso === todayIso;
          const isSelected = iso === selectedDate;
          const empty = dayLogs.length === 0 && dayDefs.length === 0 && dayPlans.length === 0;
          const d = new Date(iso + "T00:00:00");

          return (
            <div
              key={iso}
              ref={(el) => {
                rowRefs.current[iso] = el;
              }}
              className={`flex gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${
                isSelected
                  ? "border-emerald-400 ring-2 ring-emerald-200"
                  : isToday
                    ? "border-blue-300"
                    : "border-slate-200"
              }`}
            >
              {/* Left column: Day / Date / Time */}
              <div className="flex w-16 flex-shrink-0 flex-col items-center border-r border-slate-100 pr-2 text-center">
                <span className="text-xs font-semibold uppercase text-emerald-700">{dayName(iso)}</span>
                <span className={`text-2xl font-bold ${isToday ? "text-blue-700" : "text-blue-900"}`}>
                  {d.getDate()}
                </span>
                <span className="text-[10px] text-slate-400">
                  {d.toLocaleDateString("en-US", { month: "short" })} {d.getFullYear()}
                </span>
                {isToday && (
                  <span className="mt-1 rounded-full bg-blue-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    TODAY
                  </span>
                )}
                {dayLogs[0] && (
                  <span className="mt-1 text-[10px] text-slate-400">
                    {new Date(dayLogs[0].createdAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>

              {/* Main content */}
              <div className="min-w-0 flex-1">
                {empty && <p className="py-3 text-sm italic text-slate-400">No entry</p>}

                {dayLogs.map((log) => {
                  const discTotal =
                    log.discSpecialWork + log.discFailure + log.discMaintenance;
                  const hasDisc = log.hasDisconnections && discTotal > 0;
                  const hasPcdo = Boolean(log.pcdoWork && log.pcdoWork.trim());
                  const shared = isSharedLog(log);
                  const summary = shared
                    ? log.pcdoWork?.trim() ||
                      (log.inspectionKind
                        ? `${log.inspectionKind} inspection at ${stationName(log.inspectionStationId)}`
                        : "Shared record")
                    : log.workDone?.trim() || log.stationMovement?.trim() || "No entry";
                  return (
                    <button
                      key={log.id}
                      onClick={() => onOpen(log)}
                      className="mb-2 block w-full border-b border-slate-100 pb-2 text-left last:mb-0 last:border-0 last:pb-0"
                    >
                      {shared ? (
                        <p className="truncate text-xs font-medium text-teal-700">
                          🔗 Shared ·{" "}
                          {stationName(log.pcdoStationId ?? log.inspectionStationId)}
                        </p>
                      ) : (
                        log.stationMovement && (
                          <p className="truncate text-xs font-medium text-blue-800">
                            {log.stationMovement}
                          </p>
                        )
                      )}
                      <p className="line-clamp-2 text-sm text-slate-800">{summary}</p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {hasPcdo && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            ⭐ PCDO
                          </span>
                        )}
                        {hasDisc && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            ⚡ {discTotal} disc.
                          </span>
                        )}
                        {log.inspectionKind && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                            🔁 {stationName(log.inspectionStationId)}
                            {log.inspectionKind !== "footplate" &&
                              ` → ${stationName(log.inspectionTowardsStationId)}`}
                            {log.inspectionJointDept ? ` · ${log.inspectionJointDept}` : ""}
                            {log.footplateShift ? ` · ${log.footplateShift}` : ""}
                            {log.footplateDirection ? ` ${log.footplateDirection}` : ""}
                          </span>
                        )}
                        {log.attachments.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            📎 {log.attachments.length}
                          </span>
                        )}
                        {log.tagIds.map((id) => {
                          const t = tagById(id);
                          return t ? <Chip key={id} label={t.name} color={t.color} /> : null;
                        })}
                      </div>
                    </button>
                  );
                })}

                {(dayDefs.length > 0 || dayPlans.length > 0) && (
                  <div className={`space-y-1 ${dayLogs.length ? "border-t border-slate-100 pt-2" : ""}`}>
                    {dayDefs.map((t) => (
                      <p key={"d" + t.id} className="text-xs text-slate-500">
                        🔧 Deficiency due:{" "}
                        <span className="font-medium text-slate-700">{t.title}</span> ·{" "}
                        {stationName(t.stationId)} ({t.status})
                      </p>
                    ))}
                    {dayPlans.map((p) => (
                      <p key={"p" + p.id} className="text-xs text-slate-500">
                        📅 Planned: <span className="font-medium text-slate-700">{p.title}</span> ·{" "}
                        {stationName(p.stationId)} ({p.status})
                      </p>
                    ))}
                  </div>
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

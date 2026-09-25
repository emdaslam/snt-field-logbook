"use client";

import { useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from "react";
import { useData } from "./DataProvider";
import { TomorrowWorkModal } from "./TomorrowWorkModal";
import { PcdoExportModal } from "./PcdoExportModal";
import { DiaryExportModal } from "./DiaryExportModal";
import { InspectionExportModal } from "./InspectionExportModal";
import { PeriodPicker, monthPeriod, type Period } from "./PeriodPicker";
import { getPcdoPeriod } from "@/lib/pcdo";
import { useBackClose } from "@/lib/backButton";
import { fmtDate, pcdoEntriesOf, pcdoWorkEntries, counterResetsOf, counterResetTotal, isTaClaimable, logStationNames } from "@/lib/api";
import { StatDetailModal, type StatRow } from "./StatDetailModal";
import { computeAllSchedules, expandInspectionRecords, INSPECTION_RULES, isGenericSideLabel, sideAskingKinds, tagReminderConfigs, cap } from "@/lib/inspections";
import type { DailyLog, DeficiencyTask, PlannedWork } from "@/db/schema";

export function Reports({
  onOpenMonthly,
  onOpenLog,
  onOpenDef,
  onOpenPlan,
  onDrillChange,
  drillCloseRef,
}: {
  onOpenMonthly: () => void;
  onOpenLog: (l: DailyLog) => void;
  onOpenDef: (d: DeficiencyTask) => void;
  onOpenPlan: (p: PlannedWork) => void;
  onDrillChange?: (open: boolean) => void;
  drillCloseRef?: MutableRefObject<() => void>;
}) {
  const { logs, deficiencies, planned, stations, stationName, tags, currentUser, footplateReminder, jointReminder } = useData();
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [pcdoOpen, setPcdoOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [taOpen, setTaOpen] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(() => monthPeriod(0));
  const [custom, setCustom] = useState(false);
  const [drill, setDrill] = useState<{ title: string; rows: StatRow[]; footer?: string } | null>(null);

  useEffect(() => {
    onDrillChange?.(Boolean(drill));
    return () => onDrillChange?.(false);
  }, [drill, onDrillChange]);

  useEffect(() => {
    if (!drillCloseRef) return;
    drillCloseRef.current = () => setDrill(null);
  }, [drillCloseRef]);

  // The native back key closes these export modals instead of navigating away
  useBackClose(tomorrowOpen || pcdoOpen || diaryOpen || taOpen || inspOpen, () => {
    if (tomorrowOpen) setTomorrowOpen(false);
    else if (pcdoOpen) setPcdoOpen(false);
    else if (diaryOpen) setDiaryOpen(false);
    else if (taOpen) setTaOpen(false);
    else setInspOpen(false);
  });

  function openRow(row: StatRow) {
    if (row.logId != null) {
      const l = logs.find((x) => x.id === row.logId);
      if (l) onOpenLog(l);
      return;
    }
    if (row.defId != null) {
      const d = deficiencies.find((x) => x.id === row.defId);
      if (d) onOpenDef(d);
      return;
    }
    if (row.planId != null) {
      const p = planned.find((x) => x.id === row.planId);
      if (p) onOpenPlan(p);
    }
  }

  const inRange = (d: string | null | undefined) => !!d && d >= period.from && d <= period.to;

  const hq = stations.find((s) => s.id === currentUser?.headquartersStationId);

  const stats = useMemo(() => {
    const pLogs = logs.filter((l) => inRange(l.logDate));
    const pDefs = deficiencies.filter(
      (d) => inRange(d.dueDate) || inRange((d.createdAt ? String(d.createdAt) : "").slice(0, 10))
    );
    const pPlans = planned.filter((p) => inRange(p.plannedDate));

    const disc = pLogs.reduce(
      (a, l) => {
        for (const b of pcdoEntriesOf(l)) {
          a.sw += b.discSpecialWork;
          a.fa += b.discFailure;
          a.mt += b.discMaintenance;
          a.np += b.discNotPermitted;
        }
        return a;
      },
      { sw: 0, fa: 0, mt: 0, np: 0 }
    );

    const counter = pLogs.reduce((n, l) => n + counterResetTotal(l), 0);

    // Station-wise breakdown of logs in the period — a multi-movement day
    // counts under every stop (primary + extraStops), not only the first.
    const byStation = new Map<string, number>();
    for (const l of pLogs) {
      for (const k of logStationNames(l, stations)) {
        byStation.set(k, (byStation.get(k) ?? 0) + 1);
      }
    }

    return {
      pLogs,
      pDefs,
      pPlans,
      logs: pLogs.length,
      ta: pLogs.reduce((s, l) => s + (isTaClaimable(l, stations, hq) ? (l.taPercent ?? 100) / 100 : 0), 0),
      pcdo: pLogs.reduce((n, l) => n + pcdoWorkEntries(l).length, 0),
      leaves: pLogs.filter((l) => l.movementKind === "leave").length,
      defPending: pDefs.filter((d) => d.status === "Pending").length,
      defDone: pDefs.filter((d) => d.status === "Completed").length,
      planPending: pPlans.filter((p) => p.status === "Pending").length,
      planDone: pPlans.filter((p) => p.status === "Completed").length,
      disc,
      discTotal: disc.sw + disc.fa + disc.mt + disc.np,
      counter,
      byStation: [...byStation.entries()].sort((a, b) => b[1] - a[1]),
      attachments: pLogs.reduce((n, l) => n + l.attachments.length, 0),
    };
  }, [logs, deficiencies, planned, stations, period, hq]);

  const pcdoPeriod = getPcdoPeriod();
  const schedules = useMemo(
    () =>
      computeAllSchedules(expandInspectionRecords(logs), undefined, (r) => {
        const at = stations.find((s) => s.id === r.inspectionStationId);
        const tw = stations.find((s) => s.id === r.inspectionTowardsStationId);
        return {
          id: at?.id ?? null,
          name: at?.name ?? ((r.stationMovement || "").trim() || "Unspecified station"),
          towardsId: tw?.id ?? null,
          towards:
            r.inspectionSide === "Both"
              ? "Both sides"
              : tw?.name ?? "Unspecified side",
        };
      }, tagReminderConfigs(tags), footplateReminder, sideAskingKinds(tags), jointReminder),
    [logs, stations, tags, footplateReminder, jointReminder]
  );

  return (
    <div className="space-y-4 p-4 pb-24">
      <PeriodPicker period={period} onChange={setPeriod} custom={custom} setCustom={setCustom} />

      <p className="-mt-2 px-1 text-xs text-slate-500">
        Showing <strong className="text-slate-700">{period.label}</strong> · {fmtDate(period.from)} — {fmtDate(period.to)}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Daily Logs"
          value={stats.logs}
          color="#2563eb"
          onClick={() =>
            setDrill({
              title: "Daily Logs",
              rows: stats.pLogs.map((l) => ({
                key: "l" + l.id,
                date: l.logDate,
                title: l.workDone?.trim() || l.stationMovement?.trim() || "No entry",
                sub: l.stationMovement ?? undefined,
                badge: `${l.taPercent ?? 100}%`,
                logId: l.id,
              })),
            })
          }
        />
        <Stat
          label="Total TA (days)"
          value={stats.ta.toFixed(1)}
          color="#059669"
          onClick={() =>
            setDrill({
              title: "TA Claimed",
              rows: stats.pLogs.filter((l) => isTaClaimable(l, stations, hq)).map((l) => ({
                key: "ta" + l.id,
                date: l.logDate,
                title: l.stationMovement?.trim() || "—",
                sub: l.workDone ?? undefined,
                badge: `${l.taPercent ?? 100}%`,
                logId: l.id,
              })),
              footer: `Total: ${stats.ta.toFixed(1)} days`,
            })
          }
        />
        <Stat
          label="PCDO Special Works"
          value={stats.pcdo}
          color="#4f46e5"
          onClick={() =>
            setDrill({
              title: "PCDO Special Works",
              rows: stats.pLogs.flatMap((l) =>
                pcdoEntriesOf(l).flatMap((b, bi) =>
                  b.works.map((w) => ({
                    key: "p" + l.id + "-" + bi + w.department,
                    date: l.pcdoDate || l.logDate,
                    title: w.work,
                    sub: w.department
                      ? `${w.department} · ${b.stationId ? stationName(b.stationId) : "no station"}`
                      : b.stationId
                        ? stationName(b.stationId)
                        : undefined,
                    logId: l.id,
                  }))
                )
              ),
            })
          }
        />
        <Stat
          label="Disconnections"
          value={stats.discTotal}
          color="#b45309"
          onClick={() =>
            setDrill({
              title: "Disconnections",
              rows: stats.pLogs.flatMap((l) =>
                pcdoEntriesOf(l)
                  .filter(
                    (b) =>
                      b.discSpecialWork + b.discFailure + b.discMaintenance + b.discNotPermitted > 0
                  )
                  .map((b, bi) => ({
                    key: "d" + l.id + "-" + bi,
                    date: l.logDate,
                    title: b.stationId ? stationName(b.stationId) : l.stationMovement?.trim() || "—",
                    sub: `Special work ${b.discSpecialWork} · Failure ${b.discFailure} · Maintenance ${b.discMaintenance} · Not permitted ${b.discNotPermitted}`,
                    badge: `${b.discSpecialWork + b.discFailure + b.discMaintenance + b.discNotPermitted}`,
                    logId: l.id,
                  }))
              ),
              footer: `Total: ${stats.discTotal} disconnections`,
            })
          }
        />
        <Stat
          label="Counter Resets"
          value={stats.counter}
          color="#0d9488"
          onClick={() =>
            setDrill({
              title: "Counter Resets",
              rows: stats.pLogs.flatMap((l) =>
                pcdoEntriesOf(l).flatMap((b, bi) =>
                  b.counterResets.map((r, ri) => ({
                    key: "cr" + l.id + "-" + bi + "-" + ri,
                    date: l.logDate,
                    title: `${r.equipment} — ${
                      r.equipment === "MSDAC"
                        ? stationName(b.stationId)
                        : `${r.stationId ? stationName(r.stationId) : stationName(b.stationId)} - ${stationName(r.nextStationId)}`
                    }`,
                    sub: `Failures ${r.failures} · Testing ${r.testing}`,
                    badge: `${r.failures + r.testing}`,
                    logId: l.id,
                  }))
                )
              ),
              footer: `Total: ${stats.counter} counter resets`,
            })
          }
        />
        <Stat
          label="Leaves"
          value={stats.leaves}
          color="#db2777"
          onClick={() =>
            setDrill({
              title: "Leaves",
              rows: stats.pLogs
                .filter((l) => l.movementKind === "leave")
                .map((l) => ({
                  key: "lv" + l.id,
                  date: l.logDate,
                  title: l.stationMovement?.trim() || "Leave",
                  sub: l.leaveKind ? `Leave type: ${l.leaveKind}` : undefined,
                  logId: l.id,
                })),
              footer: `Total: ${stats.leaves} leave${stats.leaves === 1 ? "" : "s"}`,
            })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Deficiencies Pending"
          value={stats.defPending}
          color="#dc2626"
          onClick={() =>
            setDrill({
              title: "Deficiencies Pending",
              rows: stats.pDefs
                .filter((d) => d.status === "Pending")
                .map((d) => ({
                  key: "dp" + d.id,
                  date: d.dueDate || String(d.createdAt).slice(0, 10),
                  title: d.title,
                  sub: `${d.department} · ${stationName(d.stationId)}`,
                  badge: d.priority,
                  defId: d.id,
                })),
            })
          }
        />
        <Stat
          label="Deficiencies Done"
          value={stats.defDone}
          color="#0e7490"
          onClick={() =>
            setDrill({
              title: "Deficiencies Completed",
              rows: stats.pDefs
                .filter((d) => d.status === "Completed")
                .map((d) => ({
                  key: "dd" + d.id,
                  date: d.dueDate || String(d.createdAt).slice(0, 10),
                  title: d.title,
                  sub: `${d.department} · ${stationName(d.stationId)}`,
                  defId: d.id,
                })),
            })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Planned Pending"
          value={stats.planPending}
          color="#7c3aed"
          onClick={() =>
            setDrill({
              title: "Planned Works Pending",
              rows: stats.pPlans
                .filter((p) => p.status === "Pending")
                .map((p) => ({
                  key: "pp" + p.id,
                  date: p.plannedDate,
                  title: p.title,
                  sub: stationName(p.stationId),
                  planId: p.id,
                })),
            })
          }
        />
        <Stat
          label="Planned Done"
          value={stats.planDone}
          color="#0e7490"
          onClick={() =>
            setDrill({
              title: "Planned Works Completed",
              rows: stats.pPlans
                .filter((p) => p.status === "Completed")
                .map((p) => ({
                  key: "pd" + p.id,
                  date: p.plannedDate,
                  title: p.title,
                  sub: stationName(p.stationId),
                  planId: p.id,
                })),
            })
          }
        />
      </div>

      {stats.discTotal > 0 && (
        <div className="card-rise overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-900">
            Disconnections Breakdown
          </h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Mini label="Special Work" value={stats.disc.sw} />
            <Mini label="Failure" value={stats.disc.fa} />
            <Mini label="Maintenance" value={stats.disc.mt} />
            <Mini label="Not Permitted" value={stats.disc.np} />
          </div>
        </div>
      )}

      {stats.counter > 0 && (
        <div className="card-rise overflow-hidden rounded-2xl border border-teal-200/80 bg-teal-50/80 p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-teal-900">
            Counter Resets Breakdown
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-teal-900">
            {(() => {
              const per = new Map<string, { fa: number; tt: number }>();
              for (const l of stats.pLogs) {
                for (const r of counterResetsOf(l)) {
                  const prev = per.get(r.equipment) ?? { fa: 0, tt: 0 };
                  prev.fa += r.failures;
                  prev.tt += r.testing;
                  per.set(r.equipment, prev);
                }
              }
              return [...per.entries()].map(([eq, e]) => (
                <span key={eq}>
                  <strong>{eq}</strong>: {e.fa + e.tt}{" "}
                  <span className="text-xs text-teal-700">(failures {e.fa} · testing {e.tt})</span>
                </span>
              ));
            })()}
          </div>
        </div>
      )}

      {stats.byStation.length > 0 && (
        <div className="card-rise overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-900">
            Logs by Station
          </h3>
          <ul className="divide-y divide-slate-100">
            {stats.byStation.map(([name, count]) => (
              <li key={name}>
                <button
                  onClick={() =>
                    setDrill({
                      title: `Logs — ${name}`,
                      rows: stats.pLogs
                        .filter((l) => logStationNames(l, stations).includes(name))
                        .map((l) => ({
                          key: "s" + l.id,
                          date: l.logDate,
                          title: l.workDone?.trim() || "No entry",
                          badge: `${l.taPercent ?? 100}%`,
                          logId: l.id,
                        })),
                    })
                  }
                  className="group flex w-full items-center justify-between rounded-xl py-2 pl-1 pr-0.5 text-left text-sm transition hover:bg-blue-50/70 active:scale-[0.99]"
                >
                  <span className="truncate text-slate-700 group-hover:text-blue-800">{name}</span>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-bold tabular-nums text-blue-800 ring-1 ring-inset ring-blue-100">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedules.length > 0 && (
        <div className="card-rise overflow-hidden rounded-2xl border border-sky-200/80 bg-surface p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-900">
            Inspection Schedule
          </h3>
          <ul className="divide-y divide-slate-100">
            {schedules.map((d) => {
              const log = d.sourceLogId != null ? logs.find((x) => x.id === d.sourceLogId) : undefined;
              const body = (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {INSPECTION_RULES[d.kind].label} · {d.station}
                      {d.kind === "footplate"
                        ? ` — ${[d.fpShift, d.fpDir].filter(Boolean).join(" ")}`
                        : ` → ${isGenericSideLabel(d.towards)
                          ? d.towards.toLowerCase()
                          : `towards ${d.towards}${d.towards === "Both sides" ? "" : " side"}`}`}
                      {d.jointDept ? ` (with ${d.jointDept})` : ""}
                      {d.kind === "joint" && d.periodicity ? ` · ${cap(d.periodicity)} cycle` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      Last {d.lastDone} → next {d.nextDue}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      d.overdue
                        ? "bg-red-100 text-red-700"
                        : d.daysLeft <= 5
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {d.overdue ? `${Math.abs(d.daysLeft)}d overdue` : `in ${d.daysLeft}d`}
                  </span>
                </>
              );
              return (
                <li key={d.key}>
                  {log ? (
                    <button
                      type="button"
                      onClick={() => onOpenLog(log)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl py-2 text-left transition hover:bg-sky-50/70 hover:text-blue-700 active:scale-[0.99]"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card-rise overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-sm">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-blue-900">Generate Reports</h3>
        <div className="flex flex-col gap-2">
          <ExportBtn color="#2563eb" glyph="📄" onClick={() => setTomorrowOpen(true)}>
            Export Tomorrow&apos;s Work (PDF)
          </ExportBtn>
          <ExportBtn color="#1e40af" glyph="🗓️" onClick={onOpenMonthly}>
            Export Monthly List (with filters)
          </ExportBtn>
          <ExportBtn color="#4f46e5" glyph="⭐" onClick={() => setPcdoOpen(true)}>
            Export PCDO — Special Works ({pcdoPeriod.label})
          </ExportBtn>
          <ExportBtn color="#059669" glyph="📔" onClick={() => setDiaryOpen(true)}>
            Export Diary (movement, TA &amp; work done)
          </ExportBtn>
          <ExportBtn color="#d97706" glyph="💰" onClick={() => setTaOpen(true)}>
            Export TA Journal (with summary)
          </ExportBtn>
          <ExportBtn color="#0284c7" glyph="🔁" onClick={() => setInspOpen(true)}>
            Export Inspections (monthly / quarterly / maintenance)
          </ExportBtn>
        </div>
      </div>

      <TomorrowWorkModal open={tomorrowOpen} onClose={() => setTomorrowOpen(false)} />
      <PcdoExportModal open={pcdoOpen} onClose={() => setPcdoOpen(false)} />
      <DiaryExportModal open={diaryOpen} onClose={() => setDiaryOpen(false)} initialMode="diary" />
      <DiaryExportModal open={taOpen} onClose={() => setTaOpen(false)} initialMode="ta" />
      <InspectionExportModal open={inspOpen} onClose={() => setInspOpen(false)} />
      <StatDetailModal
        open={Boolean(drill)}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ""}
        rows={drill?.rows ?? []}
        footer={drill?.footer}
        onOpenRow={openRow}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string | number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="card-rise relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-4 text-left shadow-sm transition enabled:hover:border-blue-300 enabled:hover:shadow-md enabled:active:scale-[0.98]"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} aria-hidden />
      <p className="pl-1 text-2xl font-bold tracking-tight" style={{ color }}>
        {value}
      </p>
      <p className="pl-1 text-xs font-medium text-slate-500">{label}</p>
      {onClick && (
        <p className="mt-1 flex items-center gap-0.5 pl-1 text-[10px] font-semibold text-blue-500">
          Tap for details
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </p>
      )}
    </button>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface py-2 shadow-sm ring-1 ring-black/5">
      <p className="text-xl font-bold text-amber-900">{value}</p>
      <p className="text-[10px] font-medium text-amber-700">{label}</p>
    </div>
  );
}

function ExportBtn({
  color,
  glyph,
  onClick,
  children,
}: {
  color: string;
  glyph: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-surface p-3 text-left shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
    >
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg leading-none"
        style={{ backgroundColor: color + "1f" }}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{children}</span>
      <svg className="flex-shrink-0 text-slate-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

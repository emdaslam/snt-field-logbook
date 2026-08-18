"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Chip, Highlight } from "./ui";
import { fmtDate } from "@/lib/api";
import { DEPARTMENTS, PRIORITIES, STATUSES, DEPARTMENT_COLORS, PRIORITY_COLORS } from "@/lib/types";
import type { DailyLog, DeficiencyTask, PlannedWork, Note } from "@/db/schema";

type ResultType = "Log" | "Deficiency" | "Planned Work" | "Note";

export function SearchView({
  onOpenLog,
  onOpenDef,
  onOpenPlan,
  onOpenNote,
}: {
  onOpenLog: (l: DailyLog) => void;
  onOpenDef: (d: DeficiencyTask) => void;
  onOpenPlan: (p: PlannedWork) => void;
  onOpenNote: (n: Note) => void;
}) {
  const { logs, deficiencies, planned, notes, noteCategories, tags, stations, staff, stationName } = useData();
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState<ResultType | "">("");
  const [stationF, setStationF] = useState<number | "">("");
  const [deptF, setDeptF] = useState("");
  const [prioF, setPrioF] = useState("");
  const [tagF, setTagF] = useState<number | "">("");
  const [statusF, setStatusF] = useState("");
  const [staffF, setStaffF] = useState<number | "">("");
  const [attachF, setAttachF] = useState(false);

  const results = useMemo(() => {
    const ql = q.toLowerCase();
    type R = {
      key: string;
      type: ResultType;
      id: number;
      title: string;
      sub: string;
      chips: { label: string; color: string }[];
      date: string;
    };
    const out: R[] = [];

    if (!typeF || typeF === "Log") {
      for (const l of logs) {
        if (stationF && !l.stationMovement?.includes(stationName(stationF as number))) continue;
        if (tagF && !l.tagIds.includes(tagF as number)) continue;
        if (attachF && (!l.attachments || l.attachments.length === 0)) continue;
        if (deptF || prioF || statusF || staffF) continue;
        const text = `${l.stationMovement ?? ""} ${l.workDone ?? ""} ${l.attachments
          ?.map((a) => a.name)
          .join(" ")}`.toLowerCase();
        if (ql && !text.includes(ql)) continue;
        out.push({
          key: "l" + l.id,
          type: "Log",
          id: l.id,
          title: l.stationMovement || "Daily Log",
          sub: l.workDone || "No work done",
          chips: [
            ...l.tagIds.map((id) => {
              const t = tags.find((x) => x.id === id);
              return { label: t?.name ?? "", color: t?.color ?? "#2563eb" };
            }),
            ...(l.attachments && l.attachments.length
              ? [{ label: `📎 ${l.attachments.length} attachment${l.attachments.length !== 1 ? "s" : ""}`, color: "#0d9488" }]
              : []),
          ],
          date: l.logDate,
        });
      }
    }
    if ((!typeF || typeF === "Deficiency") && !attachF) {
      for (const d of deficiencies) {
        if (stationF && d.stationId !== stationF) continue;
        if (deptF && d.department !== deptF) continue;
        if (prioF && d.priority !== prioF) continue;
        if (statusF && d.status !== statusF) continue;
        if (staffF && d.assignedStaffId !== staffF) continue;
        if (tagF) continue;
        const text = `${d.title} ${d.description ?? ""}`.toLowerCase();
        if (ql && !text.includes(ql)) continue;
        out.push({
          key: "d" + d.id,
          type: "Deficiency",
          id: d.id,
          title: d.title,
          sub: d.description || "",
          chips: [
            { label: d.department, color: DEPARTMENT_COLORS[d.department] ?? "#2563eb" },
            { label: d.priority, color: PRIORITY_COLORS[d.priority] ?? "#2563eb" },
            { label: d.status, color: d.status === "Completed" ? "#059669" : "#b45309" },
          ],
          date: d.dueDate ?? "",
        });
      }
    }
    if ((!typeF || typeF === "Planned Work") && !attachF) {
      for (const p of planned) {
        if (stationF && p.stationId !== stationF) continue;
        if (statusF && p.status !== statusF) continue;
        if (deptF || prioF || tagF || staffF) continue;
        const text = `${p.title} ${p.description ?? ""} ${p.materialRemarks ?? ""}`.toLowerCase();
        if (ql && !text.includes(ql)) continue;
        out.push({
          key: "p" + p.id,
          type: "Planned Work",
          id: p.id,
          title: p.title,
          sub: p.description || "",
          chips: [
            { label: "Planned " + fmtDate(p.plannedDate), color: "#059669" },
            { label: p.status, color: p.status === "Completed" ? "#059669" : "#b45309" },
          ],
          date: p.plannedDate,
        });
      }
    }
    if (!typeF || typeF === "Note") {
      for (const n of notes) {
        if (stationF && n.stationId !== stationF) continue;
        if (deptF || prioF || tagF || statusF || staffF || attachF) continue;
        const text = `${n.title} ${n.body ?? ""}`.toLowerCase();
        if (ql && !text.includes(ql)) continue;
        const cat = noteCategories.find((c) => c.name === n.category);
        out.push({
          key: "n" + n.id,
          type: "Note",
          id: n.id,
          title: n.title,
          sub: n.body || "",
          chips: [
            { label: n.category, color: cat?.color ?? "#64748b" },
            ...(n.stationId ? [{ label: stationName(n.stationId), color: "#0e7490" }] : []),
            ...(n.pinned ? [{ label: "Pinned", color: "#f59e0b" }] : []),
            ...(n.refDate ? [{ label: fmtDate(n.refDate), color: "#7c3aed" }] : []),
          ],
          date: n.refDate ?? "",
        });
      }
    }
    return out;
  }, [q, typeF, stationF, deptF, prioF, tagF, statusF, staffF, attachF, logs, deficiencies, planned, notes, noteCategories, tags, stationName]);

  const selCls = "w-full min-w-0 rounded-full border border-slate-300 bg-surface px-2.5 py-1 text-xs text-slate-700";

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-slate-50 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search logs, tasks, notes & planned works…"
          className="w-full rounded-full border border-slate-300 bg-surface px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        <div className="grid grid-cols-3 gap-2">
          <select className={selCls} value={typeF} onChange={(e) => setTypeF(e.target.value as ResultType | "")}>
            <option value="">All Types</option>
            <option>Log</option>
            <option>Deficiency</option>
            <option>Planned Work</option>
            <option>Note</option>
          </select>
          <select className={selCls} value={stationF} onChange={(e) => setStationF(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All Stations</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={selCls} value={deptF} onChange={(e) => setDeptF(e.target.value)}>
            <option value="">All Depts</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className={selCls} value={prioF} onChange={(e) => setPrioF(e.target.value)}>
            <option value="">Any Priority</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className={selCls} value={tagF} onChange={(e) => setTagF(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Any Tag</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className={selCls} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="">Any Status</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className={selCls} value={staffF} onChange={(e) => setStaffF(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Any Staff</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            className={`w-full min-w-0 rounded-full border px-2.5 py-1 text-xs transition ${
              attachF
                ? "border-emerald-500 bg-emerald-500 font-semibold text-white shadow-sm"
                : "border-slate-300 bg-surface text-slate-700"
            }`}
            onClick={() => setAttachF((v) => !v)}
          >
            📎 Has attachments
          </button>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-xs text-slate-400">{results.length} result{results.length !== 1 ? "s" : ""}</p>
        {results.map((r) => (
          <button
            key={r.key}
            onClick={() => {
              if (r.type === "Log") {
                const l = logs.find((x) => x.id === r.id);
                if (l) onOpenLog(l);
              } else if (r.type === "Deficiency") {
                const d = deficiencies.find((x) => x.id === r.id);
                if (d) onOpenDef(d);
              } else if (r.type === "Note") {
                const n = notes.find((x) => x.id === r.id);
                if (n) onOpenNote(n);
              } else {
                const p = planned.find((x) => x.id === r.id);
                if (p) onOpenPlan(p);
              }
            }}
            className="block w-full rounded-xl border border-slate-200 bg-surface p-3 text-left shadow-sm transition hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">{r.type}</span>
              {r.date && <span className="text-xs text-slate-400">{fmtDate(r.date)}</span>}
            </div>
            <p className="mt-0.5 font-semibold text-slate-800">
              <Highlight text={r.title} query={q} />
            </p>
            {r.sub && (
              <p className="text-sm text-slate-500">
                <Highlight text={r.sub} query={q} />
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.chips.filter((c) => c.label).map((c, i) => <Chip key={i} label={c.label} color={c.color} />)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

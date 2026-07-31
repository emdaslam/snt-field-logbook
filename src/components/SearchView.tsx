"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Chip } from "./ui";
import { fmtDate } from "@/lib/api";
import { DEPARTMENTS, PRIORITIES, STATUSES, DEPARTMENT_COLORS, PRIORITY_COLORS } from "@/lib/types";

type ResultType = "Log" | "Deficiency" | "Planned Work";

export function SearchView() {
  const { logs, deficiencies, planned, tags, stations, staff, stationName } = useData();
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState<ResultType | "">("");
  const [stationF, setStationF] = useState<number | "">("");
  const [deptF, setDeptF] = useState("");
  const [prioF, setPrioF] = useState("");
  const [tagF, setTagF] = useState<number | "">("");
  const [statusF, setStatusF] = useState("");
  const [staffF, setStaffF] = useState<number | "">("");

  const results = useMemo(() => {
    const ql = q.toLowerCase();
    type R = {
      key: string;
      type: ResultType;
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
        if (deptF || prioF || statusF || staffF) continue;
        const text = `${l.stationMovement ?? ""} ${l.workDone ?? ""}`.toLowerCase();
        if (ql && !text.includes(ql)) continue;
        out.push({
          key: "l" + l.id,
          type: "Log",
          title: l.stationMovement || "Daily Log",
          sub: l.workDone || "No work done",
          chips: l.tagIds.map((id) => {
            const t = tags.find((x) => x.id === id);
            return { label: t?.name ?? "", color: t?.color ?? "#2563eb" };
          }),
          date: l.logDate,
        });
      }
    }
    if (!typeF || typeF === "Deficiency") {
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
    if (!typeF || typeF === "Planned Work") {
      for (const p of planned) {
        if (stationF && p.stationId !== stationF) continue;
        if (statusF && p.status !== statusF) continue;
        if (deptF || prioF || tagF || staffF) continue;
        const text = `${p.title} ${p.description ?? ""} ${p.materialRemarks ?? ""}`.toLowerCase();
        if (ql && !text.includes(ql)) continue;
        out.push({
          key: "p" + p.id,
          type: "Planned Work",
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
    return out;
  }, [q, typeF, stationF, deptF, prioF, tagF, statusF, staffF, logs, deficiencies, planned, tags, stationName]);

  const selCls = "rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700";

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-slate-50 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search logs, tasks & planned works…"
          className="w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        <div className="flex flex-wrap gap-2">
          <select className={selCls} value={typeF} onChange={(e) => setTypeF(e.target.value as ResultType | "")}>
            <option value="">All Types</option>
            <option>Log</option>
            <option>Deficiency</option>
            <option>Planned Work</option>
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
        </div>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-xs text-slate-400">{results.length} result{results.length !== 1 ? "s" : ""}</p>
        {results.map((r) => (
          <div key={r.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">{r.type}</span>
              {r.date && <span className="text-xs text-slate-400">{fmtDate(r.date)}</span>}
            </div>
            <p className="mt-0.5 font-semibold text-slate-800">{r.title}</p>
            {r.sub && <p className="text-sm text-slate-500">{r.sub}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.chips.filter((c) => c.label).map((c, i) => <Chip key={i} label={c.label} color={c.color} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

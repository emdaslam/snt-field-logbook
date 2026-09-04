"use client";

import { useState, useRef, useEffect } from "react";
import { useData } from "./DataProvider";
import { useBackClose } from "@/lib/backButton";
import { Chip } from "./ui";
import { api, fmtDate, toISODate } from "@/lib/api";
import { PRIORITY_COLORS, DEPARTMENT_COLORS, DEPARTMENTS } from "@/lib/types";
import { DeficiencyForm, PlannedWorkForm } from "./Forms";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import type { Attachment, DeficiencyTask, PlannedWork } from "@/db/schema";

type Tab = "deficiencies" | "planned" | "archive";

const TAB_LIST: Tab[] = ["deficiencies", "planned", "archive"];

/** Minimum horizontal drag distance (px) that commits a sub-tab swipe. */
const SWIPE_THRESHOLD = 48;

export function TaskManager({
  tab: tabProp,
  setTab: setTabProp,
  highlightId,
  clearHighlight,
}: {
  tab?: Tab;
  setTab?: (t: Tab) => void;
  highlightId?: string | null;
  clearHighlight?: () => void;
} = {}) {
  const {
    deficiencies: allDefs,
    planned: allPlans,
    stations,
    stationName,
    staffName,
    refresh,
    autoSync,
    inScopeStation,
    myStationsOnly,
    myStationNames,
  } = useData();
  const deficiencies = allDefs.filter((d) => inScopeStation(d.stationId));
  const planned = allPlans.filter((p) => inScopeStation(p.stationId));
  const [tabLocal, setTabLocal] = useState<Tab>("deficiencies");
  const tab = tabProp ?? tabLocal;
  const setTab = setTabProp ?? setTabLocal;
  const [editDef, setEditDef] = useState<DeficiencyTask | null>(null);
  const [editPlan, setEditPlan] = useState<PlannedWork | null>(null);
  const [convertDef, setConvertDef] = useState<DeficiencyTask | null>(null);
  const [defDept, setDefDept] = useState("");
  const [defStation, setDefStation] = useState("");
  const [planDept, setPlanDept] = useState("");
  const [planStation, setPlanStation] = useState("");
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  // Horizontal swipe between the sub-tabs (Deficiencies / Planned / Archive):
  // the content slides in (see .tab-enter-* in globals.css). touchAction
  // "pan-y" keeps vertical scrolling native while horizontal moves reach us.
  const [lastDir, setLastDir] = useState<1 | -1>(1);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeBlocked = !!(editDef || editPlan || convertDef || previewAtt);
  const selectTab = (t: Tab) => {
    setLastDir(TAB_LIST.indexOf(t) >= TAB_LIST.indexOf(tab) ? 1 : -1);
    setTab(t);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (swipeBlocked) return;
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipeStart.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Only clearly-horizontal gestures switch sub-tabs; vertical pans scroll.
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < SWIPE_THRESHOLD) return;
    swipeStart.current = null;
    const next = TAB_LIST[TAB_LIST.indexOf(tab) + (dx < 0 ? 1 : -1)];
    if (next) selectTab(next);
  };
  const onTouchEnd = () => {
    swipeStart.current = null;
  };
  // The native back key closes the open attachment preview / convert form first
  useBackClose(previewAtt !== null || convertDef !== null, () => {
    if (previewAtt) setPreviewAtt(null);
    else setConvertDef(null);
  });
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!highlightId) return;
    const el = rowRefs.current[highlightId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => clearHighlight?.(), 2600);
    return () => clearTimeout(t);
  }, [highlightId, clearHighlight]);

  const [archiveFrom, setArchiveFrom] = useState("");
  const [archiveTo, setArchiveTo] = useState("");

  const pendingDef = deficiencies.filter(
    (d) =>
      d.status === "Pending" &&
      (!defDept || d.department === defDept) &&
      (!defStation || String(d.stationId ?? "") === defStation)
  );
  const pendingPlan = planned.filter(
    (p) =>
      p.status === "Pending" &&
      (!planDept || p.department === planDept) &&
      (!planStation || String(p.stationId ?? "") === planStation)
  );

  async function toggleStatus(kind: "def" | "plan", id: number, status: string) {
    const next = status === "Pending" ? "Completed" : "Pending";
    if (kind === "def") {
      await api.deficiencies.update({ id, status: next });
    } else {
      const plan = allPlans.find((p) => p.id === id);
      await api.planned.update({ id, status: next });
      // A planned work converted from a deficiency carries it through: the
      // deficiency only becomes Completed when this plan is, and goes back to
      // Planned when the plan is reopened.
      if (plan?.convertFromId) {
        await api.deficiencies.update({
          id: plan.convertFromId,
          status: next === "Completed" ? "Completed" : "Planned",
        });
      }
    }
    void autoSync();
    await refresh();
  }

  async function toggleTomorrow(kind: "def" | "plan", id: number, val: boolean) {
    if (kind === "def") await api.deficiencies.update({ id, selectedForTomorrow: val });
    else await api.planned.update({ id, selectedForTomorrow: val });
    void autoSync();
    await refresh();
  }

  const completed = [
    ...deficiencies
      .filter((d) => d.status === "Completed")
      .map((d) => ({ kind: "Deficiency" as const, rawKind: "def" as const, rawId: d.id, title: d.title, when: d.completedAt, station: stationName(d.stationId), id: "d" + d.id })),
    ...planned
      .filter((p) => p.status === "Completed")
      .map((p) => ({ kind: "Planned Work" as const, rawKind: "plan" as const, rawId: p.id, title: p.title, when: p.completedAt, station: stationName(p.stationId), id: "p" + p.id })),
  ].filter((c) => {
    if (!c.when) return true;
    const w = new Date(c.when);
    if (archiveFrom && w < new Date(archiveFrom + "T00:00:00")) return false;
    if (archiveTo && w > new Date(archiveTo + "T23:59:59")) return false;
    return true;
  });

  return (
    <div
      className="pb-24"
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-surface">
        {TAB_LIST.map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize ${
              tab === t ? "border-b-2 border-blue-800 text-blue-800" : "text-slate-500"
            }`}
          >
            {t === "deficiencies" ? "Deficiencies" : t === "planned" ? "Planned" : "Archive"}
          </button>
        ))}
      </div>

      <div key={tab} className={lastDir === 1 ? "tab-enter-right" : "tab-enter-left"}>
      {myStationsOnly && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
          Showing only your mapped stations:{" "}
          {myStationNames.length ? myStationNames.join(", ") : "none mapped (showing all)"}
        </div>
      )}
      {(tab === "deficiencies" || tab === "planned") && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <select
            value={tab === "deficiencies" ? defDept : planDept}
            onChange={(e) =>
              tab === "deficiencies" ? setDefDept(e.target.value) : setPlanDept(e.target.value)
            }
            className="rounded-md border border-slate-300 bg-surface px-2 py-1 text-sm text-slate-700"
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select
            value={tab === "deficiencies" ? defStation : planStation}
            onChange={(e) =>
              tab === "deficiencies" ? setDefStation(e.target.value) : setPlanStation(e.target.value)
            }
            className="rounded-md border border-slate-300 bg-surface px-2 py-1 text-sm text-slate-700"
          >
            <option value="">All stations</option>
            {[...stations]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {(tab === "deficiencies"
            ? defDept || defStation
            : planDept || planStation) && (
            <button
              onClick={() => {
                setDefDept("");
                setDefStation("");
                setPlanDept("");
                setPlanStation("");
              }}
              className="text-xs font-medium text-blue-600 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}
      <div className="space-y-3 p-3">
        {tab === "deficiencies" && (
          <>
            {pendingDef.length === 0 && <Empty text="No pending deficiency tasks" />}
            {pendingDef.map((d) => (
              <div
                key={d.id}
                ref={(el) => { rowRefs.current["def-" + d.id] = el; }}
                className={`rounded-xl border bg-surface p-3 shadow-sm transition ${
                  highlightId === "def-" + d.id
                    ? "border-amber-400 ring-2 ring-amber-300"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={d.selectedForTomorrow}
                    onChange={(e) => toggleTomorrow("def", d.id, e.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-600"
                    title="Include in Tomorrow's Work"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="entry-text-lg font-semibold text-slate-800">{d.title}</p>
                    {d.description && <p className="entry-text-sm text-sm text-slate-500">{d.description}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Chip label={d.department} color={DEPARTMENT_COLORS[d.department] ?? "#2563eb"} />
                      <Chip label={d.priority} color={PRIORITY_COLORS[d.priority] ?? "#2563eb"} />
                      <Chip label={stationName(d.stationId)} color="#0e7490" />
                      {d.dueDate && <Chip label={"Due " + fmtDate(d.dueDate)} color="#b45309" />}
                    </div>
                    <AttachmentsRow attachments={d.attachments ?? []} onOpen={setPreviewAtt} />
                    <p className="mt-1 text-xs text-slate-400">Routed to: {staffName(d.assignedStaffId)}</p>
                  </div>
                </div>
                <RowActions
                  onEdit={() => setEditDef(d)}
                  onConvert={() => setConvertDef(d)}
                  onComplete={() => toggleStatus("def", d.id, d.status)}
                  onDelete={async () => {
                    if (confirm("Delete task?")) {
                      await api.deficiencies.remove(d.id);
                      await refresh();
                    }
                  }}
                />
              </div>
            ))}
          </>
        )}

        {tab === "planned" && (
          <>
            {pendingPlan.length === 0 && <Empty text="No pending planned works" />}
            {pendingPlan.map((p) => {
              const daysTo = Math.round(
                (new Date(p.plannedDate + "T00:00:00").getTime() - new Date(toISODate(new Date()) + "T00:00:00").getTime()) / 86400000
              );
              return (
                <div
                  key={p.id}
                  ref={(el) => { rowRefs.current["plan-" + p.id] = el; }}
                  className={`rounded-xl border bg-surface p-3 shadow-sm transition ${
                    highlightId === "plan-" + p.id
                      ? "border-amber-400 ring-2 ring-amber-300"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={p.selectedForTomorrow}
                      onChange={(e) => toggleTomorrow("plan", p.id, e.target.checked)}
                      className="mt-1 h-4 w-4 accent-emerald-600"
                      title="Include in Tomorrow's Work"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="entry-text-lg font-semibold text-slate-800">{p.title}</p>
                      {p.description && <p className="entry-text-sm text-sm text-slate-500">{p.description}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip label={"Planned " + fmtDate(p.plannedDate)} color="#059669" />
                        <Chip label={p.department} color={DEPARTMENT_COLORS[p.department] ?? "#2563eb"} />
                        <Chip label={stationName(p.stationId)} color="#0e7490" />
                        {daysTo >= 0 && daysTo <= 3 && <Chip label="⏰ Alert active" color="#dc2626" />}
                      </div>
                      <AttachmentsRow attachments={p.attachments ?? []} onOpen={setPreviewAtt} />
                      {p.materialRemarks && <p className="entry-text-xs mt-1 text-xs text-slate-500">Material: {p.materialRemarks}</p>}
                    </div>
                  </div>
                  <RowActions
                    onEdit={() => setEditPlan(p)}
                    onComplete={() => toggleStatus("plan", p.id, p.status)}
                    onDelete={async () => {
                      if (confirm("Delete planned work?")) {
                        await api.planned.remove(p.id);
                        // Removing the plan un-converts the deficiency back to
                        // Pending so the work isn't silently lost.
                        if (p.convertFromId) {
                          await api.deficiencies.update({ id: p.convertFromId, status: "Pending" });
                        }
                        await refresh();
                      }
                    }}
                  />
                </div>
              );
            })}
          </>
        )}

        {tab === "archive" && (
          <>
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-surface p-3">
              <label className="text-xs text-slate-600">
                From
                <input type="date" value={archiveFrom} onChange={(e) => setArchiveFrom(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-slate-600">
                To
                <input type="date" value={archiveTo} onChange={(e) => setArchiveTo(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm" />
              </label>
              {(archiveFrom || archiveTo) && (
                <button onClick={() => { setArchiveFrom(""); setArchiveTo(""); }} className="text-xs text-blue-600 underline">
                  Clear
                </button>
              )}
            </div>
            {completed.length === 0 && <Empty text="No completed items in range" />}
            {completed.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface p-3 shadow-sm">
                <span className="text-emerald-600">✓</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-700 line-through decoration-slate-300">{c.title}</p>
                  <p className="text-xs text-slate-400">
                    {c.kind} · {c.station} {c.when ? "· " + fmtDate(new Date(c.when)) : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleStatus(c.rawKind, c.rawId, "Completed")}
                  className="flex-shrink-0 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  title="Mistakenly marked complete? Move back to Pending"
                >
                  Mark Incomplete
                </button>
               </div>
            ))}
          </>
        )}
      </div>
      </div>

      {editDef && <DeficiencyForm open onClose={() => setEditDef(null)} existing={editDef} />}
      {editPlan && <PlannedWorkForm open onClose={() => setEditPlan(null)} existing={editPlan} />}
      {convertDef && (
        <PlannedWorkForm open onClose={() => setConvertDef(null)} convertFrom={convertDef} />
      )}
      <AttachmentPreviewModal attachment={previewAtt} onClose={() => setPreviewAtt(null)} />
    </div>
  );
}

function AttachmentsRow({
  attachments,
  onOpen,
}: {
  attachments: Attachment[];
  onOpen: (a: Attachment) => void;
}) {
  if (attachments.length === 0) return null;
  const thumbs = attachments.slice(0, 4);
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      {thumbs.map((a, i) =>
        a.type.startsWith("image/") ? (
          <button key={i} onClick={() => onOpen(a)} title={a.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.dataUrl}
              alt={a.name}
              className="h-9 w-9 rounded-md border border-slate-200 object-cover"
            />
          </button>
        ) : (
          <button
            key={i}
            onClick={() => onOpen(a)}
            title={a.name}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-500"
          >
            PDF
          </button>
        )
      )}
      {attachments.length > thumbs.length && (
        <span className="text-[11px] text-slate-400">+{attachments.length - thumbs.length} more</span>
      )}
    </div>
  );
}

function RowActions({
  onEdit,
  onConvert,
  onComplete,
  onDelete,
}: {
  onEdit: () => void;
  onConvert?: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
      <button onClick={onComplete} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
        Mark Complete
      </button>
      {onConvert && (
        <button onClick={onConvert} className="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-100">
          Convert to Plan
        </button>
      )}
      <button onClick={onEdit} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
        Edit
      </button>
      <button onClick={onDelete} className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
        Delete
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-surface p-8 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

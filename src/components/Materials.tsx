"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton } from "./ui";
import { api, toISODate } from "@/lib/api";
import {
  exportMaterials,
  exportInHandMaterials,
  exportRequiredMaterials,
  stationMaterialSummaries,
} from "./exports";
import { MATERIAL_UNITS, EQUIPMENT_DEFAULTS } from "@/lib/types";
import { lowStockAlerts, effectiveRequirement } from "@/lib/stock";
import type {
  Material,
  MaterialReceipt,
  MaterialUsage,
  MaterialStation,
  EquipmentType,
  Station,
} from "@/db/schema";

type MatSummary = {
  material: Material;
  received: number;
  used: number;
  inHand: number;
  receipts: MaterialReceipt[];
  usages: MaterialUsage[];
};

function fmtQty(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

/** Quantity with its unit, omitting the unit when none is set. */
function qtyLabel(qty: number, unit?: string): string {
  const q = fmtQty(qty);
  return unit ? `${q} ${unit}` : q;
}

/** The equipment a material is filed under ("general" when none chosen). */
function equipmentOf(m: Material): string {
  return (m.equipment || "general").trim() || "general";
}

/** Group material rows by equipment — default equipment order first, then any
 *  custom equipment in first-appearance order, mirroring the exports. */
function groupRowsByEquipment<T extends { material: Material }>(rows: T[]): { equipment: string; rows: T[] }[] {
  const eqOf = (r: T) => equipmentOf(r.material);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const d of EQUIPMENT_DEFAULTS) {
    if (rows.some((r) => eqOf(r) === d)) {
      seen.add(d);
      order.push(d);
    }
  }
  for (const r of rows) {
    const eq = eqOf(r);
    if (!seen.has(eq)) {
      seen.add(eq);
      order.push(eq);
    }
  }
  return order.map((eq) => ({ equipment: eq, rows: rows.filter((r) => eqOf(r) === eq) }));
}

/** Hamburger "Materials" tab — the required list grouped station-wise, with
 *  each station's own requirement and minimum spare, and its received / used /
 *  in-hand quantities for every material. */
export function Materials() {
  const { stations, stationName, refresh } = useData();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [usages, setUsages] = useState<MaterialUsage[]>([]);
  const [materialStations, setMaterialStations] = useState<MaterialStation[]>([]);
  const [expandedStation, setExpandedStation] = useState<Set<number | null>>(new Set());
  const [expandedDetail, setExpandedDetail] = useState<Set<string>>(new Set());
  // Equipment sub-groups start expanded; a key in this set means collapsed.
  const [collapsedEquipment, setCollapsedEquipment] = useState<Set<string>>(new Set());
  const [materialForm, setMaterialForm] = useState<{ open: boolean; existing?: Material | null }>({ open: false });
  const [receiveForm, setReceiveForm] = useState<{ material: Material; stationId: number | null } | null>(null);
  const [useForm, setUseForm] = useState<{ material: Material; stationId: number | null } | null>(null);
  const [addReqForm, setAddReqForm] = useState<{ material: Material; stationId: number } | null>(null);
  const [setReqForm, setSetReqForm] = useState<{ material: Material; stationId: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "material" | "receipt" | "usage"; id: number }
    | { kind: "materialStation"; id: number; stationId: number }
    | null
  >(null);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [equipmentForm, setEquipmentForm] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [m, r, u, ms, e] = await Promise.all([
      api.materials.list(),
      api.materialReceipts.list(),
      api.materialUsages.list(),
      api.materialStations.list(),
      api.equipmentTypes.list(),
    ]);
    setMaterials(m);
    setReceipts(r);
    setUsages(u);
    setMaterialStations(ms);
    setEquipmentTypes(e);
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  const summaries = useMemo<MatSummary[]>(() => {
    return materials.map((material) => {
      const mReceipts = receipts
        .filter((r) => r.materialId === material.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const mUsages = usages
        .filter((u) => u.materialId === material.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const received = mReceipts.reduce((n, r) => n + r.qty, 0);
      const used = mUsages.reduce((n, u) => n + u.qty, 0);
      return {
        material,
        received,
        used,
        inHand: received - used,
        receipts: mReceipts,
        usages: mUsages,
      };
    });
  }, [materials, receipts, usages]);

  const totalMaterials = materials.length;
  const totalReceived = summaries.reduce((n, s) => n + s.received, 0);
  const totalUsed = summaries.reduce((n, s) => n + s.used, 0);

  /** Per station, the materials that have any presence there — a requirement
   *  override, a receipt or a usage. Materials with nothing at that station do
   *  not clutter its list. */
  const stationGroups = useMemo(() => {
    // Materials not assigned to any station — created before station-wise
    // tracking existed. They have no station list of their own, so they live in
    // an "Unassigned" catch-all group that keeps them visible instead of hiding
    // them behind the low-stock banner. Materials that already have stock
    // activity at a real station keep appearing in that station's list only.
    const unassignedIds = new Set(
      materials
        .filter((m) => !materialStations.some((s) => s.materialId === m.id))
        .filter((m) => !receipts.some((r) => r.materialId === m.id && r.stationId != null))
        .filter((m) => !usages.some((u) => u.materialId === m.id && u.stationId != null))
        .map((m) => m.id)
    );
    const group = (stationId: number | null) => {
      const rows = materials
        .map((m) => {
          const isUnassigned = stationId === null && unassignedIds.has(m.id);
          const mReceipts = receipts.filter((r) => r.materialId === m.id && r.stationId === stationId);
          const mUsages = usages.filter((u) => u.materialId === m.id && u.stationId === stationId);
          const received = mReceipts.reduce((n, r) => n + r.qty, 0);
          const used = mUsages.reduce((n, u) => n + u.qty, 0);
          const hasOverride = materialStations.some((s) => s.materialId === m.id && s.stationId === stationId);
          if (received === 0 && used === 0 && !hasOverride && !isUnassigned) return null;
          const req = effectiveRequirement(m, materialStations, stationId);
          return {
            material: m,
            stationId,
            requiredQty: req.requiredQty,
            minRequiredSpare: req.minRequiredSpare,
            received,
            used,
            inHand: received - used,
            receipts: mReceipts.sort((a, b) => b.date.localeCompare(a.date)),
            usages: mUsages.sort((a, b) => b.date.localeCompare(a.date)),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.material.name.localeCompare(b.material.name));
      return { stationId, rows };
    };

    const ids = new Set<number | null>();
    for (const r of receipts) ids.add(r.stationId);
    for (const u of usages) ids.add(u.stationId);
    for (const s of materialStations) ids.add(s.stationId);
    if (unassignedIds.size > 0) ids.add(null);
    const groups = [...ids]
      .map((id) => group(id))
      .filter((g) => g.rows.length > 0)
      .sort((a, b) => stationName(a.stationId).localeCompare(stationName(b.stationId)));
    return groups;
  }, [materials, receipts, usages, materialStations, stationName]);

  const lowStock = useMemo(
    () => lowStockAlerts(materials, materialStations, receipts, usages, (id) => stationName(id)),
    [materials, materialStations, receipts, usages, stationName]
  );

  const toggleStation = (id: number | null) => {
    setExpandedStation((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDetail = (key: string) => {
    setExpandedDetail((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleEquipment = (key: string) => {
    setCollapsedEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const afterMutate = async () => {
    setBusy(true);
    try {
      await load();
      // Keep the global Alerts bell and daily reminders in sync with the
      // low-stock state after any Receive / Use / edit.
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { kind, id } = confirmDelete;
    setBusy(true);
    try {
      if (kind === "materialStation") {
        await api.materials.removeFromStation(id, confirmDelete.stationId);
      } else if (kind === "material") await api.materials.remove(id);
      else if (kind === "receipt") await api.materialReceipts.remove(id);
      else await api.materialUsages.remove(id);
      await load();
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  const doExport = (which: "full" | "inhand" | "required") => {
    setExportMenu(false);
    if (which === "inhand") {
      exportInHandMaterials(materials, materialStations, receipts, usages, stations);
    } else if (which === "required") {
      exportRequiredMaterials(materials, materialStations, receipts, usages, stations);
    } else {
      exportMaterials(materials, materialStations, receipts, usages, stations);
    }
  };

  const statClass = (value: number, bad: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      bad ? "bg-red-50 text-red-600" : value > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
    }`;

  const materialRow = (row: NonNullable<typeof stationGroups[number]["rows"][number]>) => {
    const m = row.material;
    const stationId = row.stationId;
    const detailKey = `${stationId ?? "none"}:${m.id}`;
    const open = expandedDetail.has(detailKey);
    return (
      <div key={m.id} className="px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{m.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Required: {qtyLabel(row.requiredQty, m.unit)}
              </span>
              {Number(row.minRequiredSpare) > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  Min spare: {qtyLabel(Number(row.minRequiredSpare), m.unit)}
                </span>
              )}
              <span className={statClass(row.received, false)}>Received: {fmtQty(row.received)}</span>
              <span className={statClass(row.used, false)}>Used: {fmtQty(row.used)}</span>
              <span className={statClass(row.inHand, row.inHand < 0)}>In hand: {fmtQty(row.inHand)}</span>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() => setReceiveForm({ material: m, stationId })}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Receive
            </button>
            <button
              onClick={() => setUseForm({ material: m, stationId })}
              className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Use
            </button>
            {stationId != null && (
              <>
                <button
                  onClick={() => setAddReqForm({ material: m, stationId })}
                  className="rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  title="Add more to this station's requirement"
                >
                  + Req
                </button>
                <button
                  onClick={() => setSetReqForm({ material: m, stationId })}
                  className="rounded-lg border border-blue-800 px-2 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                  title="Set this station's requirement and minimum spare"
                >
                  Req
                </button>
              </>
            )}
            <button
              onClick={() => toggleDetail(detailKey)}
              className={`rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${
                open ? "bg-slate-100" : ""
              }`}
              title="Details"
            >
              {open ? "▴" : "▾"}
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={() => setMaterialForm({ open: true, existing: m })}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Edit
          </button>
          <button
            onClick={() =>
              stationId != null
                ? setConfirmDelete({ kind: "materialStation", id: m.id, stationId })
                : setConfirmDelete({ kind: "material", id: m.id })
            }
            className="text-xs font-medium text-red-500 hover:underline"
          >
            {stationId != null ? "Delete" : "Delete material"}
          </button>
        </div>

        {open && (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-slate-500">
                Received at {stationName(stationId)} ({row.receipts.length})
              </p>
              {row.receipts.length === 0 ? (
                <p className="text-xs text-slate-400">No receipts at this station yet — tap Receive.</p>
              ) : (
                <div className="space-y-1.5">
                  {row.receipts.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface p-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {qtyLabel(r.qty, m.unit)} · {fmtDate(r.date)}
                        </p>
                        <p className="text-slate-600">
                          {stationName(r.stationId) || "Station not set"}
                          {r.room ? ` · ${r.room}` : ""}
                        </p>
                        {r.remarks && <p className="text-slate-500">Placed: {r.remarks}</p>}
                      </div>
                      <button
                        onClick={() => setConfirmDelete({ kind: "receipt", id: r.id })}
                        className="flex-shrink-0 text-slate-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-slate-500">
                Used at {stationName(stationId)} ({row.usages.length})
              </p>
              {row.usages.length === 0 ? (
                <p className="text-xs text-slate-400">No usage recorded at this station yet — tap Use.</p>
              ) : (
                <div className="space-y-1.5">
                  {row.usages.map((u) => (
                    <div key={u.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface p-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {qtyLabel(u.qty, m.unit)} · {fmtDate(u.date)}
                        </p>
                        <p className="text-slate-600">{u.purpose || "Purpose not recorded"}</p>
                        <p className="text-slate-500">{stationName(u.stationId) || ""}</p>
                      </div>
                      <button
                        onClick={() => setConfirmDelete({ kind: "usage", id: u.id })}
                        className="flex-shrink-0 text-slate-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-blue-50 px-3 py-2">
        <p className="text-xs text-slate-600">
          <strong>{totalMaterials}</strong> material{totalMaterials !== 1 ? "s" : ""} · received{" "}
          <strong>{fmtQty(totalReceived)}</strong> · used <strong>{fmtQty(totalUsed)}</strong>
        </p>
        <div className="relative flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={() => setEquipmentForm(true)}
            className="rounded-lg border border-blue-800 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            + New Equipment
          </button>
          <button
            onClick={() => setExportMenu((v) => !v)}
            disabled={materials.length === 0 || busy}
            className="rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            📄 Export PDF ▾
          </button>
          {exportMenu && (
            <div className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <button
                onClick={() => doExport("inhand")}
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50"
              >
                In-hand materials
                <span className="block text-[11px] font-normal text-slate-400">Overall + station-wise in hand</span>
              </button>
              <button
                onClick={() => doExport("required")}
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50"
              >
                Required materials
                <span className="block text-[11px] font-normal text-slate-400">Overall + station-wise required list</span>
              </button>
              <button
                onClick={() => doExport("full")}
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50"
              >
                Full report
                <span className="block text-[11px] font-normal text-slate-400">All receipts & usage details</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-bold uppercase text-red-700">
            Low stock — minimum spare not met
          </p>
          <div className="mt-1 space-y-1">
            {lowStock.map((a) => (
              <p key={`${a.material.id}-${a.stationId ?? "none"}`} className="text-xs text-red-700">
                <strong>{a.material.name}</strong>: only{" "}
                {qtyLabel(a.inHand, a.material.unit)} in hand at {a.stationLabel} —
                minimum required {qtyLabel(a.minRequiredSpare, a.material.unit)}
              </p>
            ))}
          </div>
        </div>
      )}

      {materials.length === 0 ? (
        <div className="p-6 text-center">
          <p className="mb-4 text-sm text-slate-500">
            No materials on the required list yet. Add the materials you need — pick the equipment they
            belong to, the quantity and unit, and the station(s) they belong to — then record how many you
            receive and where you keep them, and how many you use and for what purpose.
            Each station keeps its own requirement, minimum spare, and its own received / used / in-hand figures.
          </p>
          <PrimaryButton onClick={() => setMaterialForm({ open: true })}>+ Add Material</PrimaryButton>
        </div>
      ) : (
        <div>
          {stationGroups.map((group) => {
            const open = expandedStation.has(group.stationId);
            return (
              <div key={group.stationId ?? "none"}>
                <button
                  onClick={() => toggleStation(group.stationId)}
                  className="flex w-full items-center justify-between gap-2 bg-blue-900 px-3 py-1.5 text-left"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-white">
                    {stationName(group.stationId)}
                  </p>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <span className="rounded-full bg-blue-800 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
                      {group.rows.length}
                    </span>
                    <span className="text-[11px] font-bold text-blue-200">{open ? "▴" : "▾"}</span>
                  </span>
                </button>
                {open && (
                  <div className="bg-surface">
                    {groupRowsByEquipment(group.rows).map((eqGroup) => {
                      const eqKey = `${group.stationId ?? "none"}|${eqGroup.equipment}`;
                      const eqOpen = !collapsedEquipment.has(eqKey);
                      return (
                        <div key={eqGroup.equipment}>
                          <button
                            onClick={() => toggleEquipment(eqKey)}
                            className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-slate-100 px-3 py-1 text-left"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              {eqGroup.equipment === "general" ? "General" : eqGroup.equipment}
                              <span className="ml-1.5 text-slate-400">({eqGroup.rows.length})</span>
                            </p>
                            <span className="flex-shrink-0 text-[10px] font-bold text-slate-400">
                              {eqOpen ? "▴" : "▾"}
                            </span>
                          </button>
                          {eqOpen && (
                            <div className="divide-y divide-slate-100">
                              {eqGroup.rows.map((r) => materialRow(r))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {materials.length > 0 && (
        <div className="mt-3 px-3">
          <PrimaryButton onClick={() => setMaterialForm({ open: true })} className="w-full">
            + Add Material
          </PrimaryButton>
        </div>
      )}

      {materialForm.open && (
        <MaterialForm
          existing={materialForm.existing ?? null}
          equipmentTypes={equipmentTypes}
          stations={stations}
          materialStations={materialStations}
          onClose={() => setMaterialForm({ open: false })}
          onSaved={afterMutate}
        />
      )}
      {equipmentForm && (
        <EquipmentForm onClose={() => setEquipmentForm(false)} onSaved={afterMutate} />
      )}
      {receiveForm && (
        <ReceiveForm
          material={receiveForm.material}
          defaultStationId={receiveForm.stationId}
          stations={stations}
          onClose={() => setReceiveForm(null)}
          onSaved={afterMutate}
        />
      )}
      {useForm && (
        <UseForm
          material={useForm.material}
          defaultStationId={useForm.stationId}
          stations={stations}
          onClose={() => setUseForm(null)}
          onSaved={afterMutate}
        />
      )}
      {addReqForm && (
        <AddRequirementForm
          material={addReqForm.material}
          materialStations={materialStations}
          stationId={addReqForm.stationId}
          onClose={() => setAddReqForm(null)}
          onSaved={afterMutate}
        />
      )}
      {setReqForm && (
        <SetRequirementForm
          material={setReqForm.material}
          materialStations={materialStations}
          stationId={setReqForm.stationId}
          stations={stations}
          onClose={() => setSetReqForm(null)}
          onSaved={afterMutate}
        />
      )}

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Confirm delete">
          <p className="mb-4 text-sm text-slate-600">
            {confirmDelete.kind === "materialStation" ? (
              <>
                Remove{" "}
                <strong>{materials.find((m) => m.id === confirmDelete.id)?.name ?? "this material"}</strong>{" "}
                from <strong>{stationName(confirmDelete.stationId)}</strong>? Its requirement and its
                receipts / usage at that station are removed too. Other stations keep it — the material
                itself is deleted only when no other station needs it.
              </>
            ) : (
              <>Delete this {confirmDelete.kind}? This cannot be undone.</>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {confirmDelete.kind === "materialStation" ? "Remove" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MaterialForm({
  existing,
  equipmentTypes,
  stations,
  materialStations,
  onClose,
  onSaved,
}: {
  existing: Material | null;
  equipmentTypes: EquipmentType[];
  stations: Station[];
  materialStations: MaterialStation[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [requiredQty, setRequiredQty] = useState(String(existing?.requiredQty ?? ""));
  const [minSpare, setMinSpare] = useState(
    existing?.minRequiredSpare != null ? String(existing.minRequiredSpare) : ""
  );
  const hasPresetUnit = !!existing?.unit && (MATERIAL_UNITS as readonly string[]).includes(existing.unit);
  const [unit, setUnit] = useState<string>(hasPresetUnit ? existing!.unit : existing?.unit ? "custom" : "");
  const [customUnit, setCustomUnit] = useState(existing?.unit && !hasPresetUnit ? existing.unit : "");
  // Equipment defaults to "general"; an existing material's equipment is always
  // offered even if it is no longer in the equipment list.
  const equipmentOptions = useMemo(() => {
    const names = equipmentTypes.map((e) => e.name);
    const current = (existing?.equipment || "general").trim() || "general";
    return names.includes(current) ? names : [...names, current];
  }, [equipmentTypes, existing]);
  const [equipment, setEquipment] = useState((existing?.equipment || "general").trim() || "general");
  const [newEquipment, setNewEquipment] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  // Stations this material is assigned to. Assigning a material to a station
  // makes it appear in that station's list (via a materialStations row).
  const [stationIds, setStationIds] = useState<Set<number>>(() => {
    const set = new Set<number>();
    if (existing) {
      for (const s of materialStations) {
        if (s.materialId === existing.id) set.add(s.stationId);
      }
    }
    return set;
  });
  const [saving, setSaving] = useState(false);

  const toggleStation = (id: number) => {
    setStationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return;
    const qty = Number(requiredQty);
    if (!Number.isFinite(qty) || qty < 0) return;
    const min = Number(minSpare);
    if (!Number.isFinite(min) || min < 0) return;
    if (stations.length > 0 && stationIds.size === 0) return;
    let finalEquipment = equipment;
    if (newEquipment) {
      const eqName = newEquipmentName.trim();
      if (!eqName) return;
      const res = await api.equipmentTypes.create({ name: eqName });
      if ("error" in res && res.error) {
        setEquipmentError(res.error);
        return;
      }
      finalEquipment = res.name;
    }
    const finalUnit = unit === "custom" ? customUnit.trim() : unit;
    setSaving(true);
    try {
      let materialId = existing?.id;
      if (existing) {
        await api.materials.update({ id: existing.id, name: name.trim(), requiredQty: qty, minRequiredSpare: min, unit: finalUnit, equipment: finalEquipment });
      } else {
        const created = await api.materials.create({ name: name.trim(), requiredQty: qty, minRequiredSpare: min, unit: finalUnit, equipment: finalEquipment });
        materialId = created.id;
      }
      // Sync the station assignment: add newly selected stations, drop the ones
      // that were unchecked. Custom per-station requirements are left alone.
      const currentRows = materialStations.filter((s) => s.materialId === materialId);
      const currentSet = new Set(currentRows.map((s) => s.stationId));
      for (const id of stationIds) {
        if (!currentSet.has(id)) {
          await api.materialStations.upsert({
            materialId: materialId as number,
            stationId: id,
            requiredQty: qty,
            minRequiredSpare: min,
          });
        }
      }
      for (const s of currentRows) {
        if (!stationIds.has(s.stationId)) {
          await api.materialStations.removeForMaterialStation(materialId as number, s.stationId);
        }
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${
      active ? "bg-blue-800 text-white" : "border border-slate-300 bg-surface text-slate-600"
    }`;

  return (
    <Modal open onClose={onClose} title={existing ? "Edit Material" : "Add Material"}>
      <Field label="Material name">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Relay contacts, Copper wire…"
          autoFocus
        />
      </Field>
      <Field label="Equipment">
        {newEquipment ? (
          <div className="space-y-1.5">
            <input
              className={inputClass}
              value={newEquipmentName}
              onChange={(e) => { setNewEquipmentName(e.target.value); setEquipmentError(null); }}
              placeholder="e.g. ASP, DC Track…"
              autoFocus
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setNewEquipment(false); setEquipmentError(null); }}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Cancel new equipment
              </button>
              {equipmentError && <p className="text-xs font-medium text-red-600">{equipmentError}</p>}
            </div>
          </div>
        ) : (
          <select
            className={inputClass}
            value={equipment}
            onChange={(e) => {
              if (e.target.value === "__new__") { setNewEquipment(true); return; }
              setEquipment(e.target.value);
            }}
          >
            {equipmentOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
            <option value="__new__">Add new equipment…</option>
          </select>
        )}
      </Field>
      <Field label={`Assign to station${stations.length !== 1 ? "s" : ""}`}>
        {stations.length === 0 ? (
          <p className="text-xs text-slate-500">
            Add a station first in Settings → Manage Stations, then come back to assign this material.
          </p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
            {[...stations]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={stationIds.has(s.id)}
                    onChange={() => toggleStation(s.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                  />
                  {s.name}
                </label>
              ))}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {stations.length > 0
            ? "The material appears under each station you pick. You can change this later from Edit."
            : "A material needs at least one station to show in the list."}
        </p>
      </Field>
      <Field label="Quantity required (default for every station)">
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={requiredQty}
          onChange={(e) => setRequiredQty(e.target.value)}
          placeholder="e.g. 10"
        />
        <p className="mt-1 text-xs text-slate-500">
          The default requirement per station. You can set a different amount for an individual station
          from that station&apos;s list (the &quot;Req&quot; button).
        </p>
      </Field>
      <Field label="Minimum required spare (optional, default for every station)">
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={minSpare}
          onChange={(e) => setMinSpare(e.target.value)}
          placeholder="e.g. 5"
        />
        <p className="mt-1 text-xs text-slate-500">
          Alert when a station&apos;s in-hand quantity falls below this. Leave blank for no low-stock alert.
          A station can override this from its own list.
        </p>
      </Field>
      <Field label="Unit (optional)">
        <div className="flex flex-wrap gap-1.5">
          {MATERIAL_UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(unit === u ? "" : u)}
              className={chipClass(unit === u)}
            >
              {u}
            </button>
          ))}
          <button
            onClick={() => setUnit(unit === "custom" ? "" : "custom")}
            className={chipClass(unit === "custom")}
          >
            Add new unit…
          </button>
          {unit !== "" && (
            <button
              onClick={() => setUnit("")}
              className="rounded-full border border-slate-300 bg-surface px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-50"
            >
              None
            </button>
          )}
        </div>
        {unit === "custom" && (
          <input
            className={`${inputClass} mt-1.5`}
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            placeholder="e.g. Rolls, Boxes, Mtr…"
            autoFocus
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={
            saving ||
            !name.trim() ||
            (newEquipment && !newEquipmentName.trim()) ||
            (stations.length > 0 && stationIds.size === 0)
          }
          className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function EquipmentForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const eqName = name.trim();
    if (!eqName) return;
    setSaving(true);
    try {
      const res = await api.equipmentTypes.create({ name: eqName });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add New Equipment">
      <p className="mb-3 text-xs text-slate-500">
        Add a new equipment group. Materials filed under it keep that tag in every station&apos;s list.
      </p>
      <Field label="Equipment name">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder="e.g. ASP, DC Track…"
          autoFocus
        />
      </Field>
      {error && <p className="mb-2 text-xs font-medium text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function AddRequirementForm({
  material,
  materialStations,
  stationId,
  onClose,
  onSaved,
}: {
  material: Material;
  materialStations: MaterialStation[];
  stationId: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const stationName = (id: number | null) => (id == null ? "Station not set" : `Station #${id}`);
  const req = effectiveRequirement(material, materialStations, stationId);
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    setSaving(true);
    try {
      await api.materialStations.upsert({
        materialId: material.id,
        stationId,
        requiredQty: req.requiredQty + q,
        minRequiredSpare: req.minRequiredSpare,
      });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Add Requirement — ${material.name}`}>
      <p className="mb-3 text-xs text-slate-500">
        Currently required at {stationName(stationId)}:{" "}
        <strong>{qtyLabel(req.requiredQty, material.unit)}</strong>. Enter the extra amount to add on top of it.
      </p>
      <Field label={material.unit ? `Additional quantity (${material.unit})` : "Additional quantity"}>
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="e.g. 10"
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !qty}
          className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </Modal>
  );
}

function SetRequirementForm({
  material,
  materialStations,
  stationId,
  stations,
  onClose,
  onSaved,
}: {
  material: Material;
  materialStations: MaterialStation[];
  stationId: number;
  stations: Station[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const stationName = (id: number | null) =>
    id == null ? "Station not set" : stations.find((s) => s.id === id)?.name ?? "Unassigned";
  const req = effectiveRequirement(material, materialStations, stationId);
  const [requiredQty, setRequiredQty] = useState(String(req.requiredQty));
  const [minSpare, setMinSpare] = useState(String(req.minRequiredSpare));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const qty = Number(requiredQty);
    if (!Number.isFinite(qty) || qty < 0) return;
    const min = Number(minSpare);
    if (!Number.isFinite(min) || min < 0) return;
    setSaving(true);
    try {
      await api.materialStations.upsert({
        materialId: material.id,
        stationId,
        requiredQty: qty,
        minRequiredSpare: min,
      });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.materialStations.removeForMaterialStation(material.id, stationId);
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Requirement — ${material.name} @ ${stationName(stationId)}`}>
      <Field label={material.unit ? `Quantity required at this station (${material.unit})` : "Quantity required at this station"}>
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={requiredQty}
          onChange={(e) => setRequiredQty(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label={material.unit ? `Minimum required spare at this station (${material.unit})` : "Minimum required spare at this station"}>
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={minSpare}
          onChange={(e) => setMinSpare(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          onClick={reset}
          disabled={saving}
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Reset to default
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function StationSelect({
  stations,
  value,
  onChange,
  label = "Station",
}: {
  stations: { id: number; name: string }[];
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— None —</option>
        {[...stations]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </Field>
  );
}

function ReceiveForm({
  material,
  defaultStationId,
  stations,
  onClose,
  onSaved,
}: {
  material: Material;
  defaultStationId: number | null;
  stations: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [stationId, setStationId] = useState<number | null>(defaultStationId);
  const [room, setRoom] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    setSaving(true);
    try {
      await api.materialReceipts.create({
        materialId: material.id,
        qty: q,
        date,
        stationId,
        room: room.trim(),
        remarks: remarks.trim(),
      });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Receive — ${material.name}`}>
      <p className="mb-3 text-xs text-slate-500">
        Recording how many <strong>{material.name}</strong> were received and where they were kept.
      </p>
      <Field label={material.unit ? `Quantity received (${material.unit})` : "Quantity received"}>
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="e.g. 25"
          autoFocus
        />
      </Field>
      <Field label="Received on">
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <StationSelect stations={stations} value={stationId} onChange={setStationId} label="Kept at station" />
      <Field label="Room / store">
        <input
          className={inputClass}
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="e.g. SS Room, Store"
        />
      </Field>
      <Field label="Remarks (where exactly placed)">
        <textarea
          className={inputClass}
          rows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Locked in the 2nd rack of the SS room at X station"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !qty}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function UseForm({
  material,
  defaultStationId,
  stations,
  onClose,
  onSaved,
}: {
  material: Material;
  defaultStationId: number | null;
  stations: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [purpose, setPurpose] = useState("");
  const [stationId, setStationId] = useState<number | null>(defaultStationId);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    setSaving(true);
    try {
      await api.materialUsages.create({
        materialId: material.id,
        qty: q,
        date,
        purpose: purpose.trim(),
        stationId,
      });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Use — ${material.name}`}>
      <p className="mb-3 text-xs text-slate-500">
        Recording how many <strong>{material.name}</strong> were used and for what purpose.
      </p>
      <Field label={material.unit ? `Quantity used (${material.unit})` : "Quantity used"}>
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="e.g. 5"
          autoFocus
        />
      </Field>
      <Field label="Used on">
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <StationSelect stations={stations} value={stationId} onChange={setStationId} label="Used at station" />
      <Field label="Used for (purpose)">
        <textarea
          className={inputClass}
          rows={2}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="e.g. Replacement of failed signal lamp at X"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !qty}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

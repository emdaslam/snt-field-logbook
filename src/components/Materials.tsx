"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, PrimaryButton } from "./ui";
import { api, toISODate } from "@/lib/api";
import { exportMaterials, stationMaterialSummaries } from "./exports";
import { MATERIAL_UNITS, EQUIPMENT_DEFAULTS } from "@/lib/types";
import type { Material, MaterialReceipt, MaterialUsage, EquipmentType } from "@/db/schema";

type MatSummary = {
  material: Material;
  received: number;
  used: number;
  inHand: number;
  /** Required still outstanding — drops as material is received. */
  remaining: number;
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

/** Hamburger "Materials" tab — the required list with receipts (received
 *  quantity, station, room, where placed) and usage (quantity, purpose). */
export function Materials() {
  const { stations, stationName } = useData();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [usages, setUsages] = useState<MaterialUsage[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [materialForm, setMaterialForm] = useState<{ open: boolean; existing?: Material | null }>({ open: false });
  const [receiveForm, setReceiveForm] = useState<Material | null>(null);
  const [useForm, setUseForm] = useState<Material | null>(null);
  const [addReqForm, setAddReqForm] = useState<Material | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "material" | "receipt" | "usage"; id: number } | null>(null);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [equipmentForm, setEquipmentForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [m, r, u, e] = await Promise.all([
      api.materials.list(),
      api.materialReceipts.list(),
      api.materialUsages.list(),
      api.equipmentTypes.list(),
    ]);
    setMaterials(m);
    setReceipts(r);
    setUsages(u);
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
        remaining: Math.max(0, material.requiredQty - received),
        receipts: mReceipts,
        usages: mUsages,
      };
    });
  }, [materials, receipts, usages]);

  const totalMaterials = materials.length;
  const totalReceived = summaries.reduce((n, s) => n + s.received, 0);
  const totalUsed = summaries.reduce((n, s) => n + s.used, 0);
  const totalRemaining = summaries.reduce((n, s) => n + s.remaining, 0);

  /** Materials grouped by equipment. "general" is the catch-all every material
   *  starts in; the default list keeps its fixed order, custom equipment added
   *  later follows it, and anything not in the list trails at the end. */
  const equipmentGroups = useMemo(() => {
    const groups = new Map<string, MatSummary[]>();
    for (const s of summaries) {
      const eq = (s.material.equipment || "general").trim() || "general";
      const list = groups.get(eq) ?? [];
      list.push(s);
      groups.set(eq, list);
    }
    const known = new Set(equipmentTypes.map((e) => e.name));
    const defaults = EQUIPMENT_DEFAULTS.filter((d) => groups.has(d));
    const defaultsSet = EQUIPMENT_DEFAULTS as readonly string[];
    const custom = equipmentTypes.map((e) => e.name).filter((n) => !defaultsSet.includes(n) && groups.has(n));
    const leftover = [...groups.keys()].filter((n) => !known.has(n));
    return [...defaults, ...custom, ...leftover].map((equipment) => ({
      equipment,
      items: groups.get(equipment)!,
    }));
  }, [summaries, equipmentTypes]);

  const stationSummaries = useMemo(
    () =>
      stationMaterialSummaries(materials, receipts, usages, (id) => stationName(id)),
    [materials, receipts, usages, stationName]
  );

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const afterMutate = async () => {
    setBusy(true);
    try {
      await load();
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { kind, id } = confirmDelete;
    setBusy(true);
    try {
      if (kind === "material") await api.materials.remove(id);
      else if (kind === "receipt") await api.materialReceipts.remove(id);
      else await api.materialUsages.remove(id);
      await load();
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  const doExport = () => {
    exportMaterials(materials, receipts, usages, stations);
  };

  const statClass = (value: number, bad: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      bad ? "bg-red-50 text-red-600" : value > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
    }`;

  const materialCard = (s: MatSummary) => {
    const m = s.material;
    const open = expanded.has(m.id);
    return (
      <div key={m.id} className="px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{m.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Required: {qtyLabel(s.remaining, m.unit)}
              </span>
              <span className={statClass(s.received, false)}>Received: {fmtQty(s.received)}</span>
              <span className={statClass(s.used, false)}>Used: {fmtQty(s.used)}</span>
              <span className={statClass(s.inHand, s.inHand < 0)}>In hand: {fmtQty(s.inHand)}</span>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() => setReceiveForm(m)}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Receive
            </button>
            <button
              onClick={() => setUseForm(m)}
              className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Use
            </button>
            <button
              onClick={() => setAddReqForm(m)}
              className="rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              title="Add more to the requirement"
            >
              + Req
            </button>
            <button
              onClick={() => toggleExpanded(m.id)}
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
            onClick={() => setConfirmDelete({ kind: "material", id: m.id })}
            className="text-xs font-medium text-red-500 hover:underline"
          >
            Delete
          </button>
        </div>

        {open && (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-slate-500">
                Received ({s.receipts.length})
              </p>
              {s.receipts.length === 0 ? (
                <p className="text-xs text-slate-400">No receipts yet — tap Receive.</p>
              ) : (
                <div className="space-y-1.5">
                  {s.receipts.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-white p-2 text-xs">
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
              <p className="mb-1 text-xs font-bold uppercase text-slate-500">Used ({s.usages.length})</p>
              {s.usages.length === 0 ? (
                <p className="text-xs text-slate-400">No usage recorded yet — tap Use.</p>
              ) : (
                <div className="space-y-1.5">
                  {s.usages.map((u) => (
                    <div key={u.id} className="flex items-start justify-between gap-2 rounded-lg bg-white p-2 text-xs">
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
          <strong>{fmtQty(totalReceived)}</strong> · used <strong>{fmtQty(totalUsed)}</strong> · still required{" "}
          <strong>{fmtQty(totalRemaining)}</strong>
        </p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={() => setEquipmentForm(true)}
            className="rounded-lg border border-blue-800 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            + New Equipment
          </button>
          <button
            onClick={doExport}
            disabled={materials.length === 0 || busy}
            className="rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="p-6 text-center">
          <p className="mb-4 text-sm text-slate-500">
            No materials on the required list yet. Add the materials you need — with the quantity
            (in any unit you choose, e.g. Nos / Kg / Sets / Units) and the equipment they belong to —
            then record how many you receive and where you keep them, and how many you use and for what purpose.
          </p>
          <PrimaryButton onClick={() => setMaterialForm({ open: true })}>+ Add Material</PrimaryButton>
        </div>
      ) : (
        <div>
          {equipmentGroups.map((group) => (
            <div key={group.equipment}>
              <div className="flex items-center justify-between bg-blue-900 px-3 py-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-white">{group.equipment}</p>
                <p className="rounded-full bg-blue-800 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
                  {group.items.length}
                </p>
              </div>
              <div className="divide-y divide-slate-100 bg-white">
                {group.items.map((s) => materialCard(s))}
              </div>
            </div>
          ))}
        </div>
      )}

      {stationSummaries.length > 0 && (
        <div className="mt-3 bg-white">
          <p className="border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-500">
            Station-wise Summary
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  <th className="px-3 py-1.5 font-semibold">Station</th>
                  <th className="py-1.5 font-semibold">Material</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Received</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Used</th>
                  <th className="px-3 py-1.5 text-right font-semibold">In hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stationSummaries.map((s) => (
                  <Fragment key={s.stationId ?? "none"}>
                    <tr className="bg-slate-50">
                      <td className="px-3 py-1.5 font-bold text-slate-700" colSpan={5}>
                        {s.stationLabel}
                      </td>
                    </tr>
                    {s.rows.map((r) => (
                      <tr key={r.materialId}>
                        <td className="px-3 py-1.5"></td>
                        <td className="py-1.5 font-medium text-slate-800">{r.name}</td>
                        <td className="px-2 py-1.5 text-right">
                          {qtyLabel(r.received, r.unit)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {qtyLabel(r.used, r.unit)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {qtyLabel(r.inHand, r.unit)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/60">
                      <td className="px-3 py-1.5 text-[11px] font-semibold text-slate-500" colSpan={2}>
                        Total at {s.stationLabel}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{fmtQty(s.receivedTotal)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{fmtQty(s.usedTotal)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{fmtQty(s.inHandTotal)}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
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
          onClose={() => setMaterialForm({ open: false })}
          onSaved={afterMutate}
        />
      )}
      {equipmentForm && (
        <EquipmentForm onClose={() => setEquipmentForm(false)} onSaved={afterMutate} />
      )}
      {receiveForm && (
        <ReceiveForm material={receiveForm} stations={stations} onClose={() => setReceiveForm(null)} onSaved={afterMutate} />
      )}
      {useForm && (
        <UseForm material={useForm} stations={stations} onClose={() => setUseForm(null)} onSaved={afterMutate} />
      )}
      {addReqForm && (
        <AddRequirementForm material={addReqForm} onClose={() => setAddReqForm(null)} onSaved={afterMutate} />
      )}

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Confirm delete">
          <p className="mb-4 text-sm text-slate-600">
            Delete this {confirmDelete.kind}? This cannot be undone.
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
              Delete
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
  onClose,
  onSaved,
}: {
  existing: Material | null;
  equipmentTypes: EquipmentType[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [requiredQty, setRequiredQty] = useState(String(existing?.requiredQty ?? ""));
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
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    const qty = Number(requiredQty);
    if (!Number.isFinite(qty) || qty < 0) return;
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
      if (existing)
        await api.materials.update({ id: existing.id, name: name.trim(), requiredQty: qty, unit: finalUnit, equipment: finalEquipment });
      else await api.materials.create({ name: name.trim(), requiredQty: qty, unit: finalUnit, equipment: finalEquipment });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ${
      active ? "bg-blue-800 text-white" : "border border-slate-300 bg-white text-slate-600"
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
      <Field label="Quantity required">
        <input
          type="number"
          min="0"
          step="any"
          className={inputClass}
          value={requiredQty}
          onChange={(e) => setRequiredQty(e.target.value)}
          placeholder="e.g. 10"
        />
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
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-50"
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
          disabled={saving || !name.trim() || (newEquipment && !newEquipmentName.trim())}
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
        Add a new equipment group. Materials filed under it will show in their own section of the
        required list, after the default equipment.
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
  onClose,
  onSaved,
}: {
  material: Material;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    setSaving(true);
    try {
      await api.materials.update({
        id: material.id,
        name: material.name,
        requiredQty: material.requiredQty + q,
        unit: material.unit,
        equipment: material.equipment || "general",
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
        Currently required: <strong>{qtyLabel(material.requiredQty, material.unit)}</strong>. Enter the extra amount
        to add on top of it.
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
  stations,
  onClose,
  onSaved,
}: {
  material: Material;
  stations: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [stationId, setStationId] = useState<number | null>(null);
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
  stations,
  onClose,
  onSaved,
}: {
  material: Material;
  stations: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [purpose, setPurpose] = useState("");
  const [stationId, setStationId] = useState<number | null>(null);
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
      <StationSelect stations={stations} value={stationId} onChange={setStationId} label="Used at station (optional)" />
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

"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, Chip, PrimaryButton } from "./ui";
import { api, toISODate } from "@/lib/api";
import { DEPARTMENTS, PRIORITIES } from "@/lib/types";
import {
  kindFromTags,
  INSPECTION_RULES,
  JOINT_DEPARTMENTS,
  PERIODICITIES,
  PERIODIC_KINDS,
  FOOTPLATE_SHIFTS,
  FOOTPLATE_DIRECTIONS,
  intervalFor,
  addDays,
} from "@/lib/inspections";
import type { Attachment, DailyLog, DeficiencyTask, PlannedWork, FootplateDetail } from "@/db/schema";

async function filesToAttachments(files: FileList | null): Promise<Attachment[]> {
  if (!files) return [];
  const out: Attachment[] = [];
  for (const f of Array.from(files)) {
    if (f.size > 2_000_000) continue; // skip >2MB
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(f);
    });
    out.push({ name: f.name, type: f.type, dataUrl });
  }
  return out;
}

export function DailyLogForm({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: DailyLog | null;
}) {
  const { tags, stations, refresh, currentUser } = useData();
  const [logDate, setLogDate] = useState(existing?.logDate ?? toISODate(new Date()));
  const [movement, setMovement] = useState(existing?.stationMovement ?? "");
  const [workDone, setWorkDone] = useState(existing?.workDone ?? "");
  const [taPercent, setTaPercent] = useState(String(existing?.taPercent ?? 100));
  const [tagIds, setTagIds] = useState<number[]>(existing?.tagIds ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const taDays = (Number(taPercent) || 100) / 100;
  const selectedTagNames = tagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const inspectionKind = kindFromTags(selectedTagNames);
  const [saving, setSaving] = useState(false);
  const [addingStation, setAddingStation] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [pcdoOpen, setPcdoOpen] = useState(Boolean(existing?.pcdoWork));
  const [pcdoWork, setPcdoWork] = useState(existing?.pcdoWork ?? "");
  const [inspectionTowardsId, setInspectionTowardsId] = useState<number | null>(
    existing?.inspectionTowardsStationId ?? null
  );
  const [jointDept, setJointDept] = useState(existing?.inspectionJointDept ?? "");
  const [periodicity, setPeriodicity] = useState(existing?.inspectionPeriodicity ?? "monthly");
  const [fpShift, setFpShift] = useState(existing?.footplateShift ?? "");
  const [fpDirection, setFpDirection] = useState(existing?.footplateDirection ?? "");
  const emptyFp: FootplateDetail = { trainNo: "", engineNo: "", lpName: "", alpName: "", tmrName: "" };
  const [fpUp, setFpUp] = useState<FootplateDetail>(existing?.footplateUp ?? emptyFp);
  const [fpDown, setFpDown] = useState<FootplateDetail>(existing?.footplateDown ?? emptyFp);
  const [discOpen, setDiscOpen] = useState(Boolean(existing?.hasDisconnections));
  const [discSpecialWork, setDiscSpecialWork] = useState(String(existing?.discSpecialWork ?? 0));
  const [discFailure, setDiscFailure] = useState(String(existing?.discFailure ?? 0));
  const [discMaintenance, setDiscMaintenance] = useState(String(existing?.discMaintenance ?? 0));

  // PCDO station & date always mirror the log entry
  const resolvedStation = stations.find((s) => s.name === movement);
  const pcdoStationId = resolvedStation?.id ?? null;
  const pcdoDate = logDate;
  const discTotal =
    (Number(discSpecialWork) || 0) + (Number(discFailure) || 0) + (Number(discMaintenance) || 0);

  async function createStation() {
    const name = newStationName.trim();
    if (!name) return;
    const created = await api.stations.create({ name });
    await refresh();
    setMovement(created.name);
    setNewStationName("");
    setAddingStation(false);
  }

  async function save() {
    setSaving(true);
    const payload = {
      id: existing?.id,
      logDate,
      stationMovement: movement,
      workDone,
      ta: null,
      taPercent: Number(taPercent) || 100,
      inspectionKind: inspectionKind,
      inspectionStationId: inspectionKind ? pcdoStationId : null,
      inspectionTowardsStationId:
        inspectionKind && inspectionKind !== "footplate" ? inspectionTowardsId : null,
      inspectionJointDept: inspectionKind === "joint" ? jointDept || null : null,
      inspectionPeriodicity:
        inspectionKind && PERIODIC_KINDS.includes(inspectionKind) ? periodicity : null,
      footplateShift: inspectionKind === "footplate" ? fpShift || null : null,
      footplateDirection: inspectionKind === "footplate" ? fpDirection || null : null,
      footplateUp:
        inspectionKind === "footplate" && (fpDirection === "Up" || fpDirection === "Both")
          ? fpUp
          : null,
      footplateDown:
        inspectionKind === "footplate" && (fpDirection === "Down" || fpDirection === "Both")
          ? fpDown
          : null,
      inspectionSide: null,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
      pcdoWork: pcdoOpen ? pcdoWork : null,
      // PCDO station & date always mirror the log entry
      pcdoStationId: pcdoOpen ? pcdoStationId : null,
      pcdoDate: pcdoOpen ? pcdoDate : null,
      hasDisconnections: discOpen,
      discSpecialWork: discOpen ? Number(discSpecialWork) || 0 : 0,
      discFailure: discOpen ? Number(discFailure) || 0 : 0,
      discMaintenance: discOpen ? Number(discMaintenance) || 0 : 0,
      tagIds,
      attachments,
    };
    if (existing) await api.logs.update(payload);
    else await api.logs.create(payload);
    await refresh();
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Daily Log" : "Add Daily Log"}>
      <Field label="Date">
        <input type="date" className={inputClass} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
      </Field>
      <Field label="Station / Movement">
        <div className="flex gap-2">
          <select
            className={inputClass}
            value={stations.some((s) => s.name === movement) ? movement : ""}
            onChange={(e) => setMovement(e.target.value)}
          >
            <option value="">— Select station —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAddingStation((v) => !v)}
            className="flex-shrink-0 rounded-lg border border-emerald-500 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            {addingStation ? "Cancel" : "+ Add"}
          </button>
        </div>
        {addingStation && (
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              placeholder="New station name"
              value={newStationName}
              onChange={(e) => setNewStationName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createStation();
                }
              }}
            />
            <button
              type="button"
              onClick={createStation}
              className="flex-shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        )}
      </Field>
      <Field label="Work Done">
        <textarea
          className={inputClass}
          rows={4}
          value={workDone}
          placeholder="Describe the work carried out…"
          onChange={(e) => setWorkDone(e.target.value)}
        />
      </Field>
      <Field label="TA (days)">
        <select
          className={inputClass}
          value={taPercent}
          onChange={(e) => setTaPercent(e.target.value)}
        >
          <option value="100">100 % — 1 day</option>
          <option value="70">70 % — 0.7 day</option>
          <option value="30">30 % — 0.3 day</option>
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          Claiming <strong>{taDays.toFixed(1)} day</strong> at {taPercent}%
        </span>
      </Field>

      {/* PCDO — special works */}
      <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={pcdoOpen}
            onChange={(e) => setPcdoOpen(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          <span className="text-sm font-semibold text-indigo-900">PCDO — Special Work</span>
        </label>
        <p className="mt-1 text-xs text-indigo-700/80">
          Tick to report this as a special work in the PCDO return (26th of last month → 25th of this month).
        </p>

        {pcdoOpen && (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Special Work Details</span>
              <textarea
                className={inputClass}
                rows={3}
                value={pcdoWork ?? ""}
                placeholder="Describe the special work carried out…"
                onChange={(e) => setPcdoWork(e.target.value)}
              />
            </label>
            <div className="rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-xs">
              <p className="mb-1 font-semibold text-indigo-800">Taken from this log entry</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-700">
                <span>
                  Station:{" "}
                  <strong className={resolvedStation ? "text-slate-900" : "text-amber-600"}>
                    {resolvedStation ? resolvedStation.name : movement || "not selected above"}
                  </strong>
                </span>
                <span>
                  Date: <strong className="text-slate-900">{logDate}</strong>
                </span>
              </div>
              {!resolvedStation && (
                <p className="mt-1 text-amber-600">
                  Select a station in “Station / Movement” above so this work is grouped correctly.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Disconnections */}
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={discOpen}
            onChange={(e) => setDiscOpen(e.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          <span className="text-sm font-semibold text-amber-900">Disconnections Given</span>
        </label>
        <p className="mt-1 text-xs text-amber-800/80">
          Tick to record how many disconnections were given, split by purpose. Included in the PCDO export.
        </p>

        {discOpen && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Special Work</span>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={discSpecialWork}
                  onChange={(e) => setDiscSpecialWork(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Failure</span>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={discFailure}
                  onChange={(e) => setDiscFailure(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Maintenance</span>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={discMaintenance}
                  onChange={(e) => setDiscMaintenance(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-xs font-semibold text-amber-900">
              Total disconnections: {discTotal}
            </p>
          </>
        )}
      </div>

      <Field label="Tags">
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              color={t.color}
              active={tagIds.includes(t.id)}
              onClick={() =>
                setTagIds((prev) =>
                  prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                )
              }
            />
          ))}
        </div>
      </Field>
      {inspectionKind && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
          <p className="text-sm font-semibold text-sky-900">
            {INSPECTION_RULES[inspectionKind].label}
          </p>
          <p className="mt-1 text-xs text-sky-800">
            Done at{" "}
            <strong className={resolvedStation ? "" : "text-amber-600"}>
              {resolvedStation ? resolvedStation.name : movement || "no station selected above"}
            </strong>{" "}
            — taken from this log entry.
          </p>

          {inspectionKind !== "footplate" && (
          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Towards which side?
            </span>
            <select
              className={inputClass}
              value={inspectionTowardsId ?? ""}
              onChange={(e) => setInspectionTowardsId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Select side —</option>
              {stations
                .filter((st) => st.id !== resolvedStation?.id)
                .map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} side
                  </option>
                ))}
            </select>
          </label>
          )}

          {PERIODIC_KINDS.includes(inspectionKind) && (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Periodicity</span>
              <div className="flex gap-2">
                {PERIODICITIES.map((pd) => (
                  <button
                    key={pd}
                    type="button"
                    onClick={() => setPeriodicity(pd)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                      periodicity === pd
                        ? "border-sky-600 bg-sky-50 text-sky-800"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    {pd}
                  </button>
                ))}
              </div>
            </label>
          )}

          {inspectionKind === "footplate" && (
            <>
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Day or Night?</span>
                <div className="flex gap-2">
                  {FOOTPLATE_SHIFTS.map((sh) => (
                    <button
                      key={sh}
                      type="button"
                      onClick={() => setFpShift(sh)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                        fpShift === sh
                          ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                          : "border-slate-300 text-slate-600"
                      }`}
                    >
                      {sh === "Day" ? "☀ Day" : "🌙 Night"}
                    </button>
                  ))}
                </div>
              </label>

              {fpShift && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Direction</span>
                  <div className="flex gap-2">
                    {FOOTPLATE_DIRECTIONS.map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setFpDirection(dir)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                          fpDirection === dir
                            ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                            : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                </label>
              )}

              {(fpDirection === "Up" || fpDirection === "Both") && (
                <TrainDetails label="UP Train Details" value={fpUp} onChange={setFpUp} />
              )}
              {(fpDirection === "Down" || fpDirection === "Both") && (
                <TrainDetails label="DN Train Details" value={fpDown} onChange={setFpDown} />
              )}
            </>
          )}

          {inspectionKind === "joint" && (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Joint inspection done with
              </span>
              <select
                className={inputClass}
                value={jointDept}
                onChange={(e) => setJointDept(e.target.value)}
              >
                <option value="">— Select department —</option>
                {JOINT_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {!jointDept && (
                <span className="mt-1 block text-xs text-amber-600">
                  Select the department this joint inspection was carried out with.
                </span>
              )}
            </label>
          )}

          {inspectionKind === "footplate" ? (
            resolvedStation && fpShift && fpDirection ? (
              <p className="mt-1.5 text-xs text-sky-800">
                <strong>{fpShift}</strong> footplate ({fpDirection}) at{" "}
                <strong>{resolvedStation.name}</strong> · {periodicity} cycle — next due{" "}
                <strong>{addDays(logDate, intervalFor(inspectionKind, periodicity))}</strong>.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-amber-600">
                Select the station above, then Day/Night and the direction.
              </p>
            )
          ) : resolvedStation && inspectionTowardsId ? (
            <p className="mt-1.5 text-xs text-sky-800">
              At <strong>{resolvedStation.name}</strong> towards{" "}
              <strong>{stations.find((x) => x.id === inspectionTowardsId)?.name}</strong> side
              {inspectionKind === "joint" && jointDept ? ` with ${jointDept}` : ""} · recurs every{" "}
              {INSPECTION_RULES[inspectionKind].intervalDays} days — next due{" "}
              <strong>{addDays(logDate, INSPECTION_RULES[inspectionKind].intervalDays)}</strong>.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-amber-600">
              Select the station above and the side here so this inspection is tracked.
            </p>
          )}
        </div>
      )}

      <Field label="Attachments (photos/files)">
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="text-sm"
          onChange={async (e) => {
            const atts = await filesToAttachments(e.target.files);
            setAttachments((prev) => [...prev, ...atts]);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={i} className="relative">
              {a.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                  PDF
                </div>
              )}
              <button
                onClick={() => setAttachments((p) => p.filter((_, x) => x !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </Field>
      <div className="mt-4 flex justify-end">
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save Log"}</PrimaryButton>
      </div>
    </Modal>
  );
}

export function DeficiencyForm({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: DeficiencyTask | null;
}) {
  const { stations, staff, refresh } = useData();
  const [department, setDepartment] = useState(existing?.department ?? "Signalling");
  const [stationId, setStationId] = useState<number | null>(existing?.stationId ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [priority, setPriority] = useState(existing?.priority ?? "Normal");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [saving, setSaving] = useState(false);

  const mappedStaff = staff.find((s) => stationId != null && s.stationIds.includes(stationId));

  async function save() {
    setSaving(true);
    const payload = {
      id: existing?.id,
      department,
      stationId,
      title,
      description,
      priority,
      dueDate: dueDate || null,
    };
    if (existing) await api.deficiencies.update(payload);
    else await api.deficiencies.create(payload);
    await refresh();
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Deficiency Task" : "Add Deficiency Task"}>
      <Field label="Deficiency Department">
        <select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Field>
      <Field label="Affected Station">
        <select
          className={inputClass}
          value={stationId ?? ""}
          onChange={(e) => setStationId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Select station —</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {stationId && (
        <p className="-mt-1 mb-3 text-xs text-emerald-700">
          {mappedStaff ? `Routed to: ${mappedStaff.name} (${mappedStaff.designation ?? "staff"})` : "No staff mapped to this station"}
        </p>
      )}
      <Field label="Task Title">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className={inputClass} rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Priority">
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                priority === p ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Due Date">
        <input type="date" className={inputClass} value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end">
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save Task"}</PrimaryButton>
      </div>
    </Modal>
  );
}

export function PlannedWorkForm({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: PlannedWork | null;
}) {
  const { stations, refresh, currentUser } = useData();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [plannedDate, setPlannedDate] = useState(existing?.plannedDate ?? toISODate(new Date()));
  const [stationId, setStationId] = useState<number | null>(existing?.stationId ?? null);
  const [materialRemarks, setMaterialRemarks] = useState(existing?.materialRemarks ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = {
      id: existing?.id,
      title,
      description,
      plannedDate,
      stationId,
      materialRemarks,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
    };
    if (existing) await api.planned.update(payload);
    else await api.planned.create(payload);
    await refresh();
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Planned Work" : "Add Future Planned Work"}>
      <Field label="Work Title">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className={inputClass} rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Planned Date">
        <input type="date" className={inputClass} value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        <span className="mt-1 block text-xs text-slate-500">
          A reminder alert triggers automatically 3 days before this date.
        </span>
      </Field>
      <Field label="Associated Station (optional)">
        <select
          className={inputClass}
          value={stationId ?? ""}
          onChange={(e) => setStationId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— None —</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Required Material / Remarks">
        <textarea
          className={inputClass}
          rows={2}
          value={materialRemarks ?? ""}
          onChange={(e) => setMaterialRemarks(e.target.value)}
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save Work"}</PrimaryButton>
      </div>
    </Modal>
  );
}

function TrainDetails({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FootplateDetail;
  onChange: (v: FootplateDetail) => void;
}) {
  const set = (k: keyof FootplateDetail) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const cls =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-cyan-500";
  return (
    <div className="mt-2 rounded-lg border border-cyan-200 bg-white p-2.5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-800">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Train No.</span>
          <input className={cls} value={value.trainNo} onChange={set("trainNo")} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Engine No.</span>
          <input className={cls} value={value.engineNo} onChange={set("engineNo")} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">LP Name</span>
          <input className={cls} value={value.lpName} onChange={set("lpName")} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">ALP Name</span>
          <input className={cls} value={value.alpName} onChange={set("alpName")} />
        </label>
        <label className="col-span-2 block">
          <span className="mb-0.5 block text-[11px] text-slate-600">TMR Name</span>
          <input className={cls} value={value.tmrName} onChange={set("tmrName")} />
        </label>
      </div>
    </div>
  );
}

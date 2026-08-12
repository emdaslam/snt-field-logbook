"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, Chip, PrimaryButton } from "./ui";
import { api, toISODate, fmtDate } from "@/lib/api";
import { DEPARTMENTS, PRIORITIES, LEAVE_KINDS, MOVEMENT_TYPES, MOVEMENT_LABEL } from "@/lib/types";
import { AUTO_TIMINGS } from "@/lib/timingsMode";
import {
  kindFromTags,
  INSPECTION_RULES,
  JOINT_DEPARTMENTS,
  PERIODICITIES,
  PERIODIC_KINDS,
  FOOTPLATE_DIRECTIONS,
  intervalFor,
  addDays,
} from "@/lib/inspections";
import type {
  Attachment,
  DailyLog,
  DeficiencyTask,
  PlannedWork,
  FootplateDetail,
  FootplateBlock,
} from "@/db/schema";

async function filesToAttachments(files: FileList | null): Promise<Attachment[]> {
  if (!files) return [];
  const out: Attachment[] = [];
  for (const f of Array.from(files)) {
    // Skip very large non-PDF files; PDFs (e.g. scanned manuals) are kept
    // so they can be stored and opened on this device.
    if (f.size > 2_000_000 && f.type !== "application/pdf") continue;
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(f);
    });
    out.push({ name: f.name, type: f.type, dataUrl });
  }
  return out;
}

/** File picker + thumbnail grid used by any form that stores attachments. */
function AttachmentField({
  value,
  onChange,
}: {
  value: Attachment[];
  onChange: (v: Attachment[]) => void;
}) {
  return (
    <Field label="Attachments (photos/files)">
      <input
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="text-sm"
        onChange={async (e) => {
          const atts = await filesToAttachments(e.target.files);
          onChange([...value, ...atts]);
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {value.map((a, i) => (
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
              onClick={() => onChange(value.filter((_, x) => x !== i))}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Field>
  );
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
  const { tags, stations, logs, refresh, currentUser, autoSync } = useData();
  const [logDate, setLogDate] = useState(existing?.logDate ?? toISODate(new Date()));
  const [movement, setMovement] = useState(existing?.stationMovement ?? "");
  const [timeDep, setTimeDep] = useState(existing?.timeDep ?? "");
  const [timeArr, setTimeArr] = useState(existing?.timeArr ?? "");
  const [returnTimeDep, setReturnTimeDep] = useState(existing?.returnTimeDep ?? "");
  const [returnTimeArr, setReturnTimeArr] = useState(existing?.returnTimeArr ?? "");
  const [movementKind, setMovementKind] = useState<"station" | "rest" | "leave" | "cr" | "nh">(
    existing?.movementKind === "rest" ||
      existing?.movementKind === "leave" ||
      existing?.movementKind === "cr" ||
      existing?.movementKind === "nh"
      ? existing.movementKind
      : "station"
  );
  const [leaveKind, setLeaveKind] = useState(existing?.leaveKind ?? "");
  const [crFrom, setCrFrom] = useState(existing?.crFrom ?? "");
  const [crTo, setCrTo] = useState(existing?.crTo ?? "");
  const [workDone, setWorkDone] = useState(existing?.workDone ?? "");
  const [taPercent, setTaPercent] = useState(String(existing?.taPercent ?? 70));
  const [tagIds, setTagIds] = useState<number[]>(existing?.tagIds ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [inspectionSide, setInspectionSide] = useState(existing?.inspectionSide ?? "");
  const taTakenOnSameDate = logs.some(
    (l) => l.logDate === logDate && l.id !== existing?.id && (l.taPercent ?? 0) > 0
  );
  const isSpecial = movementKind !== "station";
  const movementLabel = MOVEMENT_LABEL[movementKind] ?? movementKind;
  // Rest / Leave / CR and a date that already has a TA claim: no TA for this entry
  const taLocked = isSpecial || taTakenOnSameDate;
  const taPercentEffective = taLocked ? "0" : taPercent;
  const taDays = (Number(taPercentEffective) || 0) / 100;
  const selectedTagNames = tagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const inspectionKind = kindFromTags(selectedTagNames);
  const [saving, setSaving] = useState(false);
  const [addingStation, setAddingStation] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [pcdoOpen, setPcdoOpen] = useState(Boolean(existing?.pcdoWork));
  const [pcdoWork, setPcdoWork] = useState(existing?.pcdoWork ?? "");
  // PCDO & disconnections need a station even for Rest/Leave/CR/NH entries —
  // this holds the manually picked station until a real movement station wins.
  const [pcdoStationOverride, setPcdoStationOverride] = useState<number | null>(
    existing && existing.pcdoStationId && !stations.some((s) => s.name === existing.stationMovement)
      ? existing.pcdoStationId
      : null
  );
  const [inspectionTowardsId, setInspectionTowardsId] = useState<number | null>(
    existing?.inspectionTowardsStationId ?? null
  );
  const [jointDept, setJointDept] = useState(existing?.inspectionJointDept ?? "");
  const [periodicity, setPeriodicity] = useState(existing?.inspectionPeriodicity ?? "monthly");
  const [fpDay, setFpDay] = useState(
    (existing?.footplateShift ?? "").split(",").map((s) => s.trim()).includes("Day")
  );
  const [fpNight, setFpNight] = useState(
    (existing?.footplateShift ?? "").split(",").map((s) => s.trim()).includes("Night")
  );
  const emptyFp: FootplateDetail = { trainNo: "", engineNo: "", lpName: "", alpName: "", tmrName: "" };
  const fpBlock = (b: FootplateBlock | null | undefined) => ({
    direction: (b && "direction" in b && b.direction) || "",
    up: (b && "direction" in b && b.up) || emptyFp,
    down: (b && "direction" in b && b.down) || emptyFp,
  });
  const dayBlock = fpBlock(existing?.footplateDay);
  const nightBlock = fpBlock(existing?.footplateNight);
  const [fpDayDir, setFpDayDir] = useState(dayBlock.direction);
  const [fpDayUp, setFpDayUp] = useState<FootplateDetail>(dayBlock.up);
  const [fpDayDn, setFpDayDn] = useState<FootplateDetail>(dayBlock.down);
  const [fpNightDir, setFpNightDir] = useState(nightBlock.direction);
  const [fpNightUp, setFpNightUp] = useState<FootplateDetail>(nightBlock.up);
  const [fpNightDn, setFpNightDn] = useState<FootplateDetail>(nightBlock.down);
  const [discOpen, setDiscOpen] = useState(Boolean(existing?.hasDisconnections));
  const [discSpecialWork, setDiscSpecialWork] = useState(String(existing?.discSpecialWork ?? 0));
  const [discFailure, setDiscFailure] = useState(String(existing?.discFailure ?? 0));
  const [discMaintenance, setDiscMaintenance] = useState(String(existing?.discMaintenance ?? 0));
  const [discNotPermitted, setDiscNotPermitted] = useState(String(existing?.discNotPermitted ?? 0));
  // Side (towards station id) recorded for tags marked "asks for side"
  const [tagSides, setTagSides] = useState<Record<number, number>>(existing?.tagSides ?? {});
  const [error, setError] = useState("");

  // Selecting a station / Rest / Leave / CR / NH. Non-station movements clear the
  // work done field and force TA to zero (no travel allowance).
  const selectMovement = (v: string) => {
    if (v === "rest" || v === "leave" || v === "cr" || v === "nh") {
      setMovementKind(v);
      setLeaveKind("");
      setCrFrom("");
      setCrTo("");
      setWorkDone("");
      setTaPercent("0");
      setMovement(v === "rest" ? "Rest" : v === "leave" ? "Leave" : v === "cr" ? "CR" : "NH");
      return;
    }
    setMovementKind("station");
    setMovement(v);
    setPcdoStationOverride(null);
    const st = stations.find((s) => s.name === v);
    if (st && currentUser?.headquartersStationId != null && st.id === currentUser.headquartersStationId) {
      setTaPercent("0");
    }
  };

  const setLeave = (k: string) => {
    setLeaveKind(k);
    setMovement(`Leave (${k})`);
  };

  const setCrDates = (from: string, to: string) => {
    setCrFrom(from);
    setCrTo(to);
    if (from && to) setMovement(`CR (${fmtDate(from)} → ${fmtDate(to)})`);
    else if (from) setMovement(`CR (from ${fmtDate(from)})`);
    else if (to) setMovement(`CR (till ${fmtDate(to)})`);
    else setMovement("CR");
  };

  // PCDO station mirrors the log entry; when the movement isn't a station
  // (Rest/Leave/CR/NH) it falls back to the manually picked station below.
  const resolvedStation = stations.find((s) => s.name === movement);
  const isHeadquarters = resolvedStation?.id === currentUser?.headquartersStationId;
  const pcdoStationId = resolvedStation?.id ?? pcdoStationOverride ?? null;
  const pcdoDate = logDate;
  const needsSideTags = tags.filter((t) => t.needsSide);
  const kindIntervalDays = (() => {
    for (const id of tagIds) {
      const t = tags.find((x) => x.id === id);
      if (t && t.remindEnabled && t.remindIntervalDays) return t.remindIntervalDays;
    }
    return INSPECTION_RULES[inspectionKind ?? "monthly"].intervalDays;
  })();
  const discTotal =
    (Number(discSpecialWork) || 0) +
    (Number(discFailure) || 0) +
    (Number(discMaintenance) || 0) +
    (Number(discNotPermitted) || 0);

  async function createStation() {
    const name = newStationName.trim();
    if (!name) return;
    const created = await api.stations.create({ name });
    await refresh();
    selectMovement(created.name);
    setNewStationName("");
    setAddingStation(false);
  }

  async function save() {
    setError("");
    if (pcdoOpen && !pcdoStationId) {
      setError("PCDO station not yet selected. Select a station in Station/Movement or pick the PCDO station.");
      return;
    }
    setSaving(true);
    const payload = {
      id: existing?.id,
      logDate,
      stationMovement: movement,
      // Headquarters movements carry no clock times (the Diary prints "AT <HQ>").
      timeDep: movementKind === "station" && !isHeadquarters ? timeDep || null : null,
      timeArr: movementKind === "station" && !isHeadquarters ? timeArr || null : null,
      returnTimeDep: movementKind === "station" && !isHeadquarters ? returnTimeDep || null : null,
      returnTimeArr: movementKind === "station" && !isHeadquarters ? returnTimeArr || null : null,
      movementKind: isSpecial ? movementKind : null,
      leaveKind: movementKind === "leave" ? leaveKind || null : null,
      crFrom: movementKind === "cr" ? crFrom || null : null,
      crTo: movementKind === "cr" ? crTo || null : null,
      workDone: isSpecial ? null : workDone,
      ta: null,
      taPercent: taLocked ? 0 : Number(taPercent) || 0,
      inspectionKind: inspectionKind,
      inspectionStationId: inspectionKind ? pcdoStationId : null,
      inspectionTowardsStationId:
        inspectionKind && inspectionKind !== "footplate" && inspectionSide !== "Both"
          ? inspectionTowardsId
          : null,
      inspectionSide: inspectionKind && inspectionSide === "Both" ? "Both" : null,
      inspectionJointDept: inspectionKind === "joint" ? jointDept || null : null,
      inspectionPeriodicity:
        inspectionKind && PERIODIC_KINDS.includes(inspectionKind) ? periodicity : null,
      // The point oiling / battery cycle is now configured per-tag in Settings
      inspectionRemindDays: null,
      footplateShift:
        inspectionKind === "footplate"
          ? [fpDay ? "Day" : "", fpNight ? "Night" : ""].filter(Boolean).join(",") || null
          : null,
      footplateDirection: null,
      footplateUp: null,
      footplateDown: null,
      footplateDay:
        inspectionKind === "footplate" && fpDay
          ? {
              direction: fpDayDir,
              up: fpDayDir === "Up" || fpDayDir === "Both" ? fpDayUp : null,
              down: fpDayDir === "Down" || fpDayDir === "Both" ? fpDayDn : null,
            }
          : null,
      footplateNight:
        inspectionKind === "footplate" && fpNight
          ? {
              direction: fpNightDir,
              up: fpNightDir === "Up" || fpNightDir === "Both" ? fpNightUp : null,
              down: fpNightDir === "Down" || fpNightDir === "Both" ? fpNightDn : null,
            }
          : null,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
      pcdoWork: pcdoOpen ? pcdoWork : null,
      // PCDO station & date always mirror the log entry
      pcdoStationId: pcdoOpen ? pcdoStationId : null,
      pcdoDate: pcdoOpen ? pcdoDate : null,
      hasDisconnections: discOpen,
      discSpecialWork: discOpen ? Number(discSpecialWork) || 0 : 0,
      discFailure: discOpen ? Number(discFailure) || 0 : 0,
      discMaintenance: discOpen ? Number(discMaintenance) || 0 : 0,
      discNotPermitted: discOpen ? Number(discNotPermitted) || 0 : 0,
      tagIds,
      tagSides,
      attachments,
    };
    if (existing) await api.logs.update(payload);
    else {
      await api.logs.create(payload);
    }
    // Automatic cloud sync (silent, only when switched on and signed in to
    // Drive in the Android app) on any entry, new or edited.
    void autoSync();
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
            value={
              movementKind === "station"
                ? stations.some((s) => s.name === movement)
                  ? movement
                  : ""
                : movementKind
            }
            onChange={(e) => selectMovement(e.target.value)}
          >
            <option value="">— Select movement —</option>
            <option value="" disabled>
              — Stations —
            </option>
            {stations.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
            <option value="" disabled>
              — Movements —
            </option>
            {MOVEMENT_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
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

        {movementKind === "leave" && (
          <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5">
            <p className="mb-1.5 text-xs font-medium text-violet-800">Leave type</p>
            <div className="flex gap-2">
              {LEAVE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLeave(k)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    leaveKind === k
                      ? "border-violet-600 bg-white text-violet-800"
                      : "border-violet-200 text-violet-600"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            {!leaveKind && (
              <p className="mt-1.5 text-xs text-amber-600">Select CL, LAP or SICK.</p>
            )}
          </div>
        )}

        {movementKind === "cr" && (
          <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5">
            <p className="mb-1.5 text-xs font-medium text-sky-800">CR availed on</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-600">From</span>
                <input
                  type="date"
                  className={inputClass}
                  value={crFrom}
                  onChange={(e) => setCrDates(e.target.value, crTo)}
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-600">To</span>
                <input
                  type="date"
                  className={inputClass}
                  value={crTo}
                  onChange={(e) => setCrDates(crFrom, e.target.value)}
                />
              </label>
            </div>
            {!crFrom && !crTo && (
              <p className="mt-1.5 text-xs text-amber-600">Select the date(s) for which CR is availed.</p>
            )}
          </div>
        )}
      </Field>
      <Field label={isSpecial ? "Remarks (optional)" : "Work Done"}>
        <textarea
          className={inputClass}
          rows={4}
          value={workDone}
          disabled={isSpecial}
          placeholder={
            isSpecial
              ? "No work done for Rest / Leave / CR / NH entries."
              : "Describe the work carried out…"
          }
          onChange={(e) => setWorkDone(e.target.value)}
        />
        {isSpecial && (
          <span className="mt-1 block text-xs text-slate-500">
            No work done is recorded for {movementLabel} entries.
          </span>
        )}
      </Field>
      {!isSpecial && !isHeadquarters && !AUTO_TIMINGS && (
        <Field label="Timings">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-600">
                  Time of departure from HQ
                </span>
                <input
                  type="time"
                  className={inputClass}
                  value={timeDep}
                  onChange={(e) => setTimeDep(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-600">
                  Time of arrival at station
                </span>
                <input
                  type="time"
                  className={inputClass}
                  value={timeArr}
                  onChange={(e) => setTimeArr(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-600">
                  Time of departure from station
                </span>
                <input
                  type="time"
                  className={inputClass}
                  value={returnTimeDep}
                  onChange={(e) => setReturnTimeDep(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-600">
                  Time of arrival at HQ
                </span>
                <input
                  type="time"
                  className={inputClass}
                  value={returnTimeArr}
                  onChange={(e) => setReturnTimeArr(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              These times are printed verbatim in the Diary and TA Journal exports.
            </p>
          </div>
        </Field>
      )}
      {isSpecial ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No TA is claimed for {movementLabel} — assumed <strong>0 day</strong>.
        </div>
      ) : (
      <Field label="TA (days)">
        <select
          className={inputClass}
          value={taPercentEffective}
          disabled={taTakenOnSameDate}
          onChange={(e) => setTaPercent(e.target.value)}
        >
          <option value="100">100 % — 1 day</option>
          <option value="70">70 % — 0.7 day</option>
          <option value="30">30 % — 0.3 day</option>
          <option value="0">0 % — 0 day</option>
        </select>
        {taTakenOnSameDate && (
          <span className="mt-1 block text-xs text-amber-600">
            Only one TA claim is allowed per date — this date already has one.
          </span>
        )}
        {isHeadquarters && (
          <span className="mt-1 block text-xs text-slate-500">
            Headquarters station — no travel allowance claimed.
          </span>
        )}
        <span className="mt-1 block text-xs text-slate-500">
          Claiming <strong>{taDays.toFixed(1)} day</strong> at {taPercentEffective}%
        </span>
      </Field>
      )}

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
                  <strong className={pcdoStationId ? "text-slate-900" : "text-amber-600"}>
                    {pcdoStationId
                      ? stations.find((x) => x.id === pcdoStationId)?.name
                      : movement || "not selected above"}
                  </strong>
                </span>
                <span>
                  Date: <strong className="text-slate-900">{logDate}</strong>
                </span>
              </div>
              {!resolvedStation && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    PCDO station{" "}
                    <span className="font-normal text-slate-400">
                      ({movementLabel} entry — pick the station the work was done at)
                    </span>
                  </span>
                  <select
                    className={inputClass}
                    value={pcdoStationOverride ?? ""}
                    onChange={(e) => setPcdoStationOverride(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Select station —</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!pcdoStationId && (
                <p className="mt-1 text-amber-600">
                  Select a station in “Station / Movement” above (or pick the PCDO station) so this work is
                  grouped correctly.
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
            <div className="mt-3 grid grid-cols-2 gap-2">
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
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Not Permitted</span>
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={discNotPermitted}
                  onChange={(e) => setDiscNotPermitted(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-xs font-semibold text-amber-900">
              Total disconnections: {discTotal}
            </p>
            {!resolvedStation && (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Disconnection station{" "}
                  <span className="font-normal text-slate-500">(shared with the PCDO station above)</span>
                </span>
                <select
                  className={inputClass}
                  value={pcdoStationOverride ?? ""}
                  onChange={(e) => setPcdoStationOverride(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— Select station —</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {!pcdoStationOverride && (
                  <span className="mt-1 block text-xs text-amber-600">
                    Pick a station so these disconnections are grouped correctly in the PCDO export.
                  </span>
                )}
              </label>
            )}
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
              onClick={() => {
                if (tagIds.includes(t.id)) {
                  setTagIds((prev) => prev.filter((x) => x !== t.id));
                  setTagSides((prev) => {
                    const next = { ...prev };
                    delete next[t.id];
                    return next;
                  });
                } else {
                  setTagIds((prev) => [...prev, t.id]);
                }
              }}
            />
          ))}
        </div>
        {tagIds.length > 0 && needsSideTags.length > 0 && (
          <div className="mt-2 space-y-3">
            {needsSideTags
              .filter((t) => tagIds.includes(t.id))
              .map((t) => (
                <label key={t.id} className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    {t.name} — towards which side?
                  </span>
                  <select
                    className={inputClass}
                    value={tagSides[t.id] ?? ""}
                    onChange={(e) =>
                      setTagSides((prev) => ({
                        ...prev,
                        [t.id]: e.target.value ? Number(e.target.value) : 0,
                      }))
                    }
                  >
                    <option value="">— Select side —</option>
                    <option value="0">Both sides</option>
                    {stations
                      .filter((st) => st.id !== resolvedStation?.id)
                      .map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} side
                        </option>
                      ))}
                  </select>
                  {!tagSides[t.id] && (
                    <span className="mt-1 block text-xs text-amber-600">
                      Select the side this work was done towards.
                    </span>
                  )}
                </label>
              ))}
          </div>
        )}
      </Field>
      {inspectionKind && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
          <p className="text-sm font-semibold text-sky-900">
            {INSPECTION_RULES[inspectionKind].label}
          </p>
          <p className="mt-1 text-xs text-sky-800">
            Done at{" "}
            <strong className={pcdoStationId ? "" : "text-amber-600"}>
              {pcdoStationId
                ? stations.find((x) => x.id === pcdoStationId)?.name
                : movement || "no station selected above"}
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
              value={inspectionSide === "Both" ? "__both__" : inspectionTowardsId ?? ""}
              onChange={(e) => {
                if (e.target.value === "__both__") {
                  setInspectionTowardsId(null);
                  setInspectionSide("Both");
                } else {
                  setInspectionSide("");
                  setInspectionTowardsId(e.target.value ? Number(e.target.value) : null);
                }
              }}
            >
              <option value="">— Select side —</option>
              <option value="__both__">Both sides</option>
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
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Day or Night? <span className="font-normal text-slate-400">(select both if applicable)</span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFpDay((v) => !v)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      fpDay
                        ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    ☀ Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setFpNight((v) => !v)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      fpNight
                        ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    🌙 Night
                  </button>
                </div>
              </label>

              {!fpDay && !fpNight && (
                <span className="mt-1 block text-xs text-amber-600">
                  Select Day and/or Night — you can record both in one entry.
                </span>
              )}

              {fpDay && (
                <ShiftDetails
                  label="☀ Day"
                  direction={fpDayDir}
                  setDirection={setFpDayDir}
                  up={fpDayUp}
                  setUp={setFpDayUp}
                  down={fpDayDn}
                  setDown={setFpDayDn}
                />
              )}
              {fpNight && (
                <ShiftDetails
                  label="🌙 Night"
                  direction={fpNightDir}
                  setDirection={setFpNightDir}
                  up={fpNightUp}
                  setUp={setFpNightUp}
                  down={fpNightDn}
                  setDown={setFpNightDn}
                />
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
            resolvedStation && (fpDay || fpNight) ? (
              <p className="mt-1.5 text-xs text-sky-800">
                <strong>
                  {[fpDay ? "Day" : "", fpNight ? "Night" : ""].filter(Boolean).join(" + ")}
                </strong>{" "}
                footplate at <strong>{resolvedStation.name}</strong> · {periodicity} cycle — next due{" "}
                <strong>{addDays(logDate, intervalFor(inspectionKind, periodicity))}</strong>.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-amber-600">
                Select the station above, then Day and/or Night.
              </p>
            )
          ) : pcdoStationId && (inspectionSide === "Both" || inspectionTowardsId) ? (
            <p className="mt-1.5 text-xs text-sky-800">
              At <strong>{stations.find((x) => x.id === pcdoStationId)?.name}</strong> towards{" "}
              <strong>
                {inspectionSide === "Both"
                  ? "Both sides"
                  : `${stations.find((x) => x.id === inspectionTowardsId)?.name} side`}
              </strong>
              {inspectionKind === "joint" && jointDept ? ` with ${jointDept}` : ""} · recurs every{" "}
              {kindIntervalDays} days — next due{" "}
              <strong>{addDays(logDate, kindIntervalDays)}</strong>.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-amber-600">
              Select the station and the side here so this inspection is tracked.
            </p>
          )}
        </div>
      )}

      <AttachmentField value={attachments} onChange={setAttachments} />
      <div className="mt-4 flex justify-end">
        {error && <p className="mr-3 text-sm font-medium text-red-600">{error}</p>}
        <PrimaryButton onClick={save}>{saving ? "Saving…" : "Save Log"}</PrimaryButton>
      </div>
    </Modal>
  );
}

export function DeficiencyForm({
  open,
  onClose,
  existing,
  defaultStationId,
}: {
  open: boolean;
  onClose: () => void;
  existing?: DeficiencyTask | null;
  /** Suggested "Affected Station", e.g. the station of the most recent daily
   * log entry; the user can still change it. Ignored when `existing` is set. */
  defaultStationId?: number | null;
}) {
  const { stations, staff, refresh, autoSync } = useData();
  const [department, setDepartment] = useState(existing?.department ?? "Signalling");
  const [stationId, setStationId] = useState<number | null>(existing?.stationId ?? defaultStationId ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [priority, setPriority] = useState(existing?.priority ?? "Normal");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
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
      attachments,
    };
    if (existing) await api.deficiencies.update(payload);
    else await api.deficiencies.create(payload);
    void autoSync();
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
      <AttachmentField value={attachments} onChange={setAttachments} />
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
  convertFrom,
}: {
  open: boolean;
  onClose: () => void;
  existing?: PlannedWork | null;
  /** When set, the form starts pre-filled from a deficiency and converts it
   * into a planned work (the deficiency is marked Complete on save). */
  convertFrom?: DeficiencyTask | null;
}) {
  const { stations, refresh, currentUser, autoSync } = useData();
  const [title, setTitle] = useState(existing?.title ?? convertFrom?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? convertFrom?.description ?? "");
  const [plannedDate, setPlannedDate] = useState(
    existing?.plannedDate ?? convertFrom?.dueDate ?? toISODate(new Date())
  );
  const [stationId, setStationId] = useState<number | null>(
    existing?.stationId ?? convertFrom?.stationId ?? null
  );
  const [department, setDepartment] = useState(
    existing?.department ?? convertFrom?.department ?? "Signalling"
  );
  const [materialRemarks, setMaterialRemarks] = useState(existing?.materialRemarks ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = {
      id: existing?.id,
      title,
      description,
      plannedDate,
      stationId,
      department,
      materialRemarks,
      attachments,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
    };
    if (existing) await api.planned.update(payload);
    else await api.planned.create(payload);
    // Converting: the deficiency it came from becomes Complete so the two
    // records don't both stay open for the same piece of work.
    if (convertFrom && !existing) {
      await api.deficiencies.update({ id: convertFrom.id, status: "Completed" });
    }
    void autoSync();
    await refresh();
    setSaving(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={convertFrom ? "Convert Deficiency to Planned Work" : existing ? "Edit Planned Work" : "Add Future Planned Work"}
    >
      {convertFrom && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Converting the deficiency “{convertFrom.title}” — saving marks it{" "}
          <strong>Complete</strong> and creates a planned work.
        </div>
      )}
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
      <Field label="Department">
        <select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
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
      <AttachmentField value={attachments} onChange={setAttachments} />
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

function ShiftDetails({
  label,
  direction,
  setDirection,
  up,
  setUp,
  down,
  setDown,
}: {
  label: string;
  direction: string;
  setDirection: (v: string) => void;
  up: FootplateDetail;
  setUp: (v: FootplateDetail) => void;
  down: FootplateDetail;
  setDown: (v: FootplateDetail) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-cyan-200 bg-white p-2.5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-800">{label}</p>
      <span className="mb-1 block text-[11px] text-slate-600">Direction</span>
      <div className="flex gap-2">
        {FOOTPLATE_DIRECTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
              direction === d
                ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                : "border-slate-300 text-slate-600"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      {direction === "Up" && <TrainDetails label={`${label} Up Train`} value={up} onChange={setUp} />}
      {direction === "Down" && <TrainDetails label={`${label} Down Train`} value={down} onChange={setDown} />}
      {direction === "Both" && (
        <>
          <TrainDetails label={`${label} Up Train`} value={up} onChange={setUp} />
          <TrainDetails label={`${label} Down Train`} value={down} onChange={setDown} />
        </>
      )}
    </div>
  );
}

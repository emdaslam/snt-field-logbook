"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, Field, inputClass, Chip, PrimaryButton } from "./ui";
import { api, toISODate, fmtDate, pcdoWorkEntries } from "@/lib/api";
import {
  DEPARTMENTS,
  PRIORITIES,
  LEAVE_KINDS,
  MOVEMENT_TYPES,
  MOVEMENT_LABEL,
  DEPARTMENT_COLORS,
  COUNTER_EQUIPMENT,
  variableKmText,
  type PcdoWork,
  type CounterReset,
} from "@/lib/types";
import { AUTO_TIMINGS } from "@/lib/timingsMode";
import { tripTimes, journeyTrainTimes } from "@/lib/travel";
import { loadTaGenConfig, type TaRateKey } from "@/lib/taGenConfig";
import { EMPTY_STATION_DRAFT, StationFields, stationPayload, type StationDraft } from "./StationForm";
import {
  kindFromTags,
  kindFromTagName,
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
  FootplateBlock,
  FootplateJourneyTrain,
  JourneyLeg,
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

/** One journey leg of the Travel Details block: a By Road / By Train toggle
 *  (Road is the default) and, when By Train is chosen, a train number field. */
function TravelLeg({
  title,
  mode,
  setMode,
  trainNo,
  setTrainNo,
}: {
  title: string;
  mode: "road" | "train";
  setMode: (m: "road" | "train") => void;
  trainNo: string;
  setTrainNo: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600">{title}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("road")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
            mode === "road"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-300 text-slate-600"
          }`}
        >
          By Road
        </button>
        <button
          type="button"
          onClick={() => setMode("train")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
            mode === "train"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-300 text-slate-600"
          }`}
        >
          By Train
        </button>
      </div>
      {mode === "train" && (
        <label className="mt-1.5 block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Train No</span>
          <input
            type="text"
            className={inputClass}
            value={trainNo}
            placeholder="e.g. 12626"
            onChange={(e) => setTrainNo(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

/** One editable journey leg in the custom-export-rows editor. */
function JourneyLegRow({
  leg,
  stationsList,
  hqName,
  onChange,
  onRemove,
  canRemove,
}: {
  leg: JourneyLeg;
  stationsList: Array<{ id?: number; name: string; code: string }>;
  hqName: string;
  onChange: (l: JourneyLeg) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [showOtherFrom, setShowOtherFrom] = useState(
    !stationsList.some((s) => s.name === leg.from || s.code === leg.from) && leg.from !== hqName
  );
  const [showOtherTo, setShowOtherTo] = useState(
    !stationsList.some((s) => s.name === leg.to || s.code === leg.to) && leg.to !== hqName
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">Leg</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">From</span>
          {!showOtherFrom ? (
            <select
              className={inputClass}
              value={leg.from === hqName ? hqName : leg.from}
              onChange={(e) => {
                if (e.target.value === "___other") {
                  setShowOtherFrom(true);
                  return;
                }
                onChange({ ...leg, from: e.target.value });
              }}
            >
              <option value={hqName}>HQ ({hqName})</option>
              {stationsList.map((s) => (
                <option key={s.id ?? s.name} value={s.code?.trim() ? s.code : s.name}>
                  {s.name}
                  {s.code?.trim() ? ` (${s.code})` : ""}
                </option>
              ))}
              <option value="___other">— Other —</option>
            </select>
          ) : (
            <input
              type="text"
              className={inputClass}
              value={leg.from}
              placeholder="Free text…"
              onChange={(e) => {
                onChange({ ...leg, from: e.target.value });
                if (e.target.value && stationsList.some((s) => s.name === e.target.value || s.code === e.target.value)) {
                  setShowOtherFrom(false);
                }
              }}
              onBlur={() => {
                if (!leg.from.trim()) setShowOtherFrom(false);
              }}
            />
          )}
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">To</span>
          {!showOtherTo ? (
            <select
              className={inputClass}
              value={leg.to === hqName ? hqName : leg.to}
              onChange={(e) => {
                if (e.target.value === "___other") {
                  setShowOtherTo(true);
                  return;
                }
                onChange({ ...leg, to: e.target.value });
              }}
            >
              <option value="">— Select —</option>
              {stationsList.map((s) => (
                <option key={s.id ?? s.name} value={s.code?.trim() ? s.code : s.name}>
                  {s.name}
                  {s.code?.trim() ? ` (${s.code})` : ""}
                </option>
              ))}
              <option value="___other">— Other —</option>
            </select>
          ) : (
            <input
              type="text"
              className={inputClass}
              value={leg.to}
              placeholder="Free text…"
              onChange={(e) => {
                onChange({ ...leg, to: e.target.value });
                if (e.target.value && stationsList.some((s) => s.name === e.target.value || s.code === e.target.value)) {
                  setShowOtherTo(false);
                }
              }}
              onBlur={() => {
                if (!leg.to.trim()) setShowOtherTo(false);
              }}
            />
          )}
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Time dept</span>
          <input
            type="time"
            className={inputClass}
            value={leg.timeDep ?? ""}
            onChange={(e) => onChange({ ...leg, timeDep: e.target.value || null })}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Time arr</span>
          <input
            type="time"
            className={inputClass}
            value={leg.timeArr ?? ""}
            onChange={(e) => onChange({ ...leg, timeArr: e.target.value || null })}
          />
        </label>
      </div>
      <div className="mt-2">
        <TravelLeg
          title=""
          mode={leg.mode}
          setMode={(m) => onChange({ ...leg, mode: m })}
          trainNo={leg.trainNo}
          setTrainNo={(v) => onChange({ ...leg, trainNo: v })}
        />
      </div>
    </div>
  );
}

export function DailyLogForm({
  open,
  onClose,
  existing,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  existing?: DailyLog | null;
  initialDate?: string;
}) {
  const { tags, stations, logs, refresh, currentUser, autoSync } = useData();
  const [logDate, setLogDate] = useState(existing?.logDate ?? initialDate ?? toISODate(new Date()));
  const [movement, setMovement] = useState(existing?.stationMovement ?? "");
  const [timeDep, setTimeDep] = useState(existing?.timeDep ?? (!AUTO_TIMINGS ? "08:00" : ""));
  const [timeArr, setTimeArr] = useState(existing?.timeArr ?? (!AUTO_TIMINGS ? "09:00" : ""));
  const [returnTimeDep, setReturnTimeDep] = useState(
    existing?.returnTimeDep ?? (!AUTO_TIMINGS ? "16:30" : "")
  );
  const [returnTimeArr, setReturnTimeArr] = useState(
    existing?.returnTimeArr ?? (!AUTO_TIMINGS ? "17:30" : "")
  );
  // How the HQ → station journey was made: "road" (default) or "train", with
  // the train number when by train. The same pair describes the return journey.
  const [travelMode, setTravelMode] = useState<"road" | "train">(
    existing?.travelMode === "train" ? "train" : "road"
  );
  const [travelTrainNo, setTravelTrainNo] = useState(existing?.travelTrainNo ?? "");
  const [returnMode, setReturnMode] = useState<"road" | "train">(
    existing?.returnMode === "train" ? "train" : "road"
  );
  const [returnTrainNo, setReturnTrainNo] = useState(existing?.returnTrainNo ?? "");
  // Custom export rows — when ON the user edits individual Diary / TA rows
  // directly. When OFF the existing fixed Timings + Travel Details sections
  // drive the exports (default two-leg layout). Saved as `journeyLegs` on the
  // log; an empty array means "not customised".
  const [editExportRows, setEditExportRows] = useState<boolean>(
    Array.isArray(existing?.journeyLegs) && existing.journeyLegs.length > 0
  );
  const [journeyLegs, setJourneyLegs] = useState<JourneyLeg[]>(() => {
    if (Array.isArray(existing?.journeyLegs) && existing.journeyLegs.length > 0) {
      return existing.journeyLegs as JourneyLeg[];
    }
    return [];
  });
  // HQ station name (code when set, else name) used as default From / To for
  // auto-generated legs so the rows mirror the actual export output.
  const hqStation = stations.find(
    (s) => s.id === currentUser?.headquartersStationId
  );
  const hqName = hqStation?.code?.trim() ? hqStation.code : hqStation?.name || "";
  // Additional movement stops for the same entry. Selecting two or more
  // movements (the first in the Station/Movement picker, the rest below it)
  // turns the entry into an editable export-row chain: HQ → m0 → m1 → … → HQ.
  const [extraMovements, setExtraMovements] = useState<string[]>(() => {
    const legs = existing?.journeyLegs;
    if (!Array.isArray(legs) || legs.length === 0) return [];
    const stops = legs.map((l) => l.to).filter((t): t is string => Boolean(t));
    // The final leg normally returns to HQ — drop that trailing stop.
    if (stops.length > 1 && stops[stops.length - 1] === hqName) stops.pop();
    if (stops.length <= 1) return [];
    return stops.slice(1).map((v) => {
      const st = stations.find((s) => s.code === v || s.name === v);
      return st ? st.name : v;
    });
  });
  // The exports print station codes (or the name when a station has no code),
  // so the chain legs use the same label the default two-leg layout prints.
  const legLabel = (v: string) => {
    const st = stations.find((s) => s.name === v || s.code === v);
    return st?.code?.trim() ? st.code : st?.name || v;
  };
  // Rebuild journeyLegs from a movement chain. Times / modes are reused from
  // matching legs so edits survive movement changes; the first and last legs
  // default to the outward / return values typed in the Timings fields.
  const syncLegs = (chain: string[]) => {
    const filled = chain.filter((m) => m.trim());
    if (filled.length < 2) {
      setEditExportRows(false);
      setJourneyLegs([]);
      return;
    }
    setEditExportRows(true);
    setJourneyLegs((cur) => {
      const nodes = [hqName, ...filled.map(legLabel), hqName];
      const legs: JourneyLeg[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        const from = nodes[i];
        const to = nodes[i + 1];
        const prev = cur.find((l) => l.from === from && l.to === to);
        const last = i === nodes.length - 2;
        legs.push(
          prev ?? {
            from,
            to,
            timeDep: last ? returnTimeDep || null : i === 0 ? timeDep || null : null,
            timeArr: last ? returnTimeArr || null : i === 0 ? timeArr || null : null,
            mode: last ? returnMode : i === 0 ? travelMode : "road",
            trainNo: last ? returnTrainNo : i === 0 ? travelTrainNo : "",
          }
        );
      }
      return legs;
    });
  };
  const addExtraMovement = () => setExtraMovements((prev) => [...prev, ""]);
  const changeExtraMovement = (i: number, v: string) => {
    const next = extraMovements.map((m, idx) => (idx === i ? v : m));
    setExtraMovements(next);
    syncLegs([movement, ...next]);
  };
  const removeExtraMovement = (i: number) => {
    const next = extraMovements.filter((_, idx) => idx !== i);
    setExtraMovements(next);
    syncLegs([movement, ...next]);
  };
  const [movementKind, setMovementKind] = useState<"station" | "rest" | "leave" | "cr" | "nh" | "footplate">(
    existing?.movementKind === "rest" ||
      existing?.movementKind === "leave" ||
      existing?.movementKind === "cr" ||
      existing?.movementKind === "nh" ||
      existing?.movementKind === "footplate"
      ? existing.movementKind
      : "station"
  );
  const [leaveKind, setLeaveKind] = useState(existing?.leaveKind ?? "");
  const [crFrom, setCrFrom] = useState(existing?.crFrom ?? "");
  const [workDone, setWorkDone] = useState(existing?.workDone ?? "");
  const [taPercent, setTaPercent] = useState(String(existing?.taPercent ?? 70));
  // For stations with a variable distance (one side ≤ 8 km, the other > 8 km):
  // whether the day's work was done at/after the station's KMs marker, which is
  // what makes the entry claimable in the TA Journal.
  const [taAtVariableKm, setTaAtVariableKm] = useState<boolean | null>(
    existing?.taAtVariableKm ?? null
  );
  const [tagIds, setTagIds] = useState<number[]>(existing?.tagIds ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [inspectionSide, setInspectionSide] = useState(existing?.inspectionSide ?? "");
  const taTakenOnSameDate = logs.some(
    (l) => l.logDate === logDate && l.id !== existing?.id && (l.taPercent ?? 0) > 0
  );
  const isSpecial =
    movementKind === "rest" || movementKind === "leave" || movementKind === "cr" || movementKind === "nh";
  const movementLabel = MOVEMENT_LABEL[movementKind] ?? movementKind;
  // Rest / Leave / CR and a date that already has a TA claim: no TA for this entry
  const taLocked = isSpecial || taTakenOnSameDate;
  // A station with a variable distance only qualifies for TA when the work was
  // done at/after its KMs marker (the "greater than 8 km" side).
  const variableStation = stations.find((s) => s.name === movement);
  const isVariableSplit =
    movementKind === "station" &&
    variableStation?.distanceFromHq === "variable" &&
    currentUser?.headquartersStationId != null &&
    variableStation.id !== currentUser.headquartersStationId;
  const variableKm = isVariableSplit ? variableKmText(variableStation.variableKm) : null;
  const variableTaPending = isVariableSplit && taAtVariableKm !== true;
  const taPercentEffective = taLocked || variableTaPending ? "0" : taPercent;
  const selectedTagNames = tagIds
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const inspectionKind = kindFromTags(selectedTagNames);
  const [saving, setSaving] = useState(false);
  const [addingStation, setAddingStation] = useState(false);
  const [newStationDraft, setNewStationDraft] = useState<StationDraft>(EMPTY_STATION_DRAFT);
  const [pcdoOpen, setPcdoOpen] = useState(pcdoWorkEntries(existing).length > 0);
  const [pcdoWorks, setPcdoWorks] = useState<PcdoWork[]>(pcdoWorkEntries(existing));
  const togglePcdoDept = (dept: string) => {
    setPcdoWorks((prev) =>
      prev.some((w) => w.department === dept)
        ? prev.filter((w) => w.department !== dept)
        : [...prev, { department: dept, work: "" }]
    );
  };
  const setPcdoWork = (dept: string, work: string) => {
    setPcdoWorks((prev) => prev.map((w) => (w.department === dept ? { ...w, work } : w)));
  };
  // PCDO, disconnections and counters share one station — the movement station
  // by default, overridable to any other station. This holds the manual pick so
  // it survives a movement switch and non-station (Rest/Leave/CR/NH) entries.
  const [pcdoStationOverride, setPcdoStationOverride] = useState<number | null>(() => {
    if (!existing?.pcdoStationId) return null;
    const mv = stations.find((s) => s.name === existing.stationMovement);
    if (!mv) return existing.pcdoStationId;
    return mv.id === existing.pcdoStationId ? null : existing.pcdoStationId;
  });
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
  const emptyFp: FootplateJourneyTrain = {
    trainNo: "",
    engineNo: "",
    lpName: "",
    alpName: "",
    tmrName: "",
    remarks: "",
    depTime: "",
    arrTime: "",
  };
  const fpBlock = (b: FootplateBlock | null | undefined) => ({
    direction: (b && "direction" in b && b.direction) || "",
    up: b && "direction" in b && b.up ? { ...emptyFp, ...b.up } : { ...emptyFp },
    down: b && "direction" in b && b.down ? { ...emptyFp, ...b.down } : { ...emptyFp },
  });
  const dayBlock = fpBlock(existing?.footplateDay);
  const nightBlock = fpBlock(existing?.footplateNight);
  const [fpDayDir, setFpDayDir] = useState(dayBlock.direction);
  const [fpDayUp, setFpDayUp] = useState<FootplateJourneyTrain>(dayBlock.up);
  const [fpDayDn, setFpDayDn] = useState<FootplateJourneyTrain>(dayBlock.down);
  const [fpNightDir, setFpNightDir] = useState(nightBlock.direction);
  const [fpNightUp, setFpNightUp] = useState<FootplateJourneyTrain>(nightBlock.up);
  const [fpNightDn, setFpNightDn] = useState<FootplateJourneyTrain>(nightBlock.down);
  const journey = existing?.footplateJourney ?? null;
  const [fpBoardingId, setFpBoardingId] = useState<number | null>(journey?.boardingStationId ?? null);
  const [fpOtherEndId, setFpOtherEndId] = useState<number | null>(journey?.otherEndStationId ?? null);
  const [discOpen, setDiscOpen] = useState(Boolean(existing?.hasDisconnections));
  const [discSpecialWork, setDiscSpecialWork] = useState(String(existing?.discSpecialWork ?? 0));
  const [discFailure, setDiscFailure] = useState(String(existing?.discFailure ?? 0));
  const [discMaintenance, setDiscMaintenance] = useState(String(existing?.discMaintenance ?? 0));
  const [discNotPermitted, setDiscNotPermitted] = useState(String(existing?.discNotPermitted ?? 0));
  const [countersOpen, setCountersOpen] = useState((existing?.counterResets?.length ?? 0) > 0);
  const [counterRows, setCounterRows] = useState<CounterReset[]>(
    existing?.counterResets?.length ? existing.counterResets : []
  );
  const emptyCounter: CounterReset = { equipment: "MSDAC", stationId: null, nextStationId: null, failures: 0, testing: 0 };
  const addCounterRow = () => setCounterRows((prev) => [...prev, { ...emptyCounter }]);
  const updateCounterRow = (i: number, patch: Partial<CounterReset>) =>
    setCounterRows((prev) => prev.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const removeCounterRow = (i: number) => setCounterRows((prev) => prev.filter((_, x) => x !== i));
  // Side (towards station id) recorded for tags marked "asks for side"
  const [tagSides, setTagSides] = useState<Record<number, number>>(existing?.tagSides ?? {});
  const [error, setError] = useState("");

  // Selecting a station / Rest / Leave / CR / NH. Non-station movements clear the
  // work done field and force TA to zero (no travel allowance) — except
  // Footplate, which is a working tour and keeps both.
  const selectMovement = (v: string) => {
    if (v === "footplate") {
      setMovementKind("footplate");
      setMovement("Footplate");
      setExtraMovements([]);
      setEditExportRows(false);
      setJourneyLegs([]);
      return;
    }
    if (v === "rest" || v === "leave" || v === "cr" || v === "nh") {
      setMovementKind(v);
      setLeaveKind("");
      setCrFrom("");
      setWorkDone("");
      setTaPercent("0");
      setMovement(v === "rest" ? "Rest" : v === "leave" ? "Leave" : v === "cr" ? "CR" : "NH");
      setExtraMovements([]);
      setEditExportRows(false);
      setJourneyLegs([]);
      return;
    }
    setMovementKind("station");
    setMovement(v);
    setTaAtVariableKm(null);
    const st = stations.find((s) => s.name === v);
    if (st && currentUser?.headquartersStationId != null && st.id === currentUser.headquartersStationId) {
      setTaPercent("0");
    }
    syncLegs([v, ...extraMovements]);
  };

  const setLeave = (k: string) => {
    setLeaveKind(k);
    setMovement(`Leave (${k})`);
  };

  const setCrDate = (d: string) => {
    setCrFrom(d);
    setMovement(d ? `CR (worked ${fmtDate(d)})` : "CR");
  };

  // PCDO station mirrors the log entry; when the movement isn't a station
  // (Rest/Leave/CR/NH) it falls back to the manually picked station below.
  const resolvedStation = stations.find((s) => s.name === movement);
  const isHeadquarters = resolvedStation?.id === currentUser?.headquartersStationId;
  // Footplate movement helpers — boarding / other-end stations and the summary
  // text stored in stationMovement and printed in the Diary / TA exports.
  const fpBoarding = stations.find((s) => s.id === fpBoardingId);
  const fpOtherEnd = stations.find((s) => s.id === fpOtherEndId);
  const fpMovementText =
    movementKind === "footplate" && fpBoarding && fpOtherEnd
      ? `Footplate: ${fpBoarding.name} → ${fpOtherEnd.name}`
      : "Footplate";
  const pcdoStationId = pcdoStationOverride ?? resolvedStation?.id ?? null;
  const pcdoDate = logDate;
  const needsSideTags = tags.filter((t) => t.needsSide && !kindFromTagName(t.name));
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
  const counterTotal = counterRows.reduce(
    (n, r) => n + (Number(r.failures) || 0) + (Number(r.testing) || 0),
    0
  );

  // Auto-timings build — the four tour times (and the footplate train-leg
  // times) are pre-filled from the TA rate's window and the station's travel
  // range, exactly as the exports would generate them. A field shows its
  // generated value only until the user types something into it; whatever is
  // typed is what gets stored and printed, so untouched fields keep following
  // the auto-generation settings on every export.
  const autoGenTimes = useMemo(() => {
    if (!AUTO_TIMINGS) return null;
    if (isSpecial || isHeadquarters) return null;
    const win = loadTaGenConfig();
    const pct = Number(taPercentEffective) || 0;
    const rate: TaRateKey = pct === 100 || pct === 30 ? (String(pct) as TaRateKey) : "70";
    if (movementKind === "footplate") {
      const boarding = stations.find((s) => s.id === fpBoardingId);
      if (!boarding) return null;
      const g = tripTimes(logDate, pct, boarding.travelMin, boarding.travelMax, win[rate]);
      // The Day/Night Up/Down trains in the same order the exports emit them;
      // each gets its own slot within the boarding-station window.
      const trains: Array<{ key: string; train: FootplateJourneyTrain }> = [];
      const push = (
        upKey: string,
        dnKey: string,
        active: boolean,
        dir: string,
        up: FootplateJourneyTrain,
        dn: FootplateJourneyTrain
      ) => {
        if (!active) return;
        if ((dir === "Up" || dir === "Both") && up.trainNo) trains.push({ key: upKey, train: up });
        if ((dir === "Down" || dir === "Both") && dn.trainNo) trains.push({ key: dnKey, train: dn });
      };
      push("dayUp", "dayDn", fpDay, fpDayDir, fpDayUp, fpDayDn);
      push("nightUp", "nightDn", fpNight, fpNightDir, fpNightUp, fpNightDn);
      const fpShown: Record<string, { depTime: string; arrTime: string }> = {};
      if (trains.length > 0) {
        const slots = journeyTrainTimes(
          logDate,
          pct,
          boarding.travelMin,
          boarding.travelMax,
          trains.length,
          win[rate]
        );
        trains.forEach((tr, i) => {
          const s = slots[i];
          fpShown[tr.key] = {
            depTime: tr.train.depTime || s.dep || "",
            arrTime: tr.train.arrTime || s.arr || "",
          };
        });
      }
      return {
        base: { outDep: g.outDep, outArr: g.outArr, retDep: g.retDep, retArr: g.retArr },
        fpShown,
      };
    }
    const st = stations.find((s) => s.name === movement);
    if (!st) return null;
    const g = tripTimes(logDate, pct, st.travelMin, st.travelMax, win[rate]);
    return {
      base: { outDep: g.outDep, outArr: g.outArr, retDep: g.retDep, retArr: g.retArr },
      fpShown: {},
    };
  }, [
    movementKind,
    movement,
    logDate,
    taPercentEffective,
    fpBoardingId,
    fpDay,
    fpNight,
    fpDayDir,
    fpDayUp,
    fpDayDn,
    fpNightDir,
    fpNightUp,
    fpNightDn,
    stations,
    isSpecial,
    isHeadquarters,
  ]);
  // The values shown in the timing fields: the user's own value when one has
  // been typed (or was stored), else the derived auto-generated one.
  const shownDep = AUTO_TIMINGS ? timeDep || autoGenTimes?.base.outDep || "" : timeDep;
  const shownArr = AUTO_TIMINGS ? timeArr || autoGenTimes?.base.outArr || "" : timeArr;
  const shownRetDep = AUTO_TIMINGS ? returnTimeDep || autoGenTimes?.base.retDep || "" : returnTimeDep;
  const shownRetArr = AUTO_TIMINGS ? returnTimeArr || autoGenTimes?.base.retArr || "" : returnTimeArr;
  const shownFpTrain = (key: string, train: FootplateJourneyTrain): FootplateJourneyTrain => {
    const slot = AUTO_TIMINGS ? autoGenTimes?.fpShown?.[key] : undefined;
    return slot
      ? { ...train, depTime: train.depTime || slot.depTime, arrTime: train.arrTime || slot.arrTime }
      : train;
  };
  const shownFpDayUp = shownFpTrain("dayUp", fpDayUp);
  const shownFpDayDn = shownFpTrain("dayDn", fpDayDn);
  const shownFpNightUp = shownFpTrain("nightUp", fpNightUp);
  const shownFpNightDn = shownFpTrain("nightDn", fpNightDn);

  async function createStation() {
    if (!newStationDraft.name.trim()) return;
    const created = await api.stations.create(stationPayload(newStationDraft));
    await refresh();
    selectMovement(created.name);
    setNewStationDraft(EMPTY_STATION_DRAFT);
    setAddingStation(false);
  }

  async function save() {
    setError("");
    if (pcdoOpen && !pcdoStationId) {
      setError("PCDO station not yet selected. Select a station in Station/Movement or pick the PCDO station.");
      return;
    }
    if (pcdoOpen && !pcdoWorks.some((w) => w.work.trim())) {
      setError("Enter the PCDO special work for at least one department.");
      return;
    }
    if (countersOpen) {
      for (const r of counterRows) {
        const hasCount = (Number(r.failures) || 0) + (Number(r.testing) || 0) > 0;
        if (r.equipment !== "MSDAC" && hasCount) {
          if (movementKind !== "station") {
            if (!r.stationId || !r.nextStationId) {
              setError(`Select both stations for the ${r.equipment} counter reset.`);
              return;
            }
            if (r.stationId === r.nextStationId) {
              setError(`The two stations for the ${r.equipment} counter reset must be different.`);
              return;
            }
          } else if (!r.nextStationId) {
            setError(`Select the next station for the ${r.equipment} counter reset.`);
            return;
          }
        }
      }
    }
    setSaving(true);
    const isFp = movementKind === "footplate";
    const fpShift = isFp
      ? [fpDay ? "Day" : "", fpNight ? "Night" : ""].filter(Boolean).join(",") || null
      : null;
    const strip = (t: FootplateJourneyTrain | null): FootplateJourneyTrain | null =>
      t && (t.trainNo || t.engineNo || t.lpName || t.alpName || t.tmrName || t.remarks)
        ? {
            trainNo: t.trainNo,
            engineNo: t.engineNo,
            lpName: t.lpName,
            alpName: t.alpName,
            tmrName: t.tmrName,
            remarks: t.remarks,
            depTime: t.depTime,
            arrTime: t.arrTime,
          }
        : null;
    // A footplate movement is itself the footplate inspection: each selected
    // shift (Day / Night) records its own direction and Up/Down train details.
    const fpBlock = (
      shiftActive: boolean,
      dir: string,
      up: FootplateJourneyTrain,
      down: FootplateJourneyTrain
    ): FootplateBlock | null => {
      if (!shiftActive) return null;
      if (dir === "Up") return { direction: "Up", up: strip(up), down: null };
      if (dir === "Down") return { direction: "Down", up: null, down: strip(down) };
      return { direction: "Both", up: strip(up), down: strip(down) };
    };
    const payload = {
      id: existing?.id,
      logDate,
      stationMovement: isFp ? fpMovementText : movement,
      // Headquarters movements carry no clock times (the Diary prints "AT <HQ>").
      // In the auto-timings build a field only holds a value once the user typed
      // one (or an entry already stores one) — untouched fields stay null so the
      // exports keep generating them from the TA settings.
      // When custom export rows are active, mirror the first / last leg back
      // into the legacy time fields so the LogDetail modal and auto-gen still
      // have something to show.
      timeDep:
        (movementKind === "station" || isFp) && !isHeadquarters ?
          (editExportRows && journeyLegs.length > 0
            ? (journeyLegs[0].timeDep || null)
            : timeDep || null)
          : null,
      timeArr:
        (movementKind === "station" || isFp) && !isHeadquarters ?
          (editExportRows && journeyLegs.length > 0
            ? (journeyLegs[0].timeArr || null)
            : timeArr || null)
          : null,
      returnTimeDep:
        (movementKind === "station" || isFp) && !isHeadquarters ?
          (editExportRows && journeyLegs.length > 0
            ? (journeyLegs[journeyLegs.length - 1].timeDep || null)
            : returnTimeDep || null)
          : null,
      returnTimeArr:
        (movementKind === "station" || isFp) && !isHeadquarters ?
          (editExportRows && journeyLegs.length > 0
            ? (journeyLegs[journeyLegs.length - 1].timeArr || null)
            : returnTimeArr || null)
          : null,
      // Travel mode for the HQ → station journey and (when by train) its number
      travelMode:
        (movementKind === "station" || isFp) && !isHeadquarters ?
          (editExportRows && journeyLegs.length > 0 ? journeyLegs[0].mode : travelMode)
          : null,
      travelTrainNo:
        (movementKind === "station" || isFp) && !isHeadquarters &&
        (editExportRows && journeyLegs.length > 0 ? journeyLegs[0].mode : travelMode) === "train"
          ? (editExportRows && journeyLegs.length > 0 ? (journeyLegs[0].trainNo.trim() || null) : (travelTrainNo.trim() || null))
          : null,
      // Travel mode for the station → HQ return journey and (when by train) its number
      returnMode:
        (movementKind === "station" || isFp) && !isHeadquarters ?
          (editExportRows && journeyLegs.length > 0 ? journeyLegs[journeyLegs.length - 1].mode : returnMode)
          : null,
       returnTrainNo:
         (movementKind === "station" || isFp) && !isHeadquarters &&
         (editExportRows && journeyLegs.length > 0 ? journeyLegs[journeyLegs.length - 1].mode : returnMode) === "train"
           ? (editExportRows && journeyLegs.length > 0 ? (journeyLegs[journeyLegs.length - 1].trainNo.trim() || null) : (returnTrainNo.trim() || null))
           : null,
      // Custom export rows — each leg becomes its own row in the Diary and TA
      // Journal exports when non-empty. An empty array means "use the default
      // two-leg layout driven by the Timings + Travel fields below".
      journeyLegs: editExportRows && journeyLegs.length > 0 ? journeyLegs : [],
      movementKind: movementKind !== "station" ? movementKind : null,
      leaveKind: movementKind === "leave" ? leaveKind || null : null,
      crFrom: movementKind === "cr" ? crFrom || null : null,
      workDone: isSpecial ? null : workDone,
      ta: null,
      taPercent: taLocked || variableTaPending ? 0 : Number(taPercent) || 0,
      // Only meaningful for stations with a variable distance — answers the
      // "did you work at/after the KMs marker?" question for the TA Journal.
      taAtVariableKm: isVariableSplit ? taAtVariableKm === true : null,
      // A footplate movement records the footplate inspection (the engine ride
      // over the route), so it feeds the periodic-inspection tracking and the
      // Inspection export even when the footplate tag isn't ticked.
      inspectionKind: isFp ? "footplate" : inspectionKind,
      inspectionStationId: isFp ? fpBoardingId : inspectionKind ? pcdoStationId : null,
      inspectionTowardsStationId:
        !isFp && inspectionKind && inspectionKind !== "footplate" && inspectionSide !== "Both"
          ? inspectionTowardsId
          : null,
      inspectionSide: !isFp && inspectionKind && inspectionSide === "Both" ? "Both" : null,
      inspectionJointDept: !isFp && inspectionKind === "joint" ? jointDept || null : null,
      inspectionPeriodicity:
        isFp || (inspectionKind && PERIODIC_KINDS.includes(inspectionKind)) ? periodicity : null,
      // The point oiling / battery cycle is now configured per-tag in Settings
      inspectionRemindDays: null,
      footplateShift: isFp ? fpShift : inspectionKind === "footplate"
        ? [fpDay ? "Day" : "", fpNight ? "Night" : ""].filter(Boolean).join(",") || null
        : null,
      footplateDirection: null,
      footplateUp: null,
      footplateDown: null,
      footplateDay:
        isFp
          ? fpBlock(fpDay, fpDayDir, fpDayUp, fpDayDn)
          : inspectionKind === "footplate" && fpDay
            ? fpBlock(true, fpDayDir, fpDayUp, fpDayDn)
            : null,
      footplateNight:
        isFp
          ? fpBlock(fpNight, fpNightDir, fpNightUp, fpNightDn)
          : inspectionKind === "footplate" && fpNight
            ? fpBlock(true, fpNightDir, fpNightUp, fpNightDn)
            : null,
      footplateJourney: isFp
        ? {
            boardingStationId: fpBoardingId ?? 0,
            otherEndStationId: fpOtherEndId ?? 0,
            direction: fpDay ? fpDayDir : fpNight ? fpNightDir : "",
            shift: fpShift,
            outbound: fpDay
              ? fpDayDir === "Down"
                ? strip(fpDayDn)
                : strip(fpDayUp)
              : fpNight
                ? fpNightDir === "Down"
                  ? strip(fpNightDn)
                  : strip(fpNightUp)
                : null,
            inbound: fpDay && fpDayDir === "Both"
              ? strip(fpDayDn)
              : fpNight && fpNightDir === "Both"
                ? strip(fpNightDn)
                : null,
          }
        : null,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
      pcdoWorks: pcdoOpen
        ? pcdoWorks
            .map((w) => ({ department: w.department, work: w.work.trim() }))
            .filter((w) => w.work)
        : [],
      // Legacy single-text field: joined work texts so older app versions (and
      // any other consumer) still see something; the UI reads pcdoWorks first.
      pcdoWork: pcdoOpen
        ? pcdoWorks
            .map((w) => w.work.trim())
            .filter(Boolean)
            .join("\n")
        : null,
      // PCDO station & date always mirror the log entry
      pcdoStationId: pcdoOpen ? pcdoStationId : null,
      pcdoDate: pcdoOpen ? pcdoDate : null,
      hasDisconnections: discOpen,
      discSpecialWork: discOpen ? Number(discSpecialWork) || 0 : 0,
      discFailure: discOpen ? Number(discFailure) || 0 : 0,
      discMaintenance: discOpen ? Number(discMaintenance) || 0 : 0,
      discNotPermitted: discOpen ? Number(discNotPermitted) || 0 : 0,
      counterResets: countersOpen
        ? counterRows
            .map((r) => ({
              equipment: r.equipment,
              stationId: r.equipment === "MSDAC" || movementKind === "station" ? null : r.stationId,
              nextStationId: r.equipment === "MSDAC" ? null : r.nextStationId,
              failures: Number(r.failures) || 0,
              testing: Number(r.testing) || 0,
            }))
            .filter((r) => r.failures > 0 || r.testing > 0)
        : [],
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
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
            <p className="mb-1.5 text-xs font-medium text-emerald-800">
              New station — name is required; distance from HQ and travel time are used by the TA journal.
            </p>
            <StationFields draft={newStationDraft} onChange={setNewStationDraft} />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewStationDraft(EMPTY_STATION_DRAFT);
                  setAddingStation(false);
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createStation}
                disabled={!newStationDraft.name.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save station
              </button>
            </div>
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
                      ? "border-violet-600 bg-surface text-violet-800"
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
            <p className="mb-1.5 text-xs font-medium text-sky-800">Worked on rest day</p>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-slate-600">Date</span>
              <input
                type="date"
                className={inputClass}
                value={crFrom}
                max={logDate || undefined}
                onChange={(e) => setCrDate(e.target.value)}
              />
            </label>
            {!crFrom && (
              <p className="mt-1.5 text-xs text-amber-600">Select the rest day you worked on.</p>
            )}
          </div>
        )}

        {movementKind === "station" && movement.trim() !== "" && !isHeadquarters && (
          <div className="mt-2 space-y-2">
            {extraMovements.map((m, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className={inputClass}
                  value={m}
                  onChange={(e) => changeExtraMovement(i, e.target.value)}
                >
                  <option value="">— Select another station —</option>
                  {stations
                    .filter((s) => s.id !== currentUser?.headquartersStationId)
                    .map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeExtraMovement(i)}
                  className="flex-shrink-0 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addExtraMovement}
              className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              + Add another movement
            </button>
            {extraMovements.length > 0 && (
              <p className="text-xs text-slate-500">
                With two or more movements the entry prints as one row per leg —
                HQ → station → … → station → HQ — in the Diary and TA Journal
                exports.
              </p>
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
      {!isSpecial && !isHeadquarters && movementKind === "station" && (
        <>
          {editExportRows ? (
            <Field label="Diary / TA export rows">
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  These rows come from the movements you picked above — the chain is HQ →
                  station → … → station → HQ. Edit any leg&apos;s From / To, times or Road /
                  Train details here; the first leg feeds the primary tour timings and the
                  last leg the return. Use &quot;Add another movement&quot; in Station /
                  Movement above to add another stop.
                </p>
                <div className="space-y-2">
                  {journeyLegs.map((leg, i) => (
                    <JourneyLegRow
                      key={i}
                      leg={leg}
                      stationsList={stations.map((s) => ({ id: s.id, name: s.name, code: s.code || "" }))}
                      hqName={hqName}
                      onChange={(updated) =>
                        setJourneyLegs((prev) => prev.map((l, idx) => (idx === i ? updated : l)))
                      }
                      onRemove={() => setJourneyLegs((prev) => prev.filter((_, idx) => idx !== i))}
                      canRemove={journeyLegs.length > 1}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setJourneyLegs((prev) => [
                      ...prev,
                      {
                        from: "",
                        to: "",
                        timeDep: null,
                        timeArr: null,
                        mode: "road",
                        trainNo: "",
                      },
                    ])
                  }
                  className="mt-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  + Add leg
                </button>
                {AUTO_TIMINGS && (
                  <p className="mt-1 text-xs text-slate-500">
                    Blank times on the first and last legs are filled from your TA Auto-Generation
                    settings; middle-leg blanks print as &quot;not entered in daily log&quot;.
                  </p>
                )}
              </div>
            </Field>
          ) : (
            <Field label="Timings">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                {AUTO_TIMINGS && (
                  <p className="mb-2 text-xs text-slate-500">
                    Pre-filled from your TA Auto-Generation settings — edit any time to override the
                    tour for this day; untouched entries keep following the settings.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-0.5 block text-[11px] text-slate-600">
                      Time of departure from HQ
                    </span>
                    <input
                      type="time"
                      className={inputClass}
                      value={shownDep}
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
                      value={shownArr}
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
                      value={shownRetDep}
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
                      value={shownRetArr}
                      onChange={(e) => setReturnTimeArr(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {AUTO_TIMINGS
                    ? "Edited times are printed verbatim in the Diary and TA Journal exports."
                    : "These times are printed verbatim in the Diary and TA Journal exports."}
                </p>
              </div>
            </Field>
          )}
          {!editExportRows && (
            <Field label="Travel Details">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <TravelLeg
                  title="On-board journey (HQ → station)"
                  mode={travelMode}
                  setMode={setTravelMode}
                  trainNo={travelTrainNo}
                  setTrainNo={setTravelTrainNo}
                />
                <TravelLeg
                  title="Return journey (station → HQ)"
                  mode={returnMode}
                  setMode={setReturnMode}
                  trainNo={returnTrainNo}
                  setTrainNo={setReturnTrainNo}
                />
                <p className="text-xs text-slate-500">
                  By Road is selected by default. Choose By Train to enter the train number — both are printed
                  in the Diary and TA Journal exports.
                </p>
              </div>
            </Field>
          )}
        </>
      )}
      {isVariableSplit && (
        <Field label={variableKm != null ? `Worked at ${variableKm} KMs?` : "Worked at the station's KMs marker?"}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTaAtVariableKm(true)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                taAtVariableKm === true
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              Yes — at/after {variableKm} KMs
            </button>
            <button
              type="button"
              onClick={() => setTaAtVariableKm(false)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                taAtVariableKm === false
                  ? "border-slate-600 bg-slate-600 text-white"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              No — within 8 km
            </button>
          </div>
          {variableTaPending ? (
            <span className="mt-1 block text-xs text-amber-600">
              This station{"'"}s distance is variable — TA is only claimed when the work was done at/after{" "}
              {variableKm != null ? `${variableKm} KMs` : "the station's KMs marker"}.
            </span>
          ) : (
            <span className="mt-1 block text-xs text-slate-500">
              {variableKm != null ? `at/after ${variableKm} KMs` : "at/after the station's KMs marker"} — the
              entry will be included in the TA Journal.
            </span>
          )}
        </Field>
      )}
      {isSpecial ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No TA is claimed for {movementLabel} — assumed <strong>0%</strong>.
        </div>
      ) : (
      <Field label="TA (%)">
        <select
          className={inputClass}
          value={taPercentEffective}
          disabled={taTakenOnSameDate}
          onChange={(e) => setTaPercent(e.target.value)}
        >
          <option value="100">100 %</option>
          <option value="70">70 %</option>
          <option value="30">30 %</option>
          <option value="0">0 %</option>
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
          Claiming <strong>{taPercentEffective}%</strong>
        </span>
      </Field>
      )}

      {/* Footplate — special movement: HQ → boarding station → ride the engine
          to the other end (Up/Down), optionally ride back in the opposite
          direction, then return to HQ. */}
      {movementKind === "footplate" && (
        <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3">
          <p className="text-sm font-semibold text-cyan-900">Footplate Journey</p>
          <p className="mt-1 text-xs text-cyan-800">
            From HQ to the boarding station, ride the engine of a train to the other end,{" "}
            {fpDayDir === "Both" || fpNightDir === "Both"
              ? "ride back in the opposite direction,"
              : "optionally ride back in the opposite direction,"}{" "}
            then return to HQ.
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Boarding station <span className="font-normal text-slate-400">(from HQ)</span>
              </span>
              <select
                className={inputClass}
                value={fpBoardingId ?? ""}
                onChange={(e) => setFpBoardingId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Select boarding station —</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Other end station <span className="font-normal text-slate-400">(far end)</span>
              </span>
              <select
                className={inputClass}
                value={fpOtherEndId ?? ""}
                onChange={(e) => setFpOtherEndId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Select other end —</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {fpBoardingId != null && fpBoardingId === fpOtherEndId && (
            <p className="mt-1 text-xs text-amber-600">
              Boarding and other end must be different stations.
            </p>
          )}

          <p className="mt-2 text-xs text-cyan-800">
            For each shift you select below, pick the direction (Up / Down / Both) and enter the train
            details — Train No, Engine No, LP, ALP, TMR and Remarks (deficiency noted while on the engine).
          </p>

          <span className="mb-1 mt-2 block text-xs font-medium text-slate-700">
            Day or Night? <span className="font-normal text-slate-400">(select both if applicable)</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFpDay((v) => !v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                fpDay ? "border-cyan-600 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setFpNight((v) => !v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                fpNight ? "border-cyan-600 bg-cyan-50 text-cyan-800" : "border-slate-300 text-slate-600"
              }`}
            >
              Night
            </button>
          </div>
          {!fpDay && !fpNight && (
            <p className="mt-1 text-xs text-amber-600">Select Day and/or Night.</p>
          )}

          {fpDay && (
            <ShiftDetails
              label="☀ Day"
              direction={fpDayDir}
              setDirection={setFpDayDir}
              up={shownFpDayUp}
              setUp={setFpDayUp}
              down={shownFpDayDn}
              setDown={setFpDayDn}
            />
          )}
          {fpNight && (
            <ShiftDetails
              label="🌙 Night"
              direction={fpNightDir}
              setDirection={setFpNightDir}
              up={shownFpNightUp}
              setUp={setFpNightUp}
              down={shownFpNightDn}
              setDown={setFpNightDn}
            />
          )}

          {PERIODIC_KINDS.includes("footplate") && (
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
                        ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    {pd}
                  </button>
                ))}
              </div>
            </label>
          )}

          {fpBoarding && fpOtherEnd && fpBoarding.id !== fpOtherEnd.id && (fpDay || fpNight) && (
            <p className="mt-1.5 text-xs text-cyan-800">
              <strong>{[fpDay ? "Day" : "", fpNight ? "Night" : ""].filter(Boolean).join(" + ")}</strong>{" "}
              footplate {fpBoarding.name} → {fpOtherEnd.name} · {periodicity} cycle — next due{" "}
              <strong>{addDays(logDate, intervalFor("footplate", periodicity))}</strong>.
            </p>
          )}
        </div>
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
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-700">Department</span>
              <div className="flex flex-wrap gap-1.5">
                {DEPARTMENTS.map((d) => {
                  const on = pcdoWorks.some((w) => w.department === d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => togglePcdoDept(d)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        on ? "bg-indigo-600 text-white" : "bg-surface text-slate-600 ring-1 ring-slate-300"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Pick one or more departments and describe the special work done for each.
              </p>
            </div>

            {pcdoWorks.map((w) => (
              <label key={w.department || "__legacy"} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  {w.department ? (
                    <>
                      <span
                        className="mr-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: DEPARTMENT_COLORS[w.department] }}
                      >
                        {w.department}
                      </span>
                      Special Work Details
                    </>
                  ) : (
                    "Special Work Details"
                  )}
                </span>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={w.work}
                  placeholder={`Describe the ${w.department ? w.department.toLowerCase() : "special"} work carried out…`}
                  onChange={(e) => setPcdoWork(w.department, e.target.value)}
                />
              </label>
            ))}
            <div className="rounded-md border border-indigo-200 bg-surface px-2.5 py-2 text-xs">
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
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  PCDO station{" "}
                  <span className="font-normal text-slate-400">
                    (defaults to the station of the movement above — change it if the work was at
                    another station)
                  </span>
                </span>
                <select
                  className={inputClass}
                  value={pcdoStationId ?? ""}
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
            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Disconnection station{" "}
                <span className="font-normal text-slate-500">(shared with the PCDO station above)</span>
              </span>
              <select
                className={inputClass}
                value={pcdoStationId ?? ""}
                onChange={(e) => setPcdoStationOverride(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Select station —</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {!pcdoStationId && (
                <span className="mt-1 block text-xs text-amber-600">
                  Pick a station so these disconnections are grouped correctly in the PCDO export.
                </span>
              )}
            </label>
        </>
      )}
      {!isSpecial && !isHeadquarters && movementKind === "footplate" && (
        <>
          <Field label="Timings">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              {AUTO_TIMINGS && (
                <p className="mb-2 text-xs text-slate-500">
                  Pre-filled from your TA Auto-Generation settings — edit any time to override the
                  tour for this day; untouched entries keep following the settings.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-600">
                    Time of departure from HQ
                  </span>
                  <input
                    type="time"
                    className={inputClass}
                    value={shownDep}
                    onChange={(e) => setTimeDep(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-600">
                    Time of arrival at boarding station
                  </span>
                  <input
                    type="time"
                    className={inputClass}
                    value={shownArr}
                    onChange={(e) => setTimeArr(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-600">
                    Time of departure from boarding station (to HQ)
                  </span>
                  <input
                    type="time"
                    className={inputClass}
                    value={shownRetDep}
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
                    value={shownRetArr}
                    onChange={(e) => setReturnTimeArr(e.target.value)}
                  />
                </label>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {AUTO_TIMINGS
                  ? "Edited times are printed verbatim in the Diary and TA Journal exports."
                  : "These times are printed verbatim in the Diary and TA Journal exports."}
              </p>
            </div>
          </Field>
          <Field label="Travel Details">
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <TravelLeg
                title="On-board journey (HQ → boarding station)"
                mode={travelMode}
                setMode={setTravelMode}
                trainNo={travelTrainNo}
                setTrainNo={setTravelTrainNo}
              />
              <TravelLeg
                title="Return journey (boarding station → HQ)"
                mode={returnMode}
                setMode={setReturnMode}
                trainNo={returnTrainNo}
                setTrainNo={setReturnTrainNo}
              />
              <p className="text-xs text-slate-500">
                By Road is selected by default. Choose By Train to enter the train number — both are printed
                in the Diary and TA Journal exports.
              </p>
            </div>
          </Field>
        </>
      )}
      </div>

      {/* Counter Resets */}
      <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={countersOpen}
            onChange={(e) => setCountersOpen(e.target.checked)}
            className="h-4 w-4 accent-teal-600"
          />
          <span className="text-sm font-semibold text-teal-900">Counter Resets</span>
        </label>
        <p className="mt-1 text-xs text-teal-800/80">
          Tick to record counter resets on equipment with registers — MSDAC at this station, or UFSBI
          Block Instrument / BPAC between this station and the next station. Resets are counted by
          cause (failure or testing). Included in the PCDO export.
        </p>

        {countersOpen && (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Counter station{" "}
                <span className="font-normal text-slate-500">
                  (shared with the PCDO station above — defaults to the movement station)
                </span>
              </span>
              <select
                className={inputClass}
                value={pcdoStationId ?? ""}
                onChange={(e) => setPcdoStationOverride(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Select station —</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {!pcdoStationId && (
                <span className="mt-1 block text-xs text-amber-600">
                  Pick a station so these counter resets are grouped correctly in the PCDO export.
                </span>
              )}
            </label>
            {counterRows.map((r, i) => {
              const isSection = r.equipment !== "MSDAC";
              return (
                <div key={i} className="rounded-lg border border-teal-200 bg-surface p-2.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block min-w-[11rem] flex-1">
                      <span className="mb-1 block text-xs font-medium text-slate-700">Equipment</span>
                      <select
                        className={inputClass}
                        value={r.equipment}
                        onChange={(e) =>
                          updateCounterRow(i, {
                            equipment: e.target.value as CounterReset["equipment"],
                            stationId: e.target.value === "MSDAC" ? null : r.stationId,
                            nextStationId:
                              e.target.value === "MSDAC" ? null : r.nextStationId,
                          })
                        }
                      >
                        {COUNTER_EQUIPMENT.map((eq) => (
                          <option key={eq} value={eq}>
                            {eq}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block w-24">
                      <span className="mb-1 block text-xs font-medium text-slate-700">
                        Failures
                      </span>
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={r.failures}
                        onChange={(e) => updateCounterRow(i, { failures: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="block w-24">
                      <span className="mb-1 block text-xs font-medium text-slate-700">
                        Testing
                      </span>
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={r.testing}
                        onChange={(e) => updateCounterRow(i, { testing: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeCounterRow(i)}
                      className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600">
                    {isSection ? (
                      movementKind !== "station" ? (
                        <>Section between two stations:</>
                      ) : (
                        <>
                          Between{" "}
                          <strong className="text-slate-800">
                            {pcdoStationId
                              ? stations.find((x) => x.id === pcdoStationId)?.name
                              : movement || "this station"}
                          </strong>{" "}
                          and the next station:
                        </>
                      )
                    ) : (
                      <>
                        Counter at{" "}
                        <strong className="text-slate-800">
                          {pcdoStationId
                            ? stations.find((x) => x.id === pcdoStationId)?.name
                            : movement || "this station"}
                        </strong>
                      </>
                    )}
                  </p>
                  {isSection ? (
                    movementKind !== "station" ? (
                      <>
                        <div className="mt-1.5 flex flex-wrap items-end gap-2">
                          <label className="block min-w-[10rem] flex-1">
                            <span className="mb-1 block text-xs font-medium text-slate-700">
                              From station
                            </span>
                            <select
                              className={inputClass}
                              value={r.stationId ?? ""}
                              onChange={(e) =>
                                updateCounterRow(i, {
                                  stationId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            >
                              <option value="">— Select station —</option>
                              {stations
                                .filter((s) => s.id !== r.nextStationId)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="block min-w-[10rem] flex-1">
                            <span className="mb-1 block text-xs font-medium text-slate-700">
                              Next station
                            </span>
                            <select
                              className={inputClass}
                              value={r.nextStationId ?? ""}
                              onChange={(e) =>
                                updateCounterRow(i, {
                                  nextStationId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            >
                              <option value="">— Select station —</option>
                              {stations
                                .filter((s) => s.id !== r.stationId)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                        {(!r.stationId || !r.nextStationId) && (
                          <span className="mt-1 block text-xs text-amber-600">
                            Select both stations so this counter reset is grouped correctly in the
                            PCDO export.
                          </span>
                        )}
                      </>
                    ) : (
                      <label className="mt-1.5 block">
                        <span className="mb-1 block text-xs font-medium text-slate-700">
                          Next station{" "}
                          <span className="font-normal text-slate-400">(far end of the section)</span>
                        </span>
                        <select
                          className={inputClass}
                          value={r.nextStationId ?? ""}
                          onChange={(e) =>
                            updateCounterRow(i, { nextStationId: e.target.value ? Number(e.target.value) : null })
                          }
                        >
                          <option value="">— Select next station —</option>
                          {stations
                            .filter((s) => s.id !== resolvedStation?.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                        {!r.nextStationId && (
                          <span className="mt-1 block text-xs text-amber-600">
                            Select the next station so this counter reset is grouped correctly in the
                            PCDO export.
                          </span>
                        )}
                      </label>
                    )
                  ) : null
                }
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={addCounterRow}
                className="rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50"
              >
                + Add counter reset
              </button>
              <p className="text-xs font-semibold text-teal-900">
                Total resets: {counterTotal}
              </p>
            </div>
          </div>
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

          {inspectionKind === "footplate" && movementKind === "footplate" && (
            <p className="mt-2 text-xs text-sky-800">
              The Day/Night shift, direction and train details are captured in the{" "}
              <strong>Footplate Journey</strong> section above.
            </p>
          )}

          {inspectionKind === "footplate" && movementKind !== "footplate" && (
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
                  up={shownFpDayUp}
                  setUp={setFpDayUp}
                  down={shownFpDayDn}
                  setDown={setFpDayDn}
                />
              )}
              {fpNight && (
                <ShiftDetails
                  label="🌙 Night"
                  direction={fpNightDir}
                  setDirection={setFpNightDir}
                  up={shownFpNightUp}
                  setUp={setFpNightUp}
                  down={shownFpNightDn}
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
            movementKind === "footplate" ? (
              fpBoarding && fpOtherEnd && fpBoarding.id !== fpOtherEnd.id && (fpDay || fpNight) ? (
                <p className="mt-1.5 text-xs text-sky-800">
                  <strong>
                    {[fpDay ? "Day" : "", fpNight ? "Night" : ""].filter(Boolean).join(" + ")}
                  </strong>{" "}
                  footplate {fpBoarding.name} → {fpOtherEnd.name} · {periodicity} cycle — next due{" "}
                  <strong>{addDays(logDate, intervalFor(inspectionKind, periodicity))}</strong>.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-amber-600">
                  Complete the Footplate Journey above (boarding & other end, direction, Day/Night).
                </p>
              )
            ) : resolvedStation && (fpDay || fpNight) ? (
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
   * into a planned work. The deficiency is set to Planned (not Completed) so
   * it only counts as a completed deficiency once the planned work is done. */
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
      convertFromId: existing?.convertFromId ?? convertFrom?.id ?? null,
      department,
      materialRemarks,
      attachments,
      ownerStaffId: existing?.ownerStaffId ?? currentUser?.id ?? null,
    };
    if (existing) await api.planned.update(payload);
    else await api.planned.create(payload);
    // Converting: the deficiency it came from is only Planned until its
    // planned work is actually completed, so it neither stays pending nor
    // counts as a completed deficiency yet.
    if (convertFrom && !existing) {
      await api.deficiencies.update({ id: convertFrom.id, status: "Planned" });
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
          Converting the deficiency “{convertFrom.title}” — saving moves it to
          your planned works. It will be counted as a completed deficiency only
          when this planned work is completed.
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
  value: FootplateJourneyTrain;
  onChange: (v: FootplateJourneyTrain) => void;
}) {
  const set = (k: keyof FootplateJourneyTrain) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const cls =
    "w-full rounded-md border border-slate-300 bg-surface px-2 py-1.5 text-sm outline-none focus:border-cyan-500";
  return (
    <div className="mt-2 rounded-lg border border-cyan-200 bg-surface p-2.5">
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
        <label className="col-span-2 block">
          <span className="mb-0.5 block text-[11px] text-slate-600">
            Remarks <span className="font-normal text-slate-400">(deficiency, if any)</span>
          </span>
          <input className={cls} value={value.remarks} onChange={set("remarks")} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Time of boarding</span>
          <input
            type="time"
            className={cls}
            value={value.depTime}
            onChange={set("depTime")}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-slate-600">Time of alighting</span>
          <input
            type="time"
            className={cls}
            value={value.arrTime}
            onChange={set("arrTime")}
          />
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
  up: FootplateJourneyTrain;
  setUp: (v: FootplateJourneyTrain) => void;
  down: FootplateJourneyTrain;
  setDown: (v: FootplateJourneyTrain) => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-cyan-200 bg-surface p-2.5">
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

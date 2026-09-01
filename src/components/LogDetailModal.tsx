"use client";

import { useState, type ReactNode } from "react";
import { useData } from "./DataProvider";
import { Modal, Chip } from "./ui";
import { api, fmtDate, dayName, formatFootplateSummary, footplateRidesOf, pcdoWorkEntries, counterResetsOf, counterResetTotal } from "@/lib/api";
import { DEPARTMENT_COLORS } from "@/lib/types";
import { isSharedLog } from "@/lib/backup";
import { INSPECTION_RULES, addDays, type InspectionKind } from "@/lib/inspections";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import type { DailyLog, Attachment, FootplateBlock, FootplateDetail, FootplateJourneyTrain, FootplateRide, JourneyLeg } from "@/db/schema";
import { FootplateDetailRows } from "./FootplateRows";

export function LogDetailModal({
  log,
  onClose,
  onEdit,
}: {
  log: DailyLog | null;
  onClose: () => void;
  onEdit: (l: DailyLog) => void;
}) {
  const { tags, stations, stationName, refresh } = useData();
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!log) return null;

  const discTotal =
    log.discSpecialWork + log.discFailure + log.discMaintenance + log.discNotPermitted;
  const shared = isSharedLog(log);

  return (
    <Modal open onClose={onClose} title={`${dayName(log.logDate)}, ${fmtDate(log.logDate)}`} wide>
      {shared ? (
        <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
          <p className="text-xs font-semibold text-teal-800">
            🔗 Shared by a colleague at {stationName(log.pcdoStationId)}
          </p>
          <p className="mt-0.5 text-xs text-teal-700">
            Only PCDO special works, disconnection counts and counter resets are shared between
            staff. Their movement, work done, TA, tags and attachments stay private.
          </p>
        </div>
      ) : (
        <>
          <Row label="Movement" value={log.stationMovement} />
          {log.timeDep || log.returnTimeArr ? (
            <Row
              label="Timings"
              value={`Dep ${log.timeDep || "—"} → Arr ${log.timeArr || "—"}  ·  Ret Dep ${log.returnTimeDep || "—"} → Arr ${log.returnTimeArr || "—"}`}
            />
          ) : null}
          {log.travelMode || log.returnMode ? (
            <Row
              label="Travel"
              value={`On-board ${log.travelMode === "train" ? `Train ${log.travelTrainNo || ""}`.trim() : "Road"}  ·  Return ${log.returnMode === "train" ? `Train ${log.returnTrainNo || ""}`.trim() : "Road"}`}
            />
          ) : null}
          {Array.isArray(log.journeyLegs) && log.journeyLegs.length > 0 ? (
            <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-sky-700">
                Export rows ({log.journeyLegs.length} leg{log.journeyLegs.length !== 1 ? "s" : ""})
              </p>
              <div className="space-y-1">
                {log.journeyLegs.map((leg: JourneyLeg, i: number) => (
                  <p key={i} className="text-xs text-sky-950">
                    <strong>{i + 1}.</strong> {leg.from || "—"} → {leg.to || "—"}
                    {leg.timeDep ? ` · Dep ${leg.timeDep}` : ""}
                    {leg.timeArr ? ` Arr ${leg.timeArr}` : ""}
                    {leg.mode === "train" && leg.trainNo ? ` · Train ${leg.trainNo}` : ""}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {(Array.isArray(log.footplateJourneys) && log.footplateJourneys.length > 0
            ? log.footplateJourneys
            : log.footplateJourney
              ? [log.footplateJourney]
              : []
          ).length > 0 && (
            <JourneySummary log={log} stationName={stationName} />
          )}
          <Row label="Work Done" value={log.workDone} multiline />
          {log.taAtVariableKm != null && (
            <Row
              label="Variable station side"
              value={log.taAtVariableKm ? "At/after the KMs marker (> 8 km)" : "Within 8 km"}
            />
          )}
          <Row
            label="TA"
            value={`${log.taPercent ?? 100}%`}
          />
          {log.inspectionKind && (
            <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700">
                🔁 {INSPECTION_RULES[log.inspectionKind as InspectionKind]?.label ?? log.inspectionKind}
              </p>
              <p className="text-sm text-sky-950">
                At {log.inspectionStationId ? stationName(log.inspectionStationId) : log.stationMovement || "—"}
                {log.inspectionKind !== "footplate" && log.inspectionSide === "Both"
                  ? ", towards Both sides"
                  : log.inspectionKind !== "footplate" && log.inspectionTowardsStationId
                    ? `, towards ${stationName(log.inspectionTowardsStationId)} side`
                    : ""}
                {log.inspectionJointDept ? ` · jointly with ${log.inspectionJointDept}` : ""}
                {log.inspectionPeriodicity ? ` · ${log.inspectionPeriodicity}` : ""}
              </p>
              {log.footplateShift && (
                <p className="mt-1 text-sm text-sky-950">
                  {formatFootplateSummary(log)} footplate
                </p>
              )}
              {log.inspectionKind === "footplate" && footplateRidesOf(log).length > 1
                ? footplateRidesOf(log).map((ride, i) => (
                    <div key={i} className="mt-1">
                      <p className="text-xs font-medium text-sky-800">Ride {i + 1}</p>
                      <FootplateDetailRows
                        log={{ footplateDay: ride.day, footplateNight: ride.night }}
                      />
                    </div>
                  ))
                : <FootplateDetailRows log={log} />}
              <p className="mt-0.5 text-xs text-sky-700">
                Next due{" "}
                {addDays(
                  log.logDate,
                  log.inspectionRemindDays && log.inspectionRemindDays > 0
                    ? log.inspectionRemindDays
                    : INSPECTION_RULES[log.inspectionKind as InspectionKind]?.intervalDays ?? 30
                )}
              </p>
            </div>
          )}
        </>
      )}

      {pcdoWorkEntries(log).length > 0 && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
            ⭐ PCDO Special Work
          </p>
          <div className="space-y-2">
            {pcdoWorkEntries(log).map((w) => (
              <div key={w.department || "__legacy"} className="rounded-md bg-surface/70 px-2.5 py-2">
                {w.department && (
                  <span
                    className="mr-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: DEPARTMENT_COLORS[w.department] }}
                  >
                    {w.department}
                  </span>
                )}
                <p className="whitespace-pre-wrap text-sm text-indigo-950">{w.work}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-indigo-700">
            {log.pcdoStationId ? stationName(log.pcdoStationId) : "No station"} ·{" "}
            {fmtDate(log.pcdoDate || log.logDate)}
          </p>
        </div>
      )}

      {log.hasDisconnections && discTotal > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">
            ⚡ Disconnections · {discTotal} total
          </p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Metric label="Special Work" value={log.discSpecialWork} />
            <Metric label="Failure" value={log.discFailure} />
            <Metric label="Maintenance" value={log.discMaintenance} />
            <Metric label="Not Permitted" value={log.discNotPermitted} />
          </div>
        </div>
      )}

      {counterResetTotal(log) > 0 && (
        <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-700">
            🔢 Counter Resets · {counterResetTotal(log)} total
          </p>
          <div className="space-y-1.5">
            {counterResetsOf(log).map((r, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface/70 px-2.5 py-1.5 text-sm"
              >
                <span className="font-medium text-teal-950">
                  {r.equipment}
                  {r.equipment === "MSDAC"
                    ? ` · ${stationName(log.pcdoStationId)}`
                    : ` · ${r.stationId ? stationName(r.stationId) : stationName(log.pcdoStationId)} - ${stationName(r.nextStationId)}`}
                </span>
                <span className="text-xs text-teal-800">
                  Failures {r.failures} · Testing {r.testing}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.tagIds.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {log.tagIds.map((id) => {
              const t = tags.find((x) => x.id === id);
              return t ? <Chip key={id} label={t.name} color={t.color} /> : null;
            })}
          </div>
        </div>
      )}

      {log.attachments.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Attachments ({log.attachments.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {log.attachments.map((a, i) =>
              a.type.startsWith("image/") ? (
                <button key={i} type="button" onClick={() => setPreview(a)} className="cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                  />
                </button>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreview(a)}
                  className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-500"
                >
                  {a.name.slice(0, 12)}
                </button>
              )
            )}
          </div>
        </div>
      )}

      <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />

      <div className={`mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 ${shared ? "hidden" : ""}`}>
        <button
          onClick={async () => {
            if (confirm("Delete this log?")) {
              await api.logs.remove(log.id);
              await refresh();
              onClose();
            }
          }}
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        <button
          onClick={() => { onClose(); onEdit(log); }}
          className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Edit Entry
        </button>
      </div>
    </Modal>
  );
}

function JourneySummary({
  log,
  stationName,
}: {
  log: DailyLog;
  stationName: (id: number | null) => string;
}) {
  type FpTrain = FootplateDetail & Partial<Pick<FootplateJourneyTrain, "depTime" | "arrTime">>;
  const trainLine = (title: string, t: FpTrain | null | undefined) =>
    t?.trainNo ? (
      <p className="mt-0.5 text-xs text-violet-800">
        {title} {t.trainNo}
        {t.depTime ? ` · Board ${t.depTime}` : ""}
        {t.arrTime ? ` → Arr ${t.arrTime}` : ""}
        {t.remarks ? ` · ${t.remarks}` : ""}
      </p>
    ) : null;
  const shiftRowsOf = (day: FootplateBlock | null | undefined, night: FootplateBlock | null | undefined) => {
    const shiftRows: ReactNode[] = [];
    const pushShift = (shiftLabel: string, b: FootplateBlock | FootplateDetail | null | undefined) => {
      if (!b) return;
      if ("direction" in b) {
        if (b.up?.trainNo) shiftRows.push(trainLine(`${shiftLabel} UP`, b.up));
        if (b.down?.trainNo) shiftRows.push(trainLine(`${shiftLabel} DN`, b.down));
      } else if (b.trainNo) {
        shiftRows.push(trainLine(shiftLabel, b));
      }
    };
    pushShift("Day", day);
    pushShift("Night", night);
    return shiftRows;
  };
  const rides: FootplateRide[] =
    Array.isArray(log.footplateJourneys) && log.footplateJourneys.length > 0
      ? log.footplateJourneys
      : log.footplateJourney
        ? [
            {
              boardingStationId: log.footplateJourney.boardingStationId,
              otherEndStationId: log.footplateJourney.otherEndStationId,
              shift: log.footplateJourney.shift,
              day: log.footplateDay ?? null,
              night: log.footplateNight ?? null,
            },
          ]
        : [];
  if (rides.length === 0) return null;
  return (
    <div className="mb-3 space-y-2">
      {rides.map((r, i) => {
        const boarding = r.boardingStationId ? stationName(r.boardingStationId) : "—";
        const other = r.otherEndStationId ? stationName(r.otherEndStationId) : "—";
        const shift = r.shift ? `${r.shift} shift` : "—";
        const rows = shiftRowsOf(r.day, r.night);
        const title = rides.length > 1 ? `Footplate Journey ${i + 1}` : "Footplate Journey";
        return (
          <div key={i} className="rounded-lg border border-violet-200 bg-violet-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
              {title}
            </p>
            <p className="text-sm text-violet-950">
              Boarding {boarding} → {other} · {shift}
            </p>
            {rows.length > 0 ? (
              rows
            ) : i === 0 && log.footplateJourney ? (
              <>
                {trainLine("Out", log.footplateJourney.outbound)}
                {trainLine("Return", log.footplateJourney.inbound)}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div className="mb-3">
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm text-slate-800 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value || <span className="italic text-slate-400">No entry</span>}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface py-1.5">
      <p className="text-lg font-bold text-amber-900">{value}</p>
      <p className="text-[10px] text-amber-700">{label}</p>
    </div>
  );
}

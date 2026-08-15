"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton } from "./ui";
import { exportDiary, exportTaJournal } from "./exports";
import { PeriodPicker, monthPeriod, type Period } from "./PeriodPicker";
import { fmtDate } from "@/lib/api";
import { isSharedLog } from "@/lib/backup";
import { isSpecialMovement } from "@/lib/types";
import type { DailyLog } from "@/db/schema";

type Mode = "diary" | "ta";

export function DiaryExportModal({
  open,
  onClose,
  initialMode = "diary",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const { logs, stations, currentUser } = useData();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [period, setPeriod] = useState<Period>(() => monthPeriod(0));
  const [custom, setCustom] = useState(false);

  const hq = stations.find((s) => s.id === currentUser?.headquartersStationId);
  const hqName = hq?.name ?? null;
  const hqCode = hq?.code?.trim() ? hq.code : hqName;

  // Display label for a movement — the station code when it matches a station
  const codeOf = (text: string | null | undefined) => {
    const t = (text ?? "").trim();
    if (!t) return null;
    const s = stations.find(
      (st) => st.name.toLowerCase() === t.toLowerCase() || (st.code && st.code.toLowerCase() === t.toLowerCase())
    );
    return s?.code?.trim() ? s.code : t;
  };

  // Only own entries belong in a personal diary
  const own = logs
    .filter((l) => !isSharedLog(l) && l.logDate >= period.from && l.logDate <= period.to)
    .sort((a, b) => a.logDate.localeCompare(b.logDate));

  // TA journal only counts days actually claimed away from HQ — and only for
  // stations recorded as farther than 8 km from the headquarters.
  const isHqMovement = (l: DailyLog) => {
    const t = (l.stationMovement ?? "").trim().toLowerCase();
    if (!t) return true;
    return Boolean(hq && (t === (hq.name ?? "").toLowerCase() || (hq.code && t === hq.code.toLowerCase())));
  };
  const taRows = own.filter((l) => {
    if (isSpecialMovement(l)) return false;
    if (isHqMovement(l)) return false;
    const t = (l.stationMovement ?? "").trim().toLowerCase();
    const st = stations.find(
      (s) => s.name.toLowerCase() === t || (s.code && s.code.toLowerCase() === t)
    );
    if (!st || st.distanceFromHq !== "above8") return false;
    const p = l.taPercent ?? 100;
    return p === 100 || p === 70 || p === 30;
  });
  const totalDays = taRows.reduce((a, l) => a + ((l.taPercent ?? 100) / 100), 0);
  const taRate = currentUser?.taRate != null && currentUser.taRate !== "" ? Number(currentUser.taRate) : null;
  const totalAmount = taRate != null ? Math.round(totalDays * taRate) : null;
  const rateNotSet = taRate == null;

  const isTa = mode === "ta";

  return (
    <Modal open={open} onClose={onClose} title={isTa ? "Export TA Journal" : "Export Diary"} wide>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("diary")}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            !isTa ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600"
          }`}
        >
          Diary
        </button>
        <button
          onClick={() => setMode("ta")}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            isTa ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600"
          }`}
        >
          TA Journal
        </button>
      </div>

      <div className="mb-3">
        <PeriodPicker period={period} onChange={setPeriod} custom={custom} setCustom={setCustom} />
      </div>

      {!hqName && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No headquarters station set on your profile. Set it in <strong>Settings → My Profile</strong> so
          the “from” column is filled in.
        </div>
      )}

      {isTa && !currentUser?.pfNo && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your PF No is not set. Add it in <strong>Settings → My Profile</strong> so the TA Journal header
          is complete.
        </div>
      )}

      <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {fmtDate(period.from)} — {fmtDate(period.to)} ·{" "}
        {isTa
          ? `${taRows.length} TA day${taRows.length === 1 ? "" : "s"} · ${totalDays.toFixed(1)} day${totalDays === 1 ? "" : "s"}${totalAmount != null ? ` · ₹${totalAmount}` : ""}`
          : `${own.length} entr${own.length === 1 ? "y" : "ies"}`}
        {" · "}
        Headquarters: <strong>{hqCode ?? "not set"}</strong>
      </div>

      {isTa && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Only movements to stations recorded as <strong>above 8 km</strong> from the headquarters are
          included in the TA Journal.
        </div>
      )}

      {isTa && rateNotSet && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          TA rate is not set on your profile. Add it in <strong>Settings → My Profile</strong> (or Staff
          Details) so the AMOUNT column is filled.
        </div>
      )}

      <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
        {(isTa ? taRows : own).length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            No {isTa ? "TA" : "diary"} entries in this period.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              {isTa ? (
                <tr>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Movement</th>
                  <th className="px-2 py-1.5">TA %</th>
                  <th className="px-2 py-1.5">AMOUNT</th>
                  <th className="px-2 py-1.5">Work Done</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Train No</th>
                  <th className="px-2 py-1.5">Time Dep</th>
                  <th className="px-2 py-1.5">Time Arr</th>
                  <th className="px-2 py-1.5">From</th>
                  <th className="px-2 py-1.5">To</th>
                  <th className="px-2 py-1.5">Work Done</th>
                </tr>
              )}
            </thead>
            <tbody>
              {(isTa ? taRows : own).map((r) => {
                const p = r.taPercent ?? 100;
                const amount = taRate != null ? Math.round((p / 100) * taRate) : null;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    {isTa ? (
                      <>
                        <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(r.logDate)}</td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {hqCode ?? "HQ"} → {codeOf(r.stationMovement)}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{p}%</td>
                        <td className="px-2 py-1.5">{rateNotSet ? "—" : `₹${amount}`}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.workDone || "-"}</td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(r.logDate)}</td>
                        <td className="px-2 py-1.5">{isSpecialMovement(r) ? r.stationMovement || "—" : "ROAD"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{isSpecialMovement(r) ? "—" : (r.timeDep || "—")}</td>
                        <td className="px-2 py-1.5 text-slate-600">{isSpecialMovement(r) ? "—" : (r.timeArr || "—")}</td>
                        <td className="px-2 py-1.5 text-slate-600">{isSpecialMovement(r) ? "—" : hqCode ?? "HQ"}</td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {isSpecialMovement(r) ? "—" : codeOf(r.stationMovement)}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{r.workDone || "-"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => {
            if (isTa) exportTaJournal(period, own, stations, currentUser);
            else exportDiary(period, own, stations, currentUser);
            onClose();
          }}
        >
          {isTa ? "Generate TA Journal" : "Generate Diary"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton } from "./ui";
import { exportMuster } from "./exports";
import { recentMonths, type Period } from "./PeriodPicker";
import { musterCodes, musterPeriodOf } from "@/lib/muster";
import { fmtDate } from "@/lib/api";
import { isSharedLog } from "@/lib/backup";

/** Display order for the code-count chips ("No entry" last). */
const CODE_ORDER = ["P", "OL", "REST", "NH", "CR", "PL", "CL", "SICK", "LEAVE", "No entry"];

/**
 * Export Muster (attendance sheet) — pick the muster month; the sheet runs
 * from the 11th of that month to the 10th of the next. Header details come
 * from Settings → My Profile (Office, PF No, name, designation, railway zone).
 */
export function MusterExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, currentUser } = useData();
  const [monthIdx, setMonthIdx] = useState(0);

  const months = recentMonths(12);
  const period: Period = musterPeriodOf(months[monthIdx].from);

  const hq = stations.find((s) => s.id === currentUser?.headquartersStationId);
  const hqCode = hq?.code?.trim() ? hq.code : hq?.name;

  const own = logs.filter((l) => !isSharedLog(l));
  const codes = musterCodes(period, own, stations, hq);

  const counts = new Map<string, number>();
  for (const c of codes.values()) {
    const k = c || "No entry";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const chips = CODE_ORDER.filter((c) => counts.has(c));

  const officeProfile = (currentUser?.office ?? "").trim();
  const officeShown = officeProfile || (hqCode ? `SSE/SIG/O/${hqCode}` : "");

  return (
    <Modal open={open} onClose={onClose} title="Export Muster (Attendance)" wide>
      <div className="mb-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Muster month (11th → 10th)
          <select
            value={monthIdx}
            onChange={(e) => setMonthIdx(Number(e.target.value))}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:bg-surface focus:ring-4 focus:ring-blue-100"
          >
            {months.map((m, i) => (
              <option key={m.from} value={i}>
                {m.label}
                {i === 0 ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!hq && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No headquarters station set on your profile. Set it in <strong>Settings → My Profile</strong> —
          the office line and the designation ending use it.
        </div>
      )}
      {!currentUser?.pfNo && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your PF No is not set. Add it in <strong>Settings → My Profile</strong> so the muster header is complete.
        </div>
      )}

      <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {fmtDate(period.from)} — {fmtDate(period.to)} ·{" "}
        {codes.size} logged day{codes.size === 1 ? "" : "s"}
        {chips.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  c === "No entry" ? "bg-slate-200 text-slate-600" : "bg-white text-blue-800 ring-1 ring-inset ring-blue-200"
                }`}
              >
                {c === "OL" ? "OL (TA claim)" : c === "P" ? "P (no TA claim)" : c} × {counts.get(c)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Header: <strong>{officeShown || "—"}</strong> · PF{" "}
        <strong>{currentUser?.pfNo?.trim() || "—"}</strong> · <strong>{currentUser?.name?.trim() || "—"}</strong> ·{" "}
        <strong>
          {currentUser?.designation?.trim()
            ? hqCode && !currentUser.designation.trim().toLowerCase().endsWith(hqCode.toLowerCase())
              ? `${currentUser.designation.trim()}/${hqCode}`
              : currentUser.designation.trim()
            : hqCode || "—"}
        </strong>
        . These come from your profile — Office, PF No, Name and Designation in{" "}
        <strong>Settings → My Profile</strong>
        {officeProfile ? "" : " (the office line falls back to SSE/SIG/O/<HQ> until Office is set)"}. Days
        without a daily log stay blank; AMC NO / DMC NO print as ---.
      </div>

      <PrimaryButton
        onClick={() => {
          exportMuster(period, own, stations, currentUser, onClose);
        }}
      >
        Generate Muster
      </PrimaryButton>
    </Modal>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton } from "./ui";
import { exportCertificate, exportFootplateForms } from "./exports";
import { PeriodPicker, monthPeriod, type Period } from "./PeriodPicker";
import {
  buildCertificateModel,
  footplateFormSpecs,
  loadCertExtra,
  matrixTickCount,
  saveCertExtra,
  type CertExtra,
} from "@/lib/certificate";
import { footplateRidesOf, fmtDate } from "@/lib/api";

/** Export the two official monthly formats:
 *  - IC Certificate (Form S&T./IC.3.3) for the month's monthly inspections
 *  - Foot Plate Observation (Annexure 3-A2), one form per shift per trip
 */
export function CertificateExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, deficiencies, currentUser: user } = useData();
  const currentUser = user ?? null;
  const [mode, setMode] = useState<"ic" | "footplate">("ic");
  const [period, setPeriod] = useState<Period>(() => monthPeriod(0));
  const [custom, setCustom] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [extra, setExtra] = useState<CertExtra>(() => loadCertExtra());
  // Footplate trips start all-selected; unchecked ids land here.
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

  const monthLogs = useMemo(
    () =>
      logs
        .filter((l) => l.logDate >= period.from && l.logDate <= period.to)
        .sort((a, b) => a.logDate.localeCompare(b.logDate)),
    [logs, period]
  );

  const included = useMemo(
    () => monthLogs.filter((l) => l.inspectionKind === "monthly"),
    [monthLogs]
  );

  const footTrips = useMemo(
    () => monthLogs.filter((l) => l.inspectionKind === "footplate" || footplateRidesOf(l).length > 0),
    [monthLogs]
  );
  const selectedTrips = footTrips.filter((l) => !deselected.has(l.id));

  const preview = useMemo(() => {
    if (mode === "ic") {
      const model = buildCertificateModel({
        included,
        allMonthLogs: monthLogs,
        stations,
        deficiencies,
        staff: currentUser,
        extra,
        yearMonth: period.from.slice(0, 7),
      });
      return {
        ok: model.rows.length > 0,
        lines: [
          ...model.rows.map(
            (r) =>
              `${r.station}: ${r.dates.length} visit${r.dates.length !== 1 ? "s" : ""} · ${r.condition}${
                r.repairsDone.length ? ` · ${r.repairsDone.length} repair item${r.repairsDone.length !== 1 ? "s" : ""}` : ""
              }`
          ),
          ...(model.repairsRequiredFooter.length
            ? [`Repairs required: ${model.repairsRequiredFooter.length} open item(s) from the deficiency list`]
            : []),
        ],
      };
    }
    const specs = selectedTrips.flatMap((l) => footplateFormSpecs(l, currentUser, extra, stations));
    return {
      ok: specs.length > 0,
      lines: specs.map(
        (s) =>
          `${fmtDate(s.dateIso)} ${s.shift} · ${s.trainNo || "no train no."} · ${s.form.matrix.length} station${
            s.form.matrix.length !== 1 ? "s" : ""
          } · ${matrixTickCount(s.form)} lamp tick${matrixTickCount(s.form) !== 1 ? "s" : ""}`
      ),
    };
  }, [mode, included, monthLogs, stations, deficiencies, currentUser, extra, selectedTrips, period.from]);

  const missingMeta = !extra.addressedTo.trim() || !extra.throughLine.trim();

  const patchExtra = (p: Partial<CertExtra>) => {
    const next = { ...extra, ...p };
    setExtra(next);
    saveCertExtra(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Official Monthly Formats" wide>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("ic")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            mode === "ic"
              ? "border-sky-600 bg-sky-50 text-sky-800"
              : "border-slate-300 text-slate-600"
          }`}
        >
          IC Certificate
          <span className="block text-[10px] font-normal text-slate-500">Form S&amp;T./IC.3.3</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("footplate")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
            mode === "footplate"
              ? "border-sky-600 bg-sky-50 text-sky-800"
              : "border-slate-300 text-slate-600"
          }`}
        >
          Foot Plate Forms
          <span className="block text-[10px] font-normal text-slate-500">Annexure 3-A2</span>
        </button>
      </div>

      <div className="mb-3">
        <PeriodPicker period={period} onChange={setPeriod} custom={custom} setCustom={setCustom} />
      </div>

      {mode === "footplate" && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              Footplate trips ({selectedTrips.length}/{footTrips.length})
            </p>
            {footTrips.length > 0 && (
              <button
                onClick={() =>
                  setDeselected(
                    selectedTrips.length === footTrips.length
                      ? new Set(footTrips.map((r) => r.id))
                      : new Set()
                  )
                }
                className="text-xs font-medium text-blue-600 underline"
              >
                {selectedTrips.length === footTrips.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {footTrips.length === 0 ? (
              <p className="p-3 text-center text-sm text-slate-400">No footplate trips this month.</p>
            ) : (
              footTrips.map((t) => (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 ${
                    !deselected.has(t.id) ? "bg-sky-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!deselected.has(t.id)}
                    onChange={() => {
                      const n = new Set(deselected);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      setDeselected(n);
                    }}
                    className="h-4 w-4 accent-sky-600"
                  />
                  <span className="w-24 flex-shrink-0 text-xs text-slate-500">{fmtDate(t.logDate)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {(t.footplateShift ?? "").split(",").filter(Boolean).join(" + ") || "footplate"}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {missingMeta && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          One-time setup below — the TO / Through lines and section, printed on the forms.
        </p>
      )}

      <button
        type="button"
        className="mb-2 text-xs font-semibold text-blue-700"
        onClick={() => setShowDetails((v) => !v)}
      >
        {showDetails ? "Hide details" : "Details (addressed to / through / section)"}
      </button>
      {showDetails && (
        <div className="mb-3 space-y-2 rounded-lg border border-slate-200 p-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-600">
              TO (e.g. Sr DSTE/M/GTL)
            </span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm"
              value={extra.addressedTo}
              onChange={(e) => patchExtra({ addressedTo: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-600">
              Through / SSE line (e.g. SSE/SIG/JMDG)
            </span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm"
              value={extra.throughLine}
              onChange={(e) => patchExtra({ throughLine: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-600">
              Section (foot plate &ldquo;Division &amp; Section&rdquo;, e.g. KLKA-YA)
            </span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm"
              value={extra.sectionCode}
              onChange={(e) => patchExtra({ sectionCode: e.target.value })}
            />
          </label>
          <p className="text-[11px] text-slate-400">
            Railway, division, your name and designation come from your profile ({currentUser?.name || "not set"}).
          </p>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-sky-900">Will export</p>
        {preview.lines.length === 0 ? (
          <p className="text-sm text-sky-900">
            {mode === "ic"
              ? "No monthly inspections recorded this month."
              : "No footplate trips selected."}
          </p>
        ) : (
          preview.lines.slice(0, 8).map((l, i) => (
            <p key={i} className="truncate text-sm text-sky-900">{l}</p>
          ))
        )}
        {preview.lines.length > 8 && (
          <p className="text-xs text-sky-700">…and {preview.lines.length - 8} more</p>
        )}
        {mode === "footplate" &&
          preview.ok &&
          !selectedTrips.some((l) => {
            const o = l.footplateObs;
            return o && (o.day || o.night ? matrixTickCount((o.day ?? o.night)!) > 0 : false);
          }) && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
              Lamp tick rows are blank. Ticks come from the trip entry: open it →
              Footplate observation → Station visibility matrix → tap the YY/G/Y/R
              buttons under Distant / Home / Starter / Adv. Starter; they print as
              √. Stations are pre-listed automatically — or leave blank and tick
              with a pen on the printed sheet.
            </p>
          )}
      </div>

      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => {
            if (mode === "ic") {
              exportCertificate(
                period,
                included,
                monthLogs,
                stations,
                deficiencies,
                currentUser,
                extra,
                onClose
              );
            } else {
              exportFootplateForms(period, selectedTrips, currentUser, extra, stations, onClose);
            }
          }}
        >
          Generate PDF
        </PrimaryButton>
      </div>
    </Modal>
  );
}

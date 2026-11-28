"use client";

import { useMemo, useState } from "react";
import { useData } from "./DataProvider";
import { Modal, PrimaryButton } from "./ui";
import { exportMonthlyFormats } from "./exports";
import { PeriodPicker, monthPeriod, type Period } from "./PeriodPicker";
import {
  buildCertificateModel,
  footplateFormSpecs,
  footplateSheetKey,
  loadCertExtra,
  loadRepairsMemory,
  loadRepairsReqMemory,
  matrixTickCount,
  saveCertExtra,
  saveRepairsMemory,
  saveRepairsReqMemory,
  type CertExtra,
} from "@/lib/certificate";
import { footplateRidesOf, fmtDate } from "@/lib/api";
import { extractDateIso, extractPcdoWorks, matchPcdoToStations, type PcdoItem } from "@/lib/pcdo-pdf";

/** One editable row of the repairs reviewer — date as printed (dd-mm-yyyy). */
type DraftItem = { text: string; date: string };

const isoToDmy = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "";

const dmyToIso = (d: string): string | null => {
  const m = d.trim().match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  return m ? extractDateIso(`${m[1]}-${m[2]}-${m[3]}`) : null;
};

/** Official monthly formats — ONE report: the IC Certificate (Form S&T./IC.3.3)
 *  for the month's monthly inspections, followed by the Foot Plate Observation
 *  (Annexure 3-A2) forms for the selected trips. */
export function CertificateExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logs, stations, deficiencies, currentUser: user } = useData();
  const currentUser = user ?? null;
  const [period, setPeriod] = useState<Period>(() => monthPeriod(0));
  const [custom, setCustom] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [extra, setExtra] = useState<CertExtra>(() => loadCertExtra());
  // Attach the profile signature image to the PDF (yes by default; the
  // report can be generated without it).
  const [attachSig, setAttachSig] = useState(true);
  // Foot plate sheets start all-selected; unchecked sheet keys land here.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  // Attached PCDO PDF (parsed): works feed the "Repairs done" column.
  const [pcdo, setPcdo] = useState<
    { name: string; matched: { station: string; items: PcdoItem[] }[]; unmatched: string[] } | null
  >(null);
  const [pcdoBusy, setPcdoBusy] = useState(false);
  const [pcdoErr, setPcdoErr] = useState("");
  // Reviewer: every register station with its editable works list.
  const [draft, setDraft] = useState<{ station: string; items: DraftItem[]; carried: boolean }[]>([]);
  const [unGroups, setUnGroups] = useState<{ label: string; items: PcdoItem[] }[]>([]);
  const [carriedFrom, setCarriedFrom] = useState("");
  // "Repairs Required" footer — typed by hand, remembered month to month.
  // Seeded from the memory on open (and re-seeded when the period changes, so
  // a strictly EARLIER month's list is carried; a later month's never is).
  const [repairsReq, setRepairsReq] = useState<string[]>(() => {
    const mem = loadRepairsReqMemory();
    const cur = monthPeriod(0).from.slice(0, 7);
    return mem?.month && mem.month < cur && mem.items.length ? mem.items : [""];
  });
  const [repairsReqFrom, setRepairsReqFrom] = useState(() => {
    const mem = loadRepairsReqMemory();
    const cur = monthPeriod(0).from.slice(0, 7);
    return mem?.month && mem.month < cur && mem.items.length ? mem.month : "";
  });

  // Re-seed the footer whenever the chosen period changes (event handler, not
  // an effect — avoids a cascading render).
  const onPeriodChange = (p: Period) => {
    setPeriod(p);
    const mem = loadRepairsReqMemory();
    const cur = p.from.slice(0, 7);
    if (mem?.month && mem.month < cur && mem.items.length) {
      setRepairsReq(mem.items);
      setRepairsReqFrom(mem.month);
    } else {
      setRepairsReq([""]);
      setRepairsReqFrom("");
    }
  };

  const onPcdoFile = async (f: File | null) => {
    setPcdoErr("");
    setPcdo(null);
    setDraft([]);
    setUnGroups([]);
    if (!f) return;
    setPcdoBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const res = await extractPcdoWorks(bytes);
      const { matched, unmatched } = matchPcdoToStations(res, stations);
      const arr = [...matched].map(([station, items]) => ({ station, items }));
      if (!arr.length) {
        setPcdoErr(
          "No works recognised in this PDF. Is it a PCDO return with Highlights / Signalling / Engineering sections (not a scan)?"
        );
      } else {
        setPcdo({ name: f.name, matched: arr, unmatched });
        // Carry-over only from a strictly EARLIER month: exporting September
        // after October must never resurrect October's rows as "last month".
        const cur = period.from.slice(0, 7);
        const mem = loadRepairsMemory();
        const memOk = !!mem?.month && mem.month < cur;
        setDraft(
          stations.map((st) => {
            const pdf = matched.get(st.name);
            if (pdf) return { station: st.name, items: pdf.map((i) => ({ text: i.text, date: isoToDmy(i.dateIso ?? "") })), carried: false };
            const old = memOk ? mem?.stations.find((m) => m.station === st.name) : undefined;
            if (old?.items.length)
              return { station: st.name, items: old.items.map((i) => ({ text: i.text, date: isoToDmy(i.dateIso ?? "") })), carried: true };
            return { station: st.name, items: [{ text: "", date: "" }], carried: false };
          })
        );
        setUnGroups(
          res.stations
            .filter((s) => unmatched.includes(s.label) && s.items.length)
            .map((s) => ({ label: s.label, items: s.items }))
        );
        setCarriedFrom(memOk && mem?.month ? mem.month : "");
      }
    } catch (e) {
      setPcdoErr("Could not read this PDF: " + String(e));
    } finally {
      setPcdoBusy(false);
    }
  };

  const patchDraft = (di: number, ii: number, p: Partial<DraftItem>) =>
    setDraft((ds) => ds.map((d, i) => (i !== di ? d : { ...d, items: d.items.map((it, j) => (j !== ii ? it : { ...it, ...p })) })));

  const addDraftRow = (di: number) =>
    setDraft((ds) => ds.map((d, i) => (i !== di ? d : { ...d, items: [...d.items, { text: "", date: "" }] })));

  const delDraftRow = (di: number, ii: number) =>
    setDraft((ds) => ds.map((d, i) => (i !== di ? d : { ...d, items: d.items.filter((_, j) => j !== ii) })));

  const moveGroupTo = (label: string, station: string) => {
    const g = unGroups.find((u) => u.label === label);
    if (!g) return;
    setUnGroups((gs) => gs.filter((u) => u.label !== label));
    setDraft((ds) => {
      const at = ds.findIndex((d) => d.station === station);
      const add = g.items.map((i) => ({ text: i.text, date: isoToDmy(i.dateIso ?? "") }));
      if (at < 0) return [...ds, { station, items: add, carried: false }];
      return ds.map((d, i) => (i === at ? { ...d, items: [...d.items.filter((it) => it.text.trim()), ...add] } : d));
    });
  };

  // Final "Repairs done" source: edited lists when present, parsed map otherwise.
  const finalRepairs = useMemo(
    () =>
      draft.length
        ? draft.map((d) => ({
            station: d.station,
            items: d.items
              .filter((i) => i.text.trim())
              .map((i) => ({ text: i.text.trim(), dateIso: dmyToIso(i.date) }))
              .sort((a, b) => (a.dateIso || "9999").localeCompare(b.dateIso || "9999")),
          }))
        : pcdo?.matched,
    [draft, pcdo]
  );

  // Non-empty "Repairs Required" lines, in the order typed.
  const repairsReqLines = useMemo(
    () => repairsReq.map((s) => s.trim()).filter(Boolean),
    [repairsReq]
  );

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
  // One row per PRINTED sheet (Day Up / Day Down / Night Up / ...), so a trip
  // with two journeys can be exported partly or wholly.
  const tripSheets = useMemo(
    () =>
      footTrips.flatMap((l) =>
        footplateFormSpecs(l, currentUser, extra, stations).map((spec, i) => ({
          key: footplateSheetKey(l.id, i),
          logId: l.id,
          logDate: l.logDate,
          label: `${spec.shift === "DAY" ? "Day" : "Night"}${
            spec.direction ? ` ${spec.direction}` : ""
          }${spec.trainNo ? ` · ${spec.trainNo}` : ""}`,
        }))
      ),
    [footTrips, currentUser, extra, stations]
  );
  const selectedKeys = new Set(tripSheets.filter((s) => !deselected.has(s.key)).map((s) => s.key));
  const selectedTrips = footTrips.filter((l) => tripSheets.some((s) => s.logId === l.id && selectedKeys.has(s.key)));

  const preview = useMemo(() => {
    const model = buildCertificateModel({
      included,
      allMonthLogs: monthLogs,
      stations,
      deficiencies,
      staff: currentUser,
      extra,
      yearMonth: period.from.slice(0, 7),
      pcdoRepairs: finalRepairs,
      repairsRequiredFooter: repairsReqLines,
    });
    const specs = selectedTrips.flatMap((l) =>
      footplateFormSpecs(l, currentUser, extra, stations).filter(
        (_, i) => !deselected.has(footplateSheetKey(l.id, i))
      )
    );
    const lines = [
      ...model.rows.map(
        (r) =>
          `${r.station}: ${r.dates.length} visit${r.dates.length !== 1 ? "s" : ""} · ${r.condition}${
            r.repairsDone.length ? ` · ${r.repairsDone.length} repair item${r.repairsDone.length !== 1 ? "s" : ""}` : ""
          }`
      ),
      ...(model.repairsRequiredFooter.length
        ? [`Repairs required: ${model.repairsRequiredFooter.length} item(s)`]
        : []),
      ...(specs.length
        ? [`Foot plate forms: ${specs.length} sheet${specs.length !== 1 ? "s" : ""}`]
        : []),
    ];
    return { ok: model.rows.length > 0 || specs.length > 0, lines };
  }, [included, monthLogs, stations, deficiencies, currentUser, extra, selectedTrips, deselected, period.from, finalRepairs, repairsReqLines]);

  const missingMeta = !extra.addressedTo.trim() || !extra.throughLine.trim();

  const patchExtra = (p: Partial<CertExtra>) => {
    const next = { ...extra, ...p };
    setExtra(next);
    saveCertExtra(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Official Monthly Formats" wide>
      <div className="mb-3">
        <PeriodPicker period={period} onChange={onPeriodChange} custom={custom} setCustom={setCustom} />
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            Foot plate sheets ({selectedKeys.size}/{tripSheets.length})
          </p>
          {tripSheets.length > 0 && (
            <button
              onClick={() =>
                setDeselected(
                  selectedKeys.size === tripSheets.length
                    ? new Set(tripSheets.map((s) => s.key))
                    : new Set()
                )
              }
              className="text-xs font-medium text-blue-600 underline"
            >
              {selectedKeys.size === tripSheets.length ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
          {tripSheets.length === 0 ? (
            <p className="p-3 text-center text-sm text-slate-400">No footplate trips this month.</p>
          ) : (
            tripSheets.map((s) => (
              <label
                key={s.key}
                className={`flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 ${
                  !deselected.has(s.key) ? "bg-sky-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={!deselected.has(s.key)}
                  onChange={() => {
                    const n = new Set(deselected);
                    if (n.has(s.key)) n.delete(s.key);
                    else n.add(s.key);
                    setDeselected(n);
                  }}
                  className="h-4 w-4 accent-sky-600"
                />
                <span className="w-24 flex-shrink-0 text-xs text-slate-500">{fmtDate(s.logDate)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{s.label}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {missingMeta && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          One-time setup below — the TO / Through lines and section, printed on the forms.
        </p>
      )}

      <div className="mb-3 rounded-lg border border-slate-200 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-slate-700">
            PCDO PDF — &ldquo;Repairs done&rdquo; source
          </p>
          {pcdo && (
            <button
              type="button"
              onClick={() => {
                setPcdo(null);
                setDraft([]);
                setUnGroups([]);
              }}
              className="text-xs font-medium text-red-600 underline"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mb-2 text-[11px] leading-snug text-slate-500">
          Optional. Upload the office PCDO return for the month — its works
          (Highlights / Signalling / Engineering sections) fill the
          &ldquo;Repairs done during the Month&rdquo; column in ascending
          work-date order, replacing the daily-notes roll-up.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 active:bg-sky-100">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={pcdoBusy}
            onChange={(e) => {
              void onPcdoFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
          {pcdoBusy ? "Reading PDF…" : pcdo ? "Replace PDF" : "Choose PCDO PDF…"}
        </label>
        {pcdo && (
          <div className="mt-2">
            <p className="truncate text-[11px] font-medium text-slate-600">{pcdo.name}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {pcdo.matched.map((m) => (
                <span
                  key={m.station}
                  className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900"
                >
                  {m.station} · {m.items.length}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
              Review below — fix a work placed under the wrong station, correct
              its date, add anything the PDF missed, or leave a station blank.
            </p>
            {carriedFrom && (
              <p className="mt-1 text-[10px] text-slate-400">
                Entries tagged “from last month” were carried over from your
                {carriedFrom.replace("-", " ")} export — edit or clear freely.
              </p>
            )}
            <div className="mt-1.5 max-h-72 space-y-1 overflow-y-auto pr-0.5">
              {draft.map((d, di) => {
                const filled = d.items.filter((i) => i.text.trim()).length;
                return (
                  <details key={d.station} open={filled > 0} className="rounded-md border border-slate-200">
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-[12px] font-semibold text-slate-700">
                      {d.station}
                      <span className="ml-1 font-normal text-slate-400">
                        {filled} work{filled !== 1 ? "s" : ""}
                        {d.carried && filled > 0 ? " · from last month" : filled === 0 && !d.carried ? " · blank" : ""}
                      </span>
                    </summary>
                    <div className="px-2 pb-2">
                      {d.items.map((it, ii) => (
                        <div key={ii} className="mt-1 flex items-center gap-1">
                          <input
                            value={it.text}
                            placeholder="Work done"
                            onChange={(e) => patchDraft(di, ii, { text: e.target.value })}
                            className="min-w-0 flex-1 rounded border border-slate-200 bg-surface px-2 py-1 text-[12px]"
                          />
                          <input
                            value={it.date}
                            placeholder="dd-mm-yyyy"
                            inputMode="numeric"
                            onChange={(e) => patchDraft(di, ii, { date: e.target.value })}
                            className="w-24 flex-shrink-0 rounded border border-slate-200 bg-surface px-1.5 py-1 text-[11px]"
                          />
                          <button
                            type="button"
                            aria-label={`Remove work from ${d.station}`}
                            onClick={() => delDraftRow(di, ii)}
                            className="px-1 text-base leading-none text-slate-400 hover:text-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addDraftRow(di)}
                        className="mt-1 text-[11px] font-semibold text-sky-700"
                      >
                        + Add work
                      </button>
                    </div>
                  </details>
                );
              })}
              {unGroups.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[11px] font-semibold text-amber-800">
                    PDF labels that matched no station of yours — pick where their works go:
                  </p>
                  {unGroups.map((g) => (
                    <div key={g.label} className="mt-1.5 flex items-center gap-1.5">
                      <span className="w-28 flex-shrink-0 truncate text-[11px] font-medium text-amber-900" title={g.label}>
                        {g.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] text-amber-700">
                        {g.items.map((i) => i.text).join(" · ")}
                      </span>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) moveGroupTo(g.label, e.target.value);
                        }}
                        className="flex-shrink-0 rounded border border-amber-300 bg-white px-1 py-0.5 text-[11px]"
                      >
                        <option value="">Move to…</option>
                        {stations.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {pcdoErr && <p className="mt-2 text-[11px] leading-snug text-red-600">{pcdoErr}</p>}
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-slate-700">
            Repairs Required (below the table)
          </p>
          <button
            type="button"
            onClick={() => setRepairsReq((r) => [...r, ""])}
            className="text-xs font-medium text-sky-700"
          >
            + Add item
          </button>
        </div>
        <p className="mb-2 text-[11px] leading-snug text-slate-500">
          Typed by hand and remembered — the next month&rsquo;s certificate
          pre-fills from this list.
        </p>
        {repairsReqFrom && (
          <p className="mb-1 text-[10px] text-slate-400">
            Carried over from your {repairsReqFrom.replace("-", " ")} certificate — edit or clear freely.
          </p>
        )}
        <div className="space-y-1">
          {repairsReq.map((line, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-5 flex-shrink-0 text-right text-[11px] text-slate-400">{i + 1}.</span>
              <input
                value={line}
                placeholder="Repair required"
                onChange={(e) =>
                  setRepairsReq((r) => r.map((v, j) => (j === i ? e.target.value : v)))
                }
                className="min-w-0 flex-1 rounded border border-slate-200 bg-surface px-2 py-1 text-[12px]"
              />
              <button
                type="button"
                aria-label={`Remove repair item ${i + 1}`}
                onClick={() => setRepairsReq((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [""]))}
                className="px-1 text-base leading-none text-slate-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

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
          <p className="text-sm text-sky-900">No monthly inspections or footplate trips recorded this month.</p>
        ) : (
          preview.lines.slice(0, 8).map((l, i) => (
            <p key={i} className="truncate text-sm text-sky-900">{l}</p>
          ))
        )}
        {preview.lines.length > 8 && (
          <p className="text-xs text-sky-700">…and {preview.lines.length - 8} more</p>
        )}
        {preview.ok &&
          selectedTrips.length > 0 &&
          !selectedTrips.some((l) => {
            const o = l.footplateObs;
            return o && (o.day || o.night ? matrixTickCount((o.day ?? o.night)!) > 0 : false);
          }) && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
              Lamp tick rows are blank. Ticks come from the trip entry: open it →
              Observation sheet (Annexure 3-A2) → Station visibility matrix →
              tap the YY/G/Y/R buttons under Distant / Home / Starter / Adv.
              Starter; they print as √. Stations are pre-listed automatically —
              or leave blank and tick with a pen on the printed sheet.
            </p>
          )}
      </div>

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={attachSig}
          onChange={(e) => setAttachSig(e.target.checked)}
          className="h-4 w-4 accent-sky-600"
        />
        Attach profile signature image to the PDF
      </label>

      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => {
            if (finalRepairs?.length) {
              saveRepairsMemory({
                month: period.from.slice(0, 7),
                stations: finalRepairs.filter((g) => g.items.length > 0),
              });
            }
            saveRepairsReqMemory({ month: period.from.slice(0, 7), items: repairsReqLines });
            exportMonthlyFormats(
              period,
              included,
              monthLogs,
              stations,
              deficiencies,
              currentUser,
              extra,
              selectedTrips,
              onClose,
              finalRepairs,
              repairsReqLines,
              { includeSignature: attachSig, sheetKeys: selectedKeys }
            );
          }}
        >
          Generate PDF
        </PrimaryButton>
      </div>
    </Modal>
  );
}

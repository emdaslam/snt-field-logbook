/**
 * Official monthly-print metadata + builders for the two S&T certificate
 * formats (Form S&T./IC.3.3 inspection & testing certificate, and the
 * Annexure 3-A2 foot plate observation). Pure logic — HTML assembly is
 * string-only so certificate.check.ts can exercise it headlessly.
 */

import type { DailyLog, DeficiencyTask, Station, Staff } from "@/db/schema";
import { footplateRidesOf } from "@/lib/api";

/** Extra header lines the official formats need that the staff profile does
 *  not carry. Persisted as one JSON blob under "snt.certMeta". */
export type CertExtra = {
  /** "TO, The ___" line of the IC certificate (e.g. "Sr DSTE/M/GTL"). */
  addressedTo: string;
  /** "Through ___" line (e.g. "SSE/SIG/JMDG"). Doubles as the SSE signature line. */
  throughLine: string;
  /** Section suffix for the foot plate "Division & Section" line (e.g. "KLKA-YA"). */
  sectionCode: string;
};

export const DEFAULT_CERT_EXTRA: CertExtra = { addressedTo: "", throughLine: "", sectionCode: "" };

const LS_CERT_META = "snt.certMeta";

export function loadCertExtra(): CertExtra {
  try {
    const raw = localStorage.getItem(LS_CERT_META);
    if (!raw) return { ...DEFAULT_CERT_EXTRA };
    return { ...DEFAULT_CERT_EXTRA, ...(JSON.parse(raw) as Partial<CertExtra>) };
  } catch {
    return { ...DEFAULT_CERT_EXTRA };
  }
}

export function saveCertExtra(extra: CertExtra): void {
  try {
    localStorage.setItem(LS_CERT_META, JSON.stringify(extra));
  } catch {
    // Storage unavailable — the fields simply stay for this session only.
  }
}

/* ------------------------------------------------------------------ */
/* Shared HTML helpers                                                 */
/* ------------------------------------------------------------------ */

export function hEsc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Multiline free text → HTML-safe lines joined with <br/>. Blank → placeholder. */
export function hLines(s: string | null | undefined, blank = "----"): string {
  const v = (s ?? "").trim();
  if (!v) return hEsc(blank);
  return hEsc(v).replace(/\r?\n/g, "<br/>");
}

/** "JULY 2026" from an ISO month prefix "2026-07" or period label "July 2026". */
export function monthUpper(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const idx = Math.max(0, Math.min(11, Number(m) - 1 || 0));
  return `${names[idx].toUpperCase()} ${y}`;
}

/** "JULY" — bare month name, for the quoted MONTH OF '…' header lines. */
export function monthName(yearMonth: string): string {
  return monthUpper(yearMonth).split(" ")[0] ?? "";
}

/** "05-07-2026" — the DD-MM-YYYY style used inside the certificate tables. */
export function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/* ------------------------------------------------------------------ */
/* Form S&T./IC.3.3 — inspection & testing certificate                 */
/* ------------------------------------------------------------------ */

export const HOURS_BANDS = ["\u22644 Hrs", ">4 Hrs", ">8 Hrs", ">16 Hrs"] as const;

export const CONDITIONS = ["Satisfactory", "Unsatisfactory"] as const;
export type GearCondition = (typeof CONDITIONS)[number];

export const DEFAULT_GEAR_TYPE = "All Signaling & Interlocking Equipment";

export type CertRow = {
  station: string;
  dates: string[];
  nature: string;
  hours: string;
  gear: string;
  condition: string;
  repairsDone: { date: string; text: string }[];
  repairsRequired: string;
};

export type CertModel = {
  para: string;
  annexure: string;
  formNo: string;
  railway: string;
  monthName: string;
  monthYear: string;
  division: string;
  station: string;
  addressedTo: string;
  throughLine: string;
  rows: CertRow[];
  repairsRequiredFooter: string[];
  jeLine: string;
};

/** Movement kinds that never carry repair narratives. */
const NON_WORK_KINDS = new Set(["rest", "leave", "cr", "nh"]);

/**
 * Roll a month of logs into the certificate model.
 *
 * `included` holds the monthly-inspection logs the certificate covers — their
 * inspection dates / hours / condition / gear / repairs-required drive the
 * table rows, grouped per station in first-appearance order. `allMonthLogs`
 * feeds the "Repairs done during the Month" column: every non-rest/leave
 * entry touching that station with a work narrative becomes one dated item.
 *
 * ponytail: the paper form occasionally carries items dated in the closing
 * days of the previous month; this rolls strictly month-scoped items —
 * widen the window later only if that matters in practice.
 */
export function buildCertificateModel(args: {
  included: DailyLog[];
  allMonthLogs: DailyLog[];
  stations: Station[];
  deficiencies: DeficiencyTask[];
  staff?: Staff | null;
  extra: CertExtra;
  yearMonth: string;
}): CertModel {
  const { included, allMonthLogs, stations, deficiencies, staff, extra, yearMonth } = args;
  const nameOf = (id: number | null) => stations.find((s) => s.id === id)?.name ?? "";

  const orderedStations: string[] = [];
  for (const l of included) {
    const st = nameOf(l.inspectionStationId);
    if (st && !orderedStations.includes(st)) orderedStations.push(st);
  }

  const rows: CertRow[] = orderedStations.map((station) => {
    const atStation = included.filter((l) => nameOf(l.inspectionStationId) === station);
    const hours = pickStrongestBand(atStation.map((l) => l.certHours ?? ""));
    const condition = atStation.some((l) => (l.certCondition ?? "") === "Unsatisfactory")
      ? "Unsatisfactory"
      : "Satisfactory";
    const gear = atStation.map((l) => l.certGear ?? "").find(Boolean) || DEFAULT_GEAR_TYPE;
    const repairsRequired =
      atStation.map((l) => l.certRepairsReq ?? "").find((v) => v.trim()) || "";

    const items: { date: string; text: string }[] = [];
    for (const l of allMonthLogs) {
      if (NON_WORK_KINDS.has(l.movementKind ?? "")) continue;
      if (!touchesStation(l, stations, station)) continue;
      const text = (l.workDone ?? "").trim();
      if (!text) continue;
      items.push({ date: l.logDate, text });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));

    return {
      station,
      dates: atStation.map((l) => l.logDate),
      nature: (atStation[0]?.inspectionKind ?? "monthly").toUpperCase(),
      hours,
      gear,
      condition,
      repairsDone: items,
      repairsRequired,
    };
  });

  const footerStations = new Set(orderedStations);
  const foot = pendingDeficiencyTitles(footerStations, deficiencies, nameOf);
  const jeLine = staff?.designation?.trim() || "";
  const officeStation =
    staff?.headquartersStationId != null
      ? nameOf(staff.headquartersStationId)
      : orderedStations[0] ?? "";

  return {
    para: "Para No. 3.3.1(a)",
    annexure: "Annexure: 3-A3",
    formNo: "Form No. S&T./IC.3.3",
    railway: staff?.railwayZone || "South Coast Railway",
    monthName: monthName(yearMonth),
    monthYear: yearMonth.split("-")[0] ?? "",
    division: staff?.railwayDivision || "",
    station: officeStation,
    addressedTo: extra.addressedTo,
    throughLine: extra.throughLine,
    rows,
    repairsRequiredFooter: foot,
    jeLine,
  };
}

/** Pick the strongest band label present (order = HOURS_BANDS). */
function pickStrongestBand(values: string[]): string {
  let bestIdx = -1;
  let best = "";
  for (const v of values) {
    const idx = (HOURS_BANDS as readonly string[]).indexOf(v);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = v;
    }
  }
  return best;
}

/** Whether a log belongs to the station: its movement chain (the entry's
 *  station, matched by name or code), its inspection station, or any named
 *  extra-stop matches. */
export function touchesStation(l: DailyLog, stations: Station[], stationName: string): boolean {
  const raw = (l.stationMovement ?? "").trim();
  const named = (t: string): boolean => {
    if (!t) return false;
    if (t === "__footplate__" || t === "__temp__") return false;
    const byName = stations.find((s) => s.name === t);
    if (byName) return byName.name === stationName;
    const byCode = stations.find((s) => s.code && s.code.trim() !== "" && s.code === t);
    if (byCode) return byCode.name === stationName;
    return t === stationName;
  };
  if (named(raw)) return true;
  const insp = stations.find((s) => s.id === l.inspectionStationId);
  if (insp && insp.name === stationName) return true;
  for (const stop of l.extraStops ?? []) {
    if (named(stop)) return true;
  }
  return false;
}

/** Footer "Repairs Required" lines: still-open Signalling deficiencies whose
 *  station sits among the certificate's stations. */
export function pendingDeficiencyTitles(
  stationNames: Set<string>,
  deficiencies: DeficiencyTask[],
  nameOf: (id: number | null) => string
): string[] {
  const out: string[] = [];
  for (const d of deficiencies) {
    if ((d.department || "") !== "Signalling") continue;
    if (d.status === "Completed" || d.completedAt != null) continue;
    const at = nameOf(d.stationId);
    if (stationNames.size > 0 && at && !stationNames.has(at)) continue;
    const badge = d.repeatCount ? ` (×${d.repeatCount})` : "";
    out.push(`${d.title}${badge} — ${at || "section"}`);
  }
  return out;
}

/** Full certificate HTML (landscape A4). */
export function certificateHtml(m: CertModel): string {
  let h = `<div class="cert-head">`;
  h += `<p class="tiny-row"><span>${hEsc(m.para)}</span><span>${hEsc(m.annexure)} · ${hEsc(m.formNo)}</span></p>`;
  h += `<h1>INSPECTION AND TESTING CERTIFICATE</h1>`;
  h += `<p class="sub">${hEsc(m.railway)}<br/>SIGNAL &amp; TELECOMMUNICATION DEPARTMENT</p>`;
  h += `<p class="meta-row"><span>MONTH OF &lsquo;${hEsc(m.monthName)}&rsquo; ${hEsc(m.monthYear)}</span>`;
  if (m.division) h += `<span>Division: ${hEsc(m.division)}</span>`;
  h += `</p>`;
  if (m.addressedTo || m.throughLine || m.station) {
    h += `<p class="addr">`;
    if (m.addressedTo) h += `TO,<br/>The ${hEsc(m.addressedTo)}<br/>`;
    if (m.throughLine) h += `Through ${hEsc(m.throughLine)}`;
    h += `</p>`;
    if (m.station) h += `<p class="meta-row"><span></span><span>Station: ${hEsc(m.station)}</span></p>`;
  }
  h += `</div>`;
  h += `<p class="certify">This is to certify that I have personally inspected and tested all the signal gears at the following stations/sections on my jurisdiction. The details of inspection carried out are shown below:</p>`;

  h += `<table class="cert-table"><thead><tr>` +
    `<th>Date of<br/>inspection</th><th>Station<br/>visited</th><th>Nature of<br/>inspection &amp;<br/>time spent</th><th>Gear<br/>Type</th>` +
    `<th>Condition</th><th>Repairs done during the Month</th><th>Repairs<br/>Required</th></tr></thead><tbody>`;
  for (const r of m.rows) {
    h += `<tr>`;
    h += `<td>${r.dates.map((d) => `${Number(d.slice(8))}<br/>${monthShort(d)}`).join("<br/>")}</td>`;
    h += `<td class="center">${hEsc(r.station)}</td>`;
    h += `<td>${hEsc(r.nature)}<br/><br/>${hEsc(r.hours)}</td>`;
    h += `<td class="small center">${hEsc(r.gear)}</td>`;
    h += `<td class="center">${hEsc(r.condition)}</td>`;
    h += `<td>${
      r.repairsDone.length
        ? r.repairsDone
            .map((it, i) => `${i + 1}) ${hEsc(it.text)} <em>(${ddmmyyyy(it.date)})</em>`)
            .join("<br/>")
        : "----"
    }</td>`;
    h += `<td class="small center">${hLines(r.repairsRequired)}</td>`;
    h += `</tr>`;
  }
  h += `</tbody></table>`;

  if (m.repairsRequiredFooter.length > 0) {
    h += `<p class="meta"><strong>Repairs Required:</strong></p>`;
    m.repairsRequiredFooter.forEach((line, i) => {
      h += `<p>${i + 1}. ${hEsc(line)}</p>`;
    });
  }

  if (m.jeLine) h += `<p class="sig"><strong>${hEsc(m.jeLine)}</strong></p>`;
  if (m.addressedTo) h += `<p class="fwd">Forwarded to ${hEsc(m.addressedTo)}</p>`;
  if (m.throughLine) h += `<p class="sig"><strong>${hEsc(m.throughLine)}</strong></p>`;
  return h;
}

function monthShort(iso: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = Number(iso.split("-")[1]);
  return names[Math.max(0, Math.min(11, m - 1))] ?? "";
}

/* ------------------------------------------------------------------ */
/* Annexure 3-A2 — foot plate inspection of signals                    */
/* ------------------------------------------------------------------ */

export type ObsAnswers = Record<string, string>;

export type MatrixSlot = "D" | "H" | "S" | "AD";
export const MATRIX_SLOTS: MatrixSlot[] = ["D", "H", "S", "AD"];
export const SLOT_LABEL: Record<MatrixSlot, string> = {
  D: "Distant",
  H: "Home",
  S: "Starter",
  AD: "Adv. Starter",
};
export const MATRIX_LAMPS = ["YY", "G", "Y", "R"] as const;

export type ObsMatrixStation = {
  stationId: number | null;
  stationName: string;
  lamps: Partial<Record<MatrixSlot, string[]>>;
  visibility: string;
  led: string;
  interference: boolean;
};

export type ObsShiftForm = {
  general: ObsAnswers;
  signalling: ObsAnswers;
  running: ObsAnswers;
  trainLoad: string;
  observation: string;
  assistance: string;
  matrix: ObsMatrixStation[];
};

export type FootplateObs = { day: ObsShiftForm | null; night: ObsShiftForm | null };

/** (a)–(w) general items minus the ride-derived lines (a date / b section /
 *  c train / d engine / e LP / g guard come straight off the trip). */
export const GENERAL_ITEMS: { key: string; code: string; label: string; def: string }[] = [
  { key: "g_c_load", code: "(c) load", label: "Train load (coaches / wagons)", def: "" },
  { key: "g_f", code: "(f)", label: "Asst. Loco Pilot Name", def: "-----------" },
  { key: "g_h", code: "(h)", label: "Detonators / Flags / Flasher", def: "AVAILABLE" },
  { key: "g_i", code: "(i)", label: "Long / Short Hood Leading", def: "SHORT-HOOD" },
  { key: "g_j", code: "(j)", label: "Speedometer / Pressure Gauges", def: "WORKING" },
  { key: "g_k", code: "(k)", label: "Portable telephone / Walkie Talkie", def: "WORKING" },
  { key: "g_l", code: "(l)", label: "Mobile phone switched off during running", def: "SWITCHED OFF" },
  { key: "g_m", code: "(m)", label: "Weather (Clear / Cloudy / Foggy)", def: "CLEAR" },
  { key: "g_n", code: "(n)", label: "ALP/LP calling out signals", def: "YES" },
  { key: "g_o", code: "(o)", label: "Vigilance Control Device", def: "AVAILABLE" },
  { key: "g_p", code: "(p)", label: "Loco Pilot equipment (spectacles)", def: "AVAILABLE" },
  { key: "g_q", code: "(q)", label: "First Aid Box", def: "AVAILABLE" },
  { key: "g_r", code: "(r)", label: "Headlight, adequacy of lights in loco cabin", def: "GOOD" },
  { key: "g_s", code: "(s)", label: "Competency & medical certificate of LP/ALP", def: "AVAILABLE" },
  { key: "g_t", code: "(t)", label: "Caution orders", def: "AVAILABLE" },
  { key: "g_u", code: "(u)", label: "Loco trouble shooting guide", def: "AVAILABLE" },
  { key: "g_v", code: "(v)", label: "Fire extinguishers", def: "AVAILABLE" },
  { key: "g_w", code: "(w)", label: "Sanders working", def: "WORKING" },
];

export const SIGNALLING_ITEMS: { key: string; code: string; label: string; def: string }[] = [
  { key: "s_a", code: "(a)", label: "Visibility of signals", def: "GOOD" },
  { key: "s_b", code: "(b)", label: "Signal number, aspect & markers", def: "GOOD" },
  { key: "s_c", code: "(c)", label: "Presence boards (speed / stop / SLB / BSLB)", def: "AVAILABLE" },
  { key: "s_d", code: "(d)", label: "Hanging parts / accessories on signal posts", def: "NO HANGING PARTS" },
  { key: "s_e", code: "(e)", label: "Out-of-plumb signals", def: "NO SIGNALS" },
  { key: "s_f", code: "(f)", label: "Visibility of signals in curves", def: "GOOD" },
  { key: "s_g", code: "(g)", label: "Background light dominating aspects", def: "NO" },
  { key: "s_h", code: "(h)", label: "Signals out of use (cross-bar boards)", def: "NO SIGNALS" },
  { key: "s_i", code: "(i)", label: "Loose packing at point zones", def: "NO" },
  { key: "s_j", code: "(j)", label: "Signal dropping / improperly taken off", def: "NO" },
  { key: "s_k", code: "(k)", label: "Aspect sequence", def: "WORKING" },
  { key: "s_l", code: "(l)", label: "Loco TCAS / TPWS / DMI", def: "" },
  { key: "s_m", code: "(m)", label: "Right hand signal (arrow towards line)", def: "NO SIGNAL" },
  { key: "s_n", code: "(n)", label: "Loco pilot feedback on section signals", def: "ALL GOOD" },
];

export const RUNNING_ITEMS: { key: string; code: string; label: string; def: string }[] = [
  { key: "r_a", code: "(a)", label: "Exchange of signals with station / LC staff / p-way", def: "YES" },
  { key: "r_b", code: "(b)", label: "Alertness of gate man / station / cabin staff", def: "YES" },
  { key: "r_c", code: "(c)", label: "Delayed clearance of signal", def: "NO" },
  { key: "r_d", code: "(d)", label: "Whistling while approaching LC gate", def: "YES" },
  { key: "r_e", code: "(e)", label: "Train passed via loop though main line free", def: "YES" },
  { key: "r_f", code: "(f)", label: "Observance of speed restrictions & caution orders", def: "YES" },
  { key: "r_g", code: "(g)", label: "Looking back at the formation in curves", def: "YES" },
  { key: "r_h", code: "(h)", label: "Signal complaints in CREW BOOKING SYSTEM (last 3 months)", def: "NO COMPLAINT" },
];

export function emptyShiftForm(): ObsShiftForm {
  const mk = (items: { key: string; def: string }[]) =>
    Object.fromEntries(items.map((i) => [i.key, i.def])) as ObsAnswers;
  return {
    general: mk(GENERAL_ITEMS),
    signalling: mk(SIGNALLING_ITEMS),
    running: mk(RUNNING_ITEMS),
    trainLoad: "",
    observation: "",
    assistance: "",
    matrix: [],
  };
}

export function emptyFootplateObs(): FootplateObs {
  return { day: null, night: null };
}

/** Most recent non-empty footplate obs across the logs (sorted desc) — the
 *  prefill source for a new trip's observation sheet. */
export function latestFootplateObs(logs: DailyLog[]): FootplateObs | null {
  for (const l of logs) {
    const o = l.footplateObs;
    if (o && (o.day || o.night)) return o;
  }
  return null;
}

/** Deep clone of an obs used as prefill. */
export function prefillFromLast(obs: FootplateObs): FootplateObs {
  return JSON.parse(JSON.stringify(obs)) as FootplateObs;
}

/** Normalise a stored obs so every checklist key exists with a sane value. */
export function normalizeObs(o: FootplateObs | null | undefined): FootplateObs {
  const base = emptyShiftForm();
  const fixShift = (s: ObsShiftForm | null): ObsShiftForm | null => {
    if (!s) return null;
    return {
      general: { ...base.general, ...(s.general ?? {}) },
      signalling: { ...base.signalling, ...(s.signalling ?? {}) },
      running: { ...base.running, ...(s.running ?? {}) },
      matrix: Array.isArray(s.matrix) ? s.matrix : [],
      trainLoad: s.trainLoad ?? "",
      observation: s.observation ?? "",
      assistance: s.assistance ?? "",
    };
  };
  if (!o) return { day: null, night: null };
  return { day: fixShift(o.day), night: fixShift(o.night) };
}

/** Tick count across the matrix — smoke-test hook. */
export function matrixTickCount(f: ObsShiftForm): number {
  return f.matrix.reduce(
    (n, st) => n + MATRIX_SLOTS.reduce((m, sl) => m + (st.lamps[sl]?.length ?? 0), 0),
    0
  );
}

/** One foot plate form section per shift, mapped from one trip log. */
export type FootPlateFormSpec = {
  shift: "DAY" | "NIGHT";
  dateIso: string;
  officialName: string;
  designation: string;
  divisionSection: string;
  trainNo: string;
  engineNo: string;
  lpName: string;
  alpName: string;
  guardName: string;
  form: ObsShiftForm;
};

/** Expand a footplate log into per-shift form specs (skips shifts the trip
 *  did not run and shifts with neither train nor answers). */
export function footplateFormSpecs(
  l: DailyLog,
  staff?: Staff | null,
  extra?: CertExtra
): FootPlateFormSpec[] {
  const obs = normalizeObs(l.footplateObs);
  const rides = footplateRidesOf(l);
  const primary = rides[0] ?? null;
  const blockOf = (shift: "day" | "night") =>
    primary
      ? primary[shift]
      : l[shift === "day" ? "footplateDay" : "footplateNight"];
  const trainOf = (shift: "day" | "night") => {
    const block = blockOf(shift);
    return block?.up ?? block?.down ?? null;
  };
  const section = [staff?.railwayDivision, extra?.sectionCode].filter(Boolean).join(", ");

  const specs: FootPlateFormSpec[] = [];
  for (const shift of ["day", "night"] as const) {
    const form = obs[shift];
    if (!form) continue;
    const det = trainOf(shift);
    if (!det && !obsHasContent(form)) continue;
    specs.push({
      shift: shift === "day" ? "DAY" : "NIGHT",
      dateIso: l.logDate,
      officialName: staff?.name ?? "",
      designation: staff?.designation ?? "",
      divisionSection: section,
      trainNo: det?.trainNo ?? "",
      engineNo: det?.engineNo ?? "",
      lpName: det?.lpName ?? "",
      alpName: det?.alpName ?? "",
      guardName: det?.tmrName ?? "",
      form,
    });
  }
  return specs;
}

function obsHasContent(f: ObsShiftForm): boolean {
  return Boolean(f.observation.trim() || f.assistance.trim() || matrixTickCount(f) > 0);
}

/** One printed Annexure 3-A2 form. */
export function footplateFormHtml(spec: FootPlateFormSpec, railway: string, yearMonth: string, forwardedTo: string, sseLine: string): string {
  const f = spec.form;
  let h = `<div class="fp-form">`;
  h += `<p class="tiny-row"><span>Para No. 3.3.1(c), 3.2.2(c)</span><span>Annexure: 3-A2</span></p>`;
  h += `<h1>FOOT PLATE INSPECTION OF SIGNALS</h1>`;
  h += `<p class="sub">${hEsc(railway)}<br/>MONTH OF &lsquo;${hEsc(monthName(yearMonth))}&rsquo; ${hEsc(yearMonth.split("-")[0] ?? "")}<br/>(RECORD OF OBSERVATION)</p>`;
  h += `<table class="hdr-table"><tbody>` +
    `<tr><td>Name of Official conducting inspection</td><td>${hEsc(spec.officialName)}</td></tr>` +
    `<tr><td>Designation</td><td>${hEsc(spec.designation)}</td></tr>` +
    `<tr><td>Division &amp; Section</td><td>${hEsc(spec.divisionSection)}</td></tr>` +
    `<tr><td>DAY/NIGHT</td><td>${spec.shift}</td></tr></tbody></table>`;

  h += `<h3>GENERAL ITEMS</h3><table class="chk-table"><tbody>`;
  const headPairs: [string, string, boolean][] = [
    ["(a) Date", ddmmyyyy(spec.dateIso), true],
    ["(b) Division, Section", f.general["g_b"] ?? spec.divisionSection, true],
    ["(c) Train No, Load", [spec.trainNo, f.trainLoad].filter(Boolean).join(", "), true],
    ["(d) Engine No, Parent Shed/Depot", spec.engineNo, true],
    ["(e) Loco pilot Name", spec.lpName, true],
    ["(f) Asst. Loco Pilot Name", spec.alpName || f.general["g_f"] || "-----------", true],
    ["(g) Guard's Name", spec.guardName, true],
  ];
  for (const [k, v] of headPairs) {
    h += `<tr><td>${hEsc(k)}</td><td>${hEsc(v) || "&mdash;"}</td></tr>`;
  }
  for (const it of GENERAL_ITEMS) {
    const v = f.general[it.key];
    if (v == null || v === "" || v === "-----------") continue;
    h += `<tr><td>${hEsc(it.code)} ${hEsc(it.label)}</td><td>${hEsc(v)}</td></tr>`;
  }
  h += `</tbody></table>`;

  h += `<h3>SIGNALLING ITEMS</h3><table class="chk-table"><tbody>`;
  for (const it of SIGNALLING_ITEMS) {
    const v = f.signalling[it.key];
    if (v == null || v === "") continue;
    h += `<tr><td>${hEsc(it.code)} ${hEsc(it.label)}</td><td>${hEsc(v)}</td></tr>`;
  }
  h += `</tbody></table>`;

  if (f.matrix.length > 0) {
    h += `<h3>Station wise signal visibility details</h3><table class="matrix-table"><thead><tr><th>Lamp</th>`;
    for (const st of f.matrix) h += `<th colspan="4">${hEsc(st.stationName)}</th>`;
    h += `</tr><tr><th></th>`;
    for (const _s of f.matrix) {
      for (const sl of MATRIX_SLOTS) h += `<th>${sl}</th>`;
    }
    h += `</tr></thead><tbody>`;
    for (const lamp of MATRIX_LAMPS) {
      h += `<tr><td>${lamp}</td>`;
      for (const st of f.matrix) {
        for (const sl of MATRIX_SLOTS) {
          h += `<td class="center">${st.lamps[sl]?.includes(lamp) ? "•" : ""}</td>`;
        }
      }
      h += `</tr>`;
    }
    const gradeRow = (label: string, pick: (s: ObsMatrixStation) => string) => {
      h += `<tr><td>${label}</td>`;
      for (const _st of f.matrix) h += `<td class="center small" colspan="4">${hEsc(pick(_st))}</td>`;
      h += `</tr>`;
    };
    gradeRow("Visibility", (s) => s.visibility);
    gradeRow("LED brightness", (s) => s.led);
    gradeRow("Interference (fixed light / trees)", (s) => (s.interference ? "YES" : "NO"));
    h += `</tbody></table>`;
  }

  h += `<h3>TRAIN RUNNING ITEMS</h3><table class="chk-table"><tbody>`;
  for (const it of RUNNING_ITEMS) {
    const v = f.running[it.key];
    if (v == null || v === "") continue;
    h += `<tr><td>${hEsc(it.code)} ${hEsc(it.label)}</td><td>${hEsc(v)}</td></tr>`;
  }
  h += `</tbody></table>`;

  h += `<table class="obs-table"><tbody>` +
    `<tr><td>1. Important item of observation on signalling &amp; action proposed (within own competency &amp; time frame)</td><td>${hLines(f.observation, "______")}</td></tr>` +
    `<tr><td>2. Assistance required (if any) and by whom and purpose</td><td>${hLines(f.assistance, "______")}</td></tr></tbody></table>`;

  if (spec.designation) h += `<p class="sig"><strong>${hEsc(spec.designation)}</strong></p>`;
  if (forwardedTo) h += `<p class="fwd">Forwarded to ${hEsc(forwardedTo)}</p>`;
  if (sseLine) h += `<p class="sig"><strong>${hEsc(sseLine)}</strong></p>`;
  h += `</div>`;
  return h;
}

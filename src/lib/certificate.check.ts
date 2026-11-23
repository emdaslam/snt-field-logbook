/**
 * Runnable assertions for the official-form builders in certificate.ts.
 *   npx tsx src/lib/certificate.check.ts
 */
import assert from "node:assert/strict";
import {
  buildCertificateModel,
  certificateHtml,
  footplateFormSpecs,
  footplateFormHtml,
  emptyShiftForm,
  emptyFootplateObs,
  latestFootplateObs,
  normalizeObs,
  prefillFromLast,
  matrixTickCount,
  monthUpper,
  monthName,
  ddmmyyyy,
  touchesStation,
  pendingDeficiencyTitles,
  loadCertExtra,
  type FootplateObs,
  type ObsShiftForm,
} from "./certificate";
import type { DailyLog, DeficiencyTask, Station, Staff } from "@/db/schema";

let n = 0;
function ok(cond: boolean, msg: string) {
  cond ? n++ : (() => { throw new Error(msg); })();
}

const st = (id: number, name: string): Station =>
  ({ id, name, code: "" } as unknown as Station);
const log = (over: Partial<DailyLog>): DailyLog =>
  ({
    id: 1,
    logDate: "2026-07-05",
    stationMovement: null,
    movementKind: null,
    workDone: null,
    extraStops: [],
    footplateJourneys: [],
    ...over,
  } as DailyLog);
const staff: Staff = {
  id: 1,
  name: "E MAHAMMAD ASLAM",
  designation: "JE/SIG/JMDG",
  railwayZone: "South Central Railway",
  railwayDivision: "GTL",
  headquartersStationId: 2,
} as unknown as Staff;
const extra = { addressedTo: "Sr DSTE/M/GTL", throughLine: "SSE/SIG/JMDG", sectionCode: "KLKA-YA" };

// ── date helpers ────────────────────────────────────────────────────────────
ok(monthUpper("2026-07") === "JULY 2026", "monthUpper");
ok(monthName("2026-07") === "JULY", "monthName");
ok(ddmmyyyy("2026-07-05") === "05-07-2026", "ddmmyyyy");

// ── certificate grouping ────────────────────────────────────────────────────
const stations = [st(1, "JMDG"), st(2, "PRDT"), st(3, "SUPP")];
const included = [
  log({ id: 11, logDate: "2026-07-09", stationMovement: "PRDT", inspectionKind: "monthly", inspectionStationId: 2, certHours: ">8 Hrs", certCondition: "Satisfactory" }),
  log({ id: 12, logDate: "2026-07-05", stationMovement: "JMDG", inspectionKind: "monthly", inspectionStationId: 1, certHours: ">16 Hrs", certCondition: "Satisfactory", certRepairsReq: "Details furnished below" }),
  log({ id: 13, logDate: "2026-07-16", stationMovement: "JMDG", inspectionKind: "monthly", inspectionStationId: 1, certHours: ">4 Hrs", certCondition: "Unsatisfactory" }),
];
const allMonth = [
  ...included,
  log({ id: 21, logDate: "2026-07-02", stationMovement: "JMDG", workDone: "Track bond wires replaced" }),
  log({ id: 22, logDate: "2026-07-03", movementKind: "rest", workDone: "rest day" }),
  log({ id: 23, logDate: "2026-07-14", stationMovement: "SUPP", workDone: "Meggering of main cables" }),
];

const model = buildCertificateModel({
  included,
  allMonthLogs: allMonth,
  stations,
  deficiencies: [],
  staff,
  extra,
  yearMonth: "2026-07",
});
ok(model.rows.length === 2, "two station rows (PRDT first, order of appearance)");
ok(model.rows[0].station === "PRDT" && model.rows[0].dates.length === 1, "PRDT single visit");
ok(model.rows[1].station === "JMDG" && model.rows[1].dates.map((d) => d.slice(8)).join(",") === "05,16", "JMDG two dates");
ok(model.rows[1].hours === ">16 Hrs", "strongest hours band wins");
ok(model.rows[1].condition === "Unsatisfactory", "any unsatisfactory wins");
ok(model.rows[1].gear === "All Signaling & Interlocking Equipment", "gear default");
ok(model.rows[0].repairsDone.length === 0, "PRDT has no repair items");
ok(model.rows[1].repairsDone.length === 1 && model.rows[1].repairsDone[0].text === "Track bond wires replaced", "repair item picked from non-inspection log");
ok(model.rows[0].repairsRequired === "", "repairs-required default");
ok(model.rows[1].repairsRequired === "Details furnished below", "repairs-required passthrough");
ok(model.station === "PRDT", "office station from HQ");
ok(model.railway === "South Central Railway" && model.division === "GTL", "railway/division from profile");
ok(model.addressedTo === "Sr DSTE/M/GTL" && model.throughLine === "SSE/SIG/JMDG", "extra lines passthrough");

// repairs-done excludes rest/leave and cross-station noise
ok(!model.rows.some((r) => r.repairsDone.some((i) => i.text === "rest day")), "rest-day log excluded");

// HTML includes the essentials
const html = certificateHtml(model);
ok(html.includes("INSPECTION AND TESTING CERTIFICATE"), "cert title");
ok(html.includes("MONTH OF &lsquo;JULY&rsquo; 2026"), "cert month line");
ok(html.includes("Form No. S&amp;T./IC.3.3") || html.includes("Form No."), "cert form no");
ok(html.includes("02-07-2026"), "cert dd-mm date");
ok(html.includes("1) Track bond wires replaced"), "cert numbered item");
ok(html.includes("Forwarded to Sr DSTE/M/GTL"), "cert fwd line");
ok(!html.includes("<div"), "cert html walker-flat (no wrapper divs)");
ok(html.includes("05,16\nJUL 2026"), "cert date cell is DD / MMM YYYY two-line");
ok(html.includes('h1 class="centered"') || html.includes('<h1 class="centered">'), "cert title centered");

// a pre-1.7.8.29 monthly log carries no hours band — prints a dash, not a blank
const legacy = buildCertificateModel({
  included: [log({ id: 14, logDate: "2026-07-20", stationMovement: "PRDT", inspectionKind: "monthly", inspectionStationId: 2 })],
  allMonthLogs: [],
  stations,
  deficiencies: [],
  staff,
  extra,
  yearMonth: "2026-07",
});
ok(legacy.rows.length === 1 && legacy.rows[0].hours === "", "legacy log without band");
ok(certificateHtml(legacy).includes("MONTHLY\n-"), "missing band prints dash under nature");

// ── footer from open deficiencies ──────────────────────────────────────────
const defs: DeficiencyTask[] = [
  { id: 1, department: "Signalling", stationId: 1, title: "IPS battery bank weak", status: "Pending", repeatCount: 3, completedAt: null },
  { id: 2, department: "Signalling", stationId: 1, title: "Closed item", status: "Completed", repeatCount: 0, completedAt: null },
  { id: 3, department: "Engg", stationId: 1, title: "Non-signal item", status: "Pending", repeatCount: 0, completedAt: null },
  { id: 4, department: "Signalling", stationId: 3, title: "Other station item", status: "Pending", repeatCount: 0, completedAt: null },
] as unknown as DeficiencyTask[];
const nameOf = (id: number | null) => stations.find((s) => s.id === id)?.name ?? "";
const footer = buildCertificateModel({
  included,
  allMonthLogs: allMonth,
  stations,
  deficiencies: defs,
  staff,
  extra,
  yearMonth: "2026-07",
}).repairsRequiredFooter;
ok(footer.length === 1 && footer[0] === "IPS battery bank weak (×3) — JMDG", "footer from open signalling deficiency at covered stations");

ok(
  pendingDeficiencyTitles(new Set(["JMDG"]), defs, nameOf).length === 1,
  "pendingDeficiencyTitles respects station filter"
);
ok(
  pendingDeficiencyTitles(new Set(), defs, nameOf).length === 2,
  "empty station filter keeps all open signalling items"
);

// ── touchesStation variants ────────────────────────────────────────────────
ok(touchesStation(log({ stationMovement: "JMDG" }), stations, "JMDG"), "touches via stationMovement");
ok(touchesStation(log({ inspectionStationId: 2 }), stations, "PRDT"), "touches via inspectionStationId");
ok(touchesStation(log({ extraStops: ["SUPP"] }), stations, "SUPP"), "touches via extra stop");
ok(!touchesStation(log({ extraStops: ["__footplate__"] }), stations, "JMDG"), "footplate sentinel ignored");

// ── footplate obs: defaults, normalization, prefill ────────────────────────
const sf = emptyShiftForm();
ok(sf.general["g_h"] === "AVAILABLE" && sf.running["r_h"] === "NO COMPLAINT", "checklist defaults seeded");
ok(matrixTickCount(sf) === 0, "fresh matrix empty");

const broken = { day: { ...emptyShiftForm(), general: undefined, matrix: [{ stationId: 1, stationName: "JMDG", lamps: { D: ["YY", "G"], H: ["G"], S: [], AD: [] }, visibility: "Good", led: "Very Good", interference: false }] }, night: null } as unknown as FootplateObs;
const norm = normalizeObs(broken);
ok(Boolean(norm.day && Object.keys(norm.day.general).length > 0), "normalize seeds missing answer maps");
ok(matrixTickCount(norm.day!) === 3, "ticks counted across slots");
ok(normalizeObs(null).day === null, "normalize(null) safe");
ok(normalizeObs(emptyFootplateObs()).night === null, "normalize(empty) safe");

const prevLogs = [log({ id: 50, logDate: "2026-06-11", inspectionKind: "footplate", footplateObs: broken })];
const last = latestFootplateObs(prevLogs);
ok(last === broken, "latest picks the log with obs");
ok(latestFootplateObs([log({}), log({})]) === null, "latest returns null without obs");
const clone = prefillFromLast(last!);
clone.day!.matrix[0].stationName = "RENAMED";
ok(last!.day!.matrix[0].stationName === "JMDG", "prefill deep-clones (no aliasing)");

// ── per-shift form specs ───────────────────────────────────────────────────
const trip = log({
  id: 60,
  logDate: "2026-07-25",
  inspectionKind: "footplate",
  footplateObs: {
    day: { ...emptyShiftForm(), trainLoad: "8 COACHES", observation: "Marker shiny", assistance: "" },
    night: null,
  },
  footplateJourneys: [
    {
      boardingStationId: 1,
      otherEndStationId: 2,
      shift: "Day",
      day: { direction: "Up", up: { trainNo: "77211", engineNo: "128257", lpName: "S.K.SINGH", alpName: "", tmrName: "J RAVI", remarks: "", depTime: "06:00", arrTime: "09:30" }, down: null },
      night: null,
    },
  ] as unknown as DailyLog["footplateJourneys"],
});
const specs = footplateFormSpecs(trip, staff, extra);
ok(specs.length === 1 && specs[0].shift === "DAY", "one spec for the day trip");
ok(specs[0].trainNo === "77211" && specs[0].lpName === "S.K.SINGH" && specs[0].guardName === "J RAVI", "ride details into header");
ok(specs[0].officialName === "E MAHAMMAD ASLAM" && specs[0].divisionSection === "GTL, KLKA-YA", "staff+section header");

const fh = footplateFormHtml(specs[0], staff.railwayZone ?? "", "2026-07", extra.addressedTo, extra.throughLine);
ok(fh.includes("FOOT PLATE INSPECTION OF SIGNALS"), "fp title");
ok(fh.includes('class="cols" data-cols="0,600"'), "para + annexure share one line");
ok(fh.includes('<p class="rule"></p>'), "rule under heading block");
ok(fh.includes("77211, 8 COACHES"), "fp train+load");
ok(fh.includes("(RECORD OF OBSERVATION)"), "fp subtitle");
ok(fh.includes("DAY"), "fp shift");
ok(fh.includes("Marker shiny"), "fp observation text");
ok(fh.includes("AVAILABLE"), "fp default answers survive");
ok(!fh.includes("&amp;#" ), "no stray entities");
ok(!fh.replace('<div class="page-break"></div>', "").includes("<div"), "fp html walker-flat (only the page-break div)");

// checklist sections print as the sample's two-column grid: (a) faces (m)
ok(fh.includes("(a) Date"), "fp general (a) present");
ok(fh.includes("(m) Weather"), "fp general (m) present");
ok(fh.includes("(l) Mobile phone switched off during running"), "fp general (l) present");
ok(fh.includes("(h) Signals out of use"), "fp signalling (h) present");
ok(fh.includes("(n) Loco pilot feedback"), "fp signalling (n) present");
const chkRows = fh.match(/<tr><td>/g)?.length ?? 0;
ok(chkRows >= 12 + 7 + 4, "two-column items keep row counts");

// matrix auto-seeds from the full station register when the sheet has none
const seeded = footplateFormSpecs(trip, staff, extra, [
  { id: 1, name: "KLKA" }, { id: 2, name: "YA" }, { id: 3, name: "JMDG" },
]);
ok(seeded[0].form.matrix.length === 3, "empty matrix seeded with all section stations");
ok(seeded[0].form.matrix[0].stationName === "KLKA" && seeded[0].form.matrix[2].stationName === "JMDG", "seed rows in register order");
const sh = footplateFormHtml(seeded[0], staff.railwayZone ?? "", "2026-07", extra.addressedTo, extra.throughLine);
// visibility grid mirrors the sample: bold merged stubs, option rows, √ ticks
ok(sh.includes(">Station wise signal visibility Details<"), "grid heading matches sample casing");
ok(sh.includes('<td rowspan="4"><strong>Signal Lamp</strong></td>'), "lamp stub group bold, real merged cell");
ok(sh.includes('<td rowspan="4"><strong>Visibility</strong></td>'), "visibility stub group bold");
ok(sh.includes('<td rowspan="4"><strong>LED brightness</strong></td>'), "led stub group bold");
ok(!sh.includes('class="vtext"'), "no rotated stubs (letter overlap fixed)");
ok(sh.includes("Reason (Code)"), "reason row present");
ok(sh.includes("<td data-font=\"rupee\" data-align=\"center\">\u221A</td>"), "ticked cells routed through TTF font");
ok(!sh.includes("•"), "old bullet rows gone");
ok(sh.includes(">KLKA<") && sh.includes(">YA<"), "seeded stations print as banks");

// via stations: printed in added order, grades/interference left blank
const ordered = footplateFormSpecs(trip, staff, extra, []);
const viaForm: ObsShiftForm = {
  ...specs[0].form,
  matrix: [
    { stationId: 2, stationName: "ZZB", lamps: { D: ["YY"] }, visibility: "", led: "", interference: false, via: true },
    { stationId: 1, stationName: "AAB", lamps: {}, visibility: "Good", led: "Very Good", interference: true },
  ],
};
const oh = footplateFormHtml({ ...specs[0], form: viaForm }, "", "2026-07", "", "");
ok(oh.indexOf(">ZZB<") < oh.indexOf(">AAB<"), "grid order = added order, left to right");
ok(oh.includes('data-align="center"></td>'), "via station leaves interference cell blank");
ok(oh.includes(">AAB<") , "regular station intact beside via");
// any number of stations prints as ONE continuous grid table
const many = Array.from({ length: 12 }, (_, i) => ({
  stationId: i + 100, stationName: `ST${i}`, lamps: { D: ["YY"] } as never,
  visibility: "Adequate", led: "Excellent", interference: true,
}));
const bankedHtml = footplateFormHtml(
  { ...specs[0], form: { ...specs[0].form, matrix: many } },
  "", "2026-07", "", ""
);
ok((bankedHtml.match(/matrix-table/g) ?? []).length === 1, "all stations in one continuous grid table");
ok(!bankedHtml.includes("(contd.)"), "no bank continuation headings");
ok((bankedHtml.match(/\u221A/g) ?? []).length > 40, "grid carries ticks for every station");

// a night-only-answered log with no night train still prints the sheet
const nightTrip = log({
  id: 61,
  logDate: "2026-07-26",
  inspectionKind: "footplate",
  footplateObs: {
    day: null,
    night: { ...emptyShiftForm(), observation: "Night vis poor near curve" },
  },
});
const ns = footplateFormSpecs(nightTrip, staff, extra);
ok(ns.length === 1 && ns[0].shift === "NIGHT" && ns[0].trainNo === "", "content-only shift kept, no train");
// day shift of same log has no train and no answers — the fallback still
// prints one default DAY sheet so exporting never yields a blank page
const ds = footplateFormSpecs({ ...nightTrip, footplateObs: { day: emptyShiftForm(), night: null } } as DailyLog, staff, extra);
ok(ds.length === 1 && ds[0].shift === "DAY" && matrixTickCount(ds[0].form) === 0, "untouched selection prints default DAY sheet");

// ── certMeta storage round-trip (guarded localStorage absence) ─────────────
try {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => JSON.stringify({ addressedTo: "X" }),
    setItem: () => {},
  } as unknown as Storage;
  ok(loadCertExtra().addressedTo === "X", "cert extra parses stored blob");
  ok(loadCertExtra().sectionCode === "", "cert extra merges defaults");
} finally {
  delete (globalThis as { localStorage?: unknown }).localStorage;
}
ok(loadCertExtra().addressedTo === "", "cert extra tolerates missing localStorage");

console.log(`certificate.check: ${n} assertions passed`);

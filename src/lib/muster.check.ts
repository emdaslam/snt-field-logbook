import assert from "node:assert/strict";
import {
  musterPeriodOf,
  musterMonthLabel,
  musterMonthCode,
  musterDayCode,
  musterDayStation,
  musterCodes,
  buildMusterGrid,
  musterSheetTopGap,
  MUSTER_COLS,
  MUSTER_ROW_MIN,
  MUSTER_CODE_ROW_MIN,
  MUSTER_STATION_ROW_MIN,
} from "./muster";
import type { DailyLog, Station } from "@/db/schema";

const log = (over: Partial<DailyLog>): DailyLog =>
  ({
    id: 1,
    logDate: "2026-07-11",
    taPercent: 100,
    journeyLegs: [],
    stationIds: [],
    ...over,
  }) as unknown as DailyLog;

const hq = { id: 1, name: "JMDG", code: "JMDG", distanceFromHq: "below8" } as unknown as Station;
const gadwal = {
  id: 2,
  name: "GADWAL",
  code: "GWL",
  distanceFromHq: "above8",
} as unknown as Station;
const nearby = {
  id: 3,
  name: "HALF8KM",
  code: "N8",
  distanceFromHq: "below8",
} as unknown as Station;
const stations = [hq, gadwal, nearby];

/* ---------- period ---------- */
const p = musterPeriodOf("2026-07-01");
assert.deepEqual(p, { from: "2026-07-11", to: "2026-08-10", label: "July 2026" });
assert.equal(musterMonthLabel("2026-07-11"), "JULY'2026");
assert.equal(musterMonthLabel("2026-08-01"), "AUGUST'2026");

/* ---------- day codes ---------- */
assert.equal(musterDayCode([], stations, hq), "");
assert.equal(musterDayStation([], stations), "");
// TA-claimed movement day → OL
assert.equal(
  musterDayCode([log({ stationMovement: "GADWAL", movementKind: null })], stations, hq),
  "OL"
);
assert.equal(
  musterDayStation([log({ stationMovement: "GADWAL", movementKind: null })], stations),
  "GWL"
);
// footplate → always TA → OL
assert.equal(
  musterDayCode([log({ movementKind: "footplate", stationMovement: "Footplate" })], stations, hq),
  "OL"
);
assert.equal(
  musterDayStation([log({ movementKind: "footplate", stationMovement: "Footplate" })], stations),
  "FP"
);
assert.equal(
  musterDayStation(
    [log({ movementKind: "footplate", stationMovement: "Footplate: GTL → AD" })],
    stations
  ),
  "FP"
);
// HQ / within-8 km movement day → P
assert.equal(
  musterDayCode([log({ stationMovement: "JMDG", movementKind: null })], stations, hq),
  "P"
);
assert.equal(
  musterDayStation([log({ stationMovement: "JMDG", movementKind: null })], stations),
  "JMDG"
);
assert.equal(
  musterDayCode([log({ stationMovement: "HALF8KM", movementKind: null })], stations, hq),
  "P"
);
assert.equal(
  musterDayStation([log({ stationMovement: "HALF8KM", movementKind: null })], stations),
  "N8"
);
assert.equal(
  musterDayStation([log({ stationMovement: "KM 15 Cabin", movementKind: null })], stations),
  "KM 15 Cabin"
);
// special days
assert.equal(musterDayCode([log({ movementKind: "rest" })], stations, hq), "REST");
assert.equal(musterDayStation([log({ movementKind: "rest" })], stations), "");
assert.equal(musterDayCode([log({ movementKind: "nh" })], stations, hq), "NH");
assert.equal(musterDayCode([log({ movementKind: "cr", crFrom: "2026-07-04" })], stations, hq), "CR");
assert.equal(
  musterDayCode([log({ movementKind: "leave", leaveKind: "LAP" })], stations, hq),
  "PL"
);
assert.equal(
  musterDayCode([log({ movementKind: "leave", leaveKind: "CL" })], stations, hq),
  "CL"
);
assert.equal(
  musterDayCode([log({ movementKind: "leave", leaveKind: "SICK" })], stations, hq),
  "SICK"
);
// a TA movement outranks a special entry on the same day
assert.equal(
  musterDayCode(
    [log({ movementKind: "rest" }), log({ stationMovement: "GADWAL", movementKind: null })],
    stations,
    hq
  ),
  "OL"
);

/* ---------- codes over a period ---------- */
const codes = musterCodes(
  p,
  [
    log({ id: 1, logDate: "2026-07-11", stationMovement: "GADWAL", movementKind: null }),
    log({ id: 2, logDate: "2026-07-17", movementKind: "rest" }),
    log({ id: 3, logDate: "2026-07-01", stationMovement: "GADWAL", movementKind: null }), // outside
  ],
  stations,
  hq
);
assert.equal(codes.size, 2);
assert.equal(codes.get("2026-07-11"), "OL");
assert.equal(codes.get("2026-07-17"), "REST");

/* ---------- grid ---------- */
const { grid, merges } = buildMusterGrid(
  p,
  [
    log({ id: 1, logDate: "2026-07-11", stationMovement: "GADWAL", movementKind: null }),
    log({ id: 2, logDate: "2026-07-12", stationMovement: "JMDG", movementKind: null }),
    log({ id: 3, logDate: "2026-07-17", movementKind: "rest" }),
  ],
  stations,
  hq,
  {
    railway: "SOUTH COAST RAILWAY",
    office: "SSE/SIG/O/JMDG",
    pfNo: "24529804450",
    name: "SRI E.MD.ASLAM",
    designation: "JE/SIG/JMDG",
  }
);

// six rows, each exactly the fixed column count
assert.equal(grid.length, 6);
for (const row of grid) assert.equal(row.length, MUSTER_COLS);
assert.equal(MUSTER_COLS, 33);

const cellText = (c: unknown) => (typeof c === "object" && c ? (c as { v: unknown }).v : c);

const withStn = buildMusterGrid(
  p,
  [
    log({ id: 1, logDate: "2026-07-11", stationMovement: "GADWAL", movementKind: null }),
    log({ id: 2, logDate: "2026-07-12", stationMovement: "JMDG", movementKind: null }),
    log({ id: 3, logDate: "2026-07-17", movementKind: "rest" }),
  ],
  stations,
  hq,
  {
    railway: "SOUTH COAST RAILWAY",
    office: "SSE/SIG/O/JMDG",
    pfNo: "24529804450",
    name: "SRI E.MD.ASLAM",
    designation: "JE/SIG/JMDG",
  },
  true
);
assert.equal(withStn.grid.length, 7);
for (const row of withStn.grid) assert.equal(row.length, MUSTER_COLS);
assert.equal(cellText(withStn.grid[6][0]), "GWL");
assert.equal(cellText(withStn.grid[6][1]), "JMDG");
assert.equal(cellText(withStn.grid[6][6]), "");
assert.equal((withStn.grid[6][0] as { stacked?: boolean }).stacked, true);
assert.equal((withStn.grid[6][6] as { stacked?: boolean }).stacked, undefined);

// header rows
assert.equal(cellText(grid[0][0]), "SOUTH COAST RAILWAY");
assert.equal(String(cellText(grid[1][0])).startsWith("OFFICE : SSE/SIG/O/JMDG"), true);
assert.equal(String(cellText(grid[2][0])), "MONTH: FROM 11TH JULY'2026 TO 10TH AUGUST'2026");
assert.equal(String(cellText(grid[3][0])), "MONTH : JULY'2026");
assert.equal(cellText(grid[3][21]), "MONTH: AUGUST'2026");
assert.equal(cellText(grid[3][31]), "AMC NO");
assert.equal(cellText(grid[3][32]), "DMC NO");

// export sizing contract: day columns pinned 19pt, the AMC / DMC columns 26pt
// (their header word wraps to "AMC" / "NO" like the office sample); all 33
// pinned widths are scaled to the printable width downstream, which keeps
// "AMC" (≈29.5pt with padding) on one line of its stretched ≈32pt column
const widthFor = (c: number) => (c >= MUSTER_COLS - 2 ? 26 : 19);
assert.equal(widthFor(30), 19);
assert.equal(widthFor(31), 26);
assert.equal(widthFor(32), 26);
const pinnedSum = Array.from({ length: MUSTER_COLS }, (_, i) => widthFor(i)).reduce((a, b) => a + b, 0);
assert.equal(pinnedSum, 31 * 19 + 2 * 26);
assert.equal(26.5 + 3 <= (26 * 793.9) / pinnedSum, true); // "AMC" fits its stretched column

// printed-sheet vertical contract (PDF): the block — sheet plus signature
// line — sits vertically centred on the A4-landscape page (equal blank above
// and below), the code row is the office sample's tall band (tall enough for
// four stacked letters), and the whole centred block still fits one page at
// fitStart 14 (margins 24), so the fit loop never shrinks the font.
const lineH14 = ((8 * 14) / 9) * 1.15; // body line height at content size 14
const rowH = (lines: number, min: number) => Math.max(lines * lineH14 + 3, min); // + 2×1.5 pad
assert.equal(MUSTER_ROW_MIN > lineH14 + 3, true); // single-line rows grow past their text
assert.equal(MUSTER_CODE_ROW_MIN >= 4 * lineH14, true); // 4 stacked letters fit
assert.equal(MUSTER_STATION_ROW_MIN >= 6 * lineH14, true); // ~6 stacked station letters fit
const tableH =
  rowH(1, MUSTER_ROW_MIN) * 4 + // railway, office/pf, from–to, day numbers
  rowH(2, MUSTER_ROW_MIN) + // month labels + AMC/DMC ("AMC NO" wraps to 2 lines)
  rowH(4, MUSTER_CODE_ROW_MIN); // stacked attendance codes
const sigH = 30 + 12 * (14 / 9) + 8; // signature block (gap + bold line + trailing space)
const gap = musterSheetTopGap();
assert.equal(gap > 0, true);
assert.equal(24 + gap + tableH + sigH <= 595.28 - 24, true); // one page
// centred: blank above (margin + gap) equals blank below within half a point
assert.equal(Math.abs(24 + gap - (595.28 - (24 + gap + tableH + sigH))) < 0.5, true);
const tableHStn = tableH + rowH(6, MUSTER_STATION_ROW_MIN);
const gapStn = musterSheetTopGap(true);
assert.equal(gapStn > 0, true);
assert.equal(24 + gapStn + tableHStn + sigH <= 595.28 - 24, true);
assert.equal(Math.abs(24 + gapStn - (595.28 - (24 + gapStn + tableHStn + sigH))) < 0.5, true);

// month code + file-name stem contract: JE/SIG/JMDG, 11 Sep – 10 Oct →
// JE_SIG_JMDG_SEP_OCT (the stem replaces every non-alphanumeric run with _)
assert.equal(musterMonthCode("2026-09-11"), "SEP");
assert.equal(musterMonthCode("2026-10-10"), "OCT");
const desigStem = "JE/SIG/JMDG".replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
assert.equal(`${desigStem}_${musterMonthCode("2026-09-11")}_${musterMonthCode("2026-10-10")}`, "JE_SIG_JMDG_SEP_OCT");

// day numbers 11..31 then 1..10, codes aligned beneath
assert.equal(cellText(grid[4][0]), "11");
assert.equal(cellText(grid[4][20]), "31");
assert.equal(cellText(grid[4][21]), "1");
assert.equal(cellText(grid[4][30]), "10");
assert.equal(cellText(grid[5][0]), "OL"); // 11 July = GADWAL TA day
assert.equal(cellText(grid[5][1]), "P"); // 12 July = HQ day
assert.equal(cellText(grid[5][6]), "REST"); // 17 July
assert.equal(cellText(grid[5][31]), "---");
assert.equal(cellText(grid[5][32]), "---");

// code cells render vertically (stacked); absence codes print red, P / OL
// and the AMC / DMC placeholders stay black
const codeCellOf = (i: number) => grid[5][i] as { v: string; stacked?: boolean; color?: string };
assert.equal(codeCellOf(0).stacked, true);
assert.equal(codeCellOf(0).color, undefined);
assert.equal(codeCellOf(1).stacked, true);
assert.equal(codeCellOf(1).color, undefined);
assert.equal(codeCellOf(6).stacked, true);
assert.equal(codeCellOf(6).color, "FF0000");
assert.equal(codeCellOf(31).stacked, undefined);
assert.equal(codeCellOf(31).color, undefined);

// merges: full-width rows 0/2, header blocks, month halves
assert.deepEqual(merges[0], [0, 0, 0, 32]);
// header-field spans sized so each field holds its line at the fitted font
assert.deepEqual(merges[1], [1, 0, 1, 6]);
assert.deepEqual(merges[2], [1, 7, 1, 12]);
assert.deepEqual(merges[3], [1, 13, 1, 24]);
assert.deepEqual(merges[4], [1, 25, 1, 32]);
assert.ok(merges.some((m) => m[0] === 3 && m[1] === 0 && m[2] === 3 && m[3] === 20));
assert.ok(merges.some((m) => m[0] === 3 && m[1] === 21 && m[2] === 3 && m[3] === 30));

// February pads the short left half with blank columns
const feb = musterPeriodOf("2026-02-01");
const febGrid = buildMusterGrid(feb, [], stations, hq, {
  railway: "X",
  office: "Y",
  pfNo: "",
  name: "",
  designation: "",
}).grid;
assert.equal(cellText(febGrid[4][0]), "11");
assert.equal(cellText(febGrid[4][17]), "28");
assert.equal(cellText(febGrid[4][18]), ""); // 29th+ padded blank (2026 not a leap year)
assert.equal(cellText(febGrid[4][20]), "");
assert.equal(cellText(febGrid[4][21]), "1");

console.log("muster check ok");

/* Headless repro of the footplate PDF — renders via buildPdf to /tmp/opencode. */
import { writeFileSync } from "node:fs";

const jsdomMod = (await import("/usr/local/lib/node_modules/jsdom/lib/api.js")) as unknown as {
  JSDOM: new (s: string) => { window: Window & typeof globalThis };
};
const win = new jsdomMod.JSDOM("<!doctype html><html><body></body></html>").window;
(globalThis as unknown as Record<string, unknown>).DOMParser = win.DOMParser;
(globalThis as unknown as Record<string, unknown>).Node = win.Node;
for (const k of ["Element", "HTMLElement", "NodeList"]) {
  (globalThis as unknown as Record<string, unknown>)[k] = (win as unknown as Record<string, unknown>)[k];
}

const { footplateFormSpecs, footplateFormHtml, emptyShiftForm } = await import("/workspace/src/lib/certificate.ts");
const { buildPdf } = await import("/workspace/src/lib/pdf.ts");

const stations = ["JMDG", "PRDT", "SUPP", "NOSM", "SJMA"].map((name, i) => ({ id: i + 1, name }));
const staff = {
  id: 1, name: "E MAHAMMAD ASLAM", designation: "JE/SIG/JMDG",
  railwayZone: "South Central Railway", railwayDivision: "GTL", headquartersStationId: 1,
};
const extra = { addressedTo: "Sr DSTE/M/GTL", throughLine: "SSE/SIG/JMDG", sectionCode: "KLKA-YA" };

const trip = {
  id: 60,
  logDate: "2026-07-25",
  inspectionKind: "footplate",
  stationMovement: null,
  extraStops: [],
  footplateJourneys: [
    {
      boardingStationId: 1, otherEndStationId: 2, shift: "Day",
      day: { direction: "Up", up: { trainNo: "77211", engineNo: "157040", lpName: "G.PRAVEEN", alpName: "", tmrName: "P RAJESH", remarks: "", depTime: "06:00", arrTime: "09:30" }, down: null },
      night: null,
    },
  ],
  footplateObs: {
    day: {
      ...emptyShiftForm(),
      trainLoad: "8 COACHES",
      matrix: stations.map((s) => ({
        stationId: s.id, stationName: s.name,
        lamps: { D: ["YY"], H: ["Y", "G"], S: ["Y"], AD: [] },
        visibility: "Good", led: "Very Good", interference: false,
      })),
      observation: "Marker shiny",
      assistance: "",
    },
    night: null,
  },
};

const specs = footplateFormSpecs(trip as never, staff as never, extra as never, stations);
const body = specs
  .map((s: Parameters<typeof footplateFormHtml>[0]) => footplateFormHtml(s, "South Central Railway", "2026-07", extra.addressedTo, extra.throughLine))
  .join('<div class="page-break"></div>');

const doc = buildPdf("Foot Plate Observation JUL 2026", body, 10, { orientation: "landscape", style: "plain" });
writeFileSync("/tmp/opencode/fp-current.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("written /tmp/opencode/fp-current.pdf");

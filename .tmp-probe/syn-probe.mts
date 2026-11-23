/* Replicates certificate.check.ts's synthetic seg fixture to debug the new run-bander. */
import { parsePcdoSegments, pcdoLastEvents, type PcdoSeg } from "/workspace/src/lib/pcdo-pdf";
const seg = (x: number, y: number, str: string): PcdoSeg => ({ x, y, w: Math.min(540 - x, 12 + str.length * 4.6), h: 10, str });
const pages: PcdoSeg[][] = [[
  seg(20, 800, "HIGHLIGHTS FOR THE MONTH OF APRIL – 2026"),
  seg(12, 795, "STATION"),
  seg(170, 795, "HIGH LIGHTS FOR THE MONTH"),
  seg(10, 790, "1 SUPP"),
  seg(60, 790, "1. 60 Nos of 80 AH track circuit batteries replaced since due on 31-03-2026"),
  seg(60, 786, "(Total for 20 track circuits)"),
]];
void pages;
// real fixture from the check (signalling/engineering portion, rebuilt)
const fixture: PcdoSeg[][] = [[
  seg(100, 380, "1. SIGNALLING WORKS RELATED TO MAINTENANCE WORKS APRIL – 2026"),
  seg(10, 376, " STATION"),
  seg(170, 376, "ACTIVITY"),
  seg(60, 372, "1. S-4 HG aspect LED replacement done on 28-03-2026"),
  seg(12, 368, "MADU"),
  seg(60, 368, "2. NDL end track feed battery charger PFC contact checking work done on 29-03-2026"),
  seg(60, 364, "3. MADU-BGNP BPAC 1 communication checking work with tele staff on 28-03-3036"),
  seg(60, 360, "1. BGNP tie-above item bridge test on 01-04-2026"),
  seg(12, 356, "BGNP"),
  seg(60, 352, "2. BGNP tie-below item bridge test on 02-04-2026"),
  seg(12, 348, "PNM IB"),
  seg(60, 348, "----------------------------"),
  seg(60, 345, "4. S-4 HG aspect LED replacement done on 28-03-2026"),
  seg(100, 342, "2.Engineering Works:"),
  seg(170, 338, " ACTIVITY"),
  seg(10, 334, " STATION"),
  seg(10, 330, "MADU"),
  seg(48, 330, "1. 18A,19A Point manual packing done and tested on 26-03-2026"),
  seg(48, 326, "2. 13A.7A points manual packing done and tested on 13-04-2026."),
  seg(10, 322, "PGL"),
  seg(48, 322, "1. clutch spring TGN-24 replaced on 05-04-2026"),
  seg(10, 318, "3.DIRECTED MAINTENANCE : 1. One No of defective cell replaced in IPS bank at KLKA on 20-04-2026"),
]];
const res = parsePcdoSegments(fixture);
for (const e of [...pcdoLastEvents].reverse()) console.log("EV", e.kind, String(e.y).padStart(5), e.kind === "tok" ? `TOKEN ${e.label}` : (e.label ?? "?").padEnd(8), (e.text ?? "").slice(0, 42));
void pcdoLastEvents;
for (const s of res.stations) console.log(JSON.stringify(s.label).padEnd(12), s.items.length, "|", s.items.map((i) => i.text.slice(0, 34)).join(" ## "));
console.log("unattributed:", res.unattributed.map((i) => i.text.slice(0, 40)));

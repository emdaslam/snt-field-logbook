import { readFileSync } from "node:fs";
import { extractPcdoWorks, matchPcdoToStations } from "/workspace/src/lib/pcdo-pdf";
const stations = [
  { id: 1, name: "YERRAGUNTLA", code: "YA" },
  { id: 2, name: "SANJAMALA", code: "SJMA" },
  { id: 3, name: "JAMMALAMADUGU", code: "JMDG" },
  { id: 4, name: "PRODDATUR", code: "PRDT" },
  { id: 5, name: "NOSSAM", code: "NOSM" },
  { id: 6, name: "S.UPPALAPADU", code: "SUPP" },
];
for (const f of ["JMDG PCDO SEPT-26"]) {
  const bytes = new Uint8Array(readFileSync(`/workspace/Pdf samples/${f}.pdf`));
  const res = await extractPcdoWorks(bytes);
  console.log(f, "| stations:", res.stations.length);
  for (const s of res.stations)
    console.log("  ", JSON.stringify(s.label).padEnd(24), String(s.items.length).padStart(2), "|", s.items.map((i) => i.text.slice(0, 38)).join(" ## "));
  const mm = matchPcdoToStations(res, stations as never);
  console.log("matched:", [...mm.matched.entries()].map(([k, v]) => `${k}:${v.length}`).join(" "), "| unmatched:", mm.unmatched.join(" / ") || "-");
}

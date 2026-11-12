import assert from "node:assert/strict";
import { legStationOptions, tempStationSuggestions } from "./api";

// --- tempStationSuggestions: Google-style shortlist of past temp stations ---

const history = ["KM 15 Cabin", "BZA Cabin", "Km 40 Gate", "Yerraguntla Cabin"];

// Typing filters case-insensitively; exact match is hidden (it IS the value).
assert.deepEqual(tempStationSuggestions(history, "km"), ["KM 15 Cabin", "Km 40 Gate"]);
assert.deepEqual(tempStationSuggestions(history, "KM 15 Cabin"), []);

// Empty typed text offers the history, capped at 6.
assert.deepEqual(tempStationSuggestions(history, ""), history);
assert.equal(tempStationSuggestions([...history, "a", "b", "c"], "").length, 6);

// Whitespace-only typed text behaves like empty; non-matches drop out.
assert.deepEqual(tempStationSuggestions(history, "   "), history);
assert.deepEqual(tempStationSuggestions(history, "zzz"), []);

// --- legStationOptions: saved stations + this log's temp stations ---

const stations = [
  { id: 1, name: "Jammalamadugu", code: "JMDG" },
  { id: 2, name: "Proddatur", code: null },
];

// Saved stations come first with their codes; chain temps are appended. A
// chain value that is a saved station's CODE ("JMDG") is not a temp station.
const opts = legStationOptions(stations, ["JMDG", "KM 15 Cabin", "  ", "BZA Cabin"]);
assert.deepEqual(opts, [
  { id: 1, name: "Jammalamadugu", code: "JMDG" },
  { id: 2, name: "Proddatur", code: "" },
  { name: "KM 15 Cabin", code: "" },
  { name: "BZA Cabin", code: "" },
]);

// Sentinels / empties are the caller's business; duplicates and saved names
// are not repeated.
assert.deepEqual(
  legStationOptions(stations, ["Proddatur", "Proddatur"]).length,
  2
);

console.log("tempSuggestions check ok");

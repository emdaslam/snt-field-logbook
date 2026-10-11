import assert from "node:assert/strict";

/**
 * Search's station filter lists the one-off station names typed on logs
 * ("Temporary station…"). tempStationNames must surface exactly those —
 * saved stations (by name or code) and Rest / Leave / CR / NH / Footplate
 * entries never appear, and repeated names are deduped + sorted.
 */
import { tempStationNames } from "./api";

const stations = [
  { id: 1, name: "Jammalamadugu", code: "JMDG" },
  { id: 2, name: "Proddatur", code: null },
];

const logs = [
  // Saved stations (by name or code) are never temporary
  { stationMovement: "JMDG", extraStops: ["Proddatur"], movementKind: "station", journeyLegs: null },
  // One-off typed names survive as entered, deduped across logs
  { stationMovement: "KM 15 Cabin", extraStops: ["BZA Cabin"], movementKind: "station", journeyLegs: null },
  { stationMovement: "KM 15 Cabin", extraStops: null, movementKind: "station", journeyLegs: null },
  // Rest / Leave / CR / NH / Footplate logs contribute nothing
  { stationMovement: "Leave (CL)", extraStops: null, movementKind: "leave", journeyLegs: null },
  { stationMovement: "Footplate: JMDG → BZA", extraStops: null, movementKind: "footplate", journeyLegs: null },
];

assert.deepEqual(tempStationNames(logs, stations), ["BZA Cabin", "KM 15 Cabin"]);
console.log("tempStations.check OK");

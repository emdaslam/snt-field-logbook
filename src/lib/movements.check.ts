import assert from "node:assert/strict";
import {
  FOOTPLATE_SLOT,
  footplateDotColor,
  isFootplateLabel,
  isFootplateLog,
  isQuarterlyFootplate,
  logMovementLabels,
  monthlyInspectionColor,
  movementLabel,
  quarterlyInspectionColor,
} from "./movements";

assert.equal(movementLabel(FOOTPLATE_SLOT), "Footplate");
assert.equal(movementLabel("__temp__"), null);
assert.equal(movementLabel("  Guntakal  "), "Guntakal");

assert.deepEqual(
  logMovementLabels({
    stationMovement: "Guntakal",
    extraStops: [FOOTPLATE_SLOT, "Adoni"],
  }),
  ["Guntakal", "Footplate", "Adoni"]
);
assert.deepEqual(
  logMovementLabels({
    stationMovement: "Footplate: GTL → AD",
    extraStops: ["Adoni"],
  }),
  ["Footplate: GTL → AD", "Adoni"]
);
assert.deepEqual(logMovementLabels({ stationMovement: "Rest", extraStops: [] }), ["Rest"]);

assert.equal(isFootplateLabel("Footplate"), true);
assert.equal(isFootplateLabel("Footplate: GTL → AD"), true);
assert.equal(isFootplateLabel("Guntakal"), false);

assert.equal(isFootplateLog({ movementKind: "footplate", stationMovement: "Guntakal" }), true);
assert.equal(isFootplateLog({ extraStops: [FOOTPLATE_SLOT] }), true);
assert.equal(isFootplateLog({ stationMovement: "Footplate: A → B" }), true);
assert.equal(isFootplateLog({ stationMovement: "Guntakal", extraStops: ["Adoni"] }), false);

const tags = [
  { name: "monthly inspection", color: "#112233" },
  { name: "Quarterly Inspection", color: "#abcdef" },
  { name: "failures", color: "#dc2626" },
];
assert.equal(monthlyInspectionColor(tags), "#112233");
assert.equal(quarterlyInspectionColor(tags), "#abcdef");
assert.equal(monthlyInspectionColor([{ name: "failures", color: "#dc2626" }]), "#2563eb");
assert.equal(quarterlyInspectionColor([{ name: "failures", color: "#dc2626" }]), "#0e7490");

assert.equal(isQuarterlyFootplate({ inspectionPeriodicity: "quarterly" }), true);
assert.equal(isQuarterlyFootplate({ inspectionPeriodicity: "monthly" }), false);
assert.equal(isQuarterlyFootplate({}), false);

assert.equal(footplateDotColor({ inspectionPeriodicity: "monthly" }, tags), "#112233");
assert.equal(footplateDotColor({ inspectionPeriodicity: "quarterly" }, tags), "#abcdef");
assert.equal(footplateDotColor({}, tags), "#112233");

console.log("movements check ok");

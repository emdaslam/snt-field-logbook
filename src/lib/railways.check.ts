import assert from "node:assert/strict";
import {
  DEFAULT_RAILWAY_ZONE,
  DEFAULT_RAILWAY_DIVISION,
  RAILWAY_ZONES,
  divisionsOf,
  railwayHeading,
  resolvedRailway,
  defaultDivisionFor,
  railwayLabel,
} from "./railways";

assert.equal(railwayHeading(null, null), "SOUTH COAST RAILWAY. GUNTAKAL DIVISION");
assert.equal(railwayHeading("", ""), "SOUTH COAST RAILWAY. GUNTAKAL DIVISION");
assert.equal(railwayHeading(undefined, undefined), "SOUTH COAST RAILWAY. GUNTAKAL DIVISION");
assert.equal(
  railwayHeading("South Coast Railway", "Guntakal"),
  "SOUTH COAST RAILWAY. GUNTAKAL DIVISION"
);
assert.equal(railwayHeading("South Coast Railway", "Chennai"), "SOUTH COAST RAILWAY. GUNTAKAL DIVISION");
assert.equal(railwayHeading("Southern Railway", "Chennai"), "SOUTHERN RAILWAY. CHENNAI DIVISION");
assert.equal(railwayHeading("Metro Railway, Kolkata", ""), "METRO RAILWAY, KOLKATA");
assert.equal(railwayHeading("Metro Railway, Kolkata", "Guntakal"), "METRO RAILWAY, KOLKATA");

assert.deepEqual(resolvedRailway(null, null), {
  zone: DEFAULT_RAILWAY_ZONE,
  division: DEFAULT_RAILWAY_DIVISION,
});
assert.deepEqual(resolvedRailway("South Coast Railway", "Visakhapatnam"), {
  zone: "South Coast Railway",
  division: "Visakhapatnam",
});
assert.deepEqual(resolvedRailway("Metro Railway, Kolkata", "Guntakal"), {
  zone: "Metro Railway, Kolkata",
  division: "",
});
assert.deepEqual(resolvedRailway("Metro Railway, Kolkata", ""), {
  zone: "Metro Railway, Kolkata",
  division: "",
});
assert.equal(railwayLabel(null, null), "South Coast Railway · Guntakal Division");
assert.equal(railwayLabel("Metro Railway, Kolkata", ""), "Metro Railway, Kolkata");

assert.ok(divisionsOf("South Coast Railway").includes("Guntakal"));
assert.equal(divisionsOf("Metro Railway, Kolkata").length, 0);
assert.equal(defaultDivisionFor("South Coast Railway"), "Guntakal");
assert.equal(defaultDivisionFor("Southern Railway"), "Chennai");
assert.equal(RAILWAY_ZONES.length, 18);

console.log("railways check ok");

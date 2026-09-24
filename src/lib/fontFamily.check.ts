import assert from "node:assert/strict";
import { FONT_FAMILIES, FONT_FAMILY_CSS, FONT_FAMILY_LABEL, isAppFontFamily } from "./types";

assert.equal(isAppFontFamily("delius"), true);
assert.equal(isAppFontFamily("patrick-hand"), true);
assert.equal(isAppFontFamily("system"), true);
assert.equal(isAppFontFamily("comic-sans"), false);
assert.equal(isAppFontFamily(""), false);
assert.equal(isAppFontFamily(null), false);

for (const id of FONT_FAMILIES) {
  assert.ok(FONT_FAMILY_LABEL[id]);
  assert.ok(FONT_FAMILY_CSS[id]);
}
assert.ok(FONT_FAMILIES.includes("delius"));
assert.ok(FONT_FAMILIES.includes("patrick-hand"));

console.log("fontFamily check ok");

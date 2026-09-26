import assert from "node:assert/strict";
import { THEMES, THEME_LABEL, isAppTheme } from "./types";

assert.equal(isAppTheme("light"), true);
assert.equal(isAppTheme("forest"), true);
assert.equal(isAppTheme("midnight"), true);
assert.equal(isAppTheme("rose"), true);
assert.equal(isAppTheme("neon"), false);
assert.equal(isAppTheme(""), false);
assert.equal(isAppTheme(null), false);

for (const id of THEMES) {
  assert.ok(THEME_LABEL[id]);
}
assert.ok(THEMES.includes("forest"));
assert.ok(THEMES.includes("midnight"));
assert.ok(THEMES.includes("rose"));

console.log("theme check ok");

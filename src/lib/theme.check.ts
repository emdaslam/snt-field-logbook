import assert from "node:assert/strict";
import { THEMES, THEME_LABEL, isAppTheme } from "./types";

assert.equal(isAppTheme("light"), true);
assert.equal(isAppTheme("forest"), true);
assert.equal(isAppTheme("midnight"), true);
assert.equal(isAppTheme("rose"), true);
assert.equal(isAppTheme("butter"), true);
assert.equal(isAppTheme("champagne"), true);
assert.equal(isAppTheme("dragon"), true);
assert.equal(isAppTheme("spark"), true);
assert.equal(isAppTheme("ultra"), true);
assert.equal(isAppTheme("vanilla"), true);
assert.equal(isAppTheme("neon"), true);
assert.equal(isAppTheme("lilac"), true);
assert.equal(isAppTheme("neon-lime"), false);
assert.equal(isAppTheme(""), false);
assert.equal(isAppTheme(null), false);

for (const id of THEMES) {
  assert.ok(THEME_LABEL[id]);
}
assert.ok(THEMES.includes("forest"));
assert.ok(THEMES.includes("midnight"));
assert.ok(THEMES.includes("rose"));
assert.equal(THEMES.length, 15);

console.log("theme check ok");

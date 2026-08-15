import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("model picker uses a version-tolerant composer surface contract", async () => {
  const [injectorSource, themeStyles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(themeStylesPath, "utf8"),
  ]);

  assert.match(injectorSource, /const findFlatPickerSurface = \(trigger\) =>/);
  assert.match(injectorSource, /const findFlatPickerTrigger = \(surface\) =>/);
  assert.match(injectorSource, /\[role="button"\]/);
  assert.match(injectorSource, /\[aria-haspopup="menu"\]/);
  assert.match(injectorSource, /depth < 14/);
  assert.match(injectorSource, /FLAT_PICKER_TRIGGER_SELECTOR/);
  assert.match(themeStyles, /\[data-codex-intelligence-trigger="true"\]/);
  assert.match(injectorSource, /5\.6 Luna/);
  assert.match(injectorSource, /findFlatPickerTrigger\(surface\)/);
  assert.ok(
    (injectorSource.match(/findFlatPickerSurface\(/g) || []).length >= 2,
    "surface discovery must be used by both picker runtime paths",
  );
  assert.match(themeStyles, /\[data-codex-pokedex-flat-picker-surface="on"\]/);
  assert.match(themeStyles, /max-width:\s*100% !important/);
  assert.match(themeStyles, /grid-column:\s*1 \/ -1 !important/);
  assert.match(themeStyles, /grid-row:\s*3 !important/);
  assert.match(themeStyles, /overflow-x:\s*hidden !important/);
  assert.match(themeStyles, /overflow-y:\s*hidden !important/);
  assert.match(themeStyles, /height:\s*fit-content !important/);
  assert.match(themeStyles, /min-height:\s*0 !important/);
  assert.match(themeStyles, /max-height:\s*fit-content !important/);
  assert.match(themeStyles, /flex:\s*0 0 auto !important/);
  assert.match(themeStyles, /box-sizing:\s*border-box/);
  assert.match(themeStyles, /border-top:\s*0 !important/);
  const flatPickerLayoutRule = themeStyles.match(
    /:root\[data-codex-plus-model-picker="on"\] \[data-codex-pokedex-flat-picker-surface="on"\]\s*> \.codex-pokedex-flat-picker\s*\{[^}]+\}/,
  )?.[0] || "";
  assert.match(flatPickerLayoutRule, /margin:\s*8px 0 0 !important/);
  assert.match(themeStyles, /width:\s*auto !important/);
  assert.match(themeStyles, /gap:\s*6px 10px;/);
  assert.match(themeStyles, /padding:\s*0 8px;/);
  assert.match(themeStyles, /gap:\s*2px;/);
  assert.match(themeStyles, /padding:\s*2px;/);
  assert.match(themeStyles, /border:\s*1px solid/);
  assert.match(themeStyles, /border-radius:\s*6px;/);
  const hoverRule = themeStyles.match(
    /:root\[data-codex-plus-model-picker="on"\] \.codex-pokedex-flat-picker-option:hover:not\(:disabled\)\s*\{[^}]+\}/,
  )?.[0] || "";
  assert.match(hoverRule, /color:\s*var\(--codex-plus-accent-dark/);
  assert.match(hoverRule, /border-color:\s*color-mix\(in srgb, var\(--codex-plus-accent/);
  assert.match(hoverRule, /background:\s*color-mix\(in srgb, var\(--codex-plus-accent/);
});

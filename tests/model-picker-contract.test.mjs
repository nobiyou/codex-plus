import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("model picker keeps the themed control bar while using Codex native state", async () => {
  const [injectorSource, themeStyles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(themeStylesPath, "utf8"),
  ]);

  assert.match(injectorSource, /id: "conversation\.model-picker"/);
  assert.match(injectorSource, /data-codex-intelligence-trigger/);
  assert.match(injectorSource, /native-model-picker/);
  assert.match(injectorSource, /const decorateFlatPicker/);
  assert.match(injectorSource, /findModelPickerInterface/);
  assert.match(injectorSource, /const waitForPageCondition = async \(predicate, timeoutMs = \d+\) =>/);
  assert.match(injectorSource, /onSelectModel/);
  assert.match(injectorSource, /powerSelections/);
  assert.match(injectorSource, /onSelectPower/);
  assert.match(injectorSource, /onSelectReasoningEffort/);
  assert.match(injectorSource, /onSelectServiceTier/);
  assert.match(injectorSource, /data-codex-pokedex-flat-picker-surface/);
  assert.match(themeStyles, /codex-pokedex-flat-picker/);
  assert.match(themeStyles, /data-codex-plus-model-picker/);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);

test("pet sync falls back to the renderer bridge when the main inspector is unavailable", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /let rendererPetState = null;/);
  assert.match(source, /async function sendRendererAvatarOverlayMessage\(message\)/);
  assert.match(source, /window\.electronBridge\?\.sendMessageFromView/);
  assert.match(source, /type: "avatar-overlay-close"/);
  assert.match(source, /type: "avatar-overlay-open"/);
  assert.match(source, /rendererPetSync = rendererPetSync\.then[\s\S]*sendRendererAvatarOverlayMessage/);
  assert.match(source, /rendererPetState === nextPet/);
  assert.match(source, /if \(!isFeatureSettingsOwnerTarget\(target\)\) return;/);
  assert.match(source, /function isFeatureSettingsOwnerTarget\(target\)/);
});

test("pet controller keeps the official avatar overlay route and avoids duplicate renderer toggles", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /pathname === "\/avatar-overlay"/);
  assert.match(source, /pathname\.includes\("avatar-overlay-composition-surface"\)/);
  assert.match(source, /target: target/);
  assert.match(source, /firstOnly: true/);
  assert.match(source, /parsed\.pathname === "\/index\.html"/);
});

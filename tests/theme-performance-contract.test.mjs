import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("theme injection uses one atomic CSS write with a bounded fallback", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const CSS_CHUNK_SIZE = 32768/);
  assert.match(source, /style\.textContent = cssText/);
  assert.match(source, /CSS applied atomically/);
  assert.match(source, /falling back to chunks/);
  assert.doesNotMatch(source, /const chunkSize = 4000/);
});

test("theme reduces motion and transparency when the platform requests it", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms\s*!important/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms\s*!important/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(styles, /prefers-reduced-transparency: reduce\)[\s\S]*backdrop-filter:\s*none\s*!important/);
});

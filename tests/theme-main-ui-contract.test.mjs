import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("main workspace polish uses stable semantic anchors and responsive surfaces", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const polishBlock = styles.slice(styles.lastIndexOf("/* Main workspace polish:"));

  assert.match(polishBlock, /\.app-shell-left-panel[\s\S]*\.sidebar-item/);
  assert.match(polishBlock, /data-app-action-sidebar-thread-selected="true"/);
  assert.match(polishBlock, /\[data-codex-pokedex-header="on"\][\s\S]*backdrop-filter:\s*blur\(14px\)/);
  assert.match(polishBlock, /\.thread-scroll-container[\s\S]*scrollbar-gutter:\s*stable/);
  assert.match(polishBlock, /\.thread-scroll-container \[class\*="MarkdownRoot"\]/);
  assert.match(polishBlock, /\.thread-scroll-container pre/);
  assert.match(polishBlock, /\.composer-surface-chrome:focus-within/);
  assert.match(polishBlock, /:root\[data-codex-pokedex-theme="on"\]\.electron-dark/);
  assert.match(polishBlock, /@media \(max-width: 700px\)[\s\S]*composer-surface-chrome/);
  assert.match(polishBlock, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms\s*!important/);
  assert.doesNotMatch(polishBlock, /:root\[data-codex-pokedex-theme="on"\] \*[\s\S]*backdrop-filter/);
});

test("active view button follows the selected theme accent", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const activeViewBlock = styles.slice(styles.lastIndexOf("/* Active view button theme parity:"));

  assert.match(
    activeViewBlock,
    /\.app-shell-left-panel nav[\s\S]*button\[aria-pressed="true"\]\[aria-label\*="活动视图"\]/,
  );
  assert.match(
    activeViewBlock,
    /\.app-shell-left-panel nav[\s\S]*button\[aria-pressed="true"\]\[aria-label\*="active view"\]/,
  );
  assert.match(activeViewBlock, /background:\s*color-mix\([\s\S]*--codex-plus-accent/);
  assert.match(activeViewBlock, /color:\s*var\(--codex-plus-accent-dark/);
  assert.match(activeViewBlock, /border-color:\s*color-mix\([\s\S]*--codex-plus-accent/);
  assert.match(activeViewBlock, /background-image:\s*none !important/);
  assert.match(activeViewBlock, /:hover[\s\S]*background:\s*color-mix\([\s\S]*--codex-plus-accent/);
});

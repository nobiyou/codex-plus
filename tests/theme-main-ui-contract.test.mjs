import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("main workspace polish uses stable semantic anchors and responsive surfaces", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const polishBlock = styles.slice(styles.lastIndexOf("/* Main workspace polish:"));

  assert.match(polishBlock, /\.app-shell-left-panel[\s\S]*\.sidebar-item:not\(button\)/);
  assert.doesNotMatch(polishBlock, /\.app-shell-left-panel\s+\.sidebar-item\s*\{/);
  assert.match(
    polishBlock,
    /\.sidebar-item:not\(button\)\s*>\s*button\.sidebar-item:is\(\s*:hover,\s*\[data-state="open"\]\s*\)[\s\S]*box-shadow:\s*none\s*!important;/,
  );
  assert.match(polishBlock, /data-app-action-sidebar-thread-selected="true"/);
  assert.match(polishBlock, /\.thread-scroll-container[\s\S]*scrollbar-gutter:\s*stable/);
  assert.match(polishBlock, /\.thread-scroll-container \[class\*="MarkdownRoot"\]/);
  assert.match(polishBlock, /\.thread-scroll-container pre/);
  assert.match(polishBlock, /\.composer-surface-chrome:focus-within/);
  assert.match(polishBlock, /:root\[data-codex-pokedex-theme="on"\]\.electron-dark/);
  assert.match(polishBlock, /@media \(max-width: 700px\)[\s\S]*composer-surface-chrome/);
  assert.match(polishBlock, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms\s*!important/);
  assert.doesNotMatch(polishBlock, /:root\[data-codex-pokedex-theme="on"\] \*[\s\S]*backdrop-filter/);
});

test("native top bar stays transparent without extra decoration", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const normalizedStyles = styles.replace(/\s+/g, " ");
  const headerSurfaceBlock = styles.match(/\/\* Keep the native header transparent[\s\S]*?\n\}/)?.[0] ?? "";

  assert.notEqual(headerSurfaceBlock, "");
  assert.match(headerSurfaceBlock, /background-color:\s*transparent\s*!important/);
  assert.match(headerSurfaceBlock, /background-image:\s*none\s*!important/);
  assert.doesNotMatch(
    headerSurfaceBlock,
    /color-mix|linear-gradient|border(?:-bottom)?\s*:|box-shadow\s*:|-webkit-backdrop-filter\s*:|backdrop-filter\s*:/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\s+\[data-codex-pokedex-main-surface="on"\]\s*\{[^{}]*border-inline-start:\s*1px solid var\(--codex-plus-ui-border\)\s*!important;[^{}]*outline:\s*none\s*!important;[^{}]*box-shadow:\s*none\s*!important;/,
  );
  assert.doesNotMatch(normalizedStyles, /data-codex-pokedex-main-surface="on"[^{}]*outline:\s*2px/);
  assert.doesNotMatch(normalizedStyles, /\.app-shell-main-content-frame\s*\{/);
});

test("native main content top fade is removed without flattening the wallpaper", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const fadeBlock = styles.slice(styles.lastIndexOf("/* Remove the native main content top fade"));
  const normalizedStyles = fadeBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\s+:is\(\[class\*="MainContentTopFade"\]\)\s*\{[^{}]*background:\s*transparent\s*!important;[^{}]*background-image:\s*none\s*!important;/,
  );
  assert.doesNotMatch(fadeBlock, /:is\(\.main-surface, \[data-codex-pokedex-main-surface="on"\], main\[class\*="MainContentSurface"\]\)/);
});

test("native main content bottom fade is removed without flattening the composer", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const fadeStart = styles.lastIndexOf("/* Remove the native main content bottom fade");
  const composerStart = styles.lastIndexOf("/* Keep the composer transparent");
  const fadeBlock = styles.slice(fadeStart, composerStart);
  const normalizedStyles = fadeBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\s+:is\(\[data-codex-pokedex-main-surface="on"\], main\[class\*="MainContentSurface"\]\)\s+\[class\*="bg-gradient-to-t"\]\s*\{[^{}]*background:\s*transparent\s*!important;[^{}]*background-image:\s*none\s*!important;/,
  );
  assert.doesNotMatch(fadeBlock, /\.composer-surface-chrome\s*\{/);
});

test("native thread footer surface stays transparent over the wallpaper", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const footerStart = styles.lastIndexOf("/* Remove the native thread footer surface");
  const composerStart = styles.lastIndexOf("/* Keep the composer transparent");
  const footerBlock = styles.slice(footerStart, composerStart);
  const normalizedStyles = footerBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\s+\[data-thread-scroll-footer="true"\]\s*>\s*\[aria-hidden="true"\]\.bg-surface\s*\{[^{}]*background:\s*transparent\s*!important;[^{}]*background-color:\s*transparent\s*!important;[^{}]*background-image:\s*none\s*!important;/,
  );
});

test("composer surface stays transparent with a single pixel border", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const composerBlock = styles.slice(styles.lastIndexOf("/* Keep the composer transparent"));
  const normalizedStyles = composerBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\s+\.composer-surface-chrome\s*\{[^{}]*border-width:\s*1px\s*!important;[^{}]*background:\s*transparent\s*!important;[^{}]*background-color:\s*transparent\s*!important;[^{}]*background-image:\s*none\s*!important;/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\[data-codex-plus-accent\]\[data-codex-plus-theme\]\s+\.composer-surface-chrome\s*\{[^{}]*background-image:\s*none\s*!important;/,
  );
  assert.doesNotMatch(composerBlock, /linear-gradient/);
});

test("theme-aware chrome separates the navigation rail and application menu", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const polishBlock = styles.slice(styles.lastIndexOf("/* Main workspace polish:"));
  const normalizedStyles = polishBlock.replace(/\s+/g, " ");

  assert.match(normalizedStyles, /--codex-plus-shell-background:\s*color-mix\(/);
  assert.match(normalizedStyles, /--codex-plus-shell-foreground:\s*color-mix\(/);
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\.electron-dark\s*\{[^{}]*--codex-plus-shell-background:\s*color-mix\([^{}]*--color-token-side-bar-background/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\.electron-dark\s*\{[^{}]*--codex-plus-shell-foreground:\s*var\(--color-token-foreground/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\[data-codex-plus-accent\]\[data-codex-plus-theme\]\s+body,\s*:root\[data-codex-pokedex-theme="on"\]\[data-codex-plus-accent\]\[data-codex-plus-theme\]\s+#root\s*\{[^{}]*background-color:\s*var\(--codex-plus-shell-background\)\s*!important;[^{}]*background-image:\s*linear-gradient\(/,
  );
  assert.match(
    normalizedStyles,
    /\.app-shell-left-panel\s+\[data-app-navigation-rail="true"\]\s*,\s*:root\[data-codex-pokedex-theme="on"\]\s+\[class\*="ApplicationMenuTopBar"\]\s*\{[^{}]*background-color:\s*var\(--codex-plus-shell-background\)\s*!important;[^{}]*background-image:\s*linear-gradient\(/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\s+\[class\*="ApplicationMenuTopBar"\]\s*\{[^{}]*background-image:\s*linear-gradient\([^{}]*--codex-plus-highlight/,
  );
  assert.match(
    normalizedStyles,
    /\.app-shell-left-panel\s*\[data-app-navigation-rail="true"\]\s*\{[^{}]*box-shadow:\s*inset -1px 0 0 color-mix\(/,
  );
  assert.match(
    normalizedStyles,
    /:is\(\[data-app-navigation-rail="true"\], \[class\*="ApplicationMenuTopBar"\]\)\s*:is\(button, a, \[role="button"\]\)\s*\{[^{}]*color:\s*var\(--codex-plus-shell-foreground\)\s*!important;/,
  );
});

test("outer workspace gutters keep the shell gradient coverage", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const gutterStart = styles.lastIndexOf("/* Native layout gutters sit outside");
  const frameStart = styles.lastIndexOf("/* Visible four-corner workspace frame:");
  const gutterBlock = styles.slice(gutterStart, frameStart);
  const normalizedStyles = gutterBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\[data-codex-plus-accent\]\[data-codex-plus-theme\]\s+body,\s*:root\[data-codex-pokedex-theme="on"\]\[data-codex-plus-accent\]\[data-codex-plus-theme\]\s+#root\s*\{[^{}]*background-color:\s*var\(--codex-plus-shell-background\)\s*!important;[^{}]*background-image:\s*linear-gradient\(/,
  );
  assert.match(normalizedStyles, /background-repeat:\s*no-repeat\s*!important;/);
});

test("workspace frame keeps four outer corners and a visible boundary", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const frameBlock = styles.slice(styles.lastIndexOf("/* Visible four-corner workspace frame:"));
  const normalizedStyles = frameBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /\[data-app-shell-workspace-row\]\s*\{[^{}]*background-color:\s*var\(--codex-plus-shell-background\)\s*!important;[^{}]*background-image:\s*linear-gradient\(/,
  );
  assert.match(
    normalizedStyles,
    /\[data-app-shell-workspace-row\] > div:first-child\s*\{[^{}]*background-color:\s*transparent\s*!important;[^{}]*background-image:\s*none\s*!important;[^{}]*border:\s*0\s*!important;[^{}]*outline:\s*none\s*!important;[^{}]*outline-offset:\s*0\s*!important;[^{}]*border-radius:\s*8px\s*!important;[^{}]*overflow:\s*hidden\s*!important;[^{}]*box-shadow:\s*none\s*!important;/,
  );
  assert.match(
    normalizedStyles,
    /\.app-shell-left-panel \[data-app-navigation-rail="true"\]\s*\{[^{}]*box-shadow:\s*none\s*!important;/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\[data-codex-plus-accent\] \.app-shell-left-panel,\s*:root\[data-codex-pokedex-theme="on"\]:not\(\[data-codex-plus-accent\]\) \.app-shell-left-panel[^{}]*\{[^{}]*background:\s*transparent !important;[^{}]*background-color:\s*transparent !important;[^{}]*background-image:\s*none !important;/,
  );
  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\.electron-dark\[data-codex-plus-accent\] \.app-shell-left-panel,\s*:root\[data-codex-pokedex-theme="on"\]\.electron-dark:not\(\[data-codex-plus-accent\]\) \.app-shell-left-panel\s*\{[^{}]*background:\s*transparent !important;[^{}]*background-color:\s*transparent !important;[^{}]*background-image:\s*none !important;/,
  );
  assert.match(
    normalizedStyles,
    /\.app-shell-left-panel \.sidebar-navigation:not\(\.sidebar-navigation \.sidebar-navigation\)\s*\{[^{}]*background-color:\s*var\(--color-token-main-surface-primary,\s*var\(--codex-plus-shell-background\)\) !important;[^{}]*background-image:\s*none !important;[^{}]*border:\s*0\s*!important;[^{}]*border-right:\s*1px solid var\(--codex-plus-ui-border-strong\) !important;[^{}]*border-radius:\s*8px 0 0 8px !important;[^{}]*box-shadow:\s*inset 1px 0 0 var\(--codex-plus-ui-border-strong\), inset 0 1px 0 var\(--codex-plus-ui-border-strong\), inset 0 -1px 0 var\(--codex-plus-ui-border-strong\) !important;/,
  );
  assert.match(
    normalizedStyles,
    /:is\(\[data-codex-pokedex-header="on"\], \.app-header-tint, header\[data-app-shell-titlebar="true"\]\)\s*\{[^{}]*border-radius:\s*0 8px 0 0 !important;[^{}]*box-shadow:\s*inset 0 1px 0 var\(--codex-plus-ui-border-strong\), inset -1px 0 0 var\(--codex-plus-ui-border-strong\) !important;/,
  );
  assert.match(
    normalizedStyles,
    /main\[class\*="MainContentSurface"\]\s*\{[^{}]*border:\s*0\s*!important;[^{}]*border-inline-start:\s*0\s*!important;[^{}]*border-radius:\s*0 8px 8px 0 !important;[^{}]*box-shadow:\s*none !important;/,
  );
  assert.match(
    normalizedStyles,
    /main\[class\*="MainContentSurface"\] > \[class\*="WorkspaceContent"\]\s*\{[^{}]*border-radius:\s*0 8px 8px 0 !important;[^{}]*box-shadow:\s*inset 0 -1px 0 var\(--codex-plus-ui-border-strong\), inset -1px 0 0 var\(--codex-plus-ui-border-strong\) !important;/,
  );
});

test("page titlebar stroke follows the visible page surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const frameBlock = styles.slice(styles.lastIndexOf("/* Visible four-corner workspace frame:"));
  const normalizedStyles = frameBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /header\[data-app-shell-titlebar="true"\]\[data-app-shell-header-layout="(?:default|custom-titlebar|full-bleed)"\][^{}]*\{[^{}]*box-shadow:\s*none\s*!important;/,
  );
  assert.match(
    normalizedStyles,
    /main\[class\*="MainContentSurface"\]\s*>\s*\[class\*="WorkspaceContent"\]:has\(\s*\[data-app-shell-main-content-layout="default"\],\s*\[data-app-shell-main-content-layout="custom-titlebar"\],\s*\[data-app-shell-main-content-layout="full-bleed"\]\s*\)\s*\{[^{}]*box-shadow:\s*inset 0 1px 0 var\(--codex-plus-ui-border-strong\), inset 0 -1px 0 var\(--codex-plus-ui-border-strong\), inset -1px 0 0 var\(--codex-plus-ui-border-strong\)\s*!important;/,
  );
  assert.match(
    normalizedStyles,
    /main\[class\*="MainContentSurface"\]\s*>\s*\[class\*="WorkspaceContent"\]:has\(\s*\[data-app-shell-main-content-layout="default"\],\s*\[data-app-shell-main-content-layout="custom-titlebar"\],\s*\[data-app-shell-main-content-layout="full-bleed"\]\s*\)::before\s*\{[^{}]*content:\s*"";[^{}]*display:\s*block\s*!important;[^{}]*position:\s*absolute\s*!important;[^{}]*inset-block-start:\s*0\s*!important;[^{}]*inset-inline:\s*0\s*!important;[^{}]*height:\s*1px\s*!important;[^{}]*background:\s*var\(--codex-plus-ui-border-strong\)\s*!important;[^{}]*z-index:\s*50\s*!important;/,
  );
});

test("collapsed native sidebar restores the complete workspace frame", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const frameBlock = styles.slice(styles.lastIndexOf("/* Visible four-corner workspace frame:"));
  const normalizedStyles = frameBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /\[data-app-shell-sidebar-open="false"\]\s+:is\(\[data-codex-pokedex-header="on"\], \.app-header-tint, header\[data-app-shell-titlebar="true"\]\)\s*\{[^{}]*border-radius:\s*8px 8px 0 0 !important;/,
  );
  assert.match(
    normalizedStyles,
    /\[data-app-shell-sidebar-open="false"\]\s+main\[class\*="MainContentSurface"\]\s*\{[^{}]*border-radius:\s*8px !important;/,
  );
  assert.match(
    normalizedStyles,
    /\[data-app-shell-sidebar-open="false"\]\s+main\[class\*="MainContentSurface"\]\s*>\s*\[class\*="WorkspaceContent"\]\s*\{[^{}]*border-radius:\s*8px !important;[^{}]*box-shadow:\s*inset 0 1px 0 var\(--codex-plus-ui-border-strong\), inset 0 -1px 0 var\(--codex-plus-ui-border-strong\), inset 1px 0 0 var\(--codex-plus-ui-border-strong\), inset -1px 0 0 var\(--codex-plus-ui-border-strong\) !important;/,
  );
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
    /\.app-shell-left-panel nav[\s\S]*button\[aria-pressed="true"\]\[aria-label\*="active view" i\]/,
  );
  assert.match(activeViewBlock, /background:\s*color-mix\([\s\S]*--codex-plus-accent/);
  assert.match(activeViewBlock, /color:\s*var\(--codex-plus-accent-dark/);
  assert.match(activeViewBlock, /border-color:\s*color-mix\([\s\S]*--codex-plus-accent/);
  assert.match(activeViewBlock, /background-image:\s*none !important/);
  assert.match(activeViewBlock, /:hover[\s\S]*background:\s*color-mix\([\s\S]*--codex-plus-accent/);
});

test("native settings navigation remains readable in dark mode", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const settingsNavBlock = styles.slice(styles.lastIndexOf("/* Native settings navigation shares the sidebar host"));
  const normalizedStyles = settingsNavBlock.replace(/\s+/g, " ");

  assert.match(
    normalizedStyles,
    /:root\[data-codex-pokedex-theme="on"\]\.electron-dark\s+\.app-shell-left-panel nav:has\(\[data-settings-panel-slug\]\)\s+\[class\*="text-fade-truncate"\]\s*\{[^{}]*color:\s*var\(--color-token-text-secondary,\s*rgb\(244 235 227 \/ 0\.72\)\)\s*!important;/,
  );
  assert.match(
    normalizedStyles,
    /nav:has\(\[data-settings-panel-slug\]\)\s+button\[data-settings-panel-slug\]\[aria-current="page"\][^{}]*\[class\*="text-fade-truncate"\]\s*\{[^{}]*color:\s*var\(--color-token-text-primary,\s*#f4ebe3\)\s*!important;/,
  );
});

test("sidebar task titles use the active theme text tokens", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const parityStart = styles.lastIndexOf("/* Sidebar navigation text parity:");
  const parityEnd = styles.indexOf("/* Native settings navigation shares the sidebar host", parityStart);
  const parityBlock = styles.slice(parityStart, parityEnd === -1 ? styles.length : parityEnd);
  const normalizedStyles = parityBlock.replace(/\s+/g, " ");

  assert.ok(
    normalizedStyles.includes(
      "color: var(--color-token-text-secondary, var(--token-text-secondary, rgb(48 35 30 / 0.66))) !important;",
    ),
  );
  assert.ok(
    styles.includes(
      "color: var(--color-token-text-primary, var(--token-text-primary, #30231e)) !important;",
    ),
  );
  assert.doesNotMatch(
    normalizedStyles,
    /color:\s*var\(--token-text-secondary,\s*rgb\(48 35 30 \/ 0\.66\)\)\s*!important/,
  );
  assert.doesNotMatch(
    normalizedStyles,
    /color:\s*var\(--token-text-primary,\s*#30231e\)\s*!important/,
  );
  assert.match(
    styles,
    /:root\[data-codex-pokedex-theme="on"\]\.electron-dark\s*\{[\s\S]*--color-token-text-primary:\s*#f4ebe3\s*!important;[\s\S]*--color-token-text-secondary:\s*rgb\(244 235 227 \/ 0\.72\)\s*!important;/,
  );
});

test("Codex mode switch keeps its logo visible and vertically centered", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const modeSwitchBlock = styles.slice(styles.lastIndexOf("/* Native ghost buttons use ::before"));

  assert.match(modeSwitchBlock, /button\[aria-label\^="Switch mode"\]::before/);
  assert.match(modeSwitchBlock, /button\[aria-label\^="切换模式"\]::before/);
  assert.match(modeSwitchBlock, /inset-block-start:\s*50%\s*!important/);
  assert.match(modeSwitchBlock, /inset-inline-start:\s*6px\s*!important/);
  assert.match(modeSwitchBlock, /opacity:\s*1\s*!important/);
  assert.match(modeSwitchBlock, /transform:\s*translateY\(-50%\)\s*!important/);
  assert.match(modeSwitchBlock, /transition:\s*none\s*!important/);
  assert.match(modeSwitchBlock, />\s*:first-child[\s\S]*padding-inline-start:\s*20px\s*!important/);
});

test("settings previews keep mobile dimensions after theme overrides", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const responsivePreviewBlock = styles.slice(styles.lastIndexOf("/* Mobile settings preview sizing parity:"));

  assert.match(
    responsivePreviewBlock,
    /@media \(max-width: 700px\)[\s\S]*\.codex-plus-pro-settings-wallpaper-preview\s*{[\s\S]*width:\s*112px\s*!important;/,
  );
  assert.match(
    responsivePreviewBlock,
    /\.codex-plus-pro-settings-logo-preview\s*{[\s\S]*width:\s*64px\s*!important;[\s\S]*height:\s*64px\s*!important;/,
  );
});

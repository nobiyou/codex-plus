import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("theme marks the current Codex composer with the legacy compatibility class", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const COMPOSER_ATTRIBUTE = "data-codex-pokedex-composer"/);
  assert.match(source, /\[data-composer-radius-variant\], \[class\*="ComposerLayoutRoot"\]/);
  assert.match(source, /composer\.setAttribute\(COMPOSER_ATTRIBUTE, "on"\)/);
  assert.match(source, /composer\.classList\.add\("composer-surface-chrome"\)/);
  assert.match(source, /current\.classList\.remove\("composer-surface-chrome"\)/);
  assert.match(source, /"data-composer-radius-variant"/);
  assert.match(source, /voiceStyle\.backgroundImage !== "none"/);
  assert.match(source, /style\.setProperty\("background-color"/);
});

test("theme maps native semantic tokens onto the existing themed palette", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /--color-surface:\s*var\(--color-token-main-surface-primary\)/);
  assert.match(styles, /--color-text:\s*var\(--color-token-foreground\)/);
  assert.match(styles, /--color-text-secondary:\s*var\(--color-token-text-secondary\)/);
  assert.match(styles, /--color-border:\s*var\(--color-token-border\)/);
  assert.match(styles, /--color-border-strong:\s*var\(--color-token-border-heavy\)/);
  assert.match(styles, /--color-icon-primary:\s*var\(--color-token-foreground\)/);
});

test("composer utility bar follows themed surface tokens in light and dark modes", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const lightUtilityBlock = styles.slice(
    styles.indexOf("/* The dark strip behind project/branch chips reuses sidebar tokens; retint it. */"),
    styles.indexOf("/* Chips: project / local / branch */"),
  );
  const darkUtilityBlock = styles.slice(
    styles.indexOf("/* Dark: composer utility bar (project / local / branch task strip)"),
    styles.indexOf(":root[data-codex-pokedex-theme=\"on\"].electron-dark [data-composer-utility-bar-scroll-area] button"),
  );

  assert.match(lightUtilityBlock, /var\(--color-token-input-background/);
  assert.match(lightUtilityBlock, /var\(--color-token-main-surface-primary/);
  assert.match(lightUtilityBlock, /\[data-composer-utility-bar-scroll-area\]/);
  assert.doesNotMatch(lightUtilityBlock, /rgb\(255 255 255 \/ 0\.72\)/);
  assert.match(darkUtilityBlock, /var\(--color-token-input-background/);
  assert.match(darkUtilityBlock, /var\(--color-token-main-surface-primary/);
  assert.match(darkUtilityBlock, /\[data-composer-utility-bar-scroll-area\]/);
  assert.doesNotMatch(darkUtilityBlock, /rgb\(28 26 32 \/ 0\.94\)/);
});

test("model picker base surfaces reuse the active theme palette", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const segmentBlock = styles.slice(
    styles.indexOf(":root[data-codex-plus-model-picker=\"on\"] .codex-pokedex-flat-picker-segments"),
    styles.indexOf(":root[data-codex-plus-model-picker=\"on\"] .codex-pokedex-flat-picker-option"),
  );

  assert.match(segmentBlock, /var\(--codex-plus-accent/);
  assert.match(segmentBlock, /var\(--color-token-main-surface-primary/);
  assert.doesNotMatch(segmentBlock, /rgb\(96 62 49 \/ 0\.055\)/);
});

test("theme gives native tooltip variants an accent-aware surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /\[role="tooltip"\]/);
  assert.match(styles, /\[role="tooltip"\]\[data-side="right"\]/);
  assert.match(styles, /\[role="tooltip"\]\[data-side="top"\]/);
  assert.match(styles, /var\(--codex-plus-accent/);
  assert.match(styles, /backdrop-filter:\s*blur\(14px\)/);
});

test("theme gives the task sequence hover card a compact theme-aware surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(
    styles,
    /body:has\(\[data-above-composer-portal\] span:is\(\[data-state="open"\], \[data-state="delayed-open"\]\)\)/,
  );
  assert.match(styles, /\[role="tooltip"\]\[data-side="top"\]/);
  assert.match(styles, /\[class\*="max-w-80"\]/);
  assert.match(styles, /\[class\*="vertical-scroll-fade-mask"\]/);
  assert.match(styles, /\[class\*="items-start"\]\[class\*="gap-2"\]/);
  assert.match(styles, /\[class\*="size-4"\]/);
  assert.match(styles, /border-radius:\s*12px\s*!important/);
  assert.match(styles, /background:\s*linear-gradient\(/);
  assert.match(styles, /backdrop-filter:\s*blur\(14px\) saturate\(1\.08\)/);
  assert.match(styles, /\.electron-dark[\s\S]*var\(--color-token-menu-background/);
});

test("theme gives the native profile menu a structured themed surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /body:has\(button\[aria-label="打开个人资料菜单"\]\[aria-expanded="true"\]\)/);
  assert.match(styles, /\[data-radix-menu-content\]\[role="menu"\]/);
  assert.match(styles, /\[role="menuitem"\]:first-child/);
  assert.match(
    styles,
    /\[data-radix-menu-content\]\[role="menu"\]\s*>\s*div\s*>\s*\[role="menuitem"\]:last-child/,
  );
  assert.match(
    styles,
    /\[data-radix-menu-content\]\[role="menu"\]\s*>\s*div\s*>\s*\[role="menuitem"\]:first-child/,
  );
  assert.match(
    styles,
    /\[data-radix-menu-content\]\[role="menu"\]\s*>\s*div\s*>\s*\[role="menuitem"\]:nth-child\(2\)/,
  );
  assert.doesNotMatch(
    styles,
    /\[data-radix-menu-content\]\[role="menu"\]\s+\[role="menuitem"\]:last-child/,
  );
  assert.match(styles, /a\[role="menuitem"\]/);
  assert.match(styles, /a\[role="menuitem"\]\s+span\.text-default/);
  assert.match(styles, /\[data-highlighted="true"\]/);
  assert.match(styles, /backdrop-filter:\s*blur\(18px\)/);
});

test("theme rounds native diff previews while preserving their scroll and diff rows", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const diffSurfaceBlock = styles.slice(
    styles.indexOf("/* Native diff review surface"),
    styles.indexOf("/* Native changed-file summary"),
  );
  const diffScrollHostBlock = styles.slice(
    styles.indexOf("  :is(diffs-container, [class*=\"diffs-container\"]),"),
    styles.indexOf("/* The file list is a single rounded stack"),
  );

  assert.match(styles, /\[class\*="group\/file-diff"\]/);
  assert.match(diffSurfaceBlock, /div\[class\*="electron:bg-surface"\]:has\(\[class\*="group\/file-diff"\]\)/);
  assert.match(styles, /\[data-pierre-editor-surface\]/);
  assert.match(styles, /border-radius:\s*12px\s*!important/);
  assert.match(styles, /background-clip:\s*padding-box\s*!important/);
  assert.match(diffSurfaceBlock, /overflow:\s*hidden auto\s*!important/);
  assert.match(diffSurfaceBlock, /clip-path:\s*inset\(0 round 12px\)\s*!important/);
  assert.match(styles, /:is\(diffs-container,\s*\[class\*="diffs-container"\]\)/);
  assert.match(styles, /overflow:\s*auto\s*!important/);
  assert.match(styles, /\[class\*="turn-diff-file-row"\]\s*>\s*button/);
  assert.match(styles, /border-top-left-radius:\s*10px\s*!important/);
  assert.match(styles, /border-bottom-right-radius:\s*10px\s*!important/);
  assert.match(styles, /bg-\[var\(--color-codex-diff-added\)\]/);
  assert.match(styles, /bg-\[var\(--color-codex-diff-deleted\)\]/);
  assert.match(styles, /--color-codex-diff-surface:\s*color-mix\(/);
  assert.match(styles, /--codex-diffs-surface-override:\s*var\(--color-codex-diff-surface\)/);
  assert.match(styles, /min-height:\s*0\s*!important/);
  assert.match(diffSurfaceBlock, /height:\s*auto\s*!important/);
  assert.match(diffSurfaceBlock, /flex:\s*0 1 auto\s*!important/);
  assert.match(
    diffSurfaceBlock,
    /div\[class\*=\"electron:bg-surface\"\]:has\(\[class\*=\"group\/file-diff\"\]\)[\s\S]*background-color:\s*transparent\s*!important/,
  );
  assert.doesNotMatch(diffSurfaceBlock, /:not\(#review-diffs-open\)/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*flex:\s*1 1 0%\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*height:\s*auto\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*background-color:\s*transparent\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*background-image:\s*none\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*align-self:\s*flex-start\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*max-height:\s*100%\s*!important/);
  assert.match(diffSurfaceBlock, />\s*\[role="presentation"\]/);
  assert.match(diffSurfaceBlock, />\s*\[class\*="overflow-hidden"\]/);
  assert.match(diffSurfaceBlock, /border-top-left-radius:\s*11px\s*!important/);
  assert.match(diffSurfaceBlock, /max-height:\s*none\s*!important/);
  assert.match(diffScrollHostBlock, /max-height:\s*none\s*!important/);
  assert.doesNotMatch(diffScrollHostBlock, /max-height:\s*min\(70vh, 680px\)\s*!important/);
  assert.match(styles, /background-color:\s*var\(--color-codex-diff-surface/);
  assert.match(styles, /var\(--codex-plus-accent/);
  assert.match(
    diffSurfaceBlock,
    /div\[class\*="h-full"\]\[class\*="flex-col"\]:has\(\[class\*="group\/file-diff"\]\)/,
  );
  assert.match(
    diffSurfaceBlock,
    /div\[class\*="h-full"\]\[class\*="flex-col"\]:has\(\[class\*="group\/file-diff"\]\)[\s\S]*\[class\*="overflow-clip"\]/,
  );
});

test("theme gives the changed-file summary a calm accent-aware surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /div:has\(> \[class\*="group\/turn-diff-header"\]\)/);
  assert.match(styles, /div:has\(> \[class\*="group\/turn-diff-file-row"\]\)/);
  assert.match(styles, /backdrop-filter:\s*blur\(14px\) saturate\(1\.05\)/);
  assert.match(styles, /border-radius:\s*12px\s*!important/);
  assert.match(styles, /text-codex-git-added/);
  assert.match(styles, /text-codex-git-deleted/);
  assert.match(styles, /button:is\(:hover, :focus-visible\)/);
  assert.match(styles, /\.electron-dark[\s\S]*group\/turn-diff-file-row/);
});

test("theme scopes compatibility fallbacks to declared Codex semantic hosts", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /data-codex-plus-compat-sidebar="fallback"/);
  assert.match(styles, /data-codex-plus-compat-composer="fallback"/);
  assert.match(styles, /data-codex-plus-compat-diff-preview="fallback"/);
  assert.match(styles, /data-codex-plus-compat-diff-preview="fallback"[\s\S]*group\/file-diff/);
  assert.match(styles, /data-codex-plus-compat-composer="fallback"[\s\S]*data-composer-utility-bar-scroll-area/);
});

test("theme gives light action buttons a pale accent surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /:root\[data-codex-pokedex-theme="on"\]:not\(\.electron-dark\) \[role="alert"\] button:not\(:has\(svg\)\)/);
  assert.match(styles, /:is\(\.composer-surface-chrome, \[class\*="composer-surface"\]\)\s+button:is\(/);
  assert.match(styles, /\[aria-label\*="停止"\]/);
  assert.match(styles, /background:\s*color-mix\([^;]+rgb\(255 255 255/);
  assert.match(styles, /background-image:\s*none\s*!important/);
  assert.match(styles, /button:not\(:has\(svg\)\):focus-visible/);
  assert.match(styles, /button\[class\*="rounded-full"\]:not\(\.composer-surface-chrome button\):not\(\[class\*="Composer"\] button\)/);
  assert.match(styles, /\[class\*="rounded-full"\]\[class\*="border"\]:not\(\.composer-surface-chrome \*\):not\(\[class\*="Composer"\] \*\)/);
});

test("theme scopes the task status strip and gives it a readable semantic treatment", async () => {
  const [injector, styles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(themeStylesPath, "utf8"),
  ]);

  assert.match(injector, /const TASK_STATUS_ATTRIBUTE = "data-codex-plus-task-status"/);
  assert.match(injector, /document\.querySelectorAll\('\[role="status"\]'\)/);
  assert.match(injector, /element\.classList\.contains\("sr-only"\)/);
  assert.match(injector, /rect\.bottom <= composerRect\.top \+ 16/);
  assert.match(injector, /candidate\.setAttribute\(TASK_STATUS_ATTRIBUTE, "on"\)/);
  assert.match(styles, /\[data-codex-plus-task-status="on"\]/);
  assert.match(styles, /min-height:\s*32px\s*!important/);
  assert.match(styles, /border-inline-start:\s*3px solid var\(--codex-plus-task-status-color\)/);
  assert.match(styles, /codex-plus-task-status-pulse/);
  assert.match(styles, /prefers-reduced-motion: reduce\)[\s\S]*data-codex-plus-task-status/);
  assert.doesNotMatch(
    styles,
    /\.thread-scroll-container \[role="status"\]:not\(\[id\*="LiveRegion"\]\)/,
  );
});

test("task status classification uses the live stop control and bilingual status text", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const getComposerActionLabel = \(button\) =>/);
  assert.match(source, /const isComposerStopButton = \(button\) =>/);
  assert.match(source, /label\.includes\("stop"\) \|\| label\.includes\("停止"\)/);
  assert.match(source, /const readTaskRunningState = \(\) => Array\.from\(document\.querySelectorAll\("button"\)\)/);
  assert.match(source, /const publishTaskState = \(running = readTaskRunningState\(\)\)/);
  assert.match(source, /const decorateTaskStatus = \(taskRunning = readTaskRunningState\(\)\)/);
  assert.match(source, /failed\|failure\|error\|exception/);
  assert.match(source, /complete\|completed\|successful\|success\|done\|finished/);
  assert.match(source, /starting\|waiting\|setting up\|preparing\|processing\|running\|queued\|in progress\|working/);
  assert.match(source, /decorateTaskStatus\(taskRunning\);[\s\S]*publishTaskState\(taskRunning\);/);
});

test("compatibility settings keep a polished five-segment desktop control", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const polishBlock = styles.slice(styles.lastIndexOf("/* Settings polish:"));

  assert.match(polishBlock, /\.codex-plus-pro-compatibility-categories[\s\S]*grid-auto-flow:\s*column/);
  assert.match(polishBlock, /grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(polishBlock, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(polishBlock, /\.codex-plus-pro-compatibility-category\[data-selected="true"\]/);
  assert.match(polishBlock, /\.codex-plus-pro-compatibility-status::before/);
  assert.match(polishBlock, /@media \(max-width: 700px\)[\s\S]*scroll-snap-type:\s*inline mandatory/);
});

test("theme gives filled buttons readable foregrounds and quiet disabled states", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const buttonBlock = styles.slice(styles.lastIndexOf("/* Button contrast polish:"));

  assert.match(buttonBlock, /--codex-plus-action-bg:/);
  assert.match(buttonBlock, /:root\[data-codex-pokedex-theme="on"\]:not\(\.electron-dark\)/);
  assert.match(buttonBlock, /--codex-plus-action-bg:\s*color-mix\([\s\S]*62%/);
  assert.match(buttonBlock, /--color-token-button-background:\s*var\(--codex-plus-action-bg\) !important/);
  assert.match(buttonBlock, /--color-token-button-foreground:\s*var\(--codex-plus-action-fg\) !important/);
  assert.match(buttonBlock, /--codex-plus-action-gradient-start:\s*var\(--codex-plus-action-bg\)/);
  assert.match(buttonBlock, /\.codex-plus-pro-compatibility-repair:not\(:disabled\)/);
  assert.match(buttonBlock, /\.codex-plus-pro-compatibility-repair:disabled[\s\S]*background-image: none !important/);
  assert.match(buttonBlock, /aside:has\(img\[src\*="bidi-homepage-banner-orb"\]\) button:not\(:has\(svg\)\)/);
  assert.match(buttonBlock, /\[aria-label="开始新的语音聊天"\]/);
  assert.match(buttonBlock, /\[aria-label="听写"\]/);
  assert.match(buttonBlock, /\.codex-pokedex-flat-picker-option\[data-selected="true"\][\s\S]*color: var\(--codex-plus-action-fg\)/);
  assert.match(buttonBlock, /\.codex-pokedex-flat-picker-option\[data-selected="true"\][\s\S]*-webkit-text-fill-color: var\(--codex-plus-action-fg\)/);
  assert.match(buttonBlock, /\.codex-pokedex-flat-picker-option\[data-selected="true"\][\s\S]*background-image: linear-gradient/);
  assert.match(buttonBlock, /\.codex-pokedex-flat-picker-switch-thumb[\s\S]*background: #ffffff !important/);
});

test("empty composer stop action uses a quiet themed task-state surface", async () => {
  const [injector, styles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(themeStylesPath, "utf8"),
  ]);

  assert.match(injector, /const isStopAction = isComposerStopButton\(actionButton\)/);
  assert.match(injector, /semantic-stop/);
  assert.match(styles, /button:is\([\s\S]*\[aria-label="Stop"\][\s\S]*semantic-stop/);
  assert.match(styles, /background-image: none !important/);
  assert.match(styles, /var\(--color-token-main-surface-primary/);
  assert.match(styles, /:focus-visible[\s\S]*outline: 2px solid color-mix/);
});

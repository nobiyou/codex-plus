import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("theme bridge follows the native data-theme dark marker", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const HOST_THEME_ATTRIBUTE = "data-theme"/);
  assert.match(source, /const DARK_THEME_CLASS = "electron-dark"/);
  assert.match(source, /const DARK_THEME_COMPAT_ATTRIBUTE = "data-codex-plus-dark-theme-compat"/);
  assert.match(
    source,
    /const syncNativeDarkThemeClass = \(\) => \{[\s\S]*?getAttribute\(HOST_THEME_ATTRIBUTE\)[\s\S]*?classList\.add\(DARK_THEME_CLASS\)/,
  );
  assert.match(
    source,
    /new MutationObserver\(\(\) => \{\s*syncNativeDarkThemeClass\(\);[\s\S]*?HOST_THEME_ATTRIBUTE,/,
  );
  assert.match(source, /syncNativeDarkThemeClass\(\);\s*applyFeatureSettings\(featureSettings/);
});

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

test("theme marks native terminal approval surfaces for scoped styling", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const APPROVAL_SURFACE_ATTRIBUTE = "data-codex-approval-surface"/);
  assert.match(source, /const markApprovalSurfaces = \(\) =>/);
  assert.match(source, /document\.querySelectorAll\('\[role="alert"\]'\)/);
  assert.match(source, /surface\.setAttribute\(APPROVAL_SURFACE_ATTRIBUTE, "on"\)/);
  assert.match(source, /current\.removeAttribute\(APPROVAL_SURFACE_ATTRIBUTE\)/);
  assert.match(source, /markApprovalSurfaces\(\)/);
});

test("theme marks MCP approval surfaces without requiring a command preview", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const APPROVAL_MCP_ATTRIBUTE = "data-codex-approval-mcp"/);
  assert.ok(
    source.includes(
      "const mcpApprovalCopy = /mcp[\\\\s\\\\S].*(server|服务器)[\\\\s\\\\S].*(tool|工具)/i.test(copy);",
    ),
  );
  assert.match(source, /const buttons = Array\.from\(surface\.querySelectorAll\("button"\)\)/);
  assert.match(source, /preview && approvalCopy\) \|\| mcpApprovalCopy/);
  assert.match(source, /surface\.setAttribute\(APPROVAL_MCP_ATTRIBUTE, "on"\)/);
  assert.match(source, /current\.removeAttribute\(APPROVAL_MCP_ATTRIBUTE\)/);
  assert.match(source, /surface === document\.body \|\| surface === document\.documentElement/);
  assert.match(source, /formCount !== 1/);
  assert.match(source, /buttons\.length > 6/);
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

test("themed model bar keeps Codex as the state owner", async () => {
  const [source, styles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(themeStylesPath, "utf8"),
  ]);

  assert.match(source, /id: "conversation\.model-picker"/);
  assert.match(source, /selector: 'button\[data-codex-intelligence-trigger="true"\]'/);
  assert.match(source, /styleProbe: "native-model-picker"/);
  assert.match(source, /const trigger = document\.querySelector\('button\[data-codex-intelligence-trigger="true"\]'\)/);
  assert.match(source, /trigger\.getAttribute\("aria-haspopup"\) === "menu"/);
  assert.match(source, /nativeRect\.width >= 40/);
  assert.match(source, /nativeRect\.height >= 20/);
  assert.match(source, /const decorateFlatPicker/);
  assert.match(source, /onSelectModel/);
  assert.match(source, /powerSelections/);
  assert.match(source, /onSelectPower/);
  assert.match(source, /onSelectReasoningEffort/);
  assert.match(styles, /codex-pokedex-flat-picker/);
  assert.match(styles, /data-codex-plus-model-picker/);
});

test("legacy wide-sidebar watermark decorations stay retired", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.doesNotMatch(styles, /\.app-shell-left-panel::before/);
  assert.doesNotMatch(styles, /\.app-shell-left-panel::after/);
});

test("theme gives native tooltip variants an accent-aware surface", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(styles, /\[role="tooltip"\]/);
  assert.match(styles, /\[role="tooltip"\]\[data-side="right"\]/);
  assert.match(styles, /\[role="tooltip"\]\[data-side="top"\]/);
  assert.match(styles, /var\(--codex-plus-accent/);
  assert.match(styles, /backdrop-filter:\s*blur\(14px\)/);
});

test("light action tooltips use a quiet glass gradient", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const actionTooltipBlock = styles.slice(
    styles.indexOf("/* Light action hints should read as part of the blue glass shell"),
    styles.indexOf("/* Task sequence hover card"),
  );

  assert.match(actionTooltipBlock, /:not\(\.electron-dark\)/);
  assert.match(actionTooltipBlock, /\[role="tooltip"\]\[data-side="top"\]/);
  assert.match(actionTooltipBlock, /background:\s*\n\s*linear-gradient\(/);
  assert.match(actionTooltipBlock, /--codex-plus-accent[\s\S]*10%/);
  assert.match(actionTooltipBlock, /--codex-plus-highlight[\s\S]*7%/);
  assert.match(actionTooltipBlock, /color:\s*var\(--codex-plus-accent-dark/);
  assert.doesNotMatch(actionTooltipBlock, /--codex-plus-accent[^\n]*92%/);
  assert.doesNotMatch(actionTooltipBlock, /--codex-plus-accent-dark[^\n]*88%/);
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
  const ruleBlock = (selectorFragment) => {
    const selectorIndex = styles.indexOf(selectorFragment);
    assert.notEqual(selectorIndex, -1, `missing selector: ${selectorFragment}`);
    const ruleStart = styles.lastIndexOf(':root[data-codex-pokedex-theme="on"]', selectorIndex);
    const ruleEnd = styles.indexOf("}", selectorIndex) + 1;
    return styles.slice(ruleStart, ruleEnd);
  };
  const reviewHostBlock = ruleBlock("#review-diffs-open");
  const anonymousReviewHostBlock = ruleBlock(
    'div[class*="h-full"][class*="flex-col"]:has([class*="group/file-diff"]):not(#review-diffs-open)',
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
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*flex:\s*1 1 0%\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*height:\s*100%\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*background-color:\s*transparent\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*background-image:\s*none\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*align-self:\s*auto\s*!important/);
  assert.match(styles, /#review-diffs-open\s*\{[\s\S]*max-height:\s*none\s*!important/);
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
    /div\[class\*="h-full"\]\[class\*="flex-col"\]:has\(\[class\*="group\/file-diff"\]\):not\(#review-diffs-open\):not\(\[role="tooltip"\]\s+\*\)/,
  );
  assert.match(
    diffSurfaceBlock,
    /div\[class\*="h-full"\]\[class\*="flex-col"\]:has\(\[class\*="group\/file-diff"\]\):not\(#review-diffs-open\):not\(\[role="tooltip"\]\s+\*\)[\s\S]*\[class\*="overflow-clip"\]/,
  );
  assert.match(diffSurfaceBlock, /#review-diffs-open\s*\{[\s\S]*height:\s*100%\s*!important/);
  assert.match(diffSurfaceBlock, /#review-diffs-open\s*\{[\s\S]*border:\s*0\s*!important/);
  assert.match(
    diffSurfaceBlock,
    /div\[class\*="h-full"\]\[class\*="flex-col"\]:has\(\[class\*="group\/file-diff"\]\):not\(#review-diffs-open\)[\s\S]*height:\s*100%\s*!important/,
  );
  assert.match(
    diffSurfaceBlock,
    /div\[class\*="h-full"\]\[class\*="flex-col"\]:has\(\[class\*="group\/file-diff"\]\):not\(#review-diffs-open\)[\s\S]*border:\s*0\s*!important/,
  );
  assert.doesNotMatch(reviewHostBlock, /height:\s*auto\s*!important/);
  assert.doesNotMatch(anonymousReviewHostBlock, /height:\s*auto\s*!important/);
});

test("expanded diff layout excludes portal hover previews", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const diffSurfaceBlock = styles.slice(
    styles.indexOf("/* Native diff review surface"),
    styles.indexOf("/* Settings themed background"),
  );

  assert.match(diffSurfaceBlock, /:not\(\[role="tooltip"\]\s+\*\)/);
  assert.match(
    diffSurfaceBlock,
    /data-codex-plus-compat-diff-preview="fallback"\][\s\S]*:not\(\[role="tooltip"\]\s+\*\)/,
  );
});

test("theme keeps the hover diff preview on native geometry", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const hoverPreviewBlock = styles.slice(
    styles.indexOf("/* Native hover diff preview"),
    styles.indexOf("/* Native diff review surface"),
  );

  assert.match(hoverPreviewBlock, /\[role="tooltip"\]\[class\*="diff-preview"\]/);
  assert.match(hoverPreviewBlock, /border:\s*0\s*!important/);
  assert.match(hoverPreviewBlock, /box-shadow:\s*none\s*!important/);
  assert.match(hoverPreviewBlock, /-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(hoverPreviewBlock, /backdrop-filter:\s*none\s*!important/);
  assert.match(hoverPreviewBlock, /\[data-testid="diff-preview-scroll"\]/);
  assert.match(hoverPreviewBlock, /max-height:\s*384px\s*!important/);
  assert.match(hoverPreviewBlock, /overflow:\s*auto\s*!important/);
  const topGeometryStart = hoverPreviewBlock.indexOf(
    '[role="tooltip"][data-side="top"][class*="diff-preview"]',
  );
  assert.notEqual(topGeometryStart, -1);
  const topGeometryEnd = hoverPreviewBlock.indexOf("}", topGeometryStart) + 1;
  const topGeometryBlock = hoverPreviewBlock.slice(topGeometryStart, topGeometryEnd);
  assert.match(topGeometryBlock, /height:\s*auto\s*!important/);
  assert.match(topGeometryBlock, /min-height:\s*0\s*!important/);
  const baseGeometryStart = hoverPreviewBlock.indexOf(
    '[role="tooltip"][class*="diff-preview"]',
  );
  const baseGeometryEnd = hoverPreviewBlock.indexOf("}", baseGeometryStart) + 1;
  const baseGeometryBlock = hoverPreviewBlock.slice(baseGeometryStart, baseGeometryEnd);
  assert.doesNotMatch(
    baseGeometryBlock,
    /height:\s*auto\s*!important/,
  );
  assert.doesNotMatch(hoverPreviewBlock, /max-height:\s*none\s*!important/);
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

test("compatibility settings keep the original segmented control geometry", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const polishBlock = styles.slice(styles.lastIndexOf("/* Settings original parity:"));

  assert.match(polishBlock, /\.codex-plus-pro-compatibility-categories[\s\S]*grid-auto-flow:\s*row/);
  assert.match(polishBlock, /grid-auto-columns:\s*auto/);
  assert.match(polishBlock, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(polishBlock, /\.codex-plus-pro-compatibility-categories[\s\S]*padding:\s*2px/);
  assert.match(polishBlock, /\.codex-plus-pro-compatibility-category\s*\{[\s\S]*min-height:\s*32px/);
  assert.match(
    styles,
    /\.codex-plus-pro-compatibility-category:hover:not\(:disabled\):not\(\[data-selected="true"\]\)/,
  );
  assert.match(polishBlock, /\.codex-plus-pro-compatibility-category\[data-selected="true"\]/);
  assert.doesNotMatch(
    styles,
    /\.codex-plus-pro-compatibility-category\[data-selected="true"\]\s*:\s*hover/,
  );
  assert.match(polishBlock, /data-selected="true"\][\s\S]*var\(--codex-plus-accent, #b61f31\)/);
  assert.match(polishBlock, /\.codex-plus-pro-compatibility-status::before\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(polishBlock, /@media \(max-width: 700px\)[\s\S]*min-width:\s*92px/);
});

test("accent-specific settings rules leave compatibility tabs to their dedicated polish", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");

  assert.match(
    styles,
    /data-codex-plus-accent="aria"\][\s\S]*\.codex-plus-pro-settings-choice:hover:not\(:disabled\):not\(\.codex-plus-pro-compatibility-category\)/,
  );
  assert.match(
    styles,
    /data-codex-plus-accent="aria"\][\s\S]*\.codex-plus-pro-settings-choice\[data-selected="true"\]:not\(\.codex-plus-pro-compatibility-category\)/,
  );
  assert.match(
    styles,
    /data-codex-plus-accent="adaptive"\][\s\S]*\.codex-plus-pro-settings-choice:hover:not\(:disabled\):not\(\.codex-plus-pro-compatibility-category\)/,
  );
  assert.match(
    styles,
    /data-codex-plus-accent="adaptive"\][\s\S]*\.codex-plus-pro-settings-choice\[data-selected="true"\]:not\(\.codex-plus-pro-compatibility-category\)/,
  );
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
});

test("light blue actions separate label and icon contrast", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const buttonBlock = styles.slice(styles.lastIndexOf("/* Button contrast polish:"));

  assert.match(buttonBlock, /--codex-plus-action-bg:\s*color-mix\([\s\S]*54%/);
  assert.match(buttonBlock, /--codex-plus-action-bg-hover:\s*color-mix\([\s\S]*60%/);
  assert.match(
    buttonBlock,
    /--codex-plus-action-fg:\s*color-mix\([\s\S]*--codex-plus-accent-dark[\s\S]*22%[\s\S]*--color-token-text-primary/,
  );
  assert.match(
    buttonBlock,
    /--codex-plus-action-icon:\s*color-mix\([\s\S]*--codex-plus-accent-dark[\s\S]*42%[\s\S]*--color-token-text-primary/,
  );
  assert.match(
    buttonBlock,
    /button:is\([\s\S]*\):not\(:disabled\)\s+svg,\s*\n:root\[data-codex-pokedex-theme="on"\][\s\S]*\)\s*:\s*not\(:disabled\)\s+svg \*\s*\{[\s\S]*color:\s*var\(--codex-plus-action-icon\)/,
  );
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

test("settings surface preserves the original styling while the theme is enabled", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const settingsBlock = styles.slice(styles.lastIndexOf("/* Settings original parity:"));

  assert.match(settingsBlock, /\.codex-plus-pro-settings-popover[\s\S]*background:\s*var\(--token-main-surface-primary/);
  assert.match(settingsBlock, /background-image:\s*none\s*!important/);
  assert.match(settingsBlock, /-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(settingsBlock, /\.codex-plus-pro-settings-navigation-item\s*\{[\s\S]*min-height:\s*40px[\s\S]*border-radius:\s*6px/);
  assert.match(
    settingsBlock,
    /\.codex-plus-pro-settings-choices\s*\{[\s\S]*padding:\s*2px[\s\S]*border-radius:\s*6px[\s\S]*gap:\s*2px/,
  );
  assert.match(settingsBlock, /\.codex-plus-pro-settings-choice:not\([^\{]*\{[\s\S]*min-height:\s*32px[\s\S]*border-radius:\s*4px/);
  assert.match(settingsBlock, /data-selected="true"\][\s\S]*var\(--token-button-foreground[\s\S]*background:\s*var\(--codex-plus-accent/);
  assert.match(settingsBlock, /\.codex-plus-pro-settings-color-choice\[data-selected="true"\][\s\S]*rgb\(255 255 255 \/ 0\.72\)/);
  assert.match(settingsBlock, /\.codex-plus-pro-settings-wallpaper-preview[\s\S]*width:\s*132px[\s\S]*border-radius:\s*6px/);
  assert.match(settingsBlock, /\.codex-plus-pro-settings-logo-preview[\s\S]*width:\s*72px[\s\S]*height:\s*72px/);
  assert.match(settingsBlock, /codex-plus-pro-settings-upload/);
});

test("settings background follows the active theme without changing native control geometry", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const backgroundStart = styles.lastIndexOf("/* Settings themed background:");
  const backgroundEnd = styles.indexOf("/* Settings navigation hover:", backgroundStart);
  const backgroundBlock = styles.slice(
    backgroundStart,
    backgroundEnd === -1 ? styles.length : backgroundEnd,
  );

  assert.match(
    backgroundBlock,
    /\.codex-plus-pro-settings-popover[\s\S]*background-color:\s*var\(\s*--color-token-main-surface-primary/,
  );
  assert.match(backgroundBlock, /--codex-plus-accent[\s\S]*--codex-plus-highlight/);
  assert.match(backgroundBlock, /--codex-plus-accent-dark/);
  assert.match(backgroundBlock, /var\(--codex-pokedex-wallpaper\)/);
  assert.match(backgroundBlock, /\.codex-plus-pro-settings-header[\s\S]*background:/);
  assert.match(backgroundBlock, /\.codex-plus-pro-settings-navigation[\s\S]*background:/);
  assert.match(backgroundBlock, /\.codex-plus-pro-settings-content[\s\S]*background:/);
  assert.match(backgroundBlock, /\.codex-plus-pro-settings-footer[\s\S]*background:/);
  assert.doesNotMatch(backgroundBlock, /min-height|padding|width|height|grid-template|font-size/);
  assert.doesNotMatch(backgroundBlock, /\.codex-plus-pro-settings-choice/);
 });

test("settings navigation hover leaves the selected tab unchanged", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const hoverStart = styles.lastIndexOf("/* Settings navigation hover:");
  const hoverEnd = styles.indexOf("/* Sidebar navigation text parity:", hoverStart);
  const hoverBlock = styles.slice(
    hoverStart,
    hoverEnd === -1 ? styles.length : hoverEnd,
  );

  assert.match(
    hoverBlock,
    /\.codex-plus-pro-settings-navigation-item:hover:not\(\[aria-selected="true"\]\)/,
  );
  assert.match(hoverBlock, /color:\s*var\(--codex-plus-accent-dark/);
  assert.match(hoverBlock, /background:\s*color-mix\([\s\S]*--codex-plus-accent/);
  assert.match(hoverBlock, /box-shadow:\s*inset 0 0 0 1px/);
  assert.doesNotMatch(
    styles,
    /\.codex-plus-pro-settings-navigation-item\[aria-selected="true"\]:hover/,
  );
  assert.doesNotMatch(
    hoverBlock,
    /\.codex-plus-pro-settings-navigation-item\[aria-selected="true"\]:hover/,
  );
  assert.doesNotMatch(hoverBlock, /background-image:\s*linear-gradient/);
  assert.doesNotMatch(hoverBlock, /outline:/);
  assert.doesNotMatch(hoverBlock, /rgb\(48 35 30 \/ 0\.055\)/);
});

test("sidebar navigation text matches settings navigation contrast without strengthening subtitles", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const parityBlock = styles.slice(styles.lastIndexOf("/* Sidebar navigation text parity:"));

  assert.match(parityBlock, /\.app-shell-left-panel nav \.text-fade-truncate/);
  assert.match(parityBlock, /\.app-shell-left-panel nav \[data-thread-title="true"\]/);
  assert.match(
    parityBlock,
    /color:\s*var\(--color-token-text-secondary, var\(--token-text-secondary, rgb\(48 35 30 \/ 0\.66\)\)\) !important/,
  );
  assert.match(parityBlock, /data-thread-secondary-title="true"/);
  assert.match(
    parityBlock,
    /data-app-action-sidebar-thread-selected="true"[\s\S]*color:\s*var\(--color-token-text-primary, var\(--token-text-primary, #30231e\)\) !important/,
  );
  assert.match(parityBlock, /:not\(\[data-thread-secondary-title="true"\]\)/);
  assert.match(
    parityBlock,
    /\[data-thread-secondary-title="true"\][^{]*\{[\s\S]*color:\s*var\(--color-token-text-tertiary, rgba\(42 45 49 \/ 0\.54\)\) !important/,
  );
});

test("sidebar project labels and icons use settings navigation contrast", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const projectBlock = styles.slice(styles.lastIndexOf("/* Sidebar project rows:"));

  assert.match(projectBlock, /\[data-app-action-sidebar-project-row\]/);
  assert.match(projectBlock, /\[data-app-action-sidebar-select-project\]/);
  assert.match(
    projectBlock,
    /color:\s*var\(--token-text-secondary, rgb\(48 35 30 \/ 0\.66\)\) !important/,
  );
  assert.match(
    projectBlock,
    /\[data-app-action-sidebar-select-project\][\s\S]*svg[\s\S]*color:\s*color-mix\([\s\S]*--codex-plus-accent,/,
  );
  assert.match(projectBlock, /aria-current="page"/);
  assert.match(projectBlock, /data-app-action-sidebar-project-active="true"/);
  assert.match(
    projectBlock,
    /color:\s*var\(--token-text-primary, #30231e\) !important/,
  );
});

test("native terminal approval cards keep alert content from becoming a nested card", async () => {
  const styles = await fs.readFile(themeStylesPath, "utf8");
  const approvalBlock = styles.slice(styles.lastIndexOf("/* Native approval cards:"));

  assert.match(approvalBlock, /\[data-codex-approval-surface\]/);
  assert.match(approvalBlock, /--codex-plus-approval-surface/);
  assert.match(approvalBlock, /\[data-codex-approval-surface\]\s*\[role="alert"\][\s\S]*border:\s*0 !important/);
  assert.match(approvalBlock, /\[data-codex-approval-surface\] > div:first-child[\s\S]*--codex-plus-approval-header-surface/);
  assert.match(approvalBlock, /\[class~="font-mono"\]\[class\*="bg-surface-tertiary"\]/);
  assert.match(approvalBlock, /--codex-plus-approval-code-surface/);
  assert.match(approvalBlock, /\[data-codex-approval-surface\] > form[\s\S]*border-top:/);
  assert.match(approvalBlock, /button:last-child[\s\S]*--codex-plus-action-bg/);
  assert.match(approvalBlock, /\.electron-dark[\s\S]*data-codex-approval-surface/);
});

test("MCP approval cards style parameter rows without changing decision semantics", async () => {
  const [injector, styles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(themeStylesPath, "utf8"),
  ]);
  const approvalBlock = styles.slice(styles.lastIndexOf("/* Native approval cards:"));

  assert.match(injector, /data-codex-approval-mcp/);
  assert.match(approvalBlock, /\[data-codex-approval-mcp="on"\]/);
  assert.match(approvalBlock, /:has\(> div > :first-child \+ :last-child\)/);
  assert.match(approvalBlock, /grid-template-columns:\s*minmax\(72px, 96px\)/);
  assert.match(approvalBlock, /border-bottom:\s*1px solid/);
  assert.match(approvalBlock, /data-codex-approval-mcp="on"[\s\S]*--codex-plus-action-bg/);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);

test("compatibility checklist declares the four UI categories and stable item ids", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /const COMPATIBILITY_CHECKLIST_VERSION = "ui-compatibility-v1"/);
  for (const category of ["global", "conversation", "programming", "settings"]) {
    assert.match(source, new RegExp('key: "' + category + '"'));
  }
  for (const id of [
    "global.shell",
    "global.header",
    "global.sidebar",
    "global.status-surfaces",
    "global.scrollbars",
    "conversation.home-suggestions",
    "conversation.composer",
    "conversation.utility-bar",
    "conversation.thread-actions",
    "programming.editor",
    "programming.diff-preview",
    "programming.diff-file-row",
    "programming.run-status",
    "settings.entry",
    "settings.navigation",
    "settings.content",
    "settings.taskboard-service",
    "settings.version",
  ]) {
    assert.match(source, new RegExp('id: "' + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"'));
  }
});

test("compatibility evaluator is route-aware and guards selector drift", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  for (const statusKey of ["healthy", "degraded", "fallbackActive", "notObserved", "unsupported"]) {
    assert.match(source, new RegExp(statusKey));
  }
  assert.match(source, /const safeCompatibilityMatch = \(anchors\) =>/);
  assert.match(source, /document\.querySelectorAll\(anchor\.selector\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*compatibility selector skipped/);
  assert.match(source, /const evaluateCompatibilityItem = \(item\) =>/);
  assert.match(source, /status: "notObserved"/);
  assert.match(source, /const runCompatibilityChecks = \(\) =>/);
  assert.match(source, /repairAvailable: item\.repair === "reapply"/);
});

test("compatibility repairs use declared scoped fallback attributes", async () => {
  const [source, styles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8"),
  ]);

  for (const attribute of [
    "data-codex-plus-compat-sidebar",
    "data-codex-plus-compat-composer",
    "data-codex-plus-compat-diff-preview",
  ]) {
    assert.match(source, new RegExp(attribute));
    assert.match(styles, new RegExp(attribute + '="fallback"'));
  }
  assert.match(source, /const setCompatibilityFallback = \(item, enabled\) =>/);
  assert.match(source, /const runCompatibilityRepair = async \(itemId\) =>/);
  assert.match(source, /const runAllCompatibilityRepairs = async \(\) =>/);
  assert.match(source, /COMPATIBILITY_FALLBACK_ATTRIBUTES\.has\(attribute\)/);
  assert.match(styles, /data-codex-plus-compat-sidebar="fallback"[\s\S]*app-shell-left-panel:has\(nav\.sidebar-foreground-muted\)/);
  assert.match(styles, /data-codex-plus-compat-composer="fallback"[\s\S]*data-composer-utility-bar-scroll-area/);
  assert.match(styles, /data-codex-plus-compat-diff-preview="fallback"[\s\S]*group\/file-diff/);
  assert.doesNotMatch(styles, /data-codex-plus-compat-diff-preview="fallback"\)[\s\S]*\[class\*="h-full"\]\s*\{/);
});

test("compatibility settings UI exposes categorized detection and repair controls", async () => {
  const [source, styles] = await Promise.all([
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /const SETTINGS_UI_VERSION = "win-settings-scope-b2-1\.8\.6-taskboard-service-compatibility-v2"/);
  assert.match(source, /key: "compatibility", label: "界面兼容性", feature: "compatibility"/);
  for (const label of ["全部", "全局", "对话界面", "编程界面", "设置界面"]) {
    assert.match(source, new RegExp(label));
  }
  for (const marker of [
    "data-codex-plus-compatibility-panel",
    "data-compatibility-summary",
    "data-compatibility-action",
    "data-compatibility-category",
    "data-compatibility-item",
    "data-compatibility-item-check",
    "data-compatibility-item-repair",
    "notObservedCount",
    "unsupportedCount",
    "aria-live",
    "界面兼容性清单",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  for (const label of ["全部检测", "重新应用主题", "修复所有已知问题", "重新检测", "修复此项"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /if \(sectionKey === "compatibility"\) refreshCompatibilityPanel\(\)/);
  assert.match(source, /updateCompatibilityPanel\(\)/);
  assert.match(source, /action\.disabled = compatibilityState\.checking \|\| compatibilityState\.repairing/);
  assert.match(styles, /codex-plus-pro-compatibility-panel/);
  assert.match(styles, /codex-plus-pro-compatibility-item/);
  assert.match(
    styles,
    /\.codex-plus-pro-compatibility-categories[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 700px\)[\s\S]*\.codex-plus-pro-compatibility-categories[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;/,
  );
  assert.match(styles, /data-compatibility-status="notObserved"/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});

// Optional rendered checks: use an installed Playwright module, without adding
// a dependency to the Windows launcher. Set CODEX_PLUS_PLAYWRIGHT_PATH to its package.json.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createExtensionUpdatesUI } from "../source/extension-updates-ui.mjs";
import { ExtensionUpdateService, readMcpConfig } from "../source/extension-updates.mjs";

const { chromium } = process.env.CODEX_PLUS_PLAYWRIGHT_PATH
  ? createRequire(path.resolve(process.env.CODEX_PLUS_PLAYWRIGHT_PATH))("playwright")
  : await import("playwright");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "plus-extensions-browser-"));
const write = async (file, text) => { const full = path.join(root, file); await fs.mkdir(path.dirname(full), { recursive: true }); await fs.writeFile(full, text); };
const bundled = path.join(root, "Codex/resources/node_repl.exe").replaceAll("\\", "/");
const config = '[mcp_servers.rea]\ncommand="npx"\nargs=["rea-agents@6.3.0"]\n[mcp_servers.local-mcp]\ncommand="custom-mcp"\n' + `[mcp_servers.built-in]\ncommand=${JSON.stringify(bundled)}\n`;
await write(".codex/config.toml", config);
await write(".agents/skills/my-skill/SKILL.md", "---\nname: my-skill\ndescription: fixture\n---\n");
await write(".codex/skills/.system/built-in/SKILL.md", "---\nname: built-in\n---\n");
await write(".codex/plugins/cache/openai-bundled/helper/1.0.0/skills/helper/SKILL.md", "---\nname: built-in-plugin\n---\n");
let offline = false;
const service = new ExtensionUpdateService({ home: root, codexHome: path.join(root, ".codex"), statePath: path.join(root, "plus/updates.json"), fetcher: async url => {
  if (offline) throw new Error("offline");
  const data = url.includes("registry.npmjs.org") ? { version: "6.4.0", repository: { url: "https://github.com/example/rea" } }
    : url.includes("releases/") ? { body: "Improved MCP tools\n<script>window.untrusted = true</script>" }
      : url.includes("git/trees") ? { sha: "a".repeat(40), tree: [{ path: "SKILL.md", type: "blob", sha: "b".repeat(40) }] } : [];
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
} });
const browser = await chromium.launch({ channel: process.env.CODEX_PLUS_BROWSER_CHANNEL || "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
try {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  service.onState = payload => { page.evaluate(payload => window.__codexPlusProExtensionUpdateResult(payload), payload).catch(error => errors.push(error.message)); };
  await page.exposeFunction("__codexPlusProExtensionUpdates", async text => {
    try { const result = await service.handle(JSON.parse(text)); await page.evaluate(payload => window.__codexPlusProExtensionUpdateResult(payload), result); }
    catch (error) { await page.evaluate(payload => window.__codexPlusProExtensionUpdateResult(payload), service.snapshot("failed", error.message)); }
  });
  const css = (await fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8")) + "\n" + await fs.readFile(new URL("../source/extension-updates.css", import.meta.url), "utf8");
  await page.setContent('<!doctype html><html data-codex-pokedex-theme="on"><head><meta charset="utf-8"></head><body><button class="codex-plus-pro-settings-button">⚙</button><div class="codex-plus-pro-settings-popover"><div class="codex-plus-pro-settings-header"><strong>Codex Plus Pro</strong><span>设置</span></div><div class="codex-plus-pro-settings-body"><div class="codex-plus-pro-settings-navigation"><button class="codex-plus-pro-settings-navigation-item">主题</button><button class="codex-plus-pro-settings-navigation-item">模型栏</button><button class="codex-plus-pro-settings-navigation-item">宠物</button><button class="codex-plus-pro-settings-navigation-item">界面兼容性</button><button class="codex-plus-pro-settings-navigation-item" data-settings-section-target="extensions" aria-selected="true">扩展更新</button><button class="codex-plus-pro-settings-navigation-item" data-settings-section-target="version">版本</button></div><section class="codex-plus-pro-settings-content codex-plus-pro-settings-section"><h2>扩展更新</h2><div id="mount"></div></section></div></div></body></html>');
  await page.addStyleTag({ content: css });
  // Native Codex supplies these aliases; this isolated page supplies the same
  // bridge so existing Plus settings chrome is rendered in its real palette.
  await page.addStyleTag({ content: ':root { --token-text-primary: var(--color-token-text-primary); --token-text-secondary: var(--color-token-text-secondary); --token-border-light: var(--color-token-border-light); --token-main-surface-primary: var(--color-token-main-surface-primary); }' });
  await page.evaluate('window.fixtureUI=(' + createExtensionUpdatesUI.toString() + ')(window,document);document.getElementById("mount").appendChild(window.fixtureUI.createPanel());window.fixtureUI.refresh();');
  await page.locator("[data-extension-summary]").filter({ hasText: "3 项扩展" }).waitFor();
  assert.equal(await page.getByLabel("检查后自动更新（默认关闭）", { exact: true }).isChecked(), false);
  assert.equal(await page.getByText("built-in", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "客户端更新", exact: true }).count(), 0);
  await page.getByRole("button", { name: "检查全部", exact: true }).click();
  await page.locator('[data-extension-status="available"]').waitFor();
  assert.equal(await page.locator("[data-extension-update-badge]").textContent(), "1");
  assert.equal(await page.getByRole("link", { name: "GitHub 仓库 ↗", exact: true }).getAttribute("href"), "https://github.com/example/rea");
  assert.equal(await page.getByRole("link", { name: "更新入口 ↗", exact: true }).getAttribute("href"), "https://github.com/example/rea/releases/tag/v6.4.0");
  await page.getByText("版本发布说明", { exact: true }).click();
  assert.equal(await page.evaluate(() => window.untrusted), undefined);
  assert.match(await page.locator(".codex-plus-extension-notes pre").textContent(), /Improved MCP tools/);
  if (process.env.CODEX_PLUS_UI_ARTIFACT_DIR) {
    await fs.mkdir(process.env.CODEX_PLUS_UI_ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.CODEX_PLUS_UI_ARTIFACT_DIR, "extension-updates-light.png") });
    await page.evaluate(() => { document.documentElement.classList.add("electron-dark"); document.documentElement.setAttribute("data-theme", "dark"); });
    const background = await page.locator('[data-extension-status="available"]').evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(background, "rgba(255, 250, 240, 0.92)", "dark mode must use the themed surface");
    assert.equal(await page.locator('[data-extension-status="available"] .codex-plus-extension-version').evaluate(element => getComputedStyle(element).color), "rgb(244, 235, 227)");
    const actionColor = await page.getByRole("button", { name: "检查全部", exact: true }).evaluate(element => getComputedStyle(element).color);
    assert.notEqual(actionColor, "rgb(117, 21, 34)", "dark mode actions must retain readable contrast");
    await page.screenshot({ path: path.join(process.env.CODEX_PLUS_UI_ARTIFACT_DIR, "extension-updates-dark.png") });
  }
  assert.equal(await page.getByText("安装归属：独立安装 · 来源依据：启动参数", { exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await page.locator('[data-extension-update-state="pending-restart"]').waitFor();
  assert.equal(readMcpConfig(await fs.readFile(path.join(root, ".codex/config.toml"), "utf8")).servers[0].currentVersion, "6.4.0");
  await page.getByRole("button", { name: "回退上次更新", exact: true }).click();
  await page.locator('[data-extension-update-state="rolled-back"]').waitFor();
  assert.equal(readMcpConfig(await fs.readFile(path.join(root, ".codex/config.toml"), "utf8")).servers[0].currentVersion, "6.3.0");
  await page.getByLabel("检查后自动更新（默认关闭）", { exact: true }).check();
  await page.waitForFunction(() => document.querySelector("[data-extension-auto-update]").checked && !document.querySelector("[data-extension-auto-update]").disabled);
  await page.getByRole("button", { name: "检查全部", exact: true }).click();
  await page.locator('[data-extension-update-state="pending-restart"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-extension-list] [data-extension-operation="rollback"]')?.disabled === false);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "plus/updates.json"), "utf8")).autoUpdate, true);
  assert.equal(await page.locator("[data-extension-update-badge]").isHidden(), true);
  await page.getByText("更新记录", { exact: true }).click();
  assert.match(await page.locator("[data-extension-history-list]").textContent(), /重启 MCP 后生效/);
  if (process.env.CODEX_PLUS_UI_ARTIFACT_DIR) {
    await page.locator(".codex-plus-pro-settings-content").evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(process.env.CODEX_PLUS_UI_ARTIFACT_DIR, "extension-auto-update-dark.png") });
  }
  await page.getByLabel("检查后自动更新（默认关闭）", { exact: true }).uncheck();
  await page.waitForFunction(() => !document.querySelector("[data-extension-auto-update]").disabled);
  await page.getByRole("button", { name: "回退上次更新", exact: true }).click();
  await page.locator('[data-extension-update-state="rolled-back"]').waitFor();
  await page.getByRole("button", { name: "检查", exact: true }).first().click();
  await page.locator('[data-extension-status="available"]').waitFor();
  await page.locator("[data-extension-auto]").check();
  await page.waitForFunction(() => document.querySelector("[data-extension-auto]").checked && !document.querySelector("[data-extension-auto]").disabled);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "plus/updates.json"), "utf8")).autoCheck, true);
  const missingTab = page.getByRole("button", { name: "需补充 · 2", exact: true });
  await missingTab.waitFor({ timeout: 3000 });
  await missingTab.focus(); await missingTab.press("Enter");
  assert.equal(await missingTab.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("[data-extension-item]").count(), 2);
  assert.equal(await page.getByText("rea", { exact: true }).count(), 0);
  const missingSkill = page.locator("[data-extension-item]").filter({ has: page.getByText("my-skill", { exact: true }) });
  const missingMcp = page.locator("[data-extension-item]").filter({ has: page.getByText("local-mcp", { exact: true }) });
  assert.equal(await missingSkill.locator(".codex-plus-extension-source-editor").evaluate(element => element.open), true);
  assert.equal(await missingMcp.locator(".codex-plus-extension-source-editor").evaluate(element => element.open), true);
  assert.equal(await missingSkill.getByText("Skill · 未配置来源", { exact: true }).isVisible(), true);
  assert.equal(await missingMcp.getByText("MCP · 未配置来源", { exact: true }).isVisible(), true);
  await page.setViewportSize({ width: 620, height: 700 });
  assert.equal(await page.locator(".codex-plus-pro-settings-content").evaluate(element => element.scrollWidth > element.clientWidth), false);
  await page.setViewportSize({ width: 1100, height: 820 });
  if (process.env.CODEX_PLUS_UI_ARTIFACT_DIR) {
    await page.locator(".codex-plus-pro-settings-content").evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(process.env.CODEX_PLUS_UI_ARTIFACT_DIR, "extension-missing-sources-dark.png") });
    await page.evaluate(() => { document.documentElement.classList.remove("electron-dark"); document.documentElement.setAttribute("data-theme", "light"); });
    await page.screenshot({ path: path.join(process.env.CODEX_PLUS_UI_ARTIFACT_DIR, "extension-missing-sources-light.png") });
  }
  await missingSkill.getByLabel("公开 GitHub 仓库", { exact: true }).fill("https://token@github.com/example/skills");
  await missingSkill.getByRole("button", { name: "保存来源", exact: true }).click();
  await page.locator("[data-extension-message]").filter({ hasText: "凭证" }).waitFor();
  assert.equal(await missingSkill.getByLabel("公开 GitHub 仓库", { exact: true }).inputValue(), "https://token@github.com/example/skills");
  assert.equal(await page.getByRole("button", { name: "需补充 · 2", exact: true }).count(), 1);
  await missingSkill.getByLabel("公开 GitHub 仓库", { exact: true }).fill("example/skills");
  await missingSkill.getByRole("button", { name: "保存来源", exact: true }).click();
  await page.getByRole("button", { name: "需补充 · 1", exact: true }).waitFor();
  assert.equal(await missingSkill.count(), 0);
  assert.equal(await page.locator("[data-extension-item]").count(), 1);
  assert.match(await page.locator("[data-extension-summary]").textContent(), /1 项需补充来源/);
  await page.getByRole("button", { name: "Skills · 1", exact: true }).click();
  assert.equal(await page.getByRole("link", { name: "GitHub 仓库 ↗", exact: true }).getAttribute("href"), "https://github.com/example/skills");
  await page.getByRole("button", { name: "检查", exact: true }).click();
  await page.locator('[data-extension-status="different"]').waitFor();
  assert.equal(await page.getByRole("link", { name: "GitHub 仓库 ↗", exact: true }).getAttribute("href"), "https://github.com/example/skills");
  assert.equal(await page.getByRole("link", { name: "更新入口 ↗", exact: true }).getAttribute("href"), "https://github.com/example/skills/commits/HEAD");
  await page.getByLabel("公开 GitHub 仓库", { exact: true }).fill("https://token@github.com/example/skills");
  await page.getByRole("button", { name: "保存来源", exact: true }).click();
  await page.locator("[data-extension-message]").filter({ hasText: "凭证" }).waitFor();
  assert.equal(await page.getByLabel("公开 GitHub 仓库", { exact: true }).inputValue(), "https://token@github.com/example/skills");
  await page.getByRole("button", { name: "恢复自动识别", exact: true }).click();
  await page.getByRole("button", { name: "需补充 · 2", exact: true }).click();
  assert.equal(await page.locator("[data-extension-item]").count(), 2);
  await missingSkill.getByLabel("公开 GitHub 仓库", { exact: true }).fill("example/skills");
  await missingSkill.getByRole("button", { name: "保存来源", exact: true }).click();
  await page.getByRole("button", { name: "需补充 · 1", exact: true }).waitFor();
  await missingMcp.getByLabel("公开 GitHub 仓库", { exact: true }).fill("example/local-mcp");
  await missingMcp.getByRole("button", { name: "保存来源", exact: true }).click();
  await page.getByRole("button", { name: "需补充 · 0", exact: true }).waitFor();
  assert.equal(await page.locator("[data-extension-item]").count(), 0);
  assert.equal(await page.getByText("暂无需要补充来源的扩展。", { exact: true }).isVisible(), true);
  offline = true;
  await page.getByRole("button", { name: "MCP · 2", exact: true }).click();
  await page.locator("[data-extension-item]").filter({ has: page.getByText("rea", { exact: true }) }).getByRole("button", { name: "检查", exact: true }).click();
  await page.locator('[data-extension-status="failed"]').waitFor();
  assert.match(await page.locator('[data-extension-status="failed"] .codex-plus-extension-version').textContent(), /6.4.0/);
  assert.equal(await page.locator("[data-extension-update-badge]").isHidden(), true);
  // Missing bridge is recoverable, rather than leaving all controls disabled.
  await page.evaluate(() => { window.fixtureBinding = window.__codexPlusProExtensionUpdates; window.__codexPlusProExtensionUpdates = undefined; });
  await page.getByRole("button", { name: "重新扫描", exact: true }).click();
  await page.locator("[data-extension-message]").filter({ hasText: "入口未连接" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "重新扫描", exact: true }).isEnabled(), true);
  await page.evaluate(() => { window.__codexPlusProExtensionUpdates = window.fixtureBinding; });
  await page.getByRole("button", { name: "重新扫描", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-extension-message]').hidden);
  await page.setViewportSize({ width: 620, height: 700 });
  assert.equal(await page.locator(".codex-plus-pro-settings-content").evaluate(element => element.scrollWidth > element.clientWidth), false);
  assert.deepEqual(readMcpConfig(await fs.readFile(path.join(root, ".codex/config.toml"), "utf8")), readMcpConfig(config));
  assert.deepEqual(errors, []);
  console.log("Rendered extension checks passed: discovery, auto/manual update, rollback, history, provenance, notes escaping, badges, preferences, missing-source list, source mapping, validation recovery, offline recovery, narrow layout.");
} finally { await browser.close(); await fs.rm(root, { recursive: true, force: true }); }

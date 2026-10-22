// Render the native approval hierarchy with its layout utilities, then apply
// the complete Plus stylesheet. Use an existing Playwright installation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = process.env.CODEX_PLUS_PLAYWRIGHT_PATH
  ? createRequire(path.resolve(process.env.CODEX_PLUS_PLAYWRIGHT_PATH))("playwright")
  : await import("playwright");
const css = await fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8");
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const params = [
  ["localPath", "E:\\dev\\HCIA-Datacom\\deploy\\compose.bookworm.yml"],
  ["remotePath", "/opt/hcia/HCIA-Datacom/deploy/compose.bookworm.yml"],
  ["sessionId", "44566ec6-61b9-44ee-b5e2-fe71ec7c2c86"],
];
// ApprovalRequestCard > body > alert + details. Current DetailRow renders
// dl > div > dt + dd; older versions render div > label + value instead.
const row = ([name, value], legacy) => legacy
  ? `<div class="flex items-center gap-3"><div class="text-secondary">${name}</div><div class="min-w-0 wrap-anywhere whitespace-pre-wrap">${escape(value)}</div></div>`
  : `<dl class="@container"><div class="grid items-start gap-3 leading-5"><dt class="flex min-w-0 items-center text-codex-description">${name}</dt><dd class="m-0 flex min-w-0 items-center wrap-anywhere text-default"><div class="relative min-w-0"><div class="min-w-0 break-words whitespace-pre-wrap">${escape(value)}</div></div></dd></div></dl>`;
const card = ({ legacy = false, entries = params } = {}) => `<section class="approval flex flex-col" data-codex-approval-surface="on" data-codex-approval-mcp="on">
  <div class="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto px-4 pt-4 pb-3">
    <div aria-atomic="true" role="alert"><div class="flex min-w-0 flex-col gap-2">
      <div class="flex items-center gap-2 font-normal text-secondary"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3v3H8v4h3v3l5-5-5-5Z"/></svg><span>Netcatty External</span></div>
      <div class="flex min-w-0 flex-col"><div class="min-w-0 wrap-anywhere font-medium text-default leading-5">Allow the netcatty-external MCP server to run tool "sftp-upload"?</div></div>
    </div></div>
    ${entries.length ? `<div class="flex flex-col gap-1">${entries.map(entry => row(entry, legacy)).join("")}</div>` : ""}
  </div>
  <form class="flex shrink-0 items-center gap-2 px-4 pt-2 pb-4">
    <button id="always" type="button"><span>始终允许</span></button>
    <div class="ms-auto flex min-w-0 items-center gap-2">
      <button id="deny" type="button">拒绝 <kbd>Esc</kbd></button>
      <div class="split flex min-w-0 items-center"><button id="once" type="button"><span>允许一次</span> <kbd>↵</kbd></button><button id="scope" type="button" aria-label="授权选项" aria-haspopup="menu" aria-expanded="false">⌄</button></div>
    </div>
  </form>
</section>`;
const utilities = `
  *{box-sizing:border-box}body{margin:0;padding:32px;background:#eef4fa;font:14px/1.5 "Segoe UI",system-ui,sans-serif}main{width:740px;max-width:100%;margin:auto}
  .approval{max-height:560px}button{font:inherit;border:1px solid #bac6d2;padding:5px 10px;white-space:nowrap;background:transparent;cursor:pointer}button:focus-visible{outline:2px solid var(--codex-plus-accent);outline-offset:-3px}kbd{font:11px monospace;opacity:.7}
  .split{overflow:hidden;border-radius:9px}.split>button:first-child{border-radius:9px 0 0 9px}.split>button:last-child{border-radius:0 9px 9px 0;padding-inline:8px}
  .flex{display:flex}.grid{display:grid;grid-template-columns:120px minmax(0,1fr)}.flex-col{flex-direction:column}.items-center{align-items:center}.items-start{align-items:start}.min-w-0{min-width:0}.min-h-0{min-height:0}.shrink-0{flex-shrink:0}.ms-auto{margin-inline-start:auto}.m-0,dl{margin:0}.gap-1{gap:4px}.gap-2{gap:8px}.gap-3{gap:12px}.px-4{padding-inline:16px}.pt-4{padding-top:16px}.pt-2{padding-top:8px}.pb-3{padding-bottom:12px}.pb-4{padding-bottom:16px}.overflow-y-auto{overflow-y:auto}.wrap-anywhere{overflow-wrap:anywhere}.whitespace-pre-wrap{white-space:pre-wrap}.leading-5{line-height:20px}.font-medium{font-weight:500}.text-secondary,.text-codex-description{color:var(--color-token-text-secondary)}.text-default{color:var(--color-token-text-primary)}
`;
const documentHtml = options => `<!doctype html><html lang="zh-CN" data-codex-pokedex-theme="on" data-codex-plus-accent="aria" style="--codex-plus-accent:#3b82c4;--codex-plus-accent-dark:#1e4f8c;--codex-plus-highlight:#7eb8e8" class="electron-light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP 授权排版预览</title><style>${utilities}</style><style>${css}</style></head><body><main>${card(options)}</main></body></html>`;
const artifactDir = process.env.CODEX_PLUS_UI_ARTIFACT_DIR;
if (artifactDir) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, "mcp-approval-preview.html"), documentHtml());
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 }, reducedMotion: "reduce" });
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  let checks = 0;
  for (const legacy of [false, true]) {
    for (const dark of [false, true]) {
      await page.setContent(documentHtml({ legacy }));
      await page.evaluate(dark => {
        document.documentElement.classList.toggle("electron-dark", dark);
        document.documentElement.classList.toggle("electron-light", !dark);
      }, dark);
      // Finish theme transitions before measuring colors or capturing evidence.
      await page.locator(".approval").evaluate(element => {
        getComputedStyle(element).color;
        for (const animation of element.getAnimations({ subtree: true })) animation.finish();
      });
      if (artifactDir && !legacy) await page.screenshot({ path: path.join(artifactDir, `mcp-approval-${dark ? "dark" : "light"}.png`), animations: "disabled" });
      const bounds = await page.locator(".approval").evaluate(surface => {
        const rect = element => {
          const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
          return { x, y, width, height, bottom, right };
        };
        const body = surface.firstElementChild;
        const alert = surface.querySelector('[role="alert"]');
        const details = body.children[1];
        const rows = [...details.children].map(child => child.matches("dl") ? child.firstElementChild : child);
        return {
          surface: rect(surface), alert: rect(alert), details: rect(details),
          rows: rows.map(row => ({ label: rect(row.firstElementChild), value: rect(row.lastElementChild) })),
          buttons: [...surface.querySelectorAll("form button")].map(rect),
          footer: rect(surface.querySelector("form")),
        };
      });
      assert.ok(bounds.alert.width >= bounds.surface.width - 40, "MCP explanation must span the card instead of the old 96px parameter column");
      assert.ok(bounds.details.y >= bounds.alert.bottom + 8, "parameters must follow the explanation");
      for (const row of bounds.rows) {
        assert.ok(row.value.x >= row.label.right, "argument labels and values must not overlap");
        assert.ok(row.value.width >= bounds.details.width * .6, "argument values must retain reading room");
      }
      for (const button of bounds.buttons) {
        assert.ok(button.y >= bounds.footer.y && button.bottom <= bounds.footer.bottom, "footer must contain every action");
        assert.ok(button.x >= bounds.surface.x && button.right <= bounds.surface.right, "actions must not clip");
      }
      assert.ok(Math.abs(bounds.buttons[0].y - bounds.buttons[1].y) < 2, "leading and decision actions must align");
      assert.ok(Math.abs(bounds.buttons[2].right - bounds.buttons[3].x) < 1, "allow action and scope toggle must stay joined");
      const colors = await page.locator("form button").evaluateAll(buttons => buttons.map(button => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        const pixel = color => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data];
        };
        const blend = (front, back) => front.slice(0, 3).map((value, i) => value * front[3] / 255 + back[i] * (1 - front[3] / 255));
        const ancestors = [];
        for (let node = button; node; node = node.parentElement) ancestors.unshift(node);
        let background = [255, 255, 255];
        for (const node of ancestors) background = blend(pixel(getComputedStyle(node).backgroundColor), background);
        const foreground = blend(pixel(getComputedStyle(button).webkitTextFillColor), background);
        const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
        const a = luminance(background), b = luminance(foreground);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      }));
      assert.ok(colors.every(contrast => contrast >= 4.5), "both theme states must keep action labels readable");
      checks++;
    }
  }
  // Long paths, a long parameter name, and multiline values must wrap without
  // widening the card; a tall details area must leave decisions accessible.
  for (const width of [740, 560]) {
    await page.setContent(documentHtml({ entries: [
      ["veryLongParameterNameWithoutSpaces".repeat(2), "/opt/" + "long-project-name/".repeat(20)],
      ["payload", '{\n  "description": "' + "A".repeat(300) + '"\n}'],
      ...Array.from({ length: 20 }, (_, i) => ["argument" + i, "value " + i]),
    ] }));
    await page.locator("main").evaluate((element, width) => { element.style.width = width + "px"; }, width);
    const overflow = await page.locator(".approval").evaluate(surface => ({
      card: surface.scrollWidth > surface.clientWidth + 1,
      body: surface.firstElementChild.scrollWidth > surface.firstElementChild.clientWidth + 1,
      scrolls: surface.firstElementChild.scrollHeight > surface.firstElementChild.clientHeight,
    }));
    assert.deepEqual(overflow, { card: false, body: false, scrolls: true });
    for (const id of ["always", "deny", "once", "scope"]) assert.equal(await page.locator("#" + id).isVisible(), true);
    checks++;
  }
  await page.setContent(documentHtml({ entries: [] }));
  assert.equal(await page.locator('[role="alert"]').count(), 1);
  assert.equal(await page.locator("form button").count(), 4);
  await page.evaluate(() => {
    window.actions = [];
    document.querySelector("form").addEventListener("submit", event => { event.preventDefault(); window.actions.push("submit"); });
    for (const button of document.querySelectorAll("form button")) button.addEventListener("click", () => window.actions.push(button.id));
  });
  await page.locator("#always").focus();
  for (const id of ["always", "deny", "once", "scope"]) {
    assert.equal(await page.evaluate(() => document.activeElement.id), id, "native action order must remain intact");
    await page.keyboard.press("Tab");
  }
  for (const id of ["deny", "once", "scope"]) await page.locator("#" + id).click();
  assert.deepEqual(await page.evaluate(() => window.actions), ["deny", "once", "scope"]);
  assert.deepEqual(failures, []);
  console.log(`MCP approval rendered checks passed (${checks} layout/theme cases, empty parameters, native action focus/clicks).`);
} finally {
  await browser.close();
}

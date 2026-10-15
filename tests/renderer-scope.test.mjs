import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createExtensionUpdatesUI } from "../source/extension-updates-ui.mjs";

const source = await fs.readFile(new URL("../source/injector.mjs", import.meta.url), "utf8");
const accentOptions = vm.runInNewContext("(" + source.match(/const ACCENT_OPTIONS = (\{[\s\S]*?\n\});/)[1] + ")");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const policy = source.includes("function isCodexAppDocument(") ? section("function isCodexAppDocument(", "function isInjectableTarget(") : "";
const factory = (body, expression) => vm.runInNewContext(policy + body + "\n" + expression, {
  URL, hostVersionInfo: {}, WINDOWS_SCOPE_A_VERSION: "test", ACCENT_OPTIONS: accentOptions, createExtensionUpdatesUI, TINY_JPEG: "tiny-jpeg", TINY_PNG: "tiny-png", log() {},
});
const aboutUrl = "data:text/html;charset=utf-8," + encodeURIComponent('<html><title>关于 ChatGPT</title><button>确定</button></html>');
const mainUrl = "app://-/index.html";

test("renderer target selection excludes native dialogs, webviews and external pages", () => {
  const select = factory(section("function isInjectableTarget(", "async function connectToBrowser("), "isInjectableTarget");
  for (const url of [aboutUrl, "file:///C:/Codex/about.html", "app://-/about.html", "app://external/index.html", "https://chatgpt.com", "https://openai.com", "https://example.invalid", "codex-sandbox://app/", "about:blank", ""]) {
    assert.equal(select({ targetId: "dialog", type: "page", title: "ChatGPT", url }), false, url.slice(0, 100));
  }
  for (const url of [mainUrl, mainUrl + "?initialRoute=%2Favatar-overlay", mainUrl + "?initialRoute=%2Fhotkey-window", "app://-/detached-window.html?initialRoute=%2Fdetached-window"]) {
    assert.equal(select({ targetId: "workspace", type: "page", title: "Conversation title", url }), true, url);
  }
  assert.equal(select({ targetId: "worker", type: "worker", url: mainUrl }), false);
});

test("new-document registration also excludes pet notification scripts in native dialogs", async () => {
  const start = source.indexOf("async function attachToPageTarget(");
  const bootstrap = source.slice(start, source.indexOf("  const refreshPageTheme =", start)) + "}";
  let registered;
  // The runtime's own guard is covered above; this exercises the independent
  // pet script at the actual new-document delivery seam.
  const browser = { send: async (method, params) => { if (method === "Page.addScriptToEvaluateOnNewDocument") registered = params.source; return {}; } };
  // Supply an inert runtime so only the separately registered pet script is tested.
  const petOnly = vm.runInNewContext(policy + bootstrap + "\nattachToPageTarget", {
    pageSessions: new Map(), pageTargetsBySessionId: new Map(), buildInjectionSource: () => "",
    petNotificationsSource: "throw new Error('unexpected pet decoration')", startupSource: "", invalidatePageSession() {},
  });
  await petOnly(browser, { targetId: "initial-blank-window" }, "session");
  assert.doesNotThrow(() => vm.runInNewContext(registered, { URL, location: new URL(aboutUrl) }));
  assert.throws(() => vm.runInNewContext(registered, { URL, location: new URL(mainUrl) }), /unexpected pet decoration/);
});

test("native dialogs do not initialize settings or subscribe to document readiness", () => {
  const runtime = factory(section("function buildInjectionSource(css)", "function buildBootstrapSource("), 'buildInjectionSource("body{background:red}")');
  for (const url of [aboutUrl, "file:///C:/Codex/about.html", "https://chatgpt.com", "about:blank"]) {
    let listeners = 0;
    const result = vm.runInNewContext(runtime, { URL, location: new URL(url), document: { documentElement: null, addEventListener() { listeners++; } } });
    assert.equal(listeners, 0, "native documents must not schedule decoration initialization");
    assert.equal(result?.active, false);
  }
});

test("wallpaper assets never modify native dialog documents", () => {
  const assets = factory(section("function buildThemeAssetSource(", "async function applyThemeAssets("), 'buildThemeAssetSource("data:image/png;base64,wallpaper","data:image/png;base64,logo")');
  let mutations = 0;
  const result = vm.runInNewContext(assets, {
    URL, location: new URL(aboutUrl), window: {}, localStorage: { getItem: () => null },
    document: { documentElement: { style: { setProperty() { mutations++; } } }, getElementById: () => null },
  });
  assert.equal(mutations, 0);
  assert.equal(result?.excluded, true);
});

for (const fallback of [false, true]) {
  test("CSS delivery skips a document that navigated outside Codex" + (fallback ? " during the chunk fallback" : ""), async () => {
    const apply = factory(section("async function applyCssInChunks(", "// Original mac settings/runtime UI"), "applyCssInChunks");
    let mutations = 0, calls = 0;
    const styles = new Map();
    const document = {
      getElementById: id => styles.get(id),
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild(node) { mutations++; styles.set(node.id, node); } },
    };
    const context = vm.createContext({ URL, document, location: new URL(mainUrl) });
    const send = async (_method, params) => {
      if (fallback && ++calls === 1) throw new Error("CDP payload rejected before evaluation");
      return { result: { value: vm.runInContext(params.expression, context) } };
    };
    await apply(send, "body{color:blue}");
    assert.equal(mutations, 1, "workspace CSS must still load");
    context.location = new URL(aboutUrl);
    styles.clear(); mutations = 0; calls = 0;
    await apply(send, "body{background:red}");
    assert.equal(mutations, 0, "delivery must check the current document, even with stale target metadata");
    assert.equal(styles.size, 0);
  });
}

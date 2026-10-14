import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createExtensionUpdatesUI } from "../source/extension-updates-ui.mjs";

const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const themeStylesPath = new URL("../source/theme.css", import.meta.url);

test("renderer injection waits for a document node before initializing decorations", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");
  const documentPolicy = source.slice(source.indexOf("function isCodexAppDocument("), source.indexOf("function isInjectableTarget("));
  const factorySource = source.slice(
    source.indexOf("function buildInjectionSource(css)"),
    source.indexOf("function buildBootstrapSource()"),
  );
  const injection = vm.runInNewContext(`${documentPolicy}\n${factorySource}\nbuildInjectionSource("")`, {
    hostVersionInfo: {},
    WINDOWS_SCOPE_A_VERSION: "test",
    createExtensionUpdatesUI,
  });
  const listeners = [];
  const observedNodes = [];
  const document = {
    documentElement: null,
    body: null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ textContent: "" }),
    addEventListener: (type, callback, options) => listeners.push({ type, callback, options }),
  };
  assert.doesNotThrow(() => vm.runInNewContext(injection, {
    document,
    URL,
    HTMLElement: class {},
    location: new URL("app://-/index.html?initialRoute=%2Favatar-overlay"),
    window: { addEventListener: () => {}, requestAnimationFrame: () => 1 },
    localStorage: {
      getItem: (key) => key === "codex-plus-pro-settings-v1"
        ? JSON.stringify({ theme: false, modelPicker: false, pet: false }) : null,
    },
    BroadcastChannel: class { addEventListener() {} postMessage() {} },
    MutationObserver: class {
      disconnect() {}
      observe(node) {
        assert.ok(node, "MutationObserver requires an existing document node");
        observedNodes.push(node);
      }
    },
  }));
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, "DOMContentLoaded");
  assert.equal(typeof listeners[0].callback, "function");
  assert.equal(listeners[0].options.once, true);
  assert.deepEqual(observedNodes, []);
  document.documentElement = {
    getAttribute: () => null,
    setAttribute: () => {},
    removeAttribute: () => {},
    appendChild: () => {},
    style: { setProperty: () => {}, removeProperty: () => {} },
    classList: { contains: () => false, add: () => {}, remove: () => {} },
  };
  assert.equal(listeners[0].callback().active, true);
  assert.deepEqual(observedNodes, [document.documentElement]);
});

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

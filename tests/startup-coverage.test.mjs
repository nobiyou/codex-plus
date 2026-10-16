import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { buildStartupSource } from "../source/startup-splash.mjs";
import { parseStartupTimingEvent } from "../source/startup-timing.mjs";

const css = await fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8");
const injector = await fs.readFile(new URL("../source/injector.mjs", import.meta.url), "utf8");
const accentOptions = vm.runInNewContext("(" + injector.match(/const ACCENT_OPTIONS = (\{[\s\S]*?\n\});/)[1] + ")");
const documentPolicy = injector.slice(injector.indexOf("function isCodexAppDocument("), injector.indexOf("function isInjectableTarget("));
const assetFactory = injector.slice(injector.indexOf("function buildThemeAssetSource("), injector.indexOf("async function applyThemeAssets("));
const assetSource = vm.runInNewContext(`${documentPolicy}\n${assetFactory}\nbuildThemeAssetSource("data:image/png;base64,default-wall", "data:image/png;base64,default-logo", { aria: {wallpaper: "data:image/png;base64,blue-wall", logo: "data:image/png;base64,blue-logo"}})`, { TINY_JPEG: "tiny-jpeg", TINY_PNG: "tiny-png" });

const INTRO_MS = 6400;
const timingKey = "codex-plus-pro-startup-timing-v1";
const epoch = 1792120000000;
const observation = (visibleReadyMs, overrides = {}) => ({ readyAt: epoch, launcherMs: visibleReadyMs + 2000, rendererMs: visibleReadyMs, visibleReadyMs, hiddenMs: 0, introMs: INTRO_MS, overlayMs: Math.max(INTRO_MS, visibleReadyMs) + 180, ...overrides });

function fixture({ history, launcherStartedAt = epoch - 2000, navigationType = "navigate", storageBlocked = false, route = "", theme = true, parsing = false, loader = true, react = false, accent = "aria", custom = false, reduced = false, hidden = false } = {}) {
  const styles = [];
  const splashes = [];
  const properties = new Map();
  const attributes = new Map();
  const root = { setAttribute: (key, value) => attributes.set(key, value), getAttribute: (key) => attributes.get(key), hasAttribute: (key) => attributes.has(key), classList: { toggle() {} }, style: { setProperty: (key, value) => properties.set(key, value) }, appendChild: (node) => {
    node.parentNode = root;
    (node.tag === "style" ? styles : splashes).push(node);
    if (node.tag === "div" && !motion.matches && node.getAttribute("data-playback") !== "paused") motionEndsAt = now + INTRO_MS - 400;
  } };
  const nativeLoader = { isConnected: loader, children: ["native-logo"], removeAttribute() {}, replaceChildren(...children) { this.children = children; } };
  const reactLoader = { isConnected: react };
  const content = { kind: loader || react ? "empty" : "workspace" };
  const contentNode = {
    closest: () => content.kind === "chrome" ? {} : null,
    getClientRects: () => content.kind === "hidden" ? [] : [{}],
  };
  const appRoot = { querySelectorAll: () => ["empty", "blank", "loading-text"].includes(content.kind) ? [] : [contentNode] };
  const listeners = new Map();
  const frames = new Map();
  const timers = new Map();
  let now = 0;
  let motionEndsAt = null;
  let motionRemaining = INTRO_MS - 400;
  let timerId = 0;
  let frameId = 0;
  let observer;
  const motion = { matches: reduced, addEventListener: (_type, callback) => listeners.set("motion", callback), removeEventListener: () => listeners.delete("motion") };
  const window = {
    matchMedia: query => query.includes("reduced-motion") ? motion : { matches: false },
    addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: (type) => listeners.delete(type),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++timerId, { at: now + delay, callback }); return timerId; }, clearTimeout: id => timers.delete(id),
  };
  const document = {
    hidden,
    readyState: parsing ? "loading" : "complete", documentElement: parsing ? null : root, head: root, body: root,
    getElementById: (id) => id === "root" ? appRoot : null,
    querySelector: (selector) => nativeLoader.isConnected && selector.includes(".startup-loader") ? nativeLoader : reactLoader.isConnected && selector.includes("_delayedBlossom_") ? reactLoader : null,
    addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: (type) => listeners.delete(type),
    createElement: (tag) => ({ tag, style: { setProperty() {} }, removed: false, attributes: new Map(), listeners: new Map(), addEventListener(type, callback) { this.listeners.set(type, callback); }, removeEventListener(type) { this.listeners.delete(type); }, setAttribute(key, value) {
      this.attributes.set(key, value);
      if (key === "data-intro-ms") motionRemaining = Number(value) - 400;
      if (key === "data-playback" && !motion.matches) {
        if (value === "running" && motionEndsAt === null) motionEndsAt = now + motionRemaining;
        else if (value === "paused" && motionEndsAt !== null) { motionRemaining = motionEndsAt - now; motionEndsAt = null; }
      }
    }, removeAttribute(key) { this.attributes.delete(key); }, getAttribute(key) { return this.attributes.get(key); }, getAnimations: () => [{ updatePlaybackRate(rate) { if (motionEndsAt !== null) motionEndsAt = now + (motionEndsAt - now) / rate; } }], remove() { this.removed = true; } }),
  };
  const saved = new Map([
    ["codex-plus-pro-settings-v1", JSON.stringify({ theme, accent, wallpaperMode: custom ? "custom" : "default", logoMode: custom ? "custom" : "default" })],
    ["codex-plus-pro-wallpaper-v1", "data:image/png;base64,custom-wall"],
    ["codex-plus-pro-logo-v1", "data:image/png;base64,custom-logo"],
  ]);
  if (history) saved.set(timingKey, JSON.stringify({ version: 1, samples: history }));
  const logs = [];
  const source = buildStartupSource({ css, assetSource, accentOptions, launcherStartedAt });
  const context = vm.createContext({ window, document, URL, console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) }, performance: { now: () => now, timeOrigin: epoch, getEntriesByType: () => [{ type: navigationType }] }, location: new URL(`app://-/index.html${route ? `?initialRoute=${encodeURIComponent(route)}` : ""}`), localStorage: { getItem: (key) => { if (storageBlocked) throw Error("blocked"); return saved.get(key) || null; }, setItem: (key, value) => saved.set(key, value) }, MutationObserver: class { constructor(callback) { observer = this; this.callback = callback; } observe() { this.active = true; } disconnect() { this.active = false; } } });
  const paint = () => { const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(); };
  const run = (paintFirstFrame = true) => {
    vm.runInContext(source, context);
    if (paintFirstFrame) { paint(); paint(); }
  };
  const advance = milliseconds => {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (motionEndsAt !== null && motionEndsAt <= end && (!next || motionEndsAt <= next[1].at)) {
        now = motionEndsAt;
        motionEndsAt = null;
        motionRemaining = 0;
        splashes[0]?.listeners.get("animationend")?.({ animationName: "codex-plus-startup-wallpaper" });
        continue;
      }
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      timers.delete(id);
      timer.callback();
    }
    now = end;
  };
  const visibility = hidden => { document.hidden = hidden; listeners.get("visibilitychange")?.(); };
  return { window, document, nativeLoader, reactLoader, content, styles, splashes, properties, attributes, listeners, saved, logs, run, mutate: () => { if (observer?.active) observer.callback(); }, paint, frames, timers, advance, visibility, delayMotion: milliseconds => { motionEndsAt += milliseconds; }, reduceMotion: () => { motion.matches = true; motionEndsAt = null; listeners.get("motion")?.(); }, observing: () => observer?.active, root };
}

test("actual readiness is recorded before the intro hold and reused on a subsequent launch", () => {
  const f = fixture();
  f.run();
  f.advance(1000);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate(); f.paint(); f.paint();
  assert.equal(f.saved.has(timingKey), false, "do not save a run before a successful reveal");
  f.advance(INTRO_MS - 1000); f.paint(); f.paint(); f.advance(180);
  const saved = JSON.parse(f.saved.get(timingKey));
  assert.deepEqual(saved.samples, [observation(1000, { readyAt: epoch + 1000, overlayMs: INTRO_MS + 180 })]);
  assert.equal(f.logs.filter(args => args[0] === timingKey).length, 1);
  assert.deepEqual(JSON.parse(f.logs.find(args => args[0] === timingKey)[1]), saved.samples[0]);
  const next = fixture({ history: saved.samples });
  next.run();
  assert.equal(next.splashes[0].getAttribute("data-intro-ms"), "5000");
});

test("history adjusts the entrance but does not place a deadline on a slow workspace", () => {
  const f = fixture({ history: [observation(8000)] });
  f.run();
  assert.equal(f.splashes[0].getAttribute("data-intro-ms"), "7250");
  f.advance(7249);
  assert.equal(f.splashes[0].getAttribute("data-waiting"), undefined);
  f.advance(1);
  assert.equal(f.splashes[0].getAttribute("data-waiting"), "true");
  f.advance(15000);
  assert.equal(f.splashes[0].removed, false);
  assert.equal(JSON.parse(f.saved.get(timingKey)).samples.length, 1);
});

test("hidden time is measured separately and excluded from adaptive pacing", () => {
  const f = fixture();
  f.run(); f.advance(1000); f.visibility(true); f.advance(5000);
  f.visibility(false); f.paint(); f.paint(); f.advance(2000);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate(); f.paint(); f.paint();
  f.advance(INTRO_MS - 3000); f.paint(); f.paint(); f.advance(180);
  const saved = JSON.parse(f.saved.get(timingKey));
  assert.deepEqual(saved.samples, [observation(3000, { readyAt: epoch + 8000, rendererMs: 8000, launcherMs: 10000, hiddenMs: 5000, overlayMs: INTRO_MS + 5180 })]);
  const next = fixture({ history: saved.samples }); next.run();
  assert.equal(next.splashes[0].getAttribute("data-intro-ms"), String(INTRO_MS));
});

test("transient readiness is discarded when a loader returns", () => {
  const f = fixture(); f.run(); f.advance(1000);
  f.nativeLoader.isConnected = false; f.content.kind = "workspace";
  f.mutate(); f.paint(); f.paint();
  f.advance(1000); f.reactLoader.isConnected = true; f.mutate();
  f.advance(6000); f.reactLoader.isConnected = false;
  f.mutate(); f.paint(); f.paint(); f.advance(180);
  assert.equal(JSON.parse(f.saved.get(timingKey)).samples[0].visibleReadyMs, 8000);
});

test("aborted and reloaded documents do not train successful startup history", () => {
  const aborted = fixture(); aborted.run(); aborted.advance(1000);
  aborted.nativeLoader.isConnected = false; aborted.content.kind = "workspace";
  aborted.mutate(); aborted.paint(); aborted.paint();
  aborted.listeners.get("pagehide")();
  assert.equal(aborted.saved.has(timingKey), false);
  for (const navigationType of ["reload", "back_forward"]) {
    const f = fixture({ reduced: true, navigationType }); f.run();
    f.nativeLoader.isConnected = false; f.content.kind = "workspace";
    f.mutate(); f.paint(); f.paint();
    assert.equal(f.splashes[0].removed, true);
    assert.equal(f.saved.has(timingKey), false);
  }
});

test("reduced motion still records real readiness and rejects stale launcher timestamps", () => {
  const f = fixture({ reduced: true, launcherStartedAt: epoch - 600000 }); f.run(); f.advance(1000);
  f.nativeLoader.isConnected = false; f.content.kind = "workspace";
  f.mutate(); f.paint(); f.paint();
  assert.deepEqual(JSON.parse(f.saved.get(timingKey)).samples, [observation(1000, { readyAt: epoch + 1000, launcherMs: null, overlayMs: 1000 })]);
});

test("unavailable storage does not prevent the workspace from being revealed", () => {
  const f = fixture({ storageBlocked: true, reduced: true }); f.run();
  f.nativeLoader.isConnected = false; f.content.kind = "workspace";
  f.mutate(); f.paint(); f.paint();
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.logs.some(args => String(args[0]).includes("history could not be read")), true);
});

test("normal startup holds the finished composition before fading into painted content", () => {
  const f = fixture();
  f.run();
  f.advance(1000);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].removed, false);
  f.advance(INTRO_MS - 1001);
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].removed, false);
  f.advance(1);
  f.paint();
  assert.equal(f.splashes[0].removed, false, "the actual destination still needs a stable painted frame");
  f.paint();
  assert.equal(f.splashes[0].removed, false, "the cover fades instead of vanishing at the deadline");
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.advance(179);
  assert.equal(f.splashes[0].removed, false);
  f.advance(1);
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.timers.size, 0);
});

test("a fast workspace still shows the full intro and a real final hold", () => {
  const f = fixture();
  f.run();
  f.advance(100);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.paint();
  f.paint();
  f.advance(INTRO_MS - 101);
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined, "fast readiness must not accelerate away the animation");
  f.advance(1);
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.timers.size, 0);
});

test("startup waits for its first painted frame before consuming the animation", () => {
  const f = fixture();
  f.run(false);
  f.advance(5000);
  assert.equal(f.splashes[0].getAttribute("data-playback"), "paused");
  assert.equal(f.timers.size, 0, "no playback timers should run before presentation");
  f.paint();
  f.advance(2000);
  f.paint();
  assert.equal(f.splashes[0].getAttribute("data-playback"), "running");
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.advance(INTRO_MS - 1);
  f.paint(); f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined);
  f.advance(1);
  f.paint(); f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
});

test("a hidden startup begins the full animation only when presented", () => {
  const f = fixture({ hidden: true });
  f.run();
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.advance(10000);
  assert.equal(f.frames.size, 0);
  assert.equal(f.splashes[0].removed, false);
  assert.equal(f.splashes[0].getAttribute("data-playback"), "paused");
  f.visibility(false);
  f.paint(); f.paint();
  f.advance(INTRO_MS - 1);
  f.paint(); f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined);
  f.advance(1);
  f.paint(); f.paint();
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.listeners.size, 0);
});

test("hiding during the animation or final hold preserves the remaining visible time", () => {
  for (const visibleTime of [900, INTRO_MS - 300]) {
    const f = fixture();
    f.run();
    f.advance(visibleTime);
    f.nativeLoader.isConnected = false;
    f.content.kind = "workspace";
    f.mutate();
    f.visibility(true);
    f.advance(10000);
    assert.equal(f.splashes[0].removed, false);
    assert.equal(f.frames.size, 0);
    f.visibility(false);
    f.paint(); f.paint();
    f.advance(INTRO_MS - visibleTime - 1);
    f.paint(); f.paint();
    assert.equal(f.splashes[0].getAttribute("data-phase"), undefined);
    f.advance(1);
    f.paint(); f.paint();
    assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
    f.advance(180);
    assert.equal(f.splashes[0].removed, true);
  }
});

test("hiding during the exit fade restores the cover until visible again", () => {
  const f = fixture();
  f.run();
  f.advance(INTRO_MS);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.paint(); f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.advance(90);
  f.visibility(true);
  f.advance(5000);
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined);
  assert.equal(f.splashes[0].removed, false);
  f.visibility(false);
  f.paint(); f.paint();
  f.paint(); f.paint();
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
});

test("page exit or reduced motion before the first paint cancels deferred playback", () => {
  for (const action of [f => f.listeners.get("pagehide")(), f => f.reduceMotion()]) {
    const f = fixture();
    f.run(false);
    assert.equal(f.frames.size, 1);
    action(f);
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0);
    f.paint();
    f.advance(10000);
    assert.equal(f.timers.size, 0);
  }
});

test("delayed animation rendering cannot consume the final hold", () => {
  const f = fixture();
  f.run();
  f.delayMotion(800);
  f.advance(1000);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.paint();
  f.paint();
  f.advance(INTRO_MS - 201);
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined);
  f.advance(1);
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
});

test("reduced motion shows the final state and adds no artificial startup delay", () => {
  for (const reduced of [false, true]) {
    const f = fixture({ reduced });
    f.run();
    if (!reduced) {
      f.advance(2800);
      f.reduceMotion();
    }
    assert.equal(f.timers.size, 0);
    f.nativeLoader.isConnected = false;
    f.content.kind = "workspace";
    f.mutate();
    f.paint();
    f.paint();
    assert.equal(f.splashes[0].removed, true);
    assert.equal(f.listeners.size, 0);
  }
});

test("startup coverage survives document load and ends with painted application content", () => {
  const f = fixture({ parsing: true });
  f.run();
  assert.equal(f.styles.length, 0);
  f.document.documentElement = f.root;
  f.mutate();
  f.paint(); f.paint();
  assert.deepEqual(f.nativeLoader.children, ["native-logo"], "the official loader keeps ownership of its DOM");
  assert.equal(f.splashes[0].className, "codex-plus-pro-startup-splash");
  f.document.readyState = "complete";
  f.listeners.get("DOMContentLoaded")();
  f.advance(60000);
  for (let second = 0; second < 60; second++) f.mutate();
  assert.equal(f.attributes.get("data-codex-plus-startup-state"), "loading");
  assert.equal(f.styles[0].removed, false, "slow application initialization must keep its themed loader");
  f.nativeLoader.isConnected = false;
  f.mutate();
  f.paint();
  f.paint();
  assert.equal(f.styles[0].removed, false, "an empty root is a handoff, not a ready workspace");
  f.content.kind = "workspace";
  f.mutate();
  f.paint();
  assert.equal(f.styles[0].removed, false, "wait through the first painted frame");
  f.paint();
  f.advance(180);
  assert.equal(f.styles[0].removed, true);
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.attributes.get("data-codex-plus-startup-state"), "ready");
  assert.equal(f.observing(), false);
  assert.equal(f.listeners.size, 0);
  f.run();
  assert.equal(f.styles.length, 1, "later runtime refresh must not replay startup");
});

test("slow startup enters continuous loading as soon as the intro finishes", () => {
  const f = fixture();
  f.run();
  f.advance(INTRO_MS - 1);
  assert.equal(f.splashes[0].getAttribute("data-waiting"), undefined);
  f.advance(1);
  assert.equal(f.splashes[0].getAttribute("data-waiting"), "true");
  f.advance(60000);
  assert.equal(f.splashes.length, 1);
  assert.equal(f.splashes[0].removed, false);
  assert.equal(f.timers.size, 0, "long startup requires no JavaScript polling");
});

test("a ready workspace leaves after the intro without entering the loading loop", () => {
  const f = fixture();
  f.run();
  f.advance(1000);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.advance(INTRO_MS - 1000);
  f.paint(); f.paint();
  assert.equal(f.splashes[0].getAttribute("data-waiting"), undefined);
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
});

test("a loader returning during reveal starts continuous feedback immediately", () => {
  const f = fixture();
  f.run();
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.advance(INTRO_MS);
  f.paint(); f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.reactLoader.isConnected = true;
  f.mutate();
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined);
  assert.equal(f.splashes[0].getAttribute("data-waiting"), "true");
  f.advance(60000);
  assert.equal(f.splashes[0].removed, false);
  f.reactLoader.isConnected = false;
  f.mutate();
  f.paint(); f.paint();
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
});

test("startup uses saved theme assets, custom uploads, and dark/reduced-motion CSS", () => {
  for (const custom of [false, true]) {
    const f = fixture({ custom, reduced: true });
    f.run();
    assert.equal(f.attributes.get("data-codex-plus-accent"), "aria");
    assert.equal(f.properties.get("--codex-plus-accent"), "#3b82c4", "saved theme colors must be present before the renderer initializes");
    assert.ok(f.properties.get("--codex-pokedex-wallpaper").includes(custom ? "custom-wall" : "blue-wall"));
    assert.ok(f.properties.get("--codex-pokedex-ball-logo").includes(custom ? "custom-logo" : "blue-logo"));
    assert.match(f.styles[0].textContent, /--startup-background:\s*#f4f8fd/);
    assert.match(f.styles[0].textContent, /prefers-reduced-motion:reduce/);
    assert.match(f.styles[0].textContent, /prefers-reduced-transparency:reduce/);
    assert.match(f.splashes[0].innerHTML, /startup-wallpaper/);
    assert.match(f.splashes[0].innerHTML, /startup-tech/);
  }
});

test("mini, pet, disabled themes, and an already loaded workspace retain their native contents", () => {
  for (const options of [{ route: "/avatar-overlay" }, { route: "/hotkey-window" }, { route: "/hotkey-window/thread/example" }, { theme: false }, { loader: false }]) {
    const f = fixture(options);
    f.run();
    assert.deepEqual(f.nativeLoader.children, ["native-logo"]);
    assert.equal(f.styles.filter((node) => !node.removed).length, 0);
    assert.ok(!f.observing());
  }
});

test("page exit releases the startup observer and stylesheet", () => {
  const f = fixture();
  f.run();
  f.listeners.get("pagehide")();
  assert.equal(f.observing(), false);
  assert.equal(f.styles[0].removed, true);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0, "page exit must cancel the introduction deadline");
});

test("removing the HTML loader does not expose the React bootstrap logo", () => {
  const f = fixture();
  f.run();
  f.advance(INTRO_MS);
  f.nativeLoader.isConnected = false;
  f.reactLoader.isConnected = true;
  f.content.kind = "workspace";
  f.mutate();
  assert.equal(f.styles[0].removed, false, "React initialization still owns startup duration");
  assert.equal(f.attributes.get("data-codex-plus-startup-state"), "loading");
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].removed, false);
  f.reactLoader.isConnected = false;
  f.mutate();
  f.paint();
  f.paint();
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
});

test("a late injector also covers the React phase and exposes login/error recovery", () => {
  for (const destination of ["workspace", "login", "error"]) {
    const f = fixture({ loader: false, react: true });
    f.run();
    f.advance(INTRO_MS);
    assert.equal(f.splashes.length, 1);
    f.reactLoader.isConnected = false;
    f.content.kind = destination;
    f.mutate();
    f.paint();
    f.paint();
    f.advance(180);
    assert.equal(f.splashes[0].removed, true, destination);
    assert.equal(f.frames.size, 0);
    assert.equal(f.observing(), false);
  }
});

test("hidden bridges, fallback chrome, and empty wrappers cannot finish startup", () => {
  const f = fixture();
  f.run();
  f.nativeLoader.isConnected = false;
  for (const kind of ["chrome", "hidden", "blank", "empty", "loading-text"]) {
    f.content.kind = kind;
    f.mutate();
    f.paint();
    f.paint();
    assert.equal(f.splashes[0].removed, false, kind);
  }
});

test("a new loading phase cancels a pending reveal and page exit cancels animation frames", () => {
  const f = fixture();
  f.run();
  f.advance(INTRO_MS);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.paint();
  f.reactLoader.isConnected = true;
  f.mutate();
  f.paint();
  assert.equal(f.splashes[0].removed, false);
  f.reactLoader.isConnected = false;
  f.mutate();
  assert.equal(f.frames.size, 1);
  f.listeners.get("pagehide")();
  assert.equal(f.frames.size, 0);
  assert.equal(f.splashes[0].removed, true);
});

test("a returning loader aborts the fade and the next reveal rechecks painted content", () => {
  const f = fixture();
  f.run();
  f.advance(INTRO_MS);
  f.nativeLoader.isConnected = false;
  f.content.kind = "workspace";
  f.mutate();
  f.paint();
  f.paint();
  assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
  f.advance(90);
  f.reactLoader.isConnected = true;
  f.mutate();
  assert.equal(f.splashes[0].getAttribute("data-phase"), undefined, "restore the opaque cover as soon as loading returns");
  f.advance(5000);
  assert.equal(f.splashes[0].removed, false);
  f.reactLoader.isConnected = false;
  f.mutate();
  f.paint();
  f.paint();
  f.advance(180);
  assert.equal(f.splashes[0].removed, true);
  assert.equal(f.timers.size, 0);
});

test("reduced motion or page exit during a fade releases every pending resource", () => {
  for (const action of [f => f.reduceMotion(), f => f.listeners.get("pagehide")()]) {
    const f = fixture();
    f.run();
    f.advance(INTRO_MS);
    f.nativeLoader.isConnected = false;
    f.content.kind = "workspace";
    f.mutate();
    f.paint();
    f.paint();
    assert.equal(f.splashes[0].getAttribute("data-phase"), "leaving");
    action(f);
    assert.equal(f.splashes[0].removed, true);
    assert.equal(f.timers.size, 0);
    assert.equal(f.frames.size, 0);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.observing(), false);
  }
});

test("a new renderer installs startup immediately before subscribing to runtime events", async () => {
  const bootstrap = injector.slice(injector.indexOf("async function attachToPageTarget("), injector.indexOf("  const refreshPageTheme =", injector.indexOf("async function attachToPageTarget("))) + "}";
  for (const failing of [false, true]) {
    const calls = [];
    const logs = [];
    const handlers = new Map();
    const browser = { on: (event, callback) => handlers.set(event, callback), send: async (method, params) => {
      if (method === "Runtime.enable") assert.equal(handlers.has("Runtime.consoleAPICalled"), true, "subscribe before buffered console events arrive");
      calls.push({ method, params });
      if (failing && method === "Page.addScriptToEvaluateOnNewDocument") throw new Error("registration failed");
      return {};
    } };
    const attach = vm.runInNewContext(`${documentPolicy}\n${bootstrap}\nattachToPageTarget`, {
      pageSessions: new Map(), pageTargetsBySessionId: new Map(), buildInjectionSource: () => "pageRuntime()", petNotificationsSource: "petRuntime()", startupSource: "nativeStartup()", invalidatePageSession() {},
      isFeatureSettingsOwnerTarget: () => true, parseStartupTimingEvent, log: message => logs.push(message),
    });
    const pending = attach(browser, { targetId: "first-page" }, "paused-session");
    if (failing) await assert.rejects(pending, /registration failed/);
    else await pending;
    const registered = calls.findIndex(({ method }) => method === "Page.addScriptToEvaluateOnNewDocument");
    assert.equal(registered, 0);
    assert.ok(calls[registered].params.source.startsWith("nativeStartup()"));
    assert.equal(calls[registered].params.runImmediately, true);
    assert.ok(!calls.some(({ method }) => method === "Runtime.runIfWaitingForDebugger"));
    if (!failing) {
      assert.equal(calls[1].method, "Runtime.enable");
      const notify = (value, sessionId = "paused-session") => handlers.get("Runtime.consoleAPICalled")({ type: "info", args: [{ value: timingKey }, { value: JSON.stringify(value) }] }, { sessionId });
      notify(observation(8000), "other-session");
      notify({ secret: "do not log" });
      assert.equal(logs.length, 0);
      notify(observation(8000));
      assert.equal(logs.length, 1);
      assert.match(logs[0], /Startup timing .*"launcherMs":10000.*"visibleReadyMs":8000/);
    }
  }
});

test("the launcher prepares a live injector and its logs before activating the official app", { skip: process.platform !== "win32" }, async () => {
  const launcher = await fs.readFile(new URL("../launch.ps1", import.meta.url), "utf8");
  const preparation = launcher.slice(launcher.indexOf('$stdoutLog = Join-Path'), launcher.indexOf('if (-not (Wait-ForDevTools'));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-startup-launch-test-"));
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const script = `
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$StateRoot = ${quote(directory)}
$LogDir = $StateRoot
$PidFile = Join-Path $StateRoot "injector.pid"
$PortFile = Join-Path $StateRoot "renderer-port.txt"
$nodePath = "node"
$InjectorPath = "fixture-injector.mjs"
$CssPath = "fixture.css"
$WallpaperPath = "wallpaper.jpg"
$LogoPath = "logo.png"
$version = "test"
$rendererPort = 12229
$inspectorPort = 12329
$argumentLine = "fixture"
$startupStartedAtMs = 1792120000000
$updateState = "unknown"
$codex = [pscustomobject]@{ Path="fixture.exe";Source="fixture";Version="test";AppKind="Codex";AppUserModelId=$null }
$storeAppx = $null
$latestStoreVersion = $null
$managedLatest = $null
$managedVersions = @()
$launchOrder = [System.Collections.Generic.List[string]]::new()
function Write-AppLog { param($Message) }
function Show-ErrorDialog { param($Message) throw $Message }
function Start-Process {
  param($FilePath,$ArgumentList,[switch]$PassThru,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError)
  if (!(Test-Path -LiteralPath $RedirectStandardOutput) -or !(Test-Path -LiteralPath $RedirectStandardError)) { throw "logs missing before injector" }
  $timingIndex = [Array]::IndexOf($ArgumentList, "--startup-started-at-ms")
  if ($timingIndex -lt 0 -or $ArgumentList[$timingIndex + 1] -ne [string]$startupStartedAtMs) { throw "launcher timestamp missing from injector arguments" }
  $launchOrder.Add("injector")
  Set-Content -LiteralPath $startupReadyFile -Value "prepared"
  return [pscustomobject]@{Id=12345;HasExited=$false}
}
function Start-CodexPlusOfficialProcess {
  param($Path,$ArgumentLine)
  if (!(Test-Path -LiteralPath $startupReadyFile)) { throw "official app activated before preparation" }
  $launchOrder.Add("official")
  return [pscustomobject]@{Process=[pscustomobject]@{Id=12346};CliPath=$null;WorkingDirectory="fixture"}
}
${preparation}
if (($launchOrder -join ",") -ne "injector,official") { throw "incorrect launch order" }
"verified launch order"
`;
  const scriptPath = path.join(directory, "verify.ps1");
  try {
    await fs.writeFile(scriptPath, "\ufeff" + script);
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, (result.stdout + result.stderr).slice(0, 2500));
    assert.match(result.stdout, /verified launch order/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildStartupSource } from "./startup-splash.mjs";
import { parseStartupTimingEvent } from "./startup-timing.mjs";
import { ExtensionUpdateService } from "./extension-updates.mjs";
import { createExtensionUpdatesUI } from "./extension-updates-ui.mjs";

// =============================================================================
// Codex Plus Pro — Windows Scope B2 (Theme + Model picker + Pet; PiP retired)
// -----------------------------------------------------------------------------
// Theme, accent, wallpaper/logo, themed model picker, and desktop pet.
// Picture-in-picture / multi-window Popout control is retired (delete-first).
// Main controller (--main-port) remains for pet window hide/show only.
// "恢复默认" clears custom wallpaper/logo and reapplies defaults.
// =============================================================================

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const options = parseArguments(process.argv.slice(2));
const rendererPort = String(options.port ?? "9347");
const mainPort = options["main-port"] ? String(options["main-port"]) : "";
const featureSettingsBinding = "__codexPlusProSettingsChanged";
const officialUpgradeBinding = "__codexPlusProOfficialUpgrade";
const versionCheckBinding = "__codexPlusProVersionCheck";
const extensionUpdatesBinding = "__codexPlusProExtensionUpdates";
const managedVersionCleanupBinding = "__codexPlusProManagedVersionCleanup";
const mainControllerSource = buildMainControllerSource();
let hostFeatureSettings = {
  theme: true,
  pet: true,
  modelPicker: true,
  accent: "pokedex",
  wallpaperStrength: 72,
  wallpaperMode: "default",
  logoMode: "default",
  petMotion: "full",
  modelDensity: "compact",
};
// Shared by the first-paint splash and the settings renderer.
const ACCENT_OPTIONS = {
  pokedex: { label: "图鉴红", color: "#b61f31", dark: "#751522", highlight: "#d29a18" },
  lagoon: { label: "海湾青", color: "#277d91", dark: "#175263", highlight: "#d29a18" },
  forest: { label: "常青绿", color: "#3f7f59", dark: "#28533b", highlight: "#d29a18" },
  graphite: { label: "石墨黑", color: "#4b4f55", dark: "#2e3135", highlight: "#c5902b" },
  aria: { label: "清风蓝", color: "#3b82c4", dark: "#1e4f8c", highlight: "#7eb8e8" },
  adaptive: { label: "自适应", color: "#b61f31", dark: "#751522", highlight: "#d29a18" },
};
const WINDOWS_SCOPE_A_VERSION = (await fs.readFile(path.join(scriptDirectory, "VERSION"), "utf8")).trim();
const scriptVersion = WINDOWS_SCOPE_A_VERSION + " (Scope B2 pet - Windows)";
const hostVersionInfo = normalizeVersionInfo({
  appSource: options["app-source"] ?? "unknown",
  appVersion: options["app-version"] ?? "unknown",
  appKind: options["app-kind"] ?? "unknown",
  appPath: decodeBase64Option(options["app-path-b64"]) || options["app-path"] || "",
  storeAppxVersion: options["store-appx-version"] ?? "",
  storeAppxKind: options["store-appx-kind"] ?? "",
  storeAppxPath: decodeBase64Option(options["store-appx-path-b64"]) || options["store-appx-path"] || "",
  latestVersion: options["latest-version"] ?? "",
  updateState: options["update-state"] ?? "not-configured",
  updateStatus: decodeBase64Option(options["update-status-b64"]) || options["update-status"] || describeUpdateState(options["update-state"], options["latest-version"]),
  managedCount: options["managed-count"] ?? "0",
  managedLatestVersion: options["managed-latest-version"] ?? "",
  managedLatestKind: options["managed-latest-kind"] ?? "",
  managedLatestPath: decodeBase64Option(options["managed-latest-path-b64"]) || options["managed-latest-path"] || "",
  managedVersions: parseJsonOption(options["managed-versions-json-b64"], []),
  scanTimeUtc: options["scan-time-utc"] ?? "",
});

// Must be declared before top-level buildAccentAssetPacks() runs.
const ACCENT_PACK_KEYS = ["pokedex", "lagoon", "forest", "graphite", "aria"];
const SETTINGS_ACCENT_KEYS = [...ACCENT_PACK_KEYS, "adaptive"];

const cssPath = path.resolve(options.css ?? path.join(scriptDirectory, "theme.css"));
const artworkPath = path.resolve(options.wallpaper ?? options.artwork ?? path.join(scriptDirectory, "assets", "pokemon-onsen.jpg"));
const logoPath = path.resolve(options.logo ?? path.join(scriptDirectory, "assets", "pokeball-logo-white.png"));
const petNotificationsPath = path.resolve(
  options["pet-notifications"] ?? path.join(scriptDirectory, "pet-notifications.js"),
);
const oneShot = options.once === true;
// Tiny placeholders keep the first evaluate under control. Full assets are applied afterwards.
const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAgJCgsKCA0LCwsNDg0PEhQRDxISEhYVFxkWGSYeIyAhICUhJSwtKjApKy84MiM6OEk5QE5NTk9GXl5hXFtcRcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcP/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const [baseCssTemplate, extensionUpdatesCss] = await Promise.all([
  fs.readFile(cssPath, "utf8"),
  fs.readFile(path.join(scriptDirectory, "extension-updates.css"), "utf8"),
]);
const cssTemplate = baseCssTemplate + "\n" + extensionUpdatesCss;
const [artworkDataUri, logoDataUri, petNotificationsSource] = await Promise.all([
  loadCompressedDataUri(artworkPath, "wallpaper"),
  loadCompressedDataUri(logoPath, "logo"),
  fs.readFile(petNotificationsPath, "utf8"),
]);
// Accent-linked packs (default mode only). Optional theme-packs.json can override paths.
// Primary: windows/source/theme-packs.json (preferred).
// Optional user overlay: %LOCALAPPDATA%/Codex-Plus-Pro/theme-packs.json
// Built-in path map only fills accents/fields not set in JSON.
const accentAssetPacks = await buildAccentAssetPacks({
  defaultWallpaperDataUri: artworkDataUri,
  defaultLogoDataUri: logoDataUri,
  defaultWallpaperPath: artworkPath,
  defaultLogoPath: logoPath,
});
const themeCss = cssTemplate
  .replaceAll("__WALLPAPER_DATA_URI__", artworkDataUri)
  .replaceAll("__POKEBALL_LOGO_DATA_URI__", logoDataUri);
const startupSource = buildStartupSource({
  css: cssTemplate,
  launcherStartedAt: Number(options["startup-started-at-ms"]),
  accentOptions: ACCENT_OPTIONS,
  assetSource: buildThemeAssetSource(artworkDataUri, logoDataUri, accentAssetPacks),
});
const packKeys = Object.keys(accentAssetPacks);
log(`Assets ready wallpaper=${Math.round(artworkDataUri.length / 1024)}KB logo=${Math.round(logoDataUri.length / 1024)}KB packs=[${packKeys.join(",")}]`);

log("Windows Scope B2 — theme + model picker + pet (PiP retired)");

// Expose for diagnostics / user inspection in DevTools console.
try { globalThis.__codexPlusProVersion = scriptVersion; } catch {}

if (options.check === true) {
  new Function(
    buildInjectionSource("/* check */")
      + "\n;\n"
      + petNotificationsSource,
  );
  new Function(mainControllerSource);
  new Function(startupSource);
  log("Windows theme injection + pet notifications + pet window controller syntax are valid");
  process.exit(0);
}

const attachedTargetIds = new Set();
const attachingTargetIds = new Set();
const pageSessions = new Map();
const pageTargetsBySessionId = new Map();
const extensionUpdates = new ExtensionUpdateService({
  onState: (payload) => { broadcastExtensionUpdateResult(payload).catch(() => log("Extension update notification could not reach the main window")); },
});
let nextExtensionUpdateTick = Date.now() + 30000;
let browserConnection = null;
let mainConnection = null;
let rendererPetState = null;
let rendererPetSync = Promise.resolve();
let officialUpgradePromise = null;
let versionCheckPromise = null;
let managedVersionCleanupPromise = null;
let mainAttaching = false;
let shuttingDown = false;
let missingServerTicks = 0;
let missingServerSince = null;
let injectedCount = 0;
if (options["ready-file"]) await fs.writeFile(path.resolve(options["ready-file"]), "prepared", "utf8");
process.on("SIGINT", () => { shuttingDown = true; });
process.on("SIGTERM", () => { shuttingDown = true; });
log(`Codex Plus Pro Windows injector starting on 127.0.0.1:${rendererPort}`);
if (mainPort) log(`Codex Plus Pro window controller starting on 127.0.0.1:${mainPort}`);

while (!shuttingDown) {
  try {
    if (!browserConnection) {
      browserConnection = await connectToBrowser(rendererPort);
      missingServerTicks = 0;
      missingServerSince = null;
    }
    const targetInfos = await browserConnection.send("Target.getTargets");
    const pageTargets = (targetInfos.targetInfos || []).filter(isInjectableTarget);
    for (const target of pageTargets) {
      const existing = pageSessions.get(target.targetId);
      if (existing) Object.assign(existing.target, target);
      if (attachedTargetIds.has(target.targetId) || attachingTargetIds.has(target.targetId)) continue;
      queuePageAttachment(browserConnection, target);
    }
    const liveIds = new Set((targetInfos.targetInfos || []).map((target) => target.targetId));
    for (const targetId of [...attachedTargetIds]) {
      if (!liveIds.has(targetId)) {
        invalidatePageSession(targetId, null, "Target.removed");
      }
    }

    if (!oneShot && Date.now() >= nextExtensionUpdateTick && [...pageSessions.values()].some(page => isFeatureSettingsOwnerTarget(page.target))) {
      nextExtensionUpdateTick = Date.now() + 60000;
      extensionUpdates.maybeCheck().catch((error) => {
        nextExtensionUpdateTick = Date.now() + 86400000;
        log("Extension background check could not run: " + error.message);
        broadcastExtensionUpdateResult(extensionUpdates.snapshot("failed", error.message)).catch(() => {});
      });
    }

    if (mainPort && !mainConnection && !mainAttaching) {
      mainAttaching = true;
      try {
        await attachToMainTarget(mainPort);
      } catch (error) {
        if (missingServerTicks === 0) log(`Waiting for Codex window controller: ${error.message}`);
      } finally {
        mainAttaching = false;
      }
    }

    if (oneShot && injectedCount > 0 && (!mainPort || mainConnection)) {
      await delay(400);
      break;
    }
  } catch (error) {
    if (browserConnection) {
      try { browserConnection.close(); } catch {}
      browserConnection = null;
      clearPageSessions("Browser DevTools connection reset");
    }
    if (missingServerTicks === 0) log(`Waiting for Codex DevTools: ${error.message}`);
    missingServerTicks += 1;
    missingServerSince ??= Date.now();
    if (Date.now() - missingServerSince >= 45000) {
      log("Codex is no longer reachable; injector exiting.");
      break;
    }
  }
  await delay(browserConnection ? 900 : 15);
}
try { browserConnection?.close(); } catch {}
try { mainConnection?.close(); } catch {}
process.exit(0);

function isCodexAppDocument(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "app:" && url.hostname === "-"
      && ["/index.html", "/detached-window.html"].includes(url.pathname);
  } catch {
    return false;
  }
}

function isInjectableTarget(target) {
  if (!target?.targetId) return false;
  const type = String(target.type || "");
  if (type !== "page" && type !== "webview") return false;
  return isCodexAppDocument(String(target.url || ""));
}

function isFeatureSettingsOwnerTarget(target) {
  const type = String(target?.type || "");
  if (type !== "page" && type !== "webview") return false;
  try {
    const parsed = new URL(String(target?.url || ""));
    return parsed.protocol === "app:"
      && parsed.pathname === "/index.html"
      && !parsed.searchParams.has("initialRoute");
  } catch {
    return false;
  }
}

async function connectToBrowser(port) {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`, 5000);
  if (!version.webSocketDebuggerUrl) throw new Error("Browser DevTools websocket is missing");
  const connection = await createCdpConnection(version.webSocketDebuggerUrl, () => {
    if (browserConnection === connection) browserConnection = null;
    clearPageSessions("Browser DevTools connection closed");
  });
  connection.on("Target.detachedFromTarget", (params) => {
    const targetId = params?.targetId || pageTargetsBySessionId.get(params?.sessionId);
    invalidatePageSession(targetId, params?.sessionId, "Target.detachedFromTarget");
  });
  connection.on("Target.attachedToTarget", (params) => {
    const target = params.targetInfo;
    if ((target?.type === "page" || target?.type === "webview") && (isInjectableTarget(target) || !target.url || target.url === "about:blank")) {
      queuePageAttachment(connection, target, params.sessionId);
    }
  });
  connection.on("Target.targetInfoChanged", ({ targetInfo }) => {
    const existing = pageSessions.get(targetInfo?.targetId);
    if (existing) Object.assign(existing.target, targetInfo);
  });
  await connection.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
    filter: [{ type: "page", exclude: false }, { type: "webview", exclude: false }, { exclude: true }],
  });
  await connection.send("Target.setDiscoverTargets", { discover: true });
  log("Browser DevTools connected");
  return connection;
}

function queuePageAttachment(browser, target, sessionId = null) {
  if (attachedTargetIds.has(target.targetId) || attachingTargetIds.has(target.targetId)) return;
  attachingTargetIds.add(target.targetId);
  attachToPageTarget(browser, target, sessionId)
    .then((activeSessionId) => {
      if (pageSessions.get(target.targetId)?.sessionId !== activeSessionId) return;
      attachedTargetIds.add(target.targetId);
      injectedCount += 1;
    })
    .catch((error) => log(`Target ${String(target.targetId).slice(0, 8)} attach failed: ${error.message}`))
    .finally(() => attachingTargetIds.delete(target.targetId));
}

async function postOfficialUpgradeResult(send, payload) {
  const expression = "window.__codexPlusProOfficialUpgradeResult?.(" + JSON.stringify(payload) + ")";
  try {
    await send("Runtime.evaluate", { expression, awaitPromise: false, returnByValue: false });
  } catch (error) {
    log(`Codex Plus Pro official upgrade UI update failed: ${error.message}`);
  }
}

async function postVersionCheckResult(send, payload) {
  const expression = "window.__codexPlusProVersionCheckResult?.(" + JSON.stringify(payload) + ")";
  try {
    await send("Runtime.evaluate", { expression, awaitPromise: false, returnByValue: false });
  } catch (error) {
    log(`Codex Plus Pro version check UI update failed: ${error.message}`);
  }
}

async function postExtensionUpdateResult(send, payload) {
  await send("Runtime.evaluate", {
    expression: "window.__codexPlusProExtensionUpdateResult?.(" + JSON.stringify(payload) + ")",
    awaitPromise: false,
    returnByValue: false,
  });
}

async function broadcastExtensionUpdateResult(payload) {
  const results = await Promise.allSettled([...pageSessions.values()]
    .filter(page => isFeatureSettingsOwnerTarget(page.target))
    .map(page => postExtensionUpdateResult(page.send, payload)));
  if (results.some(result => result.status === "rejected")) log("An extension update notification could not reach a renderer");
}

async function postManagedVersionCleanupResult(send, payload) {
  const expression = "window.__codexPlusProManagedVersionCleanupResult?.(" + JSON.stringify(payload) + ")";
  try {
    await send("Runtime.evaluate", { expression, awaitPromise: false, returnByValue: false });
  } catch (error) {
    log(`Codex Plus Pro managed version cleanup UI update failed: ${error.message}`);
  }
}

async function runManagedVersionCleanup(send, version) {
  if (managedVersionCleanupPromise) return managedVersionCleanupPromise;
  managedVersionCleanupPromise = runManagedVersionCleanupOnce(send, version)
    .finally(() => {
      managedVersionCleanupPromise = null;
    });
  return managedVersionCleanupPromise;
}

function runManagedVersionCleanupOnce(send, version) {
  const scriptPath = path.resolve(scriptDirectory, "..", "cleanup-official-version.ps1");
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-Version",
    version,
  ];
  if (hostVersionInfo.appPath) args.push("-CurrentPath", hostVersionInfo.appPath);
  log(`Codex Plus Pro managed version cleanup started version=${version}`);
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", args, {
      cwd: path.dirname(scriptPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const appendCapped = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return next.length > 12000 ? next.slice(next.length - 12000) : next;
    };
    child.stdout.on("data", (chunk) => { stdout = appendCapped(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendCapped(stderr, chunk); });
    child.on("error", (error) => {
      resolve({
        ok: false,
        state: "failed",
        version,
        status: "清理版本失败",
        detail: error.message,
      });
    });
    child.on("close", (code) => {
      const parsed = parseTrailingJson(stdout);
      if (code === 0 && parsed) {
        const state = String(parsed.State || "");
        const downloadCleanup = Array.isArray(parsed.DownloadCleanup) ? parsed.DownloadCleanup : [];
        const removedDownloads = downloadCleanup.filter((item) => item?.State === "Removed").length;
        const deferredDownloads = downloadCleanup.filter((item) => item?.State === "Deferred").length;
        const detail = [
          state === "Removed" ? "版本目录已清理。" : "",
          removedDownloads ? `同时清理下载文件 ${removedDownloads} 个。` : "",
          deferredDownloads ? `有 ${deferredDownloads} 个下载文件暂时无法清理，下次更新时重试。` : "",
          parsed.Error || "",
        ].filter(Boolean).join("\n");
        resolve({
          ok: state === "Removed",
          state: state === "Removed" ? "done" : state === "Protected" ? "protected" : state === "Deferred" ? "deferred" : "failed",
          version,
          status: state === "Removed"
            ? "已清理版本 " + version
            : state === "Protected"
              ? "当前版本不可清理"
              : "版本暂时无法清理",
          detail: detail || "清理结果不可用。",
        });
        return;
      }
      const detail = [stderr, stdout].filter(Boolean).join("\n").trim().slice(-4000);
      resolve({
        ok: false,
        state: "failed",
        version,
        status: "清理版本失败",
        detail: detail || ("cleanup-official-version.ps1 exited with code " + code),
      });
    });
  });
}

async function runOfficialImportUpgrade(send) {
  if (officialUpgradePromise) return officialUpgradePromise;
  officialUpgradePromise = runOfficialImportUpgradeOnce(send)
    .finally(() => {
      officialUpgradePromise = null;
    });
  return officialUpgradePromise;
}

async function runVersionCheck() {
  if (versionCheckPromise) return versionCheckPromise;
  versionCheckPromise = runVersionCheckOnce()
    .finally(() => {
      versionCheckPromise = null;
    });
  return versionCheckPromise;
}

function runVersionCheckOnce() {
  const scriptPath = path.resolve(scriptDirectory, "..", "check-official-version.ps1");
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-CurrentVersion",
    hostVersionInfo.appVersion,
    "-TimeoutSeconds",
    "12",
  ];
  log(`Codex Plus Pro manual version check started current=${hostVersionInfo.appVersion}`);
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", args, {
      cwd: path.dirname(scriptPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const appendCapped = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return next.length > 12000 ? next.slice(next.length - 12000) : next;
    };
    child.stdout.on("data", (chunk) => { stdout = appendCapped(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendCapped(stderr, chunk); });
    child.on("error", (error) => {
      resolve({
        ok: false,
        state: "failed",
        updateState: "check-failed",
        status: "在线检查失败",
        detail: error.message,
      });
    });
    child.on("close", (code) => {
      const parsed = parseTrailingJson(stdout);
      if (code === 0 && parsed) {
        const updateState = String(parsed.UpdateState || "check-failed");
        const latestVersion = String(parsed.LatestVersion || "");
        const scanTimeUtc = String(parsed.ScanTimeUtc || new Date().toISOString());
        const detail = String(parsed.Error || "");
        const status = describeUpdateState(updateState, latestVersion);
        log(`Codex Plus Pro manual version check completed state=${updateState} latest=${latestVersion || "unknown"}`);
        resolve({
          ok: updateState !== "check-failed",
          state: updateState === "check-failed" ? "failed" : "done",
          updateState,
          latestVersion,
          updateStatus: status,
          scanTimeUtc,
          status,
          detail: detail || (updateState === "outdated"
            ? "发现官方新版，可在下方下载并导入本机保留版。"
            : updateState === "current"
              ? "当前启动版本已经是官方最新版本。"
              : "未能读取 Microsoft Store 最新版本。"),
        });
        return;
      }
      const detail = [stderr, stdout].filter(Boolean).join("\n").trim().slice(-4000);
      resolve({
        ok: false,
        state: "failed",
        updateState: "check-failed",
        status: "在线检查失败",
        detail: detail || ("check-official-version.ps1 exited with code " + code),
      });
    });
  });
}

function runOfficialImportUpgradeOnce(send) {
  const scriptPath = path.resolve(scriptDirectory, "..", "resolve-store-fe3-direct.ps1");
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-Import",
    "-Force",
  ];
  log("Codex Plus Pro official upgrade import started");
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", args, {
      cwd: path.dirname(scriptPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    let stderrLineBuffer = "";
    const appendCapped = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return next.length > 24000 ? next.slice(next.length - 24000) : next;
    };
    const consumeProgress = (channel, chunk) => {
      const buffer = channel === "stdout" ? stdoutLineBuffer : stderrLineBuffer;
      const next = buffer + chunk.toString("utf8");
      const lines = next.split(/\r?\n/);
      if (channel === "stdout") stdoutLineBuffer = lines.pop() || "";
      else stderrLineBuffer = lines.pop() || "";
      for (const line of lines) {
        try {
          const payload = JSON.parse(line);
          if (payload?.type === "codex-plus-pro-progress") {
            void postOfficialUpgradeResult(send, localizeOfficialProgress(payload));
          }
        } catch {}
      }
    };
    child.stdout.on("data", (chunk) => {
      stdout = appendCapped(stdout, chunk);
      consumeProgress("stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendCapped(stderr, chunk);
      consumeProgress("stderr", chunk);
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        state: "failed",
        status: "下载或导入失败",
        detail: error.message,
      });
    });
    child.on("close", (code) => {
      const parsed = parseTrailingJson(stdout);
      if (code === 0 && parsed) {
        const version = parsed.Version || parsed.Imported?.Version || "";
        const importedPath = parsed.Imported?.InstalledDirectory || parsed.Imported?.Path || "";
        const downloadedPath = parsed.DownloadedPath || "";
        const deferredCleanup = Array.isArray(parsed.Imported?.DeferredCleanup) ? parsed.Imported.DeferredCleanup : [];
        log(`Codex Plus Pro official upgrade import completed version=${version || "unknown"}`);
        resolve({
          ok: true,
          state: "done",
          status: "已导入官方新版" + (version ? " " + version : ""),
          version,
          downloadedPath,
          detail: [
            "重启 Codex Plus Pro 后会优先使用本机保留版。",
            importedPath ? "导入目录: " + importedPath : "",
            downloadedPath ? "下载文件: " + downloadedPath : "",
            deferredCleanup.length ? "有 " + deferredCleanup.length + " 个当前使用或被占用的版本暂未清理，下次更新时重试。" : "",
          ].filter(Boolean).join("\n"),
        });
        return;
      }
      const detail = [stripOfficialProgressOutput(stderr), stripOfficialProgressOutput(stdout)]
        .filter(Boolean)
        .join("\n")
        .slice(-4000);
      resolve({
        ok: false,
        state: "failed",
        status: "下载或导入失败",
        detail: detail || ("resolve-store-fe3-direct.ps1 exited with code " + code),
      });
    });
  });
}

function parseTrailingJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function localizeOfficialProgress(payload) {
  const phase = String(payload?.phase || "");
  const current = Number(payload?.current || 0);
  const total = Number(payload?.total || 0);
  const percent = Number(payload?.percent);
  const status = phase === "resolving" ? "正在获取官方下载地址"
    : phase === "downloading" ? (total > 0 ? "正在下载官方新版" : "正在连接官方 CDN")
      : "正在导入官方新版";
  const formatBytes = (value) => {
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  let detail = status;
  if (phase === "resolving") {
    detail = { GetCookie: "连接官方下载服务", SyncUpdates: "查询官方安装包", GetExtendedUpdateInfo2: "获取官方下载地址" }[payload.step] || status;
    if (Number(payload.attempt) > 1) detail += `，正在重试（${payload.attempt}/${payload.maxAttempts}）`;
  } else if (total > 0 && phase === "downloading") {
    detail += `：${formatBytes(current)} / ${formatBytes(total)}`;
    if (Number.isFinite(percent)) detail += ` (${percent.toFixed(1)}%)`;
  } else if (total > 0) {
    detail += `：${current} / ${total}`;
    if (Number.isFinite(percent)) detail += ` (${percent.toFixed(1)}%)`;
  }
  return { ...payload, status, detail };
}

function stripOfficialProgressOutput(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => {
      try {
        return JSON.parse(line)?.type !== "codex-plus-pro-progress";
      } catch {
        return true;
      }
    })
    .join("\n")
    .trim();
}

async function attachToPageTarget(browser, target, autoAttachedSessionId = null) {
  const attached = autoAttachedSessionId ? { sessionId: autoAttachedSessionId } : await browser.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  if (!sessionId) throw new Error("Missing session id");
  const send = (method, params = {}) => browser.send(method, params, sessionId).catch((error) => {
    if (/Session with given id not found/i.test(String(error?.message || ""))) {
      invalidatePageSession(target.targetId, sessionId, "session-not-found");
    }
    throw error;
  });
  pageSessions.set(target.targetId, {
    sessionId,
    send,
    target: target,
  });
  pageTargetsBySessionId.set(sessionId, target.targetId);

  const pageSource = buildInjectionSource("/* css applied via host chunks */")
    + "\n;\n"
    + `if ((${isCodexAppDocument.toString()})(location.href)) {\n${petNotificationsSource}\n}`;
  // Install first, before requesting runtime events or waiting for DOM readiness.
  // runImmediately also covers a navigation that began before the attachment.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: startupSource + "\n;\n" + pageSource,
    runImmediately: true,
  });
  browser.on("Runtime.consoleAPICalled", (params, message) => {
    if (message?.sessionId !== sessionId || !isFeatureSettingsOwnerTarget(target)) return;
    const sample = parseStartupTimingEvent(params);
    if (sample) log("Startup timing " + JSON.stringify(sample));
  });
  await send("Runtime.enable");
  await send("Page.enable");

  const refreshPageTheme = async (reason) => {
    await applyCssInChunks(send, themeCss);
    await applyThemeAssets(send, artworkDataUri, logoDataUri, accentAssetPacks);
    const result = await send("Runtime.evaluate", {
      expression: pageSource,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "Runtime injection failed",
      );
    }
    if (reason === "navigation") log(`Theme reapplied after navigation (${String(target.targetId).slice(0, 8)})`);
  };

  let navigationRefreshTimer = null;
  browser.on("Page.loadEventFired", (_params, message) => {
    if (message?.sessionId && message.sessionId !== sessionId) return;
    if (navigationRefreshTimer) clearTimeout(navigationRefreshTimer);
    navigationRefreshTimer = setTimeout(() => {
      navigationRefreshTimer = null;
      refreshPageTheme("navigation").catch((error) => {
        log(`Theme reapply after navigation failed: ${error.message}`);
      });
    }, 350);
  });

  browser.on("Runtime.bindingCalled", async (params, message) => {
    if (message?.sessionId && message.sessionId !== sessionId) return;
    if (params?.name === featureSettingsBinding) {
      if (!isFeatureSettingsOwnerTarget(target)) return;
      try {
        const payload = JSON.parse(params.payload);
        hostFeatureSettings = normalizeHostFeatureSettings(payload);
        await syncMainFeatureSettings();
      } catch (error) {
        log(`Codex Plus Pro settings update failed: ${error.message}`);
      }
    } else if (params?.name === extensionUpdatesBinding) {
      if (!isFeatureSettingsOwnerTarget(target)) return;
      try {
        let payload;
        try {
          if (typeof params.payload !== "string" || params.payload.length > 8192) throw new Error();
          payload = JSON.parse(params.payload);
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
        } catch { throw new Error("扩展更新请求格式无效"); }
        const result = await extensionUpdates.handle(payload);
        await postExtensionUpdateResult(send, result);
      } catch (error) {
        await postExtensionUpdateResult(send, extensionUpdates.snapshot("failed", error.message))
          .catch(() => log("Extension check result could not reach a closed renderer"));
      }
    } else if (params?.name === managedVersionCleanupBinding) {
      try {
        const payload = JSON.parse(params.payload || "{}");
        if (payload?.action !== "cleanup-version") throw new Error("Unsupported managed version cleanup action");
        const version = String(payload.version || "").trim();
        if (!version) throw new Error("Managed version is required");
        await postManagedVersionCleanupResult(send, {
          state: "running",
          version,
          status: "正在清理版本",
          detail: "正在删除版本目录和对应下载文件，请稍候。",
        });
        const result = await runManagedVersionCleanup(send, version);
        await postManagedVersionCleanupResult(send, result);
      } catch (error) {
        log(`Codex Plus Pro managed version cleanup failed: ${error.message}`);
        await postManagedVersionCleanupResult(send, {
          ok: false,
          state: "failed",
          status: "清理版本失败",
          detail: error.message,
        });
      }
    } else if (params?.name === officialUpgradeBinding) {
      try {
        const payload = JSON.parse(params.payload || "{}");
        if (payload?.action !== "import-latest") throw new Error("Unsupported official upgrade action");
        await postOfficialUpgradeResult(send, {
          state: "running",
          status: "正在下载并导入官方新版",
          detail: "正在调用 resolve-store-fe3-direct.ps1 -Import -Force，请保持 Codex Plus Pro 运行。",
        });
        const result = await runOfficialImportUpgrade(send);
        await postOfficialUpgradeResult(send, result);
      } catch (error) {
        log(`Codex Plus Pro official upgrade failed: ${error.message}`);
        await postOfficialUpgradeResult(send, {
          ok: false,
          state: "failed",
          status: "下载或导入失败",
          detail: error.message,
        });
      }
    } else if (params?.name === versionCheckBinding) {
      try {
        const payload = JSON.parse(params.payload || "{}");
        if (payload?.action !== "check-latest") throw new Error("Unsupported version check action");
        await postVersionCheckResult(send, {
          state: "running",
          status: "正在检查官方最新版",
          detail: "正在读取 Microsoft Store 最新版本信息，请稍候。",
        });
        const result = await runVersionCheck();
        await postVersionCheckResult(send, result);
      } catch (error) {
        log(`Codex Plus Pro manual version check failed: ${error.message}`);
        await postVersionCheckResult(send, {
          ok: false,
          state: "failed",
          updateState: "check-failed",
          status: "在线检查失败",
          detail: error.message,
        });
      }
    }
  });
  await send("Runtime.addBinding", { name: featureSettingsBinding });
  await send("Runtime.addBinding", { name: officialUpgradeBinding });
  await send("Runtime.addBinding", { name: versionCheckBinding });
  await send("Runtime.addBinding", { name: extensionUpdatesBinding });
  await send("Runtime.addBinding", { name: managedVersionCleanupBinding });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const ready = await send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if (ready?.result?.value === "interactive" || ready?.result?.value === "complete") break;
    } catch {}
    await delay(250);
  }

  await refreshPageTheme("initial");
  log(`Theme active in ${target.title || "Codex"} (${String(target.targetId).slice(0, 8)})`);
  return sessionId;
}

async function attachToMainTarget(port) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 2500);
  const mainTarget = (targets || []).find((target) => target.webSocketDebuggerUrl);
  if (!mainTarget) throw new Error("Main-process DevTools target missing");
  const cdp = await createCdpConnection(mainTarget.webSocketDebuggerUrl, () => {
    if (mainConnection === cdp) mainConnection = null;
  });
  mainConnection = cdp;
  await cdp.send("Runtime.enable");
  const result = await cdp.send("Runtime.evaluate", {
    expression: mainControllerSource,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    mainConnection.close();
    mainConnection = null;
    throw new Error(
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Window controller failed",
    );
  }
  await syncMainFeatureSettings();
  log("Codex Plus Pro window controller active");
}

function normalizeHostFeatureSettings(value) {
  const accent = SETTINGS_ACCENT_KEYS.includes(value?.accent)
    ? value.accent
    : "pokedex";
  const wallpaperStrength = Number.isFinite(Number(value?.wallpaperStrength))
    ? Math.max(0, Math.min(100, Math.round(Number(value.wallpaperStrength))))
    : 72;
  return {
    theme: value?.theme !== false,
    pet: value?.pet !== false,
    modelPicker: value?.modelPicker !== false,
    accent,
    wallpaperStrength,
    wallpaperMode: value?.wallpaperMode === "custom" ? "custom" : "default",
    logoMode: value?.logoMode === "custom" ? "custom" : "default",
    petMotion: value?.petMotion === "reduced" ? "reduced" : "full",
    modelDensity: value?.modelDensity === "comfortable" ? "comfortable" : "compact",
  };
}

async function syncMainFeatureSettings() {
  const nextPet = hostFeatureSettings.pet;
  log("syncMainFeatureSettings pet=" + nextPet);
  if (mainConnection) {
    const expression = `globalThis.__codexPokedexPetWindowController?.setFeatures(${JSON.stringify({
      pet: nextPet,
    })})`;
    try {
      const result = await mainConnection.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Window settings failed",
        );
      }
      if (result.result?.value?.pet === nextPet) {
        rendererPetState = nextPet;
        return;
      }
      log("Codex window controller is not installed; using renderer pet bridge");
    } catch (error) {
      log(`Codex window controller sync failed; using renderer pet bridge: ${error.message}`);
    }
  }
  rendererPetSync = rendererPetSync.then(async () => {
    if (mainConnection || rendererPetState === nextPet) return true;
    const message = { type: nextPet ? "avatar-overlay-open" : "avatar-overlay-close" };
    const sent = await sendRendererAvatarOverlayMessage(message);
    if (sent) rendererPetState = nextPet;
    return sent;
  });
  await rendererPetSync;
}

async function sendRendererAvatarOverlayMessage(message) {
  const expression = `(() => {
    const message = ${JSON.stringify(message)};
    try {
      if (typeof window.electronBridge?.sendMessageFromView !== "function") return { ok: false };
      const pending = window.electronBridge.sendMessageFromView(message);
      pending?.catch?.(() => {});
      return { ok: true };
    } catch {
      return { ok: false };
    }
  })()`;
  const sessions = [...pageSessions.values()]
    .filter((session) => {
      const url = String(session.target?.url || "");
      const type = String(session.target?.type || "");
      return (type === "page" || type === "webview") && url.startsWith("app://");
    })
    .sort((left, right) => {
      const rank = (session) => String(session.target?.url || "").includes("/index.html") ? 0 : 1;
      return rank(left) - rank(right);
    });
  for (const session of sessions) {
    try {
      const result = await session.send("Runtime.evaluate", {
        expression,
        awaitPromise: false,
        returnByValue: true,
      });
      if (!result.exceptionDetails && result.result?.value?.ok === true) return true;
    } catch {}
  }
  return false;
}

function createCdpConnection(url, onClose) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const eventListeners = new Map();
    let nextId = 1;
    let settled = false;
    const connection = {
      send(method, params = {}, sessionId) {
        if (socket.readyState !== WebSocket.OPEN) {
          return Promise.reject(new Error("DevTools socket is not open"));
        }
        const id = nextId++;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        socket.send(JSON.stringify(payload));
        return new Promise((resolveRequest, rejectRequest) => {
          pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
        });
      },
      on(method, listener) {
        let listeners = eventListeners.get(method);
        if (!listeners) {
          listeners = new Set();
          eventListeners.set(method, listeners);
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close() {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      },
    };
    socket.addEventListener("open", () => {
      settled = true;
      resolve(connection);
    }, { once: true });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        for (const listener of eventListeners.get(message.method) || []) {
          Promise.resolve(listener(message.params, message)).catch((error) => {
            log(`DevTools event ${message.method} failed: ${error.message}`);
          });
        }
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      if (!settled) reject(new Error("Unable to open DevTools socket"));
    }, { once: true });
    socket.addEventListener("close", () => {
      for (const request of pending.values()) request.reject(new Error("DevTools socket closed"));
      pending.clear();
      onClose?.();
    });
  });
}

function invalidatePageSession(targetId, sessionId, reason) {
  if (!targetId) return false;
  const current = pageSessions.get(targetId);
  if (!current || (sessionId && current.sessionId !== sessionId)) return false;
  pageSessions.delete(targetId);
  pageTargetsBySessionId.delete(current.sessionId);
  attachedTargetIds.delete(targetId);
  log(`Codex page session invalidated target=${String(targetId).slice(0, 8)} reason=${reason || "unknown"}`);
  return true;
}

function clearPageSessions(reason) {
  for (const targetId of pageSessions.keys()) {
    pageSessions.delete(targetId);
  }
  pageTargetsBySessionId.clear();
  attachedTargetIds.clear();
  attachingTargetIds.clear();
  if (reason) log(`Codex page sessions cleared reason=${reason}`);
}

async function fetchJson(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseArguments(argumentsList) {
  const parsed = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = argumentsList[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function decodeBase64Option(value) {
  if (!value || typeof value !== "string") return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function parseJsonOption(value, fallback) {
  const text = decodeBase64Option(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function describeUpdateState(state, latestVersion = "") {
  const version = String(latestVersion || "").trim();
  if (state === "outdated") return "发现新版 " + version;
  if (state === "current") return "已是最新版 " + version;
  if (state === "unavailable") return "未能读取 Store 最新版本";
  if (state === "check-failed") return "在线检查失败";
  return "在线检查未配置 Store product id";
}

function normalizeVersionInfo(value) {
  const clean = (input, fallback = "unknown") => {
    const text = String(input ?? "").trim();
    return text || fallback;
  };
  return {
    plusVersion: WINDOWS_SCOPE_A_VERSION,
    appSource: clean(value.appSource),
    appVersion: clean(value.appVersion),
    appKind: clean(value.appKind),
    appPath: clean(value.appPath, ""),
    storeAppxVersion: clean(value.storeAppxVersion, ""),
    storeAppxKind: clean(value.storeAppxKind, ""),
    storeAppxPath: clean(value.storeAppxPath, ""),
    latestVersion: clean(value.latestVersion, ""),
    updateState: clean(value.updateState, "not-configured"),
    updateStatus: clean(value.updateStatus, "在线检查未配置 Store product id"),
    managedCount: Math.max(0, Number.parseInt(String(value.managedCount ?? "0"), 10) || 0),
    managedLatestVersion: clean(value.managedLatestVersion, ""),
    managedLatestKind: clean(value.managedLatestKind, ""),
    managedLatestPath: clean(value.managedLatestPath, ""),
    managedVersions: normalizeManagedVersions(value.managedVersions),
    scanTimeUtc: clean(value.scanTimeUtc, ""),
  };
}

function normalizeManagedVersions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      version: String(item?.Version ?? item?.version ?? "").trim(),
      path: String(item?.Path ?? item?.path ?? "").trim(),
      appKind: String(item?.AppKind ?? item?.appKind ?? "").trim(),
    }))
    .filter((item) => item.version && item.path);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}



function resolveAssetPath(assetReference, assetsDirectory) {
  if (!assetReference || typeof assetReference !== "string") return null;
  const trimmed = assetReference.trim();
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed)) return trimmed;
  // Relative paths resolve under windows/source/assets/
  return path.resolve(assetsDirectory, trimmed);
}

async function readOptionalJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    log(`theme-packs.json ignored (${filePath}): ${error.message}`);
    return null;
  }
}

function mergeAccentPathMaps(...maps) {
  const merged = {};
  for (const key of ACCENT_PACK_KEYS) {
    merged[key] = {};
  }
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const key of ACCENT_PACK_KEYS) {
      const entry = map[key];
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.wallpaper === "string" && entry.wallpaper.trim()) {
        merged[key].wallpaper = entry.wallpaper.trim();
      }
      if (typeof entry.logo === "string" && entry.logo.trim()) {
        merged[key].logo = entry.logo.trim();
      }
    }
  }
  return merged;
}

/** Fill only empty wallpaper/logo slots from a fallback map (does not overwrite JSON). */
function fillMissingAccentPaths(primaryMap, fallbackMap) {
  const filled = {};
  for (const key of ACCENT_PACK_KEYS) {
    const primary = primaryMap?.[key] || {};
    const fallback = fallbackMap?.[key] || {};
    filled[key] = {
      wallpaper: primary.wallpaper || fallback.wallpaper || null,
      logo: primary.logo || fallback.logo || null,
    };
  }
  return filled;
}

/**
 * Build per-accent default wallpaper/logo data URIs.
 * Prefer theme-packs.json (source first, then optional user overlay).
 * Built-in path map is only a fallback for missing accents/fields.
 * Missing image files fall back to the default wallpaper/logo data URIs.
 */
async function buildAccentAssetPacks({
  defaultWallpaperDataUri,
  defaultLogoDataUri,
  defaultWallpaperPath,
  defaultLogoPath,
}) {
  const assetsDirectory = path.join(scriptDirectory, "assets");
  const sourcePacksPath = path.join(scriptDirectory, "theme-packs.json");
  const userPacksPath = path.join(
    process.env.LOCALAPPDATA || process.env.TEMP || scriptDirectory,
    "Codex-Plus-Pro",
    "theme-packs.json",
  );

  const builtInPathMap = {
    pokedex: {
      wallpaper: path.basename(defaultWallpaperPath),
      logo: path.basename(defaultLogoPath),
    },
    lagoon: {
      wallpaper: "alternate-trainer-camp.jpg",
      logo: "pokeball-logo-user.png",
    },
    forest: {
      wallpaper: "alternate-trainer-camp.jpg",
      logo: "pokeball-logo-user.png",
    },
    graphite: {
      wallpaper: "alternate-trainer-camp.jpg",
      logo: path.basename(defaultLogoPath),
    },
    aria: {
      wallpaper: "alternate-trainer-camp.jpg",
      logo: "pokeball-logo-user.png",
    },
  };

  // Prefer JSON config: source theme-packs.json is the primary map.
  // User JSON (if any) only overlays fields. Built-in fills remaining gaps.
  const sourcePacksDocument = await readOptionalJsonFile(sourcePacksPath);
  const userPacksDocument = await readOptionalJsonFile(userPacksPath);
  const sourceAccents = sourcePacksDocument?.accents;
  const userAccents = userPacksDocument?.accents;
  const hasSourcePacks = sourceAccents && typeof sourceAccents === "object";
  const hasUserPacks = userAccents && typeof userAccents === "object";

  let pathMap;
  if (hasSourcePacks || hasUserPacks) {
    // JSON-first: start from empty, apply source, then user, then built-in only for blanks.
    pathMap = mergeAccentPathMaps(
      hasSourcePacks ? sourceAccents : null,
      hasUserPacks ? userAccents : null,
    );
    pathMap = fillMissingAccentPaths(pathMap, builtInPathMap);
    if (hasSourcePacks) log(`theme-packs: primary source ${sourcePacksPath}`);
    if (hasUserPacks) log(`theme-packs: user overlay ${userPacksPath}`);
  } else {
    pathMap = mergeAccentPathMaps(builtInPathMap);
    log("theme-packs: no theme-packs.json found; using built-in path map");
  }

  // Dedupe loads when several accents share the same file.
  const dataUriByAbsolutePath = new Map();
  dataUriByAbsolutePath.set(path.resolve(defaultWallpaperPath), defaultWallpaperDataUri);
  dataUriByAbsolutePath.set(path.resolve(defaultLogoPath), defaultLogoDataUri);

  async function loadPathAsDataUri(absolutePath, kind) {
    const resolved = path.resolve(absolutePath);
    if (dataUriByAbsolutePath.has(resolved)) return dataUriByAbsolutePath.get(resolved);
    try {
      await fs.access(resolved);
    } catch {
      log(`theme-packs: missing ${kind} file ${resolved}; using default`);
      return String(kind || "").startsWith("logo") ? defaultLogoDataUri : defaultWallpaperDataUri;
    }
    const dataUri = await loadCompressedDataUri(resolved, kind);
    dataUriByAbsolutePath.set(resolved, dataUri);
    return dataUri;
  }

  const accentAssetPacks = {};
  for (const accentKey of ACCENT_PACK_KEYS) {
    const entry = pathMap[accentKey] || {};
    const wallpaperAbsolute = resolveAssetPath(entry.wallpaper, assetsDirectory) || defaultWallpaperPath;
    const logoAbsolute = resolveAssetPath(entry.logo, assetsDirectory) || defaultLogoPath;
    const wallpaperDataUri = await loadPathAsDataUri(wallpaperAbsolute, `wallpaper-${accentKey}`);
    const logoDataUri = await loadPathAsDataUri(logoAbsolute, `logo-${accentKey}`);
    accentAssetPacks[accentKey] = {
      wallpaper: wallpaperDataUri,
      logo: logoDataUri,
    };
  }
  return accentAssetPacks;
}

async function loadCompressedDataUri(sourcePath, kind) {
  const cacheDirectory = path.join(
    process.env.LOCALAPPDATA || process.env.TEMP || scriptDirectory,
    "Codex-Plus-Pro",
    "asset-cache",
  );
  await fs.mkdir(cacheDirectory, { recursive: true });
  const sourceStat = await fs.stat(sourcePath);
  const cacheName = `${kind}-${sourceStat.size}-${sourceStat.mtimeMs}.txt`;
  const cachePath = path.join(cacheDirectory, cacheName);
  try {
    const cached = await fs.readFile(cachePath, "utf8");
    if (cached.startsWith("data:image/")) return cached;
  } catch {}

  const raw = await fs.readFile(sourcePath);
  // Small enough assets can be inlined directly.
  if (raw.length <= 220 * 1024) {
    const mime = sourcePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const dataUri = `data:${mime};base64,${raw.toString("base64")}`;
    await fs.writeFile(cachePath, dataUri, "utf8");
    return dataUri;
  }

  // Compress large wallpaper/logo with System.Drawing (Windows).
  const compressed = await compressImageWithPowerShell(sourcePath, kind);
  await fs.writeFile(cachePath, compressed, "utf8");
  return compressed;
}

function compressImageWithPowerShell(sourcePath, kind) {
  const isLogoKind = String(kind || "").startsWith("logo");
  const maxWidth = isLogoKind ? 256 : 1600;
  const quality = isLogoKind ? 90 : 72;
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile(${JSON.stringify(sourcePath)})
try {
  $ratio = [Math]::Min(1.0, ${maxWidth} / [double]$source.Width)
  $width = [Math]::Max(1, [int][Math]::Round($source.Width * $ratio))
  $height = [Math]::Max(1, [int][Math]::Round($source.Height * $ratio))
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, $width, $height)
    } finally { $graphics.Dispose() }
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $encoder = [System.Drawing.Imaging.Encoder]::Quality
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]${quality})
    $stream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($stream, $codec, $params)
      $bytes = $stream.ToArray()
      Write-Output ('data:image/jpeg;base64,' + [Convert]::ToBase64String($bytes))
    } finally { $stream.Dispose(); $params.Dispose() }
  } finally { $bitmap.Dispose() }
} finally { $source.Dispose() }
`.trim();

  return new Promise((resolve, reject) => {

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const dataUri = stdout.trim();
      if (code === 0 && dataUri.startsWith("data:image/")) resolve(dataUri);
      else reject(new Error(stderr || `image compression failed (${code})`));
    });
  });
}

function buildThemeAssetSource(wallpaperDataUri, logoDataUri, accentAssetPacks = null) {
  // Apply in two steps so a single evaluate stays smaller.
  // Also expose default asset URIs + accent packs so the page can restore them on "reset"
  // and so first paint uses the saved accent pack (not always pokedex defaults).
  return `(() => {
    if (!(${isCodexAppDocument.toString()})(location.href)) return { ok: true, excluded: true };
    const root = document.documentElement;
    if (!root) return { ok: false };
    window.__codexPlusProDefaultWallpaper = ${JSON.stringify(wallpaperDataUri)};
    window.__codexPlusProDefaultLogo = ${JSON.stringify(logoDataUri)};
    window.__codexPlusProAccentAssetPacks = ${JSON.stringify(accentAssetPacks || {
      pokedex: { wallpaper: wallpaperDataUri, logo: logoDataUri },
    })};

    // Resolve the accent the user last saved (before page runtime applies settings).
    let savedAccent = "pokedex";
    let wallpaperMode = "default";
    let logoMode = "default";
    try {
      const saved = JSON.parse(localStorage.getItem("codex-plus-pro-settings-v1") || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.accent === "string" && saved.accent) savedAccent = saved.accent;
        if (saved.wallpaperMode === "custom") wallpaperMode = "custom";
        if (saved.logoMode === "custom") logoMode = "custom";
      }
    } catch {}

    const packs = window.__codexPlusProAccentAssetPacks || {};
    const pack = packs[savedAccent] || packs.pokedex || {};
    const packWallpaper = pack.wallpaper || window.__codexPlusProDefaultWallpaper || "";
    const packLogo = pack.logo || window.__codexPlusProDefaultLogo || "";

    // Prefer custom uploads; otherwise use accent pack from theme-packs.json.
    let wallpaperUri = packWallpaper;
    let logoUri = packLogo;
    if (wallpaperMode === "custom") {
      try {
        const customWallpaper = localStorage.getItem("codex-plus-pro-wallpaper-v1") || "";
        if (customWallpaper.startsWith("data:image/")) wallpaperUri = customWallpaper;
      } catch {}
    }
    if (logoMode === "custom") {
      try {
        const customLogo = localStorage.getItem("codex-plus-pro-logo-v1") || "";
        if (customLogo.startsWith("data:image/")) logoUri = customLogo;
      } catch {}
    }

    if (wallpaperUri) {
      root.style.setProperty("--codex-pokedex-wallpaper", "url(" + JSON.stringify(wallpaperUri) + ")");
    }
    if (logoUri) {
      root.style.setProperty("--codex-pokedex-ball-logo", "url(" + JSON.stringify(logoUri) + ")");
    }

    const style = document.getElementById("codex-pokedex-theme-style");
    if (style && style.textContent && style.textContent.includes(${JSON.stringify(TINY_JPEG)})) {
      if (wallpaperUri) {
        style.textContent = style.textContent.split(${JSON.stringify(TINY_JPEG)}).join(wallpaperUri);
      }
    }
    if (style && style.textContent && style.textContent.includes(${JSON.stringify(TINY_PNG)})) {
      if (logoUri) {
        style.textContent = style.textContent.split(${JSON.stringify(TINY_PNG)}).join(logoUri);
      }
    }
    return { ok: true, wallpaper: true, accent: savedAccent, wallpaperMode, logoMode };
  })()`;
}

async function applyThemeAssets(send, wallpaperDataUri, logoDataUri, accentAssetPacks = null) {
  const wallpaperExpression = buildThemeAssetSource(wallpaperDataUri, logoDataUri, accentAssetPacks);
  const logoExpression = `(() => {
    if (!(${isCodexAppDocument.toString()})(location.href)) return { ok: true, excluded: true };
    // Logo already applied with wallpaper step when packs are available.
    // Only fill a missing default logo; never overwrite a custom or pack logo.
    const root = document.documentElement;
    if (!root) return { ok: false };
    const currentLogo = root.style.getPropertyValue("--codex-pokedex-ball-logo");
    if (!currentLogo && root.getAttribute("data-codex-plus-logo-mode") !== "custom") {
      const packs = window.__codexPlusProAccentAssetPacks || {};
      let accent = "pokedex";
      try {
        const saved = JSON.parse(localStorage.getItem("codex-plus-pro-settings-v1") || "null");
        if (saved?.accent) accent = saved.accent;
      } catch {}
      const packLogo = packs[accent]?.logo || packs.pokedex?.logo || window.__codexPlusProDefaultLogo;
      if (packLogo) {
        root.style.setProperty("--codex-pokedex-ball-logo", "url(" + JSON.stringify(packLogo) + ")");
      }
    }
    return { ok: true, logo: true };
  })()`;

  const wallpaperResult = await send("Runtime.evaluate", {
    expression: wallpaperExpression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (wallpaperResult.exceptionDetails) {
    throw new Error(wallpaperResult.exceptionDetails.exception?.description ?? "Wallpaper apply failed");
  }
  const logoResult = await send("Runtime.evaluate", {
    expression: logoExpression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (logoResult.exceptionDetails) {
    throw new Error(logoResult.exceptionDetails.exception?.description ?? "Logo apply failed");
  }
  if (!wallpaperResult.result?.value?.excluded && !logoResult.result?.value?.excluded) log("Wallpaper and logo assets applied");
}

async function applyCssInChunks(send, cssText) {
  const CSS_CHUNK_SIZE = 32768;
  const startedAt = Date.now();
  let atomicFailure = null;

  // One textContent assignment lets the browser parse and apply the stylesheet once.
  // Keep a bounded chunk fallback for older CDP hosts that reject larger evaluate payloads.
  try {
    const evalResult = await send("Runtime.evaluate", {
      expression: `(() => {
        if (!(${isCodexAppDocument.toString()})(location.href)) return { ok: true, excluded: true };
        const STYLE_ID = "codex-pokedex-theme-style";
        const cssText = ${JSON.stringify(cssText)};
        let style = document.getElementById(STYLE_ID);
        if (!style) {
          style = document.createElement("style");
          style.id = STYLE_ID;
          (document.head || document.documentElement).appendChild(style);
        }
        if (style.textContent === cssText) {
          return { ok: true, skipped: true, length: cssText.length };
        }
        style.textContent = cssText;
        return { ok: style.textContent.length === cssText.length, skipped: false, length: style.textContent.length };
      })()`,
      returnByValue: true,
    });
    if (evalResult.exceptionDetails) {
      throw new Error(evalResult.exceptionDetails.exception?.description ?? "Atomic CSS apply failed");
    }
    const result = evalResult.result?.value;
    if (!result?.ok) throw new Error("Atomic CSS length verification failed");
    if (result.excluded) return;
    log(
      result.skipped
        ? `CSS already applied (${cssText.length} chars)`
        : `CSS applied atomically (${cssText.length} chars, ${Date.now() - startedAt}ms)`,
    );
    return;
  } catch (error) {
    atomicFailure = error;
  }

  log(`Atomic CSS apply failed (${atomicFailure.message}); falling back to chunks`);
  const prepared = await send("Runtime.evaluate", {
    expression: `(() => {
      if (!(${isCodexAppDocument.toString()})(location.href)) return { excluded: true };
      const STYLE_ID = "codex-pokedex-theme-style";
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = "";
      return true;
    })()`,
    returnByValue: true,
  });
  if (prepared.result?.value?.excluded) return;

  for (let offset = 0; offset < cssText.length; offset += CSS_CHUNK_SIZE) {
    const chunk = cssText.slice(offset, offset + CSS_CHUNK_SIZE);
    const evalResult = await send("Runtime.evaluate", {
      expression: `(() => {
        if (!(${isCodexAppDocument.toString()})(location.href)) return { excluded: true };
        const style = document.getElementById("codex-pokedex-theme-style");
        if (!style) return false;
        style.textContent += ${JSON.stringify(chunk)};
        return style.textContent.length;
      })()`,
      returnByValue: true,
    });
    if (evalResult.exceptionDetails) {
      throw new Error(evalResult.exceptionDetails.exception?.description ?? "CSS chunk failed");
    }
    if (evalResult.result?.value?.excluded) return;
  }
  log(`CSS applied in chunks (${cssText.length} chars, ${Date.now() - startedAt}ms)`);
}


// Original mac settings/runtime UI (theme-focused on Windows A).
// CSS is applied atomically via applyCssInChunks, with a bounded fallback for CDP hosts
// that reject the full stylesheet payload.
// -----------------------------------------------------------------------------
// Windows Scope B2 contract:
// - Theme, accent, wallpaper/logo, model picker, and pet are user-controllable.
// - Settings UI renders theme + model picker + pet (PiP retired).
// - pet-notifications.js is injected after this runtime source.
// -----------------------------------------------------------------------------
function buildInjectionSource(css) {
  return `(function initializeRendererDecorations() {
    if (!(${isCodexAppDocument.toString()})(location.href)) return { active: false, excluded: true };
    if (!document.documentElement) {
      document.addEventListener("DOMContentLoaded", initializeRendererDecorations, { once: true });
      return;
    }
    const STYLE_ID = "codex-pokedex-theme-style";
    const THEME_ATTRIBUTE = "data-codex-pokedex-theme";
    const HOST_THEME_ATTRIBUTE = "data-theme";
    const DARK_THEME_CLASS = "electron-dark";
    const DARK_THEME_COMPAT_ATTRIBUTE = "data-codex-plus-dark-theme-compat";
    const OVERLAY_ATTRIBUTE = "data-codex-pokedex-avatar-overlay";
    const HOME_ATTRIBUTE = "data-codex-pokedex-home";
    const HOME_PANEL_ATTRIBUTE = "data-codex-pokedex-home-panel";
    const MAIN_SURFACE_ATTRIBUTE = "data-codex-pokedex-main-surface";
    const HEADER_ATTRIBUTE = "data-codex-pokedex-header";
    const COMPOSER_ATTRIBUTE = "data-codex-pokedex-composer";
    const APPROVAL_SURFACE_ATTRIBUTE = "data-codex-approval-surface";
    const APPROVAL_MCP_ATTRIBUTE = "data-codex-approval-mcp";
    const TASK_RUNNING_ATTRIBUTE = "data-codex-pokedex-task-running";
    const TASK_STATUS_ATTRIBUTE = "data-codex-plus-task-status";
    const TASK_STATUS_STATE_ATTRIBUTE = "data-codex-plus-task-status-state";
    const FLAT_PICKER_ATTRIBUTE = "data-codex-pokedex-flat-picker";
    const FLAT_PICKER_SURFACE_ATTRIBUTE = "data-codex-pokedex-flat-picker-surface";
    const FLAT_PICKER_FAILURE_ATTRIBUTE = "data-codex-pokedex-flat-picker-failures";
    const FLAT_PICKER_TRIGGER_SELECTOR = 'button, [role="button"], [aria-haspopup="menu"]';
    const FLAT_PICKER_VERSION = "2.0.0";
    const ACTIVITY_CHANNEL_NAME = "codex-pokedex-pet-activity-v1";
    const SETTINGS_STORAGE_KEY = "codex-plus-pro-settings-v1";
    const CUSTOM_WALLPAPER_STORAGE_KEY = "codex-plus-pro-wallpaper-v1";
    const CUSTOM_LOGO_STORAGE_KEY = "codex-plus-pro-logo-v1";
    const ADAPTIVE_THEME_STORAGE_KEY = "codex-plus-pro-adaptive-theme-v1";
    const ADAPTIVE_THEME_STRATEGY = "wallpaper-led-logo-accent";
    const SETTINGS_CHANNEL_NAME = "codex-plus-pro-settings-v1";
    const SETTINGS_BINDING = "__codexPlusProSettingsChanged";
    const OFFICIAL_UPGRADE_BINDING = "__codexPlusProOfficialUpgrade";
    const VERSION_CHECK_BINDING = "__codexPlusProVersionCheck";
    const MANAGED_VERSION_CLEANUP_BINDING = "__codexPlusProManagedVersionCleanup";
    const VERSION_INFO = ${JSON.stringify(hostVersionInfo)};
    const SETTINGS_UI_VERSION = "win-settings-scope-b2-" + VERSION_INFO.plusVersion + "-service-extensions-v8";
    const FEATURE_ATTRIBUTES = {
      theme: "data-codex-plus-theme",
      pet: "data-codex-plus-pet",
      modelPicker: "data-codex-plus-model-picker",
    };
    const initialRoute = new URL(location.href).searchParams.get("initialRoute") || "";
    const initialThreadId = initialRoute.match(new RegExp("^/hotkey-window/thread/([0-9a-f-]{36})", "i"))?.[1] || "";
    const isAvatarOverlay = initialRoute === "/avatar-overlay";
    const isHotkeyWindow = initialRoute.startsWith("/hotkey-window");
    const css = ${JSON.stringify(css)};
    const previousRuntimeCleanup = window.__codexPlusProRuntimeCleanup;
    if (typeof previousRuntimeCleanup === "function") {
      previousRuntimeCleanup();
    } else {
      window.__codexPokedexThemeObserver?.disconnect();
      window.__codexPlusProSettingsUiCleanup?.();
      const previousActivityChannel = window.__codexPokedexActivityChannel;
      window.__codexPokedexActivityChannel = null;
      if (previousActivityChannel) {
        window.setTimeout(() => {
          try { previousActivityChannel.close(); } catch {}
        }, 250);
      }
      try { window.__codexPlusProSettingsChannel?.close(); } catch {}
      window.__codexPlusProSettingsChannel = null;
    }
    const syncNativeDarkThemeClass = () => {
      const root = document.documentElement;
      if (!root) return;
      const nativeTheme = String(root.getAttribute(HOST_THEME_ATTRIBUTE) || "").toLowerCase();
      if (nativeTheme === "dark") {
        if (!root.classList.contains(DARK_THEME_CLASS)) {
          root.classList.add(DARK_THEME_CLASS);
          root.setAttribute(DARK_THEME_COMPAT_ATTRIBUTE, "on");
        }
        return;
      }
      if (root.getAttribute(DARK_THEME_COMPAT_ATTRIBUTE) === "on") {
        root.classList.remove(DARK_THEME_CLASS);
        root.removeAttribute(DARK_THEME_COMPAT_ATTRIBUTE);
      }
    };
    document.querySelector(".codex-plus-pro-settings-button")?.remove();
    document.querySelector(".codex-plus-pro-settings-popover")?.remove();
    document.querySelector(".codex-plus-pro-settings-backdrop")?.remove();
    document.querySelector(".codex-plus-pro-confirm-backdrop")?.remove();
    document.documentElement?.removeAttribute("data-codex-plus-model-picker");
    document.documentElement?.removeAttribute("data-codex-pokedex-flat-picker");
    for (const element of document.querySelectorAll(
      ".codex-pokedex-flat-picker, [data-codex-pokedex-flat-picker-surface], [data-codex-pokedex-flat-picker-failures]",
    )) {
      if (element.matches(".codex-pokedex-flat-picker")) element.remove();
      else {
        element.removeAttribute("data-codex-pokedex-flat-picker-surface");
        element.removeAttribute("data-codex-pokedex-flat-picker-failures");
      }
    }
    for (const element of document.querySelectorAll("[" + COMPOSER_ATTRIBUTE + "]")) {
      element.removeAttribute(COMPOSER_ATTRIBUTE);
      element.classList.remove("composer-surface-chrome");
      element.style.removeProperty("border-width");
      element.style.removeProperty("border-style");
      element.style.removeProperty("border-color");
    }
    for (const element of document.querySelectorAll("[" + APPROVAL_SURFACE_ATTRIBUTE + "]")) {
      element.removeAttribute(APPROVAL_SURFACE_ATTRIBUTE);
    }
    for (const element of document.querySelectorAll("[" + TASK_STATUS_ATTRIBUTE + "]")) {
      element.removeAttribute(TASK_STATUS_ATTRIBUTE);
      element.removeAttribute(TASK_STATUS_STATE_ATTRIBUTE);
    }
    const SETTINGS_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>';
    const DEFAULT_FEATURE_SETTINGS = {
      theme: true,
      pet: true,
      modelPicker: true,
      accent: "pokedex",
      wallpaperStrength: 72,
      wallpaperMode: "default",
      logoMode: "default",
      petMotion: "full",
      modelDensity: "compact",
    };
    const ACCENT_OPTIONS = ${JSON.stringify(ACCENT_OPTIONS)};
    // When wallpaper/logo are on "default", follow the selected accent pack.
    // Custom uploads are never overwritten by accent changes.
    const resolveAccentPack = (accentKey) => {
      const packs = window.__codexPlusProAccentAssetPacks || {};
      const pack = packs[accentKey] || packs.pokedex || {};
      return {
        wallpaper: pack.wallpaper || window.__codexPlusProDefaultWallpaper || "",
        logo: pack.logo || window.__codexPlusProDefaultLogo || "",
      };
    };
    const normalizeFeatureSettings = (value) => {
      const accent = Object.hasOwn(ACCENT_OPTIONS, value?.accent) ? value.accent : "pokedex";
      const wallpaperStrength = Number.isFinite(Number(value?.wallpaperStrength))
        ? Math.max(0, Math.min(100, Math.round(Number(value.wallpaperStrength))))
        : 72;
      return {
        theme: value?.theme !== false,
        pet: value?.pet !== false,
        modelPicker: value?.modelPicker !== false,
        accent,
        wallpaperStrength,
        wallpaperMode: value?.wallpaperMode === "custom" ? "custom" : "default",
        logoMode: value?.logoMode === "custom" ? "custom" : "default",
        petMotion: value?.petMotion === "reduced" ? "reduced" : "full",
        modelDensity: value?.modelDensity === "comfortable" ? "comfortable" : "compact",
      };
    };
    const readFeatureSettings = () => {
      try {
        const value = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "null");
        return normalizeFeatureSettings(value || DEFAULT_FEATURE_SETTINGS);
      } catch {
        return { ...DEFAULT_FEATURE_SETTINGS };
      }
    };
    const readCustomWallpaper = () => {
      try {
        const value = localStorage.getItem(CUSTOM_WALLPAPER_STORAGE_KEY) || "";
        return value.startsWith("data:image/") ? value : "";
      } catch {
        return "";
      }
    };

    const readCustomLogo = () => {
      try {
        const value = localStorage.getItem(CUSTOM_LOGO_STORAGE_KEY) || "";
        return value.startsWith("data:image/") ? value : "";
      } catch {
        return "";
      }
    };

    const isStorageQuotaError = (error) => (
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      String(error?.message || "").toLowerCase().includes("exceeded the quota")
    );

    const setLocalStorageItemWithRollback = (key, value) => {
      const previousValue = localStorage.getItem(key);
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, value);
      } catch (error) {
        try {
          if (previousValue === null) localStorage.removeItem(key);
          else localStorage.setItem(key, previousValue);
        } catch {}
        if (isStorageQuotaError(error)) {
          throw new Error("本地存储空间不足，请先恢复默认壁纸或换一张更小的图片");
        }
        throw error;
      }
    };

    const readAdaptiveTheme = () => {
      try {
        const value = JSON.parse(localStorage.getItem(ADAPTIVE_THEME_STORAGE_KEY) || "null");
        if (!value || typeof value !== "object") return null;
        if (![value.color, value.dark, value.highlight].every((item) => /^#[0-9a-f]{6}$/i.test(String(item || "")))) {
          return null;
        }
        return {
          color: value.color,
          dark: value.dark,
          highlight: value.highlight,
          label: "自适应",
          generatedAt: value.generatedAt || "",
          source: value.source || "custom-assets",
          strategy: value.strategy || "",
        };
      } catch {
        return null;
      }
    };

    const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
    const componentToHex = (value) => clampNumber(Math.round(value), 0, 255).toString(16).padStart(2, "0");
    const rgbToHex = (rgb) => "#" + componentToHex(rgb.r) + componentToHex(rgb.g) + componentToHex(rgb.b);
    const rgbToHsl = (rgb) => {
      const r = rgb.r / 255;
      const g = rgb.g / 255;
      const b = rgb.b / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      const d = max - min;
      if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          default: h = ((r - g) / d + 4) / 6; break;
        }
      }
      return { h, s, l };
    };
    const hslToRgb = ({ h, s, l }) => {
      const hueToRgb = (p, q, t) => {
        let value = t;
        if (value < 0) value += 1;
        if (value > 1) value -= 1;
        if (value < 1 / 6) return p + (q - p) * 6 * value;
        if (value < 1 / 2) return q;
        if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
        return p;
      };
      if (s === 0) {
        const gray = l * 255;
        return { r: gray, g: gray, b: gray };
      }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return {
        r: hueToRgb(p, q, h + 1 / 3) * 255,
        g: hueToRgb(p, q, h) * 255,
        b: hueToRgb(p, q, h - 1 / 3) * 255,
      };
    };
    const normalizeAccentRgb = (rgb, role = "accent") => {
      const hsl = rgbToHsl(rgb);
      const saturationFloor = role === "highlight" ? 0.52 : 0.48;
      const saturationCeiling = role === "dark" ? 0.72 : 0.82;
      const lightFloor = role === "dark" ? 0.22 : role === "highlight" ? 0.54 : 0.42;
      const lightCeiling = role === "dark" ? 0.34 : role === "highlight" ? 0.68 : 0.56;
      return hslToRgb({
        h: hsl.h,
        s: clampNumber(Math.max(hsl.s, saturationFloor), saturationFloor, saturationCeiling),
        l: clampNumber(hsl.l, lightFloor, lightCeiling),
      });
    };
    const weightedAverage = (samples, fallback) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let total = 0;
      for (const sample of samples) {
        r += sample.rgb.r * sample.weight;
        g += sample.rgb.g * sample.weight;
        b += sample.rgb.b * sample.weight;
        total += sample.weight;
      }
      if (total <= 0) return fallback;
      return { r: r / total, g: g / total, b: b / total };
    };
    const mixRgb = (base, overlay, overlayWeight) => {
      if (!base) return overlay;
      if (!overlay) return base;
      const weight = clampNumber(overlayWeight, 0, 1);
      return {
        r: base.r * (1 - weight) + overlay.r * weight,
        g: base.g * (1 - weight) + overlay.g * weight,
        b: base.b * (1 - weight) + overlay.b * weight,
      };
    };
    const hueDistance = (left, right) => {
      if (!left || !right) return 0;
      const a = rgbToHsl(left);
      const b = rgbToHsl(right);
      const raw = Math.abs(a.h - b.h);
      return Math.min(raw, 1 - raw);
    };
    const extractImagePalette = (dataUri, options = {}) => new Promise((resolve, reject) => {
      if (!dataUri?.startsWith("data:image/")) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.onerror = () => reject(new Error("无法解析取色图片"));
      image.onload = () => {
        const maxSize = options.logo ? 80 : 120;
        const ratio = Math.min(1, maxSize / image.naturalWidth, maxSize / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
        if (!context) {
          reject(new Error("无法取色"));
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const vibrantSamples = [];
        const highlightSamples = [];
        const darkSamples = [];
        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3] / 255;
          if (alpha < (options.logo ? 0.2 : 0.08)) continue;
          const rgb = { r: data[index], g: data[index + 1], b: data[index + 2] };
          const hsl = rgbToHsl(rgb);
          if (hsl.l < 0.05 || hsl.l > 0.96) continue;
          const chromaWeight = alpha * (0.28 + hsl.s) * (0.6 + Math.abs(hsl.l - 0.52));
          if (hsl.s > 0.18) vibrantSamples.push({ rgb, weight: chromaWeight });
          if (hsl.s > 0.16 && hsl.l > 0.46) highlightSamples.push({ rgb, weight: chromaWeight * (0.8 + hsl.l) });
          if (hsl.l < 0.48) darkSamples.push({ rgb, weight: alpha * (0.4 + hsl.s) * (0.9 - hsl.l) });
        }
        const fallback = options.logo ? { r: 59, g: 130, b: 196 } : { r: 39, g: 125, b: 145 };
        resolve({
          vibrant: weightedAverage(vibrantSamples, fallback),
          highlight: weightedAverage(highlightSamples, fallback),
          dark: weightedAverage(darkSamples, fallback),
        });
      };
      image.src = dataUri;
    });
    const generateAdaptiveTheme = async ({ wallpaper = readCustomWallpaper(), logo = readCustomLogo() } = {}) => {
      const [wallpaperPalette, logoPalette] = await Promise.all([
        extractImagePalette(wallpaper, { logo: false }),
        extractImagePalette(logo, { logo: true }),
      ]);
      const fallbackAccent = { r: 59, g: 130, b: 196 };
      const wallpaperAccent = wallpaperPalette?.vibrant || logoPalette?.vibrant || fallbackAccent;
      const logoAccent = logoPalette?.vibrant || null;
      const logoHueDrift = hueDistance(wallpaperAccent, logoAccent);
      const logoAccentWeight = logoAccent ? (logoHueDrift > 0.22 ? 0.18 : 0.34) : 0;
      const accentBase = mixRgb(wallpaperAccent, logoAccent, logoAccentWeight);
      const darkBase = wallpaperPalette?.dark || logoPalette?.dark || accentBase;
      const wallpaperHighlight = wallpaperPalette?.highlight || accentBase;
      const logoHighlight = logoPalette?.highlight || logoAccent;
      const logoHighlightWeight = logoHighlight ? (logoHueDrift > 0.22 ? 0.42 : 0.58) : 0;
      const highlightBase = mixRgb(wallpaperHighlight, logoHighlight, logoHighlightWeight);
      const color = rgbToHex(normalizeAccentRgb(accentBase, "accent"));
      const dark = rgbToHex(normalizeAccentRgb(darkBase, "dark"));
      const highlight = rgbToHex(normalizeAccentRgb(highlightBase, "highlight"));
      const adaptive = {
        label: "自适应",
        color,
        dark,
        highlight,
        generatedAt: new Date().toISOString(),
        source: logo ? "custom-logo+wallpaper" : "custom-wallpaper",
        strategy: ADAPTIVE_THEME_STRATEGY,
      };
      localStorage.setItem(ADAPTIVE_THEME_STORAGE_KEY, JSON.stringify(adaptive));
      return adaptive;
    };
    const prepareLogo = (file) => new Promise((resolve, reject) => {
      if (!file?.type?.startsWith("image/")) {
        reject(new Error("请选择图片文件"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("无法读取图片"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("无法解析图片"));
        image.onload = () => {
          const candidates = [];
          const targetLength = 180 * 1024;
          for (const maxSize of [384, 256, 192, 128, 96]) {
            const ratio = Math.min(1, maxSize / image.naturalWidth, maxSize / image.naturalHeight);
            const width = Math.max(1, Math.round(image.naturalWidth * ratio));
            const height = Math.max(1, Math.round(image.naturalHeight * ratio));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { alpha: true });
            if (!context) {
              reject(new Error("无法处理图片"));
              return;
            }
            context.clearRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            for (const quality of [0.82, 0.68, 0.54]) {
              const webp = canvas.toDataURL("image/webp", quality);
              if (webp.startsWith("data:image/webp")) candidates.push(webp);
            }
            const png = canvas.toDataURL("image/png");
            candidates.push(png);
            const smallest = candidates.reduce((best, item) => item.length < best.length ? item : best, candidates[0]);
            if (smallest.length <= targetLength) {
              resolve(smallest);
              return;
            }
          }
          const smallest = candidates.reduce((best, item) => item.length < best.length ? item : best, candidates[0]);
          resolve(smallest);
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
    const prepareWallpaper = (file) => new Promise((resolve, reject) => {
      if (!file?.type?.startsWith("image/")) {
        reject(new Error("请选择图片文件"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("无法读取图片"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("无法解析图片"));
        image.onload = () => {
          const maxWidth = 2560;
          const maxHeight = 1600;
          const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
          const width = Math.max(1, Math.round(image.naturalWidth * ratio));
          const height = Math.max(1, Math.round(image.naturalHeight * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            reject(new Error("无法处理图片"));
            return;
          }
          context.fillStyle = "#fff8e9";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
    let featureSettings = readFeatureSettings();
    let hotkeyServicesPromise = null;
    let refreshFrame = 0;
    const COMPATIBILITY_CHECKLIST_VERSION = "ui-compatibility-v2";
    const COMPATIBILITY_CATEGORIES = Object.freeze([
      { key: "all", label: "全部" },
      { key: "global", label: "全局" },
      { key: "conversation", label: "对话界面" },
      { key: "programming", label: "编程界面" },
      { key: "settings", label: "设置界面" },
    ]);
    const COMPATIBILITY_STATUS_LABELS = Object.freeze({
      healthy: "正常",
      degraded: "已降级",
      fallbackActive: "备用规则生效",
      notObserved: "未观察到",
      unsupported: "不支持",
    });
    const COMPATIBILITY_ITEMS = Object.freeze([
      {
        id: "global.shell",
        category: "global",
        label: "主壳与主内容区",
        description: "Codex 主壳、主内容背景和页面边界的主题外壳。",
        anchors: [
          { name: "main-surface", selector: ".main-surface" },
          { name: "main-content-surface", selector: '[class*="MainContentSurface"]' },
        ],
        styleProbe: "theme-root",
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "global.header",
        category: "global",
        label: "顶部栏",
        description: "顶部导航、搜索和 Codex 窗口操作区域。",
        anchors: [
          { name: "header-tint", selector: ".app-header-tint" },
          { name: "safe-header-left", selector: '[class*="spacing-token-safe-header-left"]' },
        ],
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "global.sidebar",
        category: "global",
        label: "左侧导航",
        description: "新版窄导航 rail、项目和会话面板所在的侧边导航。",
        anchors: [
          { name: "app-shell-sidebar", selector: "#app-shell-sidebar" },
          { name: "navigation-rail", selector: '[data-app-navigation-rail="true"]' },
          { name: "sidebar-navigation", selector: ".sidebar-navigation" },
          { name: "legacy-app-shell-sidebar", selector: ".app-shell-left-panel" },
        ],
        fallbackAttribute: "data-codex-plus-compat-sidebar",
        risk: "high",
        repair: "reapply-and-enable-fallback",
      },
      {
        id: "global.status-surfaces",
        category: "global",
        label: "用量、配额和提示条",
        description: "用量提醒、配额状态和页面提示消息的主题表面。",
        anchors: [
          { name: "alert", selector: '[role="alert"]' },
          { name: "usage-banner", selector: '[class*="usage-banner"]' },
          { name: "quota", selector: '[class*="quota"]' },
        ],
        risk: "low",
        repair: "reapply",
      },
      {
        id: "global.scrollbars",
        category: "global",
        label: "页面滚动条",
        description: "侧栏、主内容区和弹层滚动条的主题颜色与宽度。",
        anchors: [
          { name: "document", selector: "body" },
          { name: "root", selector: "#root" },
        ],
        styleProbe: "theme-root",
        risk: "low",
        repair: "reapply",
      },
      {
        id: "conversation.home-suggestions",
        category: "conversation",
        label: "首页建议区",
        description: "首页建议卡片和快捷入口的主题表面。",
        anchors: [
          { name: "home-suggestions", selector: '[class~="group/home-suggestions"]' },
          { name: "suggestion-item", selector: '[class*="home-suggestion-list-item"]' },
        ],
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "conversation.composer",
        category: "conversation",
        label: "对话输入区",
        description: "输入框、发送按钮和输入区工具栏的主题外壳。",
        anchors: [
          { name: "utility-bar", selector: "[data-composer-utility-bar-scroll-area]" },
          { name: "composer-root", selector: "[data-codex-composer-root]" },
          { name: "composer-surface", selector: ".composer-surface-chrome" },
          { name: "responsive-footer", selector: "[data-composer-footer-responsive]" },
          { name: "contenteditable", selector: '[contenteditable="true"]' },
          { name: "role-textbox", selector: '[role="textbox"]' },
        ],
        styleProbe: "composer-surface",
        fallbackAttribute: "data-codex-plus-compat-composer",
        risk: "high",
        repair: "reapply-and-enable-fallback",
      },
      {
        id: "conversation.model-picker",
        category: "conversation",
        label: "模型栏",
        description: "新版 composer footer 中由 Codex 原生状态驱动的主题模型、思考强度和快速模式控制。",
        anchors: [
          { name: "themed-model-bar", selector: ".codex-pokedex-flat-picker" },
          { name: "intelligence-trigger", selector: 'button[data-codex-intelligence-trigger="true"]' },
          { name: "model-trigger-content", selector: '[class*="ModelPickerTriggerContent"]' },
          { name: "model-label", selector: '[class*="ModelPickerTriggerModelLabel"]' },
        ],
        styleProbe: "native-model-picker",
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "conversation.utility-bar",
        category: "conversation",
        label: "项目、分支和本地工具栏",
        description: "输入区上方的项目、分支、本地模式和工具按钮。",
        anchors: [
          { name: "utility-bar", selector: "[data-composer-utility-bar-scroll-area]" },
          { name: "project-selector-icon", selector: "[data-project-selector-icon]" },
        ],
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "conversation.thread-actions",
        category: "conversation",
        label: "对话操作区",
        description: "发送、停止和对话线程内的操作按钮。",
        anchors: [
          { name: "thread-scroll-container", selector: ".thread-scroll-container" },
          { name: "send-button", selector: 'button[aria-label="Send"]' },
          { name: "submit-button", selector: 'button[aria-label="Submit"]' },
          { name: "stop-button", selector: 'button[aria-label="Stop"]' },
        ],
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "programming.editor",
        category: "programming",
        label: "编辑器表面",
        description: "代码编辑器、代码输出和编辑器边界的主题表面。",
        anchors: [
          { name: "pierre-editor", selector: "[data-pierre-editor-surface]" },
          { name: "code-editor", selector: '[class*="code-editor"]' },
        ],
        risk: "high",
        repair: "reapply",
      },
      {
        id: "programming.diff-preview",
        category: "programming",
        label: "Diff 预览容器",
        description: "代码变更预览及其匿名全高布局宿主。",
        anchors: [
          { name: "file-diff", selector: '[class*="group/file-diff"]' },
          { name: "diff-header", selector: '[class*="group/turn-diff-header"]' },
        ],
        fallbackAttribute: "data-codex-plus-compat-diff-preview",
        risk: "high",
        repair: "reapply-and-enable-fallback",
      },
      {
        id: "programming.diff-file-row",
        category: "programming",
        label: "Diff 文件行",
        description: "变更文件行、增删颜色和文件操作按钮。",
        anchors: [
          { name: "diff-file-row", selector: '[class*="group/turn-diff-file-row"]' },
          { name: "git-added", selector: '[class*="text-codex-git-added"]' },
          { name: "git-deleted", selector: '[class*="text-codex-git-deleted"]' },
        ],
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "programming.run-status",
        category: "programming",
        label: "编程运行状态区",
        description: "编程任务运行结果、状态和代码输出区域。",
        anchors: [
          { name: "turn-diff", selector: '[class*="turn-diff"]' },
          { name: "status", selector: '[role="status"]' },
        ],
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "settings.entry",
        category: "settings",
        label: "Plus Pro 设置入口",
        description: "打开 Codex Plus Pro 设置面板的入口按钮。",
        anchors: [
          { name: "settings-button", selector: ".codex-plus-pro-settings-button" },
          { name: "settings-host", selector: '[data-codex-plus-pro-settings-host="on"]' },
        ],
        risk: "high",
        repair: "reapply",
      },
      {
        id: "settings.navigation",
        category: "settings",
        label: "设置分区导航",
        description: "主题、模型栏、宠物、兼容性和版本分区导航。",
        anchors: [
          { name: "settings-navigation", selector: ".codex-plus-pro-settings-navigation" },
          { name: "settings-tab", selector: "[data-settings-section-target]" },
        ],
        styleProbe: "settings-popover",
        risk: "high",
        repair: "reapply",
      },
      {
        id: "settings.content",
        category: "settings",
        label: "设置内容面板",
        description: "当前设置分区的内容、控件和诊断信息。",
        anchors: [
          { name: "settings-content", selector: ".codex-plus-pro-settings-content" },
          { name: "settings-section", selector: "[data-settings-section]" },
        ],
        styleProbe: "settings-popover",
        risk: "medium",
        repair: "reapply",
      },
      {
        id: "settings.version",
        category: "settings",
        label: "版本信息区",
        description: "Codex、Plus Pro 和本机保留版本的状态信息。",
        anchors: [
          { name: "version-check", selector: '[data-version-check-control="true"]' },
          { name: "managed-versions", selector: ".codex-plus-pro-managed-versions" },
        ],
        risk: "low",
        repair: "reapply",
      },
    ]);
    const COMPATIBILITY_STATUS_KEYS = new Set(Object.keys(COMPATIBILITY_STATUS_LABELS));
    const compatibilityState = {
      selectedCategory: "all",
      results: [],
      lastCheckedAt: "",
      checking: false,
      repairing: false,
    };
    const safeCompatibilityMatch = (anchors) => {
      for (const anchor of anchors || []) {
        try {
          const matches = document.querySelectorAll(anchor.selector);
          if (matches.length > 0) {
            return {
              name: anchor.name,
              selector: anchor.selector,
              count: matches.length,
            };
          }
        } catch (error) {
          console.warn("Codex Plus Pro compatibility selector skipped", anchor.selector, error);
        }
      }
      return null;
    };
    const compatibilitySelectorsSupported = (anchors) => (anchors || []).some((anchor) => {
      try {
        document.querySelector(anchor.selector);
        return true;
      } catch {
        return false;
      }
    });
    const runCompatibilityStyleProbe = (item) => {
      if (!item.styleProbe) return { ok: true, reason: "未配置样式探针" };
      if (item.styleProbe === "theme-root") {
        const root = document.documentElement;
        const style = document.getElementById(STYLE_ID);
        const ok = root?.getAttribute(THEME_ATTRIBUTE) === "on" && Boolean(style);
        return { ok, reason: ok ? "主题根节点和样式节点正常" : "主题根节点或样式节点未生效" };
      }
      if (item.styleProbe === "composer-surface") {
        const ok = Boolean(document.querySelector("[" + COMPOSER_ATTRIBUTE + "]"));
        return { ok, reason: ok ? "输入区已完成主题装饰" : "输入区主题装饰标记缺失" };
      }
      if (item.styleProbe === "native-model-picker") {
        const trigger = document.querySelector('button[data-codex-intelligence-trigger="true"]');
        const nativeRect = trigger?.getBoundingClientRect();
        const nativeVisible = trigger && getComputedStyle(trigger).visibility !== "hidden";
        const themedBar = document.querySelector(".codex-pokedex-flat-picker");
        const themedRect = themedBar?.getBoundingClientRect();
        const themedVisible = themedBar && getComputedStyle(themedBar).visibility !== "hidden";
        const nativeOk = Boolean(
          trigger &&
          trigger.getAttribute("aria-haspopup") === "menu" &&
          nativeVisible &&
          nativeRect &&
          nativeRect.width >= 40 &&
          nativeRect.height >= 20,
        );
        const themedOk = Boolean(
          themedBar &&
          themedVisible &&
          themedRect &&
          themedRect.width >= 180 &&
          themedRect.height >= 20,
        );
        const ok = nativeOk || themedOk;
        return {
          ok,
          reason: nativeOk
            ? "原生模型和思考强度触发器可见"
            : themedOk
              ? "主题模型栏可见并连接到原生状态"
              : "模型栏触发器或主题模型栏缺失、不可见",
        };
      }
      if (item.styleProbe === "settings-popover") {
        const popover = document.querySelector(".codex-plus-pro-settings-popover");
        const ok = Boolean(popover && !popover.hidden);
        return { ok, reason: ok ? "设置弹窗已打开并完成注入" : "设置弹窗尚未打开" };
      }
      return { ok: true, reason: "样式探针通过" };
    };
    const evaluateCompatibilityItem = (item) => {
      const matchedAnchor = safeCompatibilityMatch(item.anchors);
      if (!matchedAnchor) {
        const unsupported = !compatibilitySelectorsSupported(item.anchors);
        const status = unsupported ? "unsupported" : "notObserved";
        return {
          id: item.id,
          category: item.category,
          status,
          statusLabel: COMPATIBILITY_STATUS_LABELS[status],
          matchedAnchor: null,
          matchCount: 0,
          probe: { ok: false, reason: "当前页面未观察到该界面元素" },
          reason: unsupported
            ? "当前 Codex DOM 未提供可识别的兼容锚点。"
            : "该元素可能只在其他页面或打开对应面板后出现。",
          repairAvailable: false,
        };
      }
      const probe = runCompatibilityStyleProbe(item);
      const fallbackActive = Boolean(
        item.fallbackAttribute &&
        document.documentElement?.getAttribute(item.fallbackAttribute) === "fallback",
      );
      const status = fallbackActive ? "fallbackActive" : probe.ok ? "healthy" : "degraded";
      return {
        id: item.id,
        category: item.category,
        status,
        statusLabel: COMPATIBILITY_STATUS_LABELS[status],
        matchedAnchor,
        matchCount: matchedAnchor.count,
        probe,
        reason: fallbackActive
          ? "已启用该元素的已知兼容备用规则。"
          : probe.reason,
        repairAvailable: item.repair === "reapply" || item.repair === "reapply-and-enable-fallback",
      };
    };
    const runCompatibilityChecks = () => {
      const results = COMPATIBILITY_ITEMS.map(evaluateCompatibilityItem);
      compatibilityState.results = results;
      compatibilityState.lastCheckedAt = new Date().toISOString();
      return results;
    };
    const COMPATIBILITY_FALLBACK_ATTRIBUTES = new Set(
      COMPATIBILITY_ITEMS.map((item) => item.fallbackAttribute).filter(Boolean),
    );
    const COMPATIBILITY_ITEM_BY_ID = new Map(COMPATIBILITY_ITEMS.map((item) => [item.id, item]));
    const setCompatibilityFallback = (item, enabled) => {
      const attribute = item?.fallbackAttribute;
      if (!attribute || !COMPATIBILITY_FALLBACK_ATTRIBUTES.has(attribute)) return false;
      const root = document.documentElement;
      if (!root) return false;
      if (enabled) root.setAttribute(attribute, "fallback");
      else root.removeAttribute(attribute);
      return true;
    };
    const runCompatibilityRepair = async (itemId) => {
      const item = COMPATIBILITY_ITEM_BY_ID.get(itemId);
      if (!item || !item.repair || compatibilityState.repairing) return null;
      compatibilityState.repairing = true;
      try {
        if (item.fallbackAttribute) setCompatibilityFallback(item, true);
        applyFeatureSettings(featureSettings, { persist: false, broadcast: false, notify: false });
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        return runCompatibilityChecks();
      } finally {
        compatibilityState.repairing = false;
      }
    };
    const runAllCompatibilityRepairs = async () => {
      if (compatibilityState.repairing) return null;
      compatibilityState.repairing = true;
      try {
        const results = compatibilityState.results.length ? compatibilityState.results : runCompatibilityChecks();
        for (const result of results) {
          const item = COMPATIBILITY_ITEM_BY_ID.get(result.id);
          if (item?.fallbackAttribute && (result.status === "degraded" || result.status === "fallbackActive")) {
            setCompatibilityFallback(item, true);
          }
        }
        applyFeatureSettings(featureSettings, { persist: false, broadcast: false, notify: false });
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        return runCompatibilityChecks();
      } finally {
        compatibilityState.repairing = false;
      }
    };
    for (const statusKey of ["healthy", "degraded", "fallbackActive", "notObserved", "unsupported"]) {
      if (!COMPATIBILITY_STATUS_KEYS.has(statusKey)) throw new Error("Unknown compatibility status: " + statusKey);
    }
    const previousFlatPickerState = window.__codexPokedexFlatPickerState;
    if (previousFlatPickerState?.probeTimer) window.clearTimeout(previousFlatPickerState.probeTimer);
    const flatPickerState = previousFlatPickerState?.version === FLAT_PICKER_VERSION
      ? previousFlatPickerState
      : {
          version: FLAT_PICKER_VERSION,
          modelOptions: ["5.6 Sol", "5.6 Terra", "5.6 Luna", "5.5", "5.3 Codex Spark"],
          effortOptions: ["Light", "Medium", "High", "Extra High", "Max", "Ultra"],
          availableEfforts: [],
          operationActive: false,
        };
    flatPickerState.operationActive = false;
    flatPickerState.effortOptions = ["Light", "Medium", "High", "Extra High", "Max", "Ultra"];
    window.__codexPokedexFlatPickerState = flatPickerState;

    // Theme + model picker + pet (Scope B2; PiP retired).
    const extensionUpdatesUI = (${createExtensionUpdatesUI.toString()})(window, document);
    const SETTINGS_SECTIONS = [
      { key: "theme", label: "主题", feature: "theme" },
      { key: "modelPicker", label: "模型栏", feature: "modelPicker" },
      { key: "pet", label: "宠物", feature: "pet" },
      { key: "compatibility", label: "界面兼容性", feature: "compatibility" },
      { key: "extensions", label: "扩展更新", feature: "extensions" },
      { key: "version", label: "版本", feature: "version" },
    ];
    const BOOLEAN_SETTINGS = new Set(["theme", "pet", "modelPicker"]);

    const settingValueFromAttribute = (setting, rawValue) => (
      BOOLEAN_SETTINGS.has(setting) ? rawValue === "true" : rawValue
    );

    const createChoiceControl = (setting, options, extraClass = "") => {
      const control = document.createElement("div");
      control.className = "codex-plus-pro-settings-choices" + (extraClass ? " " + extraClass : "");
      for (const option of options) {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "codex-plus-pro-settings-choice";
        choice.setAttribute("data-codex-plus-setting", setting);
        choice.setAttribute("data-setting-value", String(option.value));
        choice.setAttribute("aria-pressed", "false");
        if (option.color) {
          choice.classList.add("codex-plus-pro-settings-color-choice");
          choice.style.setProperty("--settings-choice-color", option.color);
          const swatch = document.createElement("span");
          swatch.className = "codex-plus-pro-settings-swatch";
          swatch.setAttribute("aria-hidden", "true");
          choice.appendChild(swatch);
        }
        const label = document.createElement("span");
        label.textContent = option.label;
        choice.appendChild(label);
        choice.addEventListener("click", (event) => {
          event.stopPropagation();
          const nextValue = settingValueFromAttribute(setting, String(option.value));
          const nextSettings = {
            ...featureSettings,
            [setting]: nextValue,
          };
          if (setting === "accent" && nextValue === "adaptive") {
            if (readCustomWallpaper()) nextSettings.wallpaperMode = "custom";
            if (readCustomLogo()) nextSettings.logoMode = "custom";
          }
          applyFeatureSettings({
            ...nextSettings,
          });
        });
        control.appendChild(choice);
      }
      return control;
    };

    const createSettingsRow = (labelText, control) => {
      const row = document.createElement("div");
      row.className = "codex-plus-pro-settings-row";
      const label = document.createElement("div");
      label.className = "codex-plus-pro-settings-label";
      label.textContent = labelText;
      row.append(label, control);
      return row;
    };

    const createSettingsTextValue = (primaryText, secondaryText = "") => {
      const value = document.createElement("div");
      value.className = "codex-plus-pro-settings-text-value";
      const primary = document.createElement("div");
      primary.className = "codex-plus-pro-settings-text-value-primary";
      primary.textContent = primaryText;
      value.appendChild(primary);
      if (secondaryText) {
        const secondary = document.createElement("div");
        secondary.className = "codex-plus-pro-settings-text-value-secondary";
        secondary.textContent = secondaryText;
        secondary.title = secondaryText;
        value.appendChild(secondary);
      }
      return value;
    };

    const formatVersionScanTime = (scanTimeUtc) => {
      if (!scanTimeUtc) return "本次启动未记录检查时间";
      const date = new Date(scanTimeUtc);
      if (Number.isNaN(date.getTime())) return "检查时间不可用";
      return date.toLocaleString("zh-CN", { hour12: false });
    };

    const createStoreAppxValue = () => {
      if (!VERSION_INFO.storeAppxVersion) {
        return createSettingsTextValue("未识别到 Store Appx", "不会影响本机保留版本启动");
      }
      const primary = "Microsoft Store Appx " + VERSION_INFO.storeAppxVersion + (VERSION_INFO.storeAppxKind ? " · " + VERSION_INFO.storeAppxKind : "");
      return createSettingsTextValue(primary, VERSION_INFO.storeAppxPath || "系统安装版本保持原样，不会被本机保留版替换");
    };

    const createLaunchModeValue = () => {
      if (VERSION_INFO.appSource === "Managed") {
        return createSettingsTextValue("当前使用本机保留版启动", "Microsoft Store 安装版本保持原样，二者互不覆盖");
      }
      if (VERSION_INFO.appSource === "Appx") {
        return createSettingsTextValue("当前使用 Microsoft Store Appx 启动", "没有可用本机保留版本时会回退到 Store 安装");
      }
      return createSettingsTextValue("当前使用 " + VERSION_INFO.appSource + " 启动", "启动来源由本机解析器选择");
    };

    const normalizeManagedPath = (value) => {
      let normalized = String(value || "").split(String.fromCharCode(92)).join("/");
      while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
      return normalized.toLowerCase();
    };

    const isCurrentManagedVersion = (item) => {
      const currentPath = normalizeManagedPath(VERSION_INFO.appPath);
      const managedPath = normalizeManagedPath(item.path);
      if (!currentPath || !managedPath) return false;
      const separator = managedPath.lastIndexOf("/");
      const managedDir = separator >= 0 ? managedPath.slice(0, separator) : managedPath;
      return currentPath === managedPath || currentPath.startsWith(managedDir + "/");
    };

    const requestManagedVersionCleanup = (item) => {
      updateManagedVersionCleanupControls({
        state: "running",
        version: item.version,
        status: "正在清理版本",
        detail: "正在删除版本目录和对应下载文件，请稍候。",
      });
      if (typeof window[MANAGED_VERSION_CLEANUP_BINDING] !== "function") {
        updateManagedVersionCleanupControls({
          state: "failed",
          version: item.version,
          status: "清理入口未连接",
          detail: "页面没有拿到本机清理入口，请重启注入器后再试。",
        });
        return;
      }
      try {
        window[MANAGED_VERSION_CLEANUP_BINDING](JSON.stringify({ action: "cleanup-version", version: item.version }));
      } catch (error) {
        updateManagedVersionCleanupControls({
          state: "failed",
          version: item.version,
          status: "清理版本失败",
          detail: error?.message || "调用本机清理入口失败",
        });
      }
    };

    const showManagedVersionConfirm = (version, onConfirm) => {
      document.querySelector(".codex-plus-pro-confirm-backdrop")?.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "codex-plus-pro-confirm-backdrop";
      const dialog = document.createElement("div");
      dialog.className = "codex-plus-pro-confirm-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", "确认清理版本");
      const header = document.createElement("div");
      header.className = "codex-plus-pro-confirm-header";
      const title = document.createElement("div");
      title.className = "codex-plus-pro-confirm-title";
      title.textContent = "确认清理版本";
      header.appendChild(title);
      const body = document.createElement("div");
      body.className = "codex-plus-pro-confirm-body";
      const message = document.createElement("div");
      message.className = "codex-plus-pro-confirm-message";
      message.textContent = "确定清理版本 " + version + " 吗？";
      const detail = document.createElement("div");
      detail.className = "codex-plus-pro-confirm-detail";
      detail.textContent = "版本目录和对应下载文件将同时删除。当前使用版本不可清理。";
      body.append(message, detail);
      const footer = document.createElement("div");
      footer.className = "codex-plus-pro-confirm-footer";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "codex-plus-pro-confirm-cancel";
      cancelButton.textContent = "取消";
      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "codex-plus-pro-confirm-action";
      confirmButton.textContent = "确认清理";
      footer.append(cancelButton, confirmButton);
      dialog.append(header, body, footer);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("keydown", onKeyDown);
        backdrop.remove();
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") close();
      };
      cancelButton.addEventListener("click", close);
      confirmButton.addEventListener("click", () => {
        close();
        onConfirm();
      });
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) close();
      });
      document.addEventListener("keydown", onKeyDown);
      cancelButton.focus({ preventScroll: true });
    };

    const updateManagedVersionCleanupControls = (payload) => {
      const version = String(payload?.version || "");
      if (!version) return;
      for (const row of document.querySelectorAll("[data-managed-version-row]")) {
        if (row.getAttribute("data-managed-version-row") !== version) continue;
        const button = row.querySelector(".codex-plus-pro-settings-clean-version");
        const status = row.querySelector(".codex-plus-pro-managed-version-status");
        const current = row.getAttribute("data-managed-current") === "true";
        const state = payload?.state || "failed";
        row.setAttribute("data-cleanup-state", state);
        if (state === "done") {
          const control = row.parentElement;
          row.remove();
          if (control && !control.querySelector("[data-managed-version-row]")) {
            const empty = document.createElement("div");
            empty.className = "codex-plus-pro-settings-text-value-secondary";
            empty.textContent = "暂无可清理的本机保留版本";
            control.appendChild(empty);
          }
          return;
        }
        if (button) {
          button.disabled = current || state === "running";
          if (state === "running") button.textContent = "清理中...";
          else if (state === "protected") button.textContent = "当前使用";
          else if (state === "deferred") button.textContent = "稍后重试";
          else button.textContent = "重试清理";
        }
        if (status) status.textContent = payload?.detail || payload?.status || "清理版本失败";
      }
    };
    window.__codexPlusProManagedVersionCleanupResult = updateManagedVersionCleanupControls;

    const createManagedVersionValue = () => {
      const control = document.createElement("div");
      control.className = "codex-plus-pro-managed-versions";
      const versions = Array.isArray(VERSION_INFO.managedVersions) ? VERSION_INFO.managedVersions : [];
      if (!versions.length) {
        return createSettingsTextValue("暂无本机保留版本", "当前仅识别 Microsoft Store Appx 客户端");
      }
      for (const item of versions) {
        const current = isCurrentManagedVersion(item);
        const row = document.createElement("div");
        row.className = "codex-plus-pro-managed-version";
        row.setAttribute("data-managed-version-row", item.version);
        row.setAttribute("data-managed-current", current ? "true" : "false");
        const info = createSettingsTextValue(
          item.version + (current ? " · 当前使用" : ""),
          [item.appKind || "官方客户端", item.path].filter(Boolean).join(" · "),
        );
        const button = document.createElement("button");
        button.type = "button";
        button.className = "codex-plus-pro-settings-upgrade codex-plus-pro-settings-clean-version";
        button.textContent = current ? "当前使用" : "清理";
        button.disabled = current;
        button.title = current ? "当前运行版本不可清理" : "清理此版本及对应下载文件";
        button.setAttribute("aria-label", button.title);
        const status = document.createElement("span");
        status.className = "codex-plus-pro-managed-version-status";
        status.textContent = current ? "当前运行版本不可清理" : "可清理";
        button.addEventListener("click", () => {
          if (button.disabled) return;
          showManagedVersionConfirm(item.version, () => requestManagedVersionCleanup(item));
        });
        row.append(info, button, status);
        control.appendChild(row);
      }
      return control;
    };

    const updateOfficialUpgradeControls = (payload) => {
      for (const control of document.querySelectorAll(".codex-plus-pro-settings-upgrade-control[data-official-upgrade-control='true']")) {
        const button = control.querySelector(".codex-plus-pro-settings-upgrade");
        const status = control.querySelector(".codex-plus-pro-settings-upgrade-status");
        const progress = control.querySelector(".codex-plus-pro-settings-upgrade-progress");
        const progressFill = progress?.querySelector(".codex-plus-pro-settings-upgrade-progress-fill");
        const detail = control.querySelector(".codex-plus-pro-settings-upgrade-detail");
        const state = payload?.state || (payload?.ok ? "done" : "failed");
        control.setAttribute("data-upgrade-state", state);
        if (button) {
          const available = payload?.available === undefined
            ? button.getAttribute("data-upgrade-available") === "true"
            : payload.available === true;
          if (payload?.available !== undefined) {
            button.setAttribute("data-upgrade-available", available ? "true" : "false");
          }
          button.disabled = state === "running" || !available;
          if (state === "running") button.textContent = "下载中...";
          else if (state === "done") button.textContent = "已完成，重启生效";
          else if (state === "failed" && available) button.textContent = "重试下载更新";
          else if (available) button.textContent = "下载并导入新版";
          else button.textContent = "无需下载";
        }
        if (progress) {
          const active = state === "running";
          const total = Number(payload?.total || 0);
          const percent = Number(payload?.percent);
          const determinate = active && total > 0 && Number.isFinite(percent);
          progress.style.display = active ? "block" : "none";
          progress.setAttribute("data-progress-mode", determinate ? "determinate" : "indeterminate");
          if (determinate) {
            const value = Math.max(0, Math.min(100, percent));
            progress.setAttribute("aria-valuenow", String(value));
            if (progressFill) progressFill.style.width = value + "%";
          } else {
            progress.removeAttribute("aria-valuenow");
            if (progressFill) progressFill.style.width = "34%";
          }
        }
        if (status) status.textContent = payload?.status || (payload?.ok ? "已导入官方新版" : "下载或导入失败");
        if (detail && payload?.detail) detail.textContent = payload.detail;
      }
    };
    window.__codexPlusProOfficialUpgradeResult = updateOfficialUpgradeControls;

    const updateVersionCheckControls = (payload = {}) => {
      const state = payload.state || "done";
      if (Object.hasOwn(payload, "latestVersion")) VERSION_INFO.latestVersion = String(payload.latestVersion || "");
      if (Object.hasOwn(payload, "updateState")) VERSION_INFO.updateState = String(payload.updateState || "check-failed");
      if (Object.hasOwn(payload, "updateStatus")) VERSION_INFO.updateStatus = String(payload.updateStatus || "在线检查失败");
      if (Object.hasOwn(payload, "scanTimeUtc")) VERSION_INFO.scanTimeUtc = String(payload.scanTimeUtc || "");

      for (const control of document.querySelectorAll(".codex-plus-pro-settings-version-check-control[data-version-check-control='true']")) {
        const button = control.querySelector(".codex-plus-pro-settings-upgrade");
        const status = control.querySelector(".codex-plus-pro-settings-upgrade-status");
        const detail = control.querySelector(".codex-plus-pro-settings-upgrade-detail");
        control.setAttribute("data-upgrade-state", state);
        if (button) {
          button.disabled = state === "running";
          button.textContent = state === "running" ? "检查中..." : "检查最新版";
        }
        if (status) {
          status.textContent = payload.status || (state === "running" ? "正在检查官方最新版" : VERSION_INFO.updateStatus);
        }
        if (detail) {
          detail.textContent = payload.detail || "可随时手动刷新 Microsoft Store 最新版本状态。";
        }
      }

      if (Object.hasOwn(payload, "scanTimeUtc")) {
        const scanTime = document.querySelector("[data-version-scan-time-control='true'] .codex-plus-pro-settings-text-value-primary");
        if (scanTime) scanTime.textContent = formatVersionScanTime(VERSION_INFO.scanTimeUtc);
      }

      if (state !== "running") {
        const available = VERSION_INFO.updateState === "outdated";
        updateOfficialUpgradeControls({
          state: "idle",
          available,
          status: available
            ? "可下载 " + (VERSION_INFO.latestVersion || "官方最新版")
            : VERSION_INFO.updateStatus,
          detail: available
            ? "发现官方新版，可点击下方按钮下载并导入本机保留版。"
            : "当前没有可导入的新版本；手动检查已完成。",
        });
      }
    };
    window.__codexPlusProVersionCheckResult = updateVersionCheckControls;

    const createOfficialUpgradeControl = () => {
      const isAvailable = VERSION_INFO.updateState === "outdated";
      const control = document.createElement("div");
      control.className = "codex-plus-pro-settings-upgrade-control";
      control.setAttribute("data-official-upgrade-control", "true");
      control.setAttribute("data-upgrade-state", isAvailable ? "idle" : "done");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "codex-plus-pro-settings-upgrade";
      button.textContent = isAvailable ? "下载并导入新版" : "无需下载";
      button.disabled = !isAvailable;
      button.setAttribute("data-upgrade-available", isAvailable ? "true" : "false");
      const status = document.createElement("span");
      status.className = "codex-plus-pro-settings-upgrade-status";
      status.setAttribute("aria-live", "polite");
      status.textContent = isAvailable
        ? "可下载 " + (VERSION_INFO.latestVersion || "官方最新版")
        : VERSION_INFO.updateStatus;
      const progress = document.createElement("div");
      progress.className = "codex-plus-pro-settings-upgrade-progress";
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", "官方新版下载进度");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute("data-progress-mode", "determinate");
      progress.style.display = "none";
      const progressFill = document.createElement("span");
      progressFill.className = "codex-plus-pro-settings-upgrade-progress-fill";
      progress.append(progressFill);
      const detail = document.createElement("pre");
      detail.className = "codex-plus-pro-settings-upgrade-detail";
      detail.textContent = isAvailable
        ? "点击后下载官方 MSIX，并导入到 %LOCALAPPDATA%\\\\Codex-Plus-Pro\\\\official\\\\versions。系统 Microsoft Store 安装不会被替换；导入完成后重启生效。"
        : "当前没有可导入的新版本；版本检查只在启动时刷新。";
      button.addEventListener("click", () => {
        if (button.disabled) return;
        if (typeof window[OFFICIAL_UPGRADE_BINDING] !== "function") {
          updateOfficialUpgradeControls({
            state: "failed",
            status: "下载入口未连接",
            detail: "页面没有拿到 Codex Plus Pro 的官方升级 binding，请重启注入器后再试。",
          });
          return;
        }
        updateOfficialUpgradeControls({
          state: "running",
          status: "正在下载并导入官方新版",
          detail: "正在调用本机脚本，请等待完成。下载体积较大时可能需要几分钟。",
        });
        try {
          window[OFFICIAL_UPGRADE_BINDING](JSON.stringify({ action: "import-latest" }));
        } catch (error) {
          updateOfficialUpgradeControls({
            state: "failed",
            status: "下载或导入失败",
            detail: error?.message || "调用本机升级入口失败",
          });
        }
      });
      control.append(button, status, progress, detail);
      return control;
    };

    const createVersionCheckControl = () => {
      const initialState = VERSION_INFO.updateState === "check-failed" ? "failed" : "done";
      const control = document.createElement("div");
      control.className = "codex-plus-pro-settings-upgrade-control codex-plus-pro-settings-version-check-control";
      control.setAttribute("data-version-check-control", "true");
      control.setAttribute("data-upgrade-state", initialState);
      const status = document.createElement("span");
      status.className = "codex-plus-pro-settings-upgrade-status";
      status.setAttribute("aria-live", "polite");
      status.textContent = VERSION_INFO.updateStatus;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "codex-plus-pro-settings-upgrade";
      button.textContent = "检查最新版";
      const detail = document.createElement("pre");
      detail.className = "codex-plus-pro-settings-upgrade-detail";
      detail.textContent = VERSION_INFO.scanTimeUtc
        ? "可随时手动刷新 Microsoft Store 最新版本状态。"
        : "当前尚未完成版本检查。";
      button.addEventListener("click", () => {
        if (button.disabled) return;
        if (typeof window[VERSION_CHECK_BINDING] !== "function") {
          updateVersionCheckControls({
            state: "failed",
            status: "检查入口未连接",
            detail: "页面没有拿到版本检查入口，请重启 Codex Plus Pro 后再试。",
          });
          return;
        }
        updateVersionCheckControls({
          state: "running",
          status: "正在检查官方最新版",
          detail: "正在读取 Microsoft Store 最新版本信息，请稍候。",
        });
        try {
          window[VERSION_CHECK_BINDING](JSON.stringify({ action: "check-latest" }));
        } catch (error) {
          updateVersionCheckControls({
            state: "failed",
            status: "在线检查失败",
            detail: error?.message || "调用版本检查入口失败",
          });
        }
      });
      control.append(status, button, detail);
      return control;
    };

    const COMPATIBILITY_RISK_LABELS = Object.freeze({ low: "低", medium: "中", high: "高" });
    const formatCompatibilityCheckTime = (value) => {
      if (!value) return "尚未检测";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "检测时间不可用";
      return date.toLocaleString("zh-CN", { hour12: false });
    };
    const compatibilityResultFor = (itemId) => compatibilityState.results.find((result) => result.id === itemId) || null;
    const compatibilityRepairDisabled = (result) => (
      !result?.repairAvailable ||
      result.status === "notObserved" ||
      result.status === "unsupported" ||
      compatibilityState.checking ||
      compatibilityState.repairing
    );
    const updateCompatibilityPanel = () => {
      const panel = document.querySelector('[data-codex-plus-compatibility-panel="true"]');
      if (!panel) return;
      if (!compatibilityState.results.length) runCompatibilityChecks();
      const results = compatibilityState.results;
      const visibleItems = COMPATIBILITY_ITEMS.filter((item) => (
        compatibilityState.selectedCategory === "all" || item.category === compatibilityState.selectedCategory
      ));
      const healthyCount = results.filter((result) => result.status === "healthy").length;
      const degradedCount = results.filter((result) => result.status === "degraded").length;
      const fallbackCount = results.filter((result) => result.status === "fallbackActive").length;
      const notObservedCount = results.filter((result) => result.status === "notObserved").length;
      const unsupportedCount = results.filter((result) => result.status === "unsupported").length;
      const summary = panel.querySelector("[data-compatibility-summary]");
      if (summary) {
        summary.textContent = [
          "已检查 " + results.length + " 项",
          "正常 " + healthyCount,
          "需处理 " + degradedCount,
          "备用规则 " + fallbackCount,
          "未观察 " + notObservedCount,
          "不支持 " + unsupportedCount,
        ].join(" · ");
      }
      const version = panel.querySelector("[data-compatibility-version]");
      if (version) version.textContent = "Codex " + VERSION_INFO.appVersion + " · 清单 " + COMPATIBILITY_CHECKLIST_VERSION;
      const checkedAt = panel.querySelector("[data-compatibility-checked-at]");
      if (checkedAt) checkedAt.textContent = formatCompatibilityCheckTime(compatibilityState.lastCheckedAt);
      for (const tab of panel.querySelectorAll("[data-compatibility-category]")) {
        const selected = tab.getAttribute("data-compatibility-category") === compatibilityState.selectedCategory;
        tab.setAttribute("aria-pressed", selected ? "true" : "false");
        tab.setAttribute("data-selected", selected ? "true" : "false");
      }
      for (const action of panel.querySelectorAll("[data-compatibility-action]")) {
        action.disabled = compatibilityState.checking || compatibilityState.repairing;
      }
      const list = panel.querySelector("[data-compatibility-list]");
      if (!list) return;
      list.replaceChildren();
      for (const item of visibleItems) {
        const result = compatibilityResultFor(item.id) || {
          id: item.id,
          status: "notObserved",
          statusLabel: COMPATIBILITY_STATUS_LABELS.notObserved,
          reason: "尚未检测",
          repairAvailable: false,
        };
        const row = document.createElement("article");
        row.className = "codex-plus-pro-compatibility-item";
        row.setAttribute("data-compatibility-item", item.id);
        row.setAttribute("data-compatibility-status", result.status);
        const heading = document.createElement("div");
        heading.className = "codex-plus-pro-compatibility-item-heading";
        const title = document.createElement("div");
        title.className = "codex-plus-pro-compatibility-item-title";
        title.textContent = item.label;
        const badge = document.createElement("span");
        badge.className = "codex-plus-pro-compatibility-status";
        badge.textContent = result.statusLabel || COMPATIBILITY_STATUS_LABELS.notObserved;
        badge.setAttribute("data-compatibility-status-label", "true");
        heading.append(title, badge);
        const description = document.createElement("div");
        description.className = "codex-plus-pro-compatibility-description";
        description.textContent = item.description;
        const metadata = document.createElement("div");
        metadata.className = "codex-plus-pro-compatibility-metadata";
        const risk = document.createElement("span");
        risk.textContent = "风险 " + (COMPATIBILITY_RISK_LABELS[item.risk] || item.risk || "未知");
        const anchor = document.createElement("span");
        anchor.textContent = result.matchedAnchor
          ? "锚点 " + result.matchedAnchor.name + " · " + result.matchedAnchor.count + " 个"
          : "锚点 未匹配";
        anchor.title = result.matchedAnchor?.selector || "当前页面未匹配到支持的锚点";
        metadata.append(risk, anchor);
        const reason = document.createElement("div");
        reason.className = "codex-plus-pro-compatibility-reason";
        reason.textContent = result.reason || "暂无诊断原因";
        const actions = document.createElement("div");
        actions.className = "codex-plus-pro-compatibility-actions";
        const checkButton = document.createElement("button");
        checkButton.type = "button";
        checkButton.className = "codex-plus-pro-settings-upgrade";
        checkButton.textContent = "重新检测";
        checkButton.setAttribute("data-compatibility-item-check", item.id);
        checkButton.setAttribute("aria-label", "重新检测 " + item.label);
        checkButton.disabled = compatibilityState.checking || compatibilityState.repairing;
        checkButton.addEventListener("click", () => {
          compatibilityState.checking = true;
          updateCompatibilityPanel();
          runCompatibilityChecks();
          compatibilityState.checking = false;
          updateCompatibilityPanel();
        });
        const repairButton = document.createElement("button");
        repairButton.type = "button";
        repairButton.className = "codex-plus-pro-settings-upgrade codex-plus-pro-compatibility-repair";
        repairButton.textContent = "修复此项";
        repairButton.setAttribute("data-compatibility-item-repair", item.id);
        repairButton.setAttribute("aria-label", "修复 " + item.label);
        repairButton.disabled = compatibilityRepairDisabled(result);
        repairButton.addEventListener("click", async () => {
          compatibilityState.checking = true;
          updateCompatibilityPanel();
          try {
            await runCompatibilityRepair(item.id);
          } catch (error) {
            console.warn("Codex Plus Pro compatibility repair failed", item.id, error);
          } finally {
            compatibilityState.checking = false;
            updateCompatibilityPanel();
          }
        });
        actions.append(checkButton, repairButton);
        row.append(heading, description, metadata, reason, actions);
        list.appendChild(row);
      }
    };
    const refreshCompatibilityPanel = () => {
      compatibilityState.checking = true;
      updateCompatibilityPanel();
      runCompatibilityChecks();
      compatibilityState.checking = false;
      updateCompatibilityPanel();
    };
    const repairAllCompatibilityItems = async () => {
      compatibilityState.checking = true;
      updateCompatibilityPanel();
      try {
        await runAllCompatibilityRepairs();
      } catch (error) {
        console.warn("Codex Plus Pro compatibility repair-all failed", error);
      } finally {
        compatibilityState.checking = false;
        updateCompatibilityPanel();
      }
    };
    const createCompatibilityPanel = () => {
      const panel = document.createElement("div");
      panel.className = "codex-plus-pro-compatibility-panel";
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", "界面兼容性清单");
      panel.setAttribute("data-codex-plus-compatibility-panel", "true");
      const summary = document.createElement("div");
      summary.className = "codex-plus-pro-compatibility-summary";
      const summaryValue = document.createElement("div");
      summaryValue.className = "codex-plus-pro-settings-text-value";
      const summaryLine = document.createElement("div");
      summaryLine.className = "codex-plus-pro-settings-text-value-primary";
      summaryLine.setAttribute("aria-live", "polite");
      summaryLine.setAttribute("data-compatibility-summary", "true");
      const versionLine = document.createElement("div");
      versionLine.className = "codex-plus-pro-settings-text-value-secondary";
      versionLine.setAttribute("data-compatibility-version", "true");
      summaryValue.append(summaryLine, versionLine);
      const checkedLine = document.createElement("div");
      checkedLine.className = "codex-plus-pro-compatibility-checked-at";
      checkedLine.textContent = "尚未检测";
      checkedLine.setAttribute("aria-live", "polite");
      checkedLine.setAttribute("data-compatibility-checked-at", "true");
      summary.append(summaryValue, checkedLine);
      const actions = document.createElement("div");
      actions.className = "codex-plus-pro-compatibility-toolbar";
      const checkAllButton = document.createElement("button");
      checkAllButton.type = "button";
      checkAllButton.className = "codex-plus-pro-settings-upgrade";
      checkAllButton.textContent = "全部检测";
      checkAllButton.setAttribute("aria-label", "检测全部界面兼容性项目");
      checkAllButton.setAttribute("data-compatibility-action", "check");
      checkAllButton.addEventListener("click", refreshCompatibilityPanel);
      const reapplyButton = document.createElement("button");
      reapplyButton.type = "button";
      reapplyButton.className = "codex-plus-pro-settings-upgrade";
      reapplyButton.textContent = "重新应用主题";
      reapplyButton.setAttribute("aria-label", "重新应用当前主题");
      reapplyButton.setAttribute("data-compatibility-action", "reapply");
      reapplyButton.addEventListener("click", () => {
        applyFeatureSettings(featureSettings, { persist: false, broadcast: false, notify: false });
        refreshCompatibilityPanel();
      });
      const repairAllButton = document.createElement("button");
      repairAllButton.type = "button";
      repairAllButton.className = "codex-plus-pro-settings-upgrade codex-plus-pro-compatibility-repair";
      repairAllButton.textContent = "修复所有已知问题";
      repairAllButton.setAttribute("aria-label", "修复所有已知界面兼容性问题");
      repairAllButton.setAttribute("data-compatibility-action", "repair-all");
      repairAllButton.addEventListener("click", () => void repairAllCompatibilityItems());
      actions.append(checkAllButton, reapplyButton, repairAllButton);
      const categoryControl = document.createElement("div");
      categoryControl.className = "codex-plus-pro-settings-choices codex-plus-pro-compatibility-categories";
      categoryControl.setAttribute("role", "group");
      categoryControl.setAttribute("aria-label", "界面兼容性分类");
      for (const category of COMPATIBILITY_CATEGORIES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "codex-plus-pro-settings-choice codex-plus-pro-compatibility-category";
        button.textContent = category.label;
        button.setAttribute("data-compatibility-category", category.key);
        button.setAttribute("aria-pressed", category.key === "all" ? "true" : "false");
        button.addEventListener("click", () => {
          compatibilityState.selectedCategory = category.key;
          updateCompatibilityPanel();
        });
        categoryControl.appendChild(button);
      }
      const list = document.createElement("div");
      list.className = "codex-plus-pro-compatibility-list";
      list.setAttribute("data-compatibility-list", "true");
      panel.append(summary, actions, categoryControl, list);
      return panel;
    };

    const activateSettingsSection = (popover, sectionKey) => {
      for (const tab of popover.querySelectorAll("[data-settings-section-target]")) {
        const selected = tab.getAttribute("data-settings-section-target") === sectionKey;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
      }
      for (const panel of popover.querySelectorAll("[data-settings-section]")) {
        panel.hidden = panel.getAttribute("data-settings-section") !== sectionKey;
      }
      if (sectionKey === "compatibility") refreshCompatibilityPanel();
      if (sectionKey === "extensions") extensionUpdatesUI.refresh();
    };

    const updateSettingsPanel = () => {
      extensionUpdatesUI.indicators();
      const button = document.querySelector(".codex-plus-pro-settings-button");
      const popover = document.querySelector(".codex-plus-pro-settings-popover");
      for (const choice of popover?.querySelectorAll("[data-codex-plus-setting]") || []) {
        const setting = choice.getAttribute("data-codex-plus-setting");
        const selected = String(featureSettings[setting]) === choice.getAttribute("data-setting-value");
        choice.setAttribute("aria-pressed", selected ? "true" : "false");
        choice.setAttribute("data-selected", selected ? "true" : "false");
        if (setting === "accent" && choice.getAttribute("data-setting-value") === "adaptive") {
          const adaptiveTheme = readAdaptiveTheme();
          choice.disabled = false;
          choice.style.setProperty("--settings-choice-color", adaptiveTheme?.color || ACCENT_OPTIONS.adaptive.color);
        }
      }
      for (const tab of popover?.querySelectorAll("[data-settings-feature]") || []) {
        const enabled = featureSettings[tab.getAttribute("data-settings-feature")] !== false;
        tab.setAttribute("data-enabled", enabled ? "true" : "false");
      }
      for (const panel of popover?.querySelectorAll("[data-settings-feature-panel]") || []) {
        const enabled = featureSettings[panel.getAttribute("data-settings-feature-panel")] !== false;
        panel.setAttribute("data-enabled", enabled ? "true" : "false");
      }
      const wallpaperRange = popover?.querySelector('[data-codex-plus-range="wallpaperStrength"]');
      if (wallpaperRange) wallpaperRange.value = String(featureSettings.wallpaperStrength);
      const wallpaperValue = popover?.querySelector('[data-codex-plus-range-value="wallpaperStrength"]');
      if (wallpaperValue) wallpaperValue.textContent = featureSettings.wallpaperStrength + "%";
      const customWallpaper = readCustomWallpaper();
      const customWallpaperChoice = popover?.querySelector('[data-codex-plus-setting="wallpaperMode"][data-setting-value="custom"]');
      if (customWallpaperChoice) customWallpaperChoice.disabled = !customWallpaper;
      const wallpaperPreview = popover?.querySelector(".codex-plus-pro-settings-wallpaper-preview");
      if (wallpaperPreview) {
        const previewImage = featureSettings.wallpaperMode === "custom"
          ? customWallpaper
          : (resolveAccentPack(featureSettings.accent).wallpaper || window.__codexPlusProDefaultWallpaper || "");
        wallpaperPreview.style.backgroundImage = previewImage ? ("url(" + JSON.stringify(previewImage) + ")") : "";
        wallpaperPreview.setAttribute("data-has-wallpaper", previewImage ? "true" : "false");
      }
      const customLogo = readCustomLogo();
      const customLogoChoice = popover?.querySelector('[data-codex-plus-setting="logoMode"][data-setting-value="custom"]');
      if (customLogoChoice) customLogoChoice.disabled = !customLogo;
      const logoPreview = popover?.querySelector(".codex-plus-pro-settings-logo-preview");
      if (logoPreview) {
        const previewLogo = featureSettings.logoMode === "custom"
          ? customLogo
          : (resolveAccentPack(featureSettings.accent).logo || window.__codexPlusProDefaultLogo || "");
        logoPreview.style.backgroundImage = previewLogo ? ("url(" + JSON.stringify(previewLogo) + ")") : "";
        logoPreview.setAttribute("data-has-logo", previewLogo ? "true" : "false");
      }
      if (popover) {
        const activeTab = popover.querySelector('[data-settings-section-target][aria-selected="true"]');
        if (!activeTab) activateSettingsSection(popover, "theme");
        if (popover.querySelector('[data-settings-section="compatibility"]')) updateCompatibilityPanel();
      }
      if (button && popover) button.setAttribute("aria-expanded", popover.hidden ? "false" : "true");
      const backdrop = document.querySelector(".codex-plus-pro-settings-backdrop");
      if (backdrop && popover) backdrop.hidden = popover.hidden;
    };

    const closeSettingsPopover = () => {
      const popover = document.querySelector(".codex-plus-pro-settings-popover");
      if (!popover || popover.hidden) return;
      popover.hidden = true;
      updateSettingsPanel();
      document.querySelector(".codex-plus-pro-settings-button")?.focus({ preventScroll: true });
    };

    const ensureSettingsPopover = () => {
      let popover = document.querySelector(".codex-plus-pro-settings-popover");
      if (popover && popover.getAttribute("data-settings-ui-version") !== SETTINGS_UI_VERSION) {
        popover.remove();
        document.querySelector(".codex-plus-pro-settings-backdrop")?.remove();
        popover = null;
      }
      if (popover) return popover;

      const backdrop = document.createElement("div");
      backdrop.className = "codex-plus-pro-settings-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      backdrop.hidden = true;
      popover = document.createElement("div");
      popover.className = "codex-plus-pro-settings-popover";
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-modal", "true");
      popover.setAttribute("aria-label", "Codex Plus Pro 设置");
      popover.setAttribute("data-settings-ui-version", SETTINGS_UI_VERSION);
      popover.hidden = true;

      const header = document.createElement("div");
      header.className = "codex-plus-pro-settings-header";
      const heading = document.createElement("div");
      const title = document.createElement("div");
      title.className = "codex-plus-pro-settings-title";
      title.textContent = "Codex Plus Pro";
      const subtitle = document.createElement("div");
      subtitle.className = "codex-plus-pro-settings-subtitle";
      subtitle.textContent = "Windows " + VERSION_INFO.plusVersion + " · MCP / Skills 更新、主题启动动画与官方宠物";
      heading.append(title, subtitle);
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "codex-plus-pro-settings-close";
      closeButton.setAttribute("aria-label", "关闭设置");
      closeButton.title = "关闭";
      closeButton.textContent = "×";
      closeButton.addEventListener("click", closeSettingsPopover);
      header.append(heading, closeButton);

      const body = document.createElement("div");
      body.className = "codex-plus-pro-settings-body";
      const navigation = document.createElement("div");
      navigation.className = "codex-plus-pro-settings-navigation";
      navigation.setAttribute("role", "tablist");
      navigation.setAttribute("aria-label", "设置分区");
      const content = document.createElement("div");
      content.className = "codex-plus-pro-settings-content";

      for (const item of SETTINGS_SECTIONS) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "codex-plus-pro-settings-navigation-item";
        tab.id = "codex-plus-settings-tab-" + item.key;
        tab.setAttribute("role", "tab");
        tab.setAttribute("data-settings-section-target", item.key);
        tab.setAttribute("data-settings-feature", item.feature);
        tab.setAttribute("aria-controls", "codex-plus-settings-panel-" + item.key);
        tab.setAttribute("aria-selected", item.key === "theme" ? "true" : "false");
        tab.tabIndex = item.key === "theme" ? 0 : -1;
        const status = document.createElement("span");
        status.className = "codex-plus-pro-settings-status";
        status.setAttribute("aria-hidden", "true");
        const tabLabel = document.createElement("span");
        tabLabel.textContent = item.label;
        tab.append(status, tabLabel);
        tab.addEventListener("click", () => activateSettingsSection(popover, item.key));
        navigation.appendChild(tab);

        const panel = document.createElement("section");
        panel.className = "codex-plus-pro-settings-section";
        panel.id = "codex-plus-settings-panel-" + item.key;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panel.setAttribute("data-settings-section", item.key);
        panel.setAttribute("data-settings-feature-panel", item.feature);
        panel.hidden = item.key !== "theme";
        const panelTitle = document.createElement("h2");
        panelTitle.textContent = item.label;
        panel.appendChild(panelTitle);

        if (item.key === "theme") {
          panel.append(
            createSettingsRow("状态", createChoiceControl("theme", [
              { value: true, label: "启用" }, { value: false, label: "关闭" },
            ])),
            createSettingsRow("主题色", createChoiceControl("accent", Object.entries(ACCENT_OPTIONS).map(([value, option]) => ({
              value, label: option.label, color: option.color,
            })), "codex-plus-pro-settings-color-choices")),
          );
          const wallpaperControl = document.createElement("div");
          wallpaperControl.className = "codex-plus-pro-settings-wallpaper-control";
          const wallpaperPreview = document.createElement("div");
          wallpaperPreview.className = "codex-plus-pro-settings-wallpaper-preview";
          wallpaperPreview.setAttribute("aria-hidden", "true");
          const wallpaperActions = document.createElement("div");
          wallpaperActions.className = "codex-plus-pro-settings-wallpaper-actions";
          wallpaperActions.appendChild(createChoiceControl("wallpaperMode", [
            { value: "default", label: "默认壁纸" }, { value: "custom", label: "自定义壁纸" },
          ]));
          // Use a native <label> so the file dialog opens on the same user gesture
          // (faster than button -> input.click()). Keep accept narrow to avoid
          // Windows shell scanning every image codec for image/*.
          const uploadButton = document.createElement("label");
          uploadButton.className = "codex-plus-pro-settings-upload";
          uploadButton.textContent = "上传图片";
          const wallpaperInput = document.createElement("input");
          wallpaperInput.type = "file";
          wallpaperInput.accept = "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
          wallpaperInput.className = "codex-plus-pro-settings-file-input";
          wallpaperInput.tabIndex = -1;
          const wallpaperStatus = document.createElement("span");
          wallpaperStatus.className = "codex-plus-pro-settings-wallpaper-status";
          wallpaperStatus.setAttribute("aria-live", "polite");
          wallpaperInput.addEventListener("change", async () => {
            const file = wallpaperInput.files?.[0];
            if (!file) return;
            wallpaperStatus.textContent = "处理中";
            try {
              const wallpaper = await prepareWallpaper(file);
              setLocalStorageItemWithRollback(CUSTOM_WALLPAPER_STORAGE_KEY, wallpaper);
              wallpaperStatus.textContent = "取色中";
              try {
                await generateAdaptiveTheme({ wallpaper, logo: readCustomLogo() });
                if (featureSettings.accent === "adaptive") {
                  wallpaperStatus.textContent = "已生成自适应主题";
                  applyFeatureSettings({ ...featureSettings, accent: "adaptive", wallpaperMode: "custom" });
                } else {
                  wallpaperStatus.textContent = "已更新";
                  applyFeatureSettings({ ...featureSettings, wallpaperMode: "custom" });
                }
              } catch (paletteError) {
                console.warn("Codex Plus Pro adaptive wallpaper palette failed", paletteError);
                wallpaperStatus.textContent = "已更新";
                applyFeatureSettings({ ...featureSettings, wallpaperMode: "custom" });
              }
            } catch (error) {
              wallpaperStatus.textContent = error?.message || "上传失败";
            } finally {
              wallpaperInput.value = "";
            }
          });
          uploadButton.appendChild(wallpaperInput);
          wallpaperActions.append(uploadButton, wallpaperStatus);
          wallpaperControl.append(wallpaperPreview, wallpaperActions);
          panel.appendChild(createSettingsRow("壁纸", wallpaperControl));
          const logoControl = document.createElement("div");
          logoControl.className = "codex-plus-pro-settings-logo-control";
          const logoPreview = document.createElement("div");
          logoPreview.className = "codex-plus-pro-settings-logo-preview";
          logoPreview.setAttribute("aria-hidden", "true");
          const logoActions = document.createElement("div");
          logoActions.className = "codex-plus-pro-settings-logo-actions";
          logoActions.appendChild(createChoiceControl("logoMode", [
            { value: "default", label: "默认 Logo" }, { value: "custom", label: "自定义 Logo" },
          ]));
          const logoUploadButton = document.createElement("label");
          logoUploadButton.className = "codex-plus-pro-settings-upload";
          logoUploadButton.textContent = "上传 Logo";
          const logoInput = document.createElement("input");
          logoInput.type = "file";
          logoInput.accept = "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
          logoInput.className = "codex-plus-pro-settings-file-input";
          logoInput.tabIndex = -1;
          const logoStatus = document.createElement("span");
          logoStatus.className = "codex-plus-pro-settings-logo-status";
          logoStatus.setAttribute("aria-live", "polite");
          logoInput.addEventListener("change", async () => {
            const file = logoInput.files?.[0];
            if (!file) return;
            logoStatus.textContent = "处理中";
            try {
              const logo = await prepareLogo(file);
              setLocalStorageItemWithRollback(CUSTOM_LOGO_STORAGE_KEY, logo);
              logoStatus.textContent = "取色中";
              try {
                await generateAdaptiveTheme({ wallpaper: readCustomWallpaper(), logo });
                if (featureSettings.accent === "adaptive") {
                  logoStatus.textContent = "已生成自适应主题";
                  applyFeatureSettings({ ...featureSettings, accent: "adaptive", logoMode: "custom" });
                } else {
                  logoStatus.textContent = "已更新";
                  applyFeatureSettings({ ...featureSettings, logoMode: "custom" });
                }
              } catch (paletteError) {
                console.warn("Codex Plus Pro adaptive logo palette failed", paletteError);
                logoStatus.textContent = "已更新";
                applyFeatureSettings({ ...featureSettings, logoMode: "custom" });
              }
            } catch (error) {
              logoStatus.textContent = error?.message || "上传失败";
            } finally {
              logoInput.value = "";
            }
          });
          logoUploadButton.appendChild(logoInput);
          logoActions.append(logoUploadButton, logoStatus);
          logoControl.append(logoPreview, logoActions);
          panel.appendChild(createSettingsRow("Logo", logoControl));
          const rangeControl = document.createElement("div");
          rangeControl.className = "codex-plus-pro-settings-range-control";
          const range = document.createElement("input");
          range.type = "range";
          range.min = "0";
          range.max = "100";
          range.step = "1";
          range.setAttribute("aria-label", "壁纸强度");
          range.setAttribute("data-codex-plus-range", "wallpaperStrength");
          const output = document.createElement("output");
          output.setAttribute("data-codex-plus-range-value", "wallpaperStrength");
          range.addEventListener("input", (event) => {
            applyFeatureSettings({ ...featureSettings, wallpaperStrength: Number(event.currentTarget.value) });
          });
          rangeControl.append(range, output);
          panel.appendChild(createSettingsRow("壁纸强度", rangeControl));
        } else if (item.key === "compatibility") {
          panel.appendChild(createCompatibilityPanel());
        } else if (item.key === "extensions") {
          panel.appendChild(extensionUpdatesUI.createPanel());
        } else if (item.key === "version") {
          const sourceLabel = VERSION_INFO.appSource === "Appx"
            ? "Microsoft Store Appx"
            : VERSION_INFO.appSource === "Managed"
              ? "本地保留版本"
              : VERSION_INFO.appSource === "LegacyLocalCurrent"
                ? "旧本地版本"
                : VERSION_INFO.appSource;
          panel.append(
            createSettingsRow("Codex Plus Pro", createSettingsTextValue("Windows " + VERSION_INFO.plusVersion, "主题壳与设置面板版本")),
            createSettingsRow("官方客户端", createSettingsTextValue(sourceLabel + " " + VERSION_INFO.appVersion + " · " + VERSION_INFO.appKind, VERSION_INFO.appPath)),
            createSettingsRow("启动方式", createLaunchModeValue()),
            createSettingsRow("Store 安装", createStoreAppxValue()),
            createSettingsRow("保留版本", createManagedVersionValue()),
            createSettingsRow("更新检查", createVersionCheckControl()),
            (() => {
              const value = createSettingsTextValue(formatVersionScanTime(VERSION_INFO.scanTimeUtc), "启动时自动检查，也可以手动刷新");
              value.setAttribute("data-version-scan-time-control", "true");
              return createSettingsRow("检查时间", value);
            })(),
            createSettingsRow("下载更新", createOfficialUpgradeControl()),
          );
        } else if (item.key === "modelPicker") {
          panel.append(
            createSettingsRow("状态", createChoiceControl("modelPicker", [
              { value: true, label: "显示" }, { value: false, label: "隐藏" },
            ])),
            createSettingsRow("控件密度", createChoiceControl("modelDensity", [
              { value: "compact", label: "紧凑" }, { value: "comfortable", label: "舒展" },
            ])),
          );
        } else if (item.key === "pet") {
          panel.append(
            createSettingsRow("状态", createChoiceControl("pet", [
              { value: true, label: "显示" }, { value: false, label: "隐藏" },
            ])),
            createSettingsRow("动画", createChoiceControl("petMotion", [
              { value: "full", label: "完整" }, { value: "reduced", label: "减少" },
            ])),
          );
        }
        content.appendChild(panel);
      }
      body.append(navigation, content);

      const footer = document.createElement("div");
      footer.className = "codex-plus-pro-settings-footer";
      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.className = "codex-plus-pro-settings-reset";
      resetButton.textContent = "恢复默认";
      resetButton.addEventListener("click", () => {
        try { localStorage.removeItem(CUSTOM_WALLPAPER_STORAGE_KEY); } catch {}
        try { localStorage.removeItem(CUSTOM_LOGO_STORAGE_KEY); } catch {}
        try { localStorage.removeItem(ADAPTIVE_THEME_STORAGE_KEY); } catch {}
        applyFeatureSettings({
          ...DEFAULT_FEATURE_SETTINGS,
        });
      });
      footer.appendChild(resetButton);
      popover.append(header, body, footer);
      document.body.append(backdrop, popover);
      updateSettingsPanel();
      return popover;
    };

    const decorateSettingsButton = () => {
      if (isAvatarOverlay || isHotkeyWindow) return;

      const openSettings = (event) => {
        event?.stopPropagation?.();
        const popover = ensureSettingsPopover();
        popover.hidden = !popover.hidden;
        updateSettingsPanel();
        if (!popover.hidden) {
          window.requestAnimationFrame(() => popover.querySelector('[role="tab"][aria-selected="true"]')?.focus());
        }
      };

      const removeStaleSettingsButtons = (keep) => {
        for (const existing of document.querySelectorAll(".codex-plus-pro-settings-button")) {
          if (keep && existing === keep) continue;
          if (existing.getAttribute("data-settings-ui-version") !== SETTINGS_UI_VERSION) {
            existing.remove();
            continue;
          }
          // Prefer a single entry: drop extras once a preferred button exists.
          if (keep) existing.remove();
        }
      };

      const searchButton =
        document.querySelector('button[aria-label="Search"]') ||
        document.querySelector('button[aria-label*="Search" i]') ||
        document.querySelector('button[aria-label*="search" i]') ||
        Array.from(document.querySelectorAll("button")).find((button) => {
          const label = (button.getAttribute("aria-label") || button.title || "").toLowerCase();
          return label.includes("search") || label.includes("\u641c");
        });
      const searchWrapper = searchButton?.parentElement;
      const host = searchWrapper?.parentElement;

      let button = null;
      if (searchButton && searchWrapper && host) {
        host.setAttribute("data-codex-plus-pro-settings-host", "on");
        button = host.querySelector(":scope > .codex-plus-pro-settings-button");
        if (button && button.getAttribute("data-settings-ui-version") !== SETTINGS_UI_VERSION) {
          button.remove();
          button = null;
        }
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          // Do not clone Search classes: token text colors fight our accent styling.
          button.className = "codex-plus-pro-settings-button";
          button.setAttribute("aria-label", "Codex Plus Pro settings");
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
          button.setAttribute("data-settings-ui-version", SETTINGS_UI_VERSION);
          button.setAttribute("data-settings-entry", "host");
          button.title = "Codex Plus Pro";
          button.innerHTML = SETTINGS_ICON;
          button.addEventListener("click", openSettings);
          host.insertBefore(button, searchWrapper);
        }
        // Host found: remove any floating fallback so only one entry remains.
        removeStaleSettingsButtons(button);
      } else {
        // Fallback: keep the ORIGINAL popover UI, mount a fixed entry when sidebar search is not found.
        button = document.querySelector("body > .codex-plus-pro-settings-button[data-fallback-entry='true']");
        if (button && button.getAttribute("data-settings-ui-version") !== SETTINGS_UI_VERSION) {
          button.remove();
          button = null;
        }
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "codex-plus-pro-settings-button";
          button.setAttribute("data-fallback-entry", "true");
          button.setAttribute("data-settings-entry", "fallback");
          button.setAttribute("aria-label", "Codex Plus Pro settings");
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
          button.setAttribute("data-settings-ui-version", SETTINGS_UI_VERSION);
          button.title = "Codex Plus Pro";
          button.innerHTML = SETTINGS_ICON;
          button.addEventListener("click", openSettings);
          (document.body || document.documentElement).appendChild(button);
        }
        removeStaleSettingsButtons(button);
      }

      ensureSettingsPopover();
      updateSettingsPanel();
    };

    window.__codexPlusProSettingsUiCleanup?.();
    const handleSettingsPointerDown = (event) => {
      if (
        event.target.closest?.(".codex-plus-pro-settings-popover") ||
        event.target.closest?.(".codex-plus-pro-settings-button")
      ) return;
      closeSettingsPopover();
    };
    const handleSettingsKeyDown = (event) => {
      if (event.key === "Escape") closeSettingsPopover();
    };
    document.addEventListener("pointerdown", handleSettingsPointerDown, true);
    document.addEventListener("keydown", handleSettingsKeyDown, true);
    window.__codexPlusProSettingsUiCleanup = () => {
      document.removeEventListener("pointerdown", handleSettingsPointerDown, true);
      document.removeEventListener("keydown", handleSettingsKeyDown, true);
    };

    const decorateHome = () => {
      // Codex may change home icon markup; also detect the 4 feature cards section.
      const homeIcon =
        document.querySelector('[data-testid="home-icon"]') ||
        document.querySelector('[data-feature="game-source"]') ||
        document.querySelector('section[class~="group/home-suggestions"]');
      if (!homeIcon) return;

      const main =
        homeIcon.closest?.('[role="main"]') ||
        document.querySelector('[role="main"]');
      if (main) main.setAttribute(HOME_ATTRIBUTE, "on");

      let panel =
        homeIcon.closest?.('[data-codex-pokedex-home-panel="on"]') ||
        homeIcon.closest?.("section") ||
        homeIcon.parentElement?.parentElement?.parentElement ||
        homeIcon.parentElement?.parentElement ||
        homeIcon.parentElement;

      // Prefer an ancestor that actually contains the 4 feature cards.
      const suggestions = document.querySelector('section[class~="group/home-suggestions"]');
      if (suggestions) {
        let candidate = suggestions.parentElement;
        for (let depth = 0; candidate && depth < 6; depth += 1) {
          if (
            candidate.querySelector?.('[data-testid="home-icon"]') ||
            candidate.querySelector?.('[data-feature="game-source"]') ||
            candidate === main
          ) {
            panel = candidate;
            break;
          }
          candidate = candidate.parentElement;
        }
        if (!panel) panel = suggestions.parentElement || suggestions;
      }

      if (panel && panel !== document.body && panel !== document.documentElement) {
        panel.setAttribute(HOME_PANEL_ATTRIBUTE, "on");
      }

      // Force logo CSS var onto the icon node so accent pack swaps are visible
      // even if a parent background/image wins over the root variable.
      const iconNode = document.querySelector('[data-testid="home-icon"]');
      const logoValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--codex-pokedex-ball-logo")
        .trim();
      if (iconNode && logoValue) {
        iconNode.style.setProperty("background-image", logoValue, "important");
        iconNode.style.setProperty("background-size", "contain", "important");
        iconNode.style.setProperty("background-position", "center", "important");
        iconNode.style.setProperty("background-repeat", "no-repeat", "important");
        iconNode.style.setProperty("opacity", "1", "important");
      }
    };

    const getComposerActionLabel = (button) => {
      if (!(button instanceof HTMLButtonElement)) return "";
      return (
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        button.textContent ||
        ""
      ).toLowerCase();
    };

    const isComposerStopButton = (button) => {
      const label = getComposerActionLabel(button);
      return label.includes("stop") || label.includes("停止");
    };

    const isComposerPrimaryActionButton = (button) => {
      const label = getComposerActionLabel(button);
      return (
        isComposerStopButton(button) ||
        label.includes("send") ||
        label.includes("submit") ||
        label.includes("发送") ||
        label.includes("提交")
      );
    };

    const isComposerVoiceButton = (button) => {
      if (!(button instanceof HTMLButtonElement)) return false;
      if (isComposerPrimaryActionButton(button)) return false;
      const label = (
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        ""
      ).toLowerCase();
      return (
        label.includes("voice") ||
        label.includes("mic") ||
        label.includes("dictat") ||
        label.includes("speech") ||
        label.includes("语音") ||
        label.includes("麦克风") ||
        label.includes("听写") ||
        label.includes("录音")
      );
    };

    const styleComposerActionLikeVoice = (actionButton, voiceButton) => {
      if (!(actionButton instanceof HTMLElement)) return;
      const isStopAction = isComposerStopButton(actionButton);

      // Stop is a task-state control, not a second primary voice CTA. Clear
      // the previous inline voice clone so the themed secondary rule can own it.
      if (isStopAction) {
        for (const key of [
          "background",
          "background-color",
          "background-image",
          "border",
          "border-color",
          "border-width",
          "border-style",
          "border-radius",
          "box-shadow",
          "color",
          "opacity",
          "outline",
          "filter",
          "animation",
        ]) actionButton.style.removeProperty(key);
        for (const svg of actionButton.querySelectorAll("svg, path, rect, circle, line, polyline, polygon")) {
          svg.style.removeProperty("color");
          svg.style.removeProperty("stroke");
          svg.style.removeProperty("fill");
          svg.style.removeProperty("opacity");
        }
        actionButton.setAttribute("data-codex-plus-composer-action-styled", "semantic-stop");
        return;
      }
      const rootStyle = getComputedStyle(document.documentElement);
      const accent = rootStyle.getPropertyValue("--codex-plus-accent").trim() || "#b61f31";
      const accentDark = rootStyle.getPropertyValue("--codex-plus-accent-dark").trim() || "#751522";
      const isDark = document.documentElement.classList.contains("electron-dark");

      // Prefer cloning the live voice/mic button look when available.
      if (voiceButton instanceof HTMLElement) {
        const voiceStyle = getComputedStyle(voiceButton);
        const voiceHasVisibleSurface =
          voiceStyle.backgroundImage !== "none" &&
          voiceStyle.backgroundImage !== "initial" ||
          (voiceStyle.backgroundColor !== "transparent" &&
            voiceStyle.backgroundColor !== "rgba(0, 0, 0, 0)");
        const copyKeys = [
          "background",
          "background-color",
          "background-image",
          "border",
          "border-color",
          "border-width",
          "border-style",
          "border-radius",
          "box-shadow",
          "color",
          "opacity",
          "outline",
          "filter",
        ];
        if (voiceHasVisibleSurface) {
          for (const key of copyKeys) {
            const value = voiceStyle.getPropertyValue(key);
            if (value) actionButton.style.setProperty(key, value, "important");
          }
          actionButton.style.setProperty("animation", "none", "important");
          for (const svg of actionButton.querySelectorAll("svg, path, rect, circle, line, polyline, polygon")) {
            const voiceSvg = voiceButton.querySelector("svg");
            const voiceColor = voiceSvg ? getComputedStyle(voiceSvg).color : voiceStyle.color;
            if (voiceColor) {
              svg.style.setProperty("color", voiceColor, "important");
              svg.style.setProperty("stroke", voiceColor, "important");
              svg.style.setProperty("fill", "currentColor", "important");
              svg.style.setProperty("opacity", "1", "important");
            }
          }
          actionButton.setAttribute("data-codex-plus-composer-action-styled", "voice-match");
          return;
        }
      }

      // Fallback ghost chip if voice button is not present yet.
      if (isDark) {
        actionButton.style.setProperty("color", "rgb(236 242 250 / 0.92)", "important");
        actionButton.style.setProperty("border", "1px solid color-mix(in srgb, " + accent + " 22%, transparent)", "important");
        actionButton.style.removeProperty("background");
        actionButton.style.setProperty("background-color", "color-mix(in srgb, " + accent + " 12%, rgb(28 30 40 / 0.78))", "important");
        actionButton.style.setProperty("background-image", "none", "important");
        actionButton.style.setProperty("box-shadow", "0 1px 3px rgb(0 0 0 / 0.22)", "important");
      } else {
        actionButton.style.setProperty("color", "color-mix(in srgb, " + accentDark + " 78%, #1a1210)", "important");
        actionButton.style.setProperty("border", "1px solid color-mix(in srgb, " + accent + " 18%, transparent)", "important");
        actionButton.style.removeProperty("background");
        actionButton.style.setProperty("background-color", "color-mix(in srgb, " + accent + " 7%, rgb(255 255 255 / 0.9))", "important");
        actionButton.style.setProperty("background-image", "none", "important");
        actionButton.style.setProperty(
          "box-shadow",
          "0 1px 2px color-mix(in srgb, " + accentDark + " 6%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.85)",
          "important",
        );
      }
      actionButton.style.setProperty("outline", "none", "important");
      actionButton.style.setProperty("animation", "none", "important");
      actionButton.style.setProperty("filter", "none", "important");
      actionButton.style.setProperty("opacity", "1", "important");
      const iconColor = isDark
        ? "rgb(236 242 250 / 0.92)"
        : "color-mix(in srgb, " + accentDark + " 82%, #1a1210)";
      for (const svg of actionButton.querySelectorAll("svg, path, rect, circle, line, polyline, polygon")) {
        svg.style.setProperty("color", iconColor, "important");
        svg.style.setProperty("stroke", iconColor, "important");
        svg.style.setProperty("fill", "currentColor", "important");
        svg.style.setProperty("opacity", "1", "important");
      }
      actionButton.setAttribute("data-codex-plus-composer-action-styled", "ghost-fallback");
    };

    const decorateComposerPrimaryActions = () => {
      if (isAvatarOverlay || isHotkeyWindow || !featureSettings.theme) return;

      const composerRoots = new Set();
      for (const node of document.querySelectorAll(
        '.composer-surface-chrome, [class*="composer-surface"], [data-codex-composer="true"]',
      )) {
        const root =
          node.closest?.(".composer-surface-chrome") ||
          node.closest?.('[class*="composer-surface"]') ||
          node.closest?.("form") ||
          node.parentElement ||
          node;
        if (root) composerRoots.add(root);
      }

      for (const root of composerRoots) {
        const buttons = Array.from(root.querySelectorAll("button"));
        if (buttons.length === 0) continue;

        const voiceButton =
          buttons.find((button) => isComposerVoiceButton(button)) ||
          // Prefer the button immediately left of send/stop when labels are opaque.
          null;

        const actionButtons = buttons.filter((button) => isComposerPrimaryActionButton(button));

        // Heuristic fallback: rightmost icon button that is not the voice button.
        if (actionButtons.length === 0) {
          const iconButtons = buttons.filter((button) => button.querySelector("svg"));
          const trailing = iconButtons[iconButtons.length - 1];
          if (trailing && !isComposerVoiceButton(trailing)) actionButtons.push(trailing);
        }

        for (const actionButton of actionButtons) {
          const siblingCandidate =
            actionButton.previousElementSibling instanceof HTMLButtonElement
              ? actionButton.previousElementSibling
              : null;
          const matchedVoice = isComposerVoiceButton(siblingCandidate)
            ? siblingCandidate
            : voiceButton;
          styleComposerActionLikeVoice(actionButton, matchedVoice);
        }
      }
    };

    const EFFORT_LABEL_BY_CODE = {
      minimal: "Light",
      low: "Light",
      medium: "Medium",
      high: "High",
      xhigh: "Extra High",
      max: "Max",
      ultra: "Ultra",
    };

    const modelLabelFromOption = (option) => {
      const label = String(option?.displayName || option?.model || "")
        .replace(/^GPT-/i, "")
        .replaceAll("-", " ")
        .replace(/\s+/g, " ")
        .trim();
      return label || String(option?.model || "");
    };

    const isModelPickerProps = (props) => {
      const canSelectModel = typeof props?.onSelectModel === "function";
      const canSelectEffort = typeof props?.onSelectReasoningEffort === "function" ||
        typeof props?.onSelectPower === "function" ||
        (canSelectModel && Array.isArray(props?.powerSelections));
      return Array.isArray(props?.models) && canSelectModel && canSelectEffort;
    };

    const findModelPickerInterface = (trigger) => {
      if (!(trigger instanceof HTMLElement)) return null;
      for (const key of Object.keys(trigger)) {
        if (key.startsWith("__reactProps$") && isModelPickerProps(trigger[key])) return trigger[key];
      }
      const fiberKey = Object.keys(trigger).find((key) => key.startsWith("__reactFiber$"));
      let fiber = fiberKey ? trigger[fiberKey] : null;
      for (let depth = 0; fiber && depth < 80; depth += 1, fiber = fiber.return) {
        if (isModelPickerProps(fiber.memoizedProps)) return fiber.memoizedProps;
      }
      return null;
    };

    const syncFlatPickerOptions = (picker) => {
      if (!picker) return;
      const modelOptions = picker.models.map(modelLabelFromOption).filter(Boolean);
      if (modelOptions.length > 0) flatPickerState.modelOptions = modelOptions;
      const selectedModel = picker.models.find((option) => option.model === picker.model);
      flatPickerState.availableEfforts = (selectedModel?.supportedReasoningEfforts || [])
        .map((option) => EFFORT_LABEL_BY_CODE[option.reasoningEffort])
        .filter(Boolean);
    };

    const shortModelLabel = (model) => {
      if (model === "5.3 Codex Spark") return "Spark";
      if (model.startsWith("5.6 ")) return model.slice(4);
      return model;
    };

    const shortEffortLabel = (effort) => ({
      Light: "Light",
      Medium: "Med",
      High: "High",
      "Extra High": "XHigh",
      Max: "Max",
      Ultra: "Ultra",
    })[effort] || effort;

    const readPickerSelection = (trigger, picker = findModelPickerInterface(trigger)) => {
      if (picker) {
        const selectedModel = picker.models.find((option) => option.model === picker.model);
        const fastTier = picker.serviceTierOptions?.find((option) => option.iconKind === "fast");
        return {
          model: modelLabelFromOption(selectedModel) || picker.model,
          effort: EFFORT_LABEL_BY_CODE[picker.reasoningEffort] || picker.reasoningEffort || "",
          fast: fastTier != null && picker.selectedServiceTier === fastTier.value,
        };
      }
      const visibleText = String(trigger?.textContent || "").replace(/\s+/g, " ").trim();
      const knownModel = [...flatPickerState.modelOptions]
        .sort((left, right) => right.length - left.length)
        .find((model) => visibleText.includes(model));
      return {
        model: knownModel || flatPickerState.modelOptions[0],
        effort: "",
        fast: false,
      };
    };

    const createFlatPickerGroup = (kind, options) => {
      const group = document.createElement("div");
      group.className = "codex-pokedex-flat-picker-group";
      group.setAttribute("data-flat-picker-group", kind);
      const segments = document.createElement("div");
      segments.className = "codex-pokedex-flat-picker-segments";
      segments.setAttribute("role", kind === "speed" ? "group" : "radiogroup");
      segments.setAttribute("aria-label", kind === "model" ? "模型" : kind === "effort" ? "思考强度" : "快速模式");
      for (const option of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "codex-pokedex-flat-picker-option";
        button.setAttribute("data-flat-picker-kind", kind);
        button.setAttribute("data-flat-picker-value", option);
        if (kind === "model") {
          button.textContent = shortModelLabel(option);
          button.title = "模型：" + option;
          button.setAttribute("role", "radio");
        } else if (kind === "effort") {
          button.textContent = shortEffortLabel(option);
          button.title = "思考强度：" + option;
          button.setAttribute("role", "radio");
        } else {
          const text = document.createElement("span");
          text.textContent = "Fast";
          const track = document.createElement("span");
          track.className = "codex-pokedex-flat-picker-switch-track";
          const thumb = document.createElement("span");
          thumb.className = "codex-pokedex-flat-picker-switch-thumb";
          track.appendChild(thumb);
          button.append(text, track);
          button.title = "快速模式";
          button.setAttribute("role", "switch");
          button.setAttribute("aria-label", "快速模式");
        }
        segments.appendChild(button);
      }
      group.appendChild(segments);
      return group;
    };

    const renderFlatPickerStructure = (bar) => {
      const signature = JSON.stringify({ models: flatPickerState.modelOptions, efforts: flatPickerState.effortOptions });
      if (bar.getAttribute("data-flat-picker-signature") === signature) return;
      bar.replaceChildren(
        createFlatPickerGroup("model", flatPickerState.modelOptions),
        createFlatPickerGroup("effort", flatPickerState.effortOptions),
        createFlatPickerGroup("speed", ["Fast"]),
      );
      bar.setAttribute("data-flat-picker-signature", signature);
    };

    const updateFlatPicker = (bar, trigger, surface) => {
      if (!bar || !trigger || !surface) return;
      const picker = findModelPickerInterface(trigger);
      syncFlatPickerOptions(picker);
      renderFlatPickerStructure(bar);
      const selection = readPickerSelection(trigger, picker);
      const running = Array.from(surface.querySelectorAll("button")).some(isComposerStopButton);
      const fastTier = picker?.serviceTierOptions?.find((option) => option.iconKind === "fast");
      const disabled = running || trigger.disabled || flatPickerState.operationActive || picker == null;
      bar.setAttribute("data-flat-picker-model", selection.model || "");
      bar.setAttribute("data-flat-picker-effort", selection.effort || "");
      bar.setAttribute("data-flat-picker-fast", selection.fast ? "on" : "off");
      bar.setAttribute("data-flat-picker-disabled", disabled ? "on" : "off");
      bar.setAttribute("aria-busy", flatPickerState.operationActive ? "true" : "false");
      for (const button of bar.querySelectorAll("button[data-flat-picker-kind]")) {
        const kind = button.getAttribute("data-flat-picker-kind");
        const value = button.getAttribute("data-flat-picker-value");
        const selected = kind === "model"
          ? value === selection.model
          : kind === "effort" ? value === selection.effort : selection.fast;
        const unavailable = kind === "effort"
          ? !flatPickerState.availableEfforts.includes(value) && !selected
          : kind === "speed" && (fastTier == null || typeof picker?.onSelectServiceTier !== "function");
        button.setAttribute("aria-checked", selected ? "true" : "false");
        button.setAttribute("data-selected", selected ? "true" : "false");
        button.setAttribute("data-unavailable", unavailable ? "true" : "false");
        button.disabled = disabled || unavailable;
        if (unavailable) button.title = "当前模型不支持该选项";
      }
    };

    const normalizeFlatPickerText = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

    const isLikelyFlatPickerTrigger = (button) => {
      if (!(button instanceof HTMLElement) || button.matches('[aria-disabled="true"]')) return false;
      if (button.matches('button[data-codex-intelligence-trigger="true"]')) return true;
      if (findModelPickerInterface(button)) return true;
      const visibleText = normalizeFlatPickerText(button.textContent);
      return flatPickerState.modelOptions.some((model) => visibleText.includes(normalizeFlatPickerText(model)));
    };

    const findFlatPickerTrigger = (surface) => {
      if (!(surface instanceof HTMLElement)) return null;
      const native = surface.querySelector('button[data-codex-intelligence-trigger="true"]');
      if (native) return native;
      const trigger = Array.from(surface.querySelectorAll(FLAT_PICKER_TRIGGER_SELECTOR)).find(isLikelyFlatPickerTrigger) || null;
      if (trigger) trigger.setAttribute("data-codex-intelligence-trigger", "true");
      return trigger;
    };

    const findFlatPickerSurface = (trigger) => {
      if (!(trigger instanceof HTMLElement)) return null;
      const marked = trigger.closest("[" + FLAT_PICKER_SURFACE_ATTRIBUTE + '=\"on\"]');
      if (marked) return marked;
      const footer = trigger.closest("[data-composer-footer-responsive]");
      const root = footer?.closest(
        ".composer-surface-chrome, [data-codex-composer-root], [class*='ComposerLayoutRoot'], form",
      );
      const candidate = root || footer || trigger.closest(".composer-surface-chrome, [data-codex-composer='true'], form");
      if (candidate && candidate !== document.body && candidate !== document.documentElement) return candidate;
      let parent = trigger.parentElement;
      for (let depth = 0; parent && depth < 14; depth += 1, parent = parent.parentElement) {
        if (parent.querySelector('[contenteditable="true"], textarea, button[aria-label="Send"], button[aria-label="Submit"], button[aria-label="Stop"]')) {
          return parent;
        }
      }
      return null;
    };

    const withModelPickerInterface = async (surface, callback) => {
      if (flatPickerState.operationActive) throw new Error("Another picker operation is active");
      flatPickerState.operationActive = true;
      const bar = surface.querySelector(".codex-pokedex-flat-picker");
      updateFlatPicker(bar, findFlatPickerTrigger(surface), surface);
      try {
        const picker = findModelPickerInterface(findFlatPickerTrigger(surface));
        if (!picker) throw new Error("Codex model settings interface was not found");
        return await callback(picker);
      } finally {
        flatPickerState.operationActive = false;
        updateFlatPicker(bar, findFlatPickerTrigger(surface), surface);
      }
    };

    const waitForPageCondition = async (predicate, timeoutMs = 2500) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      if (predicate()) return;
      throw new Error("Timed out waiting for Codex model picker state");
    };

    const selectPickerPower = (picker, powerSelection) => {
      if (typeof picker.onSelectReasoningEffort === "function") {
        picker.onSelectReasoningEffort(powerSelection.reasoningEffort);
        return;
      }
      if (typeof picker.onSelectPower === "function") {
        picker.onSelectPower(powerSelection);
        return;
      }
      if (typeof picker.onSelectModel === "function") {
        picker.onSelectModel(powerSelection.model, powerSelection.reasoningEffort);
        return;
      }
      throw new Error("Option unavailable: Effort " + powerSelection.reasoningEffort);
    };

    const selectFlatPickerOption = async (surface, kind, value) => {
      await withModelPickerInterface(surface, async (picker) => {
        if (kind === "Model") {
          const target = picker.models.find((option) => modelLabelFromOption(option) === value);
          if (!target) throw new Error("Option unavailable: Model " + value);
          const efforts = target.supportedReasoningEfforts || [];
          const effort = efforts.some((option) => option.reasoningEffort === picker.reasoningEffort)
            ? picker.reasoningEffort
            : target.defaultReasoningEffort;
          picker.onSelectModel(target.model, effort);
          await waitForPageCondition(() => {
            const live = findModelPickerInterface(findFlatPickerTrigger(surface));
            return live?.model === target.model && live?.reasoningEffort === effort;
          });
          return;
        }
        if (kind === "Effort") {
          const model = picker.models.find((option) => option.model === picker.model);
          const target = model?.supportedReasoningEfforts?.find((option) => EFFORT_LABEL_BY_CODE[option.reasoningEffort] === value);
          if (!target) throw new Error("Option unavailable: Effort " + value);
          const powerSelection = picker.powerSelections?.find((option) =>
            option.model === picker.model && option.reasoningEffort === target.reasoningEffort,
          ) || {
            model: picker.model,
            reasoningEffort: target.reasoningEffort,
          };
          selectPickerPower(picker, powerSelection);
          await waitForPageCondition(() => findModelPickerInterface(findFlatPickerTrigger(surface))?.reasoningEffort === target.reasoningEffort);
          return;
        }
        const fastTier = picker.serviceTierOptions?.find((option) => option.iconKind === "fast");
        const standardTier = picker.serviceTierOptions?.find((option) => option.iconKind == null);
        if (!fastTier || typeof picker.onSelectServiceTier !== "function") throw new Error("Option unavailable: Speed Fast");
        const target = picker.selectedServiceTier === fastTier.value ? standardTier?.value ?? null : fastTier.value;
        picker.onSelectServiceTier(target);
        await waitForPageCondition(() => findModelPickerInterface(findFlatPickerTrigger(surface))?.selectedServiceTier === target);
      });
    };

    const handleFlatPickerClick = async (event) => {
      const button = event.target.closest("button[data-flat-picker-kind]");
      if (!button || button.disabled) return;
      const bar = button.closest(".codex-pokedex-flat-picker");
      const surface = findFlatPickerSurface(bar);
      if (!surface) return;
      const kindValue = button.getAttribute("data-flat-picker-kind");
      const nativeKind = kindValue === "model" ? "Model" : kindValue === "effort" ? "Effort" : "Speed";
      const value = button.getAttribute("data-flat-picker-value");
      if (nativeKind !== "Speed" && button.getAttribute("data-selected") === "true") return;
      bar.setAttribute("data-flat-picker-working", "on");
      try {
        await selectFlatPickerOption(surface, nativeKind, value);
        surface.removeAttribute(FLAT_PICKER_FAILURE_ATTRIBUTE);
        updateFlatPicker(bar, findFlatPickerTrigger(surface), surface);
      } catch (error) {
        console.error("Codex Plus Pro model picker operation failed", error);
        if (!String(error?.message || error).startsWith("Option unavailable:") && String(error?.message || error) !== "Another picker operation is active") {
          const failures = Number(surface.getAttribute(FLAT_PICKER_FAILURE_ATTRIBUTE) || 0) + 1;
          surface.setAttribute(FLAT_PICKER_FAILURE_ATTRIBUTE, String(failures));
          bar.setAttribute("data-flat-picker-error", "on");
          window.setTimeout(() => bar.removeAttribute("data-flat-picker-error"), 900);
        }
      } finally {
        bar.removeAttribute("data-flat-picker-working");
      }
    };

    const decorateFlatPicker = () => {
      if (isAvatarOverlay || isHotkeyWindow || !featureSettings.modelPicker) return;
      const surfaces = new Set();
      for (const button of document.querySelectorAll(FLAT_PICKER_TRIGGER_SELECTOR)) {
        if (!isLikelyFlatPickerTrigger(button)) continue;
        const surface = findFlatPickerSurface(button);
        if (!surface || surfaces.has(surface)) continue;
        surfaces.add(surface);
        if (surface.scrollTop > 0) surface.scrollTop = 0;
        let bar = surface.querySelector(".codex-pokedex-flat-picker");
        if (bar && bar.getAttribute("data-flat-picker-version") !== FLAT_PICKER_VERSION) bar.remove();
        if (!bar) {
          bar = document.createElement("div");
          bar.className = "codex-pokedex-flat-picker";
          bar.setAttribute("data-flat-picker-version", FLAT_PICKER_VERSION);
          bar.addEventListener("click", handleFlatPickerClick);
          surface.appendChild(bar);
        }
        document.documentElement.setAttribute(FLAT_PICKER_ATTRIBUTE, "on");
        surface.setAttribute(FLAT_PICKER_SURFACE_ATTRIBUTE, "on");
        updateFlatPicker(bar, button, surface);
      }
      for (const surface of document.querySelectorAll("[" + FLAT_PICKER_SURFACE_ATTRIBUTE + '=\"on\"]')) {
        const trigger = findFlatPickerTrigger(surface);
        if (!trigger || findFlatPickerSurface(trigger) !== surface) {
          surface.removeAttribute(FLAT_PICKER_SURFACE_ATTRIBUTE);
          surface.removeAttribute(FLAT_PICKER_FAILURE_ATTRIBUTE);
        }
      }
    };

    const removeFlatPicker = () => {
      document.documentElement.removeAttribute(FLAT_PICKER_ATTRIBUTE);
      for (const bar of document.querySelectorAll(".codex-pokedex-flat-picker")) bar.remove();
      for (const surface of document.querySelectorAll("[" + FLAT_PICKER_SURFACE_ATTRIBUTE + "]")) {
        surface.removeAttribute(FLAT_PICKER_SURFACE_ATTRIBUTE);
        surface.removeAttribute(FLAT_PICKER_FAILURE_ATTRIBUTE);
      }
    };

    window.__codexPokedexActivityChannel?.close();
    // Codex 26.924+ owns the model and reasoning controls in the native composer footer.
    const activityChannel = new BroadcastChannel(ACTIVITY_CHANNEL_NAME);
    window.__codexPokedexActivityChannel = activityChannel;
    window.__codexPlusProSettingsChannel?.close();
    const settingsChannel = new BroadcastChannel(SETTINGS_CHANNEL_NAME);
    window.__codexPlusProSettingsChannel = settingsChannel;
    const postChannelMessage = (channel, message) => {
      try {
        channel.postMessage(message);
        return true;
      } catch (error) {
        if (error?.name === "InvalidStateError") return false;
        throw error;
      }
    };

    const readTaskRunningState = () => Array.from(document.querySelectorAll("button"))
      .some((button) => isComposerStopButton(button));

    const publishTaskState = (running = readTaskRunningState()) => {
      if (isAvatarOverlay) return;
      document.documentElement.setAttribute(TASK_RUNNING_ATTRIBUTE, running ? "on" : "off");
      postChannelMessage(activityChannel, { type: "task-state", running });
    };

    activityChannel.addEventListener("message", (event) => {
      if (event.data?.type === "task-state-request" && !isAvatarOverlay) {
        publishTaskState();
      } else if (event.data?.type === "task-state" && isAvatarOverlay) {
        document.documentElement.setAttribute(
          TASK_RUNNING_ATTRIBUTE,
          event.data.running ? "on" : "off",
        );
      }
    });

    const applyWallpaperWash = () => {
      const root = document.documentElement;
      if (!root) return;
      const wallpaperRatio = featureSettings.wallpaperStrength / 100;
      const wallpaperWash = {
        start: 0.98 - 0.02 * wallpaperRatio,
        mid: 0.94 - 0.02 * wallpaperRatio,
        late: 0.84 - 0.04 * wallpaperRatio,
        end: 0.78 - 0.06 * wallpaperRatio,
      };
      root.style.setProperty("--codex-plus-wallpaper-wash-start", String(wallpaperWash.start));
      root.style.setProperty("--codex-plus-wallpaper-wash-mid", String(wallpaperWash.mid));
      root.style.setProperty("--codex-plus-wallpaper-wash-late", String(wallpaperWash.late));
      root.style.setProperty("--codex-plus-wallpaper-wash-end", String(wallpaperWash.end));
    };

    const markMainContentSurface = () => {
      applyWallpaperWash();

      const candidates = [
        document.querySelector('main[class*="MainContentSurface"]'),
        document.querySelector('main[role="main"]'),
        document.querySelector('[role="main"]'),
        document.querySelector('main'),
      ];
      const surface = candidates.find((element) =>
        element instanceof HTMLElement &&
        !element.closest('[data-codex-pokedex-avatar-overlay="on"]'),
      ) || null;

      for (const current of document.querySelectorAll("[" + MAIN_SURFACE_ATTRIBUTE + "]")) {
        if (current !== surface) current.removeAttribute(MAIN_SURFACE_ATTRIBUTE);
      }
      if (surface) surface.setAttribute(MAIN_SURFACE_ATTRIBUTE, "on");

      const headerCandidates = Array.from(document.querySelectorAll(
        'header[data-app-shell-titlebar="true"], header[class*="Header"], header',
      ));
      const header = headerCandidates.find((candidate) => {
        if (candidate.closest('[data-codex-pokedex-avatar-overlay="on"]')) return false;
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      }) || headerCandidates.find((candidate) =>
        !candidate.closest('[data-codex-pokedex-avatar-overlay="on"]'),
      ) || surface?.querySelector("header") || document.querySelector("header");
      for (const current of document.querySelectorAll("[" + HEADER_ATTRIBUTE + "]")) {
        if (current !== header) {
          current.removeAttribute(HEADER_ATTRIBUTE);
          current.classList.remove("app-header-tint");
        }
      }
      if (header && !header.closest('[data-codex-pokedex-avatar-overlay="on"]')) {
        header.setAttribute(HEADER_ATTRIBUTE, "on");
        header.classList.add("app-header-tint");
      }

      const composerRoots = new Set();
      for (const node of document.querySelectorAll(
        '[data-composer-radius-variant], [class*="ComposerLayoutRoot"]',
      )) {
        const composer = node.closest?.(
          '[data-composer-radius-variant], [class*="ComposerLayoutRoot"]',
        ) || node;
        if (
          composer instanceof HTMLElement &&
          !composer.closest('[data-codex-pokedex-avatar-overlay="on"]') &&
          !isHotkeyWindow
        ) {
          composerRoots.add(composer);
        }
      }
      for (const current of document.querySelectorAll("[" + COMPOSER_ATTRIBUTE + "]")) {
        if (!composerRoots.has(current)) {
          current.removeAttribute(COMPOSER_ATTRIBUTE);
          current.classList.remove("composer-surface-chrome");
          current.style.removeProperty("border-width");
          current.style.removeProperty("border-style");
          current.style.removeProperty("border-color");
        }
      }
      for (const composer of composerRoots) {
        composer.setAttribute(COMPOSER_ATTRIBUTE, "on");
        composer.classList.add("composer-surface-chrome");
        if (featureSettings.theme) {
          // The current utility layer keeps border-width:0!important on the
          // native root. These are the only shell properties that need a
          // lifecycle-scoped inline compatibility override.
          composer.style.setProperty("border-width", "1px", "important");
          composer.style.setProperty("border-style", "solid", "important");
          composer.style.setProperty(
            "border-color",
            "color-mix(in srgb, var(--codex-plus-accent, #b61f31) 48%, transparent)",
            "important",
          );
        } else {
          composer.style.removeProperty("border-width");
          composer.style.removeProperty("border-style");
          composer.style.removeProperty("border-color");
        }
      }
      return surface;
    };

    const clearApprovalSurfaceMarkers = () => {
      for (const current of document.querySelectorAll(
        "[" + APPROVAL_SURFACE_ATTRIBUTE + "],[" + APPROVAL_MCP_ATTRIBUTE + "]",
      )) {
        current.removeAttribute(APPROVAL_SURFACE_ATTRIBUTE);
        current.removeAttribute(APPROVAL_MCP_ATTRIBUTE);
      }
    };

    // Native approval cards share a role=alert heading and decision form. The
    // terminal variant also has a command preview; MCP approvals instead expose
    // a small server/tool detail block, so identify that path separately.
    const markApprovalSurfaces = () => {
      if (isAvatarOverlay || isHotkeyWindow || !featureSettings.theme) {
        clearApprovalSurfaceMarkers();
        return;
      }

      const surfaces = new Map();
      for (const alert of document.querySelectorAll('[role="alert"]')) {
        let surface = alert.parentElement;
        for (let depth = 0; surface && depth < 6; depth += 1, surface = surface.parentElement) {
          if (!(surface instanceof HTMLElement)) continue;
          if (surface === document.body || surface === document.documentElement) continue;
          const form = surface.matches("form") ? surface : surface.querySelector("form");
          const formCount = surface.querySelectorAll("form").length + (surface.matches("form") ? 1 : 0);
          if (!form || formCount !== 1) continue;
          const buttons = Array.from(surface.querySelectorAll("button"));
          if (buttons.length > 6) continue;
          const decisionButtons = buttons.filter((button) => {
            const label = (button.getAttribute("aria-label") || "").trim();
            const text = (button.textContent || "").replace(/\\s+/g, " ").trim();
            return /允许|allow|拒绝|deny/i.test(label + " " + text);
          });
          if (decisionButtons.length < 2) continue;
          const preview = surface.querySelector(
            '[class~="font-mono"], pre, code',
          );
          const copy = (surface.textContent || "").replace(/\\s+/g, " ");
          const approvalCopy = /终端|terminal|允许.*运行|allow.*run|运行.*命令|run.*command/i.test(copy);
          const mcpApprovalCopy = /mcp[\\s\\S].*(server|服务器)[\\s\\S].*(tool|工具)/i.test(copy);
          if ((preview && approvalCopy) || mcpApprovalCopy) {
            surfaces.set(surface, mcpApprovalCopy);
            break;
          }
        }
      }

      for (const current of document.querySelectorAll(
        "[" + APPROVAL_SURFACE_ATTRIBUTE + "],[" + APPROVAL_MCP_ATTRIBUTE + "]",
      )) {
        if (!surfaces.has(current)) {
          current.removeAttribute(APPROVAL_SURFACE_ATTRIBUTE);
          current.removeAttribute(APPROVAL_MCP_ATTRIBUTE);
        }
      }
      for (const [surface, isMcp] of surfaces) {
        surface.setAttribute(APPROVAL_SURFACE_ATTRIBUTE, "on");
        if (isMcp) {
          surface.setAttribute(APPROVAL_MCP_ATTRIBUTE, "on");
        } else {
          surface.removeAttribute(APPROVAL_MCP_ATTRIBUTE);
        }
      }
    };

    const clearTaskStatusDecorations = () => {
      for (const current of document.querySelectorAll("[" + TASK_STATUS_ATTRIBUTE + "]")) {
        current.removeAttribute(TASK_STATUS_ATTRIBUTE);
        current.removeAttribute(TASK_STATUS_STATE_ATTRIBUTE);
      }
    };

    const decorateTaskStatus = (taskRunning = readTaskRunningState()) => {
      clearTaskStatusDecorations();
      if (isAvatarOverlay || isHotkeyWindow || !featureSettings.theme) return;

      const composer = Array.from(document.querySelectorAll(
        "[" + COMPOSER_ATTRIBUTE + '=\"on\"], .composer-surface-chrome',
      )).find((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (element.closest('[data-codex-pokedex-avatar-overlay="on"]')) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0 &&
          rect.width >= 180 &&
          rect.height >= 40 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        );
      });
      if (!composer) return;

      const composerRect = composer.getBoundingClientRect();
      const visibleStatus = Array.from(document.querySelectorAll('[role="status"]'))
        .filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          if (element.closest("[" + COMPOSER_ATTRIBUTE + '=\"on\"]')) return false;
          if (element.classList.contains("sr-only")) return false;
          if (element.id.toLowerCase().includes("liveregion")) return false;
          if (element.closest('[aria-hidden="true"]')) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const horizontalOverlap = Math.max(
            0,
            Math.min(rect.right, composerRect.right) - Math.max(rect.left, composerRect.left),
          );
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number.parseFloat(style.opacity || "1") > 0 &&
            rect.width >= 180 &&
            rect.height >= 8 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            rect.bottom <= composerRect.top + 16 &&
            horizontalOverlap >= Math.min(180, composerRect.width * 0.45)
          );
        })
        .map((element) => ({
          element,
          distance: Math.max(0, composerRect.top - element.getBoundingClientRect().bottom),
        }))
        .sort((left, right) => left.distance - right.distance);
      const candidate = visibleStatus[0]?.element;
      if (!candidate) return;

      const text = (candidate.textContent || "").replace(/\s+/g, " ").trim();
      const normalizedText = text.toLowerCase();
      let state = "info";
      if (taskRunning) {
        state = "running";
      } else if (/失败|错误|异常|failed|failure|error|exception/.test(normalizedText)) {
        state = "error";
      } else if (/完成|成功|已处理|complete|completed|successful|success|done|finished/.test(normalizedText)) {
        state = "complete";
      } else if (/正在|启动|等待|设置|准备|处理中|运行|starting|waiting|setting up|preparing|processing|running|queued|in progress|working/.test(normalizedText)) {
        state = "pending";
      }
      candidate.setAttribute(TASK_STATUS_ATTRIBUTE, "on");
      candidate.setAttribute(TASK_STATUS_STATE_ATTRIBUTE, state);
    };

    const applyFeatureSettings = (nextSettings, options = {}) => {
      const { persist = true, broadcast = true, notify = true } = options;
      // Scope B2: all shipped features are user-toggleable.
      featureSettings = normalizeFeatureSettings(nextSettings);
      if (persist) {
        try {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(featureSettings));
        } catch (error) {
          console.warn("Codex Plus Pro could not persist settings", error);
        }
      }
      if (!document.documentElement) return;
      const root = document.documentElement;
      markMainContentSurface();
      markApprovalSurfaces();
      for (const [key, attribute] of Object.entries(FEATURE_ATTRIBUTES)) {
        root.setAttribute(attribute, featureSettings[key] ? "on" : "off");
      }
      const adaptiveTheme = featureSettings.accent === "adaptive" ? readAdaptiveTheme() : null;
      const accent = adaptiveTheme || ACCENT_OPTIONS[featureSettings.accent] || ACCENT_OPTIONS.pokedex;
      if (
        featureSettings.accent === "adaptive" &&
        readCustomWallpaper() &&
        adaptiveTheme?.strategy !== ADAPTIVE_THEME_STRATEGY &&
        !window.__codexPlusProAdaptiveRefreshPending
      ) {
        window.__codexPlusProAdaptiveRefreshPending = true;
        generateAdaptiveTheme()
          .then(() => {
            window.__codexPlusProAdaptiveRefreshPending = false;
            applyFeatureSettings(featureSettings, { persist: false, broadcast: false, notify: false });
            updateSettingsPanel();
          })
          .catch((error) => {
            window.__codexPlusProAdaptiveRefreshPending = false;
            console.warn("Codex Plus Pro adaptive theme refresh failed", error);
          });
      }
      applyWallpaperWash();
      root.setAttribute("data-codex-plus-accent", featureSettings.accent);
      root.setAttribute("data-codex-plus-pet-motion", featureSettings.petMotion);
      root.setAttribute("data-codex-plus-model-density", featureSettings.modelDensity);
      root.style.setProperty("--codex-plus-accent", accent.color);
      root.style.setProperty("--codex-plus-accent-dark", accent.dark);
      root.style.setProperty("--codex-plus-highlight", accent.highlight);
      // Keep the theme wash readable while leaving enough of the wallpaper visible.
      // The previous 95-99% left-side wash made the image look missing at the default strength.
      const accentPack = resolveAccentPack(featureSettings.accent);
      const customWallpaper = featureSettings.wallpaperMode === "custom" ? readCustomWallpaper() : "";
      root.setAttribute("data-codex-plus-wallpaper-mode", featureSettings.wallpaperMode === "custom" ? "custom" : "default");
      if (customWallpaper) {
        root.style.setProperty("--codex-pokedex-wallpaper", "url(" + JSON.stringify(customWallpaper) + ")");
      } else if (accentPack.wallpaper) {
        // Default wallpaper follows the selected accent pack.
        root.style.setProperty("--codex-pokedex-wallpaper", "url(" + JSON.stringify(accentPack.wallpaper) + ")");
      } else if (window.__codexPlusProDefaultWallpaper) {
        root.style.setProperty("--codex-pokedex-wallpaper", "url(" + JSON.stringify(window.__codexPlusProDefaultWallpaper) + ")");
      } else {
        root.style.removeProperty("--codex-pokedex-wallpaper");
      }
      const customLogo = featureSettings.logoMode === "custom" ? readCustomLogo() : "";
      root.setAttribute("data-codex-plus-logo-mode", featureSettings.logoMode === "custom" ? "custom" : "default");
      if (customLogo) {
        root.style.setProperty("--codex-pokedex-ball-logo", "url(" + JSON.stringify(customLogo) + ")");
      } else if (accentPack.logo) {
        // Default logo follows the selected accent pack.
        root.style.setProperty("--codex-pokedex-ball-logo", "url(" + JSON.stringify(accentPack.logo) + ")");
      } else if (window.__codexPlusProDefaultLogo) {
        root.style.setProperty("--codex-pokedex-ball-logo", "url(" + JSON.stringify(window.__codexPlusProDefaultLogo) + ")");
      } else {
        root.style.removeProperty("--codex-pokedex-ball-logo");
      }
      if (!isAvatarOverlay && featureSettings.theme) {
        root.setAttribute(THEME_ATTRIBUTE, "on");
      } else {
        root.removeAttribute(THEME_ATTRIBUTE);
      }
      if (isAvatarOverlay && featureSettings.pet) root.setAttribute(OVERLAY_ATTRIBUTE, "on");
      else root.removeAttribute(OVERLAY_ATTRIBUTE);
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      // On Windows, host applies theme.css via CDP chunks. Do not overwrite a longer stylesheet
      // with the placeholder source string used by buildInjectionSource().
      if (!style.textContent || style.textContent.length < 1000) {
        if (css && !css.includes("css applied via host chunks") && style.textContent !== css) {
          style.textContent = css;
        }
      }
      if (!isAvatarOverlay) {
        decorateSettingsButton();
        if (featureSettings.theme) decorateHome();
        else {
          document.querySelector("[" + HOME_ATTRIBUTE + "]")?.removeAttribute(HOME_ATTRIBUTE);
          document.querySelector("[" + HOME_PANEL_ATTRIBUTE + "]")?.removeAttribute(HOME_PANEL_ATTRIBUTE);
        }
        if (featureSettings.theme) decorateComposerPrimaryActions();
        const taskRunning = readTaskRunningState();
        decorateTaskStatus(taskRunning);
        if (featureSettings.modelPicker) decorateFlatPicker();
        else removeFlatPicker();
        publishTaskState(taskRunning);
      }
      updateSettingsPanel();
      window.__codexPlusProFeatureSettings = { ...featureSettings };
      window.__codexPlusProApplySettings = (value) => applyFeatureSettings(value, {
        persist: true,
        broadcast: false,
        notify: true,
      });
      // Scope B2 diagnostic helper.
      window.__codexPlusProDumpScopeA = () => {
        const s = { ...featureSettings };
        const ok =
          (s.theme !== undefined) &&
          (s.accent && s.wallpaperStrength !== undefined) &&
          (typeof s.pet === "boolean") &&
          (typeof s.modelPicker === "boolean");
        console.log("[Codex Plus Pro] Scope B2 state:", s);
        console.log("[Codex Plus Pro] Scope B2 contract OK?", ok);
        return { state: s, scopeB2ContractOk: ok };
      };

      if (broadcast) postChannelMessage(settingsChannel, featureSettings);
      if (notify && typeof window[SETTINGS_BINDING] === "function") {
        window[SETTINGS_BINDING](JSON.stringify(featureSettings));
      }
    };

    settingsChannel.addEventListener("message", (event) => {
      applyFeatureSettings(event.data, { persist: true, broadcast: false, notify: true });
    });

    const refreshDecorations = () => {
      refreshFrame = 0;
      markMainContentSurface();
      markApprovalSurfaces();
      if (!isAvatarOverlay) {
        decorateSettingsButton();
        if (featureSettings.theme) decorateHome();
        if (featureSettings.theme) decorateComposerPrimaryActions();
        const taskRunning = readTaskRunningState();
        decorateTaskStatus(taskRunning);
        if (featureSettings.modelPicker) decorateFlatPicker();
        else removeFlatPicker();
        publishTaskState(taskRunning);
      }
    };

    const scheduleRefresh = () => {
      if (refreshFrame) return;
      refreshFrame = window.requestAnimationFrame(refreshDecorations);
    };

    syncNativeDarkThemeClass();
    applyFeatureSettings(featureSettings, { persist: false, broadcast: false, notify: true });
    window.__codexPokedexThemeObserver?.disconnect();
    window.__codexPokedexThemeObserver = new MutationObserver(() => {
      syncNativeDarkThemeClass();
      if (!document.getElementById(STYLE_ID)) {
        applyFeatureSettings(featureSettings, { persist: false, broadcast: false, notify: false });
      } else {
        scheduleRefresh();
      }
    });
    window.__codexPokedexThemeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        THEME_ATTRIBUTE,
        HOST_THEME_ATTRIBUTE,
        OVERLAY_ATTRIBUTE,
        COMPOSER_ATTRIBUTE,
        "class",
        "data-composer-layout",
        "data-composer-radius-variant",
        "data-composer-surface-variant",
        "role",
        ...Object.values(FEATURE_ATTRIBUTES),
      ],
    });
    if (isAvatarOverlay) postChannelMessage(activityChannel, { type: "task-state-request" });
    const cleanupRuntime = () => {
      if (refreshFrame) {
        window.cancelAnimationFrame(refreshFrame);
        refreshFrame = 0;
      }
      window.__codexPokedexThemeObserver?.disconnect();
      window.__codexPlusProSettingsUiCleanup?.();
      if (document.documentElement.getAttribute(DARK_THEME_COMPAT_ATTRIBUTE) === "on") {
        document.documentElement.classList.remove(DARK_THEME_CLASS);
        document.documentElement.removeAttribute(DARK_THEME_COMPAT_ATTRIBUTE);
      }
      try { activityChannel.close(); } catch {}
      try { settingsChannel.close(); } catch {}
      document.querySelector(".codex-plus-pro-settings-button")?.remove();
      document.querySelector(".codex-plus-pro-settings-popover")?.remove();
      document.querySelector(".codex-plus-pro-settings-backdrop")?.remove();
      document.documentElement.removeAttribute(FLAT_PICKER_ATTRIBUTE);
      for (const element of document.querySelectorAll(
        ".codex-pokedex-flat-picker, [" + FLAT_PICKER_SURFACE_ATTRIBUTE + "], [" + FLAT_PICKER_FAILURE_ATTRIBUTE + "]",
      )) {
        if (element.matches(".codex-pokedex-flat-picker")) element.remove();
        else {
          element.removeAttribute(FLAT_PICKER_SURFACE_ATTRIBUTE);
          element.removeAttribute(FLAT_PICKER_FAILURE_ATTRIBUTE);
        }
      }
      for (const element of document.querySelectorAll("[" + COMPOSER_ATTRIBUTE + "]")) {
        element.removeAttribute(COMPOSER_ATTRIBUTE);
        element.classList.remove("composer-surface-chrome");
        element.style.removeProperty("border-width");
        element.style.removeProperty("border-style");
        element.style.removeProperty("border-color");
      }
      clearApprovalSurfaceMarkers();
      clearTaskStatusDecorations();
      if (window.__codexPokedexActivityChannel === activityChannel) window.__codexPokedexActivityChannel = null;
      if (window.__codexPlusProSettingsChannel === settingsChannel) window.__codexPlusProSettingsChannel = null;
      if (window.__codexPlusProRuntimeCleanup === cleanupRuntime) delete window.__codexPlusProRuntimeCleanup;
    };
    window.__codexPlusProRuntimeCleanup = cleanupRuntime;
    return {
      active: true,
      version: ${JSON.stringify(WINDOWS_SCOPE_A_VERSION)},
      avatarOverlay: isAvatarOverlay,
      hotkeyWindow: isHotkeyWindow,
    };
  })()`;
}

function buildBootstrapSource() {
  return buildInjectionSource("/* css applied via host chunks */");
}

function buildAssetApplySource(wallpaperDataUri, logoDataUri) {
  return `(() => {
    const root = document.documentElement;
    if (!root) return { ok: false };
    root.style.setProperty("--codex-pokedex-wallpaper", "url(" + ${JSON.stringify(wallpaperDataUri)} + ")");
    if (root.getAttribute("data-codex-plus-logo-mode") !== "custom") {
      root.style.setProperty("--codex-pokedex-ball-logo", "url(" + ${JSON.stringify(logoDataUri)} + ")");
    }
    return { ok: true };
  })()`;
}

function buildMainControllerSource() {
  return `(async () => {
    const CONTROLLER_KEY = "__codexPokedexPetWindowController";
    const previous = globalThis[CONTROLLER_KEY] || globalThis.__codexPokedexPipWindowController;
    if (previous?.timer) clearInterval(previous.timer);
    try { previous?.abortOpenThread?.(); } catch {}

    const electron = process.mainModule?.require?.("electron");
    if (!electron?.BrowserWindow) throw new Error("Electron BrowserWindow is unavailable");

    // Drop legacy PiP controller alias if present.
    try { delete globalThis.__codexPokedexPipWindowController; } catch {}

    // Do not reuse previous pet show-guards: their closures capture the old
    // controller.features object and can keep hiding after reinjection.
    if (previous?.petShowGuards instanceof Map) {
      for (const [windowId, guard] of previous.petShowGuards) {
        try {
          const existing = electron.BrowserWindow.fromId(Number(windowId));
          if (existing && !existing.isDestroyed()) existing.removeListener("show", guard);
        } catch {}
      }
      previous.petShowGuards.clear();
    }

    const petWindowVisibility = new Map();
    const petHiddenByUs = new Set();
    const petShowGuards = new Map();
    const controller = {
      active: true,
      version: "1.8.9",
      petWindowVisibility,
      petHiddenByUs,
      petShowGuards,
      features: {
        pet: previous?.features?.pet !== false,
      },
      lastAppliedAt: null,
      timer: null,
    };

    const getInitialRoute = (window) => {
      try {
        const rawUrl = window.webContents?.getURL?.() || "";
        if (!rawUrl) return "";
        const parsed = new URL(rawUrl);
        const fromQuery = parsed.searchParams.get("initialRoute") || "";
        if (fromQuery) return fromQuery;
        const pathname = parsed.pathname || "";
        if (pathname === "/avatar-overlay" || pathname.endsWith("/avatar-overlay")) return "/avatar-overlay";
        if (pathname.includes("avatar-overlay-composition-surface")) return "/avatar-overlay-composition-surface";
        return "";
      } catch {
        return "";
      }
    };

    const isMainPetOverlayWindow = (window) => {
      try {
        const rawUrl = window.webContents?.getURL?.() || "";
        if (!rawUrl) return false;
        const parsed = new URL(rawUrl);
        const route = parsed.searchParams.get("initialRoute") || "";
        if (route === "/avatar-overlay") return true;
        const pathname = parsed.pathname || "";
        if (pathname === "/avatar-overlay" || pathname.endsWith("/avatar-overlay")) return true;
        if (pathname.includes("avatar-overlay-composition-surface")) return true;
        const title = String(window.getTitle?.() || "");
        if (title.startsWith("Pet Surface")) return true;
        return false;
      } catch {
        return false;
      }
    };

    const getWindow = (id) => {
      const window = electron.BrowserWindow.fromId(Number(id));
      return window && !window.isDestroyed() ? window : null;
    };

    const dispatchAvatarOverlayMessage = async (message, { firstOnly = false, includeOverlay = true } = {}) => {
      let sent = 0;
      const expression = \`(() => {
        const message = \${JSON.stringify(message)};
        try {
          if (typeof window.electronBridge?.sendMessageFromView === "function") {
            const pending = window.electronBridge.sendMessageFromView(message);
            pending?.catch?.(() => {});
            return { ok: true, bridge: true };
          }
        } catch {}
        try {
          window.dispatchEvent(new CustomEvent("codex-message-from-view", { detail: message }));
          return { ok: true, bridge: false };
        } catch {
          return { ok: false };
        }
      })()\`;
      const candidates = electron.BrowserWindow.getAllWindows().filter((window) => {
        if (window.isDestroyed()) return false;
        const route = getInitialRoute(window);
        if (route.startsWith("/hotkey-window")) return false;
        if (!includeOverlay && isMainPetOverlayWindow(window)) return false;
        return true;
      });
      if (firstOnly) {
        for (const window of candidates) {
          try {
            const result = await window.webContents?.executeJavaScript(expression, true);
            if (result?.ok) return 1;
          } catch {}
        }
        return 0;
      }
      const tasks = [];
      for (const window of candidates) {
        try {
          tasks.push(window.webContents?.executeJavaScript(expression, true).then((result) => {
            if (result?.ok) sent += 1;
          }).catch(() => {}));
        } catch {}
      }
      await Promise.allSettled(tasks);
      return sent;
    };

    let applyInFlight = null;

    const applyWindowPolicy = async () => {
      if (applyInFlight) return applyInFlight;
      applyInFlight = (async () => {
        const livePetIds = new Set();
        for (const window of electron.BrowserWindow.getAllWindows()) {
          if (window.isDestroyed()) continue;
          if (!isMainPetOverlayWindow(window)) continue;
          const id = window.id;
          livePetIds.add(id);
          if (!controller.features.pet) {
            try {
              if (!petShowGuards.has(id)) {
                const guard = () => {
                  try {
                    if (!controller.features.pet && !window.isDestroyed() && window.isVisible()) {
                      window.hide();
                    }
                  } catch {}
                };
                window.on("show", guard);
                petShowGuards.set(id, guard);
              }
              petHiddenByUs.add(id);
              if (window.isVisible()) window.hide();
              else {
                try { window.hide(); } catch {}
              }
            } catch (error) {
              console.warn("Codex Plus Pro could not hide avatar-overlay window", error);
            }
          } else if (petShowGuards.has(id)) {
            try {
              window.removeListener("show", petShowGuards.get(id));
            } catch {}
            petShowGuards.delete(id);
          }
        }

        for (const id of petWindowVisibility.keys()) {
          if (!livePetIds.has(id)) petWindowVisibility.delete(id);
        }
        for (const id of [...petHiddenByUs]) {
          if (!livePetIds.has(id)) petHiddenByUs.delete(id);
        }
        for (const [id, guard] of [...petShowGuards]) {
          if (!livePetIds.has(id)) {
            const window = getWindow(id);
            if (window) {
              try { window.removeListener("show", guard); } catch {}
            }
            petShowGuards.delete(id);
          }
        }
        controller.lastAppliedAt = Date.now();
        return livePetIds.size;
      })();
      try {
        return await applyInFlight;
      } finally {
        applyInFlight = null;
      }
    };

    controller.apply = applyWindowPolicy;
    controller.setFeatures = async (next) => {
      const nextPet = next?.pet !== false;
      const petEnabledEdge = nextPet && !controller.features.pet;
      const petDisabledEdge = !nextPet && controller.features.pet;
      try { console.log("Codex Plus Pro pet feature ->", nextPet, { petEnabledEdge, petDisabledEdge }); } catch {}
      controller.features = { pet: nextPet };
      if (petDisabledEdge) {
        await dispatchAvatarOverlayMessage({ type: "avatar-overlay-close" });
      }
      if (petEnabledEdge) {
        for (const [windowId, guard] of [...petShowGuards]) {
          const window = getWindow(windowId);
          if (window) {
            try { window.removeListener("show", guard); } catch {}
          }
          petShowGuards.delete(windowId);
        }
        let restoredAny = false;
        for (const windowId of [...petHiddenByUs]) {
          petHiddenByUs.delete(windowId);
          const window = getWindow(windowId);
          if (!window) continue;
          try {
            if (!window.isVisible()) window.showInactive();
            restoredAny = true;
          } catch (error) {
            console.warn("Codex Plus Pro could not restore avatar-overlay window", error);
          }
        }
        if (!restoredAny) {
          for (const window of electron.BrowserWindow.getAllWindows()) {
            if (window.isDestroyed()) continue;
            if (!isMainPetOverlayWindow(window)) continue;
            try {
              if (!window.isVisible()) window.showInactive();
              restoredAny = true;
            } catch {}
          }
        }
        if (!restoredAny) {
          await dispatchAvatarOverlayMessage(
            { type: "avatar-overlay-open" },
            { firstOnly: true, includeOverlay: false },
          );
        }
      }
      return {
        ...controller.features,
        controlled: await applyWindowPolicy(),
      };
    };
    controller.timer = setInterval(() => void applyWindowPolicy(), 500);
    globalThis[CONTROLLER_KEY] = controller;
    const controlled = await applyWindowPolicy();
    return { active: true, version: controller.version, controlled };
  })()`;
}

import fs from "node:fs/promises";

const injectorPath = "E:/dev/Codex_Plus_Pro-main/windows/source/injector.mjs";
const controllerPath = "E:/dev/Codex_Plus_Pro-main/windows/source/_main_controller_extract.mjs";
let source = await fs.readFile(injectorPath, "utf8");
const controllerFn = await fs.readFile(controllerPath, "utf8");

function mustReplace(label, from, to) {
  if (!source.includes(from)) {
    console.error("MISSING:", label);
    process.exit(1);
  }
  source = source.replace(from, to);
}

mustReplace("version", 'WINDOWS_SCOPE_A_VERSION = "1.7.5"', 'WINDOWS_SCOPE_A_VERSION = "1.7.6"');
mustReplace("script tag", "Scope A+ model picker - Windows", "Scope B1 pip - Windows");
mustReplace(
  "log line",
  "Windows Scope A+ — theme + wallpaper + accent + model picker (pet/pip permanently disabled)",
  "Windows Scope B1 — theme + model picker + PiP (pet permanently disabled)"
);

if (!source.includes("const mainPort =")) {
  mustReplace(
    "rendererPort",
    'const rendererPort = String(options.port ?? "9347");',
    `const rendererPort = String(options.port ?? "9347");
const mainPort = options["main-port"] ? String(options["main-port"]) : "";
const featureSettingsBinding = "__codexPlusProSettingsChanged";
const multiPipBinding = "__codexPlusProMultiPipRequest";
const mainControllerSource = buildMainControllerSource();
let hostFeatureSettings = {
  theme: true,
  pet: false,
  pip: true,
  modelPicker: true,
  accent: "pokedex",
  wallpaperStrength: 72,
  wallpaperMode: "default",
  logoMode: "default",
  petMotion: "full",
  pipAlwaysOnTop: true,
  modelDensity: "compact",
};`
  );
}

mustReplace(
  "check",
  `if (options.check === true) {
  new Function(buildInjectionSource("/* check */"));
  log("Windows theme injection syntax is valid");
  process.exit(0);
}`,
  `if (options.check === true) {
  new Function(buildInjectionSource("/* check */"));
  new Function(mainControllerSource);
  log("Windows theme injection + window controller syntax are valid");
  process.exit(0);
}`
);

mustReplace(
  "globals",
  `const attachedTargetIds = new Set();
const attachingTargetIds = new Set();
let browserConnection = null;
let shuttingDown = false;
let missingServerTicks = 0;
let injectedCount = 0;`,
  `const attachedTargetIds = new Set();
const attachingTargetIds = new Set();
const pageSessions = new Map();
let browserConnection = null;
let mainConnection = null;
let mainAttaching = false;
let shuttingDown = false;
let missingServerTicks = 0;
let injectedCount = 0;`
);

mustReplace(
  "start log",
  "log(`Codex Plus Pro Windows injector starting on 127.0.0.1:${rendererPort}`);",
  `log(\`Codex Plus Pro Windows injector starting on 127.0.0.1:\${rendererPort}\`);
if (mainPort) log(\`Codex Plus Pro window controller starting on 127.0.0.1:\${mainPort}\`);`
);

mustReplace(
  "loop",
  `while (!shuttingDown) {
  try {
    if (!browserConnection) {
      browserConnection = await connectToBrowser(rendererPort);
      missingServerTicks = 0;
    }
    const targetInfos = await browserConnection.send("Target.getTargets");
    const pageTargets = (targetInfos.targetInfos || []).filter(isInjectableTarget);
    for (const target of pageTargets) {
      if (attachedTargetIds.has(target.targetId) || attachingTargetIds.has(target.targetId)) continue;
      attachingTargetIds.add(target.targetId);
      attachToPageTarget(browserConnection, target)
        .then(() => { attachedTargetIds.add(target.targetId); injectedCount += 1; })
        .catch((error) => { log(\`Target \${String(target.targetId).slice(0, 8)} attach failed: \${error.message}\`); })
        .finally(() => { attachingTargetIds.delete(target.targetId); });
    }
    const liveIds = new Set(pageTargets.map((target) => target.targetId));
    for (const targetId of [...attachedTargetIds]) {
      if (!liveIds.has(targetId)) attachedTargetIds.delete(targetId);
    }
    if (oneShot && injectedCount > 0) {
      await delay(400);
      break;
    }
  } catch (error) {
    if (browserConnection) {
      try { browserConnection.close(); } catch {}
      browserConnection = null;
      attachedTargetIds.clear();
    }
    if (missingServerTicks === 0) log(\`Waiting for Codex DevTools: \${error.message}\`);
    missingServerTicks += 1;
    if (missingServerTicks >= 40) {
      log("Codex is no longer reachable; injector exiting.");
      break;
    }
  }
  await delay(900);
}
try { browserConnection?.close(); } catch {}
process.exit(0);`,
  `while (!shuttingDown) {
  try {
    if (!browserConnection) {
      browserConnection = await connectToBrowser(rendererPort);
      missingServerTicks = 0;
    }
    const targetInfos = await browserConnection.send("Target.getTargets");
    const pageTargets = (targetInfos.targetInfos || []).filter(isInjectableTarget);
    for (const target of pageTargets) {
      if (attachedTargetIds.has(target.targetId) || attachingTargetIds.has(target.targetId)) continue;
      attachingTargetIds.add(target.targetId);
      attachToPageTarget(browserConnection, target)
        .then(() => { attachedTargetIds.add(target.targetId); injectedCount += 1; })
        .catch((error) => { log(\`Target \${String(target.targetId).slice(0, 8)} attach failed: \${error.message}\`); })
        .finally(() => { attachingTargetIds.delete(target.targetId); });
    }
    const liveIds = new Set(pageTargets.map((target) => target.targetId));
    for (const targetId of [...attachedTargetIds]) {
      if (!liveIds.has(targetId)) {
        attachedTargetIds.delete(targetId);
        pageSessions.delete(targetId);
      }
    }

    if (mainPort && !mainConnection && !mainAttaching) {
      mainAttaching = true;
      try {
        await attachToMainTarget(mainPort);
      } catch (error) {
        if (missingServerTicks === 0) log(\`Waiting for Codex window controller: \${error.message}\`);
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
      attachedTargetIds.clear();
      pageSessions.clear();
    }
    if (missingServerTicks === 0) log(\`Waiting for Codex DevTools: \${error.message}\`);
    missingServerTicks += 1;
    if (missingServerTicks >= 40) {
      log("Codex is no longer reachable; injector exiting.");
      break;
    }
  }
  await delay(900);
}
try { browserConnection?.close(); } catch {}
try { mainConnection?.close(); } catch {}
process.exit(0);`
);

const attachFrom = `async function attachToPageTarget(browser, target) {
  const attached = await browser.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  if (!sessionId) throw new Error("Missing session id");
  const send = (method, params = {}) => browser.send(method, params, sessionId);

  await send("Runtime.enable");
  await send("Page.enable");

  // Wait briefly for the app shell to become responsive.
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

  // 1) Apply theme.css in chunks first.
  await applyCssInChunks(send, themeCss);

  // 2) Expose accent packs + defaults BEFORE page runtime so first applyFeatureSettings
  //    can resolve the correct wallpaper/logo from theme-packs (no need to re-toggle accent).
  await applyThemeAssets(send, artworkDataUri, logoDataUri, accentAssetPacks);

  // 3) Inject page runtime + settings UI (CSS already present as #codex-pokedex-theme-style).
  const pageSource = buildInjectionSource("/* css applied via host chunks */");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: pageSource });
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

  log(\`Theme active in \${target.title || "Codex"} (\${String(target.targetId).slice(0, 8)})\`);
}`;

const attachTo = `async function attachToPageTarget(browser, target) {
  const attached = await browser.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  if (!sessionId) throw new Error("Missing session id");
  const send = (method, params = {}) => browser.send(method, params, sessionId);
  pageSessions.set(target.targetId, { sessionId, send });

  await send("Runtime.enable");
  await send("Page.enable");

  browser.on("Runtime.bindingCalled", async (params, message) => {
    if (message?.sessionId && message.sessionId !== sessionId) return;
    if (params?.name === featureSettingsBinding) {
      try {
        hostFeatureSettings = normalizeHostFeatureSettings(JSON.parse(params.payload));
        await syncMainFeatureSettings();
      } catch (error) {
        log(\`Codex Plus Pro settings update failed: \${error.message}\`);
      }
      return;
    }
    if (params?.name !== multiPipBinding) return;
    void handleMultiPipRequest(send, params.payload);
  });
  await send("Runtime.addBinding", { name: featureSettingsBinding });
  await send("Runtime.addBinding", { name: multiPipBinding });

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

  await applyCssInChunks(send, themeCss);
  await applyThemeAssets(send, artworkDataUri, logoDataUri, accentAssetPacks);

  const pageSource = buildInjectionSource("/* css applied via host chunks */");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: pageSource });
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

  log(\`Theme active in \${target.title || "Codex"} (\${String(target.targetId).slice(0, 8)})\`);
}

async function attachToMainTarget(port) {
  const targets = await fetchJson(\`http://127.0.0.1:\${port}/json/list\`, 2500);
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
  const accent = ["pokedex", "lagoon", "forest", "graphite", "aria"].includes(value?.accent)
    ? value.accent
    : "pokedex";
  const wallpaperStrength = Number.isFinite(Number(value?.wallpaperStrength))
    ? Math.max(0, Math.min(100, Math.round(Number(value.wallpaperStrength))))
    : 72;
  return {
    theme: value?.theme !== false,
    pet: false,
    pip: value?.pip !== false,
    modelPicker: value?.modelPicker !== false,
    accent,
    wallpaperStrength,
    wallpaperMode: value?.wallpaperMode === "custom" ? "custom" : "default",
    logoMode: value?.logoMode === "custom" ? "custom" : "default",
    petMotion: value?.petMotion === "reduced" ? "reduced" : "full",
    pipAlwaysOnTop: value?.pipAlwaysOnTop !== false,
    modelDensity: value?.modelDensity === "comfortable" ? "comfortable" : "compact",
  };
}

async function syncMainFeatureSettings() {
  if (!mainConnection) return;
  const expression = \`globalThis.__codexPokedexPipWindowController?.setFeatures(\${JSON.stringify({
    pip: hostFeatureSettings.pip,
    pet: false,
    pipAlwaysOnTop: hostFeatureSettings.pipAlwaysOnTop,
  })})\`;
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
}

async function evaluateMainController(method, ...argumentsList) {
  if (!mainConnection) throw new Error("Codex Plus Pro window controller is not connected");
  const expression = \`globalThis.__codexPokedexPipWindowController?.[\${JSON.stringify(method)}](...\${JSON.stringify(argumentsList)})\`;
  const result = await mainConnection.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Window operation failed",
    );
  }
  return result.result?.value;
}

async function handleMultiPipRequest(pageSend, rawPayload) {
  let requestId = "";
  let response;
  try {
    const request = JSON.parse(rawPayload);
    requestId = String(request?.requestId || "");
    const action = String(request?.action || "");
    const threadId = String(request?.threadId || "");
    if (!requestId) throw new Error("Picture-in-picture request is missing an id");

    if (action === "open-thread") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) {
        throw new Error("Invalid task id");
      }
      if (!mainConnection) {
        const openResult = await pageSend("Runtime.evaluate", {
          expression: \`globalThis.__codexPlusProOpenOfficialPip?.(\${JSON.stringify(threadId)})\`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (openResult.exceptionDetails) {
          throw new Error(
            openResult.exceptionDetails.exception?.description ??
            openResult.exceptionDetails.text ??
            "Official Popout service failed",
          );
        }
        response = { ok: true, reused: false, threadId, fallback: "official-only" };
      } else {
        const preparation = await evaluateMainController("beginOpenThread", threadId);
        if (preparation?.reused) {
          response = { ok: true, ...preparation };
        } else {
          try {
            const openResult = await pageSend("Runtime.evaluate", {
              expression: \`globalThis.__codexPlusProOpenOfficialPip?.(\${JSON.stringify(threadId)})\`,
              awaitPromise: true,
              returnByValue: true,
            });
            if (openResult.exceptionDetails) {
              throw new Error(
                openResult.exceptionDetails.exception?.description ??
                openResult.exceptionDetails.text ??
                "Official Popout service failed",
              );
            }
            response = { ok: true, ...await evaluateMainController("finishOpenThread", threadId) };
          } catch (error) {
            await evaluateMainController("abortOpenThread").catch(() => {});
            throw error;
          }
        }
      }
    } else if (action === "close-current") {
      response = { ok: true, ...await evaluateMainController("closeThread", threadId) };
    } else if (action === "toggle-pin-current") {
      response = { ok: true, ...await evaluateMainController("toggleThreadPin", threadId) };
    } else if (action === "get-current-state") {
      response = { ok: true, ...await evaluateMainController("getThreadState", threadId) };
    } else {
      throw new Error(\`Unknown picture-in-picture action: \${action}\`);
    }
  } catch (error) {
    response = { ok: false, error: error?.message || String(error) };
    log(\`Codex Plus Pro multi-window operation failed: \${response.error}\`);
  }

  if (!requestId) return;
  const callback = \`globalThis.__codexPlusProResolveMultiPipRequest?.(\${JSON.stringify(requestId)}, \${JSON.stringify(response)})\`;
  await pageSend("Runtime.evaluate", {
    expression: callback,
    awaitPromise: true,
    returnByValue: true,
  }).catch((error) => log(\`Codex Plus Pro could not return a window result: \${error.message}\`));
}`;

mustReplace("attach", attachFrom, attachTo);

const cdpFrom = `function createCdpConnection(url, onClose) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
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
      if (!message.id) return;
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
}`;

const cdpTo = `function createCdpConnection(url, onClose) {
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
            log(\`DevTools event \${message.method} failed: \${error.message}\`);
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
}`;

mustReplace("cdp", cdpFrom, cdpTo);

// Page runtime clamps
mustReplace(
  "css pet/pip off",
  `document.documentElement.setAttribute("data-codex-plus-pet", "off");
      document.documentElement.setAttribute("data-codex-plus-pip", "off");`,
  `document.documentElement.setAttribute("data-codex-plus-pet", "off");`
);

mustReplace(
  "default settings",
  `const DEFAULT_FEATURE_SETTINGS = {
      theme: true,
      pet: false,
      pip: false,
      modelPicker: true,`,
  `const DEFAULT_FEATURE_SETTINGS = {
      theme: true,
      pet: false,
      pip: true,
      modelPicker: true,`
);

mustReplace(
  "pipAlwaysOnTop default",
  `petMotion: "full",
      pipAlwaysOnTop: false,
      modelDensity: "compact",
    };`,
  `petMotion: "full",
      pipAlwaysOnTop: true,
      modelDensity: "compact",
    };`
);

mustReplace(
  "normalize",
  `return {
        theme: value?.theme !== false,
        pet: false,
        pip: false,
        modelPicker: value?.modelPicker !== false,`,
  `return {
        theme: value?.theme !== false,
        pet: false,
        pip: value?.pip !== false,
        modelPicker: value?.modelPicker !== false,`
);

mustReplace(
  "early clamp",
  `// Keep pet/pip clamped even if older storage had them on; modelPicker is user-toggleable.
    featureSettings = {
      ...featureSettings,
      pet: false,
      pip: false,
    };`,
  `// Keep pet clamped; pip + modelPicker are user-toggleable (Scope B1).
    featureSettings = {
      ...featureSettings,
      pet: false,
    };`
);

mustReplace(
  "sections",
  `const SETTINGS_SECTIONS = [
      { key: "theme", label: "主题", feature: "theme" },
      { key: "modelPicker", label: "模型栏", feature: "modelPicker" },
    ];`,
  `const SETTINGS_SECTIONS = [
      { key: "theme", label: "主题", feature: "theme" },
      { key: "modelPicker", label: "模型栏", feature: "modelPicker" },
      { key: "pip", label: "画中画", feature: "pip" },
    ];`
);

mustReplace("subtitle", 'subtitle.textContent = "个性化 · Windows (Scope A+)";', 'subtitle.textContent = "个性化 · Windows (Scope B1)";');
mustReplace("scope note", 'scopeNote.textContent = "Scope A+ — 主题 + 模型栏（宠物/画中画仍禁用）";', 'scopeNote.textContent = "Scope B1 — 主题 + 模型栏 + 画中画（宠物仍禁用）";');

mustReplace(
  "model panel",
  `} else if (item.key === "modelPicker") {
          panel.append(
            createSettingsRow("状态", createChoiceControl("modelPicker", [
              { value: true, label: "显示" }, { value: false, label: "隐藏" },
            ])),
            createSettingsRow("控件密度", createChoiceControl("modelDensity", [
              { value: "compact", label: "紧凑" }, { value: "comfortable", label: "舒展" },
            ])),
          );
        }`,
  `} else if (item.key === "modelPicker") {
          panel.append(
            createSettingsRow("状态", createChoiceControl("modelPicker", [
              { value: true, label: "显示" }, { value: false, label: "隐藏" },
            ])),
            createSettingsRow("控件密度", createChoiceControl("modelDensity", [
              { value: "compact", label: "紧凑" }, { value: "comfortable", label: "舒展" },
            ])),
          );
        } else if (item.key === "pip") {
          panel.append(
            createSettingsRow("状态", createChoiceControl("pip", [
              { value: true, label: "启用" }, { value: false, label: "关闭" },
            ])),
            createSettingsRow("窗口层级", createChoiceControl("pipAlwaysOnTop", [
              { value: true, label: "始终置顶" }, { value: false, label: "普通窗口" },
            ])),
          );
        }`
);

mustReplace(
  "reset",
  `// Reset theme/model picker defaults; keep pet/pip forced off.
        applyFeatureSettings({
          ...DEFAULT_FEATURE_SETTINGS,
          pet: false,
          pip: false,
        });`,
  `// Reset defaults; keep pet forced off.
        applyFeatureSettings({
          ...DEFAULT_FEATURE_SETTINGS,
          pet: false,
        });`
);

mustReplace(
  "apply clamp",
  `// Always force pet/pip off; modelPicker is user-toggleable (Scope A+).
      const raw = normalizeFeatureSettings(nextSettings);
      featureSettings = {
        ...raw,
        pet: false,
        pip: false,
      };`,
  `// Always force pet off; pip + modelPicker are user-toggleable (Scope B1).
      const raw = normalizeFeatureSettings(nextSettings);
      featureSettings = {
        ...raw,
        pet: false,
      };`
);

mustReplace(
  "dump",
  `console.log("[Codex Plus Pro] Scope A+ state:", s);
        console.log("[Codex Plus Pro] Scope A+ contract OK (pet/pip off)?", ok);`,
  `console.log("[Codex Plus Pro] Scope B1 state:", s);
        console.log("[Codex Plus Pro] Scope B1 contract OK (pet off)?", ok);`
);

mustReplace("settings ui ver", "win-settings-scope-a-plus-1.7.5", "win-settings-scope-b1-1.7.6");
mustReplace("flat ver", 'const FLAT_PICKER_VERSION = "1.7.5";', 'const FLAT_PICKER_VERSION = "1.7.6";');

if (!source.includes("function buildMainControllerSource()")) {
  source = source.trimEnd() + "\n\n" + controllerFn.trim() + "\n";
}

await fs.writeFile(injectorPath, source, "utf8");
console.log("PATCH_OK", source.length);

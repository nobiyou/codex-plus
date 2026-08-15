function buildMainControllerSource() {
  return `(async () => {
    const CONTROLLER_KEY = "__codexPokedexPipWindowController";
    const previous = globalThis[CONTROLLER_KEY];
    if (previous?.timer) clearInterval(previous.timer);
    try { previous?.abortOpenThread?.(); } catch {}

    const electron = process.mainModule?.require?.("electron");
    if (!electron?.BrowserWindow) throw new Error("Electron BrowserWindow is unavailable");

    const controlledWindowIds = new Set(previous?.controlledWindowIds || []);
    const petWindowVisibility = previous?.petWindowVisibility instanceof Map
      ? previous.petWindowVisibility
      : new Map();
    const threadWindowIds = previous?.threadWindowIds instanceof Map
      ? previous.threadWindowIds
      : new Map();
    const windowThreadIds = previous?.windowThreadIds instanceof Map
      ? previous.windowThreadIds
      : new Map();
    const windowPinStates = previous?.windowPinStates instanceof Map
      ? previous.windowPinStates
      : new Map();
    const managedWindowIds = new Set(previous?.managedWindowIds || []);
    const orphanedWindowIds = new Set(previous?.orphanedWindowIds || []);
    const detachedLifecycleWindowIds = new Set(previous?.detachedLifecycleWindowIds || []);
    const windowOrder = Array.isArray(previous?.windowOrder) ? [...previous.windowOrder] : [];
    const controller = {
      active: true,
      version: "1.7.6",
      controlledWindowIds,
      petWindowVisibility,
      threadWindowIds,
      windowThreadIds,
      windowPinStates,
      managedWindowIds,
      orphanedWindowIds,
      detachedLifecycleWindowIds,
      windowOrder,
      officialThreadWindowId: Number(previous?.officialThreadWindowId) || null,
      pendingOpen: null,
      maxThreadWindows: 4,
      features: {
        pip: previous?.features?.pip !== false,
        pet: previous?.features?.pet !== false,
        pipAlwaysOnTop: previous?.features?.pipAlwaysOnTop !== false,
      },
      lastAppliedAt: null,
      timer: null,
    };

    const getInitialRoute = (window) => {
      try {
        const url = window.webContents?.getURL?.() || "";
        return new URL(url).searchParams.get("initialRoute") || "";
      } catch {
        return "";
      }
    };

    const getWindow = (id) => {
      const window = electron.BrowserWindow.fromId(Number(id));
      return window && !window.isDestroyed() ? window : null;
    };

    const extractThreadId = (value) => String(value || "")
      .match(new RegExp("/hotkey-window/thread/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", "i"))?.[1] || "";

    const getRendererState = async (window) => {
      try {
        return await window.webContents.executeJavaScript(
          "({kind:document.documentElement?.getAttribute('data-codex-pokedex-pip-window')||'',threadId:document.documentElement?.getAttribute('data-codex-plus-pip-thread-id')||sessionStorage.getItem('codex-plus-pro-pip-thread-id')||''})",
          true,
        );
      } catch {
        return { kind: "", threadId: "" };
      }
    };

    const removeWindowMapping = (windowId) => {
      const threadId = windowThreadIds.get(windowId);
      if (threadId && threadWindowIds.get(threadId) === windowId) threadWindowIds.delete(threadId);
      windowThreadIds.delete(windowId);
      windowPinStates.delete(windowId);
      managedWindowIds.delete(windowId);
      controlledWindowIds.delete(windowId);
      const orderIndex = windowOrder.indexOf(windowId);
      if (orderIndex >= 0) windowOrder.splice(orderIndex, 1);
    };

    const cleanDeadWindows = () => {
      const liveIds = new Set(electron.BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed()).map((window) => window.id));
      for (const windowId of [...windowThreadIds.keys()]) {
        if (!liveIds.has(windowId)) removeWindowMapping(windowId);
      }
      for (const [threadId, windowId] of [...threadWindowIds]) {
        if (!liveIds.has(windowId) || windowThreadIds.get(windowId) !== threadId) threadWindowIds.delete(threadId);
      }
      for (const windowId of [...orphanedWindowIds]) {
        if (!liveIds.has(windowId)) orphanedWindowIds.delete(windowId);
      }
      for (const windowId of [...detachedLifecycleWindowIds]) {
        if (!liveIds.has(windowId)) detachedLifecycleWindowIds.delete(windowId);
      }
      for (let index = windowOrder.length - 1; index >= 0; index -= 1) {
        if (!liveIds.has(windowOrder[index])) windowOrder.splice(index, 1);
      }
      if (controller.officialThreadWindowId && !liveIds.has(controller.officialThreadWindowId)) {
        controller.officialThreadWindowId = null;
      }
      return liveIds;
    };

    const collectThreadWindows = async () => {
      cleanDeadWindows();
      const entries = [];
      for (const window of electron.BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        const route = getInitialRoute(window);
        if (!route.startsWith("/hotkey-window")) continue;
        const rendererState = await getRendererState(window);
        const threadId = extractThreadId(route) || String(rendererState.threadId || "");
        const isThread = Boolean(threadId) || rendererState.kind === "thread";
        if (!isThread) continue;
        entries.push({ window, route, rendererState, threadId });
        if (threadId) {
          const previousWindowId = threadWindowIds.get(threadId);
          if (!previousWindowId || !getWindow(previousWindowId) || previousWindowId === window.id) {
            threadWindowIds.set(threadId, window.id);
            windowThreadIds.set(window.id, threadId);
            managedWindowIds.add(window.id);
            if (!windowOrder.includes(window.id)) windowOrder.push(window.id);
            detachOfficialSingletonLifecycle(window);
          }
        }
      }
      if (!getWindow(controller.officialThreadWindowId)) {
        const candidates = entries.filter((entry) => !orphanedWindowIds.has(entry.window.id));
        const current = (candidates.length ? candidates : entries).sort((left, right) => right.window.id - left.window.id)[0];
        controller.officialThreadWindowId = current?.window.id || null;
      }
      return entries;
    };

    const markThreadWindow = async (window, threadId, pinned) => {
      if (!window || window.isDestroyed()) return false;
      const state = { threadId, pinned: Boolean(pinned) };
      const source = "(() => { const state = " + JSON.stringify(state) + "; try { sessionStorage.setItem('codex-plus-pro-pip-thread-id', state.threadId); } catch {} document.documentElement?.setAttribute('data-codex-plus-pip-thread-id', state.threadId); document.documentElement?.setAttribute('data-codex-plus-pip-always-on-top', state.pinned ? 'on' : 'off'); return globalThis.__codexPlusProSetPipWindowState?.(state) || state; })()";
      try {
        await window.webContents.executeJavaScript(source, true);
        return true;
      } catch {
        return false;
      }
    };

    const restorePendingOverride = () => {
      const pending = controller.pendingOpen;
      const override = pending?.override;
      if (override?.window) {
        try {
          if (override.hadOwnProperty) Object.defineProperty(override.window, "isDestroyed", override.descriptor);
          else delete override.window.isDestroyed;
        } catch (error) {
          console.warn("Codex Plus Pro could not restore the official Popout window", error);
        }
      }
      if (pending) pending.override = null;
    };

    const detachOfficialSingletonLifecycle = (window) => {
      if (!window || window.isDestroyed() || detachedLifecycleWindowIds.has(window.id)) return;
      const listenerNeedles = [
        ["blur", "handleHotkeyWindowBlurred"],
        ["resize", "this.threadSize="],
        ["closed", "configuredWindowIds.delete"],
      ];
      for (const [eventName, needle] of listenerNeedles) {
        for (const listener of window.listeners(eventName)) {
          if (String(listener).includes(needle)) window.removeListener(eventName, listener);
        }
      }
      detachedLifecycleWindowIds.add(window.id);
    };

    const positionNewThreadWindow = (window) => {
      if (!electron.screen || !window || window.isDestroyed()) return;
      const anchorId = [...windowOrder].reverse().find((windowId) => windowId !== window.id && getWindow(windowId));
      const anchor = getWindow(anchorId);
      if (!anchor) return;
      try {
        const anchorBounds = anchor.getBounds();
        const bounds = window.getBounds();
        const workArea = electron.screen.getDisplayMatching(anchorBounds).workArea;
        let x = anchorBounds.x + 28;
        let y = anchorBounds.y + 28;
        if (x + bounds.width > workArea.x + workArea.width - 12 || y + bounds.height > workArea.y + workArea.height - 12) {
          x = workArea.x + 24;
          y = workArea.y + 52;
        }
        x = Math.max(workArea.x + 12, Math.min(x, workArea.x + workArea.width - bounds.width - 12));
        y = Math.max(workArea.y + 12, Math.min(y, workArea.y + workArea.height - bounds.height - 12));
        window.setPosition(Math.round(x), Math.round(y), false);
      } catch (error) {
        console.warn("Codex Plus Pro could not position the new Popout window", error);
      }
    };

    controller.beginOpenThread = async (threadId) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(threadId || ""))) {
        throw new Error("Invalid task id");
      }
      if (controller.pendingOpen) throw new Error("Another Popout window is still opening");
      const entries = await collectThreadWindows();
      const existingWindow = getWindow(threadWindowIds.get(threadId));
      if (existingWindow) {
        if (!existingWindow.isVisible()) existingWindow.show();
        existingWindow.focus();
        existingWindow.moveTop();
        return { reused: true, threadId, windowId: existingWindow.id, pinned: windowPinStates.get(existingWindow.id) ?? controller.features.pipAlwaysOnTop };
      }
      if (threadWindowIds.size >= controller.maxThreadWindows) {
        throw new Error("最多同时打开 4 个画中画窗口");
      }

      const currentWindow = getWindow(controller.officialThreadWindowId);
      const shouldForceNewWindow = Boolean(currentWindow && managedWindowIds.has(currentWindow.id));
      const pending = {
        threadId,
        beforeWindowIds: entries.map((entry) => entry.window.id),
        previousOfficialWindowId: currentWindow?.id || null,
        forceNewWindow: shouldForceNewWindow,
        override: null,
      };
      if (shouldForceNewWindow) {
        const descriptor = Object.getOwnPropertyDescriptor(currentWindow, "isDestroyed");
        pending.override = {
          window: currentWindow,
          descriptor,
          hadOwnProperty: Object.prototype.hasOwnProperty.call(currentWindow, "isDestroyed"),
        };
        Object.defineProperty(currentWindow, "isDestroyed", {
          configurable: true,
          writable: true,
          value: () => true,
        });
      }
      controller.pendingOpen = pending;
      return { reused: false, forceNewWindow: shouldForceNewWindow };
    };

    controller.finishOpenThread = async (threadId) => {
      const pending = controller.pendingOpen;
      if (!pending || pending.threadId !== threadId) throw new Error("Popout window preparation was lost");
      restorePendingOverride();
      const beforeIds = new Set(pending.beforeWindowIds);
      const readyDeadline = Date.now() + 6000;
      let entries = [];
      let newEntries = [];
      let selected = null;
      while (!selected && Date.now() < readyDeadline) {
        entries = await collectThreadWindows();
        newEntries = entries.filter((entry) => !beforeIds.has(entry.window.id));
        selected = newEntries.find((entry) => entry.threadId === threadId) || newEntries[0];
        if (!selected) selected = entries.find((entry) => entry.threadId === threadId);
        if (!selected && !pending.forceNewWindow) {
          selected = entries.find((entry) => entry.window.id === controller.officialThreadWindowId)
            || entries.toSorted((left, right) => right.window.id - left.window.id)[0];
        }
        if (!selected) await new Promise((resolve) => setTimeout(resolve, 80));
      }
      if (!selected) {
        controller.pendingOpen = null;
        throw new Error("The official Popout window did not finish opening");
      }

      const window = selected.window;
      if (pending.forceNewWindow) {
        const previousOfficialWindow = getWindow(pending.previousOfficialWindowId);
        if (previousOfficialWindow && previousOfficialWindow.id !== window.id) {
          detachOfficialSingletonLifecycle(previousOfficialWindow);
          orphanedWindowIds.add(previousOfficialWindow.id);
        }
      }
      controller.officialThreadWindowId = window.id;
      orphanedWindowIds.delete(window.id);
      removeWindowMapping(window.id);
      threadWindowIds.set(threadId, window.id);
      windowThreadIds.set(window.id, threadId);
      managedWindowIds.add(window.id);
      detachOfficialSingletonLifecycle(window);
      if (!windowOrder.includes(window.id)) windowOrder.push(window.id);
      const pinned = windowPinStates.has(window.id)
        ? windowPinStates.get(window.id)
        : controller.features.pipAlwaysOnTop;
      windowPinStates.set(window.id, pinned);
      await markThreadWindow(window, threadId, pinned);
      if (pending.forceNewWindow && newEntries.some((entry) => entry.window.id === window.id)) positionNewThreadWindow(window);
      controller.pendingOpen = null;
      await controller.apply();
      if (!window.isVisible()) window.show();
      window.focus();
      window.moveTop();
      return { reused: false, threadId, windowId: window.id, pinned, count: threadWindowIds.size };
    };

    controller.abortOpenThread = () => {
      restorePendingOverride();
      controller.pendingOpen = null;
      return { aborted: true };
    };

    controller.closeThread = async (threadId) => {
      await collectThreadWindows();
      const window = getWindow(threadWindowIds.get(threadId));
      if (!window) throw new Error("This Popout window is no longer available");
      const windowId = window.id;
      removeWindowMapping(windowId);
      orphanedWindowIds.delete(windowId);
      if (controller.officialThreadWindowId === windowId) controller.officialThreadWindowId = null;
      window.close();
      return { closed: true, threadId, windowId };
    };

    controller.toggleThreadPin = async (threadId) => {
      await collectThreadWindows();
      const window = getWindow(threadWindowIds.get(threadId));
      if (!window) throw new Error("This Popout window is no longer available");
      const pinned = !(windowPinStates.get(window.id) ?? controller.features.pipAlwaysOnTop);
      windowPinStates.set(window.id, pinned);
      await markThreadWindow(window, threadId, pinned);
      await controller.apply();
      if (pinned && window.isVisible()) window.moveTop();
      return { threadId, windowId: window.id, pinned };
    };

    controller.getThreadState = async (threadId) => {
      await collectThreadWindows();
      const window = getWindow(threadWindowIds.get(threadId));
      if (!window) return { threadId, available: false };
      return {
        threadId,
        windowId: window.id,
        available: true,
        pinned: windowPinStates.get(window.id) ?? controller.features.pipAlwaysOnTop,
      };
    };

    const releasePopoutWindow = (window) => {
      try {
        if (window.isAlwaysOnTop()) window.setAlwaysOnTop(false);
        window.setVisibleOnAllWorkspaces(false, {
          visibleOnFullScreen: false,
          skipTransformProcessType: true,
        });
      } catch (error) {
        console.warn("Codex Plus Pro could not release Popout window policy", error);
      }
      controlledWindowIds.delete(window.id);
    };

    let applyInFlight = null;

    const applyWindowPolicy = async () => {
      if (applyInFlight) return applyInFlight;
      applyInFlight = (async () => {
      await collectThreadWindows();
      const livePopoutIds = new Set();
      const livePetIds = new Set();
      for (const window of electron.BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        const initialRoute = getInitialRoute(window);
        const id = window.id;

        if (initialRoute === "/avatar-overlay") {
          livePetIds.add(id);
          if (!controller.features.pet) {
            if (!petWindowVisibility.has(id)) petWindowVisibility.set(id, window.isVisible());
            if (window.isVisible()) window.hide();
          } else if (petWindowVisibility.has(id)) {
            const shouldRestore = petWindowVisibility.get(id);
            petWindowVisibility.delete(id);
            if (shouldRestore && !window.isVisible()) window.showInactive();
          }
          continue;
        }

        if (!initialRoute.startsWith("/hotkey-window")) continue;
        const rendererState = await getRendererState(window);
        const mappedThreadId = windowThreadIds.get(id);
        if (!mappedThreadId && rendererState.kind !== "thread" && !extractThreadId(initialRoute)) {
          releasePopoutWindow(window);
          continue;
        }
        if (!controller.features.pip) {
          releasePopoutWindow(window);
          continue;
        }
        const pinned = windowPinStates.has(id)
          ? windowPinStates.get(id)
          : controller.features.pipAlwaysOnTop;
        if (!pinned) {
          releasePopoutWindow(window);
          continue;
        }

        const isNewWindow = !controlledWindowIds.has(id);
        livePopoutIds.add(id);
        try {
          if (!window.isAlwaysOnTop()) window.setAlwaysOnTop(true, "floating");
          if (isNewWindow) {
            window.setVisibleOnAllWorkspaces(true, {
              visibleOnFullScreen: true,
              skipTransformProcessType: true,
            });
            if (window.isVisible()) window.moveTop();
          }
        } catch (error) {
          console.warn("Codex Plus Pro could not apply Popout window policy", error);
        }
      }
      for (const id of controlledWindowIds) {
        if (!livePopoutIds.has(id)) controlledWindowIds.delete(id);
      }
      for (const id of petWindowVisibility.keys()) {
        if (!livePetIds.has(id)) petWindowVisibility.delete(id);
      }
      for (const id of livePopoutIds) controlledWindowIds.add(id);
      controller.lastAppliedAt = Date.now();
      return controlledWindowIds.size;
      })();
      try {
        return await applyInFlight;
      } finally {
        applyInFlight = null;
      }
    };

    controller.apply = applyWindowPolicy;
    controller.setFeatures = async (next) => {
      const nextAlwaysOnTop = next?.pipAlwaysOnTop !== false;
      const globalPinChanged = nextAlwaysOnTop !== controller.features.pipAlwaysOnTop;
      controller.features = {
        pip: next?.pip !== false,
        pet: next?.pet !== false,
        pipAlwaysOnTop: nextAlwaysOnTop,
      };
      if (globalPinChanged) {
        for (const [windowId, threadId] of windowThreadIds) {
          windowPinStates.set(windowId, nextAlwaysOnTop);
          const window = getWindow(windowId);
          if (window) await markThreadWindow(window, threadId, nextAlwaysOnTop);
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


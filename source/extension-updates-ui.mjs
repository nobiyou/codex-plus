// Serialized into the renderer by injector.mjs. Keep this function self-contained.
export function createExtensionUpdatesUI(window, document) {
  if (window.__codexPlusProExtensionsUI?.version === 2) return window.__codexPlusProExtensionsUI;
  const binding = "__codexPlusProExtensionUpdates";
  const labels = { available: "有更新", current: "已是最新", ahead: "本地版本较新", "unknown-version": "本地版本未知", different: "内容不同", managed: "远程服务", "no-source": "未配置来源", unchecked: "未检查", checking: "检查中", failed: "检查失败" };
  let state = { items: [], warnings: [], autoCheck: false, state: "idle", updateCount: 0 };
  let panel = null, category = "mcp", pending = false, watchdog = null;
  const drafts = new Map();
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action) => {
    const node = element("button", text, "codex-plus-pro-settings-upgrade");
    node.type = "button"; node.addEventListener("click", action); return node;
  };
  const time = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "尚未检查" : parsed.toLocaleString("zh-CN");
  };
  const safeLink = (url, text) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password || parsed.search || !["github.com", "www.npmjs.com", "pypi.org"].includes(parsed.hostname)) return null;
      const link = element("a", text, "codex-plus-extension-link");
      link.href = parsed.href; link.target = "_blank"; link.rel = "noopener noreferrer"; return link;
    } catch { return null; }
  };
  const sourceLabel = source => !source ? "尚未关联可检查的来源" : source.type === "github" ? "GitHub · " + source.repository + (source.path ? "/" + source.path : "") + " · " + source.ref : source.type + " · " + source.package;
  const busy = () => pending || state.state === "checking";
  const armWatchdog = () => {
    window.clearTimeout(watchdog);
    watchdog = window.setTimeout(() => {
      pending = false; state.state = "failed"; state.error = "扩展检查暂未返回结果，可重新扫描或稍后重试。"; render();
    }, 60000);
  };
  function request(payload) {
    if (pending && payload.action !== "list") return;
    if (typeof window[binding] !== "function") {
      state.error = "扩展检查入口未连接，请从 Plus 启动器重新启动后重试。"; pending = false; render(); return;
    }
    const previousAutoCheck = state.autoCheck;
    if (payload.action === "preferences") state.autoCheck = payload.autoCheck;
    pending = true; state.error = ""; render(); armWatchdog();
    try { window[binding](JSON.stringify(payload)); }
    catch { window.clearTimeout(watchdog); pending = false; state.autoCheck = previousAutoCheck; state.error = "无法连接扩展检查入口，请重试。"; render(); }
  }
  function indicators() {
    const count = state.updateCount || 0;
    const settings = document.querySelector(".codex-plus-pro-settings-button");
    if (settings) {
      let badge = settings.querySelector("[data-extension-update-indicator]");
      if (!badge) {
        badge = element("span", "", "codex-plus-extension-indicator");
        badge.setAttribute("data-extension-update-indicator", "true"); badge.setAttribute("aria-hidden", "true"); settings.appendChild(badge);
      }
      badge.hidden = count === 0; badge.textContent = String(count);
      settings.setAttribute("data-extension-update-count", String(count));
    }
    const tab = document.querySelector('[data-settings-section-target="extensions"]');
    if (tab) {
      let badge = tab.querySelector("[data-extension-update-badge]");
      if (!badge) { badge = element("span", "", "codex-plus-extension-badge"); badge.setAttribute("data-extension-update-badge", "true"); tab.appendChild(badge); }
      badge.hidden = count === 0; badge.textContent = String(count);
    }
  }
  function sourceEditor(item) {
    const details = element("details", undefined, "codex-plus-extension-source-editor");
    details.appendChild(element("summary", "设置更新来源"));
    const savedDraft = drafts.get(item.id);
    details.open = savedDraft?.open === true;
    const form = element("form");
    const fields = {};
    const defaults = savedDraft || { type: item.source?.type || "github", repository: item.source?.repository || "", path: item.source?.path || "", ref: item.source?.ref || "HEAD", package: item.source?.package || "", currentVersion: item.currentKind === "provided" ? item.currentVersion : "" };
    const addField = (name, label, placeholder = "", select = false) => {
      const wrapper = element("label", label);
      const input = element(select ? "select" : "input");
      input.name = name; input.setAttribute("data-extension-field", item.id + ":" + name);
      if (select) for (const [value, title] of [["github", "GitHub 仓库"], ["npm", "npm 包"], ["pypi", "PyPI 包"]]) { const option = element("option", title); option.value = value; input.appendChild(option); }
      else { input.type = "text"; input.placeholder = placeholder; input.autocomplete = "off"; input.spellcheck = false; input.maxLength = 500; }
      input.value = defaults[name] || ""; input.disabled = busy(); fields[name] = input; wrapper.appendChild(input); form.appendChild(wrapper); return wrapper;
    };
    addField("type", "来源类型", "", true);
    const repository = addField("repository", "公开 GitHub 仓库", "owner/repo 或 GitHub 地址");
    const directory = addField("path", "仓库中的目录", "skills/example；仓库根目录留空");
    const ref = addField("ref", "分支或标签", "HEAD（默认分支）");
    const pkg = addField("package", "包名", "例如 example-mcp 或 @scope/package");
    addField("currentVersion", "当前版本（可选）", "仅填写你已确认安装的包版本");
    const updateFields = () => { const git = fields.type.value === "github"; repository.hidden = directory.hidden = ref.hidden = !git; pkg.hidden = git; };
    const remember = () => { drafts.set(item.id, { ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])), open: details.open }); updateFields(); };
    form.addEventListener("input", remember); details.addEventListener("toggle", remember); updateFields();
    const actions = element("div", undefined, "codex-plus-extension-actions");
    const save = button("保存来源", () => {}); save.type = "submit"; save.disabled = busy();
    const reset = button("恢复自动识别", () => { drafts.delete(item.id); request({ action: "source", itemId: item.id, source: null }); }); reset.disabled = busy();
    actions.append(save, reset); form.appendChild(actions);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (busy()) return;
      remember();
      const type = fields.type.value;
      const source = type === "github" ? { type, repository: fields.repository.value, path: fields.path.value, ref: fields.ref.value } : { type, package: fields.package.value };
      request({ action: "source", itemId: item.id, source, currentVersion: fields.currentVersion.value });
    });
    form.appendChild(element("p", "来源仅用于检查，保存后可点击“检查”获取最新内容。", "codex-plus-extension-muted"));
    details.appendChild(form); return details;
  }
  function row(item) {
    const card = element("article", undefined, "codex-plus-extension-item");
    card.setAttribute("data-extension-item", item.id); card.setAttribute("data-extension-status", item.status);
    const heading = element("div", undefined, "codex-plus-extension-item-heading");
    heading.append(element("strong", item.name), element("span", labels[item.status] || "状态未知", "codex-plus-extension-state"));
    card.appendChild(heading);
    const currentLabel = { configured: "固定配置", "install-record": "安装记录", commit: "本地提交", content: "本地目录", provided: "已填写版本" }[item.currentKind] || "当前版本";
    card.appendChild(element("p", currentLabel + "：" + (item.currentVersion || "未知") + (item.latestVersion ? "  →  最新：" + item.latestVersion : ""), "codex-plus-extension-version"));
    if (item.managed) {
      card.appendChild(element("p", "远程服务由提供方维护，本机没有可比较的安装版本。", "codex-plus-extension-muted"));
    } else {
      card.appendChild(element("p", sourceLabel(item.source), "codex-plus-extension-muted"));
      if (item.status === "unknown-version") card.appendChild(element("p", "已查到上游版本；本地版本无法确认，暂不判断是否需要更新。", "codex-plus-extension-muted"));
      if (item.status === "different") card.appendChild(element("p", "本地与上游内容不同，可能包含你的修改，请查看更新内容后判断。", "codex-plus-extension-muted"));
    }
    if (item.enabled === false) card.appendChild(element("p", "此 MCP 当前已禁用。", "codex-plus-extension-muted"));
    if (item.detail) card.appendChild(element("p", item.detail, "codex-plus-extension-muted"));
    if (item.error) { const error = element("p", item.error, "codex-plus-extension-error"); error.setAttribute("role", "alert"); card.appendChild(error); }
    if (item.checkedAt) card.appendChild(element("p", (item.status === "failed" ? "上次成功检查：" : "检查时间：") + time(item.checkedAt), "codex-plus-extension-muted"));
    const actions = element("div", undefined, "codex-plus-extension-actions");
    if (!item.managed) { const check = button("检查", () => request({ action: "check", itemId: item.id })); check.disabled = busy() || !item.source; actions.appendChild(check); }
    const repository = item.source?.type === "github" ? item.source.repository : item.upstreamRepository;
    if (repository) {
      if (item.source?.type !== "github") card.appendChild(element("p", "GitHub · " + repository, "codex-plus-extension-muted"));
      const upstream = safeLink("https://github.com/" + repository, "GitHub 仓库 ↗"); if (upstream) actions.appendChild(upstream);
    }
    const link = safeLink(item.updateUrl, "更新入口 ↗"); if (link) actions.appendChild(link);
    if (item.notes) {
      const details = element("details", undefined, "codex-plus-extension-notes");
      details.appendChild(element("summary", item.notesLabel || "更新内容"));
      details.appendChild(element("pre", item.notes)); card.appendChild(details);
    }
    const location = element("details", undefined, "codex-plus-extension-location");
    location.append(element("summary", "安装位置"), element("p", item.location, "codex-plus-extension-muted")); card.appendChild(location);
    card.appendChild(actions);
    if (!item.managed) card.appendChild(sourceEditor(item));
    return card;
  }
  function render() {
    indicators(); if (!panel) return;
    const active = document.activeElement;
    const focusedField = active?.getAttribute?.("data-extension-field"), selection = active?.selectionStart;
    panel.setAttribute("aria-busy", busy() ? "true" : "false");
    const summary = panel.querySelector("[data-extension-summary]");
    const missing = state.items.filter(item => item.status === "no-source").length;
    const failed = state.items.filter(item => item.status === "failed").length;
    summary.textContent = busy() ? "正在检查扩展，请稍候…" : state.items.length + " 项扩展 · " + state.updateCount + " 项有更新" + (missing ? " · " + missing + " 项需补充来源" : "") + (failed ? " · " + failed + " 项检查失败" : "");
    panel.querySelector("[data-extension-time]").textContent = "最近检查：" + time(state.lastCheckedAt);
    const message = panel.querySelector("[data-extension-message]");
    message.textContent = [state.error, ...(state.warnings || [])].filter(Boolean).join("\n"); message.hidden = !message.textContent;
    for (const control of panel.querySelectorAll("[data-extension-operation]")) control.disabled = busy();
    panel.querySelector("[data-extension-auto]").checked = state.autoCheck === true;
    const list = panel.querySelector("[data-extension-list]"); list.replaceChildren();
    const items = state.items.filter(item => item.kind === category);
    for (const item of items) list.appendChild(row(item));
    if (!items.length) list.appendChild(element("p", pending ? "正在扫描已安装扩展…" : "未发现这类扩展。可点击“重新扫描”刷新安装列表。", "codex-plus-extension-empty"));
    for (const tab of panel.querySelectorAll("[data-extension-category]")) {
      const kind = tab.getAttribute("data-extension-category");
      tab.setAttribute("aria-pressed", kind === category ? "true" : "false"); tab.textContent = (kind === "mcp" ? "MCP" : "Skills") + " · " + state.items.filter(item => item.kind === kind).length;
    }
    if (focusedField) {
      const input = [...panel.querySelectorAll("[data-extension-field]")].find(node => node.getAttribute("data-extension-field") === focusedField);
      input?.focus({ preventScroll: true });
      if (typeof selection === "number" && input?.type === "text") input.setSelectionRange(selection, selection);
    }
  }
  window.__codexPlusProExtensionUpdateResult = payload => {
    state = { ...state, ...payload, error: payload.error || "" };
    pending = payload.state === "checking";
    if (pending) armWatchdog(); else window.clearTimeout(watchdog);
    render();
  };
  window.addEventListener("pagehide", () => window.clearTimeout(watchdog), { once: true });
  const api = {
    version: 2,
    refresh: () => request({ action: "list" }),
    indicators,
    createPanel() {
      panel = element("div", undefined, "codex-plus-extension-panel");
      panel.setAttribute("data-codex-plus-extension-updates", "true");
      const summary = element("p", "尚未扫描扩展", "codex-plus-extension-summary"); summary.setAttribute("data-extension-summary", "true"); summary.setAttribute("role", "status"); summary.setAttribute("aria-live", "polite");
      const timestamp = element("p", "最近检查：尚未检查", "codex-plus-extension-muted"); timestamp.setAttribute("data-extension-time", "true");
      const actions = element("div", undefined, "codex-plus-extension-actions");
      const check = button("检查全部", () => request({ action: "check" })); check.setAttribute("data-extension-operation", "check");
      const scan = button("重新扫描", () => request({ action: "list" })); scan.setAttribute("data-extension-operation", "list"); actions.append(check, scan);
      const auto = element("label", undefined, "codex-plus-extension-auto");
      const input = element("input"); input.type = "checkbox"; input.setAttribute("data-extension-auto", "true"); input.setAttribute("data-extension-operation", "preferences");
      input.addEventListener("change", () => request({ action: "preferences", autoCheck: input.checked })); auto.append(input, element("span", "每日后台检查并提醒（Plus 运行期间）"));
      const categories = element("div", undefined, "codex-plus-extension-categories"); categories.setAttribute("role", "group"); categories.setAttribute("aria-label", "扩展类型");
      for (const kind of ["mcp", "skill"]) { const tab = button(kind === "mcp" ? "MCP" : "Skills", () => { category = kind; render(); }); tab.setAttribute("data-extension-category", kind); categories.appendChild(tab); }
      const message = element("p", "", "codex-plus-extension-error"); message.setAttribute("data-extension-message", "true"); message.setAttribute("role", "alert"); message.hidden = true;
      const list = element("div", undefined, "codex-plus-extension-list"); list.setAttribute("data-extension-list", "true");
      const scope = element("p", "查看第三方 MCP 与 Skills 的上游版本和更新内容，优先关联 GitHub 项目。", "codex-plus-extension-muted");
      panel.append(scope, summary, timestamp, actions, auto, categories, message, list); render(); return panel;
    },
  };
  window.__codexPlusProExtensionsUI = api;
  return api;
}

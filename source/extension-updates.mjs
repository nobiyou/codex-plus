import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ExtensionUpdater, UpdateSkipped, folderBlobs, updateSupport } from "./extension-update-install.mjs";

const execFileAsync = promisify(execFile);
const DAY = 86400000;
const CHECK_RESULT_VERSION = 3;
const hash = value => createHash("sha256").update(value).digest("hex");
const isSha = value => /^[a-f0-9]{40}$/i.test(value || "");
const short = value => String(value || "").slice(0, 10);

async function readSmall(file, limit = 2 * 1024 * 1024) {
  const stat = await fs.stat(file);
  if (stat.size > limit) throw new Error("文件过大，无法检查");
  return fs.readFile(file, "utf8");
}
async function optionalJson(file) {
  try { return JSON.parse(await readSmall(file)); }
  catch (error) { if (error.code === "ENOENT") return null; throw new Error("扩展元数据无法读取或格式错误"); }
}

// Only the public launcher fields are retained; env, headers and remote URLs
// never leave this reader. No MCP command or extension code is executed.
function tomlStatements(text, positions = false) {
  const statements = [];
  let current = "", quote = "", depth = 0, escape = false, comment = false, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (comment && c !== "\n") continue;
    if (c === "\n") comment = false;
    if (quote) {
      current += c;
      if (escape) { escape = false; continue; }
      if (quote === '"' && c === "\\") { escape = true; continue; }
      if (quote.length === 3 && text.slice(i, i + 3) === quote) { current += quote.slice(1); i += 2; quote = ""; }
      else if (quote.length === 1 && c === quote) quote = "";
      continue;
    }
    if (c === "#") { comment = true; continue; }
    if (c === '"' || c === "'") {
      quote = text.slice(i, i + 3) === c.repeat(3) ? c.repeat(3) : c;
      current += quote; i += quote.length - 1; continue;
    }
    if (c === "[") depth++;
    if (c === "]") depth--;
    if (depth < 0) throw new Error("MCP TOML 配置的括号不匹配");
    if (c === "\n" && depth === 0) { if (current.trim()) statements.push(positions ? { text: current.trim(), start, end: i } : current.trim()); current = ""; start = i + 1; }
    else current += c;
  }
  if (quote || depth) throw new Error("MCP TOML 配置存在未结束的字符串或数组");
  if (current.trim()) statements.push(positions ? { text: current.trim(), start, end: text.length } : current.trim());
  return statements;
}
function tomlValue(raw) {
  raw = raw.trim();
  if (raw === "true" || raw === "false") return raw === "true";
  if (/^'(?:[^']*)'$/.test(raw)) return raw.slice(1, -1);
  if (/^"(?:\\.|[^"\\])*"$/s.test(raw)) {
    return JSON.parse(raw.replace(/\\U([a-fA-F0-9]{8})/g, (_, n) => JSON.stringify(String.fromCodePoint(parseInt(n, 16))).slice(1, -1)));
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const parts = [], inner = raw.slice(1, -1);
    let value = "", quote = "", escaped = false;
    for (const c of inner) {
      if (quote) {
        value += c;
        if (escaped) escaped = false;
        else if (quote === '"' && c === "\\") escaped = true;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") { quote = c; value += c; }
      else if (c === ",") { if (value.trim()) parts.push(tomlValue(value)); value = ""; }
      else value += c;
    }
    if (value.trim()) parts.push(tomlValue(value));
    if (parts.some(value => typeof value !== "string")) throw new Error("MCP 参数数组必须由字符串组成");
    return parts;
  }
  throw new Error("MCP 配置字段使用了暂不支持的 TOML 写法");
}
function tableKeys(raw) {
  const matches = [...raw.matchAll(/(?:^|\.)\s*([A-Za-z0-9_-]+|"(?:\\.|[^"\\])*"|'[^']*')\s*/g)];
  if (matches.map(match => match[0]).join("") !== raw) throw new Error("MCP 配置表名无法解析");
  return matches.map(match => /^["']/.test(match[1]) ? tomlValue(match[1]) : match[1]);
}
function packageSpec(raw, type) {
  if (typeof raw !== "string") return null;
  const match = type === "npm"
    ? raw.match(/^((?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*)(?:@([^\s]+))?$/i)
    : raw.match(/^([a-z0-9][a-z0-9._-]*)(?:==([^\s]+))?$/i);
  if (!match) return null;
  return { source: normalizeSource({ type, package: match[1] }), currentVersion: /^\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/.test(match[2] || "") ? match[2] : "", currentKind: "configured" };
}
function launcherPackage(command, args) {
  if (args.some(arg => /^--(?:registry|index-url|extra-index-url)(?:=|$)/.test(arg))) return null;
  const launcher = path.win32.basename(command).replace(/\.(?:cmd|exe)$/i, "").toLowerCase();
  if (["npx", "npm"].includes(launcher)) {
    if (launcher === "npm" && !["exec", "x"].includes(args[0])) return null;
    for (let i = launcher === "npm" ? 1 : 0; i < args.length; i++) {
      const a = args[i];
      if (["-p", "--package"].includes(a)) return packageSpec(args[i + 1], "npm");
      if (a.startsWith("--package=")) return packageSpec(a.slice(10), "npm");
      if (["-y", "--yes", "--no", "--", "--quiet", "-q", "--prefer-online", "--offline"].includes(a)) continue;
      if (a.startsWith("-")) return null;
      return packageSpec(a, "npm");
    }
  }
  if (launcher === "uvx" || (launcher === "uv" && args[0] === "tool" && args[1] === "run")) {
    for (let i = launcher === "uv" ? 2 : 0; i < args.length; i++) {
      if (args[i] === "--from") return packageSpec(args[i + 1], "pypi");
      if (args[i].startsWith("--from=")) return packageSpec(args[i].slice(7), "pypi");
      if (["--python", "--with", "--index-url"].includes(args[i])) { i++; continue; }
      if (["--", "--no-cache", "--isolated"].includes(args[i])) continue;
      if (args[i].startsWith("-")) return null;
      return packageSpec(args[i], "pypi");
    }
  }
  return null;
}
export function readMcpConfig(text) {
  const entries = new Map();
  let active = null, mcpRoot = false;
  for (const line of tomlStatements(String(text).replace(/^\uFEFF/, ""))) {
    if (line.startsWith("[")) {
      active = null;
      mcpRoot = false;
      if (line.startsWith("[[")) continue;
      const keys = tableKeys(line.slice(1, -1));
      mcpRoot = keys[0] === "mcp_servers" && keys.length === 1;
      if (keys[0] === "mcp_servers" && keys.length === 2) {
        if (!entries.has(keys[1])) entries.set(keys[1], {});
        active = entries.get(keys[1]);
      }
      continue;
    }
    if (!active) {
      if (mcpRoot || /^mcp_servers\./.test(line)) throw new Error("MCP 配置使用了内联或点号赋值，请使用每个服务器独立的配置表");
      continue;
    }
    const match = line.match(/^(command|args|url|enabled)\s*=\s*([\s\S]*)$/);
    if (match) active[match[1]] = tomlValue(match[2]);
  }
  const servers = [];
  for (const [name, raw] of entries) {
    if (raw.command !== undefined && typeof raw.command !== "string") throw new Error("MCP command 必须是字符串");
    const args = raw.args || [];
    if (!Array.isArray(args)) throw new Error("MCP args 必须是数组");
    const entry = { name, enabled: raw.enabled !== false, currentVersion: "", source: null };
    if (raw.url) entry.managed = "remote";
    else Object.assign(entry, launcherPackage(raw.command || "", args));
    const files = [raw.command, ...args].filter(value => typeof value === "string" && (path.isAbsolute(value) || path.win32.isAbsolute(value)) && /\.(mjs|cjs|js|exe)$/i.test(value));
    Object.defineProperty(entry, "localFiles", { value: files });
    Object.defineProperty(entry, "launch", { value: { command: raw.command || "", args } });
    servers.push(entry);
  }
  return { servers };
}

function rewriteMcpArgs(text, name, expected, args) {
  const server = readMcpConfig(text).servers.find(entry => entry.name === name);
  if (!server || JSON.stringify(server.launch) !== JSON.stringify(expected)) throw new UpdateSkipped("MCP 启动配置已变化");
  let selected = false;
  for (const statement of tomlStatements(text, true)) {
    if (statement.text.startsWith("[")) {
      const keys = statement.text.startsWith("[[") ? [] : tableKeys(statement.text.slice(1, -1));
      selected = keys.length === 2 && keys[0] === "mcp_servers" && keys[1] === name;
    } else if (selected && /^args\s*=/.test(statement.text)) {
      const raw = text.slice(statement.start, statement.end);
      const leading = raw.match(/^[ \t]*/)[0];
      const replacement = leading + "args = " + JSON.stringify(args) + (raw.endsWith("\r") ? "\r" : "");
      return text.slice(0, statement.start) + replacement + text.slice(statement.end);
    }
  }
  throw new Error("MCP 参数字段无法定位，已保留原配置");
}

export function normalizeSource(input) {
  if (!input || typeof input !== "object") throw new Error("更新来源无效");
  if (["npm", "pypi"].includes(input.type)) {
    const name = String(input.package || "").trim();
    const valid = input.type === "npm" ? /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i : /^[a-z0-9][a-z0-9._-]*$/i;
    if (!valid.test(name) || name.length > 200) throw new Error("更新来源的包名无效");
    return { type: input.type, package: name };
  }
  if (input.type !== "github") throw new Error("暂不支持这个更新来源");
  let repository = String(input.repository || "").trim();
  if (repository.startsWith("https://")) {
    const url = new URL(repository);
    if (url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) throw new Error("GitHub 仓库来源不能包含凭证或附加参数");
    repository = url.pathname.slice(1);
  }
  repository = repository.replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(repository) || repository.includes("..")) throw new Error("请提供公开的 GitHub 仓库来源（owner/repo）");
  let directory = String(input.path || "").trim().replace(/\/?SKILL\.md$/i, "").replace(/\/$/, "");
  if (directory.startsWith("/") || directory.includes("\\") || directory.split("/").some(part => part === ".." || part === ".") || /[\x00-\x1f?#]/.test(directory) || directory.length > 500) throw new Error("更新来源目录必须位于仓库内");
  const ref = String(input.ref || "HEAD").trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(ref) || ref.includes("..") || ref.length > 200) throw new Error("更新来源的分支或标签无效");
  return { type: "github", repository, path: directory, ref };
}
function githubRepository(value) {
  try {
    if (typeof value !== "string") return null;
    value = value.replace(/^git\+/, "").replace(/^git@github\.com:/, "https://github.com/");
    return normalizeSource({ type: "github", repository: value }).repository;
  } catch { return null; }
}
function packageRepository(metadata, type) {
  const candidates = type === "npm"
    ? [typeof metadata?.repository === "object" ? metadata.repository?.url : metadata?.repository, metadata?.homepage?.split("#")[0]]
    : Object.values(metadata?.project_urls || {});
  return candidates.map(githubRepository).find(Boolean) || "";
}
export function compareVersions(a, b) {
  const parse = value => {
    const match = String(value).match(/^v?(\d+(?:\.\d+)*)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/);
    return match ? { parts: match[1].split(".").map(Number), pre: match[2] || "" } : null;
  };
  a = parse(a); b = parse(b);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
    const delta = (a.parts[i] || 0) - (b.parts[i] || 0);
    if (delta) return Math.sign(delta);
  }
  if (a.pre === b.pre) return 0;
  if (!a.pre || !b.pre) return a.pre ? -1 : 1;
  const x = a.pre.split("."), y = b.pre.split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined || y[i] === undefined) return x[i] === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x[i]), yn = /^\d+$/.test(y[i]);
    if (xn && yn) return Math.sign(Number(x[i]) - Number(y[i]));
    if (xn !== yn) return xn ? -1 : 1;
    return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

async function runGit(directory, args) {
  try {
    const result = await execFileAsync("git", ["-c", "core.fsmonitor=false", "-C", directory, ...args], { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
    return result.stdout.trim();
  } catch { return ""; } // Missing Git/untrusted checkout remains an unknown source.
}
async function gitProvenance(directory, cache, wholeRepository = false) {
  let root = directory;
  while (true) {
    try { await fs.lstat(path.join(root, ".git")); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(root);
    if (parent === root) return null;
    root = parent;
  }
  if (!cache.has(root)) cache.set(root, (async () => {
    const remote = await runGit(root, ["config", "--get", "remote.origin.url"]);
    return { repository: githubRepository(remote), remote, commit: await runGit(root, ["rev-parse", "HEAD"]) };
  })());
  const info = await cache.get(root);
  if (!info.repository || !isSha(info.commit)) return null;
  const subdir = wholeRepository ? "" : path.relative(root, directory).split(path.sep).join("/");
  const tree = await runGit(root, ["rev-parse", subdir ? `HEAD:${subdir}` : "HEAD^{tree}"]);
  const dirty = await runGit(root, ["status", "--porcelain", "--", subdir || "."]);
  return { source: normalizeSource({ type: "github", repository: info.repository, path: subdir }), baselineTree: isSha(tree) ? tree : "", currentCommit: info.commit, currentVersion: short(info.commit), currentKind: "commit", locallyModified: !!dirty, installation: { type: "git", root, remote: info.remote }, sourceEvidence: "git" };
}
async function packageProvenance(file) {
  if (!(await fs.stat(file)).isFile()) return null;
  let directory = path.dirname(file);
  for (let i = 0; i < 7; i++) {
    const manifest = await optionalJson(path.join(directory, "package.json"));
    if (manifest) {
      const spec = packageSpec(manifest.name, "npm");
      if (!spec || typeof manifest.version !== "string") return null;
      const cached = /[\\/]_npx[\\/][^\\/]+[\\/]node_modules[\\/]/i.test(directory);
      return { ...spec, currentVersion: manifest.version, currentKind: "installed", location: file, upstreamRepository: packageRepository(manifest, "npm"), sourceEvidence: "package-manifest", installation: cached ? { type: "npm-cache", root: directory, entry: path.relative(directory, file) } : null };
    }
    const parent = path.dirname(directory);
    if (directory === parent) break;
    directory = parent;
  }
  return null;
}
function publicItem(item) {
  const { fingerprint, baselineTree, currentCommit, localBlobs, confirmedTree, installation, launch, configPath, ...result } = item;
  const support = updateSupport(item);
  return { ...result, updateSupported: support.supported, updateDisabledReason: support.reason || "" };
}
const sameSource = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const within = (root, file) => { const relative = path.relative(root, file); return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep)); };
const reversible = entry => ["updated", "pending-restart", "rolled-back"].includes(entry.state);
function cachedResult(value = {}) {
  // Cached check output must never replace discovered paths, launchers or provenance.
  const fields = ["status", "checkedAt", "latestVersion", "notes", "notesLabel", "updateUrl", "detail", "error", "previousStatus", "attemptedAt", "confirmedTree", "currentVersion", "currentKind", "upstreamRepository"];
  const result = Object.fromEntries(fields.filter(key => typeof value[key] === "string").map(key => [key, value[key]]));
  if (result.confirmedTree && !isSha(result.confirmedTree)) delete result.confirmedTree;
  if (result.upstreamRepository) result.upstreamRepository = githubRepository(result.upstreamRepository) || "";
  return result;
}
function validateHistory(entry) {
  const invalid = () => { throw new Error("扩展更新历史格式无效；已停止写入，请保留状态文件和备份"); };
  if (!entry || !/^[a-f0-9-]{36}$/.test(entry.id || "") || !Array.isArray(entry.itemIds) || !entry.itemIds.length || !entry.itemIds.every(id => /^(skill|mcp)-[a-f0-9]{24}$/.test(id)) || typeof entry.name !== "string" || !["git", "skill-copy", "npm-cache", "package-argument", "unsupported"].includes(entry.method) || !["prepared", "rolling-back", "updated", "pending-restart", "rolled-back", "skipped", "failed"].includes(entry.state)) invalid();
  if (!["prepared", "rolling-back", "updated", "pending-restart", "rolled-back"].includes(entry.state)) return;
  if (!sameSource(entry.source, normalizeSource(entry.source))) invalid();
  if (entry.method === "git") {
    if (entry.source.type !== "github" || !path.isAbsolute(entry.root || "") || !isSha(entry.before) || !isSha(entry.after) || typeof entry.branch !== "string" || !entry.branch || entry.branch.startsWith("-")) invalid();
  } else if (entry.method === "skill-copy") {
    if (entry.source.type !== "github" || !path.isAbsolute(entry.target || "") || !isSha(entry.beforeTree) || !isSha(entry.afterTree) || !/^[a-f0-9]{64}$/.test(entry.beforeHash || "") || !/^[a-f0-9]{64}$/.test(entry.afterHash || "") || entry.backup !== path.join(path.dirname(entry.target), ".codex-plus-backups", entry.id, "original") || entry.stage !== path.join(path.dirname(entry.target), ".codex-plus-backups", entry.id, "staged")) invalid();
  } else if (["npm-cache", "package-argument"].includes(entry.method)) {
    if (!["npm", "pypi"].includes(entry.source.type) || !path.isAbsolute(entry.configPath || "") || !Number.isInteger(entry.index) || entry.index < 0 || entry.index > 1024 || typeof entry.before !== "string" || typeof entry.after !== "string" || !/^[a-f0-9]{64}$/.test(entry.commandHash || "")) invalid();
    if (entry.method === "package-argument") {
      const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const spec = new RegExp("^(?:--package=|--from=)?" + escape(entry.source.package) + (entry.source.type === "npm" ? "@" : "==") + "[0-9][0-9A-Za-z.+-]*$");
      if (!spec.test(entry.before) || !spec.test(entry.after)) invalid();
    }
  } else invalid();
}

export class ExtensionUpdateService {
  constructor({ home = os.homedir(), codexHome = process.env.CODEX_HOME || path.join(home, ".codex"), statePath = path.join(process.env.LOCALAPPDATA || path.join(home, ".local", "share"), "Codex-Plus-Pro", "extension-updates.json"), fetcher = fetch, now = () => Date.now(), onState = () => {}, updateExecutor, npmCli } = {}) {
    Object.assign(this, { home, codexHome, statePath, fetcher, now, onState });
    this.saved = null; this.items = []; this.warnings = []; this.busy = null; this.lastAttempt = 0;
    this.activity = "idle";
    this.updater = new ExtensionUpdater({ requestJson: (url, memo) => this.requestJson(url, memo), parseConfig: readMcpConfig, rewriteArgs: rewriteMcpArgs, executor: updateExecutor, npmCli, dataDirectory: path.dirname(statePath), onProgress: () => this.emit(this.activity) });
  }
  async load() {
    if (!this.loading) this.loading = (async () => {
      let saved;
      try { saved = await optionalJson(this.statePath); }
      catch { throw new Error("扩展更新状态文件损坏或无法读取；请保留原文件后修复"); }
      if (saved && (saved.schemaVersion !== 1 || typeof saved.sources !== "object" || !saved.sources || typeof saved.cache !== "object" || !saved.cache)) throw new Error("扩展更新状态格式无效");
      this.saved = saved || { schemaVersion: 1, autoCheck: false, sources: {}, cache: {}, lastCheckedAt: "", lastAttemptAt: "" };
      this.saved.autoCheck = this.saved.autoCheck === true;
      this.saved.autoUpdate = this.saved.autoUpdate === true;
      if (this.saved.history !== undefined && !Array.isArray(this.saved.history)) throw new Error("扩展更新历史格式无效");
      this.saved.history ||= [];
      for (const operation of this.saved.history) validateHistory(operation);
      await this.discover();
      for (const operation of this.saved.history.filter(entry => ["prepared", "rolling-back"].includes(entry.state))) {
        try { await this.validateOperation(operation); operation.state = await this.updater.recover(operation); }
        catch { operation.state = "failed"; operation.error = "上次更新中断，请检查安装位置和备份"; }
        if (operation.state === "failed") operation.error ||= "上次更新中断；未继续覆盖，请检查原版本和备份";
        await this.persist();
      }
      this.lastAttempt = Date.parse(this.saved.lastAttemptAt || "") || 0;
      for (const entry of Object.values(this.saved.sources)) normalizeSource(entry.source);
    })();
    await this.loading;
  }
  async persist() {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    const temporary = this.statePath + "." + process.pid + ".tmp";
    try { await fs.writeFile(temporary, JSON.stringify(this.saved, null, 2), "utf8"); await fs.rename(temporary, this.statePath); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  snapshot(state = this.busy ? this.activity : "idle", error = "") {
    return { state, error, autoCheck: this.saved?.autoCheck === true, autoUpdate: this.saved?.autoUpdate === true, lastCheckedAt: this.saved?.lastCheckedAt || "", warnings: this.warnings, items: this.items.map(publicItem), updateCount: this.items.filter(item => item.status === "available").length, history: (this.saved?.history || []).slice(-30).reverse().map(({ id, name, method, state, startedAt, finishedAt, error }) => ({ id, name, method, state, startedAt, finishedAt, error })) };
  }
  emit(state, error) { const result = this.snapshot(state, error); this.onState(result); return result; }
  async discover() {
    const items = [], warnings = [], realPaths = new Set(), gitCache = new Map();
    // Exclude by installation ownership, including aliases to built-in Skills.
    // A user-installed GitHub project is not excluded by its name or GitHub owner.
    const agentsRoot = path.join(this.home, ".agents", "skills");
    const ownedRoots = [path.join(agentsRoot, ".system"), path.join(this.codexHome, "skills", ".system"), ...["openai-bundled", "openai-primary-runtime", "openai-curated-remote", "openai-curated"].map(market => path.join(this.codexHome, "plugins", "cache", market))];
    for (const root of [...ownedRoots]) {
      try { ownedRoots.push(await fs.realpath(root)); }
      catch (error) { if (error.code !== "ENOENT") warnings.push("一个内置组件目录无法识别"); }
    }
    const clientOwned = directory => ownedRoots.some(root => {
      const relative = path.relative(root, directory);
      return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
    });
    const add = async item => {
      const override = this.saved.sources[item.id];
      if (override && !item.managed) {
        item.source = normalizeSource(override.source);
        if (override.currentVersion) { item.currentVersion = override.currentVersion; item.currentKind = "provided"; }
        // A different repository/directory cannot reuse an automatically inferred tree.
        item.sourceEvidence = "manual";
        if (item.originalSource && JSON.stringify(item.source) !== JSON.stringify(item.originalSource)) { item.baselineTree = ""; item.upstreamRepository = ""; item.installation = null; }
      }
      delete item.originalSource;
      if (item.kind === "skill" && item.source?.type === "github" && !item.managed) {
        try { item.localBlobs = await folderBlobs(item.location); item.contentHash = hash(JSON.stringify(item.localBlobs)); }
        catch { item.localComparisonUnavailable = true; warnings.push("Skill “" + item.name + "” 的本地内容无法完整比较"); }
      }
      const completed = [...this.saved.history].reverse().find(entry => entry.itemIds.includes(item.id) && reversible(entry));
      if (completed?.method === "skill-copy" && sameSource(completed.source, item.source)) {
        item.baselineTree = completed.state === "rolled-back" ? completed.beforeTree : completed.afterTree;
        item.currentVersion = short(item.baselineTree); item.currentKind = "install-record";
      }
      if (item.installation?.type === "package-argument" && override?.currentVersion && item.currentKind === "provided") item.installation = null;
      item.fingerprint = hash(JSON.stringify([CHECK_RESULT_VERSION, item.id, item.currentVersion, item.source, item.baselineTree, item.contentHash, item.locallyModified, item.upstreamRepository]));
      delete item.contentHash;
      const cached = this.saved.cache[item.id];
      Object.assign(item, cached?.fingerprint === item.fingerprint ? cachedResult(cached.result) : { status: item.managed ? "managed" : item.source ? "unchecked" : "no-source", checkedAt: "", latestVersion: "", notes: "" });
      const history = [...this.saved.history].reverse().find(entry => entry.itemIds?.includes(item.id));
      if (history) { item.updateState = history.method === "git" && history.state === "pending-restart" && item.kind === "skill" ? "updated" : history.state; item.updateError = history.error || ""; }
      item.canRollback = !!completed && completed.state !== "rolled-back";
      items.push(item);
    };
    const configPath = path.join(this.codexHome, "config.toml");
    try {
      const config = readMcpConfig(await readSmall(configPath));
      for (const server of config.servers) {
        if (server.localFiles.some(file => clientOwned(file) || (/node_repl\.exe$/i.test(file) && /[\\/]resources[\\/]/i.test(file)))) continue;
        const item = { ...server, kind: "mcp", id: "mcp-" + hash(configPath + ":" + server.name).slice(0, 24), location: configPath, configPath, launch: server.launch, ownership: "independent", sourceEvidence: server.source ? "launcher" : "unknown" };
        if (item.currentKind === "configured" && item.currentVersion && item.source) {
          const spec = item.source.package + (item.source.type === "npm" ? "@" : "==") + item.currentVersion;
          const index = server.launch.args.findIndex(arg => arg === spec || arg === "--package=" + spec || arg === "--from=" + spec);
          if (index >= 0) item.installation = { type: "package-argument", index, prefix: server.launch.args[index].slice(0, -spec.length) };
        }
        if (!item.managed && !item.source) {
          for (const file of server.localFiles) {
            try {
              if (/\.(?:mjs|cjs|js)$/i.test(file)) {
                // A Git checkout owns the whole MCP project, including modules
                // and dependencies outside its launcher directory.
                if (!(await fs.stat(file)).isFile()) continue;
                const info = await gitProvenance(path.dirname(file), gitCache, true) || await packageProvenance(file);
                if (info?.source?.type === "npm" && !info.installation) {
                  const previous = [...this.saved.history].reverse().find(entry => entry.method === "npm-cache" && entry.itemIds.includes(item.id) && entry.after === file && ["pending-restart", "prepared", "rolling-back"].includes(entry.state));
                  if (previous && within(path.join(path.dirname(this.statePath), "mcp-packages", previous.id, "node_modules", ...info.source.package.split("/")), file) && sameSource(previous.source, info.source)) {
                    info.installation = { type: "npm-cache", root: path.join(path.dirname(this.statePath), "mcp-packages", previous.id, "node_modules", ...info.source.package.split("/")), entry: path.relative(path.join(path.dirname(this.statePath), "mcp-packages", previous.id, "node_modules", ...info.source.package.split("/")), file) };
                  }
                }
                if (info) { Object.assign(item, info); break; }
              }
            } catch { warnings.push("MCP “" + server.name + "” 的本地来源无法读取"); }
          }
        }
        if (item.installation?.type === "npm-cache") {
          const index = server.launch.args.findIndex(arg => path.normalize(arg) === path.normalize(item.location));
          if (index < 0) item.installation = null; else item.installation.index = index;
        }
        item.originalSource = item.source;
        await add(item);
      }
    } catch (error) { if (error.code !== "ENOENT") warnings.push("MCP 配置无法完整读取：" + (error.message.startsWith("MCP") ? error.message : "请检查配置格式与文件权限")); }
    let lock = null;
    try { lock = await optionalJson(path.join(this.home, ".agents", ".skill-lock.json")); }
    catch { warnings.push("Skill 安装来源记录无法读取"); }
    const visit = async (directory, depth) => {
      if (depth > 5 || items.length >= 500 || clientOwned(directory)) return;
      let real;
      try { real = await fs.realpath(directory); }
      catch (error) { if (error.code !== "ENOENT") warnings.push("一个 Skill 目录无法读取"); return; }
      if (realPaths.has(real) || clientOwned(real)) return;
      realPaths.add(real);
      let text;
      try { text = await readSmall(path.join(real, "SKILL.md"), 512 * 1024); }
      catch (error) { if (error.code !== "ENOENT") warnings.push("一个 Skill 文件无法读取"); }
      if (text !== undefined) {
        const name = text.match(/^name:\s*["']?([^\r\n"']+)["']?\s*$/m)?.[1]?.trim() || path.basename(directory);
        const item = { kind: "skill", name, id: "skill-" + hash(real).slice(0, 24), location: directory, source: null, currentVersion: "", contentHash: hash(text), ownership: "independent", sourceEvidence: "unknown" };
        const info = await gitProvenance(real, gitCache);
        if (info) Object.assign(item, info);
        else {
          const record = lock?.version >= 3 && lock.skills?.[path.basename(directory)];
          // Lock entries only own their installed location, not same-named copies.
          if (record?.sourceType === "github" && path.dirname(directory) === agentsRoot && isSha(record.skillFolderHash)) {
            try {
              item.source = normalizeSource({ type: "github", repository: record.sourceUrl || record.source, path: record.skillPath });
              item.baselineTree = record.skillFolderHash;
              item.currentVersion = short(record.skillFolderHash); item.currentKind = "install-record";
              item.sourceEvidence = "install-record";
            } catch { warnings.push("Skill “" + name + "” 的来源记录无效"); }
          }
        }
        item.originalSource = item.source;
        await add(item); return;
      }
      let directories;
      try { directories = await fs.readdir(real, { withFileTypes: true }); }
      catch { warnings.push("一个 Skill 目录无法扫描"); return; }
      for (const child of directories.sort((a, b) => a.name.localeCompare(b.name))) {
        if (child.name.endsWith(".disabled") || child.name.startsWith(".")) continue;
        if (child.isDirectory() || child.isSymbolicLink()) await visit(path.join(directory, child.name), depth + 1);
      }
    };
    await visit(agentsRoot, 0);
    await visit(path.join(this.codexHome, "skills"), 0);
    this.items = items; this.warnings = [...new Set(warnings)];
    if (items.length >= 500) this.warnings.push("扩展数量超过扫描上限，部分项目未显示");
  }
  async requestJson(url, memo) {
    if (memo.has(url)) return memo.get(url);
    const task = (async () => {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !["registry.npmjs.org", "pypi.org", "api.github.com"].includes(parsed.hostname)) throw new Error("更新来源请求被拒绝");
      let response;
      try { response = await this.fetcher(url, { signal: AbortSignal.timeout(12000), redirect: "error", headers: { Accept: "application/json", "User-Agent": "Codex-Plus-Pro-Extension-Updates" } }); }
      catch { throw new Error("联网失败或请求超时，请重试"); }
      if (!response.ok) {
        if ([403, 429].includes(response.status)) throw new Error("更新来源限制了请求次数，请稍后重试");
        if (response.status === 404) throw new Error("未找到公开来源或指定版本");
        throw new Error("更新来源暂时不可用（HTTP " + response.status + "）");
      }
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 2 * 1024 * 1024) throw new Error("上游数据过大，请打开更新来源查看");
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new Error("上游返回的版本数据格式错误"); }
    })();
    memo.set(url, task); return task;
  }
  async probe(item, memo) {
    const source = item.source, checkedAt = new Date(this.now()).toISOString();
    if (source.type === "github") {
      const base = "https://api.github.com/repos/" + source.repository;
      const data = await this.requestJson(base + "/git/trees/" + encodeURIComponent(source.ref) + "?recursive=1", memo);
      if (data.truncated || !Array.isArray(data.tree)) throw new Error("上游目录数据不完整，无法可靠比较");
      const tree = source.path ? data.tree.find(entry => entry.path === source.path && entry.type === "tree")?.sha : data.sha;
      if (!isSha(tree)) throw new Error("更新来源目录不存在");
      const cached = this.saved.cache[item.id];
      const confirmed = cached?.fingerprint === item.fingerprint ? cachedResult(cached.result).confirmedTree || "" : "";
      const baseline = confirmed || item.baselineTree;
      const result = { checkedAt, latestVersion: short(tree), status: baseline ? (baseline === tree ? "current" : "available") : "unknown-version", upstreamRepository: source.repository, updateUrl: "https://github.com/" + source.repository + "/commits/" + encodeURIComponent(source.ref) + (source.path ? "/" + source.path.split("/").map(encodeURIComponent).join("/") : ""), notes: "", notesLabel: "该目录的最近变更" };
      if (item.currentCommit && baseline !== tree) {
        // Different trees alone cannot establish upgrade direction: the local
        // checkout may be ahead, unpublished, or on a different branch.
        try {
          const comparison = await this.requestJson(base + "/compare/" + item.currentCommit + "..." + encodeURIComponent(source.ref), memo);
          result.status = comparison.status === "ahead" ? "available" : comparison.status === "behind" ? "ahead" : "different";
        } catch { result.status = "different"; result.detail = "本地与上游提交关系无法确认，请查看变更后判断。"; }
      }
      if (item.localBlobs && item.currentKind !== "commit") {
        const prefix = source.path ? source.path + "/" : "";
        const upstream = data.tree.filter(entry => entry.type === "blob" && entry.path.startsWith(prefix)).map(entry => [entry.path.slice(prefix.length), entry.sha]);
        const equal = upstream.length === Object.keys(item.localBlobs).length && upstream.every(([file, sha]) => item.localBlobs[file] === sha);
        result.status = equal ? "current" : baseline ? result.status : "different";
        if (equal || confirmed) { result.confirmedTree = equal ? tree : confirmed; result.currentVersion = short(result.confirmedTree); result.currentKind = "content"; }
      }
      if (item.locallyModified) result.detail = "本地有修改；结果按 Git 提交比较。更新前请检查本地差异。";
      if (item.currentKind === "install-record") result.detail = "当前版本依据安装记录；更新前会核对完整目录，保留本地修改。";
      try {
        const commits = await this.requestJson(base + "/commits?sha=" + encodeURIComponent(source.ref) + "&per_page=5" + (source.path ? "&path=" + encodeURIComponent(source.path) : ""), memo);
        if (Array.isArray(commits)) result.notes = commits.map(commit => String(commit.commit?.message || "").split("\n")[0]).filter(Boolean).join("\n").slice(0, 4000);
      } catch { result.notes = "版本检测已完成，更新记录暂时无法读取。可打开更新入口查看。"; }
      return result;
    }
    const url = source.type === "npm" ? "https://registry.npmjs.org/" + encodeURIComponent(source.package) + "/latest" : "https://pypi.org/pypi/" + encodeURIComponent(source.package) + "/json";
    const data = await this.requestJson(url, memo);
    const metadata = source.type === "npm" ? data : data.info;
    if (typeof metadata?.version !== "string" || metadata.version.length > 100) throw new Error("上游未提供有效版本号");
    const comparison = item.currentVersion ? compareVersions(item.currentVersion, metadata.version) : null;
    const result = { checkedAt, latestVersion: metadata.version, status: comparison === null ? "unknown-version" : comparison < 0 ? "available" : comparison > 0 ? "ahead" : "current", notes: "上游未提供该版本的发布说明，可打开更新入口查看。", notesLabel: "版本发布说明", updateUrl: source.type === "npm" ? "https://www.npmjs.com/package/" + source.package : "https://pypi.org/project/" + source.package + "/" };
    const repository = packageRepository(metadata, source.type) || item.upstreamRepository || "";
    result.upstreamRepository = repository;
    if (repository) {
      result.updateUrl = "https://github.com/" + repository + "/releases";
      for (const tag of ["v" + metadata.version, metadata.version]) {
        try {
          const release = await this.requestJson("https://api.github.com/repos/" + repository + "/releases/tags/" + encodeURIComponent(tag), memo);
          result.updateUrl = "https://github.com/" + repository + "/releases/tag/" + encodeURIComponent(tag);
          if (typeof release.body === "string" && release.body.trim()) result.notes = release.body.slice(0, 4000);
          break;
        } catch { /* Package version remains useful when release notes are absent. */ }
      }
    }
    return result;
  }
  async validateOperation(operation) {
    validateHistory(operation);
    if (operation.method === "git") {
      if (!this.items.some(item => operation.itemIds.includes(item.id) && item.installation?.type === "git" && path.resolve(item.installation.root) === operation.root && item.source?.repository === operation.source.repository)) throw new Error("原 Git 安装位置或来源已变化");
      if (await fs.realpath(operation.root) !== operation.root) throw new Error("Git 安装路径已变化");
    } else if (operation.method === "skill-copy") {
      const roots = [path.join(this.home, ".agents/skills"), path.join(this.codexHome, "skills")];
      if (!roots.some(root => within(root, operation.target) && path.relative(root, operation.target).split(path.sep).every(part => part && !part.startsWith("."))) || !operation.itemIds.includes("skill-" + hash(operation.target).slice(0, 24))) throw new Error("Skill 备份不属于当前安装位置");
      if (await fs.realpath(path.dirname(operation.backup)) !== path.dirname(operation.backup)) throw new Error("Skill 备份路径已变化");
      try { if (await fs.realpath(operation.target) !== operation.target) throw new Error("Skill 安装路径已变化"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    } else {
      if (operation.configPath !== path.join(this.codexHome, "config.toml") || !operation.itemIds.includes("mcp-" + hash(operation.configPath + ":" + operation.name).slice(0, 24)) || (await fs.lstat(operation.configPath)).isSymbolicLink()) throw new Error("MCP 原配置位置已变化");
      if (operation.method === "npm-cache") {
        const root = path.join(path.dirname(this.statePath), "mcp-packages", operation.id, "node_modules", ...operation.source.package.split("/"));
        if (!path.isAbsolute(operation.before) || !within(root, operation.after)) throw new Error("MCP 更新路径无效");
        if (await fs.realpath(operation.after) !== operation.after) throw new Error("MCP 新版安装路径已变化");
      }
    }
  }
  async recordOperation(operation) {
    const value = structuredClone(operation);
    validateHistory(value);
    const index = this.saved.history.findIndex(entry => entry.id === value.id);
    const previous = this.saved.history[index];
    if (index < 0) this.saved.history.push(value); else this.saved.history[index] = value;
    try { await this.persist(); }
    catch {
      if (index < 0) this.saved.history.pop(); else this.saved.history[index] = previous;
      throw new Error("更新记录无法保存；请检查 Plus 数据目录权限");
    }
  }
  async exclusive(activity, work) {
    if (this.busy) throw new Error("扩展操作正在进行，请完成后再重试");
    this.activity = activity;
    const task = Promise.resolve().then(work);
    this.busy = task;
    try { return await task; }
    finally { this.busy = null; this.activity = "idle"; }
  }
  async updateItems(queue, memo = new Map()) {
    this.activity = "updating";
    const processed = new Set(), changed = new Map();
    for (const item of queue) {
      const key = item.installation?.type === "git" ? item.installation.root : item.id;
      if (processed.has(key)) continue;
      processed.add(key);
      const group = item.installation?.type === "git" ? this.items.filter(other => other.installation?.type === "git" && other.installation.root === key) : [item];
      const itemIds = group.map(other => other.id);
      for (const member of group) { member.updateState = "updating"; member.updateError = ""; }
      this.emit("updating");
      let journal;
      try {
        const operation = await this.updater.apply(item, { memo, itemIds, record: async value => { await this.recordOperation(value); journal = structuredClone(value); } });
        for (const member of group) changed.set(member.id, { operation, result: this.saved.cache[member.id]?.result });
      } catch (error) {
        if (journal?.state === "prepared") {
          // The durable prepared record can recover a completed write whose final save failed.
          try { await this.validateOperation(journal); journal.state = await this.updater.recover(journal); }
          catch { journal.state = "failed"; }
          journal.error = ["updated", "pending-restart"].includes(journal.state) ? "更新已写入，完成记录保存失败；备份仍可回退，请重新扫描" : error instanceof UpdateSkipped ? error.message : "更新未完成，原版本或备份已保留，请检查安装位置";
          if (journal.state === "failed" && error instanceof UpdateSkipped) journal.state = "skipped";
          try { await this.recordOperation(journal); }
          catch { this.saved.history[this.saved.history.findIndex(entry => entry.id === journal.id)] = journal; }
          if (["updated", "pending-restart"].includes(journal.state)) for (const member of group) changed.set(member.id, { operation: journal, result: this.saved.cache[member.id]?.result });
        } else {
          const failure = { id: randomUUID(), itemIds, name: item.name, method: updateSupport(item).method || "unsupported", startedAt: new Date(this.now()).toISOString(), state: error instanceof UpdateSkipped ? "skipped" : "failed", error: error instanceof UpdateSkipped ? error.message : "更新失败：" + (error.message.startsWith("E") ? "请检查文件权限与安装位置" : error.message) };
          await this.recordOperation(failure);
        }
      }
      await this.discover();
      this.emit("updating");
    }
    for (const item of this.items) {
      const applied = changed.get(item.id);
      if (!applied) continue;
      const result = { ...applied.result, status: "current", latestVersion: item.currentVersion, error: "", previousStatus: "", checkedAt: new Date(this.now()).toISOString() };
      delete result.confirmedTree;
      delete result.currentVersion;
      delete result.currentKind;
      if (applied.operation.method === "skill-copy") result.confirmedTree = applied.operation.afterTree;
      Object.assign(item, result);
      this.saved.cache[item.id] = { fingerprint: item.fingerprint, result };
    }
    await this.persist();
  }
  async check(itemId) {
    if (this.busy) return this.busy;
    return this.exclusive("checking", async () => {
      await this.discover();
      if (itemId && !this.items.some(item => item.id === itemId)) throw new Error("未找到这个扩展项目，请重新扫描");
      const queue = this.items.filter(item => !item.managed && item.source && (!itemId || item.id === itemId));
      const memo = new Map();
      this.lastAttempt = this.now(); this.saved.lastAttemptAt = new Date(this.lastAttempt).toISOString();
      for (const item of queue) item.status = "checking";
      this.emit("checking");
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (index < queue.length) {
          const item = queue[index++];
          let result;
          try { result = { ...await this.probe(item, memo), error: "", previousStatus: "" }; }
          catch (error) {
            const old = this.saved.cache[item.id];
            const previous = old?.fingerprint === item.fingerprint ? cachedResult(old.result) : {};
            result = { ...previous, previousStatus: previous.status === "failed" ? previous.previousStatus : previous.status || "", status: "failed", error: error.message, attemptedAt: new Date(this.now()).toISOString() };
          }
          Object.assign(item, result);
          this.saved.cache[item.id] = { fingerprint: item.fingerprint, result };
          this.emit("checking");
        }
      }));
      this.saved.lastCheckedAt = new Date(this.now()).toISOString();
      const liveIds = new Set(this.items.map(item => item.id));
      for (const id of Object.keys(this.saved.cache)) if (!liveIds.has(id)) delete this.saved.cache[id];
      try { await this.persist(); }
      catch { throw new Error("检查已完成，但结果无法保存。请检查 Plus 数据目录权限。"); }
      if (this.saved.autoUpdate) await this.updateItems(this.items.filter(item => item.status === "available" && (!itemId || item.id === itemId)), memo);
      return this.emit("idle");
    });
  }
  async handle(request = {}) {
    await this.load();
    const action = request.action;
    if (action === "list") { if (this.mutation) await this.mutation; if (!this.busy) await this.discover(); return this.snapshot(); }
    if (this.mutation) throw new Error("扩展设置正在保存，请稍后重试");
    if (action === "check") return this.check(request.itemId);
    if (action === "update") return this.exclusive("updating", async () => {
      await this.discover();
      const item = this.items.find(entry => entry.id === request.itemId);
      if (!item || !updateSupport(item).supported || item.status !== "available") throw new Error("此项目没有可验证的更新基线，请先检查更新或补充安装来源");
      await this.updateItems([item]); return this.emit("idle");
    });
    if (action === "rollback") return this.exclusive("rolling-back", async () => {
      await this.discover();
      const operation = [...this.saved.history].reverse().find(entry => entry.itemIds.includes(request.itemId) && reversible(entry));
      if (!operation || operation.state === "rolled-back") throw new Error("这个项目没有可回退的更新");
      await this.validateOperation(operation);
      this.emit("rolling-back");
      const copy = structuredClone(operation);
      try { await this.updater.rollback(copy, value => this.recordOperation(value)); }
      catch (error) {
        if (this.saved.history.find(entry => entry.id === copy.id)?.state === "rolling-back") {
          copy.state = "rolling-back";
          copy.state = await this.updater.recover(copy);
          if (copy.state === "failed") copy.state = operation.state;
          copy.error = "回退未完整结束，请重新扫描并检查安装位置";
          await this.recordOperation(copy);
        }
        throw error instanceof UpdateSkipped ? error : new Error("回退失败；请检查安装位置与备份，稍后重试");
      }
      for (const id of operation.itemIds) delete this.saved.cache[id];
      await this.persist(); await this.discover(); return this.emit("idle");
    });
    if (this.busy) throw new Error("扩展操作正在进行，请完成后再修改设置");
    this.mutation = this.mutate(request);
    try { return await this.mutation; }
    finally { this.mutation = null; }
  }
  async mutate(request) {
    const action = request.action;
    if (action === "preferences") {
      const keys = ["autoCheck", "autoUpdate"].filter(key => key in request);
      if (!keys.length || keys.some(key => typeof request[key] !== "boolean")) throw new Error("自动检查或更新选项无效");
      const previous = Object.fromEntries(keys.map(key => [key, this.saved[key]]));
      for (const key of keys) this.saved[key] = request[key];
      try { await this.persist(); } catch { Object.assign(this.saved, previous); throw new Error("自动检查或更新设置无法保存，请检查文件权限"); }
      return this.emit("idle");
    }
    if (action === "source") {
      await this.discover();
      const item = this.items.find(item => item.id === request.itemId);
      if (!item || item.managed) throw new Error("这个扩展项目无法设置更新来源");
      const previous = this.saved.sources[item.id];
      const currentVersion = String(request.currentVersion || "").trim();
      if (currentVersion && compareVersions(currentVersion, currentVersion) === null) throw new Error("当前版本号格式无效");
      if (request.source === null) delete this.saved.sources[item.id];
      else this.saved.sources[item.id] = { source: normalizeSource(request.source), currentVersion };
      try { await this.persist(); }
      catch { if (previous) this.saved.sources[item.id] = previous; else delete this.saved.sources[item.id]; throw new Error("更新来源无法保存，请检查文件权限"); }
      await this.discover(); return this.emit("idle");
    }
    throw new Error("不支持的扩展更新操作");
  }
  async maybeCheck() {
    await this.load();
    if (!this.saved.autoCheck || this.busy || this.mutation) return null;
    const last = Math.max(Date.parse(this.saved.lastCheckedAt || "") || 0, this.lastAttempt);
    if (last && this.now() - last < DAY) {
      if (!this.restoredReminders) { await this.discover(); this.restoredReminders = true; this.emit("idle"); }
      return null;
    }
    return this.check();
  }
}

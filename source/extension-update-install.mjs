import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sha = value => /^[a-f0-9]{40}$/i.test(value || "");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class UpdateSkipped extends Error {}

export async function folderBlobs(directory, complete = false) {
  const blobs = {}; let size = 0, count = 0;
  const visit = async (root, prefix) => {
    for (const file of await fs.readdir(root, { withFileTypes: true })) {
      if ((complete === "package" && file.name === "node_modules") || (!complete && [".git", "node_modules", "__pycache__", ".venv"].includes(file.name))) continue;
      if (++count > 512 || file.isSymbolicLink()) throw new Error("本地 Skill 目录过大或包含链接，无法比较完整内容");
      const relative = prefix + file.name;
      if (file.isDirectory()) await visit(path.join(root, file.name), relative + "/");
      else if (file.isFile()) {
        size += (await fs.stat(path.join(root, file.name))).size;
        if (size > 32 * 1024 * 1024) throw new Error("本地 Skill 内容过大，无法完整比较");
        const content = await fs.readFile(path.join(root, file.name));
        blobs[relative] = createHash("sha1").update(Buffer.from("blob " + content.length + "\0")).update(content).digest("hex");
      }
      else throw new Error("本地 Skill 含不支持的文件类型");
    }
  };
  await visit(directory, "");
  return Object.fromEntries(Object.entries(blobs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function updateSupport(item) {
  if (item.managed) return { supported: false, reason: "由服务提供方管理" };
  if (!item.source) return { supported: false, reason: "需补充更新来源" };
  if (item.installation?.type === "git") return { supported: true, method: "git" };
  if (item.kind === "skill" && item.source.type === "github" && sha(item.baselineTree || item.confirmedTree)) return { supported: true, method: "skill-copy" };
  if (item.kind === "mcp" && item.upstreamRepository && ["npm-cache", "package-argument"].includes(item.installation?.type) && ["npm", "pypi"].includes(item.source.type)) return { supported: true, method: item.installation.type };
  return { supported: false, reason: "安装方式或原始版本尚未确认，暂不能自动更新" };
}

function treeFiles(tree, prefix = "") {
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("上游目录数据不完整");
  const files = {}, names = new Set();
  for (const entry of tree.tree.filter(entry => entry.path.startsWith(prefix) && entry.type !== "tree")) {
    const name = entry.path.slice(prefix.length);
    if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git" || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("上游文件路径不安全，已停止更新");
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode) || !sha(entry.sha)) throw new Error("上游含链接或不支持的文件类型，已停止更新");
    const key = process.platform === "win32" ? name.toLowerCase() : name;
    if (names.has(key) || [...names].some(other => other.startsWith(key + "/") || key.startsWith(other + "/")) || names.size >= 512) throw new Error("上游文件名冲突或文件过多");
    names.add(key); files[name] = entry.sha;
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
async function exists(file) { try { await fs.lstat(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function readConfig(file) {
  const stat = await fs.stat(file); if (stat.size > 2 * 1024 * 1024) throw new Error("MCP 配置文件过大");
  return fs.readFile(file, "utf8");
}

export class ExtensionUpdater {
  constructor({ requestJson, parseConfig, rewriteArgs, executor = exec, npmCli = "", dataDirectory, onProgress = () => {} }) {
    Object.assign(this, { requestJson, parseConfig, rewriteArgs, executor, npmCli, dataDirectory, onProgress });
  }
  async git(root, args, optional = false) {
    await fs.mkdir(path.join(this.dataDirectory, "empty-hooks"), { recursive: true });
    try {
      const result = await this.executor("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + path.join(this.dataDirectory, "empty-hooks"), "-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=never", "-c", "submodule.recurse=false", "-C", root, ...args], { windowsHide: true, timeout: 120000, maxBuffer: 256 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
      return args.includes("-z") ? result.stdout : result.stdout.trim();
    } catch (error) { if (optional && error.code === 1) return ""; throw new Error("Git 更新操作失败；请检查仓库状态和网络"); }
  }
  async cleanGit(root, expected) {
    if (await this.git(root, ["rev-parse", "HEAD"]) !== expected) throw new UpdateSkipped("本地提交已变化，已跳过更新");
    if (await this.git(root, ["status", "--porcelain", "--untracked-files=all"])) throw new UpdateSkipped("仓库有本地修改或新增文件，已跳过更新");
  }
  async checkGitEnvironment(root, destination, commit) {
    const rewrites = await this.git(root, ["config", "--get-regexp", "^url\\..*\\.insteadof$"], true);
    for (const line of rewrites.split("\n").filter(Boolean)) {
      const match = line.match(/^url\.(.+)\.insteadof\s+(.+)$/i);
      if (match && destination.startsWith(match[2]) && match[1] + destination.slice(match[2].length) !== destination) throw new UpdateSkipped("仓库会重写 GitHub 下载地址，请按原方式更新");
    }
    if (await this.git(root, ["config", "--get", "core.sparseCheckout"], true) === "true" || await exists(path.join(root, ".gitmodules"))) throw new UpdateSkipped("仓库使用稀疏检出或子模块，请按原方式更新");
    if (commit) {
      const files = (await this.git(root, ["ls-tree", "-r", "--name-only", "-z", commit])).split("\0").filter(Boolean);
      if (files.some(file => file === ".gitmodules")) throw new UpdateSkipped("新版仓库含子模块，请按原方式更新");
      if (!await this.git(root, ["config", "--get-regexp", "^filter\\."], true)) return;
      const attributeFiles = files.filter(file => file === ".gitattributes" || file.endsWith("/.gitattributes"));
      for (const file of attributeFiles) if (/\bfilter\s*=/.test(await this.git(root, ["show", commit + ":" + file]))) throw new UpdateSkipped("仓库文件需要外部过滤器，请按原方式更新");
      const globalFile = await this.git(root, ["config", "--path", "--get", "core.attributesFile"], true);
      const infoFile = await this.git(root, ["rev-parse", "--git-path", "info/attributes"]);
      for (const file of [globalFile, path.resolve(root, infoFile)].filter(Boolean)) if (await exists(file) && /\bfilter\s*=/.test(await readConfig(file))) throw new UpdateSkipped("仓库文件需要外部过滤器，请按原方式更新");
    }
  }
  async apply(item, { memo, record, itemIds = [item.id] }) {
    const support = updateSupport(item);
    if (!support.supported) throw new UpdateSkipped(support.reason);
    const operation = { id: randomUUID(), itemIds, name: item.name, method: support.method, startedAt: new Date().toISOString(), state: "prepared", source: item.source };
    if (support.method === "git") return this.updateGit(item, operation, memo, record);
    if (support.method === "skill-copy") return this.updateSkill(item, operation, memo, record);
    return this.updateMcp(item, operation, record);
  }
  async updateGit(item, operation, memo, record) {
    const root = await fs.realpath(item.installation.root);
    if (await this.git(root, ["config", "--get", "remote.origin.url"]) !== item.installation.remote) throw new UpdateSkipped("Git 原始来源已变化，已跳过更新");
    const destination = "https://github.com/" + item.source.repository + ".git";
    await this.checkGitEnvironment(root, destination, item.currentCommit);
    await this.cleanGit(root, item.currentCommit);
    const branch = await this.git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], true);
    if (!branch) throw new UpdateSkipped("仓库处于游离提交状态，请按原方式更新");
    const commit = await this.requestJson("https://api.github.com/repos/" + item.source.repository + "/commits/" + encodeURIComponent(item.source.ref), memo);
    if (!sha(commit.sha)) throw new Error("上游没有提供有效提交");
    await this.git(root, ["fetch", "--no-tags", "--no-write-fetch-head", destination, commit.sha]);
    await this.cleanGit(root, item.currentCommit);
    const base = await this.git(root, ["merge-base", item.currentCommit, commit.sha]);
    if (base !== item.currentCommit) throw new UpdateSkipped("本地提交与上游分叉，已跳过更新");
    await this.checkGitEnvironment(root, destination, commit.sha);
    // --ff-only rejects local divergence; --no-overwrite-ignore protects ignored files.
    Object.assign(operation, { root, before: item.currentCommit, after: commit.sha, branch });
    await record(operation);
    await this.git(root, ["update-ref", "refs/codex-plus-backups/" + operation.id, item.currentCommit]);
    await this.cleanGit(root, item.currentCommit);
    if (await this.git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== branch) throw new UpdateSkipped("写入前 Git 分支已变化，已跳过更新");
    await this.git(root, ["merge", "--ff-only", "--no-edit", "--no-autostash", "--no-overwrite-ignore", commit.sha]);
    operation.state = operation.itemIds.some(id => id.startsWith("mcp-")) ? "pending-restart" : "updated";
    operation.finishedAt = new Date().toISOString();
    await record(operation);
    return operation;
  }
  async updateSkill(item, operation, memo, record) {
    const base = "https://api.github.com/repos/" + item.source.repository;
    const baseline = item.confirmedTree || item.baselineTree;
    const before = treeFiles(await this.requestJson(base + "/git/trees/" + baseline + "?recursive=1", memo));
    const target = await fs.realpath(item.location);
    if (path.resolve(item.location) !== target) throw new UpdateSkipped("链接安装的 Skill 请按原方式更新");
    if (!same(await folderBlobs(target, true), before)) throw new UpdateSkipped("Skill 有本地修改，已跳过更新");
    const commit = await this.requestJson(base + "/commits/" + encodeURIComponent(item.source.ref), memo);
    if (!sha(commit.sha)) throw new Error("上游没有提供有效提交");
    const tree = await this.requestJson(base + "/git/trees/" + commit.sha + "?recursive=1", memo);
    const prefix = item.source.path ? item.source.path + "/" : "";
    const after = treeFiles(tree, prefix);
    const targetTree = item.source.path ? tree.tree.find(entry => entry.path === item.source.path && entry.type === "tree")?.sha : tree.sha;
    if (!sha(targetTree) || !("SKILL.md" in after)) throw new Error("上游 Skill 目录无效");
    const directory = path.join(path.dirname(target), ".codex-plus-backups", operation.id);
    const stage = path.join(directory, "staged"), backup = path.join(directory, "original");
    await fs.mkdir(stage, { recursive: true });
    if (await fs.realpath(stage) !== stage) throw new Error("Skill 备份路径包含链接，已停止更新");
    let size = 0;
    try {
      for (const [name, expected] of Object.entries(after)) {
        this.onProgress();
        const data = await this.requestJson(base + "/git/blobs/" + expected, memo);
        if (data.encoding !== "base64" || typeof data.content !== "string") throw new Error("上游文件内容无效");
        const content = Buffer.from(data.content.replace(/\s/g, ""), "base64"); size += content.length;
        const actual = createHash("sha1").update(Buffer.from("blob " + content.length + "\0")).update(content).digest("hex");
        if (actual !== expected || size > 32 * 1024 * 1024) throw new Error("上游文件校验失败或内容过大");
        const file = path.join(stage, ...name.split("/")); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content);
        if (tree.tree.find(entry => entry.path === prefix + name)?.mode === "100755") await fs.chmod(file, 0o755);
      }
      if (await fs.realpath(item.location) !== target || !same(await folderBlobs(target, true), before)) throw new UpdateSkipped("下载期间本地 Skill 已变化，已跳过更新");
      Object.assign(operation, { target, backup, stage, beforeHash: digest(before), afterHash: digest(after), beforeTree: baseline, afterTree: targetTree, source: item.source });
      await record(operation);
      if (await fs.realpath(item.location) !== target || !same(await folderBlobs(target, true), before)) throw new UpdateSkipped("写入前本地 Skill 已变化，已跳过更新");
      await fs.rename(target, backup);
      try { await fs.rename(stage, target); } catch (error) { await fs.rename(backup, target); throw error; }
      operation.state = "updated"; operation.finishedAt = new Date().toISOString(); await record(operation); return operation;
    } finally {
      // Only the task-created staging directory is removed; original backups are retained.
      await fs.rm(stage, { recursive: true, force: true });
      if (!(await exists(backup))) await fs.rmdir(directory);
    }
  }
  async locateNpm() {
    if (this.npmCli) return this.npmCli;
    const result = await this.executor(process.platform === "win32" ? "where.exe" : "which", [process.platform === "win32" ? "npm.cmd" : "npm"], { windowsHide: true, maxBuffer: 8192, timeout: 5000 });
    for (const file of result.stdout.trim().split(/\r?\n/)) {
      const candidates = [path.join(path.dirname(file), "node_modules/npm/bin/npm-cli.js"), path.join(path.dirname(file), "../lib/node_modules/npm/bin/npm-cli.js")];
      for (const candidate of candidates) if (await exists(candidate)) return candidate;
    }
    throw new UpdateSkipped("未找到 npm 安装器，请按原方式更新此 MCP");
  }
  async updateMcp(item, operation, record) {
    if (!/^\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/.test(item.latestVersion || "")) throw new Error("上游版本格式无效");
    const installation = item.installation;
    let after, installedDirectory, verifyOriginal = async () => {};
    const text = await readConfig(item.configPath);
    const parsed = this.parseConfig(text).servers.find(server => server.name === item.name);
    if (!parsed || !same(parsed.launch, item.launch)) throw new UpdateSkipped("MCP 启动配置已变化，已跳过更新");
    if (installation.type === "npm-cache") {
      const directory = path.join(this.dataDirectory, "mcp-packages", operation.id);
      try {
        const npm = await this.locateNpm();
        if (!/^\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/.test(item.currentVersion || "")) throw new UpdateSkipped("无法确认原 MCP 包版本，已跳过更新");
        const originalRoot = await fs.realpath(installation.root);
        const original = await folderBlobs(originalRoot, "package");
        const install = async (prefix, version) => {
          this.onProgress();
          await this.executor(process.execPath, [npm, "install", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", item.source.package + "@" + version], { windowsHide: true, timeout: 180000, maxBuffer: 256 * 1024 });
        };
        // npm is run through Node, without a shell or package lifecycle scripts.
        const baseline = path.join(directory, "baseline");
        await install(baseline, item.currentVersion);
        const baselineRoot = path.join(baseline, "node_modules", ...item.source.package.split("/"));
        if (!same(original, await folderBlobs(baselineRoot, "package"))) throw new UpdateSkipped("MCP 包有本地修改或原版本无法完整核对，已跳过更新");
        await fs.rm(baseline, { recursive: true, force: true });
        await install(directory, item.latestVersion);
        const root = path.join(directory, "node_modules", ...item.source.package.split("/"));
        const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
        if (manifest.name !== item.source.package || manifest.version !== item.latestVersion) throw new Error("新版 MCP 包校验失败");
        after = path.join(root, installation.entry);
        if (!(await fs.stat(after)).isFile() || await fs.realpath(after) !== after) throw new Error("新版 MCP 缺少原启动文件或包含链接，已保留旧版本");
        if (await fs.realpath(installation.root) !== originalRoot || !same(original, await folderBlobs(originalRoot, "package"))) throw new UpdateSkipped("安装期间原 MCP 包已变化，已跳过更新");
        installedDirectory = directory;
        verifyOriginal = async () => { if (await fs.realpath(installation.root) !== originalRoot || !same(original, await folderBlobs(originalRoot, "package"))) throw new UpdateSkipped("写入前原 MCP 包已变化，已跳过更新"); };
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        if (error instanceof UpdateSkipped) throw error;
        throw new Error("新版 MCP 安装或校验失败，已保留原启动配置");
      }
    } else {
      const separator = item.source.type === "npm" ? "@" : "==";
      after = installation.prefix + item.source.package + separator + item.latestVersion;
    }
    const before = parsed.launch.args[installation.index];
    Object.assign(operation, { configPath: item.configPath, index: installation.index, before, after, commandHash: digest(parsed.launch.command) });
    let written = false;
    try {
      await record(operation);
      await verifyOriginal();
      const args = [...parsed.launch.args]; args[installation.index] = after;
      await this.writeArgs(item.configPath, text, item.name, parsed.launch, args);
      written = true;
      operation.state = "pending-restart"; operation.finishedAt = new Date().toISOString(); await record(operation); return operation;
    } finally { if (installedDirectory && !written) await fs.rm(installedDirectory, { recursive: true, force: true }); }
  }
  async writeArgs(file, expectedText, name, expectedLaunch, args) {
    const replacement = this.rewriteArgs(expectedText, name, expectedLaunch, args);
    const temporary = file + ".codex-plus-" + randomUUID() + ".tmp";
    try {
      const stat = await fs.stat(file);
      if ((await fs.lstat(file)).isSymbolicLink()) throw new UpdateSkipped("MCP 配置使用链接，请按原方式更新");
      await fs.writeFile(temporary, replacement, { mode: stat.mode });
      if (await readConfig(file) !== expectedText) throw new UpdateSkipped("写入前 MCP 配置已变化，已跳过更新");
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async rollback(operation, record) {
    if (operation.method === "git") {
      await this.checkGitEnvironment(operation.root, "https://github.com/" + operation.source.repository + ".git", operation.after);
      await this.checkGitEnvironment(operation.root, "https://github.com/" + operation.source.repository + ".git", operation.before);
      await this.cleanGit(operation.root, operation.after);
      if (await this.git(operation.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== operation.branch) throw new UpdateSkipped("Git 分支已变化，无法回退");
      const names = output => output.split("\0").filter(Boolean).map(file => process.platform === "win32" ? file.toLowerCase() : file);
      const ignored = names(await this.git(operation.root, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]));
      const restored = names(await this.git(operation.root, ["ls-tree", "-r", "--name-only", "-z", operation.before]));
      if (ignored.some(file => restored.some(target => file === target || file.startsWith(target + "/") || target.startsWith(file + "/")))) throw new UpdateSkipped("回退会覆盖本地忽略文件，已停止；请先保留这些文件");
      operation.state = "rolling-back"; await record(operation);
      await this.cleanGit(operation.root, operation.after);
      if (await this.git(operation.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== operation.branch) throw new UpdateSkipped("写入前 Git 分支已变化，已停止回退");
      await this.git(operation.root, ["reset", "--keep", operation.before]);
    } else if (operation.method === "skill-copy") {
      if (digest(await folderBlobs(operation.target, true)) !== operation.afterHash) throw new UpdateSkipped("Skill 更新后有本地修改，无法覆盖回退");
      if (digest(await folderBlobs(operation.backup, true)) !== operation.beforeHash) throw new Error("原版本备份校验失败");
      const replaced = path.join(path.dirname(operation.backup), "replaced");
      operation.state = "rolling-back"; await record(operation);
      if (digest(await folderBlobs(operation.target, true)) !== operation.afterHash || digest(await folderBlobs(operation.backup, true)) !== operation.beforeHash) throw new UpdateSkipped("写入前 Skill 或备份已变化，已停止回退");
      await fs.rename(operation.target, replaced);
      try { await fs.rename(operation.backup, operation.target); } catch (error) { await fs.rename(replaced, operation.target); throw error; }
    } else {
      const text = await readConfig(operation.configPath);
      const entry = this.parseConfig(text).servers.find(server => server.name === operation.name);
      if (!entry || digest(entry.launch.command) !== operation.commandHash || entry.launch.args[operation.index] !== operation.after) throw new UpdateSkipped("MCP 更新参数已变化，无法覆盖回退");
      operation.state = "rolling-back"; await record(operation);
      const args = [...entry.launch.args]; args[operation.index] = operation.before;
      await this.writeArgs(operation.configPath, text, operation.name, entry.launch, args);
    }
    operation.state = "rolled-back"; operation.finishedAt = new Date().toISOString(); await record(operation); return operation;
  }
  async recover(operation) {
    if (operation.method === "skill-copy") {
      if (!(await exists(operation.target)) && await exists(operation.backup) && digest(await folderBlobs(operation.backup, true)) === operation.beforeHash) { await fs.rename(operation.backup, operation.target); return "rolled-back"; }
      if (await exists(operation.target)) {
        const current = digest(await folderBlobs(operation.target, true));
        if (current === operation.beforeHash && operation.state === "rolling-back") return "rolled-back";
        if (current === operation.afterHash && await exists(operation.backup) && digest(await folderBlobs(operation.backup, true)) === operation.beforeHash) return "updated";
      }
    } else if (operation.method === "git") {
      const current = await this.git(operation.root, ["rev-parse", "HEAD"]);
      if (current === operation.after) return operation.itemIds.some(id => id.startsWith("mcp-")) ? "pending-restart" : "updated";
      if (current === operation.before && operation.state === "rolling-back") return "rolled-back";
    } else {
      const text = await readConfig(operation.configPath);
      const entry = this.parseConfig(text).servers.find(server => server.name === operation.name);
      if (!entry || digest(entry.launch.command) !== operation.commandHash) return "failed";
      if (entry.launch.args[operation.index] === operation.after) return "pending-restart";
      if (entry.launch.args[operation.index] === operation.before && operation.state === "rolling-back") return "rolled-back";
    }
    return "failed";
  }
}

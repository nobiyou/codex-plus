import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ExtensionUpdateService, readMcpConfig } from "../source/extension-updates.mjs";

const exec = promisify(execFile);
const blob = text => createHash("sha1").update(Buffer.from("blob " + Buffer.byteLength(text) + "\0" + text)).digest("hex");
const json = data => new Response(JSON.stringify(data));
const oldText = "---\nname: example\n---\nOld instructions\n";
const newText = "---\nname: example\n---\nNew instructions\n";
async function fixture(t, options = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "plus-auto-update-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const write = async (file, value) => { const full = path.join(home, file); await fs.mkdir(path.dirname(full), { recursive: true }); await fs.writeFile(full, value); return full; };
  const events = [];
  const service = new ExtensionUpdateService({ home, codexHome: path.join(home, ".codex"), statePath: path.join(home, "plus/state.json"), onState: value => events.push(value), ...options });
  return { home, write, service, events };
}
function skillFetch(url) {
  if (url.includes("/commits?")) return json([]);
  if (url.includes("/commits/")) return json({ sha: "c".repeat(40) });
  if (url.includes("/git/blobs/")) return json({ encoding: "base64", content: Buffer.from(newText).toString("base64") });
  if (url.includes("/git/trees/" + "a".repeat(40))) return json({ sha: "a".repeat(40), tree: [{ path: "SKILL.md", type: "blob", mode: "100644", sha: blob(oldText) }] });
  return json({ sha: "d".repeat(40), tree: [{ path: "skills/example", type: "tree", sha: "b".repeat(40) }, { path: "skills/example/SKILL.md", type: "blob", mode: "100644", sha: blob(newText) }] });
}
async function addSkill(f) {
  const file = await f.write(".agents/skills/example/SKILL.md", oldText);
  await f.write(".agents/.skill-lock.json", JSON.stringify({ version: 3, skills: { example: { sourceType: "github", source: "example/skills", skillPath: "skills/example/SKILL.md", skillFolderHash: "a".repeat(40) } } }));
  return file;
}

test("automatic updates are opt-in; enabling them updates a verified Skill and supports rollback", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  const checked = await f.service.handle({ action: "check" });
  assert.equal(checked.autoUpdate, false);
  assert.equal(await fs.readFile(file, "utf8"), oldText);
  assert.equal(checked.items[0].sourceEvidence, "install-record");
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const updated = await f.service.handle({ action: "check" });
  assert.equal(await fs.readFile(file, "utf8"), newText);
  assert.equal(updated.updateCount, 0);
  assert.equal(updated.items[0].updateState, "updated");
  assert.equal(updated.items.length, 1, "backups must not be discovered as installed Skills");
  assert.equal(f.events.some(event => event.state === "updating"), true);
  const restored = await f.service.handle({ action: "rollback", itemId: updated.items[0].id });
  assert.equal(await fs.readFile(file, "utf8"), oldText);
  assert.equal(restored.items[0].updateState, "rolled-back");
});

test("locally modified Skills are skipped and a guessed source cannot authorize replacement", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.write(".agents/skills/custom/SKILL.md", "---\nname: custom\n---\nMy custom skill\n");
  await fs.writeFile(file, oldText + "My edits\n");
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const result = await f.service.handle({ action: "check" });
  assert.equal(await fs.readFile(file, "utf8"), oldText + "My edits\n");
  assert.equal(result.items.find(item => item.name === "example").updateState, "skipped");
  const custom = result.items.find(item => item.name === "custom");
  await f.service.handle({ action: "source", itemId: custom.id, source: { type: "github", repository: "example/skills", path: "skills/example" } });
  await assert.rejects(f.service.handle({ action: "update", itemId: custom.id }), /基线|安装|更新/);
  assert.match(await fs.readFile(path.join(f.home, ".agents/skills/custom/SKILL.md"), "utf8"), /My custom/);
});

test("a download failure leaves the original Skill intact and marks update failure", async t => {
  const f = await fixture(t, { fetcher: async url => { if (url.includes("/git/blobs/")) throw new Error("offline secret"); return skillFetch(url); } });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const result = await f.service.handle({ action: "check" });
  assert.equal(await fs.readFile(file, "utf8"), oldText);
  assert.equal(result.items[0].updateState, "failed");
  assert.equal(JSON.stringify(result).includes("offline secret"), false);
});

test("rollback refuses to overwrite edits made after a Skill update", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const result = await f.service.handle({ action: "check" });
  await fs.writeFile(file, newText + "Fresh edits\n");
  await assert.rejects(f.service.handle({ action: "rollback", itemId: result.items[0].id }), /修改|变化/);
  assert.equal(await fs.readFile(file, "utf8"), newText + "Fresh edits\n");
});

test("pinned MCP updates preserve secrets and unrelated TOML, and roll back only the changed argument", async t => {
  const f = await fixture(t, { fetcher: async url => url.includes("registry.npmjs.org") ? json({ version: "2.0.0", repository: "https://github.com/example/mcp" }) : json({ body: "New version" }) });
  const config = '# Preserve me\r\n[mcp_servers."name.with.dots"]\r\ncommand = "npx"\r\nargs = [\r\n "-y",\r\n "example-mcp@1.0.0",\r\n "--token", "secret-value"\r\n]\r\n[mcp_servers."name.with.dots".env]\r\nAPI_KEY = "secret-value"\r\n[other]\r\nvalue = "keep"\r\n';
  const file = await f.write(".codex/config.toml", config);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const result = await f.service.handle({ action: "check" });
  const text = await fs.readFile(file, "utf8");
  assert.deepEqual(readMcpConfig(text).servers[0].source, { type: "npm", package: "example-mcp" });
  assert.equal(readMcpConfig(text).servers[0].currentVersion, "2.0.0");
  assert.match(text, /\[other\]\r\nvalue = "keep"/);
  assert.match(text, /API_KEY = "secret-value"/);
  assert.equal(result.items[0].updateState, "pending-restart");
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
  const saved = await fs.readFile(path.join(f.home, "plus/state.json"), "utf8");
  assert.equal(saved.includes("secret-value"), false, "history retains only the changed package argument, not credentials");
  await f.service.handle({ action: "rollback", itemId: result.items[0].id });
  assert.equal(readMcpConfig(await fs.readFile(file, "utf8")).servers[0].currentVersion, "1.0.0");
});

test("unsafe upstream paths and tampered blobs never replace a Skill", async t => {
  for (const tamper of ["path", "blob"]) {
    const f = await fixture(t, { fetcher: async url => {
      if (tamper === "blob" && url.includes("/git/blobs/")) return json({ encoding: "base64", content: Buffer.from("wrong").toString("base64") });
      if (tamper === "path" && /\/git\/trees\/(HEAD|c{40})/.test(url)) return json({ sha: "d".repeat(40), tree: [{ path: "skills/example", type: "tree", sha: "b".repeat(40) }, { path: "skills/example/../outside", type: "blob", mode: "100644", sha: blob(newText) }] });
      return skillFetch(url);
    } });
    const file = await addSkill(f);
    await f.service.handle({ action: "preferences", autoUpdate: true });
    const result = await f.service.handle({ action: "check" });
    assert.equal(await fs.readFile(file, "utf8"), oldText);
    assert.equal(result.items[0].updateState, "failed");
  }
});

test("a shared Git repository is updated once and dirty files outside the Skill also block updates", async t => {
  let fetches = 0, target;
  const f = await fixture(t, { fetcher: async url => url.includes("/commits?") ? json([]) : url.includes("/commits/") ? json({ sha: target }) : url.includes("/compare/") ? json({ status: "ahead" }) : json({ sha: "d".repeat(40), tree: [{ path: "skills/a", type: "tree", sha: "a".repeat(40) }, { path: "skills/b", type: "tree", sha: "b".repeat(40) }] }), updateExecutor: async (file, args, options) => { if (args.includes("fetch")) { fetches++; return { stdout: "", stderr: "" }; } return exec(file, args, options); } });
  const root = path.join(f.home, ".agents/skills/repo");
  const run = args => exec("git", ["-C", root, ...args], { windowsHide: true });
  await f.write(".agents/skills/repo/skills/a/SKILL.md", "---\nname: a\n---\nOld\n");
  await f.write(".agents/skills/repo/skills/b/SKILL.md", "---\nname: b\n---\nOld\n");
  await f.write(".agents/skills/repo/removed.txt", "Old tracked file\n");
  await run(["init", "-b", "main"]); await run(["config", "user.name", "Fixture"]); await run(["config", "user.email", "fixture@example.invalid"]);
  await run(["remote", "add", "origin", "https://github.com/example/shared.git"]); await run(["add", "."]); await run(["commit", "-m", "old"]);
  const before = (await run(["rev-parse", "HEAD"])).stdout.trim();
  await f.write(".agents/skills/repo/skills/a/SKILL.md", "---\nname: a\n---\nNew\n");
  await fs.unlink(path.join(root, "removed.txt"));
  await f.write(".agents/skills/repo/.gitignore", "removed.txt\n");
  await run(["add", "."]); await run(["commit", "-m", "new"]); target = (await run(["rev-parse", "HEAD"])).stdout.trim();
  await run(["reset", "--keep", before]);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  await f.write(".agents/skills/repo/notes.txt", "User edits outside the Skill\n");
  const skipped = await f.service.handle({ action: "check" });
  assert.equal(skipped.items.every(item => item.updateState === "skipped"), true);
  assert.equal((await run(["rev-parse", "HEAD"])).stdout.trim(), before);
  await fs.unlink(path.join(root, "notes.txt"));
  const updated = await f.service.handle({ action: "check" });
  assert.equal(fetches, 1, JSON.stringify(updated.items.map(({ updateState, updateError }) => ({ updateState, updateError }))));
  assert.equal((await run(["rev-parse", "HEAD"])).stdout.trim(), target);
  assert.equal(updated.items.every(item => item.updateState === "updated"), true);
  await f.write(".agents/skills/repo/removed.txt", "User ignored file\n");
  await assert.rejects(f.service.handle({ action: "rollback", itemId: updated.items[0].id }), /忽略文件/);
  assert.equal(await fs.readFile(path.join(root, "removed.txt"), "utf8"), "User ignored file\n");
  await fs.unlink(path.join(root, "removed.txt"));
  await f.service.handle({ action: "rollback", itemId: updated.items[0].id });
  assert.equal((await run(["rev-parse", "HEAD"])).stdout.trim(), before);
});

async function cachedMcp(t, { dirty = false, fileCount = 0, duringInstall = () => {} } = {}) {
  let latest = "2.0.0", installs = 0;
  const manifest = version => JSON.stringify({ name: "example-mcp", version, repository: "https://github.com/example/mcp" });
  const f = await fixture(t, { npmCli: "fixture-npm-cli.js", fetcher: async url => url.includes("registry.npmjs.org") ? json({ version: latest, repository: "https://github.com/example/mcp" }) : json({ body: "New release" }), updateExecutor: async (command, args) => {
    assert.equal(command, process.execPath);
    assert.equal(args[0], "fixture-npm-cli.js");
    assert.equal(args.includes("--ignore-scripts"), true);
    assert.equal(args.includes("--registry=https://registry.npmjs.org"), true);
    const directory = args[args.indexOf("--prefix") + 1], version = args.at(-1).split("@").at(-1);
    const root = path.join(directory, "node_modules/example-mcp");
    await fs.mkdir(path.join(root, "scripts"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), manifest(version));
    await fs.writeFile(path.join(root, "scripts/start.mjs"), "// " + version + "\n");
    if (fileCount) {
      await fs.mkdir(path.join(root, "dist"), { recursive: true });
      await Promise.all(Array.from({ length: fileCount }, (_, i) => fs.writeFile(path.join(root, "dist", i + ".js"), "// packaged file " + i + "\n")));
    }
    installs++; await duringInstall(f, version);
    return { stdout: "", stderr: "" };
  } });
  const entry = await f.write("cache/_npx/fixture/node_modules/example-mcp/scripts/start.mjs", "// 1.0.0\n" + (dirty ? "// My edits\n" : ""));
  await f.write("cache/_npx/fixture/node_modules/example-mcp/package.json", manifest("1.0.0"));
  if (fileCount) {
    const directory = path.join(path.dirname(path.dirname(entry)), "dist");
    await fs.mkdir(directory, { recursive: true });
    await Promise.all(Array.from({ length: fileCount }, (_, i) => fs.writeFile(path.join(directory, i + ".js"), "// packaged file " + i + "\n")));
  }
  const config = await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="node"\nargs=[' + JSON.stringify(entry) + ', "--token", "secret-value"]\n');
  return { ...f, entry, config, installs: () => installs, next: value => { latest = value; } };
}

test("npm-cache updates install separately, retain the old cache, remain updateable and roll back", async t => {
  const f = await cachedMcp(t);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const first = await f.service.handle({ action: "check" });
  const args = readMcpConfig(await fs.readFile(f.config, "utf8")).servers[0].launch.args;
  assert.notEqual(args[0], f.entry);
  assert.equal(await fs.readFile(f.entry, "utf8"), "// 1.0.0\n");
  assert.equal(await fs.readFile(args[0], "utf8"), "// 2.0.0\n");
  assert.equal(first.items[0].updateSupported, true);
  assert.equal(first.items[0].updateState, "pending-restart");
  assert.equal(JSON.stringify(first).includes("secret-value"), false);
  f.next("3.0.0");
  const second = await f.service.handle({ action: "check" });
  assert.equal(second.items[0].currentVersion, "3.0.0");
  assert.equal(f.installs(), 4, "both original and new package contents are verified per update");
  await f.service.handle({ action: "rollback", itemId: second.items[0].id });
  assert.equal(readMcpConfig(await fs.readFile(f.config, "utf8")).servers[0].launch.args[0], args[0]);
  const restarted = new ExtensionUpdateService({ home: f.home, codexHome: path.join(f.home, ".codex"), statePath: path.join(f.home, "plus/state.json") });
  assert.equal((await restarted.handle({ action: "list" })).items[0].updateSupported, true);
});

test("npm packages larger than the Skill comparison budget still update and roll back", async t => {
  const f = await cachedMcp(t, { fileCount: 1057 });
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const updated = await f.service.handle({ action: "check" });
  assert.equal(updated.items[0].updateState, "pending-restart", updated.items[0].updateError);
  assert.equal(updated.items[0].currentVersion, "2.0.0");
  await f.service.handle({ action: "rollback", itemId: updated.items[0].id });
  assert.equal(readMcpConfig(await fs.readFile(f.config, "utf8")).servers[0].launch.args[0], f.entry);
  assert.equal(await fs.readFile(f.entry, "utf8"), "// 1.0.0\n");
});

test("Skill directories still obey their smaller comparison budget", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await Promise.all(Array.from({ length: 512 }, (_, i) => f.write(".agents/skills/example/" + i + ".txt", "Local file\n")));
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const skipped = await f.service.handle({ action: "check" });
  assert.equal(skipped.items[0].updateState, "skipped");
  assert.match(skipped.items[0].updateError, /Skill.*512/);
  assert.equal(await fs.readFile(file, "utf8"), oldText);
  assert.equal((await fs.readdir(path.dirname(file))).length, 513);
});

test("npm install failures identify the stage and code without leaking stderr credentials", async t => {
  for (const { version, code, killed, expected } of [
    { version: "1.0.0", code: "EACCES", expected: /原版本.*EACCES/ },
    { version: "2.0.0", code: "E404", expected: /新版.*E404/ },
    { version: "2.0.0", killed: true, expected: /新版.*TIMEOUT/ },
  ]) {
    const f = await cachedMcp(t);
    const install = f.service.updater.executor;
    f.service.updater.executor = async (command, args, options) => {
      if (!args.at(-1).endsWith("@" + version)) return install(command, args, options);
      const error = new Error("npm failed with private arguments");
      error.stderr = (code ? "npm error code " + code + "\n" : "") + "npm error url https://token-secret@example.invalid\n";
      error.killed = killed;
      throw error;
    };
    await f.service.handle({ action: "preferences", autoUpdate: true });
    const failed = await f.service.handle({ action: "check" });
    assert.match(failed.items[0].updateError, expected);
    assert.equal(JSON.stringify(failed).includes("token-secret"), false);
    assert.equal(JSON.stringify(failed).includes("private arguments"), false);
    assert.equal(readMcpConfig(await fs.readFile(f.config, "utf8")).servers[0].launch.args[0], f.entry);
    const packages = await fs.readdir(path.join(f.home, "plus/mcp-packages")).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    assert.deepEqual(packages, []);
  }
});

test("modified npm packages and config changes during installation are preserved", async t => {
  const dirty = await cachedMcp(t, { dirty: true, fileCount: 1057 });
  await dirty.service.handle({ action: "preferences", autoUpdate: true });
  const skipped = await dirty.service.handle({ action: "check" });
  assert.equal(skipped.items[0].updateState, "skipped");
  assert.match(skipped.items[0].updateError, /本地修改/);
  assert.equal(readMcpConfig(await fs.readFile(dirty.config, "utf8")).servers[0].launch.args[0], dirty.entry);
  const changed = await cachedMcp(t, { duringInstall: async (f, version) => { if (version === "2.0.0") await fs.appendFile(path.join(f.home, ".codex/config.toml"), "\n# Changed while downloading\n"); } });
  await changed.service.handle({ action: "preferences", autoUpdate: true });
  await changed.service.handle({ action: "check" });
  const config = await fs.readFile(changed.config, "utf8");
  assert.match(config, /Changed while downloading/);
  assert.equal(readMcpConfig(config).servers[0].launch.args[0], changed.entry);
  assert.deepEqual(await fs.readdir(path.join(changed.home, "plus/mcp-packages")), []);
});

test("completed updates with an interrupted final journal recover after restart", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  await f.service.handle({ action: "check" });
  const stateFile = path.join(f.home, "plus/state.json");
  const saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
  saved.history.at(-1).state = "prepared";
  await fs.writeFile(stateFile, JSON.stringify(saved));
  const restarted = new ExtensionUpdateService({ home: f.home, codexHome: path.join(f.home, ".codex"), statePath: stateFile });
  const result = await restarted.handle({ action: "list" });
  assert.equal(await fs.readFile(file, "utf8"), newText);
  assert.equal(result.items[0].updateState, "updated");
  assert.equal(result.items[0].canRollback, true);
});

test("interrupted Skill rollback restores the verified backup without network access", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  await f.service.handle({ action: "check" });
  const stateFile = path.join(f.home, "plus/state.json");
  const saved = JSON.parse(await fs.readFile(stateFile, "utf8")), operation = saved.history.at(-1);
  operation.state = "rolling-back";
  await fs.rename(operation.target, path.join(path.dirname(operation.backup), "replaced"));
  await fs.writeFile(stateFile, JSON.stringify(saved));
  const restarted = new ExtensionUpdateService({ home: f.home, codexHome: path.join(f.home, ".codex"), statePath: stateFile, fetcher: async () => { throw new Error("must not connect"); } });
  const result = await restarted.handle({ action: "list" });
  assert.equal(await fs.readFile(file, "utf8"), oldText);
  assert.equal(result.items[0].updateState, "rolled-back");
});

test("tampered journal paths are rejected before recovery can touch files", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  await f.service.handle({ action: "check" });
  const stateFile = path.join(f.home, "plus/state.json"), saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
  saved.history.at(-1).state = "prepared";
  saved.history.at(-1).backup = path.join(f.home, "unrelated");
  await fs.writeFile(stateFile, JSON.stringify(saved));
  const restarted = new ExtensionUpdateService({ home: f.home, codexHome: path.join(f.home, ".codex"), statePath: stateFile });
  await assert.rejects(restarted.handle({ action: "list" }), /历史格式/);
  assert.equal(await fs.readFile(file, "utf8"), newText);
});

test("saving failure after replacement retains a durable recoverable journal and backup", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const persist = f.service.persist.bind(f.service);
  f.service.persist = async () => { if (f.service.saved.history.some(entry => entry.state === "updated")) throw new Error("fixture permission failure"); return persist(); };
  await assert.rejects(f.service.handle({ action: "check" }), /permission/);
  assert.equal(await fs.readFile(file, "utf8"), newText);
  const stateFile = path.join(f.home, "plus/state.json");
  assert.equal(JSON.parse(await fs.readFile(stateFile, "utf8")).history.at(-1).state, "prepared");
  const restarted = new ExtensionUpdateService({ home: f.home, codexHome: path.join(f.home, ".codex"), statePath: stateFile });
  const recovered = await restarted.handle({ action: "list" });
  await restarted.handle({ action: "rollback", itemId: recovered.items[0].id });
  assert.equal(await fs.readFile(file, "utf8"), oldText);
});

test("duplicate checks share one update transaction and reject setting changes while running", async t => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; }), atDownload = new Promise(resolve => { started = resolve; });
  let downloads = 0;
  const f = await fixture(t, { fetcher: async url => { if (url.includes("/git/blobs/")) { downloads++; started(); await gate; } return skillFetch(url); } });
  await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const first = f.service.handle({ action: "check" });
  await atDownload;
  const duplicate = f.service.handle({ action: "check" });
  await assert.rejects(f.service.handle({ action: "preferences", autoUpdate: false }), /正在进行/);
  release(); await Promise.all([first, duplicate]);
  assert.equal(downloads, 1);
  assert.equal(f.service.saved.history.filter(entry => entry.state === "updated").length, 1);
});

test("Skill changes after the prepared journal still prevent replacement", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  await f.service.handle({ action: "preferences", autoUpdate: true });
  const persist = f.service.persist.bind(f.service);
  let changed = false;
  f.service.persist = async () => {
    await persist();
    if (!changed && f.service.saved.history.at(-1)?.state === "prepared") { changed = true; await fs.writeFile(file, oldText + "Edits made while saving\n"); }
  };
  const result = await f.service.handle({ action: "check" });
  assert.equal(result.items[0].updateState, "skipped");
  assert.equal(await fs.readFile(file, "utf8"), oldText + "Edits made while saving\n");
});

test("cached check output cannot inject new installation paths or launcher arguments", async t => {
  const f = await fixture(t, { fetcher: async url => skillFetch(url) });
  const file = await addSkill(f);
  const checked = await f.service.handle({ action: "check" });
  const id = checked.items[0].id;
  Object.assign(f.service.saved.cache[id].result, { location: path.join(f.home, "unrelated"), installation: { type: "git", root: f.home }, launch: { args: ["credential-secret"] } });
  const listed = await f.service.handle({ action: "list" });
  assert.equal(listed.items[0].location, path.dirname(file));
  assert.equal(JSON.stringify(listed).includes("credential-secret"), false);
  await f.service.handle({ action: "update", itemId: id });
  assert.equal(await fs.readFile(file, "utf8"), newText);
});

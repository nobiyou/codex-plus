import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ExtensionUpdateService, readMcpConfig, normalizeSource, compareVersions } from "../source/extension-updates.mjs";

async function fixture(t, fetcher) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-extension-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const write = async (relative, text) => {
    const target = path.join(home, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
    return target;
  };
  const events = [];
  const service = new ExtensionUpdateService({ home, codexHome: path.join(home, ".codex"), statePath: path.join(home, "plus", "updates.json"), fetcher, onState: value => events.push(value) });
  return { home, write, service, events };
}
const response = data => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

test("MCP discovery reads quoted names and multiline arguments without exposing credentials", () => {
  const config = readMcpConfig(`
[mcp_servers."test.with.dots"]
command = 'npx'
args = [
  '-y', # comment
  '@example/server@1.2.3',
  '--token', 'secret-value'
]
[mcp_servers."test.with.dots".env]
API_KEY = "secret-value"
[mcp_servers.remote]
url = "https://example.org/mcp?token=secret-value"
http_headers = { Authorization = "Bearer secret-value" }
[mcp_servers.disabled]
command = "uvx"
args = ["example-mcp==2.1.0"]
enabled = false
`);
  assert.equal(config.servers.length, 3);
  assert.equal(config.servers[0].name, "test.with.dots");
  assert.deepEqual(config.servers[0].source, { type: "npm", package: "@example/server" });
  assert.equal(config.servers[0].currentVersion, "1.2.3");
  assert.equal(config.servers[1].managed, "remote");
  assert.equal(config.servers[2].enabled, false);
  assert.equal(JSON.stringify(config).includes("secret-value"), false);
});

test("dynamic package launchers keep unknown local versions and unsupported syntax is reported", () => {
  const config = readMcpConfig('[mcp_servers.a]\ncommand="npx"\nargs=["-y","example-mcp@latest"]\n[mcp_servers.b]\ncommand="uv"\nargs=["tool","run","example-mcp"]\n');
  assert.equal(config.servers[0].currentVersion, "");
  assert.equal(config.servers[1].source.type, "pypi");
  assert.equal(config.servers[1].currentVersion, "");
  assert.throws(() => readMcpConfig('[mcp_servers.a]\nargs = ["unfinished"'), /配置|TOML/);
  assert.throws(() => readMcpConfig('[mcp_servers]\na={command="npx",args=["pkg"]}'), /内联/);
  assert.equal(readMcpConfig('[mcp_servers.a]\ncommand="npx"\nargs=["private-mcp","--registry=https://private.example"]\n').servers[0].source, null);
});

test("update sources reject credentials, path escapes, arbitrary hosts and shell strings", () => {
  assert.deepEqual(normalizeSource({ type: "github", repository: "https://github.com/owner/repo.git", path: "skills/example/SKILL.md" }), { type: "github", repository: "owner/repo", path: "skills/example", ref: "HEAD" });
  for (const repository of ["https://token@github.com/owner/repo", "https://github.com/owner/repo?token=abc", "http://localhost/private", "https://evil.example/owner/repo", "owner/repo;calc"]) {
    assert.throws(() => normalizeSource({ type: "github", repository }), /来源|仓库/);
  }
  assert.throws(() => normalizeSource({ type: "github", repository: "owner/repo", path: "../secret" }), /目录/);
  assert.throws(() => normalizeSource({ type: "npm", package: "package;calc" }), /包名/);
});

test("version comparison respects numeric versions, prereleases, and unknown formats", () => {
  assert.equal(compareVersions("1.9.0", "1.10.0"), -1);
  assert.equal(compareVersions("2.0.0", "2.0.0-rc.1"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("dev", "1.0.0"), null);
});

test("a directly launched package uses its installed manifest and surfaces exact release notes", async t => {
  const f = await fixture(t, async url => {
    if (url.includes("registry.npmjs.org")) return response({ version: "6.4.0", repository: { url: "git+https://github.com/example/server.git" } });
    if (url.includes("releases/tags/v6.4.0")) return response({ body: "New tools and fixes", html_url: "https://github.com/example/server/releases/tag/v6.4.0" });
    throw new Error("Unexpected request " + url);
  });
  const script = await f.write("cache/node_modules/example-mcp/scripts/main.mjs", "// fixture");
  await f.write("cache/node_modules/example-mcp/package.json", JSON.stringify({ name: "example-mcp", version: "6.3.0" }));
  await f.write(".codex/config.toml", `[mcp_servers.example]\ncommand="node"\nargs=[${JSON.stringify(script.replaceAll("\\", "/"))}]\n`);
  const result = await f.service.handle({ action: "check" });
  const item = result.items.find(item => item.kind === "mcp");
  assert.equal(item.currentVersion, "6.3.0");
  assert.equal(item.status, "available");
  assert.equal(item.latestVersion, "6.4.0");
  assert.match(item.notes, /New tools and fixes/);
  assert.equal(item.upstreamRepository, "example/server");
  assert.equal(item.updateUrl, "https://github.com/example/server/releases/tag/v6.4.0");
  assert.equal(result.updateCount, 1);
  assert.equal(f.events.some(event => event.state === "checking"), true);
});

test("client-owned components are excluded before source overrides, cache restoration and checks", async t => {
  const requests = [];
  const f = await fixture(t, async url => {
    requests.push(url);
    if (url.includes("registry.npmjs.org")) return response({ version: "1.0.0" });
    if (url.includes("git/trees")) return response({ sha: "a".repeat(40), tree: [{ path: "skills/custom", type: "tree", sha: "b".repeat(40) }] });
    return response([]);
  });
  const bundled = await f.write("Codex/resources/node_repl.exe", "fixture");
  const configPath = await f.write(".codex/config.toml", `[mcp_servers.bundled]\ncommand=${JSON.stringify(bundled.replaceAll("\\", "/"))}\n[mcp_servers.node_repl]\ncommand="npx"\nargs=["third-party-mcp@1.0.0"]\n`);
  const systemSkill = await f.write(".codex/skills/.system/helper/SKILL.md", "---\nname: built-in\n---\n");
  await f.write(".agents/skills/custom/SKILL.md", "---\nname: custom\n---\n");
  await f.write(".agents/.skill-lock.json", JSON.stringify({ version: 3, skills: { custom: { sourceType: "github", source: "openai/skills", skillPath: "skills/custom/SKILL.md", skillFolderHash: "b".repeat(40) } } }));
  for (const marketplace of ["openai-bundled", "openai-primary-runtime", "openai-curated-remote", "openai-curated"]) {
    await f.write(`.codex/plugins/cache/${marketplace}/helper/1.0.0/skills/helper/SKILL.md`, "---\nname: plugin-helper\n---\n");
  }
  const alias = path.join(f.home, ".agents/skills/built-in-alias");
  await fs.symlink(path.dirname(systemSkill), alias, "junction");
  await fs.symlink(path.join(f.home, ".codex/plugins/cache/openai-bundled/helper/1.0.0/skills/helper"), path.join(f.home, ".agents/skills/plugin-alias"), "junction");
  const excludedId = "mcp-" + createHash("sha256").update(configPath + ":bundled").digest("hex").slice(0, 24);
  const excludedSkillId = "skill-" + createHash("sha256").update(await fs.realpath(path.dirname(systemSkill))).digest("hex").slice(0, 24);
  await f.write("plus/updates.json", JSON.stringify({ schemaVersion: 1, autoCheck: true, lastCheckedAt: new Date().toISOString(), sources: Object.fromEntries([excludedId, excludedSkillId].map(id => [id, { source: { type: "github", repository: "example/client" } }])), cache: Object.fromEntries([excludedId, excludedSkillId].map(id => [id, { result: { status: "available" } }])) }));
  await f.service.maybeCheck();
  assert.deepEqual(f.events.at(-1).items.map(item => item.name).sort(), ["custom", "node_repl"]);
  assert.equal(f.events.at(-1).updateCount, 0);
  assert.equal(requests.length, 0);
  const checked = await f.service.handle({ action: "check" });
  assert.deepEqual(checked.items.map(item => item.name).sort(), ["custom", "node_repl"]);
  assert.equal(checked.updateCount, 0);
  assert.equal(requests.some(url => url.includes("example/client")), false);
  assert.equal(requests.some(url => url.includes("openai/skills")), true, "a user-installed open source project is not excluded by its GitHub owner");
  assert.equal(requests.some(url => url.includes("third-party-mcp")), true, "a third-party MCP with the same name as a built-in remains checkable");
  const saved = JSON.parse(await fs.readFile(path.join(f.home, "plus/updates.json"), "utf8"));
  assert.equal(excludedId in saved.cache, false);
  assert.equal(excludedSkillId in saved.cache, false);
  await assert.rejects(f.service.handle({ action: "source", itemId: excludedId, source: { type: "github", repository: "example/client" } }), /项目/);
  assert.equal(f.events.every(event => event.items.every(item => ![excludedId, excludedSkillId].includes(item.id))), true);
});

test("installed MCP manifests expose GitHub provenance and missing releases keep a GitHub entry", async t => {
  const f = await fixture(t, async url => url.includes("registry.npmjs.org") ? response({ version: "2.0.0" }) : new Response("{}", { status: 404 }));
  const script = await f.write("cache/node_modules/project-mcp/scripts/main.mjs", "// fixture");
  await f.write("cache/node_modules/project-mcp/package.json", JSON.stringify({ name: "project-mcp", version: "1.0.0", repository: { url: "git+https://github.com/example/project.git" } }));
  await f.write(".codex/config.toml", `[mcp_servers.project]\ncommand="node"\nargs=[${JSON.stringify(script.replaceAll("\\", "/"))}]\n`);
  assert.equal((await f.service.handle({ action: "list" })).items[0].upstreamRepository, "example/project");
  const item = (await f.service.handle({ action: "check" })).items[0];
  assert.equal(item.status, "available");
  assert.equal(item.upstreamRepository, "example/project");
  assert.equal(item.updateUrl, "https://github.com/example/project/releases");
  assert.match(item.notes, /未提供/);
  // A manually selected package must not inherit the old package's repository.
  await f.service.handle({ action: "source", itemId: item.id, source: { type: "npm", package: "another-project" } });
  const changed = (await f.service.handle({ action: "check" })).items[0];
  assert.equal(changed.upstreamRepository, "");
  assert.match(changed.updateUrl, /npmjs.com\/package\/another-project/);
});

test("PyPI MCPs use their GitHub project and version release even without a release body", async t => {
  const f = await fixture(t, async url => {
    if (url.includes("pypi.org")) return response({ info: { version: "2.0.0", project_urls: { Repository: "https://github.com/example/python-mcp" } } });
    if (url.includes("/tags/v")) return new Response("{}", { status: 404 });
    return response({ body: "" });
  });
  await f.write(".codex/config.toml", '[mcp_servers.python]\ncommand="uvx"\nargs=["python-mcp==1.0.0"]\n');
  const item = (await f.service.handle({ action: "check" })).items[0];
  assert.equal(item.status, "available");
  assert.equal(item.upstreamRepository, "example/python-mcp");
  assert.equal(item.updateUrl, "https://github.com/example/python-mcp/releases/tag/2.0.0");
  assert.match(item.notes, /未提供/);
});

test("GitHub MCP checkouts compare the full project even when they contain a package manifest", async t => {
  const requests = [];
  const f = await fixture(t, async url => {
    requests.push(url);
    if (url.includes("git/trees")) return response({ sha: "a".repeat(40), tree: [{ path: "scripts", type: "tree", sha: "b".repeat(40) }] });
    if (url.includes("/compare/")) return response({ status: "ahead" });
    return response([{ commit: { message: "Update project dependencies" } }]);
  });
  const script = await f.write("projects/github-mcp/scripts/main.mjs", "// fixture");
  await f.write("projects/github-mcp/package.json", JSON.stringify({ name: "unpublished-mcp", version: "1.0.0" }));
  const directory = path.join(f.home, "projects/github-mcp");
  const git = promisify(execFile);
  const run = args => git("git", ["-C", directory, ...args], { windowsHide: true });
  await run(["init"]);
  await run(["config", "user.name", "Fixture"]);
  await run(["config", "user.email", "fixture@example.invalid"]);
  await run(["remote", "add", "origin", "https://github.com/example/github-mcp.git"]);
  await run(["add", "."]);
  await run(["commit", "-m", "fixture"]);
  await f.write(".codex/config.toml", `[mcp_servers.github]\ncommand="node"\nargs=[${JSON.stringify(script.replaceAll("\\", "/"))}]\n`);
  const item = (await f.service.handle({ action: "check" })).items[0];
  assert.deepEqual(item.source, { type: "github", repository: "example/github-mcp", path: "", ref: "HEAD" });
  assert.equal(item.status, "available");
  assert.equal(requests.some(url => url.includes("registry.npmjs.org")), false);
  assert.equal(item.updateUrl, "https://github.com/example/github-mcp/commits/HEAD");
});

test("unpinned launchers show upstream versions without claiming the installed version is outdated", async t => {
  const f = await fixture(t, async () => response({ version: "2.0.0" }));
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@latest"]\n');
  const result = await f.service.handle({ action: "check" });
  assert.equal(result.items[0].status, "unknown-version");
  assert.equal(result.items[0].latestVersion, "2.0.0");
  assert.equal(result.updateCount, 0);
});

test("Skill updates compare the installed folder tree rather than unrelated repository changes", async t => {
  const f = await fixture(t, async url => {
    if (url.includes("git/trees")) return response({ sha: "c".repeat(40), tree: [{ path: "skills/example", type: "tree", sha: "a".repeat(40) }] });
    if (url.includes("commits?")) return response([{ commit: { message: "Improve instructions\n\nDetail" }, html_url: "https://github.com/example/skills/commit/123" }]);
    throw new Error("Unexpected request " + url);
  });
  await f.write(".agents/skills/example/SKILL.md", "---\nname: example\ndescription: Fixture\n---\n");
  await f.write(".agents/.skill-lock.json", JSON.stringify({ version: 3, skills: { example: { sourceType: "github", source: "example/skills", skillPath: "skills/example/SKILL.md", skillFolderHash: "a".repeat(40) } } }));
  const result = await f.service.handle({ action: "check" });
  assert.equal(result.items[0].status, "current");
  assert.equal(result.updateCount, 0);
});

test("offline rechecks retain the last known result but never count it as a fresh update", async t => {
  let offline = false;
  const f = await fixture(t, async () => { if (offline) throw new Error("network failed secret-value"); return response({ version: "2.0.0" }); });
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@1.0.0"]\n');
  await f.service.handle({ action: "check" });
  offline = true;
  const result = await f.service.handle({ action: "check" });
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].previousStatus, "available");
  assert.equal(result.items[0].latestVersion, "2.0.0");
  assert.equal(result.updateCount, 0);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("daily checks are opt-in, persisted, limited to once a day, and coalesce concurrent checks", async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return response({ version: "1.0.0" }); });
  const original = '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@1.0.0"]\n';
  await f.write(".codex/config.toml", original);
  assert.equal(await f.service.maybeCheck(), null);
  assert.equal(calls, 0);
  await f.service.handle({ action: "preferences", autoCheck: true });
  await Promise.all([f.service.maybeCheck(), f.service.maybeCheck()]);
  assert.equal(calls, 1);
  assert.equal(await f.service.maybeCheck(), null);
  assert.equal(await fs.readFile(path.join(f.home, ".codex/config.toml"), "utf8"), original);
  const saved = JSON.parse(await fs.readFile(path.join(f.home, "plus/updates.json"), "utf8"));
  assert.equal(saved.autoCheck, true);
});

test("source overrides bind only to discovered items and stale cache is invalidated after local changes", async t => {
  const f = await fixture(t, async () => response({ version: "2.0.0" }));
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@1.0.0"]\n');
  const checked = await f.service.handle({ action: "check" });
  assert.equal(checked.items[0].status, "available");
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@2.0.0"]\n');
  const listed = await f.service.handle({ action: "list" });
  assert.equal(listed.items[0].status, "unchecked");
  assert.equal(listed.updateCount, 0);
  await assert.rejects(f.service.handle({ action: "source", itemId: "../../config.toml", source: { type: "npm", package: "anything" } }), /项目|扩展/);
});

test("corrupt state is reported without replacing the user's saved source mappings", async t => {
  const f = await fixture(t, async () => response({ version: "1.0.0" }));
  await f.write("plus/updates.json", "{broken");
  await assert.rejects(f.service.handle({ action: "preferences", autoCheck: true }), /状态|损坏/);
  assert.equal(await fs.readFile(path.join(f.home, "plus/updates.json"), "utf8"), "{broken");
});

test("manually linked Skills can establish a content baseline and detect later upstream changes", async t => {
  const content = "---\nname: local\ndescription: fixture\n---\n";
  const blob = createHash("sha1").update(Buffer.concat([Buffer.from("blob " + Buffer.byteLength(content) + "\0"), Buffer.from(content)])).digest("hex");
  let latest = "a".repeat(40), changedBlob = blob;
  const f = await fixture(t, async url => url.includes("git/trees") ? response({ sha: latest, tree: [{ path: "SKILL.md", type: "blob", sha: changedBlob }] }) : response([]));
  await f.write(".agents/skills/local/SKILL.md", content);
  const list = await f.service.handle({ action: "list" });
  await f.service.handle({ action: "source", itemId: list.items[0].id, source: { type: "github", repository: "example/local" } });
  const first = await f.service.handle({ action: "check" });
  assert.equal(first.items[0].status, "current");
  latest = "b".repeat(40); changedBlob = "c".repeat(40);
  const next = await f.service.handle({ action: "check" });
  assert.equal(next.items[0].status, "available");
  await f.write(".agents/skills/local/SKILL.md", content + "My changes\n");
  const edited = await f.service.handle({ action: "check" });
  assert.equal(edited.items[0].status, "different");
  assert.equal(edited.updateCount, 0);
});

test("a manual association never mistakes local edits for a newer upstream version", async t => {
  const f = await fixture(t, async url => url.includes("git/trees") ? response({ sha: "a".repeat(40), tree: [{ path: "SKILL.md", type: "blob", sha: "b".repeat(40) }] }) : response([]));
  await f.write(".agents/skills/local/SKILL.md", "---\nname: local\ndescription: custom\n---\n");
  const list = await f.service.handle({ action: "list" });
  await f.service.handle({ action: "source", itemId: list.items[0].id, source: { type: "github", repository: "example/local" } });
  const result = await f.service.handle({ action: "check" });
  assert.equal(result.items[0].status, "different");
  assert.equal(result.updateCount, 0);
});

test("a successful retry clears stale errors while keeping the last success during failure", async t => {
  let offline = false;
  const f = await fixture(t, async () => { if (offline) throw new Error("offline"); return response({ version: "2.0.0" }); });
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@1.0.0"]\n');
  await f.service.handle({ action: "check" });
  offline = true;
  await f.service.handle({ action: "check" });
  const failedAgain = await f.service.handle({ action: "check" });
  assert.equal(failedAgain.items[0].previousStatus, "available");
  offline = false;
  const recovered = await f.service.handle({ action: "check" });
  assert.equal(recovered.items[0].status, "available");
  assert.equal(recovered.items[0].error, "");
});

test("an enabled daily check restores persisted reminders after restart without another network request", async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return response({ version: "2.0.0" }); });
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@1.0.0"]\n');
  await f.service.handle({ action: "preferences", autoCheck: true });
  await f.service.handle({ action: "check" });
  const events = [];
  const restarted = new ExtensionUpdateService({ home: f.home, codexHome: path.join(f.home, ".codex"), statePath: path.join(f.home, "plus/updates.json"), fetcher: async () => { throw new Error("unexpected request"); }, onState: value => events.push(value) });
  assert.equal(await restarted.maybeCheck(), null);
  assert.equal(events.at(-1).updateCount, 1);
  assert.equal(calls, 1);
});

test("Git checkouts ahead of upstream do not get a false update notification", async t => {
  const f = await fixture(t, async url => url.includes("git/trees") ? response({ sha: "a".repeat(40), tree: [{ path: "skills/example", type: "tree", sha: "b".repeat(40) }] }) : url.includes("/compare/") ? response({ status: "behind" }) : response([]));
  const directory = path.join(f.home, ".agents/skills/repo");
  await f.write(".agents/skills/repo/skills/example/SKILL.md", "---\nname: example\ndescription: fixture\n---\n");
  const git = promisify(execFile);
  const run = args => git("git", ["-C", directory, ...args], { windowsHide: true });
  await run(["init"]);
  await run(["config", "user.name", "Fixture"]);
  await run(["config", "user.email", "fixture@example.invalid"]);
  await run(["remote", "add", "origin", "https://github.com/example/skills.git"]);
  await run(["add", "skills"]);
  await run(["commit", "-m", "fixture"]);
  const result = await f.service.handle({ action: "check" });
  assert.equal(result.items[0].status, "ahead");
  assert.equal(result.updateCount, 0);
});

test("daily scheduling checks again only after a full day", async t => {
  let calls = 0, clock = Date.UTC(2026, 9, 14);
  const f = await fixture(t, async () => { calls++; return response({ version: "1.0.0" }); });
  f.service.now = () => clock;
  await f.write(".codex/config.toml", '[mcp_servers.example]\ncommand="npx"\nargs=["example-mcp@1.0.0"]\n');
  await f.service.handle({ action: "preferences", autoCheck: true });
  await f.service.maybeCheck();
  clock += 86400000 - 1;
  assert.equal(await f.service.maybeCheck(), null);
  assert.equal(calls, 1);
  clock++;
  await f.service.maybeCheck();
  assert.equal(calls, 2);
});

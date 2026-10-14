import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { createExtensionUpdatesUI } from "../source/extension-updates-ui.mjs";

const injectorUrl = new URL("../source/injector.mjs", import.meta.url);
const source = await fs.readFile(injectorUrl, "utf8");
const releaseVersion = (await fs.readFile(new URL("../source/VERSION", import.meta.url), "utf8")).trim();
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

async function initializeVersion(argv, filesystem = fs) {
  // Execute the real host initialization, including argument parsing and the
  // release-file read, without connecting to a running Codex instance.
  const initialization = section("const scriptDirectory =", "// Must be declared before").replaceAll("import.meta.url", "injectorUrl");
  return vm.runInNewContext(`(async () => {
    ${initialization}
    ${section("function parseArguments(", "function delay(")}
    ${section("function isCodexAppDocument(", "function isInjectableTarget(")}
    ${section("function buildInjectionSource(css)", "function buildBootstrapSource(")}
    return { info: hostVersionInfo, runtime: buildInjectionSource("") };
  })()`, {
    fs: filesystem, path, fileURLToPath, injectorUrl: injectorUrl.href, Buffer,
    process: { argv: ["node", fileURLToPath(injectorUrl), ...argv] },
    buildMainControllerSource: () => "", createExtensionUpdatesUI,
  });
}

function versionDisplays(runtime) {
  // Evaluate the actual generated renderer expressions used by the header,
  // version row and cached-panel marker.
  const info = runtime.match(/const VERSION_INFO = [^\n]+;/)?.[0];
  const marker = runtime.match(/const SETTINGS_UI_VERSION = [^\n]+;/)?.[0];
  const subtitle = runtime.match(/subtitle\.textContent = [^\n]+;/)?.[0];
  const row = runtime.match(/createSettingsRow\("Codex Plus Pro", [^\n]+/)?.[0].replace(/,$/, "");
  assert.ok(info && marker && subtitle && row, "renderer must expose both version displays and a cache marker");
  return vm.runInNewContext(`${info}\n${marker}\n${subtitle}\n({
    subtitle: subtitle.textContent, versionRow: ${row}, marker: SETTINGS_UI_VERSION
  })`, {
    subtitle: {}, createSettingsTextValue: text => text, createSettingsRow: (_label, value) => value,
  });
}

function assertUnifiedVersion(result, expectedVersion) {
  assert.equal(result.info.plusVersion, expectedVersion, "stale launcher metadata must not override the loaded release");
  const displays = versionDisplays(result.runtime);
  assert.ok(displays.subtitle.startsWith(`Windows ${expectedVersion} ·`));
  assert.equal(displays.versionRow, `Windows ${expectedVersion}`);
  assert.ok(displays.marker.includes(`-${expectedVersion}-`), "panel cache must identify the loaded release");
  return displays;
}

test("reloading a new injector with an old launcher's version keeps both displays current", async () => {
  const result = await initializeVersion(["--plus-version", "1.8.8"]);
  const displays = assertUnifiedVersion(result, releaseVersion);
  assert.notEqual(displays.marker, `win-settings-scope-b2-${releaseVersion}-service-extensions-v7`, "existing mismatched panels must be rebuilt");
});

test("changing the release file updates header, version row and panel cache together", async () => {
  const reads = [];
  const result = await initializeVersion(["--plus-version", "99.0.0"], {
    async readFile(filename, encoding) {
      reads.push([filename, encoding]);
      return "1.9.0\r\n";
    },
  });
  assertUnifiedVersion(result, "1.9.0");
  assert.deepEqual(reads, [[fileURLToPath(new URL("../source/VERSION", import.meta.url)), "utf8"]]);
});

test("the release version does not replace official client or update metadata", async () => {
  const result = await initializeVersion([
    "--app-version", "26.1013.11914", "--app-source", "Managed",
    "--latest-version", "26.1014.12000", "--update-state", "outdated",
  ]);
  assertUnifiedVersion(result, releaseVersion);
  assert.equal(result.info.appVersion, "26.1013.11914");
  assert.equal(result.info.appSource, "Managed");
  assert.equal(result.info.latestVersion, "26.1014.12000");
  assert.equal(result.info.updateState, "outdated");
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";
import test from "node:test";

const exec = promisify(execFile);
const quote = value => `'${value.replaceAll("'", "''")}'`;
const modulePath = fileURLToPath(new URL("../official-codex.psm1", import.meta.url));
const importerPath = fileURLToPath(new URL("../import-official-package.ps1", import.meta.url));
const injector = await fs.readFile(new URL("../source/injector.mjs", import.meta.url), "utf8");
const hostSource = injector.slice(injector.indexOf("function runOfficialImportUpgradeOnce("), injector.indexOf("function localizeOfficialProgress("));

async function hostResult(result) {
  const run = vm.runInNewContext(hostSource + "\nrunOfficialImportUpgradeOnce", {
    path, scriptDirectory: path.dirname(fileURLToPath(new URL("../source/injector.mjs", import.meta.url))),
    log() {}, stripOfficialProgressOutput: value => value,
    postOfficialUpgradeResult: async () => {}, localizeOfficialProgress: value => value,
    spawn() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from(result.stdout));
        child.stderr.emit("data", Buffer.from(result.stderr));
        child.emit("close", result.code);
      });
      return child;
    },
  });
  return run(() => {});
}

async function powershell(body) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-official-upgrade-test-"));
  const scriptPath = path.join(directory, "verify.ps1");
  try {
    await fs.writeFile(scriptPath, "\ufeff" + `
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$TestRoot = ${quote(directory)}
$OfficialRoot = Join-Path $TestRoot "official"
Import-Module ${quote(modulePath)} -Force
# Mock only the OS boundaries. Retention, import and next-launch resolution
# execute their real code, and every deletion stays inside this test's root.
$global:FixtureRoot = $TestRoot
$global:FixtureProcesses = @()
$global:DropImportedEntrypoint = $false
function global:Get-CimInstance { param($ClassName, $ErrorAction) return $global:FixtureProcesses }
function global:Start-Process {
  param($FilePath, $ArgumentList, $WindowStyle, [switch]$Wait, [switch]$PassThru)
  $target = [IO.Path]::GetFullPath([string]$ArgumentList[-1])
  if (!$target.StartsWith($global:FixtureRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Deletion escaped test root: $target" }
  [IO.Directory]::Delete($target, $true)
  if ($global:DropImportedEntrypoint) {
    [IO.File]::Delete((Join-Path $global:FixtureRoot "official/versions/26.1013.4894.0/ChatGPT.exe"))
  }
  return [pscustomobject]@{ ExitCode = 0 }
}
function Add-Version {
  param([string]$Version)
  $directory = Join-Path $OfficialRoot ("versions/" + $Version)
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  [IO.File]::WriteAllText((Join-Path $directory "ChatGPT.exe"), "fixture")
}
function New-Package {
  $payload = Join-Path $TestRoot "payload/app"
  [IO.Directory]::CreateDirectory($payload) | Out-Null
  [IO.File]::WriteAllText((Join-Path $payload "ChatGPT.exe"), "new version fixture")
  $package = Join-Path $TestRoot "OpenAI.Codex_26.1013.4894.0_x64__2p2nqsd0c76g0.msix"
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::Open($package, [IO.Compression.ZipArchiveMode]::Create)
  try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $payload "ChatGPT.exe"), "app/ChatGPT.exe") | Out-Null } finally { $archive.Dispose() }
  return $package
}
${body}
`);
    let result;
    try {
      result = { ...await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { encoding: "utf8", timeout: 60000, maxBuffer: 256 * 1024, windowsHide: true }), code: 0 };
    } catch (error) {
      if (typeof error.code !== "number") throw error;
      result = { code: error.code, stdout: error.stdout || "", stderr: error.stderr || "" };
    }
    return result;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const windows = { skip: process.platform !== "win32" };

test("retention uses numeric version order across September and October builds", windows, async () => {
  const result = await powershell(`
foreach ($v in @("26.928.3736.0", "26.1013.4894.0", "26.1015.1.0", "26.1013.9999.0")) { Add-Version $v }
$removed = @(Remove-CodexPlusOldManagedVersions -Root $OfficialRoot -Keep 2)
[pscustomobject]@{ Retained = @(Get-CodexPlusManagedVersions -Root $OfficialRoot | ForEach-Object { $_.Version }); Removed = @($removed | ForEach-Object { $_.Version }); Next = (Resolve-CodexPlusOfficialApp -Root $OfficialRoot).Version } | ConvertTo-Json -Compress
`);
  assert.equal(result.code, 0, result.stderr.slice(0, 2500));
  const state = JSON.parse(result.stdout);
  assert.deepEqual(state.Retained.sort(), ["26.1013.9999.0", "26.1015.1.0"]);
  assert.deepEqual(state.Removed.sort(), ["26.1013.4894.0", "26.928.3736.0"]);
  assert.equal(state.Next, "26.1015.1.0");
});

test("import survives retention and the next launch selects the imported version", windows, async () => {
  const result = await powershell(`
Add-Version "26.928.3736.0"
$package = New-Package
$imported = (& ${quote(importerPath)} -PackagePath $package -Root $OfficialRoot) | ConvertFrom-Json
[pscustomobject]@{ Imported = $imported; Exists = (Test-Path -LiteralPath $imported.Path -PathType Leaf); Next = (Resolve-CodexPlusOfficialApp -Root $OfficialRoot).Version } | ConvertTo-Json -Depth 5 -Compress
`);
  assert.equal(result.code, 0, result.stderr.slice(-2500));
  const state = JSON.parse(result.stdout);
  assert.equal(state.Exists, true, "a reported successful import must remain installed after cleanup");
  assert.equal(state.Next, "26.1013.4894.0", "restarting must choose the imported October build");
  assert.equal(state.Imported.RemovedVersions[0].Version, "26.928.3736.0");
  const payload = await hostResult({ code: 0, stdout: JSON.stringify({ Version: state.Imported.Version, Imported: state.Imported }), stderr: "" });
  assert.equal(payload.state, "done");
  assert.equal(payload.version, state.Next);
});

test("a running older version stays protected while the newer import remains available", windows, async () => {
  const result = await powershell(`
Add-Version "26.928.3736.0"
$global:FixtureProcesses = @([pscustomobject]@{ Name = "ChatGPT.exe"; ExecutablePath = (Join-Path $OfficialRoot "versions/26.928.3736.0/ChatGPT.exe") })
$package = New-Package
$imported = (& ${quote(importerPath)} -PackagePath $package -Root $OfficialRoot) | ConvertFrom-Json
[pscustomobject]@{ Imported = $imported; Next = (Resolve-CodexPlusOfficialApp -Root $OfficialRoot).Version; Versions = @(Get-CodexPlusManagedVersions -Root $OfficialRoot | ForEach-Object { $_.Version }) } | ConvertTo-Json -Depth 5 -Compress
`);
  assert.equal(result.code, 0, result.stderr.slice(-2500));
  const state = JSON.parse(result.stdout);
  assert.deepEqual(state.Versions.sort(), ["26.1013.4894.0", "26.928.3736.0"]);
  assert.equal(state.Imported.DeferredCleanup[0].State, "Protected");
  assert.equal(state.Next, "26.1013.4894.0");
});

test("a lost imported entrypoint fails instead of offering a successful restart", windows, async () => {
  const result = await powershell(`
Add-Version "26.928.3736.0"
$global:DropImportedEntrypoint = $true
$package = New-Package
& ${quote(importerPath)} -PackagePath $package -Root $OfficialRoot
`);
  assert.notEqual(result.code, 0, "completion must recheck the entrypoint after cleanup");
  assert.match(result.stderr, /Imported entrypoint is missing after cleanup/);
  assert.equal(result.stdout.trim(), "", "failed import must not emit a success receipt");
  const payload = await hostResult(result);
  assert.equal(payload.ok, false);
  assert.equal(payload.state, "failed");
});

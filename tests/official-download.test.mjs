import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import vm from "node:vm";

const exec = promisify(execFile);
const source = await fs.readFile(new URL("../resolve-store-fe3-direct.ps1", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("function Get-TemplateText"), source.indexOf("$catalogUri ="));
const initialization = source.slice(source.indexOf("Set-StrictMode"), source.indexOf("$ScriptRoot ="));
const injector = await fs.readFile(new URL("../source/injector.mjs", import.meta.url), "utf8");
const localize = vm.runInNewContext(injector.slice(injector.indexOf("function localizeOfficialProgress("), injector.indexOf("function stripOfficialProgressOutput(")) + "\nlocalizeOfficialProgress");

async function requestFixture(body) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-official-download-test-"));
  const scriptPath = path.join(directory, "verify.ps1");
  try {
    await fs.writeFile(scriptPath, "\ufeff" + `${initialization}
${functions}
$UserAgent = "fixture"
$script:calls = 0
$script:waits = @()
function Start-Sleep { param($Milliseconds) $script:waits += $Milliseconds }
${body}
`);
    const result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { encoding: "utf8", timeout: 30000, maxBuffer: 128 * 1024, windowsHide: true });
    return { state: JSON.parse(result.stdout), progress: result.stderr.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const windows = { skip: process.platform !== "win32" };

test("a closed FE3 connection retries the read and succeeds without losing its operation", windows, async () => {
  const result = await requestFixture(`
function Invoke-WebRequest {
  param($Uri,$Method,[switch]$UseBasicParsing,$TimeoutSec,$Headers,$Body)
  $script:calls++
  if ($script:calls -lt 3) { throw [Net.WebException]::new("连接被中断", [Net.WebExceptionStatus]::KeepAliveFailure) }
  return [pscustomobject]@{ Content = "official response" }
}
try { $response = Invoke-Fe3Soap -Uri "https://official.test/" -Body "fixture" -Operation "SyncUpdates"; $message = $response.Content } catch { $message = $_.Exception.Message }
[pscustomobject]@{ Calls = $script:calls; Waits = $script:waits; Message = $message } | ConvertTo-Json -Compress
`);
  assert.equal(result.state.Calls, 3);
  assert.deepEqual(result.state.Waits, [500, 1000]);
  assert.equal(result.state.Message, "official response");
  assert.deepEqual(result.progress.map(p => p.attempt), [1, 2, 3]);
  assert.ok(result.progress.every(p => p.step === "SyncUpdates" && p.phase === "resolving" && p.maxAttempts === 3 && p.total === 0));
});

test("a persistent transport failure stops at three attempts and keeps readable diagnostics", windows, async () => {
  const result = await requestFixture(`
function Invoke-WebRequest { $script:calls++; throw [Net.WebException]::new("服务器关闭了连接", [Net.WebExceptionStatus]::ConnectionClosed) }
try { Invoke-Fe3Soap -Uri "https://official.test/" -Body "fixture" -Operation "GetCookie" | Out-Null } catch { $message = $_.Exception.Message }
[pscustomobject]@{ Calls = $script:calls; Message = $message } | ConvertTo-Json -Compress
`);
  assert.equal(result.state.Calls, 3);
  assert.match(result.state.Message, /GetCookie.*3/);
  assert.ok(result.state.Message.includes("服务器关闭了连接"));
});

test("an HTTP denial and a certificate failure do not repeat the request", windows, async () => {
  for (const status of ["ProtocolError", "TrustFailure"]) {
    const result = await requestFixture(`
function Invoke-WebRequest { $script:calls++; throw [Net.WebException]::new("请求被拒绝", [Net.WebExceptionStatus]::${status}) }
try { Invoke-Fe3Soap -Uri "https://official.test/" -Body "fixture" -Operation "GetExtendedUpdateInfo2" | Out-Null } catch { $message = $_.Exception.Message }
[pscustomobject]@{ Calls = $script:calls; Message = $message } | ConvertTo-Json -Compress
`);
    assert.equal(result.state.Calls, 1, status);
    assert.ok(result.state.Message.includes("请求被拒绝"));
  }
});

test("real Windows HTTP errors retry a busy service but do not retry access denial", windows, async () => {
  const calls = {};
  const server = createServer((request, response) => {
    calls[request.url] = (calls[request.url] || 0) + 1;
    const status = request.url === "/denied" ? 403 : calls[request.url] === 1 ? 503 : 200;
    request.resume();
    request.on("end", () => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(status === 200 ? "official response" : "unavailable");
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const route of ["temporary", "denied"]) {
      const result = await requestFixture(`
try { $response = Invoke-Fe3Soap -Uri "http://127.0.0.1:${server.address().port}/${route}" -Body "fixture" -Operation "SyncUpdates"; $message = $response.Content } catch { $message = $_.Exception.Message }
[pscustomobject]@{ Message = $message } | ConvertTo-Json -Compress
`);
      if (route === "temporary") assert.equal(result.state.Message, "official response");
      else assert.match(result.state.Message, /SyncUpdates.*1.*403/);
    }
    assert.deepEqual(calls, { "/temporary": 2, "/denied": 1 });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("address lookup feedback describes retries separately from package import", () => {
  const result = localize({ phase: "resolving", step: "SyncUpdates", attempt: 2, maxAttempts: 3, current: 0, total: 0 });
  assert.equal(result.status, "正在获取官方下载地址");
  assert.ok(result.detail.includes("重试") && result.detail.includes("2/3"));
  assert.equal(localize({ phase: "importing", current: 2, total: 5, percent: 40 }).status, "正在导入官方新版");
});

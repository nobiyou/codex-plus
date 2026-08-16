import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../scripts/codex-injector.mjs", import.meta.url), "utf8");
const runtimeSource = await readFile(
  new URL("../scripts/codex-injector-runtime.mjs", import.meta.url),
  "utf8",
);
const supervisorSource = await readFile(
  new URL("../scripts/taskboard-supervisor.mjs", import.meta.url),
  "utf8",
);
const windowsInjectorSource = await readFile(
  new URL("../../source/injector.mjs", import.meta.url),
  "utf8",
);
const taskboardEmbedSource = await readFile(
  new URL("../../source/taskboard-embed.js", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("the resident injector authenticates its launcher-managed Taskboard service", () => {
  assert.match(supervisorSource, /function createTaskboardSupervisor/);
  assert.match(source, /CODEX_TASKBOARD_INSTANCE_TOKEN/);
  assert.match(source, /createHmac\("sha256"/);
  assert.match(source, /x-codex-taskboard-challenge/);
  assert.match(source, /proof/);
  assert.match(source, /taskboardInstanceSecret/);
  assert.match(source, /Page\.setDocumentContent/);
  assert.match(windowsInjectorSource, /buildTaskboardInlineDocument/);
  assert.match(windowsInjectorSource, /taskboard:api-request/);
  assert.match(windowsInjectorSource, /globalThis\.fetch = \(input, init\)/);
  assert.match(windowsInjectorSource, /input instanceof URL[\s\S]*?input\.href/);
  assert.match(taskboardEmbedSource, /type: FRAME_API_RESPONSE_MESSAGE,[\s\S]*?capability: frameCapability,[\s\S]*?challenge: frameChallenge/);
  assert.match(windowsInjectorSource, /snapshotUrl = this\.url\.replace/);
  assert.match(windowsInjectorSource, /function isExternalTaskboardAssetReference/);
  assert.match(windowsInjectorSource, /__CODEX_TASKBOARD_FRAME_CAPABILITY__ = capability/);
  assert.match(windowsInjectorSource, /__CODEX_TASKBOARD_FRAME_CHALLENGE__ = challenge/);
  assert.match(runtimeSource, /request\.action === "load-frame"/);
  assert.match(supervisorSource, /ensureInFlight/);
  assert.match(supervisorSource, /await terminateManagedChild\(managedChild\)/);
  assert.match(source, /await supervisor\.ensure\(\)/);
  assert.match(source, /it will be restarted automatically/);
  assert.match(source, /AbortSignal\.timeout\(1_500\)/);
  assert.match(source, /__CODEX_TASKBOARD_FRAME_CAPABILITY__/);
  assert.match(runtimeSource, /request\.frameCapability/);
});

test("the CDP bridge accepts service ensure and native instruction composer prefill actions", () => {
  assert.match(source, /const hostBindingName = "__codexTaskboardHostV1"/);
  assert.match(runtimeSource, /request\.action === "ensure"/);
  assert.match(runtimeSource, /request\.action === "prefill-task-composer"/);
  assert.match(runtimeSource, /request\.action === "open-external"/);
  assert.match(runtimeSource, /request\.instruction\.length <= 1_024/);
  assert.match(source, /function prefillTaskComposerViaCdp/);
  assert.match(source, /cdp\.send\("Input\.insertText", \{ text: instruction \}\)/);
  assert.match(source, /Runtime\.bindingCalled/);
  assert.match(source, /Page\.createIsolatedWorld/);
  assert.match(source, /Runtime\.addBinding", \{\s*name: hostBindingName,\s*executionContextId:/);
  assert.match(source, /params\.executionContextId !== activeContextId/);
  assert.match(runtimeSource, /params\.executionContextId/);
  assert.match(source, /hostResponseMessage/);
  assert.match(source, /if \(keepAlive\) await hostBridge\.install\(\)/);
  assert.match(source, /hostBridge\.publishHeartbeat/);
  assert.match(source, /withoutTaskboardLauncherEnvironment\(process\.env\)/);
});

test("the Taskboard load-error retry restarts the managed service before reopening the frame", () => {
  assert.match(
    taskboardEmbedSource,
    /retry\.addEventListener\("click", \(\) => void restartTaskboardFromError\(\), \{ once: true \}\)/,
  );
  assert.match(
    taskboardEmbedSource,
    /async function restartTaskboardFromError\(\)[\s\S]*?requestTaskboardService\("restart"\)[\s\S]*?response\?\.restarted \|\| response\?\.reloadFrame/,
  );
  assert.match(taskboardEmbedSource, /if \(!hasLiveHostBinding\(\)\) \{[\s\S]*?openTaskboard\(\);/);
});

test("Windows service operations settle on PowerShell exit before inherited pipes close", () => {
  assert.match(windowsInjectorSource, /let settled = false;/);
  assert.match(taskboardEmbedSource, /if \(!frame\) openTaskboard\(\);/);
  assert.match(taskboardEmbedSource, /function waitForFrameDocumentLoad\(\)/);
  assert.match(taskboardEmbedSource, /await waitForFrameDocumentLoad\(\);[\s\S]*?requestHostLoadFrame/);
  assert.match(windowsInjectorSource, /child\.on\("exit", \(code, signal\) => \{[\s\S]*?setImmediate\(\(\) => settle\(code, signal\)\)/);
  assert.match(windowsInjectorSource, /child\.on\("close", \(code, signal\) => settle\(code, signal\)/);
  assert.match(windowsInjectorSource, /child\.stdout\.destroy\(\);\s*child\.stderr\.destroy\(\);/);
});

test("the CDP bridge exposes only the fixed Taskboard automation operations", () => {
  assert.match(source, /parseTaskboardAutomationHostRequest/);
  assert.match(source, /reconcileTaskboardAutomation/);
  assert.match(runtimeSource, /request\.action === "automation"/);
  assert.match(source, /function requestCodexAutomationViaCdp/);
  assert.match(source, /new Set\(\[\s*"list-automations",\s*"automation-create",\s*"automation-update",\s*\]\)/);
  assert.match(source, /bridge\.sendMessageFromView\(\{\s*type: "fetch",\s*requestId,/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /vscode:\/\/codex\/\$\{method\}/);
  assert.match(source, /body: JSON\.stringify\(params\)/);
  assert.match(source, /message\.type !== "fetch-response"/);
  assert.match(source, /message\.responseType/);
  assert.match(source, /message\.status/);
  assert.match(source, /message\.bodyJsonString/);
  assert.doesNotMatch(source, /automation-delete/);
  assert.doesNotMatch(source, /automations\.toml/);
});

test("passive automation policy keeps the user switch enabled across idle pauses", () => {
  assert.match(source, /taskboardAutomationPolicyOperation/);
  assert.match(source, /previousQuotaState: current\.quota\?\.state/);
  assert.match(source, /enqueueQuotaPolicyMutation\(record, rpc, \{ explicit: true \}\)/);
  assert.doesNotMatch(source, /current\.request = \{ \.\.\.current\.request, enabledByUser: false \}/);
  assert.doesNotMatch(
    windowsInjectorSource,
    /current\.request = \{ \.\.\.current\.request, enabledByUser: false \}/,
  );
  assert.doesNotMatch(windowsInjectorSource, /if \(result\.autoPaused\)/);
  assert.match(
    windowsInjectorSource,
    /if \(result\?\.error === "not-found"\) \{[\s\S]*?operation: "pause",[\s\S]*?autoPaused: !explicit/,
  );
  assert.match(
    windowsInjectorSource,
    /function scheduleTaskboardAutomationPolicyCheck\(record, result\)[\s\S]*?if \(!request\.enabledByUser\) return;[\s\S]*?scheduleTaskboardAutomationPolicyCheck\(current, result\);/,
  );
  assert.match(source, /record\.quota \? \{ quota: record\.quota \} : \{\}/);
});

test("the Windows automation host consumes one native run per taskboard activity generation", () => {
  assert.match(windowsInjectorSource, /taskboardAutomationActivityKey/);
  assert.match(windowsInjectorSource, /taskboardAutomationGateDecision/);
  assert.match(windowsInjectorSource, /automationExists: Boolean\(currentItem\)/);
  assert.match(windowsInjectorSource, /if \(gateDecision\.runObserved\)/);
  assert.match(windowsInjectorSource, /readLatestAutomationRunFailure/);
  assert.match(windowsInjectorSource, /automationGate: current\.automationGate/);
  assert.match(windowsInjectorSource, /current\.automationGate = result\.automationGate/);
  assert.match(windowsInjectorSource, /current\.automationIssue = result\.automationIssue/);
  assert.match(windowsInjectorSource, /Taskboard automation run diagnosis failed/);
});

test("the Windows injector registers automation only on a native Codex renderer", () => {
  assert.match(
    windowsInjectorSource,
    /expression: "typeof window\.electronBridge\?\.sendMessageFromView === 'function'"/,
  );
  assert.match(
    windowsInjectorSource,
    /if \(nativeAutomationAvailable\?\.result\?\.value === true\) \{\s*registerTaskboardAutomationSender\(send\);\s*automationSenderRegistered = true;/,
  );
  assert.match(
    windowsInjectorSource,
    /restoreAutomations: \(\) => automationSenderRegistered\s*\? restoreTaskboardAutomationPolicies\(send\)\s*: Promise\.resolve\(\{ skipped: true \}\)/,
  );
});

test("the Windows injector restores every enabled Taskboard policy", () => {
  assert.match(
    windowsInjectorSource,
    /for \(const \[projectId, record\] of taskboardAutomationPolicyRecords\) \{\s*if \(record\.request\.enabledByUser\) \{\s*await enqueueCurrentTaskboardAutomationPolicy\(projectId\);/,
  );
  assert.match(windowsInjectorSource, /if \(!request\.enabledByUser\) return;/);
  assert.doesNotMatch(
    windowsInjectorSource,
    /if \(record\.request\.enabledByUser && record\.request\.quotaAware\)/,
  );
});

test("the Windows injector disposes stale page sessions before reconnecting", () => {
  assert.match(
    windowsInjectorSource,
    /function clearPageSessions\(reason\)[\s\S]*?session\.dispose\?\.\(\)[\s\S]*?pageTargetsBySessionId\.clear\(\)[\s\S]*?attachedTargetIds\.clear\(\)[\s\S]*?attachingTargetIds\.clear\(\)/,
  );
  assert.match(
    windowsInjectorSource,
    /if \(browserConnection === connection\) browserConnection = null;\s*clearPageSessions\("Browser DevTools connection closed"\);/,
  );
  assert.match(
    windowsInjectorSource,
    /invalidatePageSession\(targetId, null, "Target\.removed"\)/,
  );
});

test("the Windows injector retries automation restore after transient renderer loss", () => {
  assert.match(windowsInjectorSource, /function scheduleTaskboardAutomationRestoreRetry\(delayMs = 1_000\)/);
  assert.match(windowsInjectorSource, /function isTransientTaskboardAutomationRestoreError\(error\)/);
  assert.match(
    windowsInjectorSource,
    /restoreTaskboardAutomationPolicies\(send, \{ retryOnTransientFailure = true \} = \{\}\)/,
  );
  assert.match(
    windowsInjectorSource,
    /retryOnTransientFailure && isTransientTaskboardAutomationRestoreError\(error\)/,
  );
  assert.match(
    windowsInjectorSource,
    /scheduleTaskboardAutomationRestoreRetry\(\);[\s\S]*?throw error;/,
  );
});

test("the package injection command remains resident for tab-triggered recovery", () => {
  assert.match(packageJson.scripts["codex:inject"], /--watch/);
  assert.match(packageJson.scripts["codex:daemon"], /--daemon --open/);
  assert.match(source, /function startResidentInjector/);
  assert.match(source, /const defaultCodexDebuggingPort = 9229/);
  assert.match(source, /port: defaultCodexDebuggingPort/);
  assert.match(source, /--startup-token/);
  assert.match(source, /__codexTaskboardHostStartupTokenV1/);
});

test("attach reconciles the renderer against a hashed current injection source", () => {
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /__CODEX_TASKBOARD_SOURCE_HASH__/);
  assert.match(source, /sourceHash: window\.__codexTaskboardInjection__\?\.sourceHash \|\| null/);
  assert.match(source, /const injectionScriptIdentifierName = "__CODEX_TASKBOARD_SCRIPT_IDENTIFIER__"/);
  assert.match(source, /scriptIdentifier: window\[\$\{JSON\.stringify\(injectionScriptIdentifierName\)\}\] \|\| null/);
  assert.match(source, /Page\.removeScriptToEvaluateOnNewDocument/);
  assert.match(source, /Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(source, /reconcileInjectionRuntime/);
  assert.match(source, /expectedSourceHash/);
});

test("the injector ignores auxiliary Codex windows", () => {
  assert.match(source, /!target\.url\?\.includes\("initialRoute=%2Fglobal-dictation"\)/);
});

test("a completed web build refreshes an already-open Codex iframe", () => {
  assert.match(packageJson.scripts.build, /--refresh-if-running/);
  assert.match(packageJson.scripts["codex:refresh"], /--refresh/);
  assert.match(source, /async function refreshTaskboardFrames/);
  assert.match(source, /function codexDebuggingPorts/);
  assert.match(source, /--remote-debugging-port=/);
  assert.match(source, /taskboard\.reloadFrame\(\)/);
  assert.match(source, /__codex_taskboard_refresh/);
  assert.match(source, /await restartResidentInjectorForRefresh\(port\)/);
});

test("the injected iframe follows the configured local service port", () => {
  assert.match(source, /const taskboardBaseUrl = `\$\{taskboardOrigin\}\/\$\{encodeURIComponent\(taskboardInstanceToken\)\}`/);
  assert.match(source, /const taskboardPageUrl = `\$\{taskboardBaseUrl\}\/\?host=codex`/);
  assert.match(source, /window\.__CODEX_TASKBOARD_URL__ = \$\{JSON\.stringify\(taskboardPageUrl\)\}/);
});

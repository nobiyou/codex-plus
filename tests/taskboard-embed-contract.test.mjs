import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const embedSourcePath = new URL("../source/taskboard-embed.js", import.meta.url);
const injectorSourcePath = new URL("../source/injector.mjs", import.meta.url);
const appSourcePath = new URL("../taskbord/web/src/App.tsx", import.meta.url);

test("taskboard payload preserves the upstream sidebar and context contract", async () => {
  const source = await fs.readFile(embedSourcePath, "utf8");

  assert.match(source, /Upstream commit: f9ec7a1f906f6a4d78aa4c2aa24d23c04e27a185/);
  assert.match(source, /codex-taskboard-entry/);
  assert.match(source, /codex-taskboard-frame/);
  assert.match(source, /allow-scripts allow-forms allow-modals allow-downloads/);
  assert.match(source, /frameOrigin = "null"/);
  assert.match(source, /__CODEX_TASKBOARD_URL__/);
  assert.match(source, /resolveTaskboardUrl/);
  assert.match(source, /captureHostContext/);
  assert.match(source, /codexProjectKind: payload\.codexProjectKind/);
  assert.match(source, /codexHostId: payload\.codexHostId/);
  assert.match(source, /NATIVE_BOOTSTRAP_TIMEOUT_MS = 800/);
  assert.match(source, /Promise\.race\(\[\s*Promise\.resolve\(\)\.then\(\(\) => window\.electronBridge\?\.getInitialSidebarBootstrap\?\.\(\)\)/s);
  assert.match(source, /resolve\(null\), NATIVE_BOOTSTRAP_TIMEOUT_MS/);
  assert.match(source, /projectId/);
  assert.match(source, /threadId/);
  assert.match(source, /lastNativeThreadTitle/);
  assert.match(source, /let requestedProjectId = ""/);
  assert.match(source, /data-app-action-sidebar-thread-title/);
  assert.match(source, /function readRecentConversations\(projectId, currentThreadId = ""\)/);
  assert.match(source, /title: threadTitleFromRow\(row\),\s*projectId,/);
  assert.match(source, /readRecentConversations\(\s*conversationProjectId,/s);
  assert.match(source, /title: threadTitleFromRow\(rememberedRow \|\| row\) \|\| lastNativeThreadTitle,\s*projectId: conversationProjectId,/);
  assert.match(source, /const nativeProjectId = domProjectId \|\| preferredProjectId \|\| "";/);
  assert.match(source, /projectOverride = ""/);
  assert.match(source, /const conversationProjectId = projectOverride \|\| nativeProjectId;/);
  assert.match(source, /conversationProjectId === nativeProjectId \? threadId : ""/);
  assert.match(source, /taskboard:request-project-context/);
  assert.match(source, /recentConversations/);
  assert.match(source, /if \(plugin\?\.parentElement\) return plugin;/);
  assert.doesNotMatch(source, /siblings\.length >= 3/);
  assert.match(source, /postMessage/);
  assert.match(source, /__codexTaskboardInjection__/);
  assert.match(source, /function destroy\(\)/);
  assert.match(source, /__codexPlusProTaskboardConfig/);
  assert.match(source, /enabled === false/);
  assert.doesNotMatch(source, /CODEX_TASKBOARD_INSTANCE_SECRET/);
  assert.doesNotMatch(source, /CODEX_TASKBOARD_INSTANCE_TOKEN/);
});

test("embedded recent conversation candidates keep the current project identity", async () => {
  const source = await fs.readFile(embedSourcePath, "utf8");
  const functionSource = [
    source.slice(
      source.indexOf("function normalizeThreadId"),
      source.indexOf("async function selectedNativeProjectId"),
    ),
    source.slice(
      source.indexOf("function sidebarThreadRow"),
      source.indexOf("function nativeRunningThreadRow"),
    ),
  ].join("\n");
  const rows = [];
  function addRow(threadId, projectId, title) {
    rows.push({
      textContent: title,
      getAttribute(name) {
        if (name === "data-app-action-sidebar-thread-id") return threadId;
        if (name === "data-app-action-sidebar-thread-title") return null;
        return null;
      },
      querySelector() { return null; },
      closest(selector) {
        if (selector !== "[data-app-action-sidebar-project-list-id]") return null;
        return { getAttribute: () => projectId };
      },
    });
  }
  addRow("local:thread-a", "project-a", "Project A");
  addRow("thread-b", "project-b", "Project B");
  const readRecentConversations = vm.runInNewContext(
    `(() => { ${functionSource}; return readRecentConversations; })()`,
    { document: { querySelectorAll: () => rows } },
  );

  assert.deepEqual(JSON.parse(JSON.stringify(readRecentConversations("project-a"))), [{
    threadId: "thread-a",
    title: "Project A",
    projectId: "project-a",
  }]);
});

test("embedded Taskboard requests conversations for its selected Codex project", async () => {
  const source = await fs.readFile(appSourcePath, "utf8");

  assert.match(source, /type: "taskboard:request-project-context"/);
  assert.match(source, /payload: \{ projectId: createCodexIdentity\?\.codexProjectId \?\? "" \}/);
  assert.match(source, /\}, \[createCodexIdentity\?\.codexProjectId, embedded, embeddedFrameChallenge, selectedProjectId\]\);/);
});

test("injector loads the taskboard payload as a separate renderer source", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /taskboardEmbedPath/);
  assert.match(source, /taskboardEmbedSource/);
  assert.match(source, /taskboardRuntimeSource/);
  assert.match(source, /__codexPlusProTaskboardConfig/);
  assert.match(source, /sourceHash: `codex-plus-pro-taskboard-v1-\$\{String\(hostCapability/);
  assert.match(source, /launchInstanceId/);
  assert.match(source, /Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(source, /taskboardEmbedSource/);
  assert.match(source, /options\["disable-taskboard"\]/);
  assert.match(source, /function resolveTaskboardUrl\(/);
  assert.match(source, /function isTaskboardTargetUrl\(/);
  assert.match(source, /if \(isTaskboardTargetUrl\(url\)\) return false/);
  assert.ok(source.includes("(?<=[\"'\\x60\\/(])"), "asset scan must only accept quoted or URL-like asset references");
  assert.match(source, /if \(!url\.pathname\.endsWith\("\/"\)\) url\.pathname \+= "\/"/);
  assert.match(source, /function buildTaskboardRuntimeSource\(/);
  assert.match(source, /const taskboardRuntimeFile = path\.resolve\(/);
  assert.match(source, /path\.join\(taskboardStateDirectory, "launcher-runtime\.json"\)/);
  assert.match(source, /process\.env\.CODEX_TASKBOARD_RUNTIME_FILE = taskboardRuntimeFile/);
  assert.match(source, /new Function\(/);
});

test("injector owns the authenticated Taskboard host bridge", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");

  assert.match(source, /__codexTaskboardHostV1/);
  assert.match(source, /__CODEX_TASKBOARD_HOST_CAPABILITY__/);
  assert.match(source, /Page\.createIsolatedWorld/);
  assert.match(source, /Runtime\.addBinding/);
  assert.match(source, /executionContextId/);
  assert.match(source, /Page\.getFrameTree/);
  assert.match(source, /meta\[http-equiv=\"Content-Security-Policy\"\]/);
  assert.match(source, /Page\.setBypassCSP/);
  assert.match(source, /cspProtocolBypassActive/);
  assert.match(source, /hostCspMetaState/);
  assert.match(source, /meta\.remove\(\)/);
  assert.match(source, /setAttribute\(\"http-equiv\", state\.httpEquiv\)/);
  assert.doesNotMatch(source, /Page\.navigate/);
  assert.match(source, /function loadTaskboardFrameViaCdp\(send, frameName,/);
  assert.match(source, /Page\.setDocumentContent/);
  assert.doesNotMatch(
    source.slice(source.indexOf("async function loadTaskboardFrameViaCdp")),
    /Target\.attachToTarget/,
  );
  assert.doesNotMatch(source, /const sendToChild/);
  assert.match(source, /__CODEX_TASKBOARD_FRAME_CAPABILITY__/);
  assert.match(source, /Taskboard document is missing its bundled script or stylesheet/);
  assert.match(source, /Taskboard resource HTTP/);
  assert.match(source, /function rewriteTaskboardModuleAssetReferences\(/);
  assert.match(source, /\$1\.\/assets\/\$2\$1/);
  assert.match(source, /url\.pathname\.endsWith\("\/api"\)/);
  assert.doesNotMatch(source, /\$1assets\/\$2\$1/);
  assert.match(source, /scriptSource = rewriteTaskboardModuleAssetReferences\(scriptSource\)/);
  assert.match(source, /frameTree\?\.frame\?\.name === frameName/);
  assert.match(source, /frameId: frame\.id/);
  assert.match(source, /frameDocumentScriptIdentifier = null/);
  assert.match(source, /Timed out waiting for the isolated Taskboard frame/);
  assert.match(source, /Target\.detachedFromTarget/);
  assert.match(source, /Session with given id not found/);
  assert.match(source, /function invalidatePageSession\(/);
  assert.match(source, /function dispose\(\)/);
  assert.match(source, /x-codex-taskboard-challenge/);
  assert.match(source, /x-codex-taskboard-proof/);
  assert.match(source, /createHmac\("sha256"/);
  assert.match(source, /taskboardHostHeartbeatMessage/);
  assert.match(source, /prefill-task-composer/);
  assert.match(source, /Input\.insertText/);
  assert.match(source, /parseTaskboardAutomationHostRequest/);
  assert.match(source, /reconcileTaskboardAutomation/);
  assert.match(source, /function requestCodexAutomationViaCdp/);
  assert.match(source, /vscode:\/\/codex/);
  assert.match(source, /codex-automation-policies\.json/);
  assert.match(source, /restoreTaskboardAutomationPolicies/);
  assert.doesNotMatch(source, /window\.__CODEX_TASKBOARD_INSTANCE_SECRET__/);
});

test("Taskboard apply-policy responses include the confirmed effective policy", async () => {
  const source = await fs.readFile(injectorSourcePath, "utf8");
  const applySource = source.slice(
    source.indexOf("async function updateAndApplyTaskboardAutomationPolicy"),
    source.indexOf("async function reconcileStoredTaskboardAutomationPolicy"),
  );

  assert.match(applySource, /const result = await enqueueTaskboardAutomationPolicyMutation/);
  assert.match(applySource, /const current = taskboardAutomationPolicyRecords\.get\(request\.taskboardProjectId\)/);
  assert.match(applySource, /policy: storedTaskboardAutomationPolicy\(current\.request\)/);

  const policySource = source.slice(
    source.indexOf("function storedTaskboardAutomationPolicy"),
    source.indexOf("function restoredTaskboardAutomationPolicy"),
  );
  assert.match(policySource, /codexProjectKind: request\.codexProjectKind/);
  assert.match(policySource, /codexHostId: request\.codexHostId/);
});

test("Taskboard service settings stay on the host-owned runtime path", async () => {
  const [embedSource, injectorSource, themeStyles] = await Promise.all([
    fs.readFile(embedSourcePath, "utf8"),
    fs.readFile(injectorSourcePath, "utf8"),
    fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8"),
  ]);

  assert.match(embedSource, /requestTaskboardService\(operation = "status"\)/);
  assert.match(embedSource, /requestHost\("service", \{ operation \}/);
  assert.match(embedSource, /HOST_SERVICE_REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(embedSource, /__codexPlusProTaskboardService/);
  assert.match(embedSource, /reloadFrame/);

  assert.match(injectorSource, /request\.action === "service"/);
  assert.match(injectorSource, /request\.operation === "status" \|\| request\.operation === "restart"/);
  assert.match(injectorSource, /Start-CodexPlusTaskboard -Force/);
  assert.match(injectorSource, /Get-CodexPlusTaskboardStatus -StateRoot/);
  assert.match(injectorSource, /Select-Object Available,Root,Port,Url,EmbedUrl,ProcessId,Healthy,Reason,NodePath,OwnerMarker,StatePreserved,InstanceToken,InstanceSecret/);
  assert.match(injectorSource, /Import-Module -Name \$\{powershellLiteral\(taskboardRuntimePath\)\} -Force/);
  assert.doesNotMatch(injectorSource, /Import-Module -LiteralPath/);
  assert.match(injectorSource, /function normalizeTaskboardServiceStatus\(/);
  assert.match(injectorSource, /function redactTaskboardServiceText\(/);
  assert.match(injectorSource, /const SETTINGS_UI_VERSION = "win-settings-scope-b2-1\.8\.6-taskboard-service-compatibility-v2"/);
  assert.match(injectorSource, /key: "taskboard", label: "任务面板"/);
  assert.match(injectorSource, /重启 Taskboard/);
  assert.match(injectorSource, /复制诊断/);
  assert.doesNotMatch(embedSource, /CODEX_TASKBOARD_INSTANCE_SECRET/);
  assert.doesNotMatch(embedSource, /CODEX_TASKBOARD_INSTANCE_TOKEN/);
  assert.doesNotMatch(injectorSource, /window\.__CODEX_TASKBOARD_INSTANCE_SECRET__/);
  assert.match(themeStyles, /codex-plus-pro-taskboard-service-control/);
});

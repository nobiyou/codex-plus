const browserUrl = (await (await fetch("http://127.0.0.1:9230/json/version")).json()).webSocketDebuggerUrl;
const socket = new WebSocket(browserUrl);
let nextId = 0;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function findFrame(node) {
  if (node?.frame?.name?.startsWith("codex-taskboard-")) return node.frame;
  for (const child of node?.childFrames ?? []) {
    const match = findFrame(child);
    if (match) return match;
  }
  return null;
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const targets = (await send("Target.getTargets")).targetInfos;
const iframeTargets = targets.filter((target) => target.type === "iframe");
const mainTarget = targets.find((target) => target.type === "page" && target.url.startsWith("app://"));
const mainAttached = await send("Target.attachToTarget", { targetId: mainTarget.targetId, flatten: true });
const mainTree = await send("Page.getFrameTree", {}, mainAttached.sessionId);
const mainFrame = findFrame(mainTree.frameTree);
const parentBypass = await send("Page.setBypassCSP", { enabled: true }, mainAttached.sessionId);
const parentInspect = await send("Runtime.evaluate", {
  expression: "({csp:Array.from(document.querySelectorAll('meta[http-equiv]')).map((node)=>({httpEquiv:node.httpEquiv,content:node.content})),frame:Array.from(document.querySelectorAll('iframe#codex-taskboard-frame')).map((node)=>({src:node.src,sandbox:node.getAttribute('sandbox'),name:node.name,connected:node.isConnected}))})",
  returnByValue: true,
}, mainAttached.sessionId);
const output = [];
for (const target of iframeTargets) {
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await send("Page.enable", {}, sessionId);
  let before;
  try {
    before = await send("Runtime.evaluate", {
      expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,bodyText:document.body?.innerText?.slice(0,160)||''})",
      returnByValue: true,
    }, sessionId);
  } catch (error) {
    before = { error: error.message };
  }
  let bypass;
  try {
    bypass = await send("Page.setBypassCSP", { enabled: true }, sessionId);
  } catch (error) {
    bypass = { error: error.message };
  }
  let ownNavigation;
  try {
    ownNavigation = await send("Page.navigate", { url: target.url }, sessionId);
  } catch (error) {
    ownNavigation = { error: error.message };
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let after;
  try {
    after = await send("Runtime.evaluate", {
      expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,bodyText:document.body?.innerText?.slice(0,160)||''})",
      returnByValue: true,
    }, sessionId);
  } catch (error) {
    after = { error: error.message };
  }
  output.push({ targetId: target.targetId, frameId: mainFrame?.id, url: target.url.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"), parentBypass, before: before?.result?.value ?? before, bypass, ownNavigation, after: after?.result?.value ?? after });
}
function summarizeTree(node) {
  return {
    id: node?.frame?.id,
    name: node?.frame?.name,
    url: node?.frame?.url?.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"),
    children: (node?.childFrames ?? []).map(summarizeTree),
  };
}
console.log(JSON.stringify({
  mainFrame,
  parentInspect: parentInspect?.result?.value,
  tree: summarizeTree(mainTree.frameTree),
  iframeTargetInfo: iframeTargets.map(({ targetId, type, title, url, parentFrameId, openerId }) => ({ targetId, type, title, url: url.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"), parentFrameId, openerId })),
  output,
}, null, 2));
socket.close();

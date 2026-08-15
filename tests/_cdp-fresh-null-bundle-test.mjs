import fs from "node:fs/promises";

const bundle = (await fs.readFile("taskbord/dist/web/assets/index-DqXVTWZL.js", "utf8"))
  .replaceAll("import.meta.resolve?import.meta.resolve(e):new URL(e,import.meta.url).href", "new URL(e,document.baseURI).href")
  .replaceAll("import.meta.url", "document.baseURI")
  .replace(/export\{[^}]+\};?\s*$/, "");
const styles = await fs.readFile("taskbord/dist/web/assets/index-D3PwjGsb.css", "utf8");
const pageUrl = "http://127.0.0.1:47823/06b415639c554e648fc857c4ed1981ad/?host=codex";
const browserUrl = (await (await fetch("http://127.0.0.1:9230/json/version")).json()).webSocketDebuggerUrl;
const socket = new WebSocket(browserUrl);
let nextId = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
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
const main = targets.find((target) => target.type === "page" && target.url.startsWith("app://"));
const parentAttached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const parentSession = parentAttached.sessionId;
const create = await send("Runtime.evaluate", {
  expression: `(() => {
  document.querySelector('#codex-taskboard-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'codex-taskboard-frame';
  frame.name = 'codex-taskboard-fresh-test';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-downloads');
  frame.src = 'about:blank';
  frame.style.cssText = 'display:block;width:800px;height:600px;';
  document.body.appendChild(frame);
  return frame.name;
})()`,
  returnByValue: true,
}, parentSession);
await new Promise((resolve) => setTimeout(resolve, 700));
const tree = await send("Page.getFrameTree", {}, parentSession);
function findFreshFrame(node) {
  if (node?.frame?.name === "codex-taskboard-fresh-test") return node.frame;
  for (const child of node?.childFrames ?? []) {
    const match = findFreshFrame(child);
    if (match) return match;
  }
  return null;
}
const childTarget = findFreshFrame(tree.frameTree);
if (!childTarget) throw new Error("fresh about:blank frame not found");
const childSession = parentSession;
const html = `<!doctype html><html lang="en"><head><base href=${JSON.stringify(pageUrl)}><style>${styles}</style></head><body><div id="root"></div></body></html>`;
const written = await send("Page.setDocumentContent", { frameId: childTarget.id, html }, childSession);
const isolated = await send("Page.createIsolatedWorld", { frameId: childTarget.id, worldName: "taskboard-fresh-test" }, parentSession);
const contextId = isolated.executionContextId;
const evaluated = await send("Runtime.evaluate", {
  expression: `(() => { globalThis.__CODEX_TASKBOARD_FRAME_CAPABILITY__="fresh-test"; try { (0, eval)(${JSON.stringify(bundle)}); return {ok:true}; } catch(error) { return {ok:false,error:String(error?.stack||error)}; } })()`,
  contextId,
  returnByValue: true,
  awaitPromise: true,
}, parentSession);
await new Promise((resolve) => setTimeout(resolve, 7000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,origin:location.origin,baseURI:document.baseURI,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||''})",
  contextId,
  returnByValue: true,
}, parentSession);
console.log(JSON.stringify({ created: create?.result?.value, childTarget, contextId, written, evaluated: evaluated?.result?.value, inspect: inspect?.result?.value }, null, 2));
socket.close();

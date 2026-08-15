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
await send("Runtime.evaluate", { expression: "document.getElementById('codex-taskboard-entry')?.click()", returnByValue: true }, parentSession);
await new Promise((resolve) => setTimeout(resolve, 700));
const iframe = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "iframe");
if (!iframe) throw new Error("fresh iframe target not found");
const childAttached = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
const childSession = childAttached.sessionId;
await send("Runtime.enable", {}, childSession);
const contexts = [];
const listener = (event) => {
  const message = JSON.parse(event.data);
  if (message.sessionId === childSession && message.method === "Runtime.executionContextCreated") contexts.push(message.params.context);
};
socket.addEventListener("message", listener);
await send("Page.enable", {}, childSession);
const html = `<!doctype html><html lang="en"><head><base href=${JSON.stringify(pageUrl)}><style>${styles}</style></head><body><div id="root"></div></body></html>`;
await send("Page.setDocumentContent", { frameId: iframe.targetId, html }, childSession);
await new Promise((resolve) => setTimeout(resolve, 500));
const tree = await send("Page.getFrameTree", {}, childSession);
const isolated = await send("Page.createIsolatedWorld", { frameId: iframe.targetId, worldName: "taskboard-null-frame-test" }, childSession);
const contextId = isolated.executionContextId;
const evaluated = await send("Runtime.evaluate", {
  expression: `(() => { globalThis.__CODEX_TASKBOARD_FRAME_CAPABILITY__="null-frame-test"; try { (0, eval)(${JSON.stringify(bundle)}); return {ok:true}; } catch(error) { return {ok:false,error:String(error?.stack||error)}; } })()`,
  contextId,
  returnByValue: true,
  awaitPromise: true,
}, childSession);
await new Promise((resolve) => setTimeout(resolve, 7000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,origin:location.origin,baseURI:document.baseURI,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||''})",
  contextId,
  returnByValue: true,
}, childSession);
console.log(JSON.stringify({ iframe: iframe.targetId, contexts: contexts.map(({ id, auxData }) => ({ id, frameId: auxData?.frameId, isDefault: auxData?.isDefault })), tree, contextId, evaluated: evaluated?.result?.value, inspect: inspect?.result?.value }, null, 2));
socket.close();

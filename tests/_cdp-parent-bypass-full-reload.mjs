const browserUrl = (await (await fetch("http://127.0.0.1:9231/json/version")).json()).webSocketDebuggerUrl;
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
const main = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "page" && target.url.startsWith("app://"));
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const sessionId = attached.sessionId;
await send("Page.enable", {}, sessionId);
const bypass = await send("Page.setBypassCSP", { enabled: true }, sessionId);
const reload = await send("Page.reload", { ignoreCache: true }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 12000));
const before = await send("Runtime.evaluate", {
  expression: "({url:location.href,readyState:document.readyState,entry:Boolean(document.getElementById('codex-taskboard-entry')),frame:Array.from(document.querySelectorAll('iframe#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden,name:node.name})),csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content)})",
  returnByValue: true,
}, sessionId);
const clicked = await send("Runtime.evaluate", {
  expression: "(() => { const entry = document.getElementById('codex-taskboard-entry'); entry?.click(); return Boolean(entry); })()",
  returnByValue: true,
}, sessionId);
await new Promise((resolve) => setTimeout(resolve, 8000));
const after = await send("Runtime.evaluate", {
  expression: "({frame:Array.from(document.querySelectorAll('iframe#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden,name:node.name})),csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content)})",
  returnByValue: true,
}, sessionId);
const targets = (await send("Target.getTargets")).targetInfos;
const iframe = targets.find((target) => target.type === "iframe");
let child = null;
if (iframe) {
  const childAttached = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
  child = await send("Runtime.evaluate", {
    expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||''})",
    returnByValue: true,
  }, childAttached.sessionId);
}
console.log(JSON.stringify({bypass,reload,before:before?.result?.value,clicked:clicked?.result?.value,after:after?.result?.value,iframe:iframe?.url,child:child?.result?.value ?? child},null,2));
socket.close();

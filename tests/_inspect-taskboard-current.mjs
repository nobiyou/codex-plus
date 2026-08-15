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
const targets = (await send("Target.getTargets")).targetInfos;
const main = targets.find((target) => target.type === "page" && target.url.startsWith("app://"));
const iframe = targets.find((target) => target.type === "iframe");
let mainInspect = null;
let iframeInspect = null;
if (main) {
  const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
  mainInspect = await send("Runtime.evaluate", {
    expression: "({csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content),frame:Array.from(document.querySelectorAll('iframe#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden}))})",
    returnByValue: true,
  }, attached.sessionId);
}
if (iframe) {
  const attached = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
  iframeInspect = await send("Runtime.evaluate", {
    expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||'',scripts:Array.from(document.scripts).map((node)=>node.src).filter(Boolean)})",
    returnByValue: true,
  }, attached.sessionId);
}
console.log(JSON.stringify({ iframeTarget: iframe?.url?.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"), main: mainInspect?.result?.value, iframe: iframeInspect?.result?.value }, null, 2));
socket.close();

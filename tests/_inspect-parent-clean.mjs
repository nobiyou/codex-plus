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
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const inspect = await send("Runtime.evaluate", {
  expression: "({url:location.href,readyState:document.readyState,csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content),entry:Boolean(document.getElementById('codex-taskboard-entry')),frame:Array.from(document.querySelectorAll('iframe#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden,name:node.name,connected:node.isConnected})),sentinel:Boolean(window.__codexTaskboardInjection__),service:Boolean(window.__codexPlusProTaskboardService)})",
  returnByValue: true,
}, attached.sessionId);
console.log(JSON.stringify({ targets: targets.filter((target) => target.type === "iframe").map((target) => ({targetId:target.targetId,url:target.url,title:target.title})), inspect: inspect?.result?.value }, null, 2));
socket.close();

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
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const parentSession = attached.sessionId;
await send("Runtime.evaluate", { expression: "(() => { const frame=document.querySelector('iframe#codex-taskboard-frame'); if(frame) frame.src='about:blank'; return frame?.name; })()", returnByValue: true }, parentSession);
await new Promise((resolve) => setTimeout(resolve, 1000));
const iframe = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "iframe");
const child = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
const inspect = await send("Runtime.evaluate", { expression: "({href:location.href,origin:location.origin,baseURI:document.baseURI,readyState:document.readyState})", returnByValue: true }, child.sessionId);
console.log(JSON.stringify({ iframe: {targetId: iframe.targetId, url: iframe.url, title: iframe.title}, inspect: inspect?.result?.value }, null, 2));
socket.close();

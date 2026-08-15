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
const iframe = targets.find((target) => target.type === "iframe");
if (!iframe) throw new Error("No iframe target");
const childAttached = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
const childSession = childAttached.sessionId;
await send("Page.enable", {}, childSession);
const bypass = await send("Page.setBypassCSP", { enabled: true }, childSession);
const navigate = await send("Page.navigate", { url: iframe.url }, childSession);
await new Promise((resolve) => setTimeout(resolve, 6000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||''})",
  returnByValue: true,
}, childSession);
console.log(JSON.stringify({iframe:iframe.url,bypass,navigate,inspect:inspect?.result?.value},null,2));
socket.close();

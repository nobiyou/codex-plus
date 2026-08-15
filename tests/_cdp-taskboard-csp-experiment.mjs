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
const url = "http://127.0.0.1:47823/06b415639c554e648fc857c4ed1981ad/?host=codex";
const targets = (await send("Target.getTargets")).targetInfos;
const main = targets.find((target) => target.type === "page" && target.url.startsWith("app://"));
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const parentSession = attached.sessionId;
await send("Page.setBypassCSP", { enabled: true }, parentSession);
const changed = await send("Runtime.evaluate", {
  expression: `(() => { const frame = document.querySelector('iframe#codex-taskboard-frame'); if (!frame) return false; frame.src = ${JSON.stringify(url)}; return true; })()`,
  returnByValue: true,
}, parentSession);
await new Promise((resolve) => setTimeout(resolve, 250));
const childTarget = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "iframe");
const child = await send("Target.attachToTarget", { targetId: childTarget.targetId, flatten: true });
const childSession = child.sessionId;
await send("Page.enable", {}, childSession);
const childBypass = await send("Page.setBypassCSP", { enabled: true }, childSession);
const navigation = await send("Page.navigate", { url }, childSession);
await new Promise((resolve) => setTimeout(resolve, 3000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,300)||'',bodyText:document.body?.innerText?.slice(0,300)||''})",
  returnByValue: true,
}, childSession);
console.log(JSON.stringify({ changed: changed?.result?.value, childTarget: childTarget.url.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"), childBypass, navigation, inspect: inspect?.result?.value }, null, 2));
socket.close();

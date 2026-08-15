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
const iframe = targets.find((target) => target.type === "iframe");
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const sessionId = attached.sessionId;
await send("Page.setBypassCSP", { enabled: true }, sessionId);
const navigation = await send("Runtime.evaluate", {
  expression: `(() => {
    const frame = document.querySelector("iframe#codex-taskboard-frame");
    if (!frame) return { found: false };
    frame.src = ${JSON.stringify(iframe?.url || "")};
    return { found: true, src: frame.src };
  })()`,
  returnByValue: true,
}, sessionId);
await new Promise((resolve) => setTimeout(resolve, 2000));
const finalTargets = (await send("Target.getTargets")).targetInfos;
const finalIframe = finalTargets.find((target) => target.type === "iframe");
let inspect = null;
if (finalIframe) {
  const child = await send("Target.attachToTarget", { targetId: finalIframe.targetId, flatten: true });
  inspect = await send("Runtime.evaluate", {
    expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,300)||'',bodyText:document.body?.innerText?.slice(0,300)||''})",
    returnByValue: true,
  }, child.sessionId);
}
console.log(JSON.stringify({ navigation: navigation?.result?.value, iframe: finalIframe?.url?.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"), inspect: inspect?.result?.value ?? inspect }, null, 2));
socket.close();

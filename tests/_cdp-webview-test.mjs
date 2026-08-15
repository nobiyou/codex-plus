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
const url = "http://127.0.0.1:47823/06b415639c554e648fc857c4ed1981ad/?host=codex&__webview_test=1";
const created = await send("Runtime.evaluate", {
  expression: `(() => { document.querySelector('#codex-taskboard-webview-test')?.remove(); const node=document.createElement('webview'); node.id='codex-taskboard-webview-test'; node.src=${JSON.stringify(url)}; node.style.cssText='display:block;width:800px;height:600px;position:fixed;left:0;top:0;z-index:999999;'; document.body.appendChild(node); return {ok:true,src:node.src}; })()`,
  returnByValue: true,
}, sessionId);
await new Promise((resolve) => setTimeout(resolve, 9000));
const targets = (await send("Target.getTargets")).targetInfos;
const guest = targets.find((target) => target.type === "webview" && target.url.includes("47823"));
let inspect = null;
if (guest) {
  const guestAttached = await send("Target.attachToTarget", { targetId: guest.targetId, flatten: true });
  inspect = await send("Runtime.evaluate", {
    expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||''})",
    returnByValue: true,
  }, guestAttached.sessionId);
}
const parent = await send("Runtime.evaluate", { expression: "({webview:Array.from(document.querySelectorAll('webview')).map((node)=>({src:node.src,connected:node.isConnected}))})", returnByValue:true }, sessionId);
console.log(JSON.stringify({created:created?.result?.value,guest:guest && {type:guest.type,url:guest.url,title:guest.title},inspect:inspect?.result?.value ?? inspect,parent:parent?.result?.value},null,2));
socket.close();

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
const pages = [];
for (const target of targets.filter((item) => item.type === "page" || item.type === "webview")) {
  try {
    const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const value = await send("Runtime.evaluate", { expression: "({url:location.href,readyState:document.readyState,entry:Boolean(document.getElementById('codex-taskboard-entry')),sentinel:Boolean(window.__codexTaskboardInjection__),service:Boolean(window.__codexPlusProTaskboardService),frames:Array.from(document.querySelectorAll('iframe')).map((node)=>({id:node.id,src:node.src,name:node.name}))})", returnByValue:true }, attached.sessionId);
    pages.push({target:{type:target.type,id:target.targetId,url:target.url,title:target.title},inspect:value?.result?.value});
  } catch (error) { pages.push({target,error:String(error)}); }
}
console.log(JSON.stringify(pages,null,2));
socket.close();

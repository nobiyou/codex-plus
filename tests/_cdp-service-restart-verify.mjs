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
const before = await send("Runtime.evaluate", { expression: "({entry:Boolean(document.getElementById('codex-taskboard-entry')),frame:Array.from(document.querySelectorAll('#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden,name:node.name})),csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content)})", returnByValue:true }, sessionId);
const restart = await send("Runtime.evaluate", { expression: "window.__codexPlusProTaskboardService?.request('restart')", awaitPromise:true, returnByValue:true }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 10000));
const after = await send("Runtime.evaluate", { expression: "({frame:Array.from(document.querySelectorAll('#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden,name:node.name})),status:document.querySelector('#codex-taskboard-status')?.innerText||'',csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content)})", returnByValue:true }, sessionId);
const targets = (await send("Target.getTargets")).targetInfos;
const iframeTargets = targets.filter((target) => target.type === "iframe");
const children = [];
for (const iframe of iframeTargets) {
  try {
    const childAttached = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
    const inspect = await send("Runtime.evaluate", { expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,300)||'',bodyText:document.body?.innerText?.slice(0,300)||''})", returnByValue:true }, childAttached.sessionId);
    children.push({target:{url:iframe.url,title:iframe.title},inspect:inspect?.result?.value});
  } catch (error) { children.push({target:{url:iframe.url,title:iframe.title},error:String(error)}); }
}
console.log(JSON.stringify({before:before?.result?.value,restart:restart?.result?.value ?? restart,after:after?.result?.value,children},null,2));
socket.close();

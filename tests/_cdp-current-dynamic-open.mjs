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
const targetsBefore = (await send("Target.getTargets")).targetInfos;
const main = targetsBefore.find((target) => target.type === "page" && target.url.startsWith("app://"));
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const sessionId = attached.sessionId;
const before = await send("Runtime.evaluate", { expression: "({url:location.href,config:window.__codexPlusProTaskboardConfig,entry:document.getElementById('codex-taskboard-entry')?.outerHTML?.slice(0,400),sentinel:Boolean(window.__codexTaskboardInjection__),service:Boolean(window.__codexPlusProTaskboardService)})", returnByValue:true }, sessionId);
const clicked = await send("Runtime.evaluate", { expression: "(() => { const entry=document.getElementById('codex-taskboard-entry'); entry?.click(); return Boolean(entry); })()", returnByValue:true }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 10000));
const parent = await send("Runtime.evaluate", { expression: "({url:location.href,frame:Array.from(document.querySelectorAll('iframe#codex-taskboard-frame')).map((node)=>({src:node.src,hidden:node.hidden,name:node.name,html:node.outerHTML.slice(0,400)})),service:Boolean(window.__codexPlusProTaskboardService),status:document.querySelector('#codex-taskboard-status')?.innerText||'',csp:Array.from(document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')).map((node)=>node.content)})", returnByValue:true }, sessionId);
const targetsAfter = (await send("Target.getTargets")).targetInfos;
const iframeTargets = targetsAfter.filter((target) => target.type === "iframe");
const children = [];
for (const iframe of iframeTargets) {
  try {
    const childAttached = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
    const inspect = await send("Runtime.evaluate", { expression: "({href:location.href,readyState:document.readyState,root:document.querySelector('#root')?.innerText?.slice(0,500)||'',body:document.body?.innerText?.slice(0,500)||''})", returnByValue:true }, childAttached.sessionId);
    children.push({target:{id:iframe.targetId,url:iframe.url,title:iframe.title},inspect:inspect?.result?.value});
  } catch (error) { children.push({target:iframe,error:String(error)}); }
}
console.log(JSON.stringify({before:before?.result?.value,clicked:clicked?.result?.value,parent:parent?.result?.value,children,targets:targetsAfter.filter((target)=>target.type==='page'||target.type==='webview').map((target)=>({type:target.type,url:target.url,title:target.title}))},null,2));
socket.close();

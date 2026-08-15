import fs from "node:fs/promises";

const bundle = await fs.readFile("taskbord/dist/web/assets/index-DqXVTWZL.js", "utf8");
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
const main = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "page" && target.url.startsWith("app://"));
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const parentSession = attached.sessionId;
const blobDocument = "<!doctype html><html><head></head><body><div id='root'></div></body></html>";
const blob = await send("Runtime.evaluate", {
  expression: `(() => { const frame = document.querySelector('iframe#codex-taskboard-frame'); const url = URL.createObjectURL(new Blob([${JSON.stringify(blobDocument)}], { type: 'text/html' })); frame.src = url; return url; })()`,
  returnByValue: true,
}, parentSession);
await new Promise((resolve) => setTimeout(resolve, 500));
const iframe = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "iframe");
const child = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
const childSession = child.sessionId;
const scriptUrl = await send("Runtime.evaluate", {
  expression: `URL.createObjectURL(new Blob([${JSON.stringify(bundle)}], {type:'text/javascript'}))`,
  returnByValue: true,
}, childSession);
const script = await send("Runtime.evaluate", {
  expression: `(() => { const script=document.createElement('script'); script.type='module'; script.src=${JSON.stringify(scriptUrl.result.value)}; document.head.appendChild(script); return script.src; })()`,
  returnByValue: true,
}, childSession);
await new Promise((resolve) => setTimeout(resolve, 6000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,300)||'',bodyText:document.body?.innerText?.slice(0,300)||'',errors:globalThis.__testErrors||[]})",
  returnByValue: true,
}, childSession);
console.log(JSON.stringify({ script: script?.result?.value, inspect: inspect?.result?.value }, null, 2));
socket.close();

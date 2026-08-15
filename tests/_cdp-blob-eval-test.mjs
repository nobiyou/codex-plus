import fs from "node:fs/promises";

const bundle = (await fs.readFile("taskbord/dist/web/assets/index-DqXVTWZL.js", "utf8"))
  .replaceAll("import.meta.resolve?import.meta.resolve(e):new URL(e,import.meta.url).href", "new URL(e,document.baseURI).href")
  .replaceAll("import.meta.url", "document.baseURI")
  .replace(/export\{[^}]+\};?\s*$/, "");
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
const blobDocument = "<!doctype html><html lang='en'><head><base href='http://127.0.0.1:47823/06b415639c554e648fc857c4ed1981ad/?host=codex'></head><body><div id='root'></div></body></html>";
const blob = await send("Runtime.evaluate", {
  expression: `(() => { const frame = document.querySelector('iframe#codex-taskboard-frame'); const url = URL.createObjectURL(new Blob([${JSON.stringify(blobDocument)}], { type: 'text/html' })); frame.src = url; return url; })()`,
  returnByValue: true,
}, parentSession);
await new Promise((resolve) => setTimeout(resolve, 500));
const iframe = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "iframe");
const child = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
const childSession = child.sessionId;
await send("Runtime.enable", {}, childSession);
await send("Network.enable", {}, childSession);
const childEvents = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.sessionId !== childSession) return;
  if (["Runtime.exceptionThrown", "Runtime.consoleAPICalled", "Network.loadingFailed", "Network.responseReceived"].includes(message.method)) {
    childEvents.push({ method: message.method, params: message.params });
  }
});
const evaluated = await send("Runtime.evaluate", {
  expression: `(() => { try { (0, eval)(${JSON.stringify(bundle)}); return { ok: true }; } catch (error) { return { ok: false, error: String(error?.stack || error) }; } })()`,
  returnByValue: true,
  awaitPromise: true,
}, childSession);
const fetchProbe = await send("Runtime.evaluate", {
  expression: "fetch('api/projects').then(async (response)=>({status:response.status,body:(await response.text()).slice(0,200)})).catch((error)=>({error:String(error?.stack||error)}))",
  returnByValue: true,
  awaitPromise: true,
}, childSession);
await new Promise((resolve) => setTimeout(resolve, 5000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,400)||'',bodyText:document.body?.innerText?.slice(0,400)||''})",
  returnByValue: true,
}, childSession);
console.log(JSON.stringify({ evaluated: evaluated?.result?.value, fetchProbe: fetchProbe?.result?.value, inspect: inspect?.result?.value, events: childEvents.slice(-40).map((event) => ({ method: event.method, params: event.method === "Runtime.exceptionThrown" ? {description: event.params.exceptionDetails?.exception?.description, text: event.params.exceptionDetails?.text} : event.method === "Network.loadingFailed" ? {errorText: event.params.errorText, blockedReason: event.params.blockedReason} : event.method === "Network.responseReceived" ? {url: event.params.response?.url, status: event.params.response?.status} : {type: event.params.type, args: event.params.args?.map((arg) => arg.value)}})) }, null, 2));
socket.close();

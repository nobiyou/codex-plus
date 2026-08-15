const pageUrl = "http://127.0.0.1:47823/06b415639c554e648fc857c4ed1981ad/?host=codex";
const sourceResponse = await fetch(pageUrl);
const sourceHtml = await sourceResponse.text();
const head = sourceHtml.match(/<head\b[^>]*>/i);
const html = sourceHtml.replace(head[0], `${head[0]}<base href=${JSON.stringify(pageUrl)}>`);
const browserUrl = (await (await fetch("http://127.0.0.1:9230/json/version")).json()).webSocketDebuggerUrl;
const socket = new WebSocket(browserUrl);
let nextId = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const contexts = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.executionContextCreated") contexts.push(message.params.context);
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
await send("Runtime.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
const created = await send("Runtime.evaluate", {
  expression: "(() => { document.querySelector('#codex-taskboard-frame')?.remove(); const f=document.createElement('iframe'); f.id='codex-taskboard-frame'; f.name='codex-taskboard-full-html'; f.setAttribute('sandbox','allow-scripts allow-forms allow-modals allow-downloads'); f.src='about:blank'; document.body.appendChild(f); return true; })()",
  returnByValue: true,
}, sessionId);
await new Promise((resolve) => setTimeout(resolve, 800));
const tree = await send("Page.getFrameTree", {}, sessionId);
function findFrame(node) {
  if (node?.frame?.name === "codex-taskboard-full-html") return node.frame;
  for (const child of node?.childFrames ?? []) { const match = findFrame(child); if (match) return match; }
  return null;
}
const frame = findFrame(tree.frameTree);
if (!frame) throw new Error("frame not found");
const removedCsp = await send("Runtime.evaluate", {
  expression: "(() => { const metas=[...document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')]; metas.forEach((meta)=>meta.remove()); return metas.length; })()",
  returnByValue: true,
}, sessionId);
await send("Page.setDocumentContent", { frameId: frame.id, html }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 7000));
const frameContext = contexts.find((context) => context.auxData?.frameId === frame.id && context.auxData?.isDefault);
const frameEvents = [];
const requestUrls = new Map();
const frameEventListener = (event) => {
  const message = JSON.parse(event.data);
  if (message.sessionId !== sessionId) return;
  if (message.method === "Network.requestWillBeSent") {
    requestUrls.set(message.params.requestId, message.params.request);
  }
  if (message.method === "Runtime.exceptionThrown" || message.method === "Runtime.consoleAPICalled" || message.method === "Network.loadingFailed" || message.method === "Network.responseReceived") {
    frameEvents.push(message);
  }
};
socket.addEventListener("message", frameEventListener);
await send("Network.enable", {}, sessionId);
const bundle = (await import("node:fs/promises")).readFile("taskbord/dist/web/assets/index-DqXVTWZL.js", "utf8");
const compatibleBundle = (await bundle)
  .replaceAll("import.meta.resolve?import.meta.resolve(e):new URL(e,import.meta.url).href", "new URL(e,document.baseURI).href")
  .replaceAll("import.meta.url", "document.baseURI")
  .replace(/export\{[^}]+\};?\s*$/, "");
const evaluated = frameContext ? await send("Runtime.evaluate", {
  expression: `(() => { globalThis.__CODEX_TASKBOARD_FRAME_CAPABILITY__="full-html-test"; try { (0, eval)(${JSON.stringify(compatibleBundle)}); return {ok:true}; } catch(error) { return {ok:false,error:String(error?.stack||error)}; } })()`,
  contextId: frameContext.id,
  returnByValue: true,
  awaitPromise: true,
}, sessionId) : null;
await new Promise((resolve) => setTimeout(resolve, 6000));
const fetchProbe = frameContext ? await send("Runtime.evaluate", {
  expression: "fetch('api/projects').then(async (response)=>({status:response.status,body:(await response.text()).slice(0,200)})).catch((error)=>({error:String(error?.stack||error)}))",
  contextId: frameContext.id,
  returnByValue: true,
  awaitPromise: true,
}, sessionId) : null;
const inspect = frameContext ? await send("Runtime.evaluate", {
  expression: "({href:location.href,origin:location.origin,baseURI:document.baseURI,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,700)||'',bodyText:document.body?.innerText?.slice(0,700)||''})",
  contextId: frameContext.id,
  returnByValue: true,
}, sessionId) : null;
console.log(JSON.stringify({ created: created?.result?.value, removedCsp: removedCsp?.result?.value, frame: { id: frame.id, url: frame.url, name: frame.name }, contexts: contexts.filter((context) => context.auxData?.frameId === frame.id).map((context) => ({id:context.id,auxData:context.auxData})), evaluated: evaluated?.result?.value, fetchProbe: fetchProbe?.result?.value, inspect: inspect?.result?.value ?? inspect, requests: [...requestUrls.entries()].map(([requestId, request]) => ({requestId, url: request.url, method: request.method, headers: {origin: request.headers?.Origin, referer: request.headers?.Referer}})), events: frameEvents.slice(-40).map((event) => ({method:event.method, params:event.method === "Runtime.exceptionThrown" ? {description:event.params.exceptionDetails?.exception?.description,text:event.params.exceptionDetails?.text} : event.method === "Network.loadingFailed" ? {requestId:event.params.requestId,url:requestUrls.get(event.params.requestId)?.url,errorText:event.params.errorText,blockedReason:event.params.blockedReason} : event.method === "Network.responseReceived" ? {requestId:event.params.requestId,url:event.params.response?.url,status:event.params.response?.status,headers: {allowOrigin:event.params.response?.headers?.["access-control-allow-origin"],allowPrivate:event.params.response?.headers?.["access-control-allow-private-network"]}} : {type:event.params.type,args:event.params.args?.map((arg)=>arg.value)}})) }, null, 2));
socket.close();

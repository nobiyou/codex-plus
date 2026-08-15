import crypto from "node:crypto";
import fs from "node:fs/promises";

const token = (await fs.readFile("C:/Users/ltxxg/AppData/Local/Codex-Plus-Pro/taskboard/instance-token.txt", "utf8")).trim();
const pageUrl = `http://127.0.0.1:47823/${token}/?host=codex`;
const challenge = crypto.randomBytes(32).toString("hex");
const response = await fetch(pageUrl, { headers: { origin: "app://-", "x-codex-taskboard-challenge": challenge } });
const html = await response.text();
const head = html.match(/<head\b[^>]*>/i);
const documentHtml = html.replace(head[0], `${head[0]}<base href=${JSON.stringify(pageUrl)}><script>globalThis.__CODEX_TASKBOARD_FRAME_CAPABILITY__=\"blob-test\";</script>`);

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
const sessionId = attached.sessionId;
const removed = await send("Runtime.evaluate", {
  expression: "(() => { const metas=[...document.querySelectorAll('meta[http-equiv=Content-Security-Policy]')]; metas.forEach((meta)=>meta.remove()); return metas.length; })()",
  returnByValue: true,
}, sessionId);
const blob = await send("Runtime.evaluate", {
  expression: `(() => { const blob = new Blob([${JSON.stringify(documentHtml)}], { type: "text/html" }); return URL.createObjectURL(blob); })()`,
  returnByValue: true,
}, sessionId);
const tree = await send("Page.getFrameTree", {}, sessionId);
function findFrame(node) {
  if (node?.frame?.name?.startsWith("codex-taskboard-")) return node.frame;
  for (const child of node?.childFrames ?? []) {
    const match = findFrame(child);
    if (match) return match;
  }
  return null;
}
const frame = findFrame(tree.frameTree);
const navigation = await send("Page.navigate", { frameId: frame.id, url: blob.result.value }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 5000));
const targets = (await send("Target.getTargets")).targetInfos;
const iframe = targets.find((target) => target.type === "iframe");
let inspect = null;
if (iframe) {
  const child = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
  inspect = await send("Runtime.evaluate", {
    expression: "({href:location.href,origin:location.origin,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,300)||'',bodyText:document.body?.innerText?.slice(0,300)||'',scripts:Array.from(document.scripts).map((node)=>node.src).filter(Boolean)})",
    returnByValue: true,
  }, child.sessionId);
}
console.log(JSON.stringify({ removed: removed?.result?.value, navigation, iframe: iframe?.url, inspect: inspect?.result?.value ?? inspect }, null, 2));
socket.close();

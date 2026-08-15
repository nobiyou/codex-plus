import fs from "node:fs/promises";
import crypto from "node:crypto";

const token = (await fs.readFile("C:/Users/ltxxg/AppData/Local/Codex-Plus-Pro/taskboard/instance-token.txt", "utf8")).trim();
const url = `http://127.0.0.1:47823/${token}/?host=codex`;
const response = await fetch(url, { headers: { origin: "app://-", "x-codex-taskboard-challenge": crypto.randomBytes(32).toString("hex") } });
const html = await response.text();
const documentHtml = html.replace(/<head\b[^>]*>/i, (head) => `${head}<base href=${JSON.stringify(url)}>`);

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
const attached = await send("Target.attachToTarget", { targetId: main.targetId, flatten: true });
const sessionId = attached.sessionId;
await send("Page.setBypassCSP", { enabled: false }, sessionId);
const result = await send("Runtime.evaluate", {
  expression: `(() => {
    const frame = document.querySelector('iframe#codex-taskboard-frame');
    if (!frame) return { found: false };
    const blob = new Blob([${JSON.stringify(documentHtml)}], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    frame.src = blobUrl;
    return { found: true, blobUrl };
  })()`,
  returnByValue: true,
}, sessionId);
await new Promise((resolve) => setTimeout(resolve, 3500));
const finalTargets = (await send("Target.getTargets")).targetInfos;
const childTarget = finalTargets.find((target) => target.type === "iframe");
let inspect = null;
if (childTarget) {
  const child = await send("Target.attachToTarget", { targetId: childTarget.targetId, flatten: true });
  inspect = await send("Runtime.evaluate", {
    expression: "({href:location.href,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,300)||'',bodyText:document.body?.innerText?.slice(0,300)||''})",
    returnByValue: true,
  }, child.sessionId);
}
console.log(JSON.stringify({ result: result?.result?.value, childUrl: childTarget?.url?.replace(/\/[0-9a-f]{20,}/g, "/<redacted>"), inspect: inspect?.result?.value ?? inspect }, null, 2));
socket.close();

import crypto from "node:crypto";
import fs from "node:fs/promises";

const token = (await fs.readFile("C:/Users/ltxxg/AppData/Local/Codex-Plus-Pro/taskboard/instance-token.txt", "utf8")).trim();
const pageUrl = `http://127.0.0.1:47823/${token}/?host=codex`;
const bundle = await fs.readFile("taskbord/dist/web/assets/index-DqXVTWZL.js", "utf8");
const styles = await fs.readFile("taskbord/dist/web/assets/index-D3PwjGsb.css", "utf8");

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
const blobDocument = `<!doctype html><html lang="en"><head><base href=${JSON.stringify(pageUrl)}><style>${styles}</style></head><body><div id="root"></div></body></html>`;
const blob = await send("Runtime.evaluate", {
  expression: `(() => { const frame = document.querySelector('iframe#codex-taskboard-frame'); const url = URL.createObjectURL(new Blob([${JSON.stringify(blobDocument)}], { type: 'text/html' })); frame.src = url; return url; })()`,
  returnByValue: true,
}, parentSession);
await new Promise((resolve) => setTimeout(resolve, 1000));
const iframe = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "iframe");
const child = await send("Target.attachToTarget", { targetId: iframe.targetId, flatten: true });
const childSession = child.sessionId;
const evaluated = await send("Runtime.evaluate", {
  expression: `(() => {
  globalThis.__CODEX_TASKBOARD_FRAME_CAPABILITY__ = "blob-test-capability";
  try {
    (0, eval)(${JSON.stringify(bundle)});
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.stack || error) };
  }
})()`,
  returnByValue: true,
  awaitPromise: true,
}, childSession);
await new Promise((resolve) => setTimeout(resolve, 5000));
const inspect = await send("Runtime.evaluate", {
  expression: "({href:location.href,origin:location.origin,readyState:document.readyState,rootChildren:document.querySelector('#root')?.children.length??-1,rootText:document.querySelector('#root')?.innerText?.slice(0,500)||'',bodyText:document.body?.innerText?.slice(0,500)||'',capability:globalThis.__CODEX_TASKBOARD_FRAME_CAPABILITY__})",
  returnByValue: true,
}, childSession);
console.log(JSON.stringify({ blob: blob?.result?.value, evaluated: evaluated?.result?.value, inspect: inspect?.result?.value }, null, 2));
socket.close();

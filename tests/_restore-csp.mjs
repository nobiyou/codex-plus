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
const target = (await send("Target.getTargets")).targetInfos.find((item) => item.type === "page" && item.url.startsWith("app://"));
const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
const result = await send("Runtime.evaluate", {
  expression: "(() => { if (document.head.querySelector('meta[http-equiv=Content-Security-Policy]')) return false; const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = \"default-src 'none'; img-src 'self' app: blob: data: https:; child-src 'self' blob: codex-sandbox://*.web-sandbox.oaiusercontent.com codex-sandbox://web-sandbox.oaiusercontent.com https://*.web-sandbox.oaiusercontent.com https://web-sandbox.oaiusercontent.com; frame-src 'self' blob: codex-sandbox://*.web-sandbox.oaiusercontent.com codex-sandbox://web-sandbox.oaiusercontent.com https://*.web-sandbox.oaiusercontent.com https://web-sandbox.oaiusercontent.com; worker-src 'self' blob:; script-src 'self' 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' app: blob: data:; connect-src 'self' https://ab.chatgpt.com https://api.mapbox.com https://cdn.openai.com https://events.mapbox.com https://learn.chatgpt.com wss://chatgpt.com wss://ws.chatgpt-staging.com wss://ws.chatgpt.com;\"; document.head.appendChild(meta); return true; })()",
  returnByValue: true,
}, attached.sessionId);
console.log(JSON.stringify(result?.result?.value ?? null));
socket.close();
setTimeout(() => process.exit(0), 100);

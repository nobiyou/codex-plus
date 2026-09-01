import { spawnSync } from "node:child_process";

function fallbackSignal(child, signal) {
  if (Number.isInteger(child?.pid)) {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch {}
  }
  try {
    child?.kill(signal);
    return true;
  } catch {
    return false;
  }
}

export function signalProcessTree(child, signal = "SIGTERM") {
  if (!child) return false;
  if (process.platform === "win32" && Number.isInteger(child.pid)) {
    try {
      const result = spawnSync(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      if (!result.error && result.status === 0) return true;
    } catch {}
  }
  return fallbackSignal(child, signal);
}

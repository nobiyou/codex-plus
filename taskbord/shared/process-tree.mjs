import { spawn, spawnSync } from "node:child_process";

function usesWindowsShell(child) {
  return [child?.spawnfile, ...(Array.isArray(child?.spawnargs) ? child.spawnargs : [])]
    .some((value) => /\.(?:cmd|bat)(?:[\s"']|$)/i.test(String(value)));
}

function requestWindowsTreeKill(rootPid) {
  try {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(rootPid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true, detached: true },
    );
    killer.unref();
    return true;
  } catch {
    return false;
  }
}

function windowsDescendantPids(rootPid) {
  const pending = [rootPid];
  const descendants = [];
  const seen = new Set([rootPid]);
  while (pending.length > 0) {
    const parentPid = pending.shift();
    let result;
    try {
      result = spawnSync(
        "wmic.exe",
        ["process", "where", `ParentProcessId=${parentPid}`, "get", "ProcessId", "/value"],
        { encoding: "utf8", windowsHide: true },
      );
    } catch {
      return descendants;
    }
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") continue;
    for (const match of result.stdout.matchAll(/(?:^|\r*\n)ProcessId=(\d+)/g)) {
      const pid = Number(match[1]);
      if (!Number.isInteger(pid) || seen.has(pid)) continue;
      seen.add(pid);
      descendants.push(pid);
      pending.push(pid);
    }
  }
  return descendants.reverse();
}

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
    const shellWrapper = usesWindowsShell(child);
    if (!shellWrapper && requestWindowsTreeKill(child.pid)) return true;
    try {
      const result = spawnSync(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
      if (!result.error && result.status === 0 && !shellWrapper) return true;
    } catch {}
    let terminated = false;
    for (const pid of windowsDescendantPids(child.pid)) {
      try {
        const result = spawnSync(
          "taskkill.exe",
          ["/PID", String(pid), "/F"],
          { stdio: "ignore", windowsHide: true },
        );
        terminated ||= !result.error && result.status === 0;
      } catch {}
    }
    if (terminated) return true;
  }
  return fallbackSignal(child, signal);
}

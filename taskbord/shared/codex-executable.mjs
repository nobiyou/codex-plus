import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";

function executableFile(candidate, platform = process.platform) {
  try {
    accessSync(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function executableOnPath(env, platform = process.platform) {
  const names = platform === "win32"
    ? ["codex.exe", "codex.cmd", "codex.bat", "codex"]
    : ["codex"];
  const directories = (env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const directory of directories) {
      const candidate = executableFile(path.join(directory, name), platform);
      if (candidate) return candidate;
    }
  }
  return null;
}

export function codexExecutableInApp(appPath, platform = process.platform) {
  return platform === "win32"
    ? path.join(appPath, "resources", "codex.exe")
    : path.join(appPath, "Contents", "Resources", "codex");
}

export function resolveCodexExecutable({
  explicit = process.env.CODEX_EXECUTABLE,
  appPath,
  env = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
} = {}) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  if (appPath) {
    const bundled = executableFile(codexExecutableInApp(appPath, platform), platform);
    if (bundled) return bundled;
  }

  const installedCli = executableOnPath(env, platform);
  if (installedCli) return installedCli;

  if (platform === "darwin") {
    for (const applicationDirectory of ["/Applications", path.join(homeDirectory, "Applications")]) {
      for (const applicationName of ["ChatGPT.app", "Codex.app"]) {
        const bundled = executableFile(codexExecutableInApp(
          path.join(applicationDirectory, applicationName),
          platform,
        ), platform);
        if (bundled) return bundled;
      }
    }
  }

  return "codex";
}

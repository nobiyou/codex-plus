import path from "node:path";

export function codexSpawnOptions(executable, options = {}) {
  if (process.platform !== "win32") return options;
  const extension = path.extname(executable).toLowerCase();
  if (extension !== ".cmd" && extension !== ".bat") return options;
  return { ...options, shell: true };
}

export function codexExecFileOptions(executable, options = {}) {
  if (process.platform !== "win32") return options;
  const extension = path.extname(executable).toLowerCase();
  if (extension !== ".cmd" && extension !== ".bat") return options;
  return { ...options, shell: true };
}

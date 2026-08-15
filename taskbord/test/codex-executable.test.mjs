import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  codexExecutableInApp,
  resolveCodexExecutable,
} from "../shared/codex-executable.mjs";

test("Windows resolution prefers a real Codex executable over npm shell shims", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-executable-"));
  const npmDirectory = path.join(directory, "npm");
  const appResources = path.join(directory, "app", "resources");
  await mkdir(npmDirectory, { recursive: true });
  await mkdir(appResources, { recursive: true });
  await writeFile(path.join(npmDirectory, "codex.cmd"), "@echo off");
  await writeFile(path.join(appResources, "codex.exe"), "binary");
  try {
    assert.equal(
      resolveCodexExecutable({
        platform: "win32",
        env: { PATH: [npmDirectory, appResources].join(path.delimiter) },
      }),
      path.join(appResources, "codex.exe"),
    );
    assert.equal(
      codexExecutableInApp(path.join(directory, "app"), "win32"),
      path.join(appResources, "codex.exe"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Windows resolution falls back to the npm cmd shim when no exe is installed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-executable-"));
  const shim = path.join(directory, "codex.cmd");
  await writeFile(shim, "@echo off");
  try {
    assert.equal(
      resolveCodexExecutable({
        platform: "win32",
        env: { PATH: directory },
      }),
      shim,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

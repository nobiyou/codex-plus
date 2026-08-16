import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readLatestAutomationRunFailure } from "../shared/codex-automation-runs.mjs";

test("reads the terminal failure for the matching automation rollout", async () => {
  const codexHomePath = await mkdtemp(path.join(os.tmpdir(), "codex-automation-runs-"));
  try {
    const sessionId = "01test-automation-failure";
    const updatedAt = "2026-08-15T14:26:15.000Z";
    const dayPath = path.join(codexHomePath, "sessions", "2026", "08", "15");
    await mkdir(dayPath, { recursive: true });
    await writeFile(
      path.join(codexHomePath, "session_index.jsonl"),
      `${JSON.stringify({
        id: sessionId,
        thread_name: "Taskboard 自动认领 · project-1",
        updated_at: updatedAt,
      })}\n`,
    );
    await writeFile(
      path.join(dayPath, `rollout-2026-08-15T22-26-11-${sessionId}.jsonl`),
      `${JSON.stringify({
        timestamp: updatedAt,
        type: "event_msg",
        payload: {
          type: "task_complete",
          last_agent_message: null,
          error: { message: "unexpected status 503 Service Unavailable" },
        },
      })}\n`,
    );

    assert.deepEqual(
      await readLatestAutomationRunFailure({
        codexHomePath,
        automationName: "Taskboard 自动认领 · project-1",
        lastRunAt: Date.parse("2026-08-15T14:26:01.000Z"),
        now: Date.parse("2026-08-15T14:30:00.000Z"),
      }),
      {
        kind: "run-failed",
        runAt: Date.parse("2026-08-15T14:26:01.000Z"),
        message: "unexpected status 503 Service Unavailable",
      },
    );
  } finally {
    await rm(codexHomePath, { recursive: true, force: true });
  }
});

test("does not report a successful or unrelated automation rollout", async () => {
  const codexHomePath = await mkdtemp(path.join(os.tmpdir(), "codex-automation-runs-"));
  try {
    const updatedAt = "2026-08-15T14:26:15.000Z";
    const dayPath = path.join(codexHomePath, "sessions", "2026", "08", "15");
    await mkdir(dayPath, { recursive: true });
    await writeFile(
      path.join(codexHomePath, "session_index.jsonl"),
      `${JSON.stringify({
        id: "01unrelated",
        thread_name: "Other automation",
        updated_at: updatedAt,
      })}\n`,
    );

    assert.equal(
      await readLatestAutomationRunFailure({
        codexHomePath,
        automationName: "Taskboard 自动认领 · project-1",
        lastRunAt: Date.parse("2026-08-15T14:26:01.000Z"),
        now: Date.parse("2026-08-15T14:30:00.000Z"),
      }),
      null,
    );
  } finally {
    await rm(codexHomePath, { recursive: true, force: true });
  }
});

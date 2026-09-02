import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { TaskboardDatabase } from "../server/database.mjs";

const actor = {
  type: "user",
  id: "task-run-database-tester",
  name: "Task Run Database Tester",
  avatarUrl: null,
};

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taskboard-task-run-database-"));
  const filename = path.join(directory, "taskboard.sqlite");
  const database = new TaskboardDatabase(filename);
  database.createProject({ id: "task-run-project", name: "Task Run Project", workspacePath: "/tmp/task-run-project" });
  const task = database.createTask({
    projectId: "task-run-project",
    title: "Task run fixture",
    description: "",
    status: "todo",
    priority: "none",
    labels: [],
    threadId: null,
    actor,
    assignee: actor,
    workflowId: null,
    developmentContext: null,
    startDate: null,
    dueDate: null,
    recurrence: null,
  });
  return {
    database,
    filename,
    directory,
    task,
    async close() {
      this.database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function claimInput(overrides = {}) {
  return {
    leaseOwner: "worker-1",
    fencingToken: "fence-1",
    claimedAt: "2026-09-01T10:00:00.000Z",
    leaseExpiresAt: "2026-09-01T10:05:00.000Z",
    ...overrides,
  };
}

function authorityInput(overrides = {}) {
  return {
    leaseOwner: "worker-1",
    fencingToken: "fence-1",
    ...overrides,
  };
}

test("task run tables and indexes survive fresh creation and database reopen", async () => {
  const fixture = await createFixture();
  try {
    const first = fixture.database.createTaskRun({
      id: "task-run-1",
      taskId: fixture.task.id,
      codexThreadId: "codex-thread-1",
      codexProjectKind: "local",
      codexHostId: "local",
      baseSha: "abc123",
    });
    assert.deepEqual(
      fixture.database.database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'task_run%'").all()
        .map((row) => row.name).sort(),
      ["task_run_events", "task_runs"],
    );
    assert.deepEqual(
      fixture.database.database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name LIKE 'task_run%'").all()
        .map((row) => row.name).sort(),
      ["task_run_events_run_sequence", "task_runs_one_active", "task_runs_task_attempt", "task_runs_task_created"],
    );
    assert.equal(first.status, "queued");
    assert.equal(first.attempt, 1);
    assert.equal(first.workspacePath, "/tmp/task-run-project");

    fixture.database.close();
    fixture.database = new TaskboardDatabase(fixture.filename);
    assert.equal(fixture.database.getTaskRun("task-run-1").status, "queued");
  } finally {
    await fixture.close();
  }
});

test("task run attempts, leases, events, expiry fencing, and completion are atomic", async () => {
  const fixture = await createFixture();
  try {
    const first = fixture.database.createTaskRun({ id: "task-run-1", taskId: fixture.task.id });
    const second = fixture.database.createTaskRun({ id: "task-run-2", taskId: fixture.task.id });
    assert.equal(first.attempt, 1);
    assert.equal(second.attempt, 2);

    fixture.database.claimTaskRun(first.id, claimInput());
    assert.throws(
      () => fixture.database.claimTaskRun(second.id, claimInput({ fencingToken: "fence-2" })),
      { code: "TASK_RUN_CONFLICT" },
    );
    assert.equal(fixture.database.getTaskRun(second.id).status, "queued");

    fixture.database.startTaskRun(first.id, {
      ...authorityInput(),
      startedAt: "2026-09-01T10:00:01.000Z",
    });
    const eventOne = fixture.database.insertTaskRunEvent(first.id, {
      ...authorityInput(),
      kind: "run.started",
      source: "taskboard",
      content: "Task run started",
      data: { aiChatRunId: "ai-run-1" },
      createdAt: "2026-09-01T10:00:01.000Z",
    });
    const eventTwo = fixture.database.insertTaskRunEvent(first.id, {
      ...authorityInput(),
      kind: "provider.event",
      source: "codex",
      content: "Visible answer",
      data: { type: "agent_message" },
      createdAt: "2026-09-01T10:00:02.000Z",
    });
    assert.deepEqual(fixture.database.listTaskRunEvents(first.id).map((event) => event.sequence), [1, 2]);
    assert.equal(eventOne.data.aiChatRunId, "ai-run-1");
    assert.equal(eventTwo.data.type, "agent_message");

    const beforeStaleHeartbeat = fixture.database.getTaskRun(first.id);
    assert.throws(
      () => fixture.database.heartbeatTaskRun(first.id, {
        ...authorityInput({ fencingToken: "stale-token" }),
        heartbeatAt: "2026-09-01T10:00:03.000Z",
        leaseExpiresAt: "2026-09-01T10:10:00.000Z",
      }),
      { code: "TASK_RUN_CONFLICT" },
    );
    assert.equal(fixture.database.getTaskRun(first.id).leaseExpiresAt, beforeStaleHeartbeat.leaseExpiresAt);

    const interrupted = fixture.database.interruptExpiredTaskRuns({
      timestamp: "2026-09-01T10:06:00.000Z",
      reason: "Worker lease expired",
    });
    assert.equal(interrupted.length, 1);
    assert.equal(interrupted[0].id, first.id);
    assert.equal(interrupted[0].status, "interrupted");
    assert.equal(interrupted[0].failureClass, "interrupted");
    assert.throws(
      () => fixture.database.insertTaskRunEvent(first.id, {
        ...authorityInput(),
        kind: "late.event",
        source: "runner",
        content: "Must be rejected",
        createdAt: "2026-09-01T10:06:01.000Z",
      }),
      { code: "TASK_RUN_CONFLICT" },
    );
    assert.equal(fixture.database.listTaskRunEvents(first.id).length, 2);

    fixture.database.claimTaskRun(second.id, claimInput({
      fencingToken: "fence-2",
      claimedAt: "2026-09-01T10:07:00.000Z",
      leaseExpiresAt: "2026-09-01T10:12:00.000Z",
    }));
    fixture.database.startTaskRun(second.id, {
      leaseOwner: "worker-1",
      fencingToken: "fence-2",
      startedAt: "2026-09-01T10:07:01.000Z",
    });
    const completed = fixture.database.completeTaskRun(second.id, {
      leaseOwner: "worker-1",
      fencingToken: "fence-2",
      status: "completed",
      exitCode: 0,
      outputSummary: "Provider completed",
      verificationEvidence: { checks: ["focused tests"] },
      finishedAt: "2026-09-01T10:08:00.000Z",
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.leaseExpiresAt, null);
    assert.deepEqual(completed.verificationEvidence, { checks: ["focused tests"] });
    assert.throws(
      () => fixture.database.completeTaskRun(second.id, {
        leaseOwner: "worker-1",
        fencingToken: "fence-2",
        status: "completed",
        finishedAt: "2026-09-01T10:08:01.000Z",
      }),
      { code: "TASK_RUN_CONFLICT" },
    );

    const malformed = fixture.database.getTaskRun(second.id);
    assert.throws(
      () => fixture.database.completeTaskRun(second.id, {
        leaseOwner: "worker-1",
        fencingToken: "fence-2",
        status: "failed",
        finishedAt: "2026-09-01T10:08:02.000Z",
      }),
      { code: "TASK_RUN_INVALID_FAILURE_CLASS" },
    );
    assert.deepEqual(fixture.database.getTaskRun(second.id), malformed);
  } finally {
    await fixture.close();
  }
});

test("task run event and result fields reject malformed or oversized structured data", async () => {
  const fixture = await createFixture();
  try {
    const run = fixture.database.createTaskRun({ id: "task-run-1", taskId: fixture.task.id });
    fixture.database.claimTaskRun(run.id, claimInput());
    fixture.database.startTaskRun(run.id, { ...authorityInput(), startedAt: "2026-09-01T10:00:01.000Z" });
    assert.throws(
      () => fixture.database.insertTaskRunEvent(run.id, {
        ...authorityInput(),
        kind: "provider.event",
        source: "codex",
        content: "bad data",
        data: "not-json",
      }),
      { code: "TASK_RUN_INVALID_JSON" },
    );
    assert.throws(
      () => fixture.database.insertTaskRunEvent(run.id, {
        ...authorityInput(),
        kind: "provider.event",
        source: "codex",
        content: "x".repeat(8_193),
      }),
      { code: "TASK_RUN_FIELD_TOO_LARGE" },
    );
    assert.equal(fixture.database.listTaskRunEvents(run.id).length, 0);
  } finally {
    await fixture.close();
  }
});

test("deleting a task cascades task runs and their normalized events", async () => {
  const fixture = await createFixture();
  try {
    const run = fixture.database.createTaskRun({ id: "task-run-1", taskId: fixture.task.id });
    fixture.database.claimTaskRun(run.id, claimInput());
    fixture.database.startTaskRun(run.id, { ...authorityInput(), startedAt: "2026-09-01T10:00:01.000Z" });
    fixture.database.insertTaskRunEvent(run.id, {
      ...authorityInput(),
      kind: "provider.event",
      source: "codex",
      content: "Visible output",
      createdAt: "2026-09-01T10:00:02.000Z",
    });

    fixture.database.database.prepare("DELETE FROM tasks WHERE id = ?").run(fixture.task.id);
    assert.equal(fixture.database.getTaskRun(run.id), null);
    assert.equal(fixture.database.database.prepare("SELECT COUNT(*) AS count FROM task_run_events").get().count, 0);
  } finally {
    await fixture.close();
  }
});

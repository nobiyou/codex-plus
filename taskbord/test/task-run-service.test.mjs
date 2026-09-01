import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { TaskboardDatabase } from "../server/database.mjs";
import {
  DEFAULT_TASK_RUN_LEASE_MS,
  TaskRunService,
} from "../server/task-run.mjs";

const actor = {
  type: "user",
  id: "task-run-service-tester",
  name: "Task Run Service Tester",
  avatarUrl: null,
};

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taskboard-task-run-service-"));
  const database = new TaskboardDatabase(path.join(directory, "taskboard.sqlite"));
  database.createProject({ id: "task-run-project", name: "Task Run Project", workspacePath: "/tmp/task-run-project" });
  const task = database.createTask({
    projectId: "task-run-project",
    title: "Task run service fixture",
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
  let current = new Date("2026-09-01T10:00:00.000Z");
  const service = new TaskRunService({
    database,
    clock: () => current,
    leaseMs: DEFAULT_TASK_RUN_LEASE_MS,
  });
  return {
    database,
    service,
    task,
    setTime(value) {
      current = new Date(value);
    },
    async close() {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function createTask(database, title, status = "todo") {
  return database.createTask({
    projectId: "task-run-project",
    title,
    description: "",
    status,
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
}

function completeSuccessfulRun(fixture, task, id) {
  const created = fixture.service.create({ id, taskId: task.id });
  const claim = fixture.service.claim(created.id, { leaseOwner: "worker-1" });
  fixture.service.start(created.id, claim.authority);
  const completed = fixture.service.complete(created.id, {
    ...claim.authority,
    exitCode: 0,
  });
  return { completed, authority: claim.authority };
}

test("TaskRunService claims with an opaque token, exposes no token, and supports the lifecycle", async () => {
  const fixture = await createFixture();
  try {
    const created = fixture.service.create({
      taskId: fixture.task.id,
      projectId: "task-run-project",
      workspacePath: "/tmp/task-run-project",
      codexProjectKind: "local",
    });
    assert.equal(Object.hasOwn(created, "fencingToken"), false);

    const claim = fixture.service.claim(created.id, { leaseOwner: "worker-1" });
    assert.equal(claim.run.status, "claimed");
    assert.equal(Object.hasOwn(claim.run, "fencingToken"), false);
    assert.equal(claim.authority.leaseOwner, "worker-1");
    assert.equal(claim.authority.fencingToken.length, 64);

    const started = fixture.service.start(created.id, claim.authority);
    assert.equal(started.status, "running");
    fixture.setTime("2026-09-01T10:00:10.000Z");
    const heartbeat = fixture.service.heartbeat(created.id, claim.authority);
    assert.equal(heartbeat.heartbeatAt, "2026-09-01T10:00:10.000Z");

    const event = fixture.service.event(created.id, {
      ...claim.authority,
      source: "codex",
      kind: "provider.event",
      content: "Visible provider event",
      data: { type: "agent_message", aiChatRunId: "chat-run-1" },
    });
    assert.equal(Object.hasOwn(event, "fencingToken"), false);
    assert.equal(event.sequence, 1);

    fixture.setTime("2026-09-01T10:00:20.000Z");
    const completed = fixture.service.complete(created.id, {
      ...claim.authority,
      exitCode: 0,
      outputSummary: "Provider completed",
      verificationEvidence: { checks: ["provider-exit"] },
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.failureClass, null);
    assert.equal(Object.hasOwn(fixture.service.get(created.id), "fencingToken"), false);
    assert.equal(fixture.database.getTask(fixture.task.id).status, "todo");
  } finally {
    await fixture.close();
  }
});

test("TaskRunService rejects stale authority and turns expired claims into interrupted attempts", async () => {
  const fixture = await createFixture();
  try {
    const first = fixture.service.create({ taskId: fixture.task.id });
    const second = fixture.service.create({ taskId: fixture.task.id });
    const claim = fixture.service.claim(first.id, { leaseOwner: "worker-1", leaseMs: 1_000 });
    fixture.service.start(first.id, claim.authority);
    assert.throws(
      () => fixture.service.heartbeat(first.id, {
        leaseOwner: "worker-2",
        fencingToken: claim.authority.fencingToken,
      }),
      { code: "TASK_RUN_CONFLICT" },
    );

    fixture.setTime("2026-09-01T10:00:02.000Z");
    const secondClaim = fixture.service.claim(second.id, { leaseOwner: "worker-2", leaseMs: 1_000 });
    assert.equal(fixture.service.get(first.id).status, "interrupted");
    assert.equal(fixture.service.get(first.id).failureClass, "interrupted");
    assert.equal(secondClaim.run.status, "claimed");
    assert.throws(
      () => fixture.service.event(first.id, {
        ...claim.authority,
        source: "runner",
        kind: "heartbeat",
        content: "late heartbeat",
      }),
      { code: "TASK_RUN_CONFLICT" },
    );
  } finally {
    await fixture.close();
  }
});

test("TaskRunService normalizes provider failure classes and enforces bounded event data", async () => {
  const fixture = await createFixture();
  try {
    const run = fixture.service.create({ taskId: fixture.task.id });
    const claim = fixture.service.claim(run.id, { leaseOwner: "worker-1" });
    fixture.service.start(run.id, claim.authority);
    assert.throws(
      () => fixture.service.event(run.id, {
        ...claim.authority,
        source: "codex",
        kind: "provider.event",
        content: "hidden payload",
        data: { rawJsonl: "must not persist" },
      }),
      { code: "TASK_RUN_SENSITIVE_DATA" },
    );
    assert.throws(
      () => fixture.service.event(run.id, {
        ...claim.authority,
        source: "codex",
        kind: "unsupported.event",
        content: "bad kind",
      }),
      { code: "TASK_RUN_INVALID_EVENT_KIND" },
    );
    fixture.setTime("2026-09-01T10:00:01.000Z");
    const failed = fixture.service.complete(run.id, {
      ...claim.authority,
      exitCode: 7,
      error: "Codex exited with code 7",
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.failureClass, "provider_exit");
    assert.equal(failed.exitCode, 7);
    assert.equal(fixture.database.listTaskRunEvents(run.id).length, 0);
  } finally {
    await fixture.close();
  }
});

test("verified task runs record evidence and move the task to in_review without marking it done", async () => {
  const fixture = await createFixture();
  try {
    const completed = completeSuccessfulRun(fixture, fixture.task, "verified-run");
    const before = fixture.database.getTask(fixture.task.id);
    const evidence = { checks: ["focused tests", "diff review"] };
    const handoff = fixture.service.promoteVerifiedRunToReview(
      completed.completed.id,
      completed.authority.leaseOwner,
      completed.authority.fencingToken,
      before.version,
      evidence,
      actor,
    );
    assert.equal(handoff.task.status, "in_review");
    assert.equal(handoff.task.version, before.version + 1);
    assert.deepEqual(handoff.run.verificationEvidence, evidence);
    assert.notEqual(handoff.task.status, "done");

    const repeated = fixture.service.promoteVerifiedRunToReview(
      completed.completed.id,
      completed.authority.leaseOwner,
      completed.authority.fencingToken,
      handoff.task.version,
      evidence,
      actor,
    );
    assert.equal(repeated.task.version, handoff.task.version);
  } finally {
    await fixture.close();
  }
});

test("verified handoff rejects stale task versions, stale fencing, done tasks, and failed runs", async () => {
  const fixture = await createFixture();
  try {
    const staleTokenTask = createTask(fixture.database, "Stale token task");
    const staleTokenRun = completeSuccessfulRun(fixture, staleTokenTask, "stale-token-run");
    assert.throws(
      () => fixture.service.promoteVerifiedRunToReview(
        staleTokenRun.completed.id,
        staleTokenRun.authority.leaseOwner,
        "stale-token",
        fixture.database.getTask(staleTokenTask.id).version,
        { checks: ["must reject"] },
        actor,
      ),
      { code: "TASK_RUN_CONFLICT" },
    );
    assert.equal(fixture.database.getTaskRun(staleTokenRun.completed.id).verificationEvidence, null);

    const staleVersionTask = createTask(fixture.database, "Stale version task");
    const staleVersionRun = completeSuccessfulRun(fixture, staleVersionTask, "stale-version-run");
    const oldVersion = fixture.database.getTask(staleVersionTask.id).version;
    fixture.database.updateTask(
      staleVersionTask.id,
      oldVersion,
      { title: "Changed before verification" },
      undefined,
      undefined,
      actor,
    );
    assert.throws(
      () => fixture.service.promoteVerifiedRunToReview(
        staleVersionRun.completed.id,
        staleVersionRun.authority.leaseOwner,
        staleVersionRun.authority.fencingToken,
        oldVersion,
        { checks: ["must reject"] },
        actor,
      ),
      { code: "VERSION_CONFLICT" },
    );
    assert.equal(fixture.database.getTaskRun(staleVersionRun.completed.id).verificationEvidence, null);

    const doneTask = createTask(fixture.database, "Already done task");
    const doneRun = completeSuccessfulRun(fixture, doneTask, "done-task-run");
    const doneBefore = fixture.database.getTask(doneTask.id);
    fixture.database.moveTask(doneTask.id, doneBefore.version, "done", undefined, null, null, actor);
    assert.throws(
      () => fixture.service.promoteVerifiedRunToReview(
        doneRun.completed.id,
        doneRun.authority.leaseOwner,
        doneRun.authority.fencingToken,
        fixture.database.getTask(doneTask.id).version,
        { checks: ["must reject"] },
        actor,
      ),
      { code: "TASK_ALREADY_DONE" },
    );

    const failedTask = createTask(fixture.database, "Failed task");
    const failed = fixture.service.create({ id: "failed-run", taskId: failedTask.id });
    const failedClaim = fixture.service.claim(failed.id, { leaseOwner: "worker-1" });
    fixture.service.start(failed.id, failedClaim.authority);
    const failedRun = fixture.service.complete(failed.id, {
      ...failedClaim.authority,
      exitCode: 9,
    });
    assert.equal(failedRun.failureClass, "provider_exit");
    assert.throws(
      () => fixture.service.promoteVerifiedRunToReview(
        failed.id,
        failedClaim.authority.leaseOwner,
        failedClaim.authority.fencingToken,
        fixture.database.getTask(failedTask.id).version,
        { checks: ["must reject"] },
        actor,
      ),
      { code: "TASK_RUN_NOT_VERIFIED" },
    );
  } finally {
    await fixture.close();
  }
});

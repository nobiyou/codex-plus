import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { AiChatService } from "../server/ai-chat.mjs";
import { TaskboardDatabase } from "../server/database.mjs";
import { TaskRunService } from "../server/task-run.mjs";

const actor = {
  type: "user",
  id: "ai-chat-task-run-tester",
  name: "AI Chat Task Run Tester",
  avatarUrl: null,
};

async function waitFor(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "taskboard-ai-task-run-"));
  const workspacePath = path.join(directory, "workspace");
  await mkdir(workspacePath);
  const fakeScript = path.join(directory, "fake-codex.mjs");
  await writeFile(fakeScript, `
import process from "node:process";

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
  emit({ type: "thread.started", thread_id: "task-run-codex-thread" });
  emit({ type: "turn.started" });
  emit({ type: "item.completed", item: { type: "agent_message", text: "Visible task answer" } });
  if (prompt.includes("FAIL_PROVIDER")) {
    process.exit(7);
    return;
  }
  if (prompt.includes("WAIT_FOR_INTERRUPT")) {
    setInterval(() => {}, 1_000);
    return;
  }
  emit({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 5 } });
});
`);
  await chmod(fakeScript, 0o755);
  const executable = path.join(directory, "fake-codex.cmd");
  await writeFile(executable, `@echo off\r\n"${process.execPath}" "%~dp0fake-codex.mjs" %*\r\n`);

  const database = new TaskboardDatabase(path.join(directory, "taskboard.sqlite"));
  database.createProject({ id: "project", name: "Project", workspacePath });
  const createTask = (title) => database.createTask({
    projectId: "project",
    title,
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
  const task = createTask("Task-origin execution");
  const interruptedTask = createTask("Interrupted task-origin execution");
  const taskRuns = new TaskRunService({ database, leaseMs: 10_000 });
  const service = new AiChatService({
    database,
    taskRuns,
    taskRunHeartbeatMs: 250,
    codexExecutable: executable,
    codexStatePath: path.join(directory, "unused-codex-state.json"),
    manageTaskboardSkillPath: path.join(directory, "manage-taskboard.md"),
    processEnv: process.env,
    resolveContext: async (projectId, issueId) => ({
      project: { id: projectId, name: "Project" },
      workspacePath,
      addDirectories: [],
      issue: issueId ? database.getTask(issueId) : undefined,
    }),
  });
  service.getCatalog = async () => ({
    models: [{
      slug: "gpt-test",
      displayName: "GPT Test",
      description: "",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["medium"],
      serviceTiers: [],
    }],
    skills: [],
  });
  return {
    database,
    directory,
    interruptedTask,
    service,
    task,
    async close() {
      await service.close();
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("task-originated AI turns create correlated task runs while ordinary chat stays unchanged", async () => {
  const fixture = await createFixture();
  try {
    const thread = await fixture.service.createThread({ projectId: "project", issueId: fixture.task.id });
    const aiRun = await fixture.service.startTurn(thread.id, { message: "HIDDEN_TASK_PROMPT" });
    await waitFor(() => fixture.service.getRun(aiRun.id)?.status === "completed");

    const taskRuns = fixture.database.listTaskRuns(fixture.task.id);
    assert.equal(taskRuns.length, 1);
    assert.equal(taskRuns[0].status, "completed");
    assert.equal(taskRuns[0].codexThreadId, null);
    const events = fixture.database.listTaskRunEvents(taskRuns[0].id);
    assert.deepEqual(events.map((event) => event.kind), [
      "run.started",
      "provider.event",
      "provider.event",
      "provider.event",
      "provider.event",
      "run.completed",
    ]);
    assert.equal(events.some((event) => event.data?.aiChatRunId === aiRun.id), true);
    const serializedTaskEvidence = JSON.stringify({ taskRuns, events });
    assert.equal(serializedTaskEvidence.includes("HIDDEN_TASK_PROMPT"), false);
    assert.equal(serializedTaskEvidence.includes("<taskboard_context>"), false);

    const ordinaryThread = await fixture.service.createThread({ projectId: "project" });
    const ordinaryRun = await fixture.service.startTurn(ordinaryThread.id, { message: "ordinary" });
    await waitFor(() => fixture.service.getRun(ordinaryRun.id)?.status === "completed");
    assert.equal(fixture.database.listTaskRuns(fixture.task.id).length, 1);
    assert.equal(fixture.database.listTaskRuns().length, 1);
  } finally {
    await fixture.close();
  }
});

test("task-originated provider failures and interruptions settle task runs separately from chat runs", async () => {
  const fixture = await createFixture();
  try {
    const failedThread = await fixture.service.createThread({ projectId: "project", issueId: fixture.task.id });
    const failedAiRun = await fixture.service.startTurn(failedThread.id, { message: "FAIL_PROVIDER" });
    await waitFor(() => fixture.service.getRun(failedAiRun.id)?.status === "failed");
    const failedTaskRun = fixture.database.listTaskRuns(fixture.task.id)[0];
    assert.equal(failedTaskRun.status, "failed");
    assert.equal(failedTaskRun.failureClass, "provider_exit");
    assert.equal(failedTaskRun.exitCode, 7);

    const interruptedThread = await fixture.service.createThread({
      projectId: "project",
      issueId: fixture.interruptedTask.id,
    });
    const interruptedAiRun = await fixture.service.startTurn(interruptedThread.id, {
      message: "WAIT_FOR_INTERRUPT",
    });
    await waitFor(() => fixture.service.getRun(interruptedAiRun.id)?.status === "running");
    await fixture.service.interrupt(interruptedAiRun.id);
    await waitFor(() => fixture.service.getRun(interruptedAiRun.id)?.status === "interrupted");
    const interruptedTaskRun = fixture.database.listTaskRuns(fixture.interruptedTask.id)[0];
    assert.equal(interruptedTaskRun.status, "interrupted");
    assert.equal(interruptedTaskRun.failureClass, "interrupted");
    assert.equal(fixture.database.getTask(fixture.interruptedTask.id).status, "todo");
  } finally {
    await fixture.close();
  }
});

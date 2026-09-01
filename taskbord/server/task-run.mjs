import { randomBytes } from "node:crypto";

import { ApiError } from "./database.mjs";

export const TASK_RUN_STATUSES = Object.freeze([
  "queued",
  "claimed",
  "running",
  "completed",
  "failed",
  "interrupted",
  "canceled",
]);
export const TASK_RUN_EVENT_SOURCES = Object.freeze(["taskboard", "runner", "codex"]);
export const TASK_RUN_EVENT_KINDS = Object.freeze([
  "run.started",
  "provider.event",
  "heartbeat",
  "verification",
  "run.completed",
  "run.failed",
]);
export const TASK_RUN_FAILURE_CLASSES = Object.freeze([
  "preflight",
  "provider_exit",
  "provider_protocol",
  "timeout",
  "interrupted",
  "workspace",
  "git",
  "verification",
  "unknown",
]);

export const DEFAULT_TASK_RUN_LEASE_MS = 30_000;
const MAX_LEASE_MS = 60 * 60 * 1_000;
const MAX_LEASE_OWNER_BYTES = 256;
const MAX_EVENT_CONTENT_BYTES = 8_192;
const MAX_EVENT_DATA_BYTES = 32_768;
const MAX_ERROR_BYTES = 8_192;
const MAX_OUTPUT_SUMMARY_BYTES = 16_384;
const MAX_SNAPSHOT_BYTES = 4_096;
const SENSITIVE_EVENT_KEY = /(?:prompt|credential|secret|password|authorization|api[_-]?key|raw(?:jsonl|event)?)/i;

function toIsoTimestamp(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new ApiError(400, "TASK_RUN_INVALID_TIMESTAMP", `${field} must be a valid timestamp`);
  }
  return date.toISOString();
}

function boundedText(value, field, limit, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new ApiError(400, "TASK_RUN_INVALID_FIELD", `${field} is required`);
    return null;
  }
  const text = String(value);
  if (required && text.trim().length === 0) {
    throw new ApiError(400, "TASK_RUN_INVALID_FIELD", `${field} is required`);
  }
  if (Buffer.byteLength(text, "utf8") > limit) {
    throw new ApiError(400, "TASK_RUN_FIELD_TOO_LARGE", `${field} exceeds ${limit} bytes`);
  }
  return text;
}

function validateJson(value, field, limit = MAX_EVENT_DATA_BYTES) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") {
    throw new ApiError(400, "TASK_RUN_INVALID_JSON", `${field} must be an object or array`);
  }
  const seen = new Set();
  const inspect = (current, path) => {
    if (!current || typeof current !== "object") return;
    if (seen.has(current)) {
      throw new ApiError(400, "TASK_RUN_INVALID_JSON", `${field} must not contain circular data`);
    }
    seen.add(current);
    for (const [key, child] of Object.entries(current)) {
      if (SENSITIVE_EVENT_KEY.test(key)) {
        throw new ApiError(400, "TASK_RUN_SENSITIVE_DATA", `${field}.${path}${key} is not allowed`);
      }
      inspect(child, `${path}${key}.`);
    }
    seen.delete(current);
  };
  inspect(value, "");
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new ApiError(400, "TASK_RUN_INVALID_JSON", `${field} must be JSON serializable`, {
      cause: error.message,
    });
  }
  if (serialized === undefined) {
    throw new ApiError(400, "TASK_RUN_INVALID_JSON", `${field} must be JSON serializable`);
  }
  if (Buffer.byteLength(serialized, "utf8") > limit) {
    throw new ApiError(400, "TASK_RUN_FIELD_TOO_LARGE", `${field} exceeds ${limit} bytes`);
  }
  const normalized = JSON.parse(serialized);
  if (!normalized || typeof normalized !== "object") {
    throw new ApiError(400, "TASK_RUN_INVALID_JSON", `${field} must be an object or array`);
  }
  return normalized;
}

function publicTaskRun(run) {
  if (!run) return null;
  const { fencingToken: _fencingToken, ...visible } = run;
  return visible;
}

function publicTaskRunEvent(event) {
  return event ? { ...event } : null;
}

function validateLeaseMs(value) {
  const leaseMs = value ?? DEFAULT_TASK_RUN_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_LEASE_MS) {
    throw new ApiError(400, "TASK_RUN_INVALID_LEASE", `leaseMs must be an integer between 1 and ${MAX_LEASE_MS}`);
  }
  return leaseMs;
}

function addMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function normalizedFailure(result) {
  const failureClass = result.failureClass ?? null;
  if (failureClass !== null && !TASK_RUN_FAILURE_CLASSES.includes(failureClass)) {
    throw new ApiError(400, "TASK_RUN_INVALID_FAILURE_CLASS", `Unsupported task run failure class '${failureClass}'`);
  }
  let status = result.status;
  if (status !== undefined && !TASK_RUN_STATUSES.includes(status)) {
    throw new ApiError(400, "TASK_RUN_INVALID_STATUS", `Unsupported task run status '${status}'`);
  }
  if (status === undefined) {
    status = result.timedOut || result.interrupted || failureClass !== null || result.error
      || (Number.isInteger(result.exitCode) && result.exitCode !== 0)
      ? "failed"
      : "completed";
  }
  if (!["completed", "failed", "interrupted", "canceled"].includes(status)) {
    throw new ApiError(400, "TASK_RUN_INVALID_STATUS", "Task run completion requires a terminal status");
  }
  let normalizedFailureClass = failureClass;
  if (status === "interrupted") normalizedFailureClass ??= "interrupted";
  if (status === "failed") {
    normalizedFailureClass ??= result.timedOut
      ? "timeout"
      : result.interrupted
        ? "interrupted"
        : Number.isInteger(result.exitCode) && result.exitCode !== 0
          ? "provider_exit"
          : "unknown";
  }
  if (status === "completed" && normalizedFailureClass !== null) {
    throw new ApiError(400, "TASK_RUN_INVALID_FAILURE_CLASS", "Completed task runs cannot have a failure class");
  }
  return { status, failureClass: normalizedFailureClass };
}

function nonEmptyVerificationEvidence(value) {
  const normalized = validateJson(value, "verificationEvidence");
  if (
    !normalized
    || typeof normalized !== "object"
    || (Array.isArray(normalized) ? normalized.length === 0 : Object.keys(normalized).length === 0)
  ) {
    throw new ApiError(400, "TASK_RUN_INVALID_VERIFICATION", "verificationEvidence must be non-empty structured data");
  }
  return normalized;
}

export class TaskRunService {
  constructor(options) {
    if (!options?.database) throw new TypeError("TaskRunService requires a database");
    this.database = options.database;
    this.clock = options.clock ?? (() => new Date());
    this.leaseMs = validateLeaseMs(options.leaseMs);
  }

  create(input) {
    if (!input?.taskId) {
      throw new ApiError(400, "TASK_RUN_INVALID_FIELD", "taskId is required");
    }
    const run = this.database.createTaskRun({
      ...input,
      taskId: boundedText(input.taskId, "taskId", MAX_SNAPSHOT_BYTES, { required: true }),
      codexThreadId: boundedText(input.codexThreadId, "codexThreadId", MAX_SNAPSHOT_BYTES),
      projectId: boundedText(input.projectId, "projectId", MAX_SNAPSHOT_BYTES),
      codexProjectKind: boundedText(input.codexProjectKind, "codexProjectKind", 64),
      codexHostId: boundedText(input.codexHostId, "codexHostId", MAX_SNAPSHOT_BYTES),
      workspacePath: boundedText(input.workspacePath, "workspacePath", MAX_SNAPSHOT_BYTES),
      branch: boundedText(input.branch, "branch", MAX_SNAPSHOT_BYTES),
      worktreePath: boundedText(input.worktreePath, "worktreePath", MAX_SNAPSHOT_BYTES),
      baseSha: boundedText(input.baseSha, "baseSha", MAX_SNAPSHOT_BYTES),
      verificationEvidence: validateJson(input.verificationEvidence, "verificationEvidence"),
    });
    return publicTaskRun(run);
  }

  get(runId) {
    const run = this.database.getTaskRun(runId);
    if (!run) throw new ApiError(404, "TASK_RUN_NOT_FOUND", `Task run '${runId}' does not exist`);
    return publicTaskRun(run);
  }

  list(taskId, filters = {}) {
    if (taskId !== undefined && !this.database.getTask(taskId)) {
      throw new ApiError(404, "TASK_NOT_FOUND", `Task '${taskId}' does not exist`);
    }
    return this.database.listTaskRuns(taskId, filters).map(publicTaskRun);
  }

  claim(runId, input) {
    const now = toIsoTimestamp(this.clock(), "claimedAt");
    const leaseOwner = boundedText(input?.leaseOwner, "leaseOwner", MAX_LEASE_OWNER_BYTES, { required: true });
    const leaseMs = validateLeaseMs(input?.leaseMs ?? this.leaseMs);
    const fencingToken = randomBytes(32).toString("hex");
    this.database.interruptExpiredTaskRuns({
      timestamp: now,
      reason: "Task run lease expired before a new claim",
    });
    const run = this.database.claimTaskRun(runId, {
      leaseOwner,
      fencingToken,
      claimedAt: now,
      leaseExpiresAt: addMilliseconds(now, leaseMs),
    });
    return {
      run: publicTaskRun(run),
      authority: { leaseOwner, fencingToken },
    };
  }

  start(runId, input) {
    const leaseOwner = boundedText(input?.leaseOwner, "leaseOwner", MAX_LEASE_OWNER_BYTES, { required: true });
    const fencingToken = boundedText(input?.fencingToken, "fencingToken", 512, { required: true });
    const run = this.database.startTaskRun(runId, {
      leaseOwner,
      fencingToken,
      startedAt: toIsoTimestamp(this.clock(), "startedAt"),
    });
    return publicTaskRun(run);
  }

  heartbeat(runId, input) {
    const heartbeatAt = toIsoTimestamp(this.clock(), "heartbeatAt");
    const leaseOwner = boundedText(input?.leaseOwner, "leaseOwner", MAX_LEASE_OWNER_BYTES, { required: true });
    const fencingToken = boundedText(input?.fencingToken, "fencingToken", 512, { required: true });
    const leaseMs = validateLeaseMs(input?.leaseMs ?? this.leaseMs);
    const run = this.database.heartbeatTaskRun(runId, {
      leaseOwner,
      fencingToken,
      heartbeatAt,
      leaseExpiresAt: addMilliseconds(heartbeatAt, leaseMs),
    });
    return publicTaskRun(run);
  }

  event(runId, input) {
    const source = boundedText(input?.source, "source", 32, { required: true });
    const kind = boundedText(input?.kind, "kind", 128, { required: true });
    if (!TASK_RUN_EVENT_SOURCES.includes(source)) {
      throw new ApiError(400, "TASK_RUN_INVALID_EVENT_SOURCE", `Unsupported task run event source '${source}'`);
    }
    if (!TASK_RUN_EVENT_KINDS.includes(kind)) {
      throw new ApiError(400, "TASK_RUN_INVALID_EVENT_KIND", `Unsupported task run event kind '${kind}'`);
    }
    const leaseOwner = boundedText(input?.leaseOwner, "leaseOwner", MAX_LEASE_OWNER_BYTES, { required: true });
    const fencingToken = boundedText(input?.fencingToken, "fencingToken", 512, { required: true });
    const content = boundedText(input?.content, "content", MAX_EVENT_CONTENT_BYTES, { required: true });
    const event = this.database.insertTaskRunEvent(runId, {
      id: input.id,
      source,
      kind,
      content,
      data: validateJson(input.data, "data"),
      leaseOwner,
      fencingToken,
      createdAt: toIsoTimestamp(this.clock(), "createdAt"),
    });
    return publicTaskRunEvent(event);
  }

  complete(runId, input) {
    const { status, failureClass } = normalizedFailure(input ?? {});
    const leaseOwner = boundedText(input?.leaseOwner, "leaseOwner", MAX_LEASE_OWNER_BYTES, { required: true });
    const fencingToken = boundedText(input?.fencingToken, "fencingToken", 512, { required: true });
    const run = this.database.completeTaskRun(runId, {
      leaseOwner,
      fencingToken,
      status,
      failureClass,
      exitCode: input.exitCode,
      error: boundedText(input.error, "error", MAX_ERROR_BYTES),
      outputSummary: boundedText(input.outputSummary, "outputSummary", MAX_OUTPUT_SUMMARY_BYTES),
      verificationEvidence: validateJson(input.verificationEvidence, "verificationEvidence"),
      finishedAt: toIsoTimestamp(this.clock(), "finishedAt"),
    });
    return publicTaskRun(run);
  }

  promoteVerifiedRunToReview(runId, leaseOwner, fencingToken, taskVersion, verificationEvidence, actor) {
    const run = this.database.getTaskRun(runId);
    if (!run) throw new ApiError(404, "TASK_RUN_NOT_FOUND", `Task run '${runId}' does not exist`);
    const safeOwner = boundedText(leaseOwner, "leaseOwner", MAX_LEASE_OWNER_BYTES, { required: true });
    const safeToken = boundedText(fencingToken, "fencingToken", 512, { required: true });
    if (run.leaseOwner !== safeOwner || run.fencingToken !== safeToken) {
      throw new ApiError(409, "TASK_RUN_CONFLICT", `Task run '${runId}' does not have the current authority`);
    }
    if (run.status !== "completed") {
      throw new ApiError(409, "TASK_RUN_NOT_VERIFIED", `Task run '${runId}' is not a successful completed run`);
    }
    if (!Number.isInteger(taskVersion) || taskVersion <= 0) {
      throw new ApiError(400, "INVALID_VERSION", "taskVersion must be a positive integer");
    }
    if (!actor || !["user", "agent"].includes(actor.type) || !actor.id || !actor.name) {
      throw new ApiError(400, "INVALID_ACTOR", "A valid verification actor is required");
    }
    const evidence = nonEmptyVerificationEvidence(verificationEvidence);
    const task = this.database.getTask(run.taskId);
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", `Task '${run.taskId}' does not exist`);
    if (task.version !== taskVersion) {
      throw new ApiError(409, "VERSION_CONFLICT", "Task was changed by another client", {
        expectedVersion: taskVersion,
        actualVersion: task.version,
      });
    }
    if (task.status === "done") {
      throw new ApiError(409, "TASK_ALREADY_DONE", "A verified run cannot move a completed task back to review");
    }
    const currentEvidence = run.verificationEvidence;
    if (task.status === "in_review") {
      if (JSON.stringify(currentEvidence) !== JSON.stringify(evidence)) {
        throw new ApiError(409, "TASK_RUN_CONFLICT", `Task run '${runId}' already has different verification evidence`);
      }
      return { run: publicTaskRun(run), task };
    }
    const verifiedRun = this.database.updateTaskRunVerification(runId, {
      leaseOwner: safeOwner,
      fencingToken: safeToken,
      verificationEvidence: evidence,
      updatedAt: toIsoTimestamp(this.clock(), "updatedAt"),
    });
    const movedTask = this.database.moveTask(
      task.id,
      task.version,
      "in_review",
      undefined,
      task.threadId,
      null,
      actor,
    );
    return { run: publicTaskRun(verifiedRun), task: movedTask };
  }

  interruptExpired(reason = "Task run lease expired") {
    const interrupted = this.database.interruptExpiredTaskRuns({
      timestamp: toIsoTimestamp(this.clock(), "timestamp"),
      reason: boundedText(reason, "reason", MAX_ERROR_BYTES, { required: true }),
    });
    return interrupted.map(publicTaskRun);
  }
}

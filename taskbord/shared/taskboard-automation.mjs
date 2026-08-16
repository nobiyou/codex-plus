import path from "node:path";
import {
  canonicalAutomationModel,
  isSupportedModelEffort,
} from "./taskboard-automation-options.mjs";

const AUTOMATION_OPERATIONS = new Set(["ensure-active", "pause", "list", "apply-policy"]);
const BOARD_PAUSE_STATUSES = new Set(["in_review", "blocked"]);
const BOARD_RUN_STATUSES = new Set(["todo", "in_progress"]);
const INTERVAL_MINUTES = new Set([5, 10, 15, 30, 60]);
const HOST_REQUEST_FIELDS = new Set([
  "id",
  "action",
  "requestId",
  "operation",
  "taskboardProjectId",
  "codexProjectId",
  "projectName",
  "workspacePath",
  "skillPath",
  "automationId",
  "enabledByUser",
  "quotaAware",
  "intervalMinutes",
  "model",
  "reasoningEffort",
]);

export function parseTaskboardAutomationHostRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some((field) => !HOST_REQUEST_FIELDS.has(field))) return null;
  if (value.action !== "automation") return null;
  if (!validIdentifier(value.id, 80) || !validIdentifier(value.requestId, 100)) return null;
  if (!AUTOMATION_OPERATIONS.has(value.operation)) return null;
  if (!validProjectId(value.taskboardProjectId)) return null;
  if (!validText(value.codexProjectId, 256) || !validText(value.projectName, 200)) return null;
  if (!validAbsolutePath(value.workspacePath) || !validAbsolutePath(value.skillPath)) return null;
  if (!INTERVAL_MINUTES.has(value.intervalMinutes)) return null;
  if (!isSupportedModelEffort(value.model, value.reasoningEffort)) return null;
  if (value.automationId !== undefined && !validText(value.automationId, 256)) return null;
  if (typeof value.enabledByUser !== "boolean" || typeof value.quotaAware !== "boolean") return null;

  return {
    id: value.id,
    action: "automation",
    requestId: value.requestId,
    operation: value.operation,
    taskboardProjectId: value.taskboardProjectId,
    codexProjectId: value.codexProjectId,
    projectName: value.projectName,
    workspacePath: value.workspacePath,
    skillPath: value.skillPath,
    ...(value.automationId === undefined ? {} : { automationId: value.automationId }),
    enabledByUser: value.enabledByUser,
    quotaAware: value.quotaAware,
    intervalMinutes: value.intervalMinutes,
    model: value.model,
    reasoningEffort: value.reasoningEffort,
  };
}

export function buildTaskboardAutomationName(request) {
  return `Taskboard 自动认领 · ${request.taskboardProjectId}`;
}

export function taskboardAutomationBoardState(tasks) {
  if (!Array.isArray(tasks)) return "unknown";
  if (tasks.some((task) => BOARD_PAUSE_STATUSES.has(task?.status))) return "pause";
  return tasks.some((task) => BOARD_RUN_STATUSES.has(task?.status)) ? "ready" : "pause";
}

export function taskboardAutomationActivityKey(tasks) {
  if (!Array.isArray(tasks)) return null;
  return JSON.stringify(tasks
    .map((task) => [
      typeof task?.id === "string" ? task.id : null,
      typeof task?.status === "string" ? task.status : null,
      Number.isInteger(task?.version) ? task.version : null,
      typeof task?.activityKey === "string" ? task.activityKey : null,
      typeof task?.activityUpdatedAt === "string"
        ? task.activityUpdatedAt
        : typeof task?.updatedAt === "string"
          ? task.updatedAt
          : null,
    ])
    .sort((left, right) => String(left[0] ?? "").localeCompare(String(right[0] ?? ""))));
}

export function taskboardAutomationGateDecision({
  enabledByUser,
  explicit,
  currentLastRunAt,
  currentActivityKey,
  automationExists = true,
  gate,
}) {
  if (!enabledByUser) return { operation: "pause", gate: null, reason: "disabled" };

  const normalizedGate = normalizeAutomationGate(gate);
  const normalizedLastRunAt = Number.isFinite(currentLastRunAt) ? currentLastRunAt : null;
  if (explicit || !normalizedGate) {
    return {
      operation: "ensure-active",
      gate: {
        lastRunAt: normalizedLastRunAt,
        activityKey: currentActivityKey,
        armed: true,
      },
      reason: explicit ? "explicit" : "baseline",
    };
  }


  if (!automationExists) {
    return {
      operation: "ensure-active",
      gate: {
        lastRunAt: normalizedLastRunAt ?? normalizedGate.lastRunAt,
        activityKey: currentActivityKey,
        armed: true,
      },
      reason: "automation-missing",
    };
  }

  if (
    normalizedLastRunAt !== null
    && (normalizedGate.lastRunAt === null || normalizedLastRunAt > normalizedGate.lastRunAt)
  ) {
    return {
      operation: "pause",
      gate: {
        lastRunAt: normalizedLastRunAt,
        activityKey: currentActivityKey ?? normalizedGate.activityKey,
        armed: false,
      },
      reason: "run-observed",
      runObserved: true,
    };
  }

  if (
    normalizedGate.armed === false
    && currentActivityKey !== null
    && currentActivityKey !== normalizedGate.activityKey
  ) {
    return {
      operation: "ensure-active",
      gate: {
        lastRunAt: normalizedLastRunAt ?? normalizedGate.lastRunAt,
        activityKey: currentActivityKey,
        armed: true,
      },
      reason: "activity-changed",
    };
  }

  return normalizedGate.armed
    ? { operation: "ensure-active", gate: normalizedGate, reason: "armed" }
    : { operation: "pause", gate: normalizedGate, reason: "waiting-for-activity" };
}

export function normalizeAutomationGate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lastRunAt = value.lastRunAt === null || Number.isFinite(value.lastRunAt)
    ? value.lastRunAt
    : null;
  const activityKey = value.activityKey === null || typeof value.activityKey === "string"
    ? value.activityKey
    : null;
  if (typeof value.armed !== "boolean") return null;
  return { lastRunAt, activityKey, armed: value.armed };
}

export function buildTaskboardAutomationPrompt(request) {
  const automationName = buildTaskboardAutomationName(request);
  const taskctlCommand = buildTaskctlCommand(request);
  return [
    `[$manage-taskboard](${request.skillPath}) e-taskboard 每 ${request.intervalMinutes} 分钟检查任务面板中的「${request.projectName}」项目（项目 ID：${request.taskboardProjectId}，项目目录：${request.workspacePath}）。`,
    `本轮所有 taskctl 操作都使用完整命令前缀 ${taskctlCommand}，不要使用 PATH 中的 taskctl。`,
    `开始时先运行 ${taskctlCommand} issue list --project ${request.taskboardProjectId} --archived false --json。若命令失败、返回 NOT_FOUND、Route not found、其他 API 错误，或响应不是明确成功结果，视为连接/API 故障：报告并结束，不暂停自动化、不认领任务，也不要把故障当成空队列。只有明确收到成功的空任务列表（tasks=[]）时，才按空队列规则暂停。成功后一次读取该项目全部未归档议题。每个项目同一时间只允许一个自动认领任务，不要创建或打开新的任务会话。若存在 in_progress 议题，必须先对该议题运行 issue get 和 comment list；不要仅因状态是 in_progress 就直接暂停。只有当最新评论是新的用户评论（晚于最近一条 Agent 评论），且没有写明等待、暂不执行或当前不应开始时，才视为需要继续处理：优先使用任务 threadId，其次使用最新评论的 threadId，向该原对话发送继续处理指令；发送成功后，立即用当前最新 version 添加一条简短评论，明确记录已转交的评论 ID，作为下一轮去重标记；然后将当前自动化设为 PAUSED 并结束。不要在自动化会话中认领，也不要重复转发已有转交标记的评论。若 in_progress 没有新的可执行用户评论，或存在 in_review（等你确认）或 blocked 议题，使用 Codex automation_update 将名为「${automationName}」的当前自动化设为 PAUSED，保留其他字段，然后结束。只有不存在上述处理中/待确认/阻塞任务且存在 todo 时，才进入下面的单任务认领流程。若没有 todo，也执行同样的暂停并结束。`,
    "每次仅处理一个 todo：选定后先用 issue get 读取最新议题内容，并用 comment list 读取全部评论。根据描述和最新评论判断是否允许开始；若其中写明等待、暂不执行或当前不应开始，立即跳过并报告，不改状态。评论也包含已完成后被打回的返工要求。",
    "确认允许开始后，必须在读取代码、下载附件、分析或实施前，使用刚读取的 version 将仍可认领的 todo 移到 in_progress；写入成功前不得继续。不得认领已被其他会话绑定或其他 Agent 领取的议题。",
    "若因 version 陈旧发生版本冲突，重新运行 issue get 和 comment list；仅当仍为可认领 todo、未绑定其他会话、未归档且描述和最新评论未变化时，用最新 version 重试一次。若已被认领、状态或要求已变、已归档、服务或永久 API 错误，或重试仍失败，立即跳过该议题、退出并报告；不得抢占或循环重试。",
    "读取 issue get 和 comment list 后，优先使用议题的 threadId；若议题没有 threadId，则使用最新评论中最近一条非空 threadId。对 todo 议题，只要找到绑定对话，议题已绑定原会话：不要在当前自动化会话认领；使用 Codex send_message_to_thread 向该原会话发送继续处理指令，由原会话按上述协议判断和认领，然后结束当前自动化会话。若任务和评论都没有 threadId，不得在当前自动化会话创建、打开或认领新的 Codex 对话；保留 todo，报告缺少绑定对话，等待用户从具体对话发起处理。",
    "若议题已绑定 branch 或 worktree，必须在该议题绑定的开发上下文执行，避免并行 Agent 修改同一工作目录。",
    "执行完成并验证后，先用 comment add 记录关键改动、验证结果、执行结果和剩余风险，再使用最新 version 将议题移动到 in_review；不要直接标记为 done。",
    `本次处理或交接后，再次运行 ${taskctlCommand} issue list --project ${request.taskboardProjectId} --archived false --json。若存在 in_progress、in_review 或 blocked 议题，或没有 todo，使用 Codex automation_update 将名为「${automationName}」的当前自动化设为 PAUSED，保留其他字段，然后结束，避免后续每 ${request.intervalMinutes} 分钟创建新的空会话。`,
  ].join("\n");
}

function buildTaskctlCommand(request) {
  const cliPath = path.resolve(path.dirname(request.skillPath), "../..", "cli/taskctl.mjs");
  const command = `${shellQuote(process.execPath)} ${shellQuote(cliPath)}`;
  const runtimeFilePath = process.env.CODEX_TASKBOARD_RUNTIME_FILE;
  return runtimeFilePath
    ? `CODEX_TASKBOARD_RUNTIME_FILE=${shellQuote(runtimeFilePath)} ${command}`
    : command;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildTaskboardAutomationSpec(request) {
  return {
    kind: "cron",
    name: buildTaskboardAutomationName(request),
    prompt: buildTaskboardAutomationPrompt(request),
    projectId: request.codexProjectId,
    executionEnvironment: "local",
    localEnvironmentConfigPath: null,
    model: request.model,
    reasoningEffort: request.reasoningEffort,
    rrule: `RRULE:FREQ=MINUTELY;INTERVAL=${request.intervalMinutes}`,
  };
}

export function taskboardAutomationPolicyOperation(request, {
  explicit,
  previousQuotaState,
  quotaState,
  currentStatus,
}) {
  if (!request.enabledByUser) return "pause";
  if (
    !explicit
    && currentStatus === "PAUSED"
    && (!request.quotaAware || previousQuotaState === "available")
  ) return "ensure-active";
  if (request.quotaAware && quotaState !== "available") return "pause";
  if (
    explicit
    || currentStatus === undefined
    || (request.quotaAware && previousQuotaState !== "available")
  ) return "ensure-active";
  return "ensure-active";
}

export async function reconcileTaskboardAutomation(request, rpc) {
  const listed = await rpc("list-automations", {});
  const items = Array.isArray(listed?.items) ? listed.items : [];
  const name = buildTaskboardAutomationName(request);
  const matchingItems = items.filter((item) => item?.name === name);

  if (request.operation === "list") {
    return { items: matchingItems.map(sanitizeAutomation).filter(Boolean) };
  }

  const existing = (
    request.automationId
      ? matchingItems.find((item) => item?.id === request.automationId)
      : null
  ) ?? matchingItems[0];
  const spec = buildTaskboardAutomationSpec(request);

  if (request.operation === "pause") {
    if (!existing) return { error: "not-found" };
    await pauseDuplicateAutomations(matchingItems, existing, spec, rpc);
    if (automationMatchesSpec(existing, spec, "PAUSED")) return { item: existing };
    return rpc("automation-update", { ...spec, id: existing.id, status: "PAUSED" });
  }

  if (request.operation !== "ensure-active") {
    throw new Error(`Unsupported automation operation: ${request.operation}`);
  }
  if (existing) {
    await pauseDuplicateAutomations(matchingItems, existing, spec, rpc);
    if (automationMatchesSpec(existing, spec, "ACTIVE")) return { item: existing };
    return rpc("automation-update", {
      ...spec,
      id: existing.id,
      status: "ACTIVE",
    });
  }
  return rpc("automation-create", spec);
}

async function pauseDuplicateAutomations(items, canonical, spec, rpc) {
  for (const duplicate of items) {
    if (
      !validText(duplicate?.id, 256)
      || duplicate.id === canonical?.id
      || duplicate.status !== "ACTIVE"
    ) continue;
    await rpc("automation-update", {
      ...spec,
      id: duplicate.id,
      status: "PAUSED",
    });
  }
}

function sanitizeAutomation(item) {
  const model = canonicalAutomationModel(item?.model);
  if (
    !validText(item?.id, 256)
    || (item.status !== "ACTIVE" && item.status !== "PAUSED")
    || !isSupportedModelEffort(model, item.reasoningEffort)
    || !validRrule(item.rrule)
  ) return null;
  return {
    id: item.id,
    status: item.status,
    model,
    reasoningEffort: item.reasoningEffort,
    rrule: item.rrule,
    ...(
      item.lastRunAt === null || Number.isFinite(item.lastRunAt)
        ? { lastRunAt: item.lastRunAt }
        : {}
    ),
    ...(
      item.nextRunAt === null || Number.isFinite(item.nextRunAt)
        ? { nextRunAt: item.nextRunAt }
        : {}
    ),
  };
}

function validRrule(value) {
  return typeof value === "string"
    && /^RRULE:FREQ=MINUTELY;INTERVAL=(5|10|15|30|60)$/.test(value);
}

function automationMatchesSpec(item, spec, status) {
  return item?.status === status
    && Object.entries(spec).every(([field, value]) => (
      field === "projectId"
        ? (item.projectId ?? item.target?.projectId) === value
        : item[field] === value
    ));
}

function validIdentifier(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && /^[a-z0-9-]+$/i.test(value);
}

function validProjectId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && /^[a-z0-9._-]+$/i.test(value);
}

function validText(value, maxLength) {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validAbsolutePath(value) {
  return validText(value, 2_048) && path.isAbsolute(value);
}

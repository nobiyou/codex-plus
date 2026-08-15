import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { DEFAULT_PROJECT_ID } from "../shared/domain.mjs";

const USAGE_FIELDS = [
  "inputTokens",
  "cachedInputTokens",
  "cacheWriteInputTokens",
  "outputTokens",
  "reasoningOutputTokens",
  "totalTokens",
];
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const UNKNOWN_MODEL = "unknown";
const SESSION_DATE_PATTERN = /rollout-(\d{4}-\d{2}-\d{2})(?:T|-)/;
const SESSION_EVENT_MARKERS = [
  "session_meta",
  "turn_context",
  "thread_settings_applied",
  "token_count",
];

function emptyTotals() {
  return Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
}

function finiteNumber(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(value) {
  if (!value || typeof value !== "object") return null;
  const usage = {
    inputTokens: finiteNumber(value.input_tokens),
    cachedInputTokens: finiteNumber(value.cached_input_tokens),
    cacheWriteInputTokens: finiteNumber(value.cache_write_input_tokens),
    outputTokens: finiteNumber(value.output_tokens),
    reasoningOutputTokens: finiteNumber(value.reasoning_output_tokens),
    totalTokens: finiteNumber(value.total_tokens),
  };
  return USAGE_FIELDS.some((field) => usage[field] !== null) ? usage : null;
}

function usageDelta(previous, current) {
  const delta = {};
  let hasUsage = false;
  for (const field of USAGE_FIELDS) {
    const currentValue = current[field];
    if (currentValue === null) {
      delta[field] = 0;
      continue;
    }
    const previousValue = previous?.[field];
    const value = previousValue === null || previousValue === undefined
      ? currentValue
      : currentValue >= previousValue
        ? currentValue - previousValue
        : currentValue;
    delta[field] = value;
    hasUsage ||= value > 0;
  }
  return hasUsage ? delta : null;
}

function addTotals(target, source) {
  for (const field of USAGE_FIELDS) target[field] += source[field] ?? 0;
}

function dateParts(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) return null;
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateKey, offset) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function defaultEndDate(timeZone) {
  return dateParts(new Date().toISOString(), timeZone);
}

function normalizeModel(value) {
  if (typeof value !== "string") return UNKNOWN_MODEL;
  const model = value.trim();
  return model || UNKNOWN_MODEL;
}

function createDay(date) {
  return {
    date,
    sessions: new Set(),
    totals: emptyTotals(),
    models: new Map(),
  };
}

function createModel(model) {
  return {
    model,
    sessions: new Set(),
    totals: emptyTotals(),
  };
}

function finalizeDay(day) {
  return {
    date: day.date,
    sessions: day.sessions.size,
    totals: day.totals,
    models: [...day.models.values()]
      .map((model) => ({
        model: model.model,
        sessions: model.sessions.size,
        totals: model.totals,
      }))
      .sort((left, right) => right.totals.totalTokens - left.totals.totalTokens || left.model.localeCompare(right.model)),
  };
}

function finalizeUsage(days, rangeDays, endDate, timeZone) {
  const totals = emptyTotals();
  const modelMap = new Map();
  const sessionSet = new Set();
  const finalizedDays = [];

  for (let offset = 1 - rangeDays; offset <= 0; offset += 1) {
    const date = shiftDate(endDate, offset);
    const day = days.get(date) ?? createDay(date);
    const finalized = finalizeDay(day);
    finalizedDays.push(finalized);
    addTotals(totals, finalized.totals);
    for (const session of day.sessions) sessionSet.add(session);
    for (const model of finalized.models) {
      let summary = modelMap.get(model.model);
      if (!summary) {
        summary = { model: model.model, sessions: new Set(), totals: emptyTotals() };
        modelMap.set(model.model, summary);
      }
      addTotals(summary.totals, model.totals);
      for (const session of day.models.get(model.model)?.sessions ?? []) summary.sessions.add(session);
    }
  }

  return {
    rangeDays,
    timeZone,
    from: finalizedDays[0]?.date ?? endDate,
    to: finalizedDays.at(-1)?.date ?? endDate,
    sessions: sessionSet.size,
    totals,
    models: [...modelMap.values()]
      .map((model) => ({
        model: model.model,
        sessions: model.sessions.size,
        totals: model.totals,
      }))
      .sort((left, right) => right.totals.totalTokens - left.totals.totalTokens || left.model.localeCompare(right.model)),
    days: finalizedDays,
  };
}

export function aggregateCodexUsage(events, options = {}) {
  const timeZone = options.timeZone
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    ?? "UTC";
  const rangeDays = Number.isSafeInteger(options.rangeDays)
    ? Math.min(MAX_RANGE_DAYS, Math.max(1, options.rangeDays))
    : DEFAULT_RANGE_DAYS;
  const endDate = options.endDate ?? defaultEndDate(timeZone);
  const startDate = shiftDate(endDate, 1 - rangeDays);
  const days = new Map();
  const states = new Map();

  for (const event of events) {
    const sessionId = String(event.sessionId ?? "session");
    const state = states.get(sessionId) ?? { previous: null };
    const usage = normalizeUsage(event.usage);
    if (!usage) continue;
    const delta = usageDelta(state.previous, usage);
    state.previous = usage;
    states.set(sessionId, state);
    if (!delta) continue;

    const date = dateParts(event.timestamp, timeZone);
    if (!date || date < startDate || date > endDate) continue;
    const day = days.get(date) ?? createDay(date);
    const model = normalizeModel(event.model);
    const modelSummary = day.models.get(model) ?? createModel(model);
    day.sessions.add(sessionId);
    modelSummary.sessions.add(sessionId);
    addTotals(day.totals, delta);
    addTotals(modelSummary.totals, delta);
    day.models.set(model, modelSummary);
    days.set(date, day);
  }

  return finalizeUsage(days, rangeDays, endDate, timeZone);
}

async function listJsonlFiles(directory, options = {}) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        if (options.startDate && options.endDate && options.timeZone) {
          const fileDate = entry.name.match(SESSION_DATE_PATTERN)?.[1] ?? null;
          let modifiedDate = null;
          try {
            modifiedDate = dateParts((await stat(entryPath)).mtime, options.timeZone);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          const inRange = (value) => value !== null
            && value >= options.startDate
            && value <= options.endDate;
          if (!inRange(fileDate) && !inRange(modifiedDate)) continue;
        }
        files.push(entryPath);
      }
    }
  }
  return files;
}

function pathWithin(root, candidate) {
  if (!root || !candidate) return false;
  const resolvedRoot = path.resolve(root).toLowerCase();
  const resolvedCandidate = path.resolve(candidate).toLowerCase();
  return resolvedCandidate === resolvedRoot
    || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function sessionIdFromPath(filePath) {
  const base = path.basename(filePath, ".jsonl");
  const match = base.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1] ?? base;
}

function projectRootsFromState(state, projectId) {
  const project = state?.["local-projects"]?.[projectId];
  return Array.isArray(project?.rootPaths)
    ? project.rootPaths.filter((root) => typeof root === "string" && root.trim())
    : [];
}

async function readProjectRoots(codexStatePath, projectId, project) {
  const roots = [];
  if (project?.workspacePath) roots.push(project.workspacePath);
  try {
    const state = JSON.parse(await readFile(codexStatePath, "utf8"));
    roots.push(...projectRootsFromState(state, projectId));
  } catch {}
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function decodeJsonString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return null;
  }
}

function jsonStringField(line, field) {
  const marker = `"${field}":"`;
  const start = line.lastIndexOf(marker);
  if (start === -1) return null;
  let end = start + marker.length;
  let escaped = false;
  for (; end < line.length; end += 1) {
    const character = line[end];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return decodeJsonString(line.slice(start + marker.length, end));
    }
  }
  return null;
}

function jsonStringArrayField(line, field) {
  const marker = `"${field}":[`;
  const start = line.lastIndexOf(marker);
  if (start === -1) return [];
  let end = start + marker.length;
  let escaped = false;
  let inString = false;
  for (; end < line.length; end += 1) {
    const character = line[end];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      inString = !inString;
    } else if (character === "]" && !inString) {
      try {
        const values = JSON.parse(line.slice(start + marker.length - 1, end + 1));
        return Array.isArray(values)
          ? values.filter((value) => typeof value === "string" && value.trim())
          : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

async function readSessionMetadata(filePath) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  let cwd = null;
  const roots = [];
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.includes('"type":"session_meta"')) {
        cwd = jsonStringField(line, "cwd") ?? cwd;
        if (cwd) break;
      }
      if (line.includes('"type":"turn_context"')) {
        roots.push(...jsonStringArrayField(line, "workspace_roots"));
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return { cwd, roots: [...new Set(roots)] };
}

async function readSessionEvents(filePath) {
  const sessionId = sessionIdFromPath(filePath);
  const events = [];
  const roots = [];
  let cwd = null;
  let model = UNKNOWN_MODEL;
  const input = createReadStream(filePath, { encoding: "utf8" });
  let pendingChunks = [];
  const processLine = (line) => {
    if (!line.trim() || !SESSION_EVENT_MARKERS.some((marker) => line.includes(marker))) return;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }
    const payload = record?.payload;
    if (record?.type === "session_meta" || record?.type === "turn_context") {
      if (typeof payload?.cwd === "string" && payload.cwd.trim()) cwd = payload.cwd;
      if (Array.isArray(payload?.workspace_roots)) {
        roots.push(...payload.workspace_roots.filter((root) => typeof root === "string" && root.trim()));
      }
      if (typeof payload?.model === "string" && payload.model.trim()) model = payload.model.trim();
    }
    if (
      record?.type === "event_msg"
      && payload?.type === "thread_settings_applied"
      && typeof payload.thread_settings?.model === "string"
      && payload.thread_settings.model.trim()
    ) {
      model = payload.thread_settings.model.trim();
    }
    if (record?.type === "event_msg" && payload?.type === "token_count") {
      events.push({
        sessionId,
        timestamp: record.timestamp,
        model: model === UNKNOWN_MODEL ? null : model,
        usage: payload.info?.total_token_usage ?? payload.info?.last_token_usage,
      });
    }
  };
  try {
    for await (const chunk of input) {
      let lineStart = 0;
      while (lineStart < chunk.length) {
        const newlineIndex = chunk.indexOf("\n", lineStart);
        if (newlineIndex === -1) {
          pendingChunks.push(chunk.slice(lineStart));
          break;
        }
        pendingChunks.push(chunk.slice(lineStart, newlineIndex));
        processLine(pendingChunks.join("").replace(/\r$/, ""));
        pendingChunks = [];
        lineStart = newlineIndex + 1;
      }
    }
    if (pendingChunks.length > 0) processLine(pendingChunks.join(""));
  } finally {
    input.destroy();
  }
  let nextModel = UNKNOWN_MODEL;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].model) nextModel = events[index].model;
    else events[index].model = nextModel;
  }
  return { sessionId, cwd, roots: [...new Set(roots)], events };
}

export class CodexUsageService {
  constructor(options) {
    this.database = options.database;
    this.codexStatePath = options.codexStatePath;
    this.sessionsDirectory = options.sessionsDirectory ?? path.join(
      path.dirname(this.codexStatePath),
      "sessions",
    );
    this.cache = new Map();
    this.active = new Map();
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
  }

  async get(projectId, rangeDays = DEFAULT_RANGE_DAYS) {
    const key = `${projectId}:${rangeDays}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const active = this.active.get(key);
    if (active) return active;
    const promise = this.#read(projectId, rangeDays)
      .then((value) => {
        this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
        return value;
      })
      .finally(() => this.active.delete(key));
    this.active.set(key, promise);
    return promise;
  }

  async #read(projectId, rangeDays) {
    const project = this.database.getProject(projectId);
    if (!project) return null;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    const endDate = defaultEndDate(timeZone);
    const roots = await readProjectRoots(this.codexStatePath, projectId, project);
    const threadIds = new Set(
      this.database
        .listTasks({ projectId, archived: "all" })
        .map((task) => task.threadId)
        .filter(Boolean),
    );
    for (const thread of this.database.listAiChatThreads()) {
      if (thread.origin.projectId === projectId && thread.codexThreadId) threadIds.add(thread.codexThreadId);
    }
    const allProjects = projectId === DEFAULT_PROJECT_ID;
    const events = [];
    const startDate = shiftDate(endDate, 1 - rangeDays);
    for (const filePath of await listJsonlFiles(this.sessionsDirectory, {
      startDate,
      endDate,
      timeZone,
    })) {
      const sessionId = sessionIdFromPath(filePath);
      if (allProjects || threadIds.has(sessionId)) {
        events.push(...(await readSessionEvents(filePath)).events);
        continue;
      }
      const metadata = await readSessionMetadata(filePath);
      const matches = roots.some((root) => (
        pathWithin(root, metadata.cwd)
        || metadata.roots.some((candidate) => pathWithin(root, candidate))
      ));
      if (matches) events.push(...(await readSessionEvents(filePath)).events);
    }
    return {
      projectId,
      generatedAt: new Date().toISOString(),
      ...aggregateCodexUsage(events, { rangeDays, endDate, timeZone }),
    };
  }

  async close() {
    await Promise.allSettled(this.active.values());
    this.active.clear();
    this.cache.clear();
  }
}

export const CODEX_USAGE_DEFAULT_RANGE_DAYS = DEFAULT_RANGE_DAYS;
export const CODEX_USAGE_MAX_RANGE_DAYS = MAX_RANGE_DAYS;

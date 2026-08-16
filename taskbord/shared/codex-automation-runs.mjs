import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

const INDEX_TAIL_BYTES = 512 * 1024;
const ROLLOUT_TAIL_BYTES = 128 * 1024;
const MAX_ERROR_LENGTH = 600;

/**
 * Read the terminal error for the Codex automation run that corresponds to a
 * native automation's lastRunAt. The native automation API exposes lastRunAt
 * but not the run status/error, so the local session record is the canonical
 * diagnostic source for this host-side circuit breaker.
 */
export async function readLatestAutomationRunFailure({
  codexHomePath,
  automationName,
  lastRunAt,
  now = Date.now(),
}) {
  if (
    typeof codexHomePath !== "string"
    || codexHomePath.length === 0
    || typeof automationName !== "string"
    || automationName.length === 0
    || !Number.isFinite(lastRunAt)
  ) return null;

  const sessionIndexPath = path.join(codexHomePath, "session_index.jsonl");
  const indexText = await readTail(sessionIndexPath, INDEX_TAIL_BYTES);
  if (!indexText) return null;

  const candidates = indexText
    .split(/\r?\n/)
    .map(parseJsonLine)
    .filter((entry) => entry?.thread_name === automationName)
    .map((entry) => ({
      id: entry.id,
      updatedAt: Date.parse(entry.updated_at),
    }))
    .filter((entry) => (
      typeof entry.id === "string"
      && Number.isFinite(entry.updatedAt)
      && entry.updatedAt >= lastRunAt - 5_000
      && entry.updatedAt <= now + 60_000
    ))
    .sort((left, right) => left.updatedAt - right.updatedAt);
  const candidate = candidates[0];
  if (!candidate) return null;

  const rolloutPath = await findRolloutPath(codexHomePath, candidate.id, candidate.updatedAt);
  if (!rolloutPath) return null;
  const rolloutText = await readTail(rolloutPath, ROLLOUT_TAIL_BYTES);
  if (!rolloutText) return null;

  const completion = rolloutText
    .split(/\r?\n/)
    .map(parseJsonLine)
    .filter((entry) => entry?.type === "event_msg" && entry.payload?.type === "task_complete")
    .at(-1);
  const error = completion?.payload?.error;
  if (!error || typeof error.message !== "string" || error.message.length === 0) return null;

  return {
    kind: "run-failed",
    runAt: lastRunAt,
    message: error.message.slice(0, MAX_ERROR_LENGTH),
  };
}

async function findRolloutPath(codexHomePath, sessionId, updatedAt) {
  const day = new Date(updatedAt);
  const dayDirectory = path.join(
    codexHomePath,
    "sessions",
    String(day.getUTCFullYear()).padStart(4, "0"),
    String(day.getUTCMonth() + 1).padStart(2, "0"),
    String(day.getUTCDate()).padStart(2, "0"),
  );
  const fileName = `rollout-${sessionId}.jsonl`;
  const archivedDirectory = path.join(codexHomePath, "archived_sessions");
  const candidates = [path.join(dayDirectory, fileName), path.join(archivedDirectory, fileName)];
  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }

  try {
    const entries = await readdir(dayDirectory, { withFileTypes: true });
    const match = entries.find((entry) => (
      entry.isFile()
      && entry.name.includes(sessionId)
      && entry.name.endsWith(".jsonl")
    ));
    if (match) return path.join(dayDirectory, match.name);
  } catch {
    // The run may already have been archived.
  }
  try {
    const entries = await readdir(archivedDirectory, { withFileTypes: true });
    const match = entries.find((entry) => (
      entry.isFile()
      && entry.name.includes(sessionId)
      && entry.name.endsWith(".jsonl")
    ));
    return match ? path.join(archivedDirectory, match.name) : null;
  } catch {
    return null;
  }
}

async function readTail(filePath, byteLength) {
  let handle;
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return "";
    const length = Math.min(byteLength, fileStat.size);
    const buffer = Buffer.alloc(length);
    handle = await open(filePath, "r");
    await handle.read(buffer, 0, length, fileStat.size - length);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function parseJsonLine(line) {
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

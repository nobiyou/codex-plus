import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateCodexUsage } from "../server/codex-usage.mjs";

test("aggregates cumulative token snapshots once and keeps sessions unique across days", () => {
  const usage = aggregateCodexUsage([
    {
      sessionId: "session-cross-day",
      timestamp: "2026-08-09T23:00:00.000Z",
      model: "gpt-5.6",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 20,
        cache_write_input_tokens: 3,
        output_tokens: 10,
        reasoning_output_tokens: 4,
        total_tokens: 100,
      },
    },
    {
      sessionId: "session-cross-day",
      timestamp: "2026-08-10T01:00:00.000Z",
      model: "gpt-5.6",
      usage: {
        input_tokens: 140,
        cached_input_tokens: 30,
        cache_write_input_tokens: 4,
        output_tokens: 16,
        reasoning_output_tokens: 6,
        total_tokens: 140,
      },
    },
    {
      sessionId: "session-cross-day",
      timestamp: "2026-08-11T01:00:00.000Z",
      model: "gpt-5.6",
      usage: {
        input_tokens: 200,
        cached_input_tokens: 50,
        cache_write_input_tokens: 6,
        output_tokens: 24,
        reasoning_output_tokens: 10,
        total_tokens: 200,
      },
    },
    {
      sessionId: "session-other",
      timestamp: "2026-08-11T02:00:00.000Z",
      model: "gpt-4.1",
      usage: {
        input_tokens: 20,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: 5,
        reasoning_output_tokens: 1,
        total_tokens: 20,
      },
    },
  ], { rangeDays: 2, endDate: "2026-08-11", timeZone: "UTC" });

  assert.equal(usage.from, "2026-08-10");
  assert.equal(usage.to, "2026-08-11");
  assert.equal(usage.sessions, 2);
  assert.deepEqual(usage.totals, {
    inputTokens: 120,
    cachedInputTokens: 30,
    cacheWriteInputTokens: 3,
    outputTokens: 19,
    reasoningOutputTokens: 7,
    totalTokens: 120,
  });
  assert.deepEqual(usage.models.map((model) => [model.model, model.sessions, model.totals.totalTokens]), [
    ["gpt-5.6", 1, 100],
    ["gpt-4.1", 1, 20],
  ]);
  assert.deepEqual(usage.days.map((day) => [day.date, day.sessions, day.totals.totalTokens]), [
    ["2026-08-10", 1, 40],
    ["2026-08-11", 2, 80],
  ]);
});

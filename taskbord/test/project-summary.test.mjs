import test from "node:test";
import assert from "node:assert/strict";

import { isProjectSummaryDue } from "../server/project-summary.mjs";

test("failed project summaries retry shortly after the last attempt", () => {
  const attemptedAt = "2026-08-13T10:00:00.000Z";
  const now = Date.parse("2026-08-13T10:04:59.000Z");

  assert.equal(
    isProjectSummaryDue({ attemptedAt, error: "Codex 退出码 1" }, now),
    false,
  );
  assert.equal(
    isProjectSummaryDue({ attemptedAt, error: "Codex 退出码 1" }, Date.parse("2026-08-13T10:05:00.000Z")),
    true,
  );
  assert.equal(
    isProjectSummaryDue({ attemptedAt, error: null }, Date.parse("2026-08-13T10:05:00.000Z")),
    false,
  );
});

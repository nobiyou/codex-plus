# Task Run Governance Work Intent

Date: `2026-09-01`

Parent specification:
`docs/aegis/specs/2026-09-01-anneal-task-run-governance-design.md`

Parent plan:
`docs/aegis/plans/2026-09-01-anneal-task-run-governance-plan.md`

## TaskIntentDraft

- Outcome: implement local Taskboard task-run persistence, lease/fencing
  authority, normalized execution evidence, and the first local Codex adapter.
- Scope: `taskbord/server`, focused Taskboard tests, and one isolated feature
  worktree based on `origin/main`.
- Success evidence: every planned state transition and stale-authority case
  has focused test evidence; task-originated local Codex execution records a
  bounded TaskRun; verified handoff reaches `in_review` without writing `done`;
  existing chat and automation regressions remain green.
- Stop condition: done only after plan verification and scoped diff review;
  blocked when the clean baseline cannot preserve required user changes;
  needs-verification when a required command is unavailable or incomplete;
  scope-exceeded when cloud, UI, remote workers, worktrees, PRs, or merge
  behavior becomes necessary.
- Non-goals: Anneal replacement, PostgreSQL/Prisma, cloud/D1 parity, UI,
  automatic worktree provisioning, GitHub delivery, merge executor, automatic
  merge, or OS sandbox claims.

## BaselineReadSetHint

- `taskbord/AGENTS.md`
- `taskbord/server/database.mjs`
- `taskbord/server/ai-chat-process.mjs`
- `taskbord/server/ai-chat.mjs`
- `taskbord/server/app.mjs`
- `taskbord/shared/taskboard-automation.mjs`
- `taskbord/test/ai-chat-database.test.mjs`
- `taskbord/test/ai-chat-runner.test.mjs`
- `taskbord/test/ai-chat-server.test.mjs`
- `taskbord/test/server.test.mjs`
- Approved design and implementation plan under `docs/aegis/`.

## BaselineUsageDraft

- Required baseline refs: the approved design, implementation plan, Taskboard
  rules, SQLite owner, local Codex executor, and existing regression tests.
- Delivered context refs: current checkout `E:/dev/Codex_Plus_Pro-main/windows`,
  HEAD `48e5e4204593c99f8a5dfb07025c35dc0eae2227`, branch `main`, and
  `origin/main` at the same commit.
- Acknowledged before plan refs: Taskboard is the sole task/run owner;
  `ai_chat_runs` remains chat-turn state; Windows process control remains
  local; user changes are preserved.
- Cited in plan refs: approved design Sections 2, 3, 4, 5, 6, 7, 8, and 9;
  plan Sections Architecture, Compatibility Boundary, Files, Tasks, and
  Execution Readiness View.
- Missing refs: no existing architecture ADR for task-run execution.
- Decision: `continue`.

## ImpactStatementDraft

- Affected layers: local SQLite persistence, TaskRunService, local
  AiChatService adapter, and focused tests.
- Canonical owners: `tasks` for task state; `TaskboardDatabase` for storage;
  `TaskRunService` for run authority; `AiChatService` for local provider
  execution; existing chat and launcher owners remain unchanged.
- Preserved invariants: optimistic task versions, thread binding, dependency
  checks, user acceptance, no raw prompt/credential persistence, and local/
  cloud separation.
- Retirement state: no existing owner is deleted. Existing chat-run/session
  parsing stays active for its current consumers.

## Execution Readiness View

- Intent Lock: implement the approved local TaskRun slice only.
- Scope Fence: SQLite, TaskRunService, local AiChatService adapter, focused
  tests, and `in_review` handoff.
- Baseline Lock: start from verified `origin/main`; the current `main` dirty
  state is preserved and is not a source baseline.
- Compatibility Boundary: no launcher/CDP, web UI, cloud schema, automatic
  worktree, PR, merge, or `ai_chat_*` semantic change.
- Retirement Boundary: keep existing chat and native automation paths until a
  later approved adapter replaces them with evidence.
- Evidence Required: exact focused tests, regression results, scoped diff,
  exact feature HEAD, and residual-risk report.
- Advisory Boundary: this work record is execution guidance and is not an
  authoritative completion decision.

## TaskStartSnapshot

- Root: `E:/dev/Codex_Plus_Pro-main/windows`
- HEAD: `48e5e4204593c99f8a5dfb07025c35dc0eae2227`
- Branch: `main`
- `origin/main`: `48e5e4204593c99f8a5dfb07025c35dc0eae2227`
- Worktree list before isolation: only the current `main` worktree.
- Active Git operations: none detected.
- Existing status entries: 129, including broad changes under `source/`,
  `taskbord/`, `tests/`, and new Aegis planning records.
- Staged changes: none observed.
- Ownership: current user-owned dirty state; coordinator must not stage,
  revert, stash, reset, or clean it.
- Planned implementation worktree:
  `C:/Users/ltxxg/AppData/Local/Temp/codex-task-run-governance-worktree-20260901`
- Planned branch: `codex/anneal-task-run-governance`

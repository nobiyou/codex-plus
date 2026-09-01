# Anneal-Inspired Task Run Governance Implementation Plan

## Goal

Implement the approved Anneal-inspired execution-governance slice inside the
existing Windows Taskboard. A Taskboard task must be able to record a bounded
execution attempt, enforce one active lease, reject stale workers with a
fencing token, retain normalized events, and preserve the existing
`in_review`-then-user-acceptance workflow.

The implementation stops at the local Taskboard server and local Codex
execution path. It does not port Anneal's control plane.

## Architecture

```text
Taskboard task (tasks)
        |
        v
TaskRunService -- TaskboardDatabase -- SQLite task_runs/task_run_events
        |
        v
AiChatService -- ai-chat-process.mjs -- Windows Codex process tree
        |
        v
provider completion + verification evidence -> task in_review
```

Canonical owners:

- `tasks` remains the task identity, status, version, and development-context
  owner.
- `TaskboardDatabase` remains the SQLite schema and atomic persistence owner.
- `TaskRunService` owns task-run state transitions, lease authority, input
  bounds, and failure classification.
- `AiChatService` remains the local Codex turn owner and becomes the first
  task-run adapter for task-originated chat threads.
- `ai_chat_runs` and `ai_chat_events` remain the chat UI's turn and event
  owner; they are correlated through bounded task-run event data, not merged.
- `ai-chat-process.mjs` remains the provider process and normalized Codex event
  owner.
- `launch.ps1`, the injector, cloud/D1 code, and the web UI are outside this
  plan.

## Tech Stack

- Node.js ESM, existing `node:sqlite` `DatabaseSync`, and SQLite WAL mode.
- Existing Node `node:test` suite.
- Task 3's Windows process-tree helper and Codex `exec --json` protocol.
- Existing Taskboard server/API lifecycle and task optimistic-version rules.

## Baseline/Authority Refs

- Approved design: `docs/aegis/specs/2026-09-01-anneal-task-run-governance-design.md`.
- Repository rules: `taskbord/AGENTS.md`.
- SQLite owner: `taskbord/server/database.mjs`.
- Existing chat persistence: `taskbord/server/database.mjs`,
  `taskbord/test/ai-chat-database.test.mjs`.
- Codex execution owner: `taskbord/server/ai-chat-process.mjs` and
  `taskbord/server/ai-chat.mjs`.
- Existing task status and version owner: `taskbord/server/database.mjs` and
  `taskbord/shared/taskboard-automation.mjs`.
- Existing regression entry points: `taskbord/test/ai-chat-runner.test.mjs`,
  `taskbord/test/ai-chat-server.test.mjs`, and `taskbord/test/server.test.mjs`.
- Prior art: Anneal commit
  `e0ba28541662d2f8c2b69297734d7cdba7233d64`, specifically its architecture,
  support matrix, Codex adapter, and workspace modules.

## Compatibility Boundary

- Keep the current Windows Launcher, CDP injection, Taskboard embedding,
  SQLite database, and local/cloud separation unchanged.
- Keep `ai_chat_threads`, `ai_chat_runs`, and `ai_chat_events` schemas and
  consumer semantics backward-compatible.
- Keep task optimistic versions, thread bindings, dependency checks, comments,
  and the `in_review` user-acceptance boundary unchanged.
- Do not use POSIX process-group calls on Windows. Use the Task 3 Windows
  process-tree helper.
- Do not persist raw prompts, credentials, full environment values, raw Codex
  JSONL, or unbounded command output.
- Do not enable permission bypass or claim that a lease is an OS sandbox.
- Do not add cloud/D1 tables or migration export fields in this slice.
- Do not add web UI, automatic worktree creation, PR delivery, GitHub App,
  merge executor, or automatic merge.
- Existing unrelated dirty worktree changes are preserved and are not staged,
  reverted, or included in task commits.

## TDD Route

- Mode: `off`
- Decision: `skipped`
- Strict authority: `not applicable`
- Strict signals: persistence and lease behavior are high-risk, but the
  approved design explicitly selected post-change focused regression rather
  than strict TDD.
- Light eligibility: not selected because this adds persistence and authority
  semantics.
- TDD-fit exception: none.
- Test posture: post-change regression with focused database/service tests.
- Reason: the approved design and repository rules do not require strict
  test-first execution; tests will cover every new state transition and the
  existing chat path after implementation.
- Verification: focused `node --test` commands followed by the existing
  Taskboard test suite and syntax/type/build checks that the dirty baseline
  permits.

## Scope Check

Facts:

- SQLite already owns tasks and chat runs/events.
- The current local Codex path owns the child process and normalized provider
  events.
- Current Taskboard automation owns task claim/status/thread-binding protocol,
  but not a durable task-scoped lease/run record.

Assumptions:

- The first worker can be the in-process `AiChatService` adapter for task-
  originated local conversations.
- Task-run history follows the existing hard-delete behavior for tasks.
- Cloud/D1 parity is intentionally not required for local execution state.

Unknowns that do not block this plan:

- Native scheduled Codex automation will need a later adapter because it is
  not a Taskboard-owned child process.
- Automatic worktree provisioning requires a separate design and delivery
  contract.

Requirement Ready Check:

- Requirement source refs: approved design Sections 1, 4, 6, 7, 8, and 9.
- Goals and scope refs: approved design Sections 1 and 4.
- User/scenario refs: user approved the design direction and first local
  adapter boundary.
- Requirement item refs: task-scoped run, lease, heartbeat, fencing, event,
  failure, recovery, and `in_review` rules in the approved design.
- Acceptance refs: approved design Section 9.
- Open blocker questions: none for this implementation slice.
- Decision: `ready`.

## Files

Task 0 only inspects Git state and creates an isolated execution location.

Task 1 modifies `taskbord/server/database.mjs` and adds
`taskbord/test/task-run-database.test.mjs`.

Task 2 adds `taskbord/server/task-run.mjs` and
`taskbord/test/task-run-service.test.mjs`.

Task 3 modifies `taskbord/server/app.mjs`,
`taskbord/server/ai-chat.mjs`, and adds or updates
`taskbord/shared/process-tree.mjs` plus
`taskbord/test/ai-chat-task-run.test.mjs`.

Task 4 modifies `taskbord/server/task-run.mjs` and
`taskbord/test/task-run-service.test.mjs` if the verification-to-`in_review`
  operation needs a narrow completion method. It does not modify web UI or
  native automation prompt behavior.

Task 5 runs focused and regression verification; it should not modify source.

## Change Necessity

- User-visible need: Taskboard executions need durable, auditable attempt
  state and stale-worker protection inspired by Anneal.
- No-change option: existing `ai_chat_runs`, `task_activities`, and session
  log parsing cannot provide task-scoped lease authority or fencing; extending
  only the UI would leave execution races unresolved.
- Why code change is necessary: the behavior requires new SQLite constraints,
  atomic state transitions, and a server-owned authority check.
- Minimum boundary: Taskboard database, one task-run service, and the local
  `AiChatService` adapter with focused tests.
- Decision: `code-change`.

## Existence Check

- Proposed new surface: `task_runs` / `task_run_events` and
  `TaskRunService`.
- Existing reuse candidate: current Taskboard SQLite, `ai_chat_runs`, and
  `AiChatService`.
- Why existing surface is insufficient: `ai_chat_runs` is thread-scoped,
  chat-UI-owned, and cannot represent a task attempt without a chat thread;
  `task_activities` has no lease or fencing semantics.
- Creation proof: the approved design requires task-scoped attempts, one
  active lease per task, stale-writer rejection, and event retention.
- Entropy/retirement impact: one new task-run owner is added inside the current
  Taskboard server; no old owner is duplicated or retired. Native automation
  remains outside until it has a real Taskboard-owned process boundary.
- Decision: `add-with-proof`.

## Architecture Integrity Lens

- Invariant: one canonical owner for task status, one for execution-attempt
  authority, and one for chat-turn state.
- Canonical contract: `TaskboardDatabase` persists; `TaskRunService` controls
  task-run transitions; `AiChatService` adapts provider execution.
- Responsibility overlap: do not put lease logic in the launcher, injected
  page, web UI, `ai_chat_runs`, or native automation prompt.
- Higher-level simplification: use the existing SQLite and server instead of
  adding Anneal's PostgreSQL/control-plane service.
- Retirement/falsifier: if a later worker requires a remote API, prove that
  the TaskRunService contract remains the single authority before adding a
  transport adapter; reject any path that writes run state directly.
- Verdict: aligned with the approved design.

## Plan-Time Complexity Check

- Artifact class: persistence plus execution-authority contract.
- Target files: existing `database.mjs` and `ai-chat.mjs`, one new server
  service, and focused tests.
- Current pressure: `database.mjs` and `ai-chat.mjs` are already large, and the
  working tree contains broad unrelated changes.
- Projected pressure: moderate; schema stays in the existing database owner,
  while transition policy is kept in one new service instead of further
  expanding `database.mjs` or `app.mjs`.
- Budget result: `within-budget` if the service remains local and UI/cloud
  files stay untouched.
- Better file boundary: edit-in-place for schema and adapter; add one
  `task-run.mjs` owner for lifecycle policy; do not create a generic runner
  framework.
- Recommendation: `split task` into the five slices below.

## Repair and Retirement Tracks

Repair track:

- Root gap: no durable task-scoped execution authority exists, while chat
  runs and native automation only provide partial observations.
- Stable repair: add one SQLite-backed TaskRunService and connect only the
  local Codex adapter.
- Verification: every transition, stale token, expiry, event bound, and
  existing chat regression has a named test command.

Retirement track:

- Old/partial paths: `ai_chat_runs` and `codex-automation-runs.mjs` remain
  active for their existing chat/session responsibilities.
- Keep reason: they serve different owners and consumers; replacing them would
  break current chat and automation behavior.
- Deletion trigger: only a later approved design that moves those consumers to
  TaskRunService may retire or merge them.

## Tasks

### Task 0: Capture baseline and create the isolated execution location

Files: no product files. Use a feature branch/worktree according to
`taskbord/AGENTS.md` before touching Taskboard code.

Why: the current `main` worktree has 129 existing status entries. The new work
must not mix with or overwrite those changes.

Change Necessity: no source change; this is the required ownership and
rollback boundary for the later code tasks.

Impact/Compatibility: preserve the original worktree unchanged. Record the
exact HEAD, branch, remote, status count, and diff stat before creating the
execution location. If current uncommitted Taskboard changes are required for
the approved baseline, stop and port only the named prerequisite after review;
do not bulk-copy or stash them.

Verification:

```powershell
git status --short
git diff --stat
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git remote -v
```

Steps:

1. Save the command output as the task-start receipt outside the product
   source or in the active work record.
2. Confirm the implementation base is the verified `origin/main` commit or a
   reviewed branch containing only required prerequisites.
3. Create a `codex/anneal-task-run-governance` branch and worktree when the
   source baseline is ready.
4. Re-run `git status --short` in the new location and confirm it is clean
   before Task 1.

### Task 1: Add SQLite task-run and event persistence

Files:

- Modify `taskbord/server/database.mjs`.
- Add `taskbord/test/task-run-database.test.mjs`.

Why: lease and fencing behavior cannot be reliable if run state exists only in
memory or in session logs.

Change Necessity: the new task-scoped tables, partial active-run index,
attempt uniqueness, and atomic compare-and-update operations do not exist in
the current schema. Keep all persistence inside `TaskboardDatabase`.

Impact/Compatibility: use the existing inline migration and WAL transaction
style. Do not modify `ai_chat_*` tables. Use `task_id REFERENCES tasks(id)
ON DELETE CASCADE` to match the existing Taskboard deletion behavior. Store
structured JSON as bounded text, not raw provider payloads.

Implementation steps:

1. Add row conversion helpers for `task_runs` and `task_run_events` near the
   existing AI chat row conversion helpers.
2. Add `CREATE TABLE IF NOT EXISTS task_runs` with the approved fields,
   positive attempt constraint, bounded status constraint, optional execution
   target snapshots, lease fields, result fields, and timestamps.
3. Add indexes for `(task_id, attempt)`, `(task_id, created_at, id)`, and a
   partial unique index on `task_id` where status is `claimed` or `running`.
4. Add `CREATE TABLE IF NOT EXISTS task_run_events` with `run_id`,
   per-run `sequence`, stable `kind`, `source`, bounded content/data, and a
   unique `(run_id, sequence)` index.
5. Add database methods with atomic transactions and explicit `ApiError`
   codes: `createTaskRun`, `getTaskRun`, `listTaskRuns`, `claimTaskRun`,
   `startTaskRun`, `heartbeatTaskRun`, `insertTaskRunEvent`,
   `completeTaskRun`, and `interruptExpiredTaskRuns`.
6. Make claim select the next attempt number, generate no user-visible token,
   and update only an eligible queued or explicitly expired run.
7. Make heartbeat, event insertion, and completion compare owner, token,
   active status, and lease deadline in the same write transaction. Return a
   conflict for stale or expired authority.
8. Bound errors, summaries, verification evidence, event content, and event
   JSON before SQLite insertion. Reject malformed structured data.
9. Add tests for fresh migration, existing database reopen, attempt ordering,
   one active run, event sequence ordering, transaction rollback, and task
   deletion behavior.

Verification:

```powershell
Set-Location taskbord
node --test test/task-run-database.test.mjs
node --check server/database.mjs
```

Expected result: focused database tests pass, a fresh temporary SQLite file
contains both new tables and indexes, and existing `ai_chat_*` tests remain
unchanged.

### Task 2: Add the server-owned TaskRunService lifecycle policy

Files:

- Add `taskbord/server/task-run.mjs`.
- Add `taskbord/test/task-run-service.test.mjs`.

Why: database persistence should not become the public authority for input
validation, state transition policy, or failure taxonomy.

Change Necessity: a dedicated service is the smallest stable boundary that
keeps lease/fencing policy out of the launcher, UI, chat persistence, and
database query helpers.

Impact/Compatibility: the service is local and synchronous with the existing
server process. It must use the database methods from Task 1 and must not add a
second storage backend or a generic runner framework.

Implementation steps:

1. Define the supported run statuses, event sources/kinds, failure classes,
   maximum field lengths, and a default lease duration in one module.
2. Implement `TaskRunService` methods `create`, `claim`, `start`, `heartbeat`,
   `event`, `complete`, `interruptExpired`, `get`, and `list`.
3. Generate a cryptographically random opaque fencing token at claim time and
   pass it only to the owning adapter. Do not include it in returned public
   task activity or event data.
4. Ensure `heartbeat`, `event`, and `complete` reject a wrong owner, wrong
   token, terminal run, or expired lease with a stable conflict error.
5. Mark lease-expired active runs `interrupted` with failure class
   `interrupted`; do not silently requeue or reuse the row.
6. Normalize completion input so provider exit, protocol error, timeout,
   interruption, workspace, Git, verification, and unknown failures remain
   distinguishable.
7. Expose verification completion as an explicit operation that requires the
   current task version and actor when it promotes a task to `in_review`.
   Never allow this service to write `done`.
8. Inject a clock or timestamp function in tests so lease expiry is deterministic
   without sleeping.

Verification:

```powershell
Set-Location taskbord
node --test test/task-run-service.test.mjs
node --check server/task-run.mjs
```

Expected result: service tests cover create/claim/start/heartbeat/complete,
wrong owner/token, expired lease, terminal idempotence, event bounds, explicit
verification, and `in_review` without `done`.

### Task 3: Connect the local AiChatService adapter

Files:

- Modify `taskbord/server/app.mjs`.
- Modify `taskbord/server/ai-chat.mjs`.
- Add `taskbord/shared/process-tree.mjs` and route both Codex execution and
  interruption through it instead of direct POSIX process-group calls.
- Add `taskbord/test/ai-chat-task-run.test.mjs`.

Why: the current local Codex child-process path is the first execution owner
that can provide real provider events, exit status, interruption, and Windows
process-tree behavior.

Change Necessity: without this adapter, the new persistence remains unused and
cannot prove the approved direct operation path.

Impact/Compatibility:

- Only create a TaskRun when the AI thread has a Taskboard task origin.
- Leave ordinary chat threads on the existing `ai_chat_runs` path.
- Keep the current Codex args, sandbox confirmation, thread binding, event
  normalization, process timeout, interruption, and cleanup behavior.
- Do not move a task to `done`; a provider completion without verification is
  not user acceptance.

Implementation steps:

1. Instantiate `TaskRunService` in the existing server composition path and
   pass it to `AiChatService`; do not create a second server or database.
2. In `startTurn`, resolve and validate the task context before spawning Codex.
   Create a queued TaskRun containing the project, host, workspace, branch,
   worktree, and Codex thread snapshots available at that moment.
3. Claim and start the TaskRun immediately before the child process starts. If
   either write fails, do not launch Codex and preserve the existing error
   response behavior.
4. For each normalized provider event, append a bounded TaskRun event with the
   TaskRun authority and continue emitting the existing `ai.event` to chat.
   Event data may contain the bounded `ai_chat_run` identifier for correlation,
   but must not contain raw JSONL or prompts.
5. Implement `signalProcessTree` in `taskbord/shared/process-tree.mjs`: use
   `taskkill.exe /PID <pid> /T /F` with hidden Windows execution and retain a
   POSIX fallback only for non-Windows test environments. Route Codex process
   termination through this helper.
6. Send heartbeats on a bounded interval while the child is active. If the
   TaskRun authority is lost, stop accepting new events and terminate the
   Windows process tree through the existing process-tree helper.
7. In the existing finalization path, complete the TaskRun with provider exit
   code, normalized failure class, bounded output summary, and no verification
   claim unless the caller supplies explicit verification evidence.
8. Preserve the existing `ai_chat_run` finalization and thread status updates
   even when the task-run event stream is empty or the provider emits an
   unsupported event.
9. Add tests with a fake Codex executable/process adapter for task-origin and
   ordinary-chat threads, successful and failed provider exits, interruption,
   event correlation, Windows process-tree routing, and no raw prompt
   persistence.

Verification:

```powershell
Set-Location taskbord
node --test test/ai-chat-task-run.test.mjs test/ai-chat-runner.test.mjs test/ai-chat-server.test.mjs
node --check server/ai-chat.mjs
node --check server/app.mjs
node --check shared/process-tree.mjs
```

Expected result: task-originated local Codex turns produce a TaskRun and
normalized events; ordinary chat behavior remains unchanged; provider
completion does not bypass verification or user acceptance.

### Task 4: Prove verification handoff and preserve native automation boundary

Files:

- Modify `taskbord/server/task-run.mjs` to provide the explicit verified-run
  handoff method.
- Extend `taskbord/test/task-run-service.test.mjs` with the handoff coverage.
- Do not modify `taskbord/shared/taskboard-automation.mjs` in this slice.

Why: Anneal's value includes a review gate, but the current project already
owns the `in_review` boundary. The implementation must prove that a verified
run can hand off there without turning native automation into a second runner.

Change Necessity: the handoff needs an explicit task-version compare-and-write;
using a direct unversioned task update would create a race with the existing
Taskboard automation. This is a server-service operation, not a new public
route in this slice.

Impact/Compatibility: verification promotion must use the existing task
version and actor contract, record the run evidence before moving the task,
return a version conflict without overwriting a newer task change, and never
write `done`.

Implementation steps:

1. Add `promoteVerifiedRunToReview(runId, owner, fencingToken, taskVersion,
   verificationEvidence, actor)` to `TaskRunService`.
2. Require a terminal successful run and non-empty bounded verification
   evidence; reject failed, interrupted, stale, or unverified runs.
3. Persist verification evidence and move the parent task to `in_review` in
   the smallest available transaction boundary. Reuse the existing
   `moveTask`/activity semantics instead of creating a new task-status writer.
4. Add tests for successful handoff, stale task version, stale fencing token,
   already-`done` task, failed run, and repeated promotion.
5. Verify the native scheduled automation path remains unchanged and still
   requires its existing thread binding, dependency, comment, and version
   protocol.

Verification:

```powershell
Set-Location taskbord
node --test test/task-run-service.test.mjs test/taskboard-automation.test.mjs test/server.test.mjs
```

Expected result: verified execution is handed to `in_review`; no code path
created by this plan marks a task `done`; native automation tests are unchanged.

### Task 5: Run the bounded regression and close out the slice

Files: no intended source changes. Inspect only the Taskboard files listed in
the plan and preserve unrelated status entries.

Why: the new persistence and authority path crosses the database and Codex
execution boundary, so focused tests alone are insufficient.

Change Necessity: no new code; this is the acceptance evidence for the plan.

Impact/Compatibility: do not run release, cloud deployment, GitHub delivery,
or automatic merge commands. Do not stage or commit unrelated dirty files.

Verification:

```powershell
Set-Location taskbord
node --test test/task-run-database.test.mjs test/task-run-service.test.mjs test/ai-chat-task-run.test.mjs test/ai-chat-runner.test.mjs test/ai-chat-server.test.mjs test/taskboard-automation.test.mjs
node --test
npm run typecheck
npm run build:web
Set-Location ..
git diff --check -- taskbord/server/database.mjs taskbord/server/task-run.mjs taskbord/server/ai-chat.mjs taskbord/server/app.mjs taskbord/test/task-run-database.test.mjs taskbord/test/task-run-service.test.mjs taskbord/test/ai-chat-task-run.test.mjs
git status --short
git diff --stat -- taskbord/server/database.mjs taskbord/server/task-run.mjs taskbord/server/ai-chat.mjs taskbord/server/app.mjs taskbord/test/task-run-database.test.mjs taskbord/test/task-run-service.test.mjs taskbord/test/ai-chat-task-run.test.mjs
```

Expected result: focused and existing tests pass; build/typecheck results are
reported separately if the dirty baseline blocks them; diff check has no new
errors; only the scoped implementation files and approved planning files are
task-owned.

## Plan Pressure Test

- Owner/contract/retirement: Taskboard remains the only task/run control-plane
  owner; chat and native automation paths retain their existing owners.
- Architecture integrity/higher-level path: one local service and one SQLite
  source replace the need for Anneal's separate control plane.
- Verification scope: fresh schema, every lease transition, provider adapter,
  Windows termination, task version handoff, and existing chat/automation
  regressions are named.
- Task executability: each task names files, reason, boundary, implementation
  steps, exact commands, and expected result.
- Pressure result: `proceed`.

## Execution Readiness View

- Intent Lock: implement the approved local TaskRun governance slice, not
  Anneal itself.
- Scope Fence: SQLite, TaskRunService, local AiChatService adapter, focused
  tests, and existing `in_review` handoff only.
- Baseline Lock: use the approved design and current Taskboard owner files;
  reconcile the 129-entry dirty worktree before code edits.
- Approved Behavior: task attempts have durable state, leases, fencing,
  bounded events, failure evidence, and explicit review handoff.
- Owner/Contract Constraints: `tasks` owns status; `TaskboardDatabase` owns
  storage; `TaskRunService` owns run authority; `AiChatService` owns local
  provider execution; user acceptance owns `done`.
- Compatibility Boundary: no `ai_chat_*` semantic change, no launcher/CDP
  change, no cloud schema, no POSIX process-group port, no raw prompt storage.
- Retirement Boundary: retain existing chat and native automation paths until
  a later approved adapter proves a Taskboard-owned execution boundary.
- Task Batches: baseline isolation; persistence; lifecycle policy; local
  adapter; review handoff; regression closeout.
- Test Obligations: database migration, transaction, lease/fence, events,
  provider outcomes, process tree, privacy bounds, task version and existing
  chat/automation regressions.
- Review Gates: inspect each scoped diff after its focused tests; do not move
  the Taskboard issue to `done`; keep the implementation branch unmerged until
  user acceptance.
- Drift/Rewind Rules: if a task requires cloud, UI, native automation, remote
  workers, worktree provisioning, or auto-merge, return to the design owner
  instead of expanding this plan.
- Evidence Required Before Completion: exact test outputs, scoped diff, exact
  HEAD, task status `in_review` where applicable, and remaining risk report.
- Advisory Boundary: this view is execution guidance, not a GateDecision,
  PolicySnapshot, or completion authority.

## Risks

- Existing uncommitted changes may be prerequisites or conflict with the
  approved baseline. Resolve this in Task 0 before editing.
- SQLite transaction boundaries can accidentally permit a stale writer if the
  owner/token/expiry predicates are split across statements. Keep the compare
  and write atomic and test the negative cases.
- AI provider completion is not verification. Do not promote a task merely
  because Codex emitted `turn.completed`.
- Local process termination and database authority can diverge after a crash.
  Record interruption and rely on the existing Windows process-tree cleanup;
  do not claim stronger recovery than the tests demonstrate.
- The cloud/D1 path will not expose these local execution records. Report that
  boundary if a cloud project is used.

## Rollback and Retirement

- Before implementation, preserve the original dirty worktree and use the
  isolated feature worktree.
- Schema rollback is limited: this phase must not remove tables from a live
  database. If the implementation is rejected, stop using the new service and
  leave the additive tables unused until a reviewed migration decision exists.
- The old `ai_chat_*` and native automation paths remain active and are not
  migrated or deleted.
- No automatic merge, release, push, or production deployment is part of this
  plan.

## ADR and Baseline Sync Signal

The approved design already records an ADR signal for the durable owner and
execution-authority decision. If later work adds cloud parity, remote workers,
automatic worktrees, PR delivery, or automatic merge, create or update the
architecture decision record before changing those boundaries. This plan does
not create a second authority document or modify the product baseline.

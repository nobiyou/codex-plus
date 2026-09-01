# Anneal-Inspired Task Run Governance Design

Date: `2026-09-01`

Status: `approved for planning`

## 1. Purpose

This design brings the most useful Anneal execution-governance ideas into the
existing Windows Taskboard without importing Anneal's control plane, database,
or platform assumptions.

The target outcome is an auditable execution attempt for a Taskboard task:

```text
Taskboard task -> task run claim -> Windows Codex execution -> structured events
               -> lease/heartbeat authority -> verification evidence -> in_review
```

The design does not change the rule that a completed implementation waits in
`in_review` until the user accepts it.

## 2. Evidence Baseline

### 2.1 Anneal

The reviewed Anneal source is commit
`e0ba28541662d2f8c2b69297734d7cdba7233d64` (`0.6.0 Developer Preview`). Its
architecture uses a Web Console, control-plane API, PostgreSQL/Prisma, a local
Runner, per-run Git workspaces, provider preflight, fenced leases, and durable
Run/SessionEvent records.

Anneal's support matrix marks Windows `Unsupported`. Its runner assumes POSIX
path, command, and process-group behavior. Its permission-bypass provider flags
are also not an OS sandbox and must not become a default in this project.

### 2.2 Current project

- `launch.ps1` owns the Windows launcher, official Codex startup, CDP, and
  injection boundary.
- `source/injector.mjs` and `source/taskboard-embed.js` own the launcher bridge
  and embedded Taskboard surface.
- `taskbord/server/database.mjs` owns the local SQLite schema and already
  stores `ai_chat_threads`, `ai_chat_runs`, and `ai_chat_events`.
- `taskbord/server/ai-chat-process.mjs` owns Codex CLI JSON execution and the
  Windows process-tree termination path.
- `taskbord/server/ai-chat.mjs` owns local AI chat turn lifecycle.
- `taskbord/shared/taskboard-automation.mjs` owns the Taskboard automation
  prompt and task claim/status protocol, including dependency checks, thread
  binding, optimistic versions, and the `in_review` boundary.

`ai_chat_runs` is an existing reusable persistence pattern, but its canonical
meaning is one turn of one chat thread. It cannot represent a Taskboard task
execution that has no local chat thread, and its one-active-run constraint is
thread-scoped rather than task-scoped.

## 3. Ownership and Boundaries

| Surface | Canonical owner | Boundary |
| --- | --- | --- |
| Task identity and status | `tasks` in Taskboard SQLite | A run never replaces task status or task versioning. |
| Execution attempt | `task_runs` in the same SQLite database | One row is one attempt; it is not a second task model. |
| Normalized execution evidence | `task_run_events` in the same SQLite database | Store structured, bounded events; never raw prompts, credentials, or raw JSONL. |
| Chat turn | `ai_chat_threads` / `ai_chat_runs` | Keep chat UI lifecycle independent from task execution lifecycle. |
| Native Codex account/thread data | Official Codex | Store only the minimum binding or thread identifier needed for correlation. |
| Windows process control | `ai-chat-process.mjs` and existing process-tree helper | Do not import Anneal's POSIX process-group implementation. |
| Taskboard UI and API | `taskbord` | No duplicate control plane in the launcher or injected page. |

The new tables are local execution state. They are not added to the cloud/D1
schema or migration export in this phase.

## 4. Scope

### In scope

1. Add local SQLite persistence for task execution attempts and structured run
   events.
2. Add a server-owned service boundary for create/claim, heartbeat, event
   append, completion, interruption, and list/get operations.
3. Use an opaque fencing token and lease owner to reject stale executioners.
4. Snapshot the execution target so later task edits cannot rewrite the history
   of an earlier attempt.
5. Reuse current Codex event normalization and Windows process execution in the
   first local execution adapter.
6. Preserve the existing `in_review` and user-acceptance workflow.

### Explicit non-goals

- Replacing SQLite with PostgreSQL/Prisma.
- Copying Anneal's Web Console, Chain model, Inbox service, or remote control
  plane.
- Creating a second Task/Chain source of truth.
- Automatic worktree provisioning in the first slice.
- GitHub App, pull request automation, merge executor, or automatic merge.
- Cloud/D1 parity for local execution records.
- Default permission bypass or an OS-level sandbox claim.
- UI redesign. The first slice is server and execution evidence only.

## 5. Data Model

### 5.1 `task_runs`

The table is created by the existing SQLite migration path and uses the
project's current inline `CREATE TABLE IF NOT EXISTS` style.

Required fields:

| Field | Meaning |
| --- | --- |
| `id` | Opaque run identifier. |
| `task_id` | Parent task identifier; task deletion follows existing Taskboard cascade semantics. |
| `attempt` | Monotonic attempt number per task. |
| `status` | `queued`, `claimed`, `running`, `completed`, `failed`, `interrupted`, or `canceled`. |
| `lease_owner` | Worker/adapter identity holding the current lease. |
| `lease_expires_at` | Lease deadline in UTC ISO format. |
| `heartbeat_at` | Last accepted heartbeat in UTC ISO format. |
| `fencing_token` | Opaque token issued for this claim generation. |
| `codex_thread_id` | Optional native Codex thread snapshot. |
| `project_id` | Optional project snapshot. |
| `codex_project_kind` | Optional local/remote project-kind snapshot. |
| `codex_host_id` | Optional host snapshot. |
| `workspace_path` | Workspace snapshot used by the execution. |
| `branch` | Optional branch snapshot or delivered branch. |
| `worktree_path` | Optional existing worktree snapshot; no automatic provisioning is implied. |
| `base_sha` | Optional exact base commit observed before execution. |
| `started_at` / `finished_at` | Execution timestamps. |
| `exit_code` | Provider process exit code when available. |
| `failure_class` | Bounded failure category when the run is not successful. |
| `error` | Bounded human-readable failure detail. |
| `output_summary` | Bounded result summary without hidden prompt content. |
| `verification_evidence` | Structured bounded verification result. |
| `created_at` / `updated_at` | Row lifecycle timestamps. |

Constraints and indexes:

- `task_id` references `tasks(id)` and follows the existing hard-delete
  behavior; this phase does not promise retention after a task is deleted.
- `attempt` is positive and unique per task.
- At most one `claimed` or `running` run exists for a task at a time.
- A partial unique index prevents two active claims for the same task.
- The fencing token is never written to user-visible activity or logs.
- `failure_class` is restricted to the implementation's bounded taxonomy:
  `preflight`, `provider_exit`, `provider_protocol`, `timeout`, `interrupted`,
  `workspace`, `git`, `verification`, and `unknown`.

### 5.2 `task_run_events`

Required fields:

| Field | Meaning |
| --- | --- |
| `id` | Event identifier. |
| `run_id` | Parent execution attempt. |
| `sequence` | Monotonic per-run event sequence. |
| `kind` | Stable event kind such as `run.started`, `provider.event`, `heartbeat`, `verification`, or `run.failed`. |
| `source` | `taskboard`, `runner`, or `codex`. |
| `content` | Bounded visible text. |
| `data` | Optional bounded structured JSON. |
| `created_at` | Event timestamp. |

`(run_id, sequence)` is unique. Event data is normalized before persistence;
raw Codex JSONL, complete prompts, environment values, credentials, and
unbounded command output are not stored.

## 6. Run Lifecycle and Authority

1. `create` inserts a `queued` run with a task and execution-target snapshot.
2. `claim` runs in a SQLite write transaction, checks that the task is still
   eligible, creates a new fencing token, sets owner and lease deadline, and
   moves the run to `claimed`.
3. `start` moves `claimed` to `running` using the same owner and token.
4. `heartbeat` extends the lease only when owner, token, run status, and lease
   deadline all match. A stale or expired caller receives a conflict and cannot
   write further evidence.
5. `append event` requires the same active authority. Events after lease loss
   are rejected instead of being silently attached to a later attempt.
6. `complete` requires the same authority and changes the run exactly once to a
   terminal state. It records exit status, failure class, output, and
   verification evidence in one transaction.
7. An expired run is marked `interrupted` with an explicit lease-expiry reason;
   it is not silently reused or automatically requeued. A new attempt is a new
   row with a new token.
8. A successful, verified run may move its parent task to `in_review`. No run
   may mark the task `done` without the existing user-acceptance path.

The server is the authority for run state. The process adapter is responsible
for provider process termination and must not decide that a stale worker still
owns a run.

## 7. First Adapter and Compatibility

The first execution adapter should be the local `AiChatService` path because it
already owns the Codex child process and normalized event stream. For a task-
originated chat thread, it can correlate the chat turn with a `task_run` while
leaving `ai_chat_runs` available to the existing chat UI.

Native Codex scheduled automation remains a later adapter. Its current control
path is an external automation/thread protocol, not a Taskboard-owned child
process, so it must not be represented as completed merely because a thread
was created or a message was sent.

Existing behavior remains unchanged for:

- `ai_chat_threads`, `ai_chat_runs`, and `ai_chat_events` consumers;
- task version checks, thread binding, dependency checks, and comments;
- Windows launcher/CDP ownership;
- `in_review` as the completion handoff state;
- local/cloud schema separation.

## 8. Failure and Recovery

- Provider preflight failure creates a failed run with `failure_class=preflight`
  and no claim is left active.
- Provider non-zero exit or protocol failure is recorded separately from a
  lease conflict.
- Timeout or process interruption records the bounded error and terminates the
  Windows process tree through the existing helper.
- Lease expiry produces an `interrupted` run and blocks stale event writes.
- SQLite busy/transaction errors are surfaced with context; they are not
  converted into an empty queue or a successful run.
- A run's final output and verification evidence are written before the task
  can be moved to `in_review`.

## 9. Verification and Acceptance

The implementation plan must provide focused tests for:

1. schema creation on a fresh database and opening an existing database;
2. one active run per task and monotonic attempts;
3. claim, start, heartbeat, and complete with the current token;
4. stale token, wrong owner, and expired lease rejection;
5. event sequence ordering and bounded structured data;
6. interruption after lease expiry or service restart;
7. successful run evidence followed by `in_review`, without `done`;
8. unchanged existing AI chat run/event behavior;
9. Windows process-tree termination on timeout/interruption;
10. no raw prompt, credential, or raw JSONL persistence.

The direct operation path to verify is:

```text
Taskboard task with a local Codex thread
  -> AiChatService starts execution
  -> task_runs/task_run_events receive state and normalized events
  -> Codex exits and verification is recorded
  -> task moves to in_review
  -> user acceptance remains the only path to done
```

## 10. Alternatives

### A. Selected: separate task execution tables in the existing SQLite

This preserves the distinction between a task execution attempt and a chat
turn while keeping one database owner. It creates one justified new persistence
surface and leaves a clear path for future workers.

### B. Rejected: extend `ai_chat_runs`

This would reduce the initial schema change but make chat-thread lifecycle the
owner of Taskboard execution. It cannot cleanly represent task runs without a
chat thread and would couple future worker semantics to the chat UI contract.

### C. Deferred: port the complete Anneal control plane

This would introduce PostgreSQL, Prisma, a separate runner, POSIX-to-Windows
porting, multiple services, and a second task model. It is not proportional to
the current goal and would violate the existing Taskboard ownership boundary.

## 11. Governance Notes

### TaskIntentDraft

- Outcome: make Taskboard execution attempts auditable and lease-safe.
- Scope: local SQLite, Taskboard server, first local Codex adapter.
- Stop condition: run evidence is durable, stale workers are fenced, and the
  existing `in_review` path is preserved.
- Non-goals: Anneal replacement, cloud parity, automatic merge, and UI redesign.

### BaselineReadSetHint

- `taskbord/AGENTS.md`
- `taskbord/server/database.mjs`
- `taskbord/server/ai-chat-process.mjs`
- `taskbord/server/ai-chat.mjs`
- `taskbord/shared/taskboard-automation.mjs`
- `taskbord/test/ai-chat-database.test.mjs`
- `taskbord/test/ai-chat-runner.test.mjs`
- `docs/aegis/plans/2026-08-13-taskboard-service-settings.md`
- Anneal `docs/architecture.md`, `docs/release/support-matrix.md`,
  `packages/runner/src/adapters/codex.ts`, and `packages/runner/src/workspace.ts`

### BaselineUsageDraft

- Required baseline refs: current Taskboard owner files and existing SQLite AI
  run/event contract.
- Delivered context refs: current local repository state and Anneal commit
  `e0ba28541662d2f8c2b69297734d7cdba7233d64`.
- Acknowledged before plan refs: Taskboard remains the sole task/workflow
  owner; Windows process control remains local.
- Cited in design refs: Sections 2, 3, 7, and 10.
- Missing refs: no existing architecture ADR for task execution runs.
- Decision: `continue after user review`.

### ImpactStatementDraft

- Affected layers: SQLite schema, Taskboard server service, local Codex
  execution adapter, focused tests.
- Preserved invariants: task optimistic versioning, thread binding, user
  acceptance, existing chat lifecycle, launcher ownership.
- New surface proof: existing `ai_chat_runs` is thread-scoped; a task-scoped
  lease and attempt cannot be represented without a separate table.
- Retirement: no old owner is deleted; native automation integration remains
  deferred until it has a Taskboard-owned execution boundary.

### ADR signal

This design crosses persistence and execution-authority boundaries. If the
implementation is accepted beyond the first local adapter, record the durable
owner decision in an architecture decision record before adding cloud parity,
remote workers, or automatic delivery.

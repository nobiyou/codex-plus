# TodoCheckpointDraft

Date: `2026-09-10`

## Current Todo

- [x] Task 1: add compatibility registry and evaluator
- [x] Task 2: add scoped fallback rules and repair orchestration
- [x] Task 3: add compatibility settings section and controls
- [x] Task 4: run regression and live acceptance

## Active Slice

Tasks 1-4 are implemented and verified against the approved design and plan.
The existing dirty Taskboard/theme fixes remain user-owned and are preserved.

## Completed Todos

- Approved design and saved specification.
- Saved implementation plan and added it to `docs/aegis/INDEX.md`.
- Captured pre-edit branch/HEAD/upstream/worktree/index-lock snapshot.

## Evidence Refs

- `docs/aegis/specs/2026-09-10-codex-ui-compatibility-checklist-design.md`
- `docs/aegis/plans/2026-09-10-codex-ui-compatibility-checklist-plan.md`
- HEAD `686ac0f606f9216a2e514ea7f65e8bea6c27f091`
- Branch `main`; upstream divergence `0 1` for `@{upstream}...HEAD`.
- Task 1: `node --check source/injector.mjs` passed.
- Task 1-3: `node --test tests/compatibility-checklist-contract.test.mjs` passed 4/4.
- Task 2: `node --test tests/theme-compatibility-contract.test.mjs` passed 9/9.
- Task 4: `node --test tests/taskboard-embed-contract.test.mjs` passed 7/7.
- Task 4: `node --test tests/model-picker-contract.test.mjs` passed 1/1.
- Task 4: `git diff --check` passed.
- Live CDP: Codex `26.903.8094.0`, settings UI
  `win-settings-scope-b2-1.8.5-taskboard-service-compatibility-v1`.
- Live CDP: compatibility panel rendered 18 rows and category counts
  `all=18`, `global=5`, `conversation=4`, `programming=4`, `settings=5`.
- Live CDP: controlled composer fixture moved from `degraded` to
  `fallbackActive`; root token was
  `data-codex-plus-compat-composer=fallback`, computed border was `1px`, and
  the fixture/token were removed after the check.
- Live CDP: new-conversation route showed programming items as
  `notObserved`; changed-file review route exposed two diff headers and three
  diff file rows, with programming Diff items `healthy`.
- Live CDP: Taskboard sidebar remained present; service controls rendered and
  status refresh reported `运行正常` on port `47824`.

## Blockers

- None.

## DriftCheckDraft

- Intent alignment: yes; Tasks 1-4 provide the approved registry, evaluator,
  repair path, scoped fallbacks, settings UI, and live route evidence.
- Scope fence: unchanged; no Taskboard, official app, network, persistence, or
  commit action.
- Owner/contract: existing injector/theme owners plus one focused contract test.
- Retirement: no old logic removed.
- Decision: `done`.

## Next Step

No further task work is required. Preserve the uncommitted worktree and await
explicit authorization before any commit or push.

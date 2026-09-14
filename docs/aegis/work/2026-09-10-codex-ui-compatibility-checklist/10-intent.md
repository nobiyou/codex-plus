# Task Intent Draft

- Outcome: add a Codex UI compatibility checklist and bounded quick-repair
  workflow to the existing Windows settings popover.
- Goal: make post-update style failures visible by category and repair known
  selector/layout drift without modifying official Codex files.
- Success evidence: focused registry/UI contract passes, existing theme and
  Taskboard contracts pass, syntax/diff checks pass, and live settings/home/
  thread/diff routes show truthful statuses and repair behavior.
- Stop condition: complete after all plan tasks are verified, or stop at
  `needs-verification` / `blocked` if live Codex evidence or a required
  dependency is unavailable.
- Non-goals: remote rule loading, arbitrary CSS editing, persisted repair state,
  Taskboard/API/schema changes, official app patching, commit/push/release.

## BaselineReadSetHint

- `docs/aegis/specs/2026-09-10-codex-ui-compatibility-checklist-design.md`
- `docs/aegis/plans/2026-09-10-codex-ui-compatibility-checklist-plan.md`
- `source/injector.mjs`
- `source/theme.css`
- `tests/theme-compatibility-contract.test.mjs`
- `tests/taskboard-embed-contract.test.mjs`
- `docs/aegis/plans/2026-08-13-taskboard-service-settings.md`

## BaselineUsageDraft

- Required baseline refs: approved design, approved plan, injector settings
  lifecycle, theme compatibility contracts, Taskboard settings boundary.
- Delivered context refs: current dirty worktree and prior live Taskboard/theme
  compatibility evidence.
- Acknowledged before plan refs: current `git status`, `git diff --stat`,
  current branch/HEAD/upstream/worktree state.
- Cited in plan refs: all required baseline refs.
- Missing refs: no formal `docs/current/` baseline; no workspace helper.
- Decision: continue.

## ImpactStatementDraft

- Affected layers: injected runtime registry/evaluator, settings popover, theme
  CSS fallback rules, focused source-contract tests.
- Canonical owners: `source/injector.mjs` for runtime/UI and `source/theme.css`
  for visual rules.
- Invariants: one style element, one settings popover owner, route absence is
  informational, Taskboard bridge/runtime unchanged.
- Compatibility: item-specific root fallback attributes only; no broad
  speculative selector and no persistent repair state.
- Retirement: no existing rule or owner is removed in this slice.

# EvidenceBundleDraft

## Task 1

- `node --check source/injector.mjs`: passed.
- `node --test tests/compatibility-checklist-contract.test.mjs`: passed 4/4.
- Evidence: registry version, four categories, 18 stable IDs, status model,
  safe selector matching, and route-aware evaluator are present.

## Task 2

- `node --check source/injector.mjs`: passed after repair changes.
- `node --test tests/compatibility-checklist-contract.test.mjs`: 4/4 passed.
- `node --test tests/theme-compatibility-contract.test.mjs`: 9/9 passed.
- Evidence: sidebar/composer/diff fallback attributes are declared in the
  injector and scoped in `source/theme.css`; no broad unscoped fallback was
  added.

## Task 3

- `node --check source/injector.mjs`: passed.
- Compatibility settings rendered the new navigation section, five category
  filters, 18 registry-driven rows, summary counts, and repair controls.
- `SETTINGS_UI_VERSION` was live at
  `win-settings-scope-b2-1.8.5-taskboard-service-compatibility-v1`.

## Task 4

- `node --test tests/taskboard-embed-contract.test.mjs`: passed 7/7.
- `node --test tests/model-picker-contract.test.mjs`: passed 1/1.
- `git diff --check`: passed.
- CDP runtime was Codex `26.903.8094.0` on ports `9229`/`9329`.
- Category filter counts were `all=18`, `global=5`, `conversation=4`,
  `programming=4`, and `settings=5`.
- Controlled composer repair observed `degraded` -> `fallbackActive`, root
  token `data-codex-plus-compat-composer=fallback`, and computed border `1px`.
- New-conversation route showed programming items as `notObserved` while the
  composer and sidebar anchors were observed.
- Changed-file review route exposed two Diff headers and three file rows;
  programming Diff items were `healthy`.
- Taskboard sidebar remained visible. The service settings controls rendered,
  and an explicit refresh reported `运行正常` on port `47824`.

## Completion Boundary

- All plan tasks and acceptance criteria have fresh evidence.
- No production files were changed during live acceptance.
- The worktree remains intentionally uncommitted; no push or cleanup was
  performed.

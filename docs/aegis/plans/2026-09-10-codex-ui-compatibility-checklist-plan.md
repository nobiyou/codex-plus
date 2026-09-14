# Goal

在 Codex Plus Pro Windows 设置面板中增加“界面兼容性”清单，按全局、
对话界面、编程界面、设置界面检查主题元素，识别 Codex 更新造成的
选择器或样式失效，并提供重新应用主题和已知备用规则修复。

# Architecture

- `source/injector.mjs` 是兼容性注册表、DOM 检测、运行时状态、修复编排
  和设置 UI 的唯一 owner。
- `source/theme.css` 是主题和兼容 CSS 的唯一 owner；备用规则只能通过
  item-specific 根属性启用。
- `tests/compatibility-checklist-contract.test.mjs` 是新功能的 focused
  source-contract test。
- `tests/theme-compatibility-contract.test.mjs` 继续验证既有主题和新增
  fallback CSS。
- 现有 `applyFeatureSettings`、`updateSettingsPanel`、`SETTINGS_SECTIONS`
  和 `SETTINGS_UI_VERSION` 继续作为现有设置生命周期的入口。

# Tech Stack

Windows PowerShell 5.1+、Node.js ESM、Codex 页面内嵌 JavaScript/CSS、
Chrome DevTools Protocol、Node `node:test`。

# Baseline/Authority Refs

- `docs/aegis/specs/2026-09-10-codex-ui-compatibility-checklist-design.md`：
  已确认的功能范围、清单、状态和验收规格。
- `source/injector.mjs`：现有 settings popover、`applyFeatureSettings`、
  DOM decoration、Codex version info 和 `SETTINGS_UI_VERSION`。
- `source/theme.css`：现有全局、sidebar、composer、home、diff、settings
  规则以及最近的 `group/file-diff` / `h-full flex-col` 兼容修复。
- `tests/theme-compatibility-contract.test.mjs`：现有主题兼容性合同测试。
- `tests/taskboard-embed-contract.test.mjs`：Taskboard 注入和服务设置合同，
  必须保持通过。
- `docs/aegis/plans/2026-08-13-taskboard-service-settings.md`：现有
  Taskboard 设置 owner 和不改变服务边界的约束。

BaselineUsageDraft:
- Required baseline refs: approved UI compatibility design; injector settings lifecycle; theme compatibility tests; Taskboard settings plan
- Delivered context refs: current dirty parent worktree; current Codex 26.903.8094.0 runtime acceptance from prior task
- Acknowledged before plan refs: `source/injector.mjs`, `source/theme.css`, existing tests, current `git status`
- Cited in plan refs: all required refs above
- Missing refs: no formal `docs/current/` baseline exists in this checkout
- Decision: continue

# Compatibility Boundary

- Do not modify official Codex or Microsoft Store files.
- Do not add network fetches, telemetry, arbitrary selector editing, or a
  second theme/config owner.
- Do not modify Taskboard Web API, database schema, runtime lifecycle,
  launcher ownership, bridge messages, tokens, or process control.
- Route absence is `not-observed`, not a failure. The checker must not apply
  speculative global CSS when no supported anchor exists.
- Existing dirty changes in `source/theme.css`, `taskboard-runtime.psm1`,
  `tests/taskboard-runtime.test.ps1`, and
  `tests/theme-compatibility-contract.test.mjs` remain intact.
- No commit, push, release package, or cleanup is part of this turn without
  separate explicit authorization.

# TDD Route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Strict signals: none requested by the user; the project already has focused
  post-change contract tests
- Light eligibility: focused source-contract assertions and `node --check`
  provide proportional verification for this UI compatibility slice
- TDD-fit exception: the injected runtime is built as a large template string,
  so the first verification surface is source contracts plus isolated helper
  checks rather than a strict RED/GREEN browser test cycle
- Test posture: post-change regression plus controlled DOM-fixture checks
- Reason: user approved the design, not strict test-first implementation
- Verification: focused Node tests, existing regression tests, syntax checks,
  `git diff --check`, and live Codex acceptance

# Verification

Static commands after implementation:

```powershell
node --check source/injector.mjs
node --test tests/compatibility-checklist-contract.test.mjs
node --test tests/theme-compatibility-contract.test.mjs
node --test tests/taskboard-embed-contract.test.mjs
node --test tests/model-picker-contract.test.mjs
git diff --check
```

Runtime acceptance must open the settings popover on the current Codex runtime,
check the four filters, confirm route-aware `未观察到`, inspect the home/thread
and programming diff routes, use `重新应用主题`, and verify the Taskboard
sidebar and service controls remain healthy. A controlled DOM fixture must
exercise a degraded item, one fallback activation, and the post-repair state.

# Change Necessity

- User-visible need: users need a fast, explainable recovery path after Codex
  updates change themed DOM structure or injection timing.
- No-change / non-code option: README-only troubleshooting cannot inspect the
  live DOM or reapply scoped rules from inside Codex.
- Why code change is necessary: runtime DOM probing and repair must execute in
  the injected page and coordinate with the existing settings/theme lifecycle.
- Minimum change boundary: one bounded compatibility block in `injector.mjs`,
  scoped fallback rules in `theme.css`, and one focused contract test.
- Decision: code-change

# Existence Check

- Proposed new surface: compatibility registry and compatibility settings
  section.
- Existing owner / reuse candidate: existing injector settings popover and
  theme CSS; existing theme contract test suite.
- Why existing surface is insufficient: the current settings sections expose
  feature toggles but do not record native anchors, probe results, or repair
  actions.
- Creation proof: the requested categories and repair workflow require a
  source-controlled inventory and runtime state not represented elsewhere.
- Entropy / retirement impact: no new process or persistence owner; the
  registry is removed or superseded with the settings owner if the settings
  architecture changes.
- Decision: add-with-proof, implemented inside existing owners

# Architecture Integrity Lens

- Invariant: there is exactly one injected theme style owner and one settings
  UI owner.
- Canonical owner / contract: `injector.mjs` owns registry evaluation and
  repairs; `theme.css` owns visual declarations; tests assert their contract.
- Responsibility overlap: avoid putting selector evaluation in CSS or adding
  a second JSON rule loader.
- Higher-level simplification: reuse `applyFeatureSettings` and existing
  settings rebuild/versioning rather than adding a new refresh channel.
- Retirement / falsifier: if item-specific fallback attributes begin carrying
  business state or need persistence, stop and re-evaluate the owner boundary.
- Verdict: proceed with existing-owner extension.

# Plan-Time Complexity Check

Complexity Budget:
- Artifact class: Source Complexity, Test Complexity, Decision / Plan Complexity
- Target files / artifacts: `source/injector.mjs`, `source/theme.css`, new focused test, this plan/spec
- Current pressure: `injector.mjs` and `theme.css` are large mixed-purpose owners; existing settings and CSS blocks are cohesive but lengthy
- Projected post-change pressure: a bounded registry/probe/UI block plus scoped CSS; no new runtime owner
- Budget result: at-risk but governable
- Planned governance: keep registry, evaluator, repair functions, and UI rendering adjacent; add focused contract coverage; do not broaden the catalogue beyond the approved first release

Plan-Time Complexity Check:
- Target files: `source/injector.mjs`, `source/theme.css`, `tests/compatibility-checklist-contract.test.mjs`
- Existing size / shape signals: large injector template string, large theme stylesheet, source-contract tests already use static assertions
- Owner fit: injector and theme are the existing canonical owners
- Add-in-place risk: duplicate lifecycle calls or broad CSS fallback selectors
- Better file boundary: no new runtime file; a new test file is justified because the checklist contract is distinct from existing Taskboard/model-picker contracts
- Recommendation: edit-in-place for production owners, add one focused test owner

# Plan Pressure Test

- Owner / contract / retirement: clear owner and no delete-first change.
- Architecture integrity / higher-level path: existing settings/theme lifecycle
  is reused; no second control plane.
- Verification scope: static contracts plus live route-aware Codex acceptance.
- Task executability: four bounded tasks with exact files and commands.
- Pressure result: proceed

# Tasks

## Task 1: Add the compatibility registry and evaluator

Files:

- Modify `source/injector.mjs` near the existing settings state and
  `SETTINGS_SECTIONS` declarations.
- Create `tests/compatibility-checklist-contract.test.mjs`.

Why: the settings UI needs a single source-controlled inventory of elements,
anchors, risks, probes, and repair capabilities before it can present truthful
status.

Change Necessity: a static README cannot inspect the live Codex document. The
minimum source change is the registry plus a small evaluator in the existing
injected runtime; no new service or persistence is required.

Impact/Compatibility: registry evaluation is read-only. It must tolerate an
invalid or removed selector, never throw out of the settings runtime, and
return `not-observed` for route-specific absence. Existing theme and Taskboard
decoration behavior remains unchanged.

Steps:

1. Add constants for the four category keys/labels, the stable status keys and
   labels (`healthy`, `degraded`, `fallback-active`, `not-observed`,
   `unsupported`), and the checklist version.
2. Add the approved first-release registry entries with stable IDs, labels,
   descriptions, ordered anchor selectors, risk, optional `styleProbe`, and
   optional fallback token. Keep anchors semantic-first and item-scoped.
3. Add a safe selector matcher that catches `querySelectorAll` failures and
   returns `{ selector, name, count }` for the first matching anchor. Add a
   route-aware evaluator that returns `{ id, category, status, matchedAnchor,
   matchCount, probe, reason, repairAvailable }`.
4. Add style probes only for stable structure/marker checks. Do not compare one
   exact accent color; light/dark and accent modes must remain valid.
5. Add a focused source-contract test that reads `source/injector.mjs` and
   asserts the registry version, all four category keys, every approved item
   ID, every status key, semantic anchor families, and evaluator function names.
   It must also assert that unsafe selector evaluation is guarded by a `try`
   / `catch` path.
6. Run the focused test and syntax check.

Verification:

```powershell
node --check source/injector.mjs
node --test tests/compatibility-checklist-contract.test.mjs
```

Expected result: syntax passes and the contract test reports all registry
categories/items/statuses present.

Repair Track: registry/evaluator is the canonical diagnostic path; it must not
silently mutate styles.

Retirement Track: no existing selector is removed. An item or anchor is
retired only through a later registry/spec update backed by a current runtime
baseline.

## Task 2: Add scoped fallback rules and repair orchestration

Files:

- Modify `source/injector.mjs` in the compatibility runtime block and reuse
  `applyFeatureSettings` / existing decoration lifecycle.
- Modify `source/theme.css` next to the existing composer/sidebar/diff
  compatibility rules.
- Extend `tests/compatibility-checklist-contract.test.mjs` and
  `tests/theme-compatibility-contract.test.mjs`.

Why: detection alone cannot recover a known post-update selector change. Repair
must be explicit, bounded, and verifiable.

Change Necessity: the user-facing recovery action needs code that can reapply
the current style and toggle source-controlled fallback selectors. The minimum
boundary is one root-token map plus existing theme/decoration calls.

Impact/Compatibility: fallback tokens are runtime-only root attributes. They do
not alter stored feature settings, Taskboard state, or official Codex files.
Existing active compatibility rules stay intact; new rules are additional
scoped declarations.

Steps:

1. Add an item-to-fallback-token map and helpers that set/remove only tokens
   declared by the registry. Use item-specific attributes such as
   `data-codex-plus-compat-diff-preview="fallback"`; reject unknown tokens.
2. Add `runCompatibilityRepair(itemId)` that validates the item, reapplies
   the existing settings/decoration path with non-persisting options, enables
   only its declared fallback, and schedules a fresh check. Add
   `runAllCompatibilityRepairs()` that applies the global path and repairs only
   degraded items with declared fallback tokens.
3. Add bounded fallback declarations for the current known change families:
   composer utility/composer surface, sidebar semantic fragments, and the
   `group/file-diff` descendant in the anonymous `h-full flex-col` host. Every
   fallback must have a semantic descendant and an item-specific root token;
   it must not target all `h-full`, `flex-col`, or rounded elements.
4. Extend the tests to assert every fallback token appears in both the
   registry/repair map and CSS, and that CSS uses the item-specific root
   attribute plus the expected semantic descendant.
5. Run the focused and existing theme contract tests.

Verification:

```powershell
node --test tests/compatibility-checklist-contract.test.mjs
node --test tests/theme-compatibility-contract.test.mjs
git diff --check
```

Expected result: all fallback tokens are source-controlled, scoped, and
covered; existing diff/composer compatibility assertions remain passing.

Repair Track: reapplication uses the existing `applyFeatureSettings` path and
does not create a second style element or settings popover.

Retirement Track: existing broad rules remain until a later live baseline proves
they are redundant; no fallback is removed in this slice.

## Task 3: Add the compatibility settings section and controls

Files:

- Modify `source/injector.mjs` in the existing settings section construction,
  `activateSettingsSection`, `updateSettingsPanel`, and settings lifecycle.
- Modify `source/theme.css` in the existing settings UI block, including narrow
  layout and light/dark accent variants.
- Extend `tests/compatibility-checklist-contract.test.mjs`.

Why: users need a visible, categorized explanation and a safe repair button at
the point where existing theme settings are already managed.

Change Necessity: the requested quick repair cannot be exposed through a
command-line-only path; it must be reachable inside Codex and reflect live
DOM state.

Impact/Compatibility: add a `compatibility` navigation item and panel without
renaming existing section keys. Increment `SETTINGS_UI_VERSION` so an old
popover is rebuilt. Preserve `恢复默认` behavior and all existing Taskboard,
version, model, pet, and theme controls.

Steps:

1. Add `compatibility` to `SETTINGS_SECTIONS` and create runtime state for the
   selected category, item results, last check time, and in-flight check/repair
   guard. Ensure repeated settings rebuilds clean up no new global listeners.
2. Add a summary row showing Codex version, Plus Pro version, last check time,
   healthy/degraded counts, and the top-level `全部检测`, `重新应用主题`, and
   `修复所有已知问题` buttons.
3. Add the segmented category selector with `全部`, `全局`, `对话界面`,
   `编程界面`, and `设置界面`. Render rows from the registry rather than
   duplicating item metadata in the UI.
4. Render each row with label, description, status badge, risk, matched anchor,
   reason, repair explanation, `重新检测`, and `修复此项`. Disable repair when
   the item has no repair or is `not-observed`/`unsupported`.
5. Run detection when the panel opens, when the compatibility section becomes
   active, after `全部检测`, and after repairs. Do not add a continuous
   MutationObserver; the existing decoration observer remains the only DOM
   observer.
6. Add CSS for status badges, summary/action layout, category selector, item
   rows, matched-anchor text, and narrow-popover stacking. Reuse existing
   focus-visible and accent variables. Confirm labels and controls do not
   overflow the existing settings popover.
7. Extend the focused test to assert the compatibility section key/label,
   settings UI version bump, category labels, summary/action labels, item row
   markers, and settings lifecycle hooks.
8. Run syntax and focused tests.

Verification:

```powershell
node --check source/injector.mjs
node --test tests/compatibility-checklist-contract.test.mjs
```

Expected result: the settings source contains one compatibility panel driven by
the registry, and the focused contract passes.

Repair Track: UI status is rendered from the evaluator result and must not show
“修复成功” unless the post-repair check reports `healthy` or
`fallback-active`.

Retirement Track: existing settings panels and controls remain unchanged; the
new section can be removed as one bounded block if a later native compatibility
surface replaces it.

## Task 4: Run regression and live acceptance

Files/artifacts:

- No production file changes are expected in this task unless verification
  identifies a concrete defect in Tasks 1-3.
- Inspect current `source/injector.mjs`, `source/theme.css`, focused tests, and
  the existing Taskboard files.

Why: this feature touches the shared injector, settings popover, and selectors
that previously regressed after Codex updates. Static contracts alone cannot
prove route-aware behavior or visual recovery.

Change Necessity: runtime acceptance is required to distinguish source
presence from a working injected UI and computed style.

Impact/Compatibility: verification is read-only except for opening the local
Codex runtime and using the new repair controls. Do not stage or delete
unrelated dirty files.

Steps:

1. Run the complete focused command set from the Verification section.
2. Run the existing PowerShell Taskboard runtime regression only if the
   compatibility changes touched a shared Taskboard-adjacent lifecycle path;
   otherwise record that it was not required and run the existing Node
   Taskboard contract test.
3. Launch or attach to the current Codex Plus Pro runtime using the existing
   project launcher path. Open settings and verify the compatibility section,
   four category filters, summary counts, and repair controls.
4. Verify home/thread routes for global and conversation items. Navigate to a
   code/diff result and inspect the known `h-full flex-col` / `group/file-diff`
   / `overflow-clip` path. Confirm programming items are observed there and
   absent programming items on a home route show `未观察到`.
5. Use `重新应用主题` and one item repair. Confirm the DOM root token, style
   element, computed structural properties, and displayed status agree.
6. Verify the Taskboard sidebar remains visible, the Taskboard service section
   still loads, and existing settings panels still open.
7. Inspect `git diff --stat`, `git diff --check`, and `git status --short`.
   Preserve the four pre-existing modified files and the new spec/plan/test
   files. Do not commit or push without explicit user authorization.

Verification:

```powershell
node --check source/injector.mjs
node --test tests/compatibility-checklist-contract.test.mjs
node --test tests/theme-compatibility-contract.test.mjs
node --test tests/taskboard-embed-contract.test.mjs
node --test tests/model-picker-contract.test.mjs
git diff --check
git status --short
```

Expected result: focused and existing contract tests pass; live settings and
route checks show truthful statuses; Taskboard remains healthy; no unrelated
files are staged, reverted, deleted, or pushed.

# Execution Readiness View

- Intent Lock: deliver a four-category Codex UI compatibility checklist with
  truthful detection and bounded quick repair.
- Scope Fence: only the existing injector/theme/test owners plus the approved
  spec/plan; no official app, Taskboard API, database, remote rules, or
  arbitrary CSS editor.
- Baseline Lock: preserve current dirty taskboard runtime and theme fixes; use
  existing settings lifecycle and compatibility contracts.
- Approved Behavior: detect anchors, distinguish route absence, reapply theme,
  enable known scoped fallbacks, and report post-repair state.
- Owner / Contract Constraints: injector owns runtime/UI; theme.css owns CSS;
  settings version bump rebuilds stale popovers.
- Compatibility Boundary: no broad speculative selectors, no persisted repair
  state, no new process or network path.
- Retirement Boundary: no old rules removed; fallback retirement requires a
  later baseline and contract update.
- Task Batches: registry/evaluator -> fallback/repair -> settings UI -> static
  and live verification.
- Test Obligations: focused registry/UI contract, theme contract, Taskboard and
  model-picker regression contracts, syntax, diff check, live acceptance.
- Review Gates: after Task 1 contract, after Task 3 UI contract, before any
  release/commit action.
- Drift / Rewind Rules: if current Codex DOM differs from the approved anchor
  families, stop the affected item, mark it unsupported/degraded, and update
  the registry/spec before broadening CSS.
- Evidence Required Before Completion: passing commands, current working-tree
  status, settings screenshot or equivalent live DOM/computed-style evidence,
  and confirmation that Taskboard remains visible.
- Advisory Boundary: this is an execution handoff view, not authoritative
  completion or commit permission.

# Risks

- `injector.mjs` template-string edits can break syntax outside the visible
  compatibility block. Run `node --check` after every task that edits it.
- Overly strict probes can create false degraded states across light/dark
  themes. Keep probes structural and route-aware.
- A fallback selector can overmatch a new Codex layout. Require its semantic
  descendant and root token, then verify in the live diff/composer routes.
- Existing dirty changes can be accidentally staged or overwritten. Inspect
  `git status` before and after edits and stage nothing automatically.

# Retirement

No existing owner, selector family, Taskboard path, or persisted state is
retired in this plan. Future retirement of a compatibility rule requires a
current Codex baseline, focused contract changes, live acceptance, and a
separate review of whether the registry item still represents a supported
surface.

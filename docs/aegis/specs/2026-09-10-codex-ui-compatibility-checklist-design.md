# Codex UI Compatibility Checklist Design

Date: `2026-09-10`

Status: `draft for user review`

## 1. Purpose

Codex updates can change DOM class names, layout wrappers, or injection timing.
The existing theme then fails silently: an element may still be visible while
its intended style is missing, or a page may not contain the element needed by
one of the theme rules. This feature provides a runtime checklist that makes
those failures visible and gives the user a bounded repair action.

The feature is a diagnostic and repair surface inside the existing Codex Plus
Pro settings popover. It does not patch the official Codex installation and it
does not become a second theme owner.

## 2. Baseline and Authority

- `source/injector.mjs` owns the injected settings UI, runtime theme state,
  CSS style element, and Codex version information.
- `source/theme.css` is the canonical owner of theme rules, existing selector
  compatibility rules, and the new scoped fallback rules.
- `tests/theme-compatibility-contract.test.mjs` is the existing contract-test
  entry point for post-update CSS compatibility behavior.
- `tests/taskboard-embed-contract.test.mjs` covers the existing injector and
  embedded-host contracts that must remain unchanged.
- `SETTINGS_UI_VERSION` is the existing settings rebuild/version boundary.

The current working tree contains unrelated but intentional taskboard and
theme compatibility changes. This feature must preserve them.

## 3. Scope

### In scope

1. Add an in-memory compatibility registry in `source/injector.mjs`.
2. Group checklist items into `全局`, `对话界面`, `编程界面`, and `设置界面`.
3. Detect native semantic anchors and, where required, verify a small set of
   computed-style probes or injected markers.
4. Show item state, purpose, matched anchor, version risk, and repair action.
5. Reapply the current theme and known scoped fallback rules from the settings
   UI.
6. Add contract tests for the registry, four groups, status semantics, repair
   controls, and CSS fallback markers.
7. Perform live acceptance against the current Codex runtime for the settings,
   conversation, programming, and global surfaces.

### Explicit non-goals

- No arbitrary user-entered CSS or selector editor.
- No remote rule download, telemetry, or network dependency.
- No modification of Microsoft Store files or managed Codex version files.
- No persistent per-item repair state. Runtime repairs are recalculated after
  every injector/settings rebuild.
- No continuous automatic repair loop on every DOM mutation.
- No change to Taskboard ownership, runtime lifecycle, API, or database schema.
- No claim that an element is broken merely because it is absent from the
  current route.

## 4. Architecture

The feature reuses the existing injector/settings owner:

```text
Codex DOM
   |
   v
injector.mjs compatibility registry and probes
   |                 |
   |                 +--> existing theme style element
   v
settings popover             theme.css scoped fallback rules
```

The registry is source-controlled and versioned with the injector. It is not a
second JSON configuration file because selectors, probe semantics, and repair
actions are executable behavior and must be reviewed with the owning code.

Each registry item has this logical contract:

```js
{
  id: "conversation.composer",
  category: "conversation",
  label: "对话输入区",
  description: "输入框、发送按钮和输入区工具栏的主题外壳",
  anchors: [
    { name: "utility-bar", selector: '[data-composer-utility-bar-scroll-area]' },
    { name: "composer", selector: '.composer-surface-chrome' },
  ],
  styleProbe: "composer-surface",
  risk: "high",
  fallbackToken: "composer-v2",
  repair: "reapply-and-enable-fallback",
}
```

The implementation may use functions instead of string names for probes, but
the externally visible concepts remain the same: stable id, category, anchor
set, risk, state, and bounded repair operation.

## 5. Initial Checklist Catalogue

The first release contains the following items. An item is marked `未观察到`
when its route-specific anchor is not present; that state is informational and
does not count as a failure.

### 5.1 全局

| ID | Element | Primary anchors | Repair intent |
| --- | --- | --- | --- |
| `global.shell` | 主壳与主内容区 | `.main-surface`, `[class*="MainContentSurface"]` | Reapply shell theme and shell fallback |
| `global.header` | 顶部栏 | `.app-header-tint`, `[class*="spacing-token-safe-header-left"]` | Reapply header rules |
| `global.sidebar` | 左侧导航 | `.app-shell-left-panel`, `nav.sidebar-foreground-muted` | Reapply sidebar rules and sidebar fallback |
| `global.status-surfaces` | 用量、配额、提示条 | `[role="alert"]`, `[class*="usage-banner"]`, `[class*="quota"]` | Reapply status-surface rules |
| `global.scrollbars` | 页面滚动条 | visible global content anchor plus stylesheet marker | Reapply global scrollbar rules |

### 5.2 对话界面

| ID | Element | Primary anchors | Repair intent |
| --- | --- | --- | --- |
| `conversation.home-suggestions` | 首页建议区 | `[class~="group/home-suggestions"]`, `[class*="home-suggestion-list-item"]` | Reapply suggestion-card rules |
| `conversation.composer` | 对话输入区 | `[data-composer-utility-bar-scroll-area]`, `[contenteditable="true"]`, `[role="textbox"]` | Reapply composer rules and enable composer fallback |
| `conversation.utility-bar` | 项目、分支和本地工具栏 | `[data-composer-utility-bar-scroll-area]`, `[data-project-selector-icon]` | Reapply utility-bar rules |
| `conversation.thread-actions` | 对话操作区 | `.thread-scroll-container`, buttons with `aria-label` `Send`, `Submit`, or `Stop` | Reapply action-button rules |

### 5.3 编程界面

| ID | Element | Primary anchors | Repair intent |
| --- | --- | --- | --- |
| `programming.editor` | 编辑器表面 | `[data-pierre-editor-surface]`, `[class*="code-editor"]` | Reapply editor surface rules |
| `programming.diff-preview` | Diff 预览容器 | `[class*="group/file-diff"]`, `[class*="group/turn-diff-header"]` | Reapply diff rules and enable diff fallback |
| `programming.diff-file-row` | Diff 文件行 | `[class*="group/turn-diff-file-row"]`, `[class*="text-codex-git-added"]`, `[class*="text-codex-git-deleted"]` | Reapply file-row rules |
| `programming.run-status` | 编程运行状态区 | `[class*="turn-diff"]`, `[role="status"]` within the thread surface | Reapply status and code-output rules |

### 5.4 设置界面

| ID | Element | Primary anchors | Repair intent |
| --- | --- | --- | --- |
| `settings.entry` | Plus Pro 设置入口 | `.codex-plus-pro-settings-button`, `[data-codex-plus-pro-settings-host="on"]` | Rebuild settings popover entry |
| `settings.navigation` | 设置分区导航 | `.codex-plus-pro-settings-navigation`, `[data-settings-section-target]` | Reapply settings navigation rules |
| `settings.content` | 设置内容面板 | `.codex-plus-pro-settings-content`, `[data-settings-section]` | Reapply settings content rules |
| `settings.taskboard-service` | Taskboard 服务控制区 | `.codex-plus-pro-taskboard-service-control`, `[data-taskboard-service-control="true"]` | Reapply service-control rules |
| `settings.version` | 版本信息区 | `[data-version-check-control="true"]`, `.codex-plus-pro-managed-versions` | Reapply version-control rules |

Anchors are ordered from semantic attributes to known class fragments. A class
fragment is a compatibility hint, not a permanent Codex API. New fallback
selectors must be scoped to the affected item and must not broaden a rule to
all full-height, flex, or rounded elements.

## 6. Detection and State Model

Detection runs when the compatibility panel opens, when the user presses
`全部检测`, and after any repair. It is also run once after the injector
runtime finishes applying its initial theme.

Each item is evaluated in this order:

1. Check whether the current route has at least one matching anchor.
2. If no anchor is visible, report `not-observed` / `未观察到`.
3. If an anchor exists, run the item’s optional style probe and injected-marker
   check.
4. Report `healthy` / `正常` when the required checks pass.
5. Report `degraded` / `已降级` when the element exists but the expected style
   or marker is absent.
6. Report `unsupported` / `不支持` only when the current Codex version and
   DOM expose none of the supported anchor families.
7. After a known fallback is enabled, report `fallback-active` / `备用规则生效`
   while retaining the matched anchor and repair detail.

The registry must not mark route absence as `degraded`. A probe may use
`getComputedStyle`, but it must validate properties that are stable under the
active light/dark and accent theme rather than one hard-coded color.

## 7. Repair Operations

### 7.1 Reapply current theme

The repair calls the existing theme application path, updates the existing
style element, reapplies feature attributes, and reruns the existing DOM
decoration pass. It does not create a second style owner or duplicate the
settings popover.

### 7.2 Enable known fallback

Known fallbacks are represented by scoped root attributes such as
`data-codex-plus-compat-diff-preview="fallback"`. The corresponding CSS lives
in `source/theme.css` and is inactive until the registry repair enables it.
Fallback activation is allowed only for a registry item with a source-controlled
fallback token.

### 7.3 Repair controls

- `重新检测`: no style mutation; reads current state again.
- `修复此项`: reapply the item’s rules and enable only its known fallback.
- `重新应用主题`: reruns the existing global theme application path.
- `修复所有已知问题`: applies the global theme, enables fallback tokens for
  degraded items with known repairs, then reruns detection.

When no repair is available, the item shows the reason and keeps its control
disabled. The UI must not claim success if detection still fails after repair.

## 8. Settings UI

Add a `compatibility` settings section to the existing `SETTINGS_SECTIONS`
navigation. The section contains:

1. A summary row with Codex version, Plus Pro version, last detection time,
   healthy count, and degraded count.
2. A segmented category selector: `全部`, `全局`, `对话界面`, `编程界面`,
   `设置界面`.
3. The checklist rows described above.
4. Top-level detection and repair actions.

Each row displays the element name, purpose, status, matched anchor, risk
level, and a concise repair explanation. The layout must reuse existing
settings rows, text-value controls, focus styles, responsive stacking, and
light/dark accent rules. Mobile or narrow popovers must stack controls without
clipping their labels.

The compatibility section is diagnostic UI, not a replacement for the
existing theme/model/pet/taskboard/version sections. `恢复默认` continues to
reset theme assets and feature settings; it does not silently discard the
runtime checklist definition.

## 9. Compatibility Boundary

- `source/injector.mjs` remains the single owner of registry evaluation, state,
  repair orchestration, and settings UI.
- `source/theme.css` remains the single owner of visual rules and fallback CSS.
- Official Codex files, Store state, Taskboard API/schema, launcher ownership,
  instance tokens, and process lifecycle are unchanged.
- No fallback may use a broad selector without a semantic descendant or an
  item-specific root token.
- Unknown future selectors produce a visible degraded/unsupported result; the
  system must not silently apply speculative global CSS.
- The existing settings UI version must be incremented so a stale popover is
  rebuilt after injector updates.

## 10. Verification and Acceptance

### Static verification

- `node --check source/injector.mjs`
- `node --test tests/theme-compatibility-contract.test.mjs`
- `node --test tests/compatibility-checklist-contract.test.mjs`
- `node --test tests/taskboard-embed-contract.test.mjs`
- `git diff --check`

The contract tests must prove that all four categories exist, every item has a
stable id and repair contract, status labels are defined, the new settings
section is present, and fallback tokens are represented in both the injector
and CSS.

### Runtime acceptance

Using the current Codex runtime:

1. Open Codex Plus Pro settings and confirm the compatibility section opens.
2. Verify all four category filters and the `未观察到` behavior on a route that
   does not contain programming elements.
3. Verify the global and conversation items on the home and thread routes.
4. Open a code/diff result and verify programming items, especially the
   anonymous `h-full flex-col` diff host and `overflow-clip` descendant path.
5. Verify settings items, including the Taskboard service control and version
   panel.
6. Trigger `重新应用主题`, then confirm the theme and checklist status remain
   coherent.
7. Force a known degraded state in an isolated runtime test or controlled DOM
   fixture, run `修复此项`, and confirm the fallback token and post-repair
   status are visible.
8. Confirm the taskboard sidebar remains present and no taskboard runtime or
   bridge behavior regresses.

## 11. Risks and Rollback

- Selector drift may cause false `未观察到` results. Mitigation: use ordered
  semantic anchors, route-aware absence semantics, and live acceptance.
- Computed-style probes may be too strict across themes. Mitigation: probe
  structural properties or item-specific markers, not one exact color.
- A fallback may overmatch after a future Codex change. Mitigation: scope it
  under a registry token and require a semantic descendant.
- The injector source is large. Mitigation: keep the registry, evaluation
  helpers, and UI rendering in one clearly bounded compatibility block and add
  contract tests before broadening the catalogue.

Rollback is the normal Git revert of the compatibility block, CSS fallback
rules, and their focused tests. Existing theme and Taskboard ownership remain
intact.

## 12. Retirement

No existing theme rule is removed in this feature. A fallback rule may be
retired only after a later Codex baseline proves that its original selector
family is no longer needed and its contract test and runtime acceptance path
have been updated together. The checklist itself remains the compatibility
inventory owner unless a later settings architecture replaces it explicitly.

# Goal

在 Codex Plus Pro Windows 设置面板中增加 Taskboard 服务管理：查看状态、重新检测、确认后重启、复制脱敏诊断信息。服务进程仍由 Codex 启动器和 `taskboard-runtime.psm1` 管理。

# Architecture

- `source/injector.mjs` 是 Taskboard 宿主 bridge 与 PowerShell runtime 的唯一 owner。
- `source/taskboard-embed.js` 通过既有 `__codexTaskboardHostRequestV1` 消息协议把设置操作转给宿主，并把安全状态暴露给设置 UI。
- `source/theme.css` 只负责服务状态卡片、诊断和操作控件的视觉样式。
- `taskboard-runtime.psm1` 继续负责 root、Node.js、端口、launcher ownership、实例 secret/token、健康检查和 `Start-CodexPlusTaskboard -Force`。

# Tech Stack

Windows PowerShell 5.1+、Node.js ESM、Chrome DevTools Protocol、Codex 页面内嵌 JavaScript/CSS、Node `node:test`。

# Baseline/Authority Refs

- `taskboard-runtime.psm1`: `Get-CodexPlusTaskboardStatus`、`Start-CodexPlusTaskboard` 和 ownership 保护。
- `source/injector.mjs`: 既有 Taskboard host bridge、PowerShell 子进程调用模式和设置注入器。
- `source/taskboard-embed.js`: 既有请求/响应、heartbeat、iframe reload contract。
- `tests/taskboard-runtime.test.ps1`、`tests/taskboard-embed-contract.test.mjs`：现有运行时和嵌入协议回归入口。

# Compatibility Boundary

- 保留 `windows/taskbord` 目录与 GitHub remote，不引入 `third_party` 或 `dashi`。
- 不修改 Taskboard Web API、数据库 schema、实例 token 路由或 launcher ownership 语义。
- UI 不显示 `InstanceToken`、`InstanceSecret`、完整 `Process` 对象或带 token 的 `EmbedUrl`。
- 重启只允许固定 action，宿主不接受用户提供的 root/path/token 参数，也不直接 `Stop-Process`。
- 未连接宿主时设置面板显示“宿主未连接”，不伪造服务状态。

# TDD Route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: post-change regression plus source contract assertions
- Reason: 用户未要求严格 TDD；现有项目已有 PowerShell runtime 和 Node contract tests，采用最小变更后的回归验证。
- Verification: `node --test tests/taskboard-embed-contract.test.mjs`、`node --check source/injector.mjs`、PowerShell runtime test。

# Verification

1. Node syntax and source contract tests pass.
2. PowerShell runtime regression passes, including force restart and ownership protection.
3. `git diff --check` passes in `windows/taskbord` and the parent launcher tree is inspected without reverting unrelated dirty changes.
4. Manual acceptance remains required for opening Settings > Taskboard, status refresh, confirmation dialog, restart result, and copy diagnostics.

# File Map

- Modify `source/injector.mjs` for the service host action and redacted runtime invocation.
- Modify `source/taskboard-embed.js` for the settings-to-host service API and iframe reload event.
- Modify `source/theme.css` for the service management panel.
- Modify `tests/taskboard-embed-contract.test.mjs` for protocol and redaction contract assertions.

# Tasks

1. Add a fixed `service` action to the existing Taskboard host bridge, call PowerShell runtime status/start-force, normalize and redact fields, and return a reload signal after restart.
2. Add a Taskboard settings section with status badge, reason, port/PID/root/URL-safe diagnostic values, refresh, confirmed restart, and copy diagnostics controls. Route requests through the existing embed API and reload the iframe after a successful restart.
3. Add contract assertions for the fixed action, runtime path/state root usage, secret/token redaction, and UI controls.
4. Run focused and regression tests, inspect the resulting diff, and report remaining manual UI coverage.

# Risks

- PowerShell restart can take up to the runtime startup deadline; the host request timeout must cover that bounded operation.
- A stale host bridge must fail visibly; no automatic retry loop or repeated restart is added.
- The existing working tree is dirty in `windows/taskbord`; unrelated changes remain untouched.

# Retirement

No old owner is deleted. The existing `ensure` action remains for iframe startup. The new `service` action is the single settings-service control path; any future duplicate direct process-control path should be retired in favor of it.

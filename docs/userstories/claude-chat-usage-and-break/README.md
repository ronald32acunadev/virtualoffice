# Claude-Style Chat UI, Agent Usage, Break Time, and Employee Job Titles — User Stories

Builds on: [Multi-Agent Bosses](../multi-agent-bosses/README.md).
Branch: `feature/claude-chat-usage-and-break`, created from `feature/multi-agent-bosses` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-20).
Implementer route: `pumbastudio` (LM Studio active loaded model `zai-org/glm-4.7-flash` via `ask_local_llm.py`); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Employee job title (`jobTitle`) across domain, persistence, workspace, and 3D office | — | complete |
| US-02 | Provider and employee usage tracking (quotas, tokens, and live updates) | — | pending |
| US-03 | Provider-wide break time ("on break") on rate limit / quota exhaustion | US-02 | pending |
| US-04 | Claude-style workspace chat UI (sidebar, markdown rendering, and composer) | US-01, US-02, US-03 | pending |
| US-05 | 3D office break-time visuals for bosses and employees | US-01, US-03 | pending |

## Confirmed facts & scope boundaries

- **Confirmed facts**:
  - `@anthropic-ai/claude-agent-sdk` (`0.3.328`) exposes `SDKRateLimitEvent` (`utilization`, `resetsAt`, `status`, `rateLimitType`), structured `/usage` data (plan rate-limit windows + session totals), and `SDKResultSuccess` token/context metrics.
  - Codex (`codex exec --json`), OpenCode (`opencode run --format json`), Antigravity (`agy --output-format stream-json`), and Gemini (`gemini --output-format stream-json`) run over CLI JSONL streams: they can report session token usage when emitted and surface rate-limit / quota-exhausted errors, though they do not all expose an exact remaining account-quota percentage.
  - `Employee.role` already exists for Claude specialist agents (`agent` SDK option). Job title (`jobTitle`) is a separate, provider-agnostic human-facing position (e.g., `"Frontend Engineer"`, `"Architect"`, `"QA Lead"`, or custom) available for every employee.
  - Break time applies to the **entire provider/boss and all of its employees** when that provider reaches its usage limit or returns a rate-limit/quota error.
- **Exclusions**:
  - No synthetic/fabricated quota percentages for CLI providers that do not report account quota; display observed token usage and availability/break state instead.
  - No voice input/microphone recording (the Claude screenshot's mic icon is not implemented).
  - No external billing API polling outside the active SDK/CLI streams.

Verification levels: Vitest unit and HTTP/WS integration tests in `apps/server` and `apps/web` (with deterministic fakes for SDK rate-limit events, CLI quota errors, and timers), `npm run typecheck`, `npm run build`, and browser verification of `/workspace` and `/office`.

---

## US-01 — Employee job title (`jobTitle`) across domain, persistence, workspace, and 3D office

As the owner, I want to assign and edit a job title (cargo) for every employee regardless of provider, so that I can organize my virtual team by position alongside their name and optional specialist role.

- `US-01 / AC-01`: Given the SQLite schema and `Employee` domain model, when the server starts on an existing or fresh database, then `employees` includes a nullable `job_title` column (migrated safely without data loss) and `Employee` exposes `jobTitle: string | null`.
- `US-01 / AC-02`: Given `POST /api/employees` and `PATCH /api/employees/:id`, when a valid `jobTitle` (trimmed, up to 60 characters; empty string clears to `null`) is provided, then it is persisted, broadcast over WebSocket, and returned by `GET /api/state` and `GET /api/employees/:id`; values exceeding 60 characters reject with `400` and leave stored state unchanged.
- `US-01 / AC-03`: Given the "New task" modal and conversation header in `/workspace`, when hiring or editing an employee for any boss (`claude`, `codex`, `opencode`, `gemini`), then the owner can pick from common job-title presets or type a custom job title, and the saved `jobTitle` is displayed in the sidebar row, conversation header, and 3D office employee label/card.
- `US-01 / AC-04`: Given an employee also has a Claude specialist `role`, then `jobTitle` and `role` coexist independently without overwriting each other.

---

## US-02 — Provider and employee usage tracking (quotas, tokens, and live updates)

As the owner, I want to see the remaining available usage for each agent/provider and session token usage for each employee, so that I know how much capacity is left before hitting a limit.

- `US-02 / AC-01`: Given `AgentSink` and `OfficeService`, when an adapter reports provider rate-limit/quota telemetry (`utilization` 0–100, `remainingPercent`, `resetsAt`, `windowLabel`) or turn token usage (`inputTokens`, `outputTokens`, `contextUsed`, `contextWindow`), then `OfficeService` stores the latest provider usage on `Boss.usage` and session usage on `Employee.usage`, exposes both in `GET /api/state`, and broadcasts live updates over WebSocket.
- `US-02 / AC-02`: Given `ClaudeAgentAdapter` receives `SDKRateLimitEvent` or `SDKResultSuccess` usage fields from the SDK stream, then it maps plan utilization (`remainingPercent = clamp(100 - utilization, 0, 100)`), `resetsAt`, and session token/context counts into the sink without breaking existing message streaming or approvals.
- `US-02 / AC-03`: Given `CodexAgentAdapter`, `OpenCodeAgentAdapter`, `AntigravityAgentAdapter`, and `GeminiAgentAdapter` receive JSONL events containing token usage fields, then they forward turn token totals to the sink; when a provider does not expose account quota percentages, `remainingPercent` remains `null` and the UI displays observed token totals plus availability status rather than a fabricated percentage.
- `US-02 / AC-04`: Given `/workspace`, when viewing the sidebar and the active employee's composer bar, then the owner sees a per-provider usage summary (remaining quota % + reset time when available, or token count + status) and a compact circular usage ring in the composer bar for the active employee's provider/context.

---

## US-03 — Provider-wide break time ("on break") on rate limit / quota exhaustion

As the owner, I want a provider and all of its employees to automatically go on break ("hora de descanso") when its usage limit is reached or chat is rejected for quota/rate-limit reasons, so that I clearly see who is resting and cannot accidentally send doomed prompts until capacity returns.

- `US-03 / AC-01`: Given a provider emits a rate-limit exhaustion signal (Claude `rate_limit_event` with `status: "rejected"` or `utilization >= 100`, `SDKAssistantMessageError` `'rate_limit'`, or CLI error output matching rate-limit / quota exhaustion such as HTTP 429 / "rate limit" / "quota exceeded" / "usage limit"), when handled by `OfficeService`, then that `Boss` enters `onBreak: true` with `breakReason` and `breakUntil` (from `resetsAt` when available, otherwise `null`), and all non-stopped employees under that `Boss` transition to `status: "on_break"` (broadcasting live updates).
- `US-03 / AC-02`: Given a `Boss` is `onBreak: true`, when the owner attempts to send a message to any employee of that provider (`POST /api/employees/:id/messages`) or hire a new employee under that provider (`POST /api/employees`), then the server rejects with `409 provider_on_break` (including `breakUntil` and `breakReason`) and creates no message or employee; employees under other unaffected providers continue working normally.
- `US-03 / AC-03`: Given a `Boss` is `onBreak: true` with a known `breakUntil` timestamp, when `breakUntil` elapses, then the server automatically clears `onBreak` and restores resting employees of that provider to `idle` (broadcasting live state); regardless of `breakUntil`, calling `POST /api/bosses/:id/resume` (triggered by a "Resume / Retry" button in the UI) manually ends the break and restores those employees to `idle`.
- `US-03 / AC-04`: Given a provider is on break, when viewing `/workspace`, then the sidebar marks the provider and its employees as on break, the chat composer disables sending with a clear break banner (showing the reason, reset time/countdown when known, and a "Resume now" button), and the conversation history remains readable.

---

## US-04 — Claude-style workspace chat UI (sidebar, markdown rendering, and composer)

As the owner, I want a refined, Claude-inspired chat and workspace interface, so that managing multiple conversations, reading structured responses, and writing prompts feels clean, fast, and focused.

- `US-04 / AC-01`: Given `/workspace`, when rendering the sidebar, then it adopts a minimal dark Claude-style layout with a top `+ New` action, a live search input that filters conversations by employee name, job title, task, or working directory, a grouping toggle (group by **Project folder** or by **Boss/Provider**), collapsible groups, status dots, and a bottom usage/status footer.
- `US-04 / AC-02`: Given an open conversation, when rendering messages, then the timeline sits in a centered readable column (`max-width`) with right-aligned subtle dark-gray user message bubbles and full-width clean assistant responses featuring styled GFM tables, inline code pills, and fenced code blocks with language label and a working one-click Copy button.
- `US-04 / AC-03`: Given the message composer, when typing or interacting with it, then it renders as a rounded Claude-style input card with an auto-growing textarea (`Type / for commands` placeholder), an integrated `+` / Toolbox trigger, a bottom utility bar (provider/boss badge, active usage ring, Send/Stop action), and preserves existing `/` slash-command autocomplete, `Enter` to send, `Shift+Enter` newline, and approval cards.
- `US-04 / AC-04`: Given existing workspace keyboard shortcuts, slash menu navigation, approval workflows, and missing-folder guards, then all existing unit tests and behaviors continue to pass with no regressions.

---

## US-05 — 3D office break-time visuals for bosses and employees

As the owner, I want bosses and employees who are on break to visibly rest in the 3D office, so that the 3D scene reflects real-time availability at a glance.

- `US-05 / AC-01`: Given `EmployeeStatus` includes `"on_break"`, when rendering `Character` and `characterVisuals` in `/office`, then `"on_break"` has a dedicated resting pose (relaxed lean-back, slow breathing, non-typing arms), distinct warm break color, and a floating break marker (`☕`) instead of working or failed indicators.
- `US-05 / AC-02`: Given a `Boss` has `onBreak: true`, when rendering `BossArea` in `/office`, then the boss suite label displays an `"On break"` badge (and reset time if available) with dimmed/resting styling while remaining distinguishable from `"Not installed"`.
- `US-05 / AC-03`: Given `officeQuotes` chatter is enabled and an employee or boss is on break, then break-themed speech quotes are eligible for resting characters, and clicking a resting employee in `/office` shows their `jobTitle`, `"on break"` status, and break reason in the employee card.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-04` | `apps/server/test/persistence/migration.test.ts`, `apps/server/test/office/job-title.test.ts` (7 tests), `apps/web/src/state/jobTitle.test.ts` (4 tests) | Passed (`apps/server`: 177/177, `apps/web`: 72/72, `npm run typecheck`: 0 errors). |
| `US-02 / AC-01`–`AC-04` | `apps/server/test/office/usage.test.ts` (provider + employee usage updates, WS broadcast), adapter tests (`claude`, `codex`, `opencode`, `antigravity`, `gemini`) for usage parsing, `apps/web/src/state/usage.test.ts` | Pending |
| `US-03 / AC-01`–`AC-04` | `apps/server/test/office/break-time.test.ts` (rate-limit detection, provider-wide `on_break`, `409 provider_on_break` guard, timer auto-resume & `POST /api/bosses/:id/resume`), `apps/server/test/http/api.test.ts` | Pending |
| `US-04 / AC-01`–`AC-04` | `apps/web/src/state/sidebar.test.ts` (search filter + project/boss grouping), `apps/web/src/state/slashMenu.test.ts` (regression), browser verification in `/workspace` (layout, tables, code copy, composer, `/` menu, break banner) | Pending |
| `US-05 / AC-01`–`AC-03` | `apps/web/src/scene/characterVisuals.test.ts` (`on_break` pose/color), `apps/web/src/scene/officeQuotes.test.ts` (break quotes), browser verification in `/office` | Pending |
| Shared-code regression risk (existing employee statuses, approvals, slash menu, adapters) | `npm run test -w apps/server`, `npm run test -w apps/web`, `npm run typecheck`, `npm run build` | Pending |

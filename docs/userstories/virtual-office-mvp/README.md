# Virtual Office MVP — User Stories

Design: [2026-11-19-virtual-office-mvp-design.md](../../superpowers/specs/2026-11-19-virtual-office-mvp-design.md) (approved by the owner on 2026-11-19).

Branch: `feature/virtual-office-mvp` (created after backlog approval).
Execution mode: pending owner choice (all stories or one at a time).
Scope: Claude Code adapter only. Codex, OpenCode, Gemini CLI, and the orchestrating boss are out of scope.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Open the office securely | — | pending |
| US-02 | Hire a Claude employee | US-01 | pending |
| US-03 | Chat with an employee | US-02 | pending |
| US-04 | Approve or reject permission requests | US-03 | pending |
| US-05 | Answer agent questions and plans | US-04 | pending |
| US-06 | Stop an employee | US-03 | pending |
| US-07 | Keep history and resume employees | US-04, US-06 | pending |

Verification levels: Vitest for domain, use cases, API, and the Claude adapter behind its port with a fake SDK; a reproducible manual check with the real `claude` CLI for each story that touches the agent.

---

## US-01 — Open the office securely

As the owner, I want to start the office with one command and open it in my browser, so that I have a single place to manage my agents that other web pages cannot control.

Scope: server and web client start; empty 3D office; Claude boss area active; Codex, OpenCode, and Gemini boss areas shown as "coming soon". Server binds to `127.0.0.1`.

- `US-01 / AC-01`: Given the project is installed, when the owner runs the start command, then the terminal prints a local URL that contains a random per-launch token, and opening it shows the 3D office with four boss areas, only Claude enabled.
- `US-01 / AC-02`: Given the server is running, when an HTTP or WebSocket request arrives without the token or with a wrong token, then it is rejected with 401 (HTTP) or the socket is closed, and no state changes.
- `US-01 / AC-03`: Given the server is running, when a request arrives with an `Origin` or `Host` that is not the office's local address, then it is rejected with 403, even with a valid token.
- `US-01 / AC-04`: Given the server restarts, when the old URL is used, then the old token is rejected (a new token is generated per launch).

## US-02 — Hire a Claude employee

As the owner, I want to give the Claude boss a task and a project folder, so that a new employee starts working on it and appears in the office.

Business rules: one employee = one Claude Agent SDK session; the session loads user, project, and local settings and the Claude Code system prompt preset; `hiredBy` is null.

- `US-02 / AC-01`: Given the office is open, when the owner submits the new-task form with a task text and an existing folder, then a new employee is persisted, a character appears in the Claude area with status `starting` then `working`, and the agent runs with that folder as its working directory.
- `US-02 / AC-02`: Given the form, when the task text is empty or the folder does not exist or is not a directory, then the server rejects the request with a validation error shown in the form, and no employee is created.
- `US-02 / AC-03`: Given an employee is running, when the agent finishes its task, then the employee status becomes `idle` and the character shows the idle state.
- `US-02 / AC-04`: Given the `claude` CLI cannot start (for example not logged in), when an employee is hired, then the employee becomes `failed` with the error reason visible in the office.

## US-03 — Chat with an employee

As the owner, I want to open an employee and see its conversation live and write to it, so that I can follow and steer its work without opening a terminal.

- `US-03 / AC-01`: Given a working employee, when the owner selects its character, then a side panel shows its stored conversation followed by new agent text streaming live.
- `US-03 / AC-02`: Given the panel is open, when the agent calls a tool, then the panel shows the tool call and its result as distinct entries (subagent activity is grouped under its parent tool call).
- `US-03 / AC-03`: Given a `working` or `idle` employee with a live session, when the owner sends a message, then it is stored as `user_text`, delivered to the same session, and the agent's reply appears in the panel.
- `US-03 / AC-04`: Given any conversation, when entries complete, then each is persisted with its kind (`user_text`, `agent_text`, `tool_call`, `tool_result`, `system`); partial streaming tokens are not persisted.
- `US-03 / AC-05`: Given the browser disconnects and reconnects, when the panel reloads, then it shows the full stored conversation with no duplicated entries.

## US-04 — Approve or reject permission requests

As the owner, I want every permission request from an agent to appear in one inbox and on the character, so that I approve or reject it from the office instead of switching windows.

Business rules: only requests the agent's own settings would ask about reach the inbox; a request is never auto-approved; an undeliverable or expired request is answered as a rejection.

- `US-04 / AC-01`: Given a working employee, when the agent requests a tool that needs permission, then a pending request is persisted, it appears in the approvals inbox with the tool and a readable summary (command text for shell commands, file path for edits), the employee status becomes `waiting_approval`, and the character shows a "!" marker.
- `US-04 / AC-02`: Given a pending request, when the owner approves it, then the agent receives allow with the original input, the tool runs, the request is stored as `approved`, and the employee returns to `working`.
- `US-04 / AC-03`: Given a pending request, when the owner rejects it, then the agent receives deny with the message "Rejected by the owner", the tool does not run, and the request is stored as `rejected`.
- `US-04 / AC-04`: Given a request that is already approved, rejected, or expired, when a second decision is sent for it, then the server rejects it with a conflict error and nothing is delivered to the agent.
- `US-04 / AC-05`: Given a pending request, when the employee is stopped or the SDK aborts the call, then the request becomes `expired` and the agent receives deny, never allow.
- `US-04 / AC-06`: Given the owner's Claude settings allow a tool without asking, when the agent uses it, then no inbox request is created.
- `US-04 / AC-07`: Given the provider offers "approve for session" for a request, when the owner chooses it, then the decision is stored as `approve_for_session` and passed to the provider. (Claude: the request's permission suggestions are applied.)

## US-05 — Answer agent questions and plans

As the owner, I want questions and plans from an agent to reach the same inbox, so that the agent is not blocked or silently denied when it needs my input.

- `US-05 / AC-01`: Given a working employee, when the agent asks a question with options (`AskUserQuestion`), then the inbox shows a request of kind `question` with the question and its options.
- `US-05 / AC-02`: Given a pending question, when the owner picks an option, then the answer is returned to the agent as the tool's answer and stored on the request.
- `US-05 / AC-03`: Given a working employee, when the agent presents a plan (`ExitPlanMode`), then the inbox shows a request of kind `plan` with the plan text, and approving or rejecting it behaves as in `US-04 / AC-02` and `AC-03`.

## US-06 — Stop an employee

As the owner, I want to stop an employee, so that I can halt work that is going the wrong way.

- `US-06 / AC-01`: Given a `working` or `waiting_approval` employee, when the owner presses stop, then the agent session is interrupted, the employee becomes `stopped`, and its pending requests become `expired` (see `US-04 / AC-05`).
- `US-06 / AC-02`: Given an `idle`, `stopped`, or `failed` employee, when stop is requested, then nothing changes and no error is raised.

## US-07 — Keep history and resume employees

As the owner, I want employees and their conversations to survive restarts and to continue any employee later, so that I never lose context or go back to the terminal to resume work.

- `US-07 / AC-01`: Given employees with conversations and decided requests, when the server restarts and the office is reopened, then all employees, conversations, and request decisions are shown as before.
- `US-07 / AC-02`: Given employees that were `working` or `waiting_approval` when the server stopped, when it starts again, then they are `stopped` and their pending requests are `expired`.
- `US-07 / AC-03`: Given an `idle` or `stopped` employee with no live session and a stored provider session id, when the owner sends a message, then the session is reopened with the SDK `resume` option, the employee becomes `working`, and the agent answers with knowledge of the earlier conversation.
- `US-07 / AC-04`: Given resume fails (for example the provider session no longer exists), when the owner sends a message, then the employee becomes `failed` with the reason shown, and its stored conversation stays readable.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | Manual: run start command, open printed URL, check four boss areas | Pending |
| `US-01 / AC-02`–`AC-04` | `apps/server` API tests: missing/wrong token, foreign Origin/Host, token per launch | Pending |
| `US-02 / AC-01`–`AC-04` | Use-case and API tests with fake SDK; manual hire with real `claude` CLI | Pending |
| `US-03 / AC-01`–`AC-05` | Adapter tests mapping SDK messages to entry kinds; repository tests; manual chat with real CLI | Pending |
| `US-04 / AC-01`–`AC-07` | Approval use-case tests with fake `canUseTool` (allow, deny, conflict, expiry on abort/stop, approve for session); manual approval of a shell command with real CLI | Pending |
| `US-05 / AC-01`–`AC-03` | Adapter tests for `AskUserQuestion` and `ExitPlanMode` inputs and returned answers; manual check with real CLI | Pending |
| `US-06 / AC-01`–`AC-02` | Use-case tests for stop in each status | Pending |
| `US-07 / AC-01`–`AC-04` | Startup recovery tests on a temporary SQLite file; resume tests with fake SDK; manual resume after real restart | Pending |
| Risk: approvals answered as allow by mistake | Tests asserting every expiry/error path returns deny | Pending |

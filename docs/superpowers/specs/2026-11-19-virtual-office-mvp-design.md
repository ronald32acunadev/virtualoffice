# Virtual Office MVP — Design

Date: 2026-11-19
Status: Draft, pending owner approval

## Intent and why

The owner runs several AI coding agents (Claude Code, Codex, OpenCode, Gemini CLI) at the same time and loses time switching between terminal windows to follow them and to answer their permission prompts. The Virtual Office is a local web app that puts every agent in one place, shown as a 3D office that looks like a video game: agents are people working at desks. From the office the owner launches agents, talks to them, approves or rejects what they ask for, and reviews stored chat history.

The long-term vision has two layers:

1. **The office (this MVP's foundation):** bosses, employees as real agent sessions, chat, approvals, 3D view, history.
2. **The orchestrating boss (later, separate design):** a boss receives a request, splits it, and hires employees for each part, like the planning/delegation flows in Antigravity, Claude, or ChatGPT.

This document covers only layer 1, and only its MVP slice.

## Office metaphor

- **Boss = agent provider.** There is one boss per provider (Claude, Codex, OpenCode, Gemini), each with its own area of the office.
- **Employee = one task.** When the owner gives a boss a task, a new employee appears in that boss's area. Each employee is one real agent session with a working directory (project folder), a chat, and a status.
- **Status is visible on the character:** typing while working, a raised hand / "!" marker while waiting for approval, idle when done.
- Subagents launched inside a session (for example Claude subagents) are shown as activity inside that employee, not as new people. (Owner's call to defer; proposed by the planner.)

## Goals (MVP)

- Launch a Claude Code employee from the office: pick a boss, write a task, choose a project folder.
- See every employee in a 3D office with its live status.
- Open an employee and chat with it: see its messages streaming and send follow-up messages.
- Receive the agent's permission requests (run a command, edit a file, etc.) in an approvals inbox and on the character; approve or reject each one from the office.
- Persist every employee, message, and approval decision so history survives server restarts.
- Resume any employee (finished, stopped, or interrupted by a restart) and keep chatting with its full previous context.

## Non-goals (MVP)

- Codex, OpenCode, and Gemini adapters (next increments, same port).
- The orchestrating boss that splits work and hires employees (layer 2).
- Multi-user access, login, remote access, or cloud deployment. It runs locally for one user.
- Observing agent sessions launched outside the office.
- Google Antigravity (IDE) integration: no public control API was found. Gemini CLI is Google's supported route.
- Rich 3D art: simple low-poly or primitive characters are enough.

## Anti-goals (it fails even if it technically works)

- Approvals that are unreliable: a request must never be auto-approved, lost, or answered twice. If the office cannot deliver a request, the agent must be told "no", never "yes".
- Screen-scraping terminal output to detect prompts. Every integration uses the provider's official programmatic API.
- A 3D view so heavy that chatting and approving become slower than switching windows. The chat and approvals inbox must stay usable without interacting with the 3D scene.

## Constraints

- Node.js (installed: v24). Web app.
- Local only, single user, bind to `127.0.0.1`. Because other pages in the owner's browser could reach a localhost API, the server checks `Origin` and `Host` on every HTTP and WebSocket request and requires a random per-launch token, printed in the launch URL (planner's call).
- Uses the agent CLIs and credentials already installed and logged in on the machine; the office never stores API keys.
- Project rules: English for code, docs, and commits; Conventional Commits; backlog approval before implementation; local-first code delegation. These rules live outside this repository, in `/run/media/pumba/Proyects/Personal/projectsetup/AGENTS.md`; the user-story backlog will be written to `docs/userstories/virtual-office-mvp/README.md` after this design is approved.

## Verified integration routes

Checked against current official documentation (Context7, 2026-11-19):

| Provider | Route | Approve/reject | Send follow-up messages |
| --- | --- | --- | --- |
| Claude Code | `@anthropic-ai/claude-agent-sdk` `query()` | `canUseTool(toolName, input, { signal, suggestions })` returns `{ behavior: "allow", updatedInput }` or `{ behavior: "deny", message }` | Streaming input: `prompt` as an `AsyncGenerator<SDKUserMessage>` |
| Codex | `codex app-server` (JSON-RPC over stdio) | Server requests `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`; client answers `accept` / `acceptForSession` / `decline` / `cancel` | `turn/start` |
| OpenCode | `opencode serve` (HTTP + SSE) | Permission events; reply via session permission endpoint | Session message endpoint |
| Gemini CLI | `gemini --acp` (Agent Client Protocol, JSON-RPC over stdio) | `session/request_permission` | ACP prompt requests |

Only the Claude row is in the MVP. The others validate that one adapter port can fit all four.

## Approaches considered

| Approach | Trade-off | Decision |
| --- | --- | --- |
| **A. Node backend with one adapter per provider** using each official SDK/protocol, normalized into a common event model | Reliable, real approvals; one adapter to write per provider. Antigravity IDE stays out. | **Chosen by the owner.** |
| B. Wrap each CLI in a pseudo-terminal (`node-pty`) and render terminals | Works with any CLI, but detecting approval prompts means parsing screen output, which breaks on every CLI update. | Rejected: fails the reliable-approvals goal. |
| C. Observe only agents the owner launches elsewhere (hooks/log watching) | Least work, but cannot launch or talk to agents from the office. | Rejected: owner wants to launch and chat from the office. |

The owner also chose to split the work: build the office first, then design the orchestrating boss separately.

## Design

### Architecture (planner's call)

Hexagonal architecture with screaming folders, in one repository with two packages:

```
apps/
  server/   Node backend: domain, application use cases, adapters
  web/      Browser client: 3D office, chat panel, approvals inbox
```

Server layers:

- **Domain:** `Boss` (provider id, display name), `Employee` (id, bossId, hiredBy: null in MVP, task, workingDirectory, providerSessionId, status `starting | working | waiting_approval | idle | stopped | failed`, timestamps), `Message` (employeeId, kind `user_text | agent_text | tool_call | tool_result | system`, content, optional parent tool id for subagent activity, timestamp; completed entries only, partial streaming tokens go live over WebSocket but are not stored — planner's call), `ApprovalRequest` (id, employeeId, kind `permission | question | plan`, tool, input summary, status pending/approved/rejected/expired, decision, answer, decidedAt).
- **Port `AgentAdapter`:** `start(employee, task)`, `sendMessage(employeeId, text)`, `stop(employeeId)`, `respondToApproval(requestId, decision)`, and an event stream emitting normalized events: `message`, `status_changed`, `approval_requested`, `finished`, `failed`.
- **Port `OfficeRepository`:** persistence for employees, messages, approvals.
- **Adapters:** `ClaudeAgentAdapter` (Agent SDK), SQLite repository, HTTP + WebSocket API.

The `hiredBy` field exists now so layer 2 can link an employee to the boss session that hired it, without a schema change.

### Resumable employees (owner's decision)

An employee is never read-only history: after it finishes a task, is stopped, or the server restarts, the owner can send it a new message and it continues with its full previous context.

- The adapter stores the provider session id (Claude: `session_id` from the init system message) on the `Employee` as `providerSessionId`.
- After a task result the employee becomes `idle`; a new owner message starts a new turn in the same session.
- On server start, employees that were `working` or `waiting_approval` become `stopped` (their pending approvals become `expired`). Sending a message to a `stopped` or `idle` employee with no live process reopens it with the SDK `resume: providerSessionId` option.
- If resume fails (for example the session files were deleted), the employee becomes `failed` with the reason shown; its stored history stays readable.

### Approval flow (Claude)

1. The SDK calls `canUseTool`. The adapter creates a pending `ApprovalRequest`, persists it, emits `approval_requested`, and awaits the owner's decision.
2. The client shows it in the inbox and on the character.
3. The owner approves or rejects; the server resolves the pending promise with `allow` (original input) or `deny` (with a message such as "Rejected by the owner").
4. If the session is stopped, the SDK aborts (`signal`), or the server shuts down while a request is pending, the request is marked `expired` and the agent receives `deny`. Never `allow`.
5. A decision on an already-decided or expired request is rejected by the server and does not reach the agent.

Permission mode: the office runs Claude in its default permission mode so the agent's normal rules decide which tools need approval; auto-approved tools do not reach the inbox (documented SDK behavior).

Planner's calls settled after the builder check:

- **Settings parity with the terminal:** the Claude adapter loads the owner's user, project, and local settings (`settingSources`) and the Claude Code system prompt preset, so allow lists and `CLAUDE.md` apply exactly as in the terminal and the inbox only receives what the terminal would ask.
- **Decision type:** the port's decision is an enum `approve | approve_for_session | reject`, plus an optional free-text answer. The MVP UI shows approve and reject; "approve for session" is wired only where the provider offers it (Claude `suggestions`, Codex `acceptForSession`). Fixing the enum now avoids changing the port across four adapters later.
- **Non yes/no requests:** `AskUserQuestion` appears in the inbox as a question with its options; the owner's pick goes back as the tool's answer. `ExitPlanMode` appears as a plan to approve or reject. These use the same `ApprovalRequest` record with a `kind` field (`permission | question | plan`).

### Client

- 3D office scene: one area per boss (only Claude active in MVP; other bosses can appear as "coming soon"), one character per employee with a status animation or marker.
- Side panel: selected employee's chat (streaming), message input, stop button.
- Approvals inbox: always visible list of pending requests with approve/reject, independent of the 3D scene.
- "New task" form: boss, task text, working directory.
- Live updates over WebSocket; on reconnect the client reloads state from the API.

### Technology (planner's calls, builder may adjust with reason)

- Server: TypeScript, Fastify with WebSocket support, `@anthropic-ai/claude-agent-sdk`, SQLite (Node built-in `node:sqlite` if stable enough on the installed Node, otherwise `better-sqlite3`).
- Client: TypeScript, Vite, React, React Three Fiber + drei for 3D.
- Tests: Vitest. The Claude adapter is tested behind its port with a fake SDK; one manual end-to-end check uses the real CLI.
- Package manager: npm workspaces.

Exact versions are resolved from the lockfile at implementation time and cached in `.context/` per the project rules.

## Left to the builder

- 3D art style, layout coordinates, camera controls, animations.
- API route names and WebSocket message shapes, following the domain model above.
- How the input summary of an approval is rendered per tool (command text for Bash, file path and diff for edits).
- SQLite schema details and migrations approach.

## Next after the MVP

1. Codex, OpenCode, and Gemini adapters, one per increment, against the same port.
2. Separate design for the orchestrating boss: a boss session receives an MCP server from the office with tools such as `hire_employee(task, workingDirectory)` and `check_employee(id)`. All four providers accept MCP servers; details to verify in that design.

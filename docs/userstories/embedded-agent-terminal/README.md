# Embedded Agent Terminal — User Stories

Builds on: [Electron Desktop App & External Agent Launchers](../electron-desktop-and-external-apps/README.md) (Electron shell `US-02` removed on 2026-11-20; server bootstrap and external launchers kept).
Branch: `feature/embedded-agent-terminal`, created from `feature/electron-desktop-and-external-apps` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-20).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Server PTY session manager for allowlisted agent CLIs | — | complete |
| US-02 | Authenticated terminal WebSocket channel with scrollback replay | US-01 | complete |
| US-03 | Embedded terminal panel (xterm.js) in the workspace conversation view | US-02 | pending |
| US-04 | Session-conflict guard between office turns and the embedded terminal | US-01, US-03 | pending |

## Confirmed facts & scope boundaries

- **Confirmed facts**:
  - Virtual Office is a web app again: npm workspaces `apps/server` (Fastify 5, `@fastify/websocket`, SQLite) and `apps/web` (React 19, Vite 8); Node on this host is `v24.22.3`.
  - The server binds `127.0.0.1`, authenticates every HTTP and WebSocket request with a per-run token (`onRequest` hook + `tokensMatch` in `apps/server/src/http/security.ts`), and checks `allowedHosts` / `allowedOrigins`.
  - Agent CLIs on `PATH` on this host: `claude`, `codex`, `opencode`, `agy` (`gemini` is not installed).
  - Employees already store `workingDirectory`, `bossId`, and `providerSessionId`; `ExternalLauncherService` already resolves the per-boss CLI binary for the external terminal targets, but only passes resume arguments for `claude` (`--resume <id>`).
  - Native desktop apps (Claude Desktop, ChatGPT, OpenCode Desktop, Antigravity) cannot be embedded in a browser page; they stay reachable through the existing "Open in..." launcher.
- **Assumptions**:
  - One embedded terminal per employee at a time; closing the panel keeps the PTY alive until the owner ends it or the server stops (the office has no employee-deletion feature).
- **Verified during US-01 (2026-11-20)**:
  - `node-pty@1.1.0` installs on this host by compiling its native addon with node-gyp (no Linux prebuild ships; `g++`, `make`, `python3` are present) and spawns correctly on Node v24.22.3 (`import { spawn } from "node-pty"` works from ESM).
  - Interactive resume flags from each installed CLI's `--help`: `claude --resume <id>`, `codex resume <id>`, `opencode --session <id>`, `agy --conversation <id>`; `gemini --resume <id>` matches `GeminiAgentAdapter`.
- **Exclusions**:
  - No free-form shell: the PTY only runs the allowlisted agent CLI for the employee's boss, with arguments built by the server.
  - No embedding of native desktop apps, VNC, or window reparenting.
  - No remote access: the terminal channel inherits the `127.0.0.1` bind and token check.

Verification levels: Vitest unit and HTTP/WebSocket integration tests in `apps/server` and `apps/web` (with an injected fake PTY factory so tests never spawn real agent CLIs), `npm run typecheck`, `npm run build`, and a live browser smoke test opening a real `claude` terminal in `/workspace`.

---

## US-01 — Server PTY session manager for allowlisted agent CLIs

As the owner, I want the server to run each employee's agent CLI inside a pseudo-terminal, so that the full interactive CLI can be shown inside the web app.

- `US-01 / AC-01`: Given a `TerminalSessionManager` with an injectable PTY factory, when `open(employeeId, { cols, rows })` is called for an existing employee, then it spawns the boss's CLI (`claude`, `codex`, `opencode`, `agy` or `gemini`) with `cwd: workingDirectory`, adds the boss's interactive resume arguments when `providerSessionId` exists (`claude --resume <id>`, `codex resume <id>`, `opencode --session <id>`, `agy --conversation <id>`, `gemini --resume <id>`; no arguments start a fresh session), checks the binary with the existing `isBinaryAvailable` helper (`agy` preferred over `gemini` for the 4th boss, as at server startup), and returns a session handle.
- `US-01 / AC-02`: Given an open session, when `open` is called again for the same employee, then the existing session is returned and no second process is spawned.
- `US-01 / AC-03`: Given an open session, then `write(data)`, `resize(cols, rows)` and `kill()` reach the PTY; output is kept in a bounded scrollback buffer (default 256 KiB, oldest bytes dropped first) and process exit is reported with its exit code.
- `US-01 / AC-04`: Given an unknown employee (`404`), a missing `workingDirectory` (`409 folder_missing`), or a boss whose CLI is not on `PATH` (`409 target_unavailable`), then no process is spawned; `killAll()` kills every live PTY (wired into server `close()` by `US-02 / AC-04`).

---

## US-02 — Authenticated terminal WebSocket channel with scrollback replay

As the owner, I want the browser to stream the PTY over a WebSocket, so that typing and output feel like a local terminal and survive a page reload.

- `US-02 / AC-01`: Given `GET /ws/terminal/:employeeId?cols=&rows=` with a valid token and an allowed origin, when the socket connects, then the server opens (or attaches to) the employee's PTY session, first sends the scrollback buffer, then streams live output.
- `US-02 / AC-02`: Given an attached socket, when the client sends `{ "type": "input", "data" }` or `{ "type": "resize", "cols", "rows" }`, then the server writes or resizes the PTY; malformed messages, non-positive or oversized sizes (over 500 columns or rows), and unknown types are ignored without closing the session.
- `US-02 / AC-03`: Given a missing or wrong token or a disallowed origin, then the upgrade is rejected with `401`/`403` and no PTY is spawned; given an unknown employee, the socket closes with an error frame and no PTY is spawned.
- `US-02 / AC-04`: Given the PTY exits, then the client receives `{ "type": "exit", "code" }` and the socket closes; given the socket closes first, the PTY keeps running so a reconnect replays the scrollback; given the server `close()` runs, every live PTY is killed.

---

## US-03 — Embedded terminal panel (xterm.js) in the workspace conversation view

As the owner, I want a "Terminal" tab next to the chat in each employee's conversation, so that I can use the agent's full interactive CLI without leaving Virtual Office.

- `US-03 / AC-01`: Given an employee is selected in `/workspace`, when the owner switches the conversation view from "Chat" to "Terminal", then an `xterm.js` terminal (with the fit addon) connects to `/ws/terminal/:employeeId` and shows the replayed scrollback followed by live output.
- `US-03 / AC-02`: Given the terminal is visible, when the owner types or the panel is resized, then keystrokes are sent as `input` messages and the fitted size as `resize` messages, debounced so dragging a splitter sends at most one resize per animation frame.
- `US-03 / AC-03`: Given the owner switches employee or back to "Chat", then the socket for the previous employee closes and no input reaches the wrong PTY; an "End session" control kills the PTY after confirmation.
- `US-03 / AC-04`: Given the PTY exits or the socket fails, then the panel shows the exit code or the error inline with a "Restart" button, and the chat tab keeps working.
- `US-03 / AC-05`: Given the existing "Open in..." menu, then it lists **Embedded terminal** first (switching to the Terminal tab), followed by the existing external targets unchanged.

---

## US-04 — Session-conflict guard between office turns and the embedded terminal

As the owner, I want the office and the embedded terminal not to drive the same agent session at the same time, so that resumed conversations do not get corrupted or interleaved.

- `US-04 / AC-01`: Given an employee whose office turn is running (`status: "working"`), when the owner opens the Terminal tab, then the panel explains that a turn is in progress and offers "Open when idle" instead of spawning a resumed CLI.
- `US-04 / AC-02`: Given an embedded terminal is open for an employee, when the owner sends a chat message to that employee, then the composer shows that the terminal holds the session and asks to end the terminal first; the server rejects office turns for that employee with `409 terminal_active` while the PTY is alive.
- `US-04 / AC-03`: Given the terminal session ends, then the employee's chat composer is enabled again with no server restart.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-04` | `apps/server/test/terminal/terminal-session-manager.test.ts` (12 tests, fake PTY factory: spawn args per boss, resume args, reuse, scrollback bound, exit, rejections, `killAll`) | Passed. RED first (`Cannot find module '../../src/terminal/agent-cli-command.ts'`), then 12/12 green; `apps/server` `tsc --noEmit`: 0 errors. Implementer: `pumbastudio` (`zai-org/glm-4.7-flash`), 2 correction rounds on the manager (scrollback limit/total mix-up, disposables registered as listeners, slot not freed on exit, getter/field name clash). Known deviation: an oversized single chunk is trimmed by UTF-16 characters, not bytes. |
| `US-02 / AC-01`–`AC-04` | `apps/server/test/http/terminal-ws.test.ts` (11 tests: protocol parsing, token/origin rejection with zero spawns, unknown employee error frame + close `1008`, query size, replay then live output, input/resize with bad frames ignored, exit frame + close `1000`, reconnect replay with no kill, `terminal_unavailable` + close `1011`); server `close()` → `terminals.killAll()` wiring checked in the final live smoke test | Passed. RED first (`Cannot find module '../../src/terminal/terminal-protocol.ts'`), then 11/11 green; `apps/server` 28 files / 227 tests green; `tsc --noEmit`: 0 errors. Implementer: `pumbastudio` (`zai-org/glm-4.7-flash`); corrections: test setup misuse and invented `getServer()` API, unsubscribe functions called as disposables, query object typing. |
| `US-03 / AC-01`–`AC-05` | `apps/web/src/state/terminalChannel.test.ts` (message encoding, resize debounce, employee switch closes socket) + live browser smoke test with real `claude` in `/workspace` | Pending |
| `US-04 / AC-01`–`AC-03` | `apps/server/test/office/terminal-conflict.test.ts` (`409 terminal_active`, release after exit) + composer state test | Pending |
| Shared-code regression risk (`app.ts` auth hook, `ExternalLauncherService`, `ConversationPane.tsx`, office message route) | `npm run test`, `npm run typecheck`, `npm run build` | Pending |

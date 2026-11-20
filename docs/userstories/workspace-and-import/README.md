# Two-Screen Workspace, Named Employees, and Claude Session Import — User Stories

Design: [2026-11-19-workspace-and-import-design.md](../../superpowers/specs/2026-11-19-workspace-and-import-design.md) (approved by the owner on 2026-11-19).
Builds on: [Virtual Office MVP stories](../virtual-office-mvp/README.md).

Branch: `feature/workspace-and-import`, created from `feature/virtual-office-mvp` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-19).
Implementer route: no local model available (LM Studio unreachable, Ollama with no models); Claude Sonnet subagents wrote the code; planner reviewed and verified.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Office and workspace as separate views | — | in progress: two-window live sync and `/office` 3D not observed |
| US-02 | Open an employee from the office on the other screen | US-01 | in progress: cross-window check pending in a WebGL browser |
| US-03 | Claude-like workspace | US-01 | complete |
| US-04 | Named characters | US-03 | in progress: name labels and species cues in 3D not observed (AC-05) |
| US-05 | Import existing Claude sessions | US-04 | complete |
| US-06 | Catch up on terminal turns before resuming | US-05 | complete |
| US-07 | Shutdown is not reported as a failure | — | complete (bugfix approved by the owner on 2026-11-19: "Sí, arreglalo") |

Verification levels: Vitest for server use cases and API (fake SDK functions for `listSessions` and `getSessionMessages`), Vitest for pure client modules; manual checks in the browser for layout and cross-window behavior, and with real Claude sessions for import.

---

## US-01 — Office and workspace as separate views

As the owner, I want the 3D office and the workspace at different addresses, so that I can put one on each monitor.

- `US-01 / AC-01`: Given the server is running, when the owner opens `/office?token=…`, then only the full-screen 3D office (with the connection indicator) is shown.
- `US-01 / AC-02`: Given the server is running, when the owner opens `/workspace?token=…`, then the workspace is shown with everything needed to work (employees, chat, approvals, new task, import) and a button that opens `/office` in a new window.
- `US-01 / AC-03`: Given the owner opens `/?token=…`, then the browser is redirected to `/workspace` keeping the token.
- `US-01 / AC-04`: Given both views are open in two windows, when any server event happens (status change, new message, approval), then both windows show it without reloading.
- `US-01 / AC-05`: Given the server serves the built client, when `/office` or `/workspace` is loaded directly (or refreshed), then the page loads (no 404).

## US-02 — Open an employee from the office on the other screen

As the owner, I want clicking a character in the office to open its chat in the workspace window, so that the office works as the map for my second screen.

- `US-02 / AC-01`: Given `/office` and `/workspace` are open in the same browser, when the owner clicks a character, then the workspace selects that employee within one second.
- `US-02 / AC-02`: Given no workspace window is open, when the owner clicks a character, then the office shows a card with name, status, and an "Open in workspace" link that opens `/workspace?employee=<id>` with that employee selected.
- `US-02 / AC-03`: Given pending approvals exist, when `/office` is shown, then a floating badge shows their count, and clicking it focuses the employee of the oldest pending approval in the workspace.

## US-03 — Claude-like workspace

As the owner, I want the workspace to read like the Claude app, so that following and steering agents feels like a normal chat.

- `US-03 / AC-01`: Given employees exist, when the workspace loads, then the left sidebar lists them grouped by boss, each with species icon, name, status dot, and task title, newest activity first, plus "New task" and "Import from Claude" buttons and a pending-approvals section.
- `US-03 / AC-02`: Given an employee is selected, when its conversation shows, then owner messages are right-aligned, agent text is rendered as markdown (headings, lists, code blocks), and the header shows name, species, status, folder, rename, and stop.
- `US-03 / AC-03`: Given the conversation contains tool calls, then each appears as a one-line collapsed row with a readable label (for example "Ran `npm test`", "Edited `src/app.ts`") that expands to show input and result; subagent activity is nested under its row.
- `US-03 / AC-04`: Given the message box has text, when the owner presses Enter, then it is sent; Shift+Enter inserts a newline; empty text is not sent.
- `US-03 / AC-05`: Given the selected employee has pending approvals, then they appear at the top of the conversation with the same actions as the MVP inbox (approve, reject, approve for session, answer questions, approve plans).
- `US-03 / AC-06` (regression): Given the MVP features, when using the workspace, then hiring, chatting, approvals, stopping, and resuming still work as in the MVP stories.

## US-04 — Named characters

As the owner, I want every employee to have its own name and character, so that the office feels like a game with people I recognize.

- `US-04 / AC-01`: Given the owner hires without typing a name, when the employee is created, then it gets a generated name not used by another employee (or name + number when the list is exhausted) and a random species from `wolf, dog, fox, cat, bear, human`.
- `US-04 / AC-02`: Given the hire form, when the owner types a name and picks a species, then the employee is created with them; a name empty after trim or longer than 40 characters, or an unknown species, is rejected with a validation error and no employee is created.
- `US-04 / AC-03`: Given an employee, when the owner renames it or changes its species (`PATCH /api/employees/:id`), then the change is persisted and both views update live; invalid values are rejected and nothing changes.
- `US-04 / AC-04`: Given employees created before this feature, when the server starts, then each one without a name gets a generated name and species.
- `US-04 / AC-05`: Given the office view, then each character shows its name above it and a color/shape cue per species.

## US-05 — Import existing Claude sessions

As the owner, I want to choose which of my existing Claude conversations join the office, so that I can continue them from here without flooding the office.

- `US-05 / AC-01`: Given the owner opens "Import from Claude", then a picker lists existing sessions newest first with title, folder, branch, and relative date; sessions already linked to an employee are disabled and marked "Already in the office"; a warning says to close a session in the terminal before resuming it here.
- `US-05 / AC-02`: Given the picker, when the owner types in the search box, then the server filters all sessions (not only loaded ones) by title and folder, case-insensitive; "Load more" pages through results.
- `US-05 / AC-03`: Given selected sessions, when the owner presses "Import N", then one `idle` Claude employee is created per session with generated name and species, the session's folder, its title as task, and its history (text, tool calls, tool results; nested when the SDK provides parent ids, flat otherwise).
- `US-05 / AC-04`: Given a selected session is already imported, has no recorded folder, cannot be found, or cannot be read, then it is reported as skipped with reason `already_imported`, `missing_cwd`, `not_found`, or `read_failed`, and the others still import.
- `US-05 / AC-05`: Given a session whose folder no longer exists, when imported, then it becomes a `failed` employee with reason "Project folder not found: <folder>", its history is readable, and its message box is disabled with that explanation; sending a message through the API returns `409 working_directory_missing`.
- `US-05 / AC-06`: Given an imported employee with an existing folder, when the owner sends a message, then the session resumes with its full previous context (MVP resume path).
- `US-05 / AC-07`: Given import, then no Claude session file is modified or deleted by the import itself.

## US-06 — Catch up on terminal turns before resuming

As the owner, I want turns I made in the terminal after importing to appear before I continue, so that I never continue a conversation blind.

- `US-06 / AC-01`: Given an employee whose session gained new turns outside the office, when the owner sends a message and the session is resumed, then the missing messages are appended in order before the new owner message, with no duplicates.
- `US-06 / AC-02`: Given no new turns exist, when resuming, then no messages are added besides the owner's.
- `US-06 / AC-03`: Given reading the session fails during catch-up, then the resume continues and a `system` message notes that earlier turns could not be loaded.

## US-07 — Shutdown is not reported as a failure

As the owner, I want stopping the server (Ctrl+C or a terminate signal) to leave my working employees as stopped, so that their history does not show a failure that never happened and I can resume them.

Found during US-06 verification: stopping the server recorded "Employee failed: Claude Code process exited with code 143" because the signal also reaches the `claude` child process, which exits before the office's shutdown marks the session as closed.

- `US-07 / AC-01`: Given an employee is `working` or `waiting_approval`, when the server receives SIGINT or SIGTERM, then the employee ends as `stopped`, no "Employee failed" message is added, and its pending approvals are `expired` (agent gets deny).
- `US-07 / AC-02`: Given the agent process dies from a termination signal (exit code 130 or 143) while the server keeps running, then the employee becomes `stopped` with the system message "Session interrupted: the agent process was terminated. Send a message to resume." instead of `failed`.
- `US-07 / AC-03` (regression): Given the agent process fails for any other reason (for example a non-signal exit code or a start error), then the employee still becomes `failed` with its reason, as in MVP `US-02 / AC-04`.

---

## Verification mapping

Evidence date: 2026-11-19. Automated: `npm run test -w apps/server` 10 files, 96 tests passed; `npm run test -w apps/web` 7 files, 32 tests passed; `npm run typecheck` passed. Manual: test server on port 4399 with a temporary database, real Claude sessions read through the SDK, real `claude` CLI for resume and terminal turns, UI in the desktop browser pane (no WebGL). Temporary files removed afterwards.

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | Manual `/office` in a WebGL browser | Pending owner check (pane has no WebGL; fallback shown) |
| `US-01 / AC-02`, `AC-03` | `apps/web/src/state/routing.test.ts`; manual | Passed. `/?token=…` redirected to `/workspace` with the token; workspace shows new task, import, approvals, employees, "Open office" |
| `US-01 / AC-04` | Manual: two windows | Pending owner check |
| `US-01 / AC-05` | `apps/server/test/http/workspace-api.test.ts`; curl | Passed. `/office` 200, `/workspace` 200 |
| `US-02 / AC-01`–`AC-03` | `apps/web/src/state/windowChannel.test.ts`; manual two windows | Unit tests passed; cross-window manual check pending owner (needs WebGL to click characters) |
| `US-03 / AC-01`–`AC-05` | `toolLabel.test.ts`, `sidebar.test.ts`, `timeline` tests; manual | Passed. Sidebar grouped by boss with species icons, names, status dots; markdown rendered (lists, bold, code); tool rows collapsed ("Ran `rm vo-e2e-marker.txt`"); right-aligned owner bubbles |
| `US-03 / AC-06` | MVP suites still green; manual resume and chat through the workspace | Passed |
| `US-04 / AC-01`–`AC-04` | `apps/server/test/office/names.test.ts`, `persistence/migration.test.ts` | Passed. Imports got names "Ember" (wolf) and "Daisy" (fox) |
| `US-04 / AC-05` | Manual 3D | Pending owner check |
| `US-05 / AC-01`–`AC-04` | `apps/server/test/office/import.test.ts`; manual | Passed. 9 real sessions listed; `q=virtualoffice` → 1; import of 2 sessions + duplicate + unknown id → 2 imported, `already_imported`, `not_found`; history with text, tool calls, results; picker marks "Already in the office" |
| `US-05 / AC-05` | `import.test.ts`; manual: folder removed, send message | Passed. `409 working_directory_missing` "Project folder not found: …" |
| `US-05 / AC-06` | Manual: resume imported employee | Passed. Resumed and answered with earlier context |
| `US-05 / AC-07` | Manual: md5 of the imported session file before and after import | Passed. File unchanged |
| `US-06 / AC-01`–`AC-03` | `import.test.ts` (US-06); manual: `claude -p --resume` turn in the terminal, then send from the office; then restart and send again | Passed. Terminal turn appended in order before the new message; after restart and a second resume, 0 duplicate uuids; owner message uuid back-filled |
| Risk: MVP database migration | `persistence/migration.test.ts` | Passed |
| `US-07 / AC-01`–`AC-03` | `apps/server/test/office/shutdown.test.ts` (RED observed first: `beginShutdown is not a function`, AC-02 ended `failed`); manual: real employee in `waiting_approval`, server stopped with a termination signal | Passed. 105 server tests green. Manual: employee `stopped`, failure reason null, approval `expired`, no system failure message, the requested command never ran |

Known issue found during verification: stopping the server recorded "Employee failed: Claude Code process exited with code 143". Tracked and fixed as US-07.

Not observed red-first: both implementers wrote implementation before tests.

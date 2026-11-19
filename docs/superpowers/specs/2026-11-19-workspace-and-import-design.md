# Two-Screen Workspace, Named Employees, and Claude Session Import — Design

Date: 2026-11-19
Status: Draft, pending owner approval
Builds on: [Virtual Office MVP design](2026-11-19-virtual-office-mvp-design.md)

## Intent and why

The owner has two monitors and wants the office on one and the work on the other: the 3D office as the "game map" on one screen, and a Claude-app-like workspace with each agent's chats and requests on the other. Employees should feel like characters, with their own names, and the owner wants to bring the Claude conversations they already have into the office instead of starting from zero.

This is feature 1 of an agreed order:

1. **This design:** two synchronized views, Claude-like workspace, named characters, import of existing Claude sessions.
2. Later: skills and previously created agents as an employee toolbox or hireable specialists (`supportedCommands()`, `supportedAgents()`).
3. Later: visual overhaul toward the owner's reference image (industrial loft, neon lights, anthropomorphic animal and human characters, illustrated look).

## Goals

- `/office`: full-screen 3D office (the game map).
- `/workspace`: Claude-app-like layout with agents and chats on the left, the conversation in the center, and approvals always visible.
- Both views stay in sync live, and clicking a character in `/office` opens that employee in `/workspace` when both are open.
- Each view works alone: `/workspace` has everything needed to work with one screen, plus a button to open `/office`.
- Every employee has an editable name and character species.
- An "Import from Claude" picker lists existing Claude Code sessions; the owner chooses which ones become employees, with their history, and can resume them.

## Non-goals

- Skills/agents toolbox and specialists (feature 2).
- New 3D art style (feature 3). The office keeps the MVP look, plus name labels and per-species color/shape cues.
- Importing Codex, OpenCode, or Gemini history (comes with each adapter).
- Automatic bulk import of all sessions.
- Live mirroring of a session that is still open in a terminal.

## Anti-goals

- Importing floods the office with dozens of characters the owner did not choose.
- An imported session is modified or deleted on disk. Importing only reads; resuming appends through the official SDK like the CLI would.
- The workspace looks like a debug log. It must read like a chat: markdown rendered, tool activity collapsed by default.
- A pending approval is missed because it only shows in the view the owner is not looking at.

## Constraints

- Same stack and rules as the MVP: Node 24, Fastify, `node:sqlite`, React 19, R3F, local only, token + Host/Origin checks for every new endpoint.
- Two windows of the same origin (`127.0.0.1:<port>`) in the same browser.

## Approaches considered

| Topic | Option | Decision |
| --- | --- | --- |
| Layout | A: office as home, chat full screen on click | Superseded |
| Layout | B: three columns at once | Superseded |
| Layout | **C: two routes, `/office` and `/workspace`, one per monitor, synced** | **Chosen by the owner** |
| Cross-window "open this employee" | **`BroadcastChannel` between same-origin windows** | Planner's call: instant, no server state, works offline from the server |
| Cross-window "open this employee" | Relay selection through the server | Rejected: selection is per-browser UI state, not office state |
| Import source | **Agent SDK `listSessions()` + `getSessionMessages()`** | Planner's call: official API, survives CLI file format changes |
| Import source | Parse `~/.claude/projects/**/*.jsonl` directly | Rejected: internal format, may change without notice |
| Import mode | **Picker: owner selects sessions** | **Chosen by the owner** |
| Import mode | Import everything automatically | Rejected by the owner |

## Design

### Views and sync

- One single-page app with two routes. `/` redirects to `/workspace`.
- Both routes use the existing API client, WebSocket, and state store, so both receive every server event.
- A `BroadcastChannel("virtual-office")` carries UI messages only: `{ type: "focus_employee", employeeId }`. `/office` posts it when a character is clicked; `/workspace` listens and selects that employee. If no `/workspace` window is open, clicking a character in `/office` shows a small card with the name, status, and an "Open in workspace" link (opens a new window/tab at `/workspace?employee=<id>`).
- Pending approvals: `/workspace` shows the inbox; `/office` shows a floating counter badge with the number of pending approvals, and the "!" markers stay on characters. Clicking the badge focuses the oldest pending approval's employee in `/workspace`.

### Workspace (Claude-like)

- Left sidebar: "New task" button, "Import from Claude" button, then employees grouped by boss, each row with avatar (species icon), name, status dot, and task title; newest activity first.
- Center: conversation header (name, species, status, folder, rename button, stop button); messages as a chat, with user messages right-aligned and agent text rendered as markdown with code blocks; tool calls collapsed into one-line rows ("Ran `npm test`", "Edited `src/app.ts`", "Read 3 files") that expand to show input/result; subagent activity nested under its tool row; live streaming text at the end; message box at the bottom (Enter to send, Shift+Enter for a newline).
- Approvals: a panel at the top of the center column when the selected employee has pending requests, plus an inbox section in the sidebar listing pending requests for all employees. Same actions as the MVP.
- The MVP side panel content (new task form, roster, inbox, detail) moves into this layout; nothing from the MVP is lost.

### Named characters

- `Employee` gains `name` (string, 1–40 chars after trim) and `species` (`wolf | dog | fox | cat | bear | human`).
- On hire and on import, the server assigns a name from a built-in list of short names not used by another employee (falls back to name + number) and a random species. The hire form lets the owner type a name and pick a species instead.
- `PATCH /api/employees/:id` with `{ name?, species? }` renames or changes species; validation errors use the existing error shape.
- `/office` shows the name above each character; species changes the character's color and simple shape cues (ears/tail made of primitives) until feature 3 brings real art.

### Import from Claude

- `GET /api/imports/claude/sessions?limit=&offset=` returns sessions from `listSessions({ limit, offset })`, mapped to `{ sessionId, title, cwd, gitBranch, lastModified, createdAt, alreadyImported }`, newest first. `title` = `customTitle ?? summary ?? firstPrompt`. `alreadyImported` is true when an employee already has that `providerSessionId` (this includes sessions the office itself started).
- `POST /api/imports/claude` with `{ sessionIds: string[] }` creates one employee per session: boss `claude`, status `idle`, `providerSessionId` = session id, `workingDirectory` = session `cwd`, `task` = title, generated name and species. Messages come from `getSessionMessages(sessionId)` and are converted with the same mapping as live messages (text, tool calls, tool results, subagent nesting). Response: `{ imported: Employee[], skipped: { sessionId, reason }[] }`; skip reasons: `already_imported`, `not_found`, `missing_cwd` (the session records no folder), `read_failed`.
- Sending a message to an imported employee uses the existing resume path (`resume: providerSessionId`).

Planner's calls settled after the builder check:

- **Missing folder:** a session with no `cwd` at all is skipped with `missing_cwd`. A session whose `cwd` no longer exists is imported (listed in `imported`, not `skipped`) with status `failed`, `failureReason` "Project folder not found: <cwd>", and `workingDirectory` = the original `cwd`. Sending a message to an employee whose `workingDirectory` does not exist returns `409 working_directory_missing` and the workspace disables its message box with that explanation. Re-pointing an employee to another folder is out of scope (Claude sessions are tied to their project folder).
- **History refresh:** imported history is copied at import time. Each stored message keeps the SDK message `uuid` as `sourceUuid`. Before any resume (imported or not), the server calls `getSessionMessages` again and appends, in order, the messages whose `sourceUuid` it has not stored, so turns made in the terminal after the import show up before the new message. No live mirroring.
- **Picker search:** server-side. `GET /api/imports/claude/sessions` accepts `q`; the server lists all sessions with `listSessions()`, filters by `q` on title and folder (case-insensitive), sorts newest first, then applies `limit`/`offset`.
- **Subagent nesting:** nest when the SDK returns `parent_tool_use_id`; otherwise show the history flat. Never read transcript files directly.
- **Names:** not required to be unique; generated names avoid collisions, typed names are free. Everything addresses employees by id.
- The picker: a modal with a search box (filters title and folder), a list with checkboxes (title, folder, branch, relative date), already-imported rows disabled and marked, "Load more" paging, and an "Import N" button.
- Warning shown in the picker: resuming a session that is also open in a terminal can interleave both conversations; close it in the terminal first.

### API contract changes

`docs/architecture/api-contract.md` is updated with the new fields, endpoints, and event: `employee_updated` already covers rename/species changes and imports.

## Left to the builder

- Markdown library choice (a maintained React markdown renderer with code highlighting) and exact tool-row wording per tool.
- Name list content, species visuals with primitives, sidebar icons.
- Picker page size.

## Next after this feature

Feature 2 (skills and agents) and feature 3 (visual overhaul) each get their own design.

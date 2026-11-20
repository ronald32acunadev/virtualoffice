# Skills Menu and Specialist Employees — Design

Date: 2026-11-19
Status: Draft, pending owner approval
Builds on: [Workspace and import design](2026-11-19-workspace-and-import-design.md)

## Intent and why

The owner uses Claude Code skills (judgment-day, pumba-projectsetup, chained-pr…) and custom agents in `~/.claude/agents` (review-risk, jd-judge-a…). In the office chat, typing `/` shows nothing, so they cannot discover or use what they already built. They want the office to expose their skills like Claude Code does, and to hire their agents as specialist employees.

Verified (Agent SDK docs and `sdk.d.ts` 0.3.328): sending `/<name>` in a prompt already runs a skill or command; `Query.initializationResult()` returns `{ commands: SlashCommand[], agents: AgentInfo[], ... }`; `supportedCommands()` / `supportedAgents()` return the current lists; the `agent` option runs the main thread as a named agent (same as the CLI `--agent`). `SlashCommand = { name, description, argumentHint, aliases?, builtin? }`, `AgentInfo = { name, description, model? }`.

This is feature 2 of the agreed order (then the Electron desktop app, the visual overhaul, the other provider adapters, and the orchestrating boss).

## Goals

- Typing `/` at the start of the chat message box opens a menu of the employee's available skills and commands (name, description, argument hint), filtered as the owner types, keyboard-navigable; choosing one inserts `/name ` into the box.
- "New task" has a **Role** selector listing the owner's agents; the hired employee runs as that agent for its whole life, including after resume.
- Each employee header has a toolbox button listing its skills and agents; clicking a skill inserts its command.
- The office shows a specialist's role: the character label reads "Name · role".

## Non-goals

- Editing or creating skills or agents from the office.
- Mentioning agents inside a message (`@agent`); the owner can still ask Claude in plain text to use a subagent.
- Changing an existing employee's role after hire.
- Skills for Codex, OpenCode, or Gemini (each adapter adds its own later).

## Anti-goals

- Listing commands costs a model turn or tokens.
- The menu shows commands that do not work for that employee (for example from another project's `.claude/skills`).
- Generic look: the menu and toolbox follow the "feel alive" preference (icons per command kind, smooth open/close, highlighted match).

## Approaches considered

| Topic | Option | Decision |
| --- | --- | --- |
| Specialists | **Full employees that run as the agent (`agent` option)** | **Chosen by the owner** |
| Specialists | Ask an existing employee to delegate to the agent | Rejected by the owner (still possible in plain text) |
| Command source | **SDK `initializationResult()` / `supportedCommands()` / `supportedAgents()`** | Planner's call: official, includes project, user, plugin, and built-in commands |
| Command source | Read `~/.claude/skills` and `~/.claude/agents` files | Rejected: misses plugin, project, and built-in commands; internal layout |

## Design

### Catalog (server)

- `GET /api/catalog?workingDirectory=<abs path>` returns `{ commands: SlashCommand[], agents: AgentInfo[] }` for that folder. `GET /api/employees/:id/catalog` returns the same for an employee (its folder and, when it has a live session, the live lists).
- The server caches catalogs per working directory in memory. A live session refreshes its folder's cache from `supportedCommands()` / `supportedAgents()` after init and when the SDK pushes a command-list change.
- **Cold folder (planner's call, verified by a spike on 2026-11-19):** open a probe `query()` with `cwd`, the same `settingSources` and system prompt preset, and a streaming prompt that never yields; await `initializationResult()`; close it. Spike result: 937 ms, 102 commands, 16 agents, no assistant or result message (no model turn). The probe does run the owner's SessionStart hooks (4 hook messages seen), so probes run only on an explicit owner action (opening the Role selector or the toolbox, or pressing refresh), never on keystrokes, only for existing directories, and their result is cached per folder. If the probe fails or takes longer than 15 seconds, return `503 catalog_unavailable` and the client shows "Skills will appear once the employee starts".
- Commands are sorted: non-built-in first, then built-in (`builtin: true`). The SDK does not report a command's source; the client treats a name containing `:` as a plugin command for its icon only.
- Agents: the SDK returns built-in agents too (Explore, Plan, general-purpose, statusline-setup, claude-code-guide, claude, web-fetch) with no source flag. The Role selector lists all of them, with the owner's agents first and the names in a fixed built-in list under a "Built-in" heading (planner's call).

### Specialists (server)

- `Employee` gains `role: string | null` (agent name). `POST /api/employees` accepts `role`; it must be one of the catalog agents for that folder, otherwise `400 validation_error` (field `role`). If the folder's catalog is unavailable (503), the hire with a role is rejected with `503 catalog_unavailable` so a role is never accepted unchecked (planner's call).
- If a role's agent no longer exists when resuming, the start fails through the existing failure path: the employee becomes `failed` with the SDK's reason; it does not silently fall back to General (planner's call).
- The Claude adapter passes `agent: role` when starting and when resuming. Imported employees have `role: null`.
- The role is shown in the API, both views, and on the character label.

### Client

- Message box: when the text starts with `/` and the caret is in the first word, show the menu above the box; filter by prefix, then substring, on name and aliases; arrow keys to move, Enter or Tab to insert `/name `, Escape to close. Built-in commands appear last under a "Built-in" heading. Loading and unavailable states are shown in the menu.
- New task: Role selector (default "General", meaning no agent) loaded from `GET /api/catalog` for the typed folder, debounced after the folder field changes; each option shows the agent description.
- Toolbox button in the conversation header: a popover with two tabs, Skills and Agents (agents are informational: "Ask in chat to delegate"); clicking a skill inserts it in the message box.
- Office: label "Name · role" when the role is set.

### API contract

`docs/architecture/api-contract.md` gains `Employee.role`, `role` on `POST /api/employees`, the two catalog endpoints, and `503 catalog_unavailable`.

## Left to the builder

- Icons per command source, menu animation, exact sorting within groups.
- Cache invalidation details beyond the push event (a manual refresh button in the toolbox is enough).

## Next

Feature 3: desktop app with Electron.

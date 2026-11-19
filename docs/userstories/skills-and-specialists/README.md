# Skills Menu and Specialist Employees — User Stories

Design: [2026-11-19-skills-and-specialists-design.md](../../superpowers/specs/2026-11-19-skills-and-specialists-design.md) (approved by the owner on 2026-11-19).
Builds on: [Workspace and import stories](../workspace-and-import/README.md).

Branch: `feature/skills-and-specialists`, created from `feature/workspace-and-import` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-19). Implementer: Claude Sonnet subagents (no local model loaded).

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Know what skills and agents a folder has | — | complete |
| US-02 | `/` menu in the chat | US-01 | in progress: Tab insertion not observed in the test pane (Enter observed) |
| US-03 | Hire a specialist | US-01 | in progress: Role selector UI and office label not observed |
| US-04 | Employee toolbox | US-01, US-02 | in progress: popover overflow fixed, re-check pending |

Verification levels: Vitest for server catalog, cache, validation, and adapter options (fake `query` with a fake `initializationResult`, `supportedCommands`, `supportedAgents`); Vitest for pure client modules (filtering, sorting, insertion); manual checks with the real CLI and in the browser.

---

## US-01 — Know what skills and agents a folder has

As the owner, I want the office to know the skills, commands, and agents available in a project folder without spending tokens, so that I can pick them before and after hiring.

- `US-01 / AC-01`: Given an existing folder with no live employee, when `GET /api/catalog?workingDirectory=<folder>` is called, then the server opens a probe session without a model turn and returns `{ commands, agents }` from its initialization result; commands sorted non-built-in first, then built-in.
- `US-01 / AC-02`: Given the folder's catalog is cached, when it is requested again, then it is returned from the cache without a new probe; `?refresh=true` forces a new probe.
- `US-01 / AC-03`: Given an employee with a live session, when `GET /api/employees/:id/catalog` is called, then the lists come from that session (`supportedCommands()` / `supportedAgents()`) and refresh that folder's cache; when the SDK pushes a command-list change, the cache is replaced.
- `US-01 / AC-04`: Given the folder does not exist or is not a directory, then the request is rejected with `400 validation_error` and no probe runs.
- `US-01 / AC-05`: Given the probe fails or takes longer than 15 seconds, then the response is `503 catalog_unavailable`, the probe process is closed, and nothing is cached.
- `US-01 / AC-06`: Given any catalog request, then no assistant or result message is produced by the probe (no model turn), and the probe is closed after reading the initialization result.

## US-02 — `/` menu in the chat

As the owner, I want a menu of my skills when I type `/`, so that I can use what I built without remembering names.

- `US-02 / AC-01`: Given an employee is selected, when the message box text starts with `/` and the caret is in the first word, then a menu above the box lists that employee's commands with name, description, and argument hint; non-built-in first and built-in under a "Built-in" heading.
- `US-02 / AC-02`: Given the menu is open, when the owner types more letters, then the list filters by name and aliases (prefix matches before substring matches) and highlights the matched part; no matches shows "No matching skills".
- `US-02 / AC-03`: Given the menu is open, when the owner uses arrow keys and presses Enter or Tab, then `/name ` replaces the first word and the menu closes; Escape closes it without changes; Enter with the menu closed sends the message as before.
- `US-02 / AC-04`: Given the owner sends `/name args`, then the text is sent unchanged and the SDK runs the command (real-CLI check with one of the owner's skills).
- `US-02 / AC-05`: Given the catalog is loading or unavailable, then the menu shows "Loading skills…" or "Skills will appear once the employee starts" and the message box keeps working.

## US-03 — Hire a specialist

As the owner, I want to hire one of my agents as a full employee with that role, so that a reviewer or judge works as its own character.

- `US-03 / AC-01`: Given the New task form with an existing folder, when the owner opens the Role selector, then it loads that folder's agents (explicit action, not on keystrokes) with descriptions: "General" first, then the owner's agents, then built-in agents under "Built-in".
- `US-03 / AC-02`: Given a role is chosen, when the employee is hired, then it is stored with `role`, the session starts with `agent: <role>`, and resumes also pass `agent: <role>`.
- `US-03 / AC-03`: Given a role that is not in the folder's agents, then the hire is rejected with `400 validation_error` (field `role`); given the folder's catalog is unavailable, a hire with a role is rejected with `503 catalog_unavailable`; no employee is created in either case.
- `US-03 / AC-04`: Given a specialist, then the workspace header and sidebar show the role, and the office label reads "Name · role".
- `US-03 / AC-05`: Given a hire with no role ("General"), then it behaves exactly as before (regression).
- `US-03 / AC-06`: Given the role's agent no longer exists when resuming, then the employee becomes `failed` with the SDK's reason, not silently General.

## US-04 — Employee toolbox

As the owner, I want a toolbox on each employee showing its skills and agents, so that I can browse and insert commands with a click.

- `US-04 / AC-01`: Given an employee is selected, when the owner clicks the toolbox button in the conversation header, then a popover shows two tabs, Skills and Agents, loaded from the employee's catalog, with a refresh button.
- `US-04 / AC-02`: Given the Skills tab, when the owner clicks a skill, then `/name ` is inserted at the start of the message box and the box gets focus; the popover closes.
- `US-04 / AC-03`: Given the Agents tab, then each agent shows name and description with the hint "Ask in chat to delegate".
- `US-04 / AC-04`: Given the catalog is unavailable, then the popover shows the unavailable message and a retry button.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-06` | Server tests with a fake probe; manual real probe in a temporary folder | Pending |
| `US-02 / AC-01`–`AC-03`, `AC-05` | Client unit tests for filtering, sorting, insertion, key handling; manual in browser | Pending |
| `US-02 / AC-04` | Manual: send one of the owner's skills to a real employee | Pending |
| `US-03 / AC-01`–`AC-06` | Server tests for role validation and adapter `agent` option on start and resume; manual hire of `review-risk` | Pending |
| `US-04 / AC-01`–`AC-04` | Client unit tests for toolbox insertion; manual in browser | Pending |
| Risk: probe leaks CLI processes | Server test asserting the probe is closed on success, failure, and timeout | Pending |
| Risk: existing hire, chat, import, and resume flows | Existing server and web suites stay green | Pending |

Evidence 2026-11-19: server 134 tests, web 55 tests passed. Manual on a test server with the real CLI: folder catalog 102 commands / 16 agents in 1236 ms, cached 10 ms, no leftover probe process; bad folder 400; unknown role 400; hired `review-risk` specialist answered in that agent's JSON format; `/cognitive-doc-design` sent from the office ran the skill; `/jud` menu listed judgment-day and Enter inserted it. Fixed during verification: highlight split the command name with spaces; toolbox popover overflowed the right edge.

# Remove "Open in..." Menu & Organize Toolbox — User Stories

Builds on: [Remove Embedded Apps & Antigravity-Style Agentic Chat](../agentic-chat-and-remove-embedded-apps/README.md).
Branch: `feature/remove-open-in-and-organize-toolbox`, created from `feature/agentic-chat-and-remove-embedded-apps` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-23).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Remove the `"Open in..."` launcher button, menu, and backend launch routes | — | pending |
| US-02 | Organize `Toolbox` with live search, alphabetical sorting, and grouped sections | — | pending |

## Confirmed facts, decisions & scope boundaries

- **Confirmed facts (verified in codebase on 2026-11-23)**:
  - The `"Open in..."` menu in the conversation header is implemented by:
    - Web: `apps/web/src/views/OpenExternalMenu.tsx`, `apps/web/src/state/launchMenu.ts`, `apps/web/src/state/launchMenu.test.ts`, `LaunchTarget` / `LaunchResult` types in `apps/web/src/api/types.ts`, `getLaunchTargets` / `launchEmployee` in `apps/web/src/api/client.ts`, `.launch-*` CSS rules in `apps/web/src/styles.css`, and `<OpenExternalMenu />` in `apps/web/src/views/ConversationPane.tsx`.
    - Server: `apps/server/src/office/application/external-launcher.ts`, `GET /api/employees/:id/launch-targets` and `POST /api/employees/:id/launch` in `apps/server/src/http/app.ts`, and tests (`apps/server/test/office/external-launcher.test.ts`, `apps/server/test/http/launch-routes.test.ts`).
  - `apps/web/src/views/Toolbox.tsx` currently renders all non-built-in commands in a single flat unsorted list, followed by all built-in commands, with no search input, no plugin grouping, and no separation between custom and built-in agents.
- **Scope boundaries & exclusions**:
  - **Removed**: The `"Open in..."` dropdown menu (`OpenExternalMenu`) and its dedicated external-launcher backend endpoints (`ExternalLauncherService`, `/api/employees/:id/launch*`).
  - **Kept intact**: The `Chat` and `Terminal` tabs in `ConversationPane`, the `Toolbox` button and slash-command insertion, attachments, 3D Office view, and Day/Evening mood sync.
  - **No new npm dependencies**.

Verification levels: Vitest unit and HTTP tests in `apps/server` and `apps/web`, `npm run typecheck`, `npm test`, `npm run build`, plus live check in the running app.

---

## US-01 — Remove the `"Open in..."` launcher button, menu, and backend launch routes

As the owner, I want the `"Open in..."` button and menu removed from the conversation header (along with its unused launcher backend), so that the header stays clean and uncluttered alongside the `Chat` and `Terminal` tabs.

- `US-01 / AC-01`: Given `ConversationPane`, when viewing an employee conversation header, then the `"Open in..."` button (`OpenExternalMenu`) is no longer rendered, while the employee name, job title, status, species picker, `Toolbox` button, `Stop` button, and `Chat` / `Terminal` tabs remain intact.
- `US-01 / AC-02`: Given `apps/web` and `apps/server`, when cleanup is complete, then `OpenExternalMenu.tsx`, `launchMenu.ts`, `launchMenu.test.ts`, `external-launcher.ts`, `external-launcher.test.ts`, `launch-routes.test.ts`, `.launch-*` CSS rules, and `/api/employees/:id/launch*` routes are removed with zero remaining references.
- `US-01 / AC-03`: Given the running server, requesting `/api/employees/:id/launch-targets` or `/api/employees/:id/launch` returns `404 not_found`, and all remaining server/web tests, typechecks, and builds pass.

### Verification mapping (US-01)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`, `US-01 / AC-02` | Search confirming zero references to `OpenExternalMenu`, `ExternalLauncherService`, `launchMenu`, or `/launch-targets`, plus `npm run typecheck` and `npm run build` | Pending |
| `US-01 / AC-03` + regression on `Chat` and `Terminal` tabs | `npm test` (`apps/server` + `apps/web` full suites) | Pending |

---

## US-02 — Organize `Toolbox` with live search, alphabetical sorting, and grouped sections

As the owner, I want the `Toolbox` popover to be cleanly organized with a search box, alphabetical ordering, and clear grouped sections for skills, plugins, built-in commands, and agents, so that I can find and insert any skill or inspect available agents in seconds.

- `US-02 / AC-01`: Given a catalog of slash commands, when organized by `organizeToolboxCommands(commands, query)`:
  - Commands are filtered case-insensitively by `name`, `description`, `argumentHint`, or `aliases` when `query` is non-empty.
  - Matching commands are split into ordered sections:
    1. **Skills** (non-built-in commands without a `:` namespace prefix, sorted A–Z by `name`).
    2. **Plugins** (non-built-in commands with a `<plugin>:<command>` prefix, grouped by `<plugin>` namespace A–Z, with commands inside each plugin sorted A–Z).
    3. **Built-in** (built-in commands sorted A–Z by `name`).
- `US-02 / AC-02`: Given a catalog of agents, when organized by `organizeToolboxAgents(agents, query)`:
  - Agents are filtered case-insensitively by `name` or `description` when `query` is non-empty.
  - Matching agents are split into **Custom Agents** (non-built-in, sorted A–Z) and **Built-in Agents** (built-in, sorted A–Z).
- `US-02 / AC-03`: Given the `Toolbox` popover in `apps/web/src/views/Toolbox.tsx`, when opened:
  - A search input is shown at the top (auto-focused on open, with a quick clear button when non-empty).
  - Each section header displays its label and item count badge; plugin groups and the `Built-in` section can be collapsed/expanded (and auto-expand when searching).
  - Clicking a skill still inserts `/<name>` into the composer and closes the popover; styling uses semantic Day/Evening CSS variables.

### Verification mapping (US-02)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01`, `US-02 / AC-02` | `apps/web/src/state/toolbox.test.ts` (filtering by name/desc/alias, alphabetical sorting, Skills vs Plugin namespace grouping vs Built-in, Custom vs Built-in agents, empty query & no-match cases) | Pending |
| `US-02 / AC-03` + Day/Evening visual check | `npm run typecheck`, `npm test`, `npm run build`, and live check in the running Workspace UI | Pending |

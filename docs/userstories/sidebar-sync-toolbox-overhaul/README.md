# Sidebar Consolidation, Agent Colors, Meaningful Toolbox & Two-Way Sync — User Stories

Builds on: [Remove "Open in..." Menu & Organize Toolbox](../remove-open-in-and-organize-toolbox/README.md) and [Provider Session & Project Auto-Sync](../provider-session-auto-sync/README.md).
Branch: `feature/sidebar-sync-toolbox-overhaul`, created from `feature/remove-open-in-and-organize-toolbox` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-23).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Remove `"Import from Claude"` button, modal, and manual import routes | — | complete |
| US-02 | Merge duplicate project folders/worktrees and add agent color indicators in sidebar | US-01 | complete |
| US-03 | Upgrade `Toolbox` into an actionable Agent Workspace Inspector | — | in progress |
| US-04 | Two-way chat create/delete sync between Virtual Office and external providers | US-01 | in progress |

## Confirmed facts, decisions & scope boundaries

- **Confirmed facts (verified in codebase and `data/office.sqlite` on 2026-11-23)**:
  - `ardi` currently appears 3 times in the sidebar because `groupEmployeesByProject` keys strictly by raw path, and SQLite holds 3 separate entries with `name: "ardi"`:
    - `/run/media/pumba/Proyects/Voiceflip/ardi`
    - `/run/media/pumba/Proyects/Voiceflip/armls-bridge-voice` (labeled `ardi` by Codex)
    - `/home/pumba/.codex/worktrees/rag-249-ac36-evidence/ardi` (Codex git worktree)
  - `Sidebar.tsx` renders `"Import from Claude"` alongside `3D Office`, `Day/Evening`, and `Sync`, and opens `ImportModal.tsx` calling `/api/imports/claude/sessions` and `/api/imports/claude`.
  - `Sidebar.tsx` renders employee rows inside `Projects` without any boss/agent color indicator (`AREA_COLORS`: `claude: #d9774a`, `codex: #4aa3d9`, `opencode: #5bbf7a`, `gemini: #9a7ad9`).
  - `syncProviders()` in `apps/server/src/office/application/office-service.ts` imports new external sessions but never prunes employees whose `providerSessionId` was deleted externally, and there is no `DELETE /api/employees/:id` endpoint.
  - `Toolbox.tsx` currently shows `Skills` and read-only `Agents` (mainly useful for Claude) with no workspace/session info or clickable agent delegation.
- **Safety boundaries & exclusions**:
  - **External deletion pruning guardrail**: During `syncProviders()`, an employee is pruned ONLY if its provider's `catalog.list()` succeeded with `error === null`, the employee has a non-null `providerSessionId`, the employee has no active live turn, and that `providerSessionId` is absent from the provider's returned list.
  - **Provider file deletion guardrail**: Deleting a chat from Virtual Office (`DELETE /api/employees/:id`) requires explicit user confirmation in the UI, strictly validates `sessionId` format and root-directory path containment before touching any provider session file/record, and never fails Virtual Office deletion if the external session file was already missing.
  - **No new npm dependencies**.

Verification levels: Vitest unit and HTTP/WebSocket integration tests in `apps/server` and `apps/web` (using isolated temp directories and `:memory:` SQLite databases), `npm run typecheck`, `npm test`, and `npm run build`, plus live verification in the running app.

---

## US-01 — Remove `"Import from Claude"` button, modal, and manual import routes

As the owner, I want `"Import from Claude"` removed since auto-sync already discovers sessions across all providers, so that the sidebar quick links are clean and balanced.

- `US-01 / AC-01`: Given `Sidebar.tsx` and `WorkspaceView.tsx`, `"Import from Claude"` and `ImportModal` are removed, and `.sidebar-quick-links` lays out the 3 remaining controls (`3D Office`, `☀ Day / 🌙 Evening`, `Sync`) on a clean 3-column row.
- `US-01 / AC-02`: Given `apps/web` and `apps/server`, `ImportModal.tsx`, `importSummary.ts`, `importSummary.test.ts`, `listClaudeSessions`/`importClaudeSessions` client methods, and `/api/imports/claude*` routes (along with their dedicated import-only tests) are removed with zero remaining references to `ImportModal` or `/api/imports/claude`.
- `US-01 / AC-03`: Given all remaining server and web suites, `npm run typecheck`, `npm test`, and `npm run build` pass without regressions to auto-sync (`POST /api/sync`).

### Verification mapping (US-01)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`, `US-01 / AC-02` | Search confirming zero references to `ImportModal`, `importSummary`, or `/api/imports/claude`, plus `npm run typecheck` and `npm run build` | Passed (`ZERO REFERENCES`, `npm run typecheck` & `vite build` clean) |
| `US-01 / AC-03` + auto-sync regression | `npm test` (`provider-auto-sync.test.ts`, `provider-create-sync-dedupe.test.ts`, and full suites) | Passed (`apps/server` 36/36 files 252/252 tests, `apps/web` 24/24 files 131/131 tests) |

---

## US-02 — Merge duplicate project folders/worktrees and add agent color indicators in sidebar

As the owner, I want duplicate project entries with the same project name (including worktrees like multiple `ardi` folders) merged into one project folder in the sidebar, and every chat row clearly color-coded by which agent owns it, so that the sidebar is uncluttered and scannable at a glance.

- `US-02 / AC-01`: Given projects and employees whose resolved `projectName` matches case-insensitively (including worktree paths under `/.codex/worktrees/`, `/.claude/worktrees/`, or `/.git/worktrees/`), when `groupEmployeesByProject(employees, projects)` runs, then they are merged into a single `ProjectGroup` with all their employees combined (newest first), preferring a non-worktree path as the primary `projectKey` for creating new chats, and collecting deduplicated `providers: BossId[]`.
- `US-02 / AC-01b`: Given non-project / general folders (home root like `/home/<user>` or `/Users/<user>`, `Desktop`, `Downloads` and subdirectories inside `Downloads/`, `Documents/Default Project`, or `/tmp`), when `groupEmployeesByProject` runs, then empty non-project folders are omitted from the Projects list, and any employees whose `workingDirectory` is a non-project folder are grouped under a single `"General"` group at the bottom of the list instead of appearing as standalone projects (`pumba`, `Desktop`, `Downloads`, `guia-bridge-local`, `Default Project`).
- `US-02 / AC-02`: Given `Sidebar.tsx` in the `Projects` view, when rendering each project group header and each `employee-row`:
  - Each `employee-row` carries `data-boss={employee.bossId}`, displays a colored left accent bar and a compact colored agent badge/dot (`Claude`, `Codex`, `OpenCode`, `Antigravity`/`Gemini`) derived from `AREA_COLORS` (`#d9774a`, `#4aa3d9`, `#5bbf7a`, `#9a7ad9`) with readable contrast in both Day and Evening moods.
  - Each project group header displays compact colored provider dots for the agents active in that project.

### Verification mapping (US-02)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01` | `apps/web/src/state/sidebar.test.ts` (merging multiple `ardi` paths + worktrees into one group, non-worktree primary `projectKey` preference, combined newest-first ordering, deduplicated `providers`, General non-project grouping) | Passed (`6/6` tests in `sidebar.test.ts`, `4/4` in `autoSync.test.ts`) |
| `US-02 / AC-02` + Day/Evening contrast | `npm run typecheck`, `npm run test -w apps/web`, `npm run build`, and live UI check in Day & Evening moods | Automated: passed (`24/24` web files `133/133` tests, `typecheck` & `vite build` clean); live UI check after server restart |

---

## US-03 — Upgrade `Toolbox` into an actionable Agent Workspace Inspector

As the owner, I want `Toolbox` to be genuinely useful across every provider by offering clickable agent delegation and a `Workspace` tab with session/provider info, copyable paths, and usage stats alongside organized skills, so that `Toolbox` serves as a real control center for the active chat.

- `US-03 / AC-01`: Given the `Toolbox` popover for any employee, three tabs are available: **Skills**, **Agents**, and **Workspace** (defaulting to **Workspace** for providers without a Claude slash-command catalog or **Skills** when skills exist, switchable anytime).
- `US-03 / AC-02`: Given the **Agents** tab, clicking any agent row inserts a ready-to-edit delegation prompt (e.g. `Ask <agent.name> to `) into the composer and closes the popover instead of being non-interactive.
- `US-03 / AC-03`: Given the **Workspace** tab, it displays the active employee's **Provider/Agent** (with department color dot), **Working Directory** (with 1-click Copy button), **Provider Session ID** (when available, with Copy button), **Role / Job Title**, **Token/Context Usage** summary (when available), and **Attachments** count in the current conversation.

### Verification mapping (US-03)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-03 / AC-01`, `US-03 / AC-02`, `US-03 / AC-03` | `apps/web/src/state/toolbox.test.ts` (default tab selection, agent delegation prompt builder, workspace summary/attachment count helper) + `npm run typecheck`, `npm test`, `npm run build` | Pending |

---

## US-04 — Two-way chat create/delete sync between Virtual Office and external providers

As the owner, I want creating or deleting a chat in either Virtual Office or an external agent (Claude, Codex, OpenCode, Antigravity) to stay synchronized across both, so that my conversation list never drifts or keeps deleted chats around.

- `US-04 / AC-01`: Given `syncProviders()` runs (on startup, periodically, or via `POST /api/sync`), when a provider's `catalog.list()` succeeds (`error === null`) and a stored non-active employee belonging to that provider has a `providerSessionId` that is no longer present in the provider's list, then the server deletes that employee (and its messages/approvals/attachments) from SQLite, includes `sessionsRemoved` in `SyncSummary` / `ProviderSyncStats`, and broadcasts `{ type: "employee_removed", employeeId }`. When a provider errors (`error !== null`), zero employees for that provider are pruned.
- `US-04 / AC-02`: Given `DELETE /api/employees/:id`, when called by an authenticated client, then `OfficeService.deleteEmployee(id)` stops any active live session/terminal, attempts to delete the backing external session via `catalog.deleteSession?.(providerSessionId)` (implemented safely with strict ID validation and root path containment for Claude `.jsonl`, Codex `.jsonl`, OpenCode SQLite, and Antigravity `.pb`), deletes the employee/messages/approvals from SQLite and removes its attachment directory, broadcasts `{ type: "employee_removed", employeeId }`, and returns `200 { deleted: true, providerDeleted: boolean }` (or `404` for unknown ID).
- `US-04 / AC-03`: Given the web Workspace (`ConversationPane` + `officeReducer`), when the owner clicks the Delete (`🗑`) button in the conversation header and confirms, then `api.deleteEmployee(employee.id)` runs; on receiving `employee_removed` (either from local delete or external sync pruning), `officeReducer` removes the employee, its messages/liveText/approvals, and clears `selectedId` if it was selected.

### Verification mapping (US-04)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-04 / AC-01`, `US-04 / AC-02` | `apps/server/test/office/two-way-session-sync.test.ts` (pruning externally deleted sessions on sync, no pruning when provider errors, `DELETE /api/employees/:id` removing DB rows + attachments + calling `deleteSession` + broadcasting `employee_removed`, 404 on unknown ID, safe path-containment rejection in catalog `deleteSession`) | Pending |
| `US-04 / AC-03` | `apps/web/src/state/officeReducer.test.ts` (`employee_removed` event removes employee, messages, approvals, and clears `selectedId`) + `npm run typecheck`, `npm test`, `npm run build` | Pending |

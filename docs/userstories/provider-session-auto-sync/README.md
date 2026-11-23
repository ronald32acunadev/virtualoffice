# Provider Session & Project Auto-Sync — User Stories

Builds on: [Workspace and Import](../workspace-and-import/README.md), [Multi-Agent Bosses](../multi-agent-bosses/README.md), and [Claude-Style Chat, Usage & Break](../claude-chat-usage-and-break/README.md).
Branch: `feature/provider-session-auto-sync`, created from `feature/embedded-desktop-apps` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-23).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Multi-provider read-only session and project catalogs | — | complete |
| US-02 | Automatic project & chat sync and multi-provider history catch-up | US-01 | complete |
| US-03 | Auto-synced projects sidebar, sync trigger, and project-picker chat creation | US-02 | pending |
| US-04 | Native 1-to-1 provider session creation and deduplication verification | US-02, US-03 | pending |

## Confirmed facts, decisions & scope boundaries

- **Confirmed facts (verified on this host, 2026-11-23)**:
  - `apps/server` uses Node `>=22.13` with built-in `node:sqlite` (`DatabaseSync`), Fastify 5, and Vitest; `apps/web` uses React 19 + Vite 8.
  - Today, `OfficeService` accepts only a single `SessionCatalog` wired to `ClaudeSessionCatalog` (`@anthropic-ai/claude-agent-sdk`) and supports only manual Claude import (`GET /api/imports/claude/sessions`, `POST /api/imports/claude`). Projects in the sidebar are derived solely by grouping existing `employees` by `workingDirectory`.
  - All four local provider CLIs are installed on `PATH` (`claude`, `agy`, `codex`, `opencode`) and maintain readable local stores on disk:
    - **Claude Code**: `~/.claude/projects/` via `@anthropic-ai/claude-agent-sdk` (`listSessions`, `getSessionMessages`).
    - **OpenCode**: `~/.local/share/opencode/opencode.db` (`project.worktree`, `session_v2`, `session_message`).
    - **Codex (ChatGPT)**: `~/.codex/state_5.sqlite` (`projects`, `project_roots`, `threads`) and `~/.codex/thread_history_1.sqlite` (`thread_items`).
    - **Google Antigravity**: `~/.gemini/antigravity/conversation_summaries.db` (`conversation_summaries` with `workspace_uris`, `parent_conversation_id`, `nesting_depth`) and `~/.gemini/antigravity/brain/<conversation_id>/.system_generated/logs/transcript.jsonl`.
  - Existing CLI/SDK adapters (`ClaudeAgentAdapter`, `CodexAgentAdapter`, `OpenCodeAgentAdapter`, `AntigravityAgentAdapter`) invoke each provider's native CLI/SDK directly and capture `providerSessionId`.
- **Decisions (agreed with the owner)**:
  - **Approach 1 (selected)**: Read-only multi-provider catalogs + automatic sync on startup, lightweight periodic refresh, and on-demand sync, with lazy/on-open history `catchUp()` across all four providers. New chats are created 1-to-1 in the chosen provider only, via its native CLI/SDK adapter (never writing directly into external provider SQLite/JSONL stores).
  - **Scope**: Local provider stores for Claude Code, Google Antigravity, Codex (ChatGPT), and OpenCode.
- **Assumptions (verified during implementation; pause for owner decision if one fails)**:
  - External SQLite databases (`opencode.db`, `state_5.sqlite`, `thread_history_1.sqlite`, `conversation_summaries.db`) can be opened with `{ readOnly: true }` while the native apps are running in WAL mode without lock failures.
  - Each native CLI adapter (`claude`, `codex exec`, `opencode run`, `agy -p`) persists sessions in the same local store read by its corresponding catalog so a newly created chat is visible in that provider's app and deduplicated on the next sync.
- **Exclusions**:
  - No scraping or unofficial API integration for cloud-only web chats (`claude.ai` or `chatgpt.com` browser conversations).
  - No broadcasting a single new chat into all four providers simultaneously (1-to-1 only).
  - No `fs.watch` real-time filesystem daemons on external SQLite WAL files (periodic + startup + on-demand sync instead).
  - No direct writes to external provider databases or transcript files.
  - Existing embedded desktop app routes/tabs are left untouched in this backlog.

Verification levels: Vitest unit and HTTP/WebSocket integration tests in `apps/server` and `apps/web` using temporary SQLite databases and fixture files (never touching the owner's real `~/.claude`, `~/.codex`, `~/.local/share/opencode`, or `~/.gemini/antigravity` during automated tests), `npm run typecheck`, `npm run build`, plus a live read-only smoke verification on this host for US-04.

---

## US-01 — Multi-provider read-only session and project catalogs

As the owner, I want Virtual Office to read existing local projects and chats from Claude, Google Antigravity, Codex, and OpenCode, so that all four providers can be discovered without manual export or import.

- `US-01 / AC-01`: Given the `SessionCatalog` port, when extended with optional `listProjects(): Promise<DiscoveredProject[]>` (returning `{ path, name, lastModified }`) and registered per `BossId` (`Partial<Record<BossId, SessionCatalog>>`), then `ClaudeSessionCatalog` continues to implement `list()` and `history()` and derives projects from non-empty session `cwd` values.
- `US-01 / AC-02`: Given an OpenCode SQLite database (`project`, `session_v2`, `session_message`), when `OpenCodeSessionCatalog` runs `listProjects()`, `list()`, and `history(sessionId)`, then it returns non-archived projects (`worktree`), non-archived top-level sessions (`parent_id IS NULL`), and ordered `user_text` / `agent_text` messages with stable `sourceUuid` values without mutating the database.
- `US-01 / AC-03`: Given Codex SQLite databases (`state_5.sqlite` and `thread_history_1.sqlite`), when `CodexSessionCatalog` runs `listProjects()`, `list()`, and `history(sessionId)`, then it returns `project_roots` paths, non-archived top-level threads (excluding subagent threads whose `source` indicates a subagent), and ordered `userMessage` / `agentMessage` / tool items with stable `sourceUuid` values without mutating the databases.
- `US-01 / AC-04`: Given Antigravity's `conversation_summaries.db` and `brain/<id>/.system_generated/logs/transcript.jsonl`, when `AntigravitySessionCatalog` runs `listProjects()`, `list()`, and `history(sessionId)`, then it returns top-level conversations (`parent_conversation_id` empty/null and `nesting_depth = 0`) with workspace paths extracted from `workspace_uris` and ordered `USER_INPUT` (`USER_EXPLICIT`) / `PLANNER_RESPONSE` messages with stable `sourceUuid` values.
- `US-01 / AC-05`: Given a missing, empty, or unreadable provider database/directory for any of the four catalogs, when `listProjects()`, `list()`, or `history()` is called, then that catalog returns an empty array and never throws an unhandled error that blocks other providers.

### Verification mapping (US-01)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | `apps/server/test/agents/claude-session-catalog.test.ts` (project derivation & existing list/history tests) | Passed (2/2 tests, `tsc --noEmit` 0 errors) |
| `US-01 / AC-02` | `apps/server/test/agents/opencode-session-catalog.test.ts` (fixture SQLite read-only listProjects, list, history, archived/child filtering) | Passed (2/2 tests) |
| `US-01 / AC-03` | `apps/server/test/agents/codex-session-catalog.test.ts` (fixture SQLite read-only listProjects, list, history, subagent/archived filtering) | Passed (2/2 tests) |
| `US-01 / AC-04` | `apps/server/test/agents/antigravity-session-catalog.test.ts` (fixture summaries DB + transcript JSONL, workspace URI parsing, subagent filtering) | Passed (4/4 tests) |
| `US-01 / AC-05` | Missing/corrupt store test cases in each provider catalog test file | Passed (verified in all 4 catalog test files) |
| Regression: existing Claude import & session catalog consumers | `apps/server/test/` full suite (`npm run test -w apps/server`) | Passed (36/36 files, 267/267 tests) |

---

## US-02 — Automatic project & chat sync and multi-provider history catch-up

As the owner, I want Virtual Office to automatically sync discovered projects and chats on startup and on refresh, and catch up external messages when I open or continue a chat, so that I never have to import chats manually.

- `US-02 / AC-01`: Given `SqliteOfficeRepository`, when initialized or migrated, then a `projects` table (`path` primary key, `name`, `providers` JSON array, `last_seen_at`) is created without affecting existing `employees`, `messages`, or `approvals` rows, and `GET /api/state` includes the sorted `projects` list.
- `US-02 / AC-02`: Given configured provider catalogs, when `syncProviders()` runs (automatically on server startup, on the background sync interval when enabled, or via `POST /api/sync`), then discovered projects whose directories exist on disk are upserted into `projects`, and discovered non-archived sessions whose `cwd` exists on disk are auto-created as `idle` employees with `bossId`, `providerSessionId`, and `importedAt` set.
- `US-02 / AC-03`: Given a session whose `(bossId, providerSessionId)` already exists in `employees` (whether previously synced or created inside Virtual Office), when `syncProviders()` runs again, then no duplicate employee is created; if the provider's session title changed from an untitled/default value, metadata stays consistent without overwriting user-edited fields (`name`, `jobTitle`).
- `US-02 / AC-04`: Given a synced or resumed employee of **any** of the four providers (`claude`, `codex`, `opencode`, `gemini`), when `GET /api/employees/:id/messages` is requested or `sendMessage()` is called while the employee has no live turn running, then `catchUp()` fetches unseen messages from that employee's provider catalog and appends only messages whose `sourceUuid` is not yet stored.
- `US-02 / AC-05`: Given `POST /api/sync` completes (or startup/interval sync adds new projects or employees), then a WebSocket state update is broadcast to connected clients and `POST /api/sync` returns `{ projectsAdded, sessionsImported, skipped, errors }` per provider.

### Verification mapping (US-02)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01` | `apps/server/test/office/provider-auto-sync.test.ts` (projects table migration, upsert, idempotent reload) | Passed (`tsc --noEmit` 0 errors, test passed) |
| `US-02 / AC-02`, `US-02 / AC-03` | `apps/server/test/office/provider-auto-sync.test.ts` (startup sync, `POST /api/sync`, existing cwd filter, deduplication by `(bossId, providerSessionId)`, preserves custom `name`/`jobTitle`) | Passed |
| `US-02 / AC-04` | `apps/server/test/office/provider-auto-sync.test.ts` (on-open and pre-send `catchUp()` across all 4 providers with `sourceUuid` deduplication) | Passed |
| `US-02 / AC-05` | `apps/server/test/office/provider-auto-sync.test.ts` (`POST /api/sync` auth, response summary, WS broadcast) | Passed |
| Regression: existing Claude manual import endpoint & message delivery | `apps/server/test/` full suite (`npm run test -w apps/server`) | Passed (37/37 files, 271/271 tests) |

---

## US-03 — Auto-synced projects sidebar, sync trigger, and project-picker chat creation

As the owner, I want to see all auto-discovered projects and chats in the sidebar, refresh sync with one click, and create a new chat by picking an existing project instead of typing a path manually.

- `US-03 / AC-01`: Given `state.projects` from `GET /api/state` and WS updates, when the sidebar renders in `Projects` view, then every synced project appears as a project group (showing its discovered name/path and any chats inside it, including projects with zero chats yet), sorted deterministically.
- `US-03 / AC-02`: Given the workspace sidebar header, when the owner clicks the "Sync" button, then the client calls `POST /api/sync`, shows a loading indicator while syncing, updates the sidebar with newly discovered projects/chats, and surfaces any per-provider error inline without blocking the UI.
- `US-03 / AC-03`: Given the "New Chat / Task" modal (`NewTaskModal`), when opened (either globally or from a specific project group), then it offers a selector populated with auto-discovered projects (pre-selecting the active project when launched from a project group) plus an option to type a custom directory path, and lets the owner choose any available provider (`claude`, `codex`, `opencode`, `gemini`/Antigravity).
- `US-03 / AC-04`: Given an auto-synced employee whose message history has not been loaded yet, when the owner selects that employee in the workspace, then `GET /api/employees/:id/messages` triggers catch-up and displays the full conversation history cleanly.

### Verification mapping (US-03)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-03 / AC-01` | `apps/web/test/sidebar.test.ts` (merging `state.projects` with employees, empty projects included, deterministic ordering) | Pending |
| `US-03 / AC-02` | `apps/web/test/sync-ui.test.ts` (Sync button triggers `POST /api/sync`, loading state, error banner) | Pending |
| `US-03 / AC-03` | `apps/web/test/new-task-modal.test.ts` (discovered project picker, pre-selected project, custom path fallback, provider selector) | Pending |
| `US-03 / AC-04` | `apps/server/test/provider-auto-sync.test.ts` + `apps/web/test/` suite | Pending |
| Regression: existing sidebar Projects/Agents toggle & workspace view | `npm test` + `npm run typecheck` + `npm run build` | Pending |

---

## US-04 — Native 1-to-1 provider session creation and deduplication verification

As the owner, I want a new chat created in Virtual Office for a chosen provider to be persisted natively in that provider's own local store and never duplicated on sync, so that I can seamlessly see and continue the same chat in both Virtual Office and the provider's app.

- `US-04 / AC-01`: Given a new chat created via `POST /api/employees` for each available provider (`claude`, `codex`, `opencode`, `gemini`/Antigravity) with a valid `workingDirectory`, when the first turn completes and captures `providerSessionId`, then the session exists in that provider's native local store under the same `workingDirectory` and is returned by its catalog's `list()`.
- `US-04 / AC-02`: Given that newly created chat, when `POST /api/sync` runs immediately afterward, then `OfficeService` recognizes the existing `(bossId, providerSessionId)` employee and imports `0` duplicates.
- `US-04 / AC-03`: Given any adapter whose current CLI invocation fails to persist a discoverable session in its provider's local store (discovered during AC-01 verification), then its CLI flags/invocation are fixed with unit test coverage so all four providers satisfy AC-01 and AC-02.

### Verification mapping (US-04)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-04 / AC-01`, `US-04 / AC-02` | `apps/server/test/provider-create-sync-dedupe.test.ts` (automated round-trip with adapter + catalog + `syncProviders()` proving 0 duplicates) | Pending |
| `US-04 / AC-01` (live host check), `US-04 / AC-03` | Live smoke verification on this host checking created session discoverability in Claude, Codex, OpenCode, and Antigravity stores (recorded with observed output) | Pending |
| Regression: all server & web tests and build | `npm test`, `npm run typecheck`, `npm run build` | Pending |

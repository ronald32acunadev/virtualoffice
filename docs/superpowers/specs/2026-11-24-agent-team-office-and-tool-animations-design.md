# Agent Team 3D Office & Tool/MCP Animations Design

**Date:** 2026-11-24
**Status:** Approved

## Intent & Why

Virtual Office currently models every chat/session as an `Employee` with its own person name, species, job title, and 3D desk (`apps/server/src/office/domain/types.ts`, `apps/web/src/scene/OfficeScene.tsx`). Opening 10 conversations creates 10 characters in the 3D office, even when they are all conversations with the same agent. Additionally, 3D character animations (`apps/web/src/scene/Character.tsx`) only react to coarse `EmployeeStatus` (`working`, `idle`, `waiting_approval`, etc.) and do not reflect what tool the agent is actually executing.

The user wants to build and see a **team of agents** in the 3D office — not a room full of chats:
- **Agents** are the people in the 3D office (each with a persistent person name, species/avatar, job title, provider/boss, and optional provider specialist role such as a Claude Code agent from `.claude/agents`).
- **Chats** remain in the workspace/sidebar for conversations, linked to an agent rather than inventing a new person for every chat.
- **Tool & MCP animations** bring the 3D office to life: searching/reading files uses a distinct animation from coding/typing, and calling an **MCP** tool visually looks like asking another agent (an MCP specialist/station) to fetch the requested information.

## Goals

- **First-Class Agent Team Model:** Introduce a persistent `Agent` entity (`id`, `bossId`, `name`, `species`, `role`, `jobTitle`, `createdAt`, `updatedAt`) backed by SQLite, so users can create, edit, and remove agents across any installed provider (`claude`, `codex`, `opencode`, `gemini`).
- **Chats Linked to Agents:** Preserve all existing chat/session capabilities (messages, approvals, terminal, provider session auto-sync, usage tracking) while linking each chat (`Employee` session record) to an `agentId`. Chats display their task/title as primary text and reference their assigned agent (name, avatar, role) instead of owning a separate person identity.
- **Zero-Loss Migration:** Automatically migrate existing SQLite `employees` rows on startup by creating/matching agents per `(boss_id, role)` and backfilling `employees.agent_id`, preserving all existing chat history, approvals, and synced sessions.
- **3D Office Renders Agents, Not Chats:** Render one seated 3D `Character` per `Agent` in its provider's department (`BossArea`). Each 3D agent derives its effective status and live activity from the chats currently assigned to it.
- **Team Management & Chat Creation UX:**
  - Provide a "Team / Agents" management flow where the owner can create a new agent (choosing provider/boss, name, species, job title, and optional provider role like Claude Code catalog agents), edit an agent's identity, or delete an agent.
  - Update "New Chat" (`NewTaskModal`) so the user picks an existing **Agent** from their team (with a quick "+ New agent" option), working directory, and task — without asking for a new person name/species per chat.
  - Clicking an agent in the 3D office focuses their active/latest chat in the workspace or opens an **Agent Card** showing their identity, current tool activity, recent chats, and a "New chat" action.
- **Tool-Driven 3D Animations & MCP Interaction:**
  - Classify live `tool_call` / `tool_result` activity into semantic animation states: `coding`, `searching_files`, `searching_web`, `mcp_request`, and `delegating`.
  - Add distinct 3D character poses/props and monitor visuals for `searching_files` (e.g., scanning/browsing files with a magnifying/document cue) and `searching_web`, distinct from `coding` (fast typing).
  - For `mcp_request` (`mcp__<server>__<tool>` or `<server>:<tool>`), render an interactive **MCP Agent** in the office (labeled with the active MCP server name, e.g., `MCP · engram`, `MCP · codegraph`): the requesting agent turns/gestures toward the MCP agent, an animated request signal/arc travels between them, and the MCP agent animates fetching/searching until `tool_result` completes.
  - For `delegating` (`Task` / `Agent` tool calls), show a distinct delegation gesture/signal toward a helper/colleague.
- **Theme Compatibility:** All new 3D animations, props, and the MCP Agent station work cleanly across all 4 world themes (`office`, `western`, `horror`, `metal`) and both `day` and `evening` lighting moods.

## Non-Goals

- Replacing or renaming the underlying provider CLI adapters (`claude`, `codex`, `opencode`, `gemini`) or changing how provider sessions sync from disk.
- Building a full file editor for `.claude/agents/*.md` files on disk (Virtual Office reads available roles from the provider catalog and stores its own team roster in SQLite).
- Full navmesh pathfinding / walking around obstacles between desks (animated turning, gesturing, request arcs/packets, and an MCP Agent station/desk are preferred for clarity and performance).
- Adding external `.glb`/`.gltf` 3D models or audio files; all 3D geometry remains procedural Three.js.

## Anti-Goals

- **Losing existing chats or breaking existing APIs unnecessarily:** Existing conversations, synced provider sessions, approvals, and terminals must continue working seamlessly.
- **Cluttering the 3D scene:** Idle MCP servers should not flood the floor with dozens of empty desks; use a single shared **MCP Hub / Liaison** station (or compact active MCP specialist slot) that activates and displays the queried server name(s) on demand.
- **Hiding urgent states behind tool animations:** `waiting_approval` (waving + amber glow + `!` marker), `failed` (red), and `on_break` (coffee) must always take visual precedence over tool animations.

## Constraints

- **Stack:** Node.js >=22.13 (`node:sqlite`), TypeScript, Express/WebSocket/SSE (`apps/server`), React + Three.js (`@react-three/fiber`, `@react-three/drei`) (`apps/web`), Vitest.
- **Spatial Contract:** Must respect `OFFICE_HALF_SIZE` (15), `AREA_CENTERS`, `bossDeskPosition`, `employeeDeskPosition`, and `overlapsAnyDesk` collision checks in `apps/web/src/scene/layout.ts` and `apps/web/src/scene/themes/`.
- **Event & State Architecture:** State updates flow over the existing `GET /api/state` snapshot + SSE `ServerEvent` stream (`apps/server/src/office/domain/types.ts`, `apps/web/src/state/officeReducer.ts`).
- **Backwards Compatibility:** Keep `employees` table and `/api/employees` endpoints working for chats (extending them with `agentId`) while adding `/api/agents` endpoints and `agents` in `StateSnapshot`.

## Approaches Considered

### Approach A — Separate First-Class `Agent` Team Entity from Chat Sessions + Live Tool/MCP Activity (Selected)

- Add an `agents` table and `Agent` domain entity (`id`, `bossId`, `name`, `species`, `role`, `jobTitle`, `createdAt`, `updatedAt`) plus `agent_id` foreign-reference column on `employees` (chats).
- Expose CRUD API (`/api/agents`), `agent_updated` / `agent_removed` SSE events, and `agents: Agent[]` in `StateSnapshot`.
- Track each chat's live tool activity (`activeTool`: `{ category, toolName, serverName?, label, startedAt } | null`) from `tool_call` / `tool_result` events so the 3D office always knows what each agent is doing even without loading every chat's full message history.
- Render `state.agents` in `OfficeScene.tsx`, aggregating status and active tool activity across each agent's chats, and add a procedural **MCP Agent Station** in the central/shared area of the office for MCP requests.
- **Tradeoffs:** Touches server domain, SQLite migration, HTTP/SSE API, and frontend state/UI/3D scene, but models the domain honestly so agents are truly people and chats are truly conversations.

### Approach B — UI-Only Grouping of `Employee` Chats in 3D

- Leave the database and API unchanged; group `state.employees` by `(bossId, role)` inside `OfficeScene.tsx` to render one character per group, deriving tool animations only from loaded `state.messages`.
- **Tradeoffs:** Smaller diff, but chats still have separate person names in the sidebar and DB, users cannot build/manage a persistent team of agents without starting dummy chats, and tool animations would fail for chats whose message history hasn't been fetched yet.

**Selection:** **Approach A**, because the user explicitly wants to build a team of agents where person names and 3D characters belong to agents rather than chats.

## Architecture & Decisions

### Decided by the User

- **3D Office = Agents, not Chats:** People sitting in the 3D office represent agents (not individual conversations).
- **Team Creation:** Users can create and manage a team of agents across providers (e.g., Claude Code agents and agents on other providers).
- **Chats Preserved:** Chats remain available in the workspace/sidebar, but person names/identities belong to agents.
- **Tool & MCP Animations:** Searching files and calling MCPs must trigger distinct 3D animations; MCP calls should visually look like asking another agent to fetch the information.

### Architect Calls (Proposed Defaults — User May Override)

1. **Data Model, Source of Truth & Migration (`apps/server`):**
   - New `Agent` type:
     ```ts
     export type Agent = {
       id: string;
       bossId: BossId;
       name: string;
       species: Species;
       role: string | null;
       jobTitle: string | null;
       createdAt: string;
       updatedAt: string;
     };
     ```
   - `Employee` (chat/session) adds `agentId: string | null` and `activity?: AgentActivity | null` (ephemeral live tool activity, not persisted to SQLite).
   - **Identity Source of Truth:** `Agent` is the single source of truth for `name`, `species`, `jobTitle`, and `role`.
     - `PATCH /api/agents/:id` updates the `Agent` and cascades `name`/`species`/`jobTitle` to its linked `employees` rows (emitting `agent_updated` and updated `employee_updated` events) so all views stay consistent.
     - `PATCH /api/employees/:id` (used by inline edits in `ConversationPane`) delegates `species`/`jobTitle` updates to the linked `Agent` when `agentId` is set, affecting all chats of that agent.
     - `Agent.bossId` is immutable after creation; `Agent.role` may be edited and applies to future chats started with that agent without mutating existing provider sessions.
   - **Role Sourcing & Validation:**
     - `TeamModal` loads selectable Claude Code roles via the existing catalog endpoint using the active/first known project folder (or a server-side home-directory fallback `GET /api/catalog?scope=global` so `~/.claude/agents` is always discoverable even before any project is registered), plus allows leaving role empty (`General`) or entering a custom role name for Claude. Non-Claude providers keep `role = null`.
     - When starting a chat for an `Agent` with a non-null `role`, `OfficeService` passes `agent.role` to the provider if valid in the target folder/global catalog; if the role is not found in that folder's catalog, it fails with a clear `validation_error` naming the missing role rather than silently switching personas.
   - **Backwards-Compatible `POST /api/employees`:**
     - When `agentId` is provided: bind the new chat to that `Agent` and inherit its `bossId`, `name`, `species`, `role`, and `jobTitle`.
     - When `agentId` is omitted (legacy callers & existing server tests): if no custom `name`/`species`/`jobTitle` is passed, reuse an existing `Agent` matching `(bossId, role ?? null)` (auto-creating a default General agent if none exists); if custom identity fields are passed, create a corresponding `Agent` and link the chat to it so existing hire/name/job-title contracts remain intact.
   - **Startup Migration:** Add `agents` table and nullable `employees.agent_id` column. For existing `employees` where `agent_id IS NULL`, group by `(boss_id, role ?? "")`, create one `Agent` per group (inheriting the earliest employee's `name`, `species`, `jobTitle`), and backfill `employees.agent_id`.
   - **Provider Auto-Sync:** Synced/imported sessions automatically bind to an existing `Agent` matching `(bossId, role ?? null)` (preferring the oldest General agent when `role === null`), or auto-create a default General agent for that `bossId` if none exists.
   - **Deletion Policy (`DELETE /api/agents/:id`):**
     - Block with `409` (`validation_error`) if the agent has any active chat (`starting`, `working`, or `waiting_approval`).
     - If the agent has only historical (`idle`/`stopped`/`failed`) chats, reassign them to another General agent (`role === null`) for the same `bossId`; if no other General agent exists for that `bossId`, set `employees.agent_id = NULL` (never deleting chat history).
2. **Live Tool Activity Tracking (`apps/server` + `apps/web`):**
   - Classify `toolName` on the server into `ToolActivityCategory = "coding" | "searching_files" | "searching_web" | "mcp_request" | "delegating"`:
     - `mcp_request`: matches `^mcp__([^_]+)__(.+)$` (extracting `serverName` and `tool`), or `<server>:<tool>` (Codex MCP format), or `toolName === "mcp"`.
     - `searching_files`: `Read`, `Grep`, `Glob`, `LS`, `Find`, `view_file`, `grep_search`, `find_by_name`, `list_dir`.
     - `searching_web`: `WebSearch`, `WebFetch`.
     - `delegating`: `Task`, `Agent`.
     - `coding`: `Edit`, `MultiEdit`, `Write`, `NotebookEdit`, `Bash`, `command_execution`, and any other working tool.
   - Maintain an in-memory map of active in-flight `toolUseId` calls per live chat in `OfficeService` (pushed on `tool_call`, popped on `tool_result`, cleared on `onTurnFinished` / `onFailed` / `stop`), publishing lightweight `employee_activity` (or including `activity` in `employee_updated`) SSE events so the 3D office updates immediately even if the chat pane isn't open.
3. **3D Agent Status & Activity Aggregation (`apps/web/src/scene/`):**
   - Status precedence for an `Agent` with multiple chats: `waiting_approval` > `working` > `starting` > `failed` > `on_break` > `idle` > `stopped` (0 chats → `idle`).
   - Active tool activity for an `Agent`: taken from the most recently updated `working` chat with an active tool (`mcp_request` prioritized visually if multiple chats run concurrently).
4. **3D MCP Agent & Tool Animations (`apps/web/src/scene/`):**
   - Place a shared **MCP Liaison Desk & Agent** in the central corridor of the office (at a collision-free coordinate, e.g. `[0, 0, -1.5]` or `[0, 0, 0.5]`, verified against `overlapsAnyDesk` and `BossArea` bounds).
   - When no agent is calling an MCP, the MCP Agent sits calmly on standby at the MCP hub.
   - When an agent triggers `mcp_request`:
     - The requesting agent rotates/leans toward the MCP hub and gestures/waves a request.
     - A glowing animated request arc / data packet travels from the requesting agent to the MCP Agent (and back).
     - The MCP Agent switches to an energetic "searching/fetching" animation with a floating badge showing the queried MCP server & tool (e.g., `📡 engram · mem_search`).
   - When an agent triggers `searching_files`:
     - Character leans slightly back/side-to-side scanning, raises a procedural magnifying glass / document prop, monitor displays a search-grid texture, and a subtle floating chip shows the tool (`🔍 Grep` / `📄 Read`).
   - When an agent triggers `searching_web`:
     - Distinct browsing pose + `🌐 Web` chip.
   - When an agent triggers `delegating`:
     - Character turns/gestures with a `🤝 Delegating` chip (and if a matching specialist agent exists in the same department, an animated link connects them).
5. **Sidebar, 3D Click Interaction & Workspace UI (`apps/web/src/views/`):**
   - Sidebar chat rows show **chat task/title** prominently, with the assigned **Agent's avatar + name** as a compact pill/subtitle (instead of treating the chat itself as a person).
   - Sidebar "Agents" tab groups chats by **Team Agent** (showing all created agents, even those with 0 chats yet, with a quick `+` button to start a chat with that agent).
   - Add a **Team / Agents** button in Sidebar (and Office HUD) opening `TeamModal` to list, create, edit, and delete agents across all providers.
   - **Clicking an `Agent` in `/office`:** Always opens the local **Agent Card** popover (displaying the agent's identity, live tool activity, list of its chats, and a `+ New chat` action). Selecting a chat from the card focuses it in an open `/workspace` tab via `windowChannel` (or opens `/workspace` in a new tab if none responds).

## What's Left to the Builder

- Exact SQLite migration implementation details and repository methods in `apps/server/src/persistence/sqlite/sqlite-office-repository.ts`.
- Exact Three.js mesh geometry, animation curves, and theme-adapted styling for the MCP Liaison Agent, request arc, and file-search prop across all 4 world themes.
- Exact CSS layout/styling for `TeamModal`, updated `NewTaskModal`, updated `Sidebar` chat rows, and the 3D `AgentCard` popover.
- Unit and integration test suite covering SQLite migration, `/api/agents` CRUD, chat-to-agent binding/sync, tool activity classification & lifecycle, 3D status/activity aggregation, and layout collision checks.

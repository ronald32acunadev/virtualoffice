# Remove Embedded Apps & Antigravity-Style Agentic Chat — User Stories

Builds on: [Chat 3D Office Theme & File Attachments](../chat-office-theme-and-attachments/README.md), [Claude-Style Chat, Usage & Break](../claude-chat-usage-and-break/README.md), and [Embedded Agent Terminal](../embedded-agent-terminal/README.md).
Branch: `feature/agentic-chat-and-remove-embedded-apps`, created from `feature/chat-office-theme-and-attachments` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-23).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Remove embedded desktop app streaming (`App` tab, noVNC, and Xvnc host) | — | pending |
| US-02 | Surface agent thinking/reasoning blocks as collapsible Thought cards | — | pending |
| US-03 | Antigravity-style grouped activity steps, file pills, and inline edit diffs | US-02 | pending |
| US-04 | Live turn status bar, smart auto-scroll, and agent reply ergonomics | US-03 | pending |

## Confirmed facts, decisions & scope boundaries

- **Confirmed facts (verified in codebase on 2026-11-23)**:
  - Embedded desktop app streaming consists of:
    - Web: `apps/web/src/views/AppPanel.tsx`, `apps/web/src/state/desktopApp.ts`, `apps/web/src/state/desktopApp.test.ts`, the `App` tab and `onOpenApp` wiring in `apps/web/src/views/ConversationPane.tsx`, desktop API methods in `apps/web/src/api/client.ts`, `.app-*` rules in `apps/web/src/styles.css`, and `@novnc/novnc` in `apps/web/package.json`.
    - Server: `apps/server/src/desktop/` (`desktop-app-host.ts`, `process-utils.ts`), `desktopApps` option and `/api/desktop/*` + `/ws/desktop/*` routes in `apps/server/src/http/app.ts`, `desktopProfilesRoot` / `DesktopAppHost` bootstrap in `apps/server/src/server.ts`, and tests (`apps/server/test/desktop/desktop-app-host.test.ts`, `apps/server/test/http/app-routes.test.ts`, `apps/server/test/http/desktop-ws.test.ts`).
  - Current chat message pipeline:
    - `MessageKind` is `"user_text" | "agent_text" | "tool_call" | "tool_result" | "system"` in both `apps/server/src/office/domain/types.ts` and `apps/web/src/api/types.ts`.
    - `apps/server/src/agents/claude/message-mapping.ts` currently ignores `block.type === "thinking"` blocks; CLI adapters (`codex`, `opencode`, `antigravity`, `gemini`) also drop reasoning/thought events instead of emitting them.
    - `apps/web/src/state/timeline.ts` folds `tool_result` into its matching `tool_call` and nests subagent `children`, while `apps/web/src/views/ToolRow.tsx` renders each tool call as a standalone `<details>` row with raw pretty-printed JSON input.
    - `apps/web/src/views/ConversationPane.tsx` unconditionally calls `scrollIntoView` on every message/delta and shows no live tool/thinking status indicator.
- **Scope boundaries & exclusions**:
  - **Removed**: Only the embedded desktop app streaming feature (`App` tab, noVNC viewer, Xvnc `DesktopAppHost`, `/api/desktop/*`, `/ws/desktop/*`, and `@novnc/novnc`).
  - **Kept intact**: The embedded `Terminal` tab (`TerminalPanel` / xterm.js), the external `"Open in…"` launcher (`OpenExternalMenu`), the 3D Office view, Day/Evening mood sync, and chat file attachments.
  - **No new npm dependencies**: All new chat UI components (step grouping, diff rendering, collapsible thoughts, smart auto-scroll) will be built with existing React 19, CSS variables, and TypeScript utilities.

Verification levels: Vitest unit and HTTP/WebSocket integration tests in `apps/server` and `apps/web`, `npm run typecheck`, `npm test`, and `npm run build`, plus manual visual check in Day and Evening moods.

---

## US-01 — Remove embedded desktop app streaming (`App` tab, noVNC, and Xvnc host)

As the owner, I want the embedded desktop app streaming (`App` tab, noVNC, and Xvnc host) completely removed from the web and server workspaces, so that the interface focuses on the native chat and terminal experience without unused VNC/X11 complexity.

- `US-01 / AC-01`: Given `ConversationPane`, when viewing an employee conversation, then only the `Chat` and `Terminal` tabs exist (no `App` tab, no `AppPanel` import, and no `onOpenApp` action in `Header` or `OpenExternalMenu`).
- `US-01 / AC-02`: Given `apps/web` and `apps/server`, when the cleanup is complete, then `AppPanel.tsx`, `desktopApp.ts`, `desktopApp.test.ts`, `apps/server/src/desktop/*`, `desktop-app-host.test.ts`, `app-routes.test.ts`, `desktop-ws.test.ts`, `.app-*` CSS rules, and `@novnc/novnc` from `apps/web/package.json` are removed, and `server.ts` no longer creates `DesktopAppHost` or `desktop-profiles`.
- `US-01 / AC-03`: Given the running Fastify server (`buildApp`), when a client requests `/api/desktop/*` or `/ws/desktop/*`, then those routes no longer exist (`404 not_found`), while `/api/employees/:id/launch-targets`, `/api/employees/:id/launch`, `/ws/terminal`, and all chat/attachment routes continue passing.

### Verification mapping (US-01)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`, `US-01 / AC-02` | `npm run typecheck`, `npm run build`, and search confirming zero references to `AppPanel`, `DesktopAppHost`, `@novnc/novnc`, or `/ws/desktop` | Pending |
| `US-01 / AC-03` + regression on `Terminal`, `OpenExternalMenu`, and chat routes | `npm test` (`apps/server` + `apps/web` full suites) | Pending |

---

## US-02 — Surface agent thinking/reasoning blocks as collapsible Thought cards

As the owner, I want to see when an agent is reasoning and optionally expand its thought process in a compact collapsible card (just like Antigravity), so that I can follow how the agent arrived at its decisions without cluttering the conversation.

- `US-02 / AC-01`: Given `MessageKind` on both server and web, `"thinking"` is a valid message kind that round-trips through `SqliteOfficeRepository` (`insertMessage` / `listMessages`) and WebSocket `message_added` events without breaking existing stored messages.
- `US-02 / AC-02`: Given assistant responses containing reasoning/thinking content:
  - **Claude (`mapAssistantContent`)**: maps `{ type: "thinking", thinking: string }` (non-empty) to `{ kind: "thinking", content: block.thinking }`.
  - **Codex (`createCodexParser`)**: maps `item.completed` / `item.updated` reasoning items (`item.type === "reasoning"` with non-empty `text`) to `{ kind: "thinking", content }`.
  - **OpenCode (`createOpenCodeParser`)**: maps reasoning parts (`part.type === "reasoning"` with non-empty `text`) to `{ kind: "thinking", content }`.
  - **Antigravity (`createAntigravityParser`)**: maps thought/reasoning text when emitted by `stream-json` events to `{ kind: "thinking", content }`.
- `US-02 / AC-03`: Given one or more `"thinking"` messages in the chat timeline, when rendered in `ConversationPane`, then each thought renders as a compact collapsible `<details className="thought-card">` labeled `"Thought"` (collapsed by default) with subtle muted styling in both Day and Evening office moods.

### Verification mapping (US-02)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01`, `US-02 / AC-02` | `apps/server/test/agents/thinking-mapping.test.ts` (Claude, Codex, OpenCode, Antigravity thinking mapping + SQLite persistence round-trip) | Pending |
| `US-02 / AC-03` | `apps/web/src/state/timeline.test.ts` (timeline preservation of `thinking` items alongside tool calls and text) + `npm run typecheck`, `npm run build` | Pending |

---

## US-03 — Antigravity-style grouped activity steps, file pills, and inline edit diffs

As the owner, I want consecutive agent tool calls and thoughts within a turn grouped into a clean, scannable Activity card with status indicators, touched file pills, and readable edit diffs, so that long agent runs look and feel like an Antigravity workspace instead of raw JSON logs.

- `US-03 / AC-01`: Given a chat timeline containing consecutive `tool_call` (and optional interleaved `thinking`) items between text messages, when `groupTimelineBlocks(items)` builds display blocks, then consecutive agent activity items are grouped into a single `activity_group` block with computed summary counts (e.g. `"4 steps · Read 2 files, Edited 1 file, Ran 1 command"`), aggregate status (`running` when any call has no result yet and employee is active, `error` if any tool result indicates error, else `done`), and a deduplicated list of touched file basenames.
- `US-03 / AC-02`: Given an `activity_group` block in `ConversationPane`, when rendered, then it displays a compact collapsible header showing the status icon, step summary, and touched file pills; expanding reveals each step with a category icon (`Read`, `Edit`, `Search`, `Command`, `Tool`), concise human label, and expandable detail view.
- `US-03 / AC-03`: Given a file-edit tool call (`Edit`, `edit_file`, `replace_file_content`, `Write`, `write_file`) with `old_string`/`new_string` (or `Target`/`Replacement` or `content`), when expanded in the activity panel, then it renders a structured inline diff/preview block (removed lines highlighted in red, added lines highlighted in green) instead of raw JSON; shell commands (`Bash`, `run_command`) render a clean command line + terminal output block.

### Verification mapping (US-03)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-03 / AC-01`, `US-03 / AC-03` | `apps/web/src/state/activityGroups.test.ts` (consecutive step grouping, summary label formatting, running/done/error status, deduplicated file pills, structured diff & command extraction) | Pending |
| `US-03 / AC-02` + Day/Evening contrast | `npm run test -w apps/web`, `npm run typecheck`, `npm run build`, and visual inspection in Day & Evening moods | Pending |

---

## US-04 — Live turn status bar, smart auto-scroll, and agent reply ergonomics

As the owner, I want clear live progress feedback while an agent is working, non-intrusive auto-scrolling with a quick jump-to-latest button, and one-click copy on agent replies, so that following active sessions feels smooth and responsive.

- `US-04 / AC-01`: Given an employee whose status is `starting` or `working`, when viewing their `Chat` tab, then a live status indicator renders at the bottom of the conversation showing what the agent is currently doing (e.g., `"Running <latest pending tool label>…"` if a tool call is in flight, `"Responding…"` while streaming text deltas, or `"Thinking…"` otherwise).
- `US-04 / AC-02`: Given the conversation scroll container, when the user is within the near-bottom threshold (`<= 80px` from bottom), new messages and deltas auto-scroll smoothly to the bottom; when the user has scrolled up to read earlier messages, incoming updates do NOT hijack the scroll position and a `"Jump to latest ↓"` pill appears until clicked or scrolled back to bottom.
- `US-04 / AC-03`: Given any completed `agent_text` bubble, when hovered or focused, then a `"Copy"` button copies the raw markdown reply to the clipboard and briefly confirms `"Copied"`; when a conversation has no messages yet, clickable starter prompt chips let the owner populate the composer in one click.

### Verification mapping (US-04)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-04 / AC-01`, `US-04 / AC-02` | `apps/web/src/state/chatErgonomics.test.ts` (live status derivation for pending tool / streaming / thinking / idle, near-bottom auto-scroll decision helper) | Pending |
| `US-04 / AC-03` + full suite regression | `npm run typecheck`, `npm test`, `npm run build`, plus manual browser check | Pending |

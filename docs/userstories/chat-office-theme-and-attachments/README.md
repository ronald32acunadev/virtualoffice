# Chat 3D Office Theme & File Attachments — User Stories

Builds on: [3D Office Redesign](../office-3d-redesign/README.md), [Claude-Style Chat, Usage & Break](../claude-chat-usage-and-break/README.md), [Embedded Agent Terminal](../embedded-agent-terminal/README.md), and [Provider Session & Project Auto-Sync](../provider-session-auto-sync/README.md).
Branch: `feature/chat-office-theme-and-attachments`, created from `feature/provider-session-auto-sync` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-23).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Shared 3D Office Day/Evening mood sync and workspace toggle | — | complete |
| US-02 | 3D Office Day/Evening color palette and department accents for the chat UI | US-01 | complete |
| US-03 | Server-side chat attachment storage, secure serving, and multi-provider delivery | — | in progress |
| US-04 | Chat composer file/photo attachment UI, paste/drop, and message previews | US-02, US-03 | pending |

## Confirmed facts, decisions & scope boundaries

- **Confirmed facts (verified in codebase on 2026-11-23)**:
  - `apps/web/src/scene/officeTheme.ts` defines `LightingMood = "day" | "evening"` and `MOOD_PALETTES`:
    - **Day**: warm cream walls (`#f2ece1`, `#ede5d8`, `#f7f2ea`), oak wood floor/trim (`#d8b589`, `#c49a6c`, `#b98e5e`, `#eee6da`), soft daylight (`#cfe6f8`, `#eff8ff`), terracotta (`#c46d49`) and plant greens (`#5bbf7a`).
    - **Evening**: twilight slate-navy (`#242e48`, `#2a3654`, `#364a78`), warm wood (`#9e774e`, `#4d3b2b`), warm walls (`#ddd2c2`), and amber desk-lamp glow (`#ffbe6b`, `#ffb86c`).
  - `apps/web/src/scene/layout.ts` defines `AREA_COLORS` (`claude: #d9774a`, `codex: #4aa3d9`, `opencode: #5bbf7a`, `gemini: #9a7ad9`) and `STATUS_COLORS`.
  - `apps/web/src/scene/camera.ts` persists the lighting mood in `localStorage` under `virtualoffice:mood` (`readSavedMood`, `saveMood`), currently consumed only by `OfficeView.tsx`.
  - `apps/web/src/state/windowChannel.ts` connects the 3D Office and Chat Workspace windows via `BroadcastChannel("virtual-office")`.
  - `apps/web/src/styles.css` currently uses cold neutral dark grays (`#212121`, `#171717`, `#2a2a2a`, `#2f2f2f`, `#4f8cff`) with many hardcoded hex colors, and `apps/web/src/views/TerminalPanel.tsx` hardcodes xterm.js colors (`#171717`, `#ececec`, `#4f8cff`).
  - `apps/server/src/http/app.ts` uses Fastify 5 with JSON parsing (no multipart plugin installed) and token authentication via `Authorization: Bearer <token>` on `/api/*` and `?token=` on `/ws*`.
  - `apps/server/src/persistence/sqlite/sqlite-office-repository.ts` uses Node built-in `node:sqlite` (`DatabaseSync`) with an idempotent `ADDED_COLUMNS` migration array.
  - Verified provider attachment capabilities on this host:
    - **Claude (`@anthropic-ai/claude-agent-sdk`)**: `SDKUserMessage.message.content` accepts Anthropic content block arrays (`text`, `image` with base64 source, etc.).
    - **Codex (`codex exec` and `codex exec resume`)**: supports `-i, --image <FILE>` for image attachments.
    - **OpenCode (`opencode run`)**: supports `--file <path>` (`-f`) for attaching files to messages.
    - **Antigravity (`agy`)**: supports `--add-dir <dir>` to grant workspace access to attached files referenced in the prompt; **Gemini CLI (`gemini`)**: reads referenced local file paths in the prompt.
- **Decisions (confirmed with the owner)**:
  - **Theme mode**: Sync both **Day** (warm light) and **Evening** (cozy dark) palettes with the 3D Office, persisted via `virtualoffice:mood`, synchronized live across windows, and toggleable from both the 3D Office HUD and the Chat Workspace sidebar.
  - **Attachments**: Support attaching images (e.g., photos/screenshots) and general files in the chat interface, delivered to the active agent and displayed cleanly in conversation history.
- **Assumptions**:
  - Keeping attachment upload over authenticated JSON (`base64` payload) with an increased Fastify `bodyLimit` avoids introducing new third-party multipart dependencies while staying fast for local desktop usage (up to 10 MB per file, up to 5 files per message).
  - Serving image thumbnails directly via `<img>` requires accepting `?token=` on `GET /api/attachments/:id` (using the same constant-time `tokensMatch` check used for WebSockets) in addition to `Authorization: Bearer`.
- **Exclusions**:
  - No changes to the 3D scene geometry, camera controls, or 3D lighting math itself.
  - No cloud object storage, external CDN, or image editing/cropping tool.
  - No automatic re-sync/upload of Virtual Office attachments back into external provider SQLite databases.
  - No new npm dependencies unless strictly required (none needed for this backlog).

Verification levels: Vitest unit and HTTP/WebSocket integration tests in `apps/server` and `apps/web` (using isolated temp directories and `:memory:` SQLite databases), `npm run typecheck`, `npm run build`, plus a manual visual check in both Day and Evening moods.

---

## US-01 — Shared 3D Office Day/Evening mood sync and workspace toggle

As the owner, I want the Chat Workspace and 3D Office to share the same Day/Evening lighting mood and stay in sync when I switch it from either view, so that both windows always feel like one cohesive workspace.

- `US-01 / AC-01`: Given a saved mood (`day` or `evening`) in `localStorage` under `virtualoffice:mood` (or default `day` when absent/invalid/unavailable), when either `WorkspaceView` or `OfficeView` mounts, then `document.documentElement.dataset.officeMood` is set to that mood and the view renders with it.
- `US-01 / AC-02`: Given the Chat Workspace sidebar, when the owner clicks the Day/Evening theme toggle button, then the mood switches between `day` and `evening`, persists to `virtualoffice:mood`, updates `document.documentElement.dataset.officeMood`, and broadcasts a `mood_changed` message on the shared `BroadcastChannel`.
- `US-01 / AC-03`: Given both the 3D Office and Chat Workspace open simultaneously, when the mood is toggled in either window (via `BroadcastChannel` `mood_changed` or browser `storage` event for `virtualoffice:mood`), then the other window updates its active mood immediately without reloading.
- `US-01 / AC-04`: Given an invalid or unrelated message on `BroadcastChannel` or a restricted `localStorage` environment that throws, when reading, writing, or syncing mood, then invalid messages are ignored and no unhandled exception is thrown.

### Verification mapping (US-01)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`, `US-01 / AC-04` | `apps/web/src/state/officeMood.test.ts` (initial read, invalid/throwing storage fallback, root `data-office-mood` application) | Passed (`6/6` tests in `officeMood.test.ts`; `npm run test -w apps/web` 115/115, `npm run typecheck -w apps/web` clean) |
| `US-01 / AC-02`, `US-01 / AC-03` | `apps/web/src/state/windowChannel.test.ts` (`mood_changed` parsing & broadcast) + `apps/web/src/state/officeMood.test.ts` (cross-window channel & storage sync) | Passed (`4/4` tests in `windowChannel.test.ts`, `6/6` tests in `officeMood.test.ts`) |
| Regression: existing office-to-workspace `focus_employee` & `ping`/`pong` window channel behavior | `apps/web/src/state/windowChannel.test.ts` and `apps/web/src/scene/camera.test.ts` | Passed (`4/4` and `2/2` tests) |

---

## US-02 — 3D Office Day/Evening color palette and department accents for the chat UI

As the owner, I want the chat interface's colors to mirror the 3D Office's warm Day and cozy Evening palettes along with each boss's department color, so that moving between the 3D office and chat feels visually unified and readable.

- `US-02 / AC-01`: Given `data-office-mood="day"`, when the chat workspace renders, then its CSS variables apply the 3D Office Day palette (warm cream/ivory main canvas derived from `#f2ece1`/`#f7f2ea`, warm linen/oak sidebar and cards derived from `#ede5d8`/`#eee6da`/`#d8b589`, oak wood borders `#c49a6c`-family, dark espresso readable text, and warm terracotta/oak accents) with `color-scheme: light` and readable contrast across sidebar, header, message bubbles, markdown tables, code blocks, composer, tabs, popovers, and modals.
- `US-02 / AC-02`: Given `data-office-mood="evening"`, when the chat workspace renders, then its CSS variables apply the 3D Office Evening palette (deep twilight slate surfaces derived from `#242e48`/`#2a3654`/`#1d263b`, warm wood-tinted borders derived from `#9e774e`, warm off-white text derived from `#ddd2c2`/`#f3ece2`, and golden lamp-glow amber accents derived from `#ffbe6b`) with `color-scheme: dark` and no leftover cold neutral `#212121`/`#171717` surfaces in the chat workspace.
- `US-02 / AC-03`: Given an employee belonging to one of the four bosses (`claude`, `codex`, `opencode`, `gemini`), when rendered in the conversation header/composer boss pill and sidebar agent group, then a subtle department accent derived from the 3D Office's `AREA_COLORS` (`#d9774a`, `#4aa3d9`, `#5bbf7a`, `#9a7ad9`) visually identifies that department without hurting text contrast in either mood.
- `US-02 / AC-04`: Given the embedded Terminal tab (`TerminalPanel`), when opened or when the active mood changes between Day and Evening, then the xterm.js terminal palette updates to match the active office mood (warm paper/ink in Day, cozy twilight slate in Evening) instead of hardcoded `#171717` / `#4f8cff`.
- `US-02 / AC-05`: Given the 3D Office HUD overlays (`.office-hud`, `.boss-label`, `.employee-card`, `.speech-bubble`), when Day or Evening mood is active, then the 3D Office view overlays remain legible and visually intact without regressions.

### Verification mapping (US-02)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01`, `US-02 / AC-02`, `US-02 / AC-03` | `apps/web/src/state/officeMood.test.ts` (theme palette & boss accent mapping derived from `MOOD_PALETTES` and `AREA_COLORS`, CSS token consistency checks) | Passed (`7/7` tests in `officeMood.test.ts`; `npm run test -w apps/web` 116/116) |
| `US-02 / AC-04` | `apps/web/src/state/officeMood.test.ts` (xterm theme generator for `day` and `evening`) | Passed (`getTerminalTheme` verified for both moods, live update wired in `TerminalPanel.tsx`) |
| `US-02 / AC-05` + visual contrast check | Manual visual check in browser across Day and Evening modes in both `/workspace` and `/office`, plus `npm run build` and `npm run test -w apps/web` | Automated: `npm run typecheck -w apps/web`, `npm run build -w apps/web`, `npm run test -w apps/web` (116/116) passed; manual visual check pending owner/browser run |

---

## US-03 — Server-side chat attachment storage, secure serving, and multi-provider delivery

As the owner, I want the backend to store files and images attached to chat messages, serve them safely back to the UI, and pass them to the selected AI provider, so that agents can inspect photos and files I share and history persists across reloads.

- `US-03 / AC-01`: Given `SqliteOfficeRepository`, when initialized or migrating an existing database, then a nullable `attachments` JSON column is added to `messages` via the idempotent migration path without altering existing rows, and `listMessages` / `insertMessage` round-trip `attachments` metadata (`id`, `name`, `mimeType`, `size`, `url`).
- `US-03 / AC-02`: Given `POST /api/employees/:id/messages` with `{ text, attachments }`, when `attachments` contains 1 to 5 valid files (each up to 10 MB decoded, base64-encoded) with optional `text`, then the server writes each file under `<attachmentsDir>/<employeeId>/<attachmentId>-<sanitizedName>`, persists the `user_text` message with its attachments, broadcasts `message_added`, and returns `202` with the created message. Sending both empty `text` and empty/missing `attachments`, exceeding 5 files, exceeding 10 MB per file, or supplying invalid base64/filename returns `400 validation_error` without writing partial files or persisting a message.
- `US-03 / AC-03`: Given a persisted attachment ID, when an authenticated client calls `GET /api/attachments/:id` (with `Authorization: Bearer <token>` or `?token=<token>`), then the server streams the stored file with `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` only for safe raster images (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) and `Content-Disposition: attachment` for all other MIME types (including `image/svg+xml` and `text/html`). Missing/invalid tokens return `401`, and unknown IDs or path traversal attempts return `404`.
- `US-03 / AC-04`: Given a message sent with attachments (either starting/resuming a session or continuing a live session), when dispatched to the employee's `AgentAdapter`, then:
  - **Claude (`ClaudeAgentAdapter`)**: sends native Anthropic base64 `image` content blocks for safe raster images (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) alongside a `text` block (referencing attached file paths for non-images and context).
  - **Codex (`CodexAgentAdapter`)**: passes `-i <storedPath>` for image attachments (both new `exec` and `exec resume`) and includes non-image file paths in the prompt text.
  - **OpenCode (`OpenCodeAgentAdapter`)**: passes `--file <storedPath>` for each attachment (both new and `--session` resume).
  - **Antigravity (`AntigravityAgentAdapter`) / Gemini (`GeminiAgentAdapter`)**: passes `--add-dir <attachmentsEmployeeDir>` on `agy` and appends attached file path references to the prompt text.

### Verification mapping (US-03)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-03 / AC-01` | `apps/server/test/office/chat-attachments.test.ts` (SQLite migration & attachment metadata round-trip) | Pending |
| `US-03 / AC-02`, `US-03 / AC-03` | `apps/server/test/office/chat-attachments.test.ts` (HTTP upload validation, attachment-only send, file persistence, `GET /api/attachments/:id` auth, `nosniff`, inline vs download disposition for raster vs SVG/HTML, 401/404 rejection) | Pending |
| `US-03 / AC-04` | `apps/server/test/agents/adapter-attachments.test.ts` (Claude image blocks + non-image paths, Codex `-i` on exec & resume, OpenCode `--file`, Antigravity `--add-dir` + prompt paths, Gemini prompt paths) | Pending |
| Regression: existing text-only `POST /api/employees/:id/messages`, security middleware, and provider adapters | `npm run test -w apps/server` full suite | Pending |

---

## US-04 — Chat composer file/photo attachment UI, paste/drop, and message previews

As the owner, I want to attach photos and files directly in the chat composer (by clicking an attach button, pasting a screenshot, or dragging and dropping) and view them in the conversation history, so that sharing visuals or documents with an agent is effortless.

- `US-04 / AC-01`: Given the chat composer in `ConversationPane`, when the owner clicks the attach file button, drops files onto the composer card, or pastes an image/file from the clipboard into the composer textarea, then the selected files are added to a pending attachment strip above the input showing image thumbnails for images, filename + formatted size for all files, and a remove (`×`) button per item.
- `US-04 / AC-02`: Given pending attachments in the composer, when the owner adds a file exceeding the 10 MB limit or tries to attach more than 5 files, then an inline error message explains the limit without crashing or corrupting already-staged valid attachments; while valid attachments are staged, the Send button is enabled even if the text input is empty.
- `US-04 / AC-03`: Given staged attachments (with or without text), when the owner submits the message, then `api.sendMessage` sends the payload to `POST /api/employees/:id/messages`, clears the text and staged attachments (and revokes local preview object URLs) on success, or preserves the staged attachments and shows an inline error on failure.
- `US-04 / AC-04`: Given a user message in the conversation timeline that includes attachments (either newly sent via WebSocket or loaded via `GET /api/employees/:id/messages`), when `TextBubble` renders it, then raster image attachments display inline thumbnails authenticated with the session token (clicking opens a full-size preview modal/lightbox with download link) and non-image attachments display clickable file chips (name + size) that download the file.

### Verification mapping (US-04)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-04 / AC-01`, `US-04 / AC-02` | `apps/web/src/state/attachments.test.ts` (staging validation: count/size limits, MIME image detection, size formatting, base64 encoding helper, send-enabled state) | Pending |
| `US-04 / AC-03`, `US-04 / AC-04` | `apps/web/src/state/attachments.test.ts` (authenticated attachment URL builder, message payload serialization) + manual end-to-end check uploading a photo and a text file in the chat UI and reloading | Pending |
| Regression: existing slash commands, keyboard Enter-to-send, break/terminal disabled composer states, and full suite | `npm run typecheck`, `npm test`, `npm run build` | Pending |

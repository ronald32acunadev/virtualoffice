# Feature Backlog: Agent Model Selection, Execution Mode, and Audio Messages

- **Feature:** `agent-model-mode-and-audio`
- **Branch:** `feature/agent-model-mode-and-audio`
- **Execution mode:** Pending user selection for revised scope (`US-05`)
- **Status:** Revision pending approval (`US-01`..`US-04` complete; `US-05` pending)

## Scope & Confirmed Facts

- **Confirmed provider CLI flags on this host:**
  - `claude` (`@anthropic-ai/claude-agent-sdk`): `options.model`, `options.permissionMode` (`"default"` vs `"bypassPermissions"`).
  - `codex`: `-m <model>`, `--dangerously-bypass-approvals-and-sandbox` (Turbo).
  - `opencode`: `-m <model>`, `--auto` (Turbo); `opencode models` lists available models.
  - `agy` (Antigravity / `gemini` slot when `agy` is installed): `--model <model>`, `--dangerously-skip-permissions` (Turbo); `agy models` lists available models.
  - `gemini` (Gemini CLI fallback): `-m <model>`, `--yolo` (Turbo).
- **Confirmed attachment infrastructure:** `apps/server/src/office/application/attachments.ts` already validates, stores, and serves base64 attachments up to 10 MB per file (up to 5 per message) via `GET /api/attachments/:id`, and passes stored file paths to every adapter.
- **Assumptions (overridable before implementation):**
  - Default execution mode for existing and new agents/chats is `request_review` (safe default requiring approval).
  - `model` defaults to `null` (provider's own default model) until the user picks one.
  - Changing `model` or `mode` on an existing agent cascades as the default to its chats; changing them from a chat composer updates the linked agent (or the chat directly when unassigned) and takes effect immediately on the next session turn (restarting the live session if needed for SDK/CLI flags to apply).
  - Browser voice recording uses standard `MediaRecorder` (`audio/webm` / `audio/ogg` fallback) with optional browser `SpeechRecognition` transcript when supported, gracefully degrading to attaching the recorded audio file alone when speech recognition is unavailable.
- **Exclusions:**
  - Server-side Whisper/ASR binary installation or external paid transcription APIs.
  - Real-time bidirectional voice streaming (WebRTC / Live API).

---

## Stories

### US-01: Agent & Chat Model and Execution Mode Persistence & Model Catalog API
- **Status:** `complete` (`47c094f`)
- **Dependencies:** None
- **Story:** As a Virtual Office user, I want each agent (and chat) to persist a chosen AI model and execution mode (`request_review` or `turbo`) and expose available models per provider, so that my selections survive restarts and work across all providers.
- **Acceptance Criteria:**
  - `US-01 / AC-01`: SQLite migration idempotently adds nullable `model TEXT` and `mode TEXT` columns to both `agents` and `employees` tables without losing existing rows; `mode` defaults to `"request_review"` when null/unset.
  - `US-01 / AC-02`: `POST /api/agents`, `PATCH /api/agents/:id`, `POST /api/employees`, and `PATCH /api/employees/:id` validate and persist `model` (trimmed string up to 120 chars or `null`) and `mode` (`"request_review" | "turbo"`), rejecting invalid values with HTTP `400` (`validation_error`) and leaving stored state unchanged.
  - `US-01 / AC-03`: Updating `model` or `mode` on an `Agent` cascades to linked `employees` rows and publishes `agent_updated` and `employee_updated` events; updating `model` or `mode` via `PATCH /api/employees/:id` delegates to the linked `Agent` when `agentId` is set.
  - `US-01 / AC-04`: `GET /api/models` returns the available model options grouped by `BossId`, combining dynamic discovery (e.g., `agy models` / `opencode models` with safe timeout and fallback) and curated defaults for `claude`, `codex`, `opencode`, and `gemini`, without crashing when a CLI is absent or fails.
- **Verification Mapping:**

| Story / criterion or regression risk | Test file and test name / procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | `apps/server/test/persistence/migration.test.ts` — `adds agents table and nullable agent_id column, supports Agent CRUD, and reassigns chats` | Passed (`vitest`, 6/6) |
| `US-01 / AC-02`, `US-01 / AC-03` | `apps/server/test/office/agents.test.ts` — `US-01 / AC-02, AC-03: persists and cascades agent model and mode and rejects invalid values` | Passed (`vitest`, 5/5) |
| `US-01 / AC-04` | `apps/server/test/office/provider-models.test.ts` — `US-01 / AC-04: provider-models` | Passed (`vitest`, 3/3) |
| Regression: existing `PATCH /api/employees/:id` & `POST /api/agents` | `apps/server/test/office/names.test.ts`, `apps/server/test/office/job-title.test.ts`, `apps/server/test/http/api.test.ts` | Passed (`npm run test -w apps/server`, 334/334) |

---

### US-02: Apply Selected Model and Execution Mode in All Provider Adapters
- **Status:** `complete` (`16febf9`)
- **Dependencies:** `US-01`
- **Story:** As a Virtual Office user, I want the server adapters to pass my agent's chosen model and execution mode (`request_review` vs `turbo`) to Claude, Codex, OpenCode, Antigravity, and Gemini CLI, so that changing the dropdown actually controls how the underlying agent runs.
- **Acceptance Criteria:**
  - `US-02 / AC-01`: `ClaudeAgentAdapter` passes `model: employee.model` when set, sets `permissionMode: "bypassPermissions"` (with `allowDangerouslySkipPermissions: true`) when `employee.mode === "turbo"`, and keeps `permissionMode: "default"` with `canUseTool` approval prompts when `employee.mode === "request_review"`.
  - `US-02 / AC-02`: `CodexAgentAdapter` includes `-m <model>` when `employee.model` is set and `--dangerously-bypass-approvals-and-sandbox` when `employee.mode === "turbo"` (omitting both when unset / `request_review`).
  - `US-02 / AC-03`: `OpenCodeAgentAdapter` includes `-m <model>` when set and `--auto` when `employee.mode === "turbo"`.
  - `US-02 / AC-04`: `AntigravityAgentAdapter` includes `--model <model>` when set and `--dangerously-skip-permissions` when `employee.mode === "turbo"`; `GeminiAgentAdapter` includes `-m <model>` when set and `--yolo` when `employee.mode === "turbo"`.
- **Verification Mapping:**

| Story / criterion or regression risk | Test file and test name / procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01` | `apps/server/test/agents/adapter-model-mode.test.ts` — `ClaudeAgentAdapter passes model and turbo permission flags to the SDK` | Passed (`vitest`, 6/6) |
| `US-02 / AC-02` | `apps/server/test/agents/adapter-model-mode.test.ts` — `CodexAgentAdapter passes model and turbo flags` | Passed (`vitest`, 6/6) |
| `US-02 / AC-03` | `apps/server/test/agents/adapter-model-mode.test.ts` — `OpenCodeAgentAdapter passes model and turbo flags` | Passed (`vitest`, 6/6) |
| `US-02 / AC-04` | `apps/server/test/agents/adapter-model-mode.test.ts` — `AntigravityAgentAdapter` & `GeminiAgentAdapter` | Passed (`vitest`, 6/6) |
| Regression: default mode behavior | Full `npm run test -w apps/server` suite | Passed (44/44 files, 334/334 tests) |

---

### US-03: Model & Mode Selectors in Chat Composer Footer and `TeamModal`
- **Status:** `complete` (`b64d1ef`)
- **Dependencies:** `US-01`, `US-02`
- **Story:** As a Virtual Office user, I want dropdown selectors for Model and Agent Mode (`Request Review` / `Turbo`) right in the chat composer footer and inside `TeamModal`, so that I can configure any agent's model and autonomy level cleanly without leaving the conversation.
- **Acceptance Criteria:**
  - `US-03 / AC-01`: `TeamModal` displays Model (dropdown of provider models + default/custom option) and Execution Mode (`Request Review` / `Turbo`) controls when creating or editing an agent, and shows the active model/mode badges on each agent row.
  - `US-03 / AC-02`: The `ConversationPane` composer footer includes compact popover/dropdown selectors for **Model** (provider's models) and **Mode** (`Request Review — Every command requires approval` vs `Turbo — Run all commands without restrictions`), persisted immediately via `updateAgent` / `updateEmployee`.
  - `US-03 / AC-03`: Switching provider in `TeamModal` resets/updates the available model list to match the selected provider.
  - `US-03 / AC-04`: Pure state helpers validate/format model labels and mode metadata (`request_review` / `turbo`) with unit tests.
- **Verification Mapping:**

| Story / criterion or regression risk | Test file and test name / procedure | Observed result and evidence |
| --- | --- | --- |
| `US-03 / AC-01`, `US-03 / AC-02`, `US-03 / AC-03`, `US-03 / AC-04` | `apps/web/src/state/agentConfig.test.ts` + `npm run typecheck -w apps/web` + `npm run build` | Passed (`vitest` 3/3, typecheck 0 errors, Vite build OK) |
| Regression: existing composer & sidebar | `npm run test -w apps/web` | Passed (30/30 files, 209/209 tests) |

---

### US-04: Voice Recording, Inline Audio Playback & Audio Attachments in Chat
- **Status:** `complete`
- **Dependencies:** None (can be verified independently of `US-02`/`US-03`)
- **Story:** As a Virtual Office user, I want to record a voice note or attach an audio file in the chat composer and play audio messages inline in the conversation, so that I can send spoken instructions to my agents.
- **Acceptance Criteria:**
  - `US-04 / AC-01`: Server `attachments.ts` and `GET /api/attachments/:id` recognize safe audio MIME types (`audio/webm`, `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/aac`, `audio/flac`) and serve them with `Content-Disposition: inline` and `X-Content-Type-Options: nosniff` so browsers can stream/play them directly.
  - `US-04 / AC-02`: `ConversationPane` composer provides a microphone record button (`🎤`) using `MediaRecorder` with live recording indicator/timer, stop-to-stage, and cancel controls, plus graceful error feedback when microphone permission is denied or `MediaRecorder` is unavailable; staged audio clips preview with an inline `<audio controls>` player before sending.
  - `US-04 / AC-03`: When browser `SpeechRecognition` is available during recording, live transcription populates/appends to the composer text (editable before sending); when unavailable, the user can still send the audio attachment on its own without text.
  - `US-04 / AC-04`: Sent audio attachments render with an inline `<audio controls>` player inside the chat message bubble (`ToolRow.tsx` / `TextBubble`).
- **Verification Mapping:**

| Story / criterion or regression risk | Test file and test name / procedure | Observed result and evidence |
| --- | --- | --- |
| `US-04 / AC-01` | `apps/server/test/office/chat-attachments.test.ts` — `US-04 / AC-01: serves safe audio attachments inline with nosniff header` | Passed (`vitest`, 11/11) |
| `US-04 / AC-02`, `US-04 / AC-03`, `US-04 / AC-04` | `apps/web/src/state/attachments.test.ts` — `US-04 / AC-02, AC-04: detects playable audio MIME types and formats voice filenames and durations`; `npm run typecheck -w apps/web` & `npm run build` | Passed (`vitest`, 8/8; typecheck & build OK) |
| Regression: image & generic file attachments | `apps/server/test/office/chat-attachments.test.ts`, `apps/web/src/state/attachments.test.ts` | Passed |


---

### US-05: Native Per-Provider Modes, Live Claude SDK Models & Effort Selector (Revision)
- **Status:** `complete`
- **Dependencies:** `US-01`, `US-02`, `US-03`
- **Story:** As a Virtual Office user, I want each provider to show its own real models (including live Claude SDK models instead of hardcoded outdated ones) and its own native execution modes (Claude: Auto / Manual / Accept edits / Plan / Bypass permissions + Effort; Antigravity: Request Review / Turbo / Accept edits / Auto / Plan; Codex: Manual / Auto / Turbo; OpenCode: Manual / Auto), so that the selectors match the real capabilities of each agent.
- **Acceptance Criteria:**
  - `US-05 / AC-01`: Server `provider-models.ts` discovers live Claude models via `ClaudeCatalogProvider` / SDK `initializationResult().models` (falling back to current defaults only if unavailable) alongside `agy models` and `opencode models`, and exposes provider-specific `modes` metadata in `GET /api/models` (or `/api/provider-capabilities`).
  - `US-05 / AC-02`: Domain validation (`AgentMode`) and SQLite persistence support all native provider modes (`auto`, `default` / `request_review`, `acceptEdits`, `plan`, `bypassPermissions` / `turbo`) plus optional `effort` (`"low" | "medium" | "high" | "max" | null`) for Claude.
  - `US-05 / AC-03`: Every adapter maps its native modes accurately:
    - `ClaudeAgentAdapter`: passes `permissionMode` (`"auto" | "default" | "acceptEdits" | "plan" | "bypassPermissions"` with `allowDangerouslySkipPermissions: true` only for `bypassPermissions`) and `effort` when set.
    - `AntigravityAgentAdapter`: maps `turbo` → `--dangerously-skip-permissions`, `acceptEdits` → `--mode accept-edits`, `auto` → `--mode auto`, `plan` → `--mode plan`.
    - `CodexAgentAdapter`: maps `auto` → `--approve-for-me`, `turbo` → `--dangerously-bypass-approvals-and-sandbox`.
    - `OpenCodeAgentAdapter`: maps `auto` / `turbo` → `--auto`.
  - `US-05 / AC-04`: `ComposerConfigControls` and `TeamModal` render provider-native Mode and Model menus matching what users are accustomed to:
    - Claude: live models + inline `Effort` (`Low`, `Medium`, `High`, `Max`) and Mode menu (`Auto (Default)`, `Manual`, `Accept edits`, `Plan`, and separated `Bypass permissions` at bottom).
    - Antigravity (`agy`): live `agy models` and Mode menu (`Request Review`, `Turbo`, `Accept edits`, `Auto`, `Plan`).
    - Codex: `Manual`, `Auto`, `Turbo`; OpenCode: `Manual`, `Auto`.
    - Composer layout places Model/Effort + Mode pills cleanly in the footer alongside the Usage Ring, and places the microphone button (`🎤`) on the right side of the input bar next to Send.
- **Verification Mapping:**

| Story / criterion or regression risk | Test file and test name / procedure | Observed result and evidence |
| --- | --- | --- |
| `US-05 / AC-01` | `apps/server/test/office/provider-models.test.ts` — `US-05 / AC-01: discoverProviderModels uses live Claude models when loadClaudeModels returns results and falls back otherwise` | Passed (`vitest`, 4/4) |
| `US-05 / AC-02`, `US-05 / AC-03` | `apps/server/test/agents/adapter-model-mode.test.ts` — `US-05 / AC-02: native per-provider modes and Claude effort` (Claude `acceptEdits` + `effort`, Codex `--approve-for-me`, Antigravity `--mode`, OpenCode `--auto`) | Passed (`vitest`, 10/10) |
| `US-05 / AC-04` | `apps/web/src/state/agentConfig.test.ts` — `US-05 / AC-02: getModesForBoss returns native modes per provider and formatEffortLabel formats effort`; `npm run typecheck && npm run build` | Passed (`vitest`, 4/4; typecheck 0 errors; Vite build OK) |
| Regression: existing `US-01..US-04` tests | Full `npm test` (server + web) | Passed (`apps/server`: 44 files, 339/339; `apps/web`: 30 files, 210/210) |

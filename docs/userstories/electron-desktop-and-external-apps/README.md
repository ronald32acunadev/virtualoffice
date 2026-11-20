# Electron Desktop App & External Agent Launchers — User Stories

Builds on: [Claude-Style Chat UI, Agent Usage, Break Time, and Employee Job Titles](../claude-chat-usage-and-break/README.md).
Branch: `feature/electron-desktop-and-external-apps`, created from `feature/claude-chat-usage-and-break` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-20).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Programmatic server bootstrap & graceful lifecycle for desktop embedding | — | complete |
| US-02 | Electron desktop shell (`apps/desktop`) with workspace, 3D office window, and native folder picker | US-01 | complete |
| US-03 | External agent launcher catalog & backend launch API | — | pending |
| US-04 | Workspace "Open in..." external launcher picker UI | US-03 | pending |

## Confirmed facts & scope boundaries

- **Confirmed facts**:
  - `virtualoffice` is an npm workspaces monorepo (`apps/server`, `apps/web`) running Node `>=22.13` with Fastify 5, WebSocket, SQLite (`node:sqlite`), React 19, Vite 8, and React Three Fiber / Three.js.
  - `apps/server/src/main.ts` currently binds `127.0.0.1:${OFFICE_PORT ?? 4317}`, creates a per-run bearer token, serves `apps/web/dist`, and registers `SIGINT`/`SIGTERM` handlers directly at module top level.
  - Installed external agent apps/CLIs verified on this Linux machine:
    - Claude: `claude-desktop` (`/usr/bin/claude-desktop`) and `claude` CLI
    - Codex: `chatgpt` (`chatgpt.desktop`) and `codex` CLI
    - OpenCode: `/opt/OpenCode/ai.opencode` (`opencode-desktop.desktop`) and `opencode` CLI
    - Antigravity / Gemini: `antigravity` (`/snap/bin/antigravity`) and `agy` CLI
    - System terminal: `x-terminal-emulator`
  - `WorkspaceView` opens the 3D office via `window.open(buildViewUrl("/office", getToken()), "_blank")` and syncs employee selection across windows via `BroadcastChannel`.
- **Assumptions**:
  - Electron runs in development/local launch mode (`npm run desktop`) first; OS installer packaging (`.deb` / `.AppImage` / `.dmg`) is out of scope for this backlog unless requested later.
  - External apps are launched as independent OS processes (not reparented/embedded inside Electron's window).
- **Exclusions**:
  - No X11/Wayland window reparenting or iframe embedding of third-party Electron apps.
  - No embedded PTY/xterm terminal inside the web UI (handled via external terminal launcher instead).
  - No arbitrary command execution from client input; the server only launches allowlisted targets resolved by `targetId`.

Verification levels: Vitest unit and HTTP integration tests in `apps/server`, `apps/web`, and `apps/desktop` (using injected process spawner and binary-availability fakes so tests never spawn real external apps), `npm run typecheck`, `npm run build`, and a live Electron smoke launch.

---

## US-01 — Programmatic server bootstrap & graceful lifecycle for desktop embedding

As a desktop host (Electron) and CLI operator, I want the Virtual Office server to expose a reusable programmatic `startOfficeServer()` entrypoint, so that the desktop app can start, inspect, and cleanly stop the server without duplicating wiring or breaking `npm start`.

- `US-01 / AC-01`: Given `apps/server/src/server.ts` exports `startOfficeServer(options?)` accepting optional `port` (including `0` for an ephemeral port), `dbPath`, `staticRoot`, and `devOrigin`, when called programmatically, then it starts Fastify on `127.0.0.1`, runs startup recovery/profile backfill, and resolves with `{ url, port, token, close }`.
- `US-01 / AC-02`: Given a running server instance returned by `startOfficeServer()`, when `close()` is called (including multiple times), then it shuts down active agent sessions, closes Fastify and SQLite cleanly without throwing, and releases the bound port.
- `US-01 / AC-03`: Given `apps/server/src/main.ts` is executed directly (`npm start`), then it delegates to `startOfficeServer()`, prints `Virtual Office: http://127.0.0.1:<port>/?token=<token>`, and preserves existing `SIGINT`/`SIGTERM` shutdown behavior with all existing server tests passing.

---

## US-02 — Electron desktop shell (`apps/desktop`) with workspace, 3D office window, and native folder picker

As the owner, I want to run Virtual Office as a native Electron desktop application, so that I do not have to manually start a server or keep browser tabs open while using the workspace and 3D office.

- `US-02 / AC-01`: Given a new `apps/desktop` npm workspace with Electron main and preload scripts (and root script `npm run desktop`), when launched, then Electron starts the local Virtual Office server (on an ephemeral port, storing SQLite in Electron's `userData` path unless `OFFICE_DB` is set) and opens `/workspace?token=<token>` in the primary `BrowserWindow` with `contextIsolation: true` and `nodeIntegration: false`.
- `US-02 / AC-02`: Given the owner clicks "Open 3D Office" (`window.open('/office?token=...')`) inside the Electron app, when `setWindowOpenHandler` intercepts the navigation, then same-origin `/office` URLs open in a dedicated native `BrowserWindow` (preserving cross-window employee selection sync), while external `http:`/`https:` URLs open in the OS default browser via `shell.openExternal` and unknown schemes are denied.
- `US-02 / AC-03`: Given the Electron app exposes a narrow preload bridge `window.virtualOfficeDesktop.pickDirectory()`, when the owner clicks "Browse..." in the "New task" modal while running inside Electron, then a native OS folder-picker dialog opens and populates the working directory input; when running in a standard web browser (where the bridge is absent), the button is hidden and the existing text input continues working unchanged.
- `US-02 / AC-04`: Given the owner closes all windows or quits the Electron app, when the `before-quit` lifecycle fires, then Electron awaits `server.close()` before exiting so no orphan server process or locked SQLite handle remains.

---

## US-03 — External agent launcher catalog & backend launch API

As the owner, I want the server to detect and launch each agent's available external desktop app or CLI terminal in the employee's workspace, so that I can jump into the native tool whenever I need its full built-in UI or options.

- `US-03 / AC-01`: Given an `ExternalLauncherService` with injectable binary/path lookup and process spawner, when resolving launch targets for an employee's `bossId`, then it returns a deterministic ordered list of targets (`id`, `label`, `kind: "desktop_app" | "terminal_cli" | "folder"`, `available`, optional `unavailableReason`):
  - `claude`: **Claude Desktop** (`claude-desktop`), **Claude CLI (Terminal)** (`claude` in system terminal at `cwd`, passing `--resume <sessionId>` when `sessionId` exists), and **Workspace Folder** (`xdg-open`/`open`/`explorer` on `cwd`).
  - `codex`: **ChatGPT** (`chatgpt`), **Codex CLI (Terminal)** (`codex` in system terminal at `cwd`), and **Workspace Folder**.
  - `opencode`: **OpenCode Desktop** (`opencode-desktop` / `/opt/OpenCode/ai.opencode`), **OpenCode CLI (Terminal)** (`opencode` in system terminal at `cwd`), and **Workspace Folder**.
  - `gemini`: **Antigravity** (`antigravity` opened at `cwd`), **Antigravity / Gemini CLI (Terminal)** (`agy` or `gemini` in system terminal at `cwd`), and **Workspace Folder**.
- `US-03 / AC-02`: Given `GET /api/employees/:id/launch-targets`, when called for an existing employee, then it returns `200` with `{ targets }`; for an unknown employee ID, it returns `404`.
- `US-03 / AC-03`: Given `POST /api/employees/:id/launch` with `{ targetId }`, when the target is available and the employee's `cwd` exists (for targets that require a directory), then the server spawns the resolved allowlisted executable with `shell: false`, `detached: true`, `stdio: "ignore"`, and `unref()`, returning `200 { launched: true, targetId }`.
- `US-03 / AC-04`: Given `POST /api/employees/:id/launch` receives an unknown `targetId` (`400`), an unknown employee (`404`), a missing `cwd` (`409 folder_missing`), or an unavailable target (`409 target_unavailable`), then it rejects with the corresponding error JSON and spawns no process.

---

## US-04 — Workspace "Open in..." external launcher picker UI

As the owner, I want an "Open in..." selector in each employee's conversation header, so that I can choose between the agent's native desktop app (such as ChatGPT for Codex, Claude Desktop for Claude, OpenCode Desktop, or Antigravity), its CLI in a terminal, or the workspace folder with one click.

- `US-04 / AC-01`: Given an employee is selected in `ConversationPane`, when the owner opens the **"Open in..."** menu in the conversation header, then the UI fetches `GET /api/employees/:id/launch-targets` and renders each target option with its label and kind indicator (available targets clickable; unavailable targets visibly disabled with their reason).
- `US-04 / AC-02`: Given the owner clicks an available target in the **"Open in..."** menu, when `POST /api/employees/:id/launch` succeeds, then the menu closes and shows brief non-blocking feedback; if the request fails (e.g., folder missing or launch error), then an inline error message is displayed in the header without crashing or losing composer state.
- `US-04 / AC-03`: Given the owner switches between employees or uses keyboard `Escape` / outside click, then the menu closes cleanly and never triggers stale launches for a previously selected employee.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-03` | `apps/server/test/http/server-bootstrap.test.ts` (ephemeral port startup, idempotent `close()`, existing `apps/server` test suite) | Passed (`apps/server`: 24/24 files, 191/191 tests; `typecheck`: 0 errors). |
| `US-02 / AC-01`–`AC-04` | `apps/desktop/test/window-policy.test.ts` (same-origin `/office` allowlist, external `http(s)` openExternal, unknown scheme deny, shutdown cleanup) + `startDesktopServer` bridge smoke check | Passed (`apps/desktop`: 5/5 tests; `typecheck`: 0 errors across all 3 workspaces; `build`: web + desktop succeeded; `BRIDGE_SMOKE: 200` + clean shutdown). |
| `US-03 / AC-01`–`AC-04` | `apps/server/test/office/external-launcher.test.ts` & `apps/server/test/http/launch-routes.test.ts` (per-boss target catalogs, spawn args with `shell: false`, `400`/`404`/`409` rejection with zero spawns) | Pending |
| `US-04 / AC-01`–`AC-03` | `apps/web/src/state/launchMenu.test.ts` (target grouping/selection/error handling) + `npm run typecheck` + `npm run build` | Pending |
| Shared-code regression risk (`main.ts`, `ConversationPane.tsx`, `NewTaskModal.tsx`, HTTP routes) | `npm run test`, `npm run typecheck`, `npm run build` | Pending |

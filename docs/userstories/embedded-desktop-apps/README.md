# Embedded Desktop Apps — User Stories

Builds on: [Embedded Agent Terminal](../embedded-agent-terminal/README.md) (PR #3: web app, token-authenticated WebSocket channels, conversation tabs, "Open in..." launcher).
Branch: `feature/embedded-desktop-apps`, created from `feature/embedded-agent-terminal` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-20).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Embedded OpenCode web app | — | pending |
| US-02 | Virtual display host for desktop apps (server) | — | pending |
| US-03 | Authenticated desktop stream channel (VNC over the office WebSocket) | US-02 | pending |
| US-04 | "App" tab with the embedded desktop app in the workspace | US-01, US-03 | pending |

## Confirmed facts & scope boundaries

- **Confirmed facts (checked on this host, 2026-11-20)**:
  - Embedding the vendor web apps in an `<iframe>` is blocked: `https://claude.ai/` answers `X-Frame-Options: SAMEORIGIN` and `https://chatgpt.com/` answers `frame-ancestors 'self'` (plus a few Chrome extensions). Native desktop windows cannot be placed inside a browser page.
  - `opencode serve --hostname 127.0.0.1 --port <port>` serves OpenCode's own web UI (`200 text/html`) with a CSP that has no `frame-ancestors` and no `X-Frame-Options`, so it can be framed; it prints a per-run `server password` on startup. It also accepts `--cors <origin>`.
  - Installed desktop apps: Claude Desktop (`claude-desktop`, `com.anthropic.Claude.desktop`), ChatGPT (`chatgpt`, `chatgpt.desktop`), OpenCode Desktop (`/opt/OpenCode/ai.opencode`), Antigravity (`/snap/bin/antigravity`, snap).
  - Host: Ubuntu 26.04.1 LTS with a Wayland session. `xpra` has no apt candidate; `tigervnc-standalone-server` 1.15.0 (provides `Xvnc`, a virtual X display with a built-in VNC server), `xvfb`, `x11vnc`, `novnc`, and `websockify` are available from apt. None of them is installed yet.
  - `@novnc/novnc` 1.7.0 is the current noVNC browser client on npm.
- **Decisions**:
  - OpenCode embeds its real web UI through an `<iframe>` (no streaming). Claude Desktop, ChatGPT, and Antigravity are streamed: each runs on its own `Xvnc` virtual display, and the browser shows it with the noVNC client.
  - The office server proxies the browser WebSocket to the VNC TCP port itself (no `websockify`), so the stream reuses the existing per-run token, Host and Origin checks; `Xvnc` listens only on `127.0.0.1`.
  - Boss → embedded app: `claude` → Claude Desktop, `codex` → ChatGPT, `gemini` → Antigravity, `opencode` → OpenCode web.
- **Assumptions (verified first in the story that needs them; the backlog pauses for an owner decision if one fails)**:
  - The owner installs the display server once with `sudo apt install tigervnc-standalone-server`; the agent never installs system packages.
  - Electron apps (Claude Desktop, ChatGPT) and the Antigravity snap start and render on an `Xvnc` display through `DISPLAY=:<n>` without a GPU (falling back to software rendering, adding `--disable-gpu` if needed).
  - These apps enforce a single running instance per profile; to coexist with copies the owner opens on the real desktop, each embedded app runs with its own profile directory (Electron `--user-data-dir=<data>/desktop-profiles/<app>`), so the owner signs in once inside each embedded app. If an app ignores that flag, it can only be embedded while its normal window is closed.
  - The OpenCode web UI accepts the server password supplied by the office (environment variable or login prompt), so the framed UI loads without the owner typing it.
- **Exclusions**:
  - No iframe of claude.ai or chatgpt.com, no browser-extension tricks to bypass frame protections.
  - No window reparenting into the owner's real Wayland/X11 desktop.
  - No remote access: displays and streams stay on `127.0.0.1` behind the office token.
  - Audio, file drag-and-drop between the host and the embedded app, and multi-monitor are out of scope.
  - One embedded instance per app (not per employee): employees of the same boss share that app's window and its signed-in account.

Verification levels: Vitest unit and HTTP/WebSocket integration tests in `apps/server` and `apps/web` with injected fakes (no real `Xvnc`, apps, or `opencode` in automated tests), `npm run typecheck`, `npm run build`, and a live smoke test in the built-in browser for each app.

---

## US-01 — Embedded OpenCode web app

As the owner, I want OpenCode's own web interface inside the workspace for OpenCode employees, so that I use the real OpenCode app without leaving Virtual Office.

- `US-01 / AC-01`: Given an OpenCode employee, when the owner opens its embedded app, then the server starts (or reuses) one `opencode serve --hostname 127.0.0.1 --port <free port> --cors <office origin>` process for the employee's `workingDirectory` and returns the URL the page frames; a second request for the same folder reuses the running process.
- `US-01 / AC-02`: Given the process is starting, when its HTTP port is not ready yet, then the page shows "Starting OpenCode…"; given it does not answer within 20 seconds or exits, then the page shows the error and a "Retry" button, and no orphan process remains.
- `US-01 / AC-03`: Given the framed UI, then it loads without the owner typing the server password (the office supplies it as verified in this story), and the process is stopped when the owner chooses "Stop app" or the server `close()` runs.
- `US-01 / AC-04`: Given `opencode` is not installed, then the embedded app reports "OpenCode is not installed" and starts nothing.

---

## US-02 — Virtual display host for desktop apps (server)

As the owner, I want the server to run Claude Desktop, ChatGPT, and Antigravity on private virtual displays, so that their real windows can be streamed into the office.

- `US-02 / AC-01`: Given a `DesktopAppHost` with injectable process spawner and binary lookup, when `start(appId)` is called for `claude_desktop`, `chatgpt`, or `antigravity`, then it starts `Xvnc :<n> -geometry 1600x1000 -depth 24 -localhost -rfbport <free port> -SecurityTypes None` on a free display number, then launches the app with `DISPLAY=:<n>` and its own profile directory, and reports `{ appId, display, rfbPort, status: "running" }`.
- `US-02 / AC-02`: Given an app is already running, when `start` is called again, then the same instance is returned and nothing new is spawned.
- `US-02 / AC-03`: Given `Xvnc` is missing (`409 display_server_missing` with the message "Install the display server: sudo apt install tigervnc-standalone-server") or the app binary is missing (`409 app_not_installed`), then nothing is spawned.
- `US-02 / AC-04`: Given the app process exits, then its `Xvnc` is stopped and the status becomes `stopped` with the exit code; given `stop(appId)` or server `close()`, then the app and its display are terminated with no orphan processes.
- `US-02 / AC-05` (live, first): Given `tigervnc-standalone-server` is installed, then each of the three apps actually renders on its virtual display (checked with a screenshot from the VNC stream) using its own profile directory; failures are recorded per app before US-03 starts.

---

## US-03 — Authenticated desktop stream channel (VNC over the office WebSocket)

As the owner, I want the browser to receive the app's display through the office's own authenticated connection, so that no extra port or service is exposed.

- `US-03 / AC-01`: Given `GET /ws/desktop/:appId` with a valid token and allowed origin while the app is running, when the socket connects, then the server opens a TCP connection to `127.0.0.1:<rfbPort>` and relays binary frames in both directions unchanged.
- `US-03 / AC-02`: Given a missing or wrong token or a foreign origin, then the upgrade is rejected (`401`/`403`) and no TCP connection is opened; given the app is not running, then the socket closes with an error frame and code `1008`.
- `US-03 / AC-03`: Given either side closes (browser socket, VNC TCP, or app exit), then the other side is closed too, and the app keeps running when only the browser disconnects.

---

## US-04 — "App" tab with the embedded desktop app in the workspace

As the owner, I want an "App" tab next to Chat and Terminal that shows the boss's real desktop app, so that I can use Claude Desktop, ChatGPT, OpenCode, or Antigravity without leaving the office.

- `US-04 / AC-01`: Given an employee is selected, when the owner opens the "App" tab, then it shows the boss's embedded app: the OpenCode web UI in an `<iframe>` for `opencode`, or the noVNC (`@novnc/novnc` 1.7.0) canvas connected to `/ws/desktop/:appId` for the others, with "Start app" when the app is not running.
- `US-04 / AC-02`: Given the canvas is shown, then mouse, keyboard, and scrolling reach the app, the view scales to the panel (`scaleViewport`), and text copied on either side can be pasted on the other through noVNC's clipboard events.
- `US-04 / AC-03`: Given the app stops or the stream drops, then the panel shows the reason with "Restart app" and "Reconnect" buttons; switching employee or tab closes only the stream, not the app.
- `US-04 / AC-04`: Given the "Open in..." menu, then it lists **Embedded app** right after **Embedded terminal**, opening the "App" tab; the native external launchers stay unchanged.
- `US-04 / AC-05`: Given an employee of a boss whose app is unavailable (display server or app not installed), then the tab explains what is missing, including the install command for the display server.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-04` | `apps/server/test/desktop/opencode-web-host.test.ts` (fake spawner/port probe: reuse per folder, readiness timeout, stop/close cleanup, missing binary) + live smoke test framing a real `opencode serve` | Pending |
| `US-02 / AC-01`–`AC-04` | `apps/server/test/desktop/desktop-app-host.test.ts` (fake spawner: `Xvnc` and app arguments, display/port allocation, reuse, missing binaries, exit and stop cleanup) | Pending |
| `US-02 / AC-05` | Live check per app after the owner installs `tigervnc-standalone-server`: start each app on a virtual display and capture a frame | Pending |
| `US-03 / AC-01`–`AC-03` | `apps/server/test/http/desktop-ws.test.ts` (token/origin rejection with no TCP connect, byte relay both ways against a local fake TCP server, close propagation) | Pending |
| `US-04 / AC-01`–`AC-05` | `apps/web/src/state/desktopApp.test.ts` (boss → app mapping, panel state transitions, error texts) + live smoke test of the App tab for each of the 4 apps | Pending |
| Shared-code regression risk (`app.ts` auth hook for `/ws/*`, `server.ts` lifecycle, `ConversationPane.tsx` tabs, `OpenExternalMenu.tsx`) | `npm run test`, `npm run typecheck`, `npm run build` | Pending |

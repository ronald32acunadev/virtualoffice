# Multi-Agent Bosses (Codex, OpenCode, and Gemini CLI) — User Stories

Builds on: [3D Office Visual Redesign](../office-3d-redesign/README.md).
Branch: `feature/multi-agent-bosses`, created from `feature/office-3d-redesign` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-19).
Implementer route: no local model available (LM Studio unreachable, Ollama has no models); lightweight hosted subagent (`flash`) writes code and tests; planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Multi-adapter routing and dynamic boss availability | — | complete |
| US-02 | Codex CLI agent adapter | US-01 | complete |
| US-03 | OpenCode CLI agent adapter | US-01 | complete |
| US-04 | Gemini CLI agent adapter | US-01 | complete |

Environment facts (verified 2026-11-19):
- `codex` is installed (`/home/pumba/.local/bin/codex`, `codex-cli 0.170.0`) and supports `codex exec --json` and `codex exec resume <session_id> --json`.
- `opencode` is installed (`/home/pumba/.gentle-ai/bin/opencode`, `opencode v2.3.2`) and supports `opencode run --format json` and `opencode run --session <session_id> --format json`.
- `gemini` is not currently installed on `PATH`; `GeminiAgentAdapter` will be implemented and tested with fake streams, and will become automatically available as soon as `gemini` is installed on `PATH`.

Verification levels: Vitest for adapter routing, binary availability detection, JSONL event parsing, multi-turn resume, stop/failure handling, and HTTP API tests (with injectable fake process spawners); live smoke tests with real `codex` and `opencode` CLIs; browser verification in `/workspace` and `/office` confirming active boss suites and hiring.

---

## US-01 — Multi-adapter routing and dynamic boss availability

As the owner, I want the office to support multiple agent adapters and automatically enable every boss whose CLI is installed, so that Codex, OpenCode, and Gemini CLI work alongside Claude without hardcoding availability.

- `US-01 / AC-01`: Given `OfficeService` is configured with `adapters: Partial<Record<BossId, AgentAdapter>>` (while preserving backward compatibility for the single `adapter` option as `claude`), when `listBosses()` is called, then each boss's `available` flag reflects whether an adapter is registered and available for that `bossId`.
- `US-01 / AC-02`: Given an employee is hired or resumed for a `bossId` with an available adapter, then `OfficeService` routes `start`, `sendMessage`, `fetchCatalog`, and `stop` to that boss's adapter; hiring for an unavailable boss still rejects with `409 boss_unavailable` and creates no employee.
- `US-01 / AC-03`: Given server startup (`main.ts`), then it detects installed CLIs (`codex`, `opencode`, `gemini`) on `PATH` and registers adapters for available ones (keeping `claude` always registered via the Claude SDK).
- `US-01 / AC-04`: Given `/workspace` "New task" modal and `/office` 3D suites, then every available boss is selectable in the Boss dropdown and renders as an active suite in `/office`; unavailable bosses show `"(not installed)"` in the dropdown; switching away from `claude` hides/clears the Claude-specific Role selector so non-Claude hires are not blocked by Claude's folder catalog.

## US-02 — Codex CLI agent adapter

As the owner, I want to hire and chat with Codex employees from the office, so that I can run OpenAI Codex tasks alongside Claude in the same workspace and 3D office.

- `US-02 / AC-01`: Given a new Codex employee is started in `workingDirectory` with `prompt`, then `CodexAgentAdapter` spawns `codex exec --json --cd <workingDirectory> --skip-git-repo-check <prompt>` and emits `onSessionStarted` when `thread.started` (or session id) arrives, `onMessage("agent_text")` for assistant responses, `tool_call`/`tool_result` for command/tool items, and `onTurnFinished` when the turn completes.
- `US-02 / AC-02`: Given an idle Codex employee with a stored `providerSessionId`, when the owner sends a follow-up message (in the same server run or after restart), then the adapter resumes via `codex exec resume <providerSessionId> --json <prompt>` in `workingDirectory` and appends the new turn cleanly.
- `US-02 / AC-03`: Given a running Codex employee, when the owner clicks Stop (or the server shuts down), then the child process is terminated cleanly without leaving orphan processes; non-zero unexpected exits or spawn errors report `onFailed(reason)`.
- `US-02 / AC-04`: Given a real `codex` CLI on the host, a smoke test hiring a Codex employee in a temporary folder completes a turn and records its `providerSessionId` and assistant response.

## US-03 — OpenCode CLI agent adapter

As the owner, I want to hire and chat with OpenCode employees from the office, so that I can delegate work to OpenCode agents from the same UI.

- `US-03 / AC-01`: Given a new OpenCode employee is started in `workingDirectory` with `prompt`, then `OpenCodeAgentAdapter` spawns `opencode run --format json <prompt>` with `cwd: workingDirectory` and emits `onSessionStarted` on the session ID event, `onDelta`/`onMessage("agent_text")` for assistant text, `tool_call`/`tool_result` for tool events, and `onTurnFinished` when the turn finishes.
- `US-03 / AC-02`: Given an idle OpenCode employee with a stored `providerSessionId`, when the owner sends a follow-up message (live or resumed after restart), then the adapter spawns `opencode run --format json --session <providerSessionId> <prompt>` in `workingDirectory`.
- `US-03 / AC-03`: Given a running OpenCode employee, when Stop is requested or the process fails unexpectedly, then the child process is terminated cleanly on stop, and unexpected errors/non-zero exits report `onFailed(reason)`.
- `US-03 / AC-04`: Given a real `opencode` CLI on the host, a smoke test hiring an OpenCode employee completes a turn and records its session ID and assistant response.

## US-04 — Gemini CLI agent adapter

As the owner, I want a Gemini CLI adapter wired into the office, so that as soon as `gemini` is installed on `PATH`, Gemini CLI employees work automatically without code changes.

- `US-04 / AC-01`: Given a new Gemini CLI employee is started in `workingDirectory` with `prompt`, then `GeminiAgentAdapter` spawns `gemini -p <prompt> --output-format stream-json` with `cwd: workingDirectory` and maps `stream-json` events (`init` → `onSessionStarted`, assistant `message` → `onDelta`/`onMessage("agent_text")`, `tool_use`/`tool_result` → `tool_call`/`tool_result`, `result` → `onTurnFinished`).
- `US-04 / AC-02`: Given an idle Gemini CLI employee with a stored `providerSessionId`, when a follow-up message is sent (live or resumed), then the adapter spawns `gemini --resume <providerSessionId> -p <prompt> --output-format stream-json` in `workingDirectory`.
- `US-04 / AC-03`: Given a running Gemini CLI employee, when Stop is requested or the process fails unexpectedly, then the child process is terminated cleanly on stop and unexpected errors/non-zero exits report `onFailed(reason)`.
- `US-04 / AC-04`: Given `gemini` is not installed on `PATH`, then `Gemini CLI` appears unavailable (`available: false`, `409 boss_unavailable` on hire); given `gemini` is detected on `PATH`, then `Gemini CLI` automatically reports `available: true`.

---

## Verification mapping

Evidence date: 2026-11-19. Automated: `npm run test -w apps/server` (19 files, 162 tests passed), `npm run test -w apps/web` (14 files, 68 tests passed), `npm run typecheck` (0 errors), `npm run build` (succeeded). Manual: temporary server on port 4397 with disposable SQLite DB running real `codex` (`0.170.0`) and `opencode` (`v2.3.2`) CLIs; temporary files cleaned afterwards.

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-04` | `apps/server/test/office/multi-agent-routing.test.ts` (9 tests), `apps/server/test/agents/binary-availability.test.ts` (6 tests); live `/api/state` check | Passed. `GET /api/state` reported `claude: true`, `codex: true`, `opencode: true`, `gemini: false`; hiring `gemini` returned `409 boss_unavailable`; `NewTaskModal` hides Role for non-Claude bosses and labels unavailable bosses `(not installed)`. |
| `US-02 / AC-01`–`AC-04` | `apps/server/test/agents/codex-agent-adapter.test.ts` (5 tests); live `codex` CLI smoke test | Passed. Real Codex employee hired (`201`), ran turn to `idle`, recorded `providerSessionId: "01a1f64e-b0ec-7fa2-b19d-25fbb694eca0"`, and answered `["ok"]`. |
| `US-03 / AC-01`–`AC-04` | `apps/server/test/agents/opencode-agent-adapter.test.ts` (3 tests); live `opencode` CLI smoke test | Passed. Real OpenCode employee hired (`201`), ran turn to `idle`, recorded `providerSessionId: "ses_e09b14e47ffetksjnKoCi3ZAEX"`, and answered `["ok"]`. |
| `US-04 / AC-01`–`AC-04` | `apps/server/test/agents/gemini-agent-adapter.test.ts` (5 tests), `apps/server/test/agents/binary-availability.test.ts`; live `gemini` hire rejection check | Passed. Fake `stream-json` start, delta streaming, tool use/result, resume, error, and stop tests green; live server without `gemini` on `PATH` reported `available: false` and rejected hire with `409 boss_unavailable`. |
| Risk: existing Claude hire, chat, catalog, import, approvals, and shutdown flows | Full `apps/server` (162 tests) and `apps/web` (68 tests) suites + `npm run typecheck` + `npm run build` | Passed. |

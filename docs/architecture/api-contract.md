# Virtual Office API Contract

Version: MVP + workspace-and-import + skills-and-specialists (see `docs/userstories/workspace-and-import/README.md`).

Shared contract between `apps/server` and `apps/web`. All timestamps are ISO 8601 strings. All IDs are strings.

## Security

- The server binds to `127.0.0.1` on `OFFICE_PORT` (default `4317`) and generates a random token (32 bytes, hex) at every launch. It prints `http://127.0.0.1:<port>/?token=<token>`.
- **Every request** (static files included): the `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`; otherwise `403 { error: { code: "forbidden_host" } }`.
- **`/api/*` and `/ws`**: if an `Origin` header is present it must be `http://127.0.0.1:<port>`, `http://localhost:<port>`, or the value of the optional `OFFICE_DEV_ORIGIN` env var; otherwise `403 { error: { code: "forbidden_origin" } }`. The token is required: `Authorization: Bearer <token>` for HTTP, `?token=<token>` query parameter for `/ws`. Missing or wrong token: `401 { error: { code: "unauthorized" } }` (the WebSocket upgrade is refused with 401 before connecting). Token comparison uses a constant-time compare.
- Static files of the built client (`apps/web/dist`) do not require the token.
- The web client reads `token` from `location.search` once and keeps it in memory (and `sessionStorage` as a convenience, wrapped in try/catch).

## Types

```ts
type BossId = "claude" | "codex" | "opencode" | "gemini";
type Boss = { id: BossId; name: string; available: boolean }; // only claude available in MVP

type EmployeeStatus = "starting" | "working" | "waiting_approval" | "idle" | "stopped" | "failed";
type Species = "wolf" | "dog" | "fox" | "cat" | "bear" | "human";
type Employee = {
  id: string; bossId: BossId; hiredBy: string | null; task: string; workingDirectory: string;
  name: string;                 // 1-40 chars after trim; not unique
  species: Species;
  importedAt: string | null;    // set when created by an import
  role: string | null;          // agent name the employee runs as (SDK `agent` option); null = General
  providerSessionId: string | null; status: EmployeeStatus; failureReason: string | null;
  createdAt: string; updatedAt: string;
};

type MessageKind = "user_text" | "agent_text" | "tool_call" | "tool_result" | "system";
type Message = {
  id: string; employeeId: string; kind: MessageKind; content: string;
  toolName: string | null; toolUseId: string | null; parentToolUseId: string | null; createdAt: string;
  sourceUuid: string | null;    // provider message uuid (imports and catch-up dedupe); null for live-only entries
};

type SlashCommand = { name: string; description: string; argumentHint: string; aliases?: string[]; builtin?: boolean };
type AgentInfo = { name: string; description: string; model?: string; builtin: boolean }; // builtin computed by the server from a fixed name list
type Catalog = { commands: SlashCommand[]; agents: AgentInfo[] }; // commands: non-built-in first; agents: owner's first, built-in last

type ClaudeSessionSummary = {
  sessionId: string; title: string; cwd: string | null; gitBranch: string | null;
  lastModified: string; createdAt: string | null; alreadyImported: boolean;
};

type ApprovalKind = "permission" | "question" | "plan";
type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
type Decision = "approve" | "approve_for_session" | "reject";
type ApprovalRequest = {
  id: string; employeeId: string; kind: ApprovalKind; toolName: string;
  summary: string;              // human-readable: command for Bash, file path for edits, plan text, question text
  input: unknown;               // raw tool input (JSON)
  status: ApprovalStatus; decision: Decision | null;
  answers: Record<string, string> | null; // question kind only: question text -> selected label(s), comma-joined
  canApproveForSession: boolean;
  createdAt: string; decidedAt: string | null;
};
```

## HTTP endpoints

| Method and path | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/state` | — | `200 { bosses: Boss[], employees: Employee[], approvals: ApprovalRequest[] }` (approvals: pending only) | — |
| `GET /api/employees/:id/messages` | — | `200 { messages: Message[] }` ordered by creation | `404 not_found` |
| `POST /api/employees` | `{ bossId, task, workingDirectory, name?, species?, role? }` | `201 { employee }` (name/species generated when omitted) | `400 validation_error` with `field` (`task` empty, `workingDirectory` missing / not a directory, unknown `bossId`, `name` empty or > 40, unknown `species`, `role` not in the folder's agents); `409 boss_unavailable`; `503 catalog_unavailable` (role given but the folder catalog cannot be read) |
| `GET /api/catalog?workingDirectory=<abs>&refresh=<bool>` | — | `200 { catalog: Catalog }` (cached per folder; `refresh=true` re-probes) | `400 validation_error` (folder missing / not a directory); `503 catalog_unavailable` |
| `GET /api/employees/:id/catalog?refresh=<bool>` | — | `200 { catalog: Catalog }` (live session lists when the employee has one, else the folder catalog) | `404 not_found`; `503 catalog_unavailable` |
| `PATCH /api/employees/:id` | `{ name?, species? }` (at least one) | `200 { employee }` | `400 validation_error`; `404 not_found` |
| `POST /api/employees/:id/messages` | `{ text }` (non-empty) | `202 { message }` | `400 validation_error`; `404 not_found`; `409 working_directory_missing` (employee folder does not exist) |
| `GET /api/imports/claude/sessions?q=&limit=&offset=` | — | `200 { sessions: ClaudeSessionSummary[], total: number }` newest first; `q` filters title and cwd case-insensitive over all sessions; `limit` default 30, max 100 | `400 validation_error` |
| `POST /api/imports/claude` | `{ sessionIds: string[] }` (1-100) | `200 { imported: Employee[], skipped: { sessionId: string, reason: "already_imported" \| "missing_cwd" \| "not_found" \| "read_failed" }[] }` | `400 validation_error` |
| `POST /api/employees/:id/stop` | — | `200 { employee }` (no-op for `idle`, `stopped`, `failed`) | `404 not_found` |
| `POST /api/approvals/:id/decision` | `{ decision, answers? }` | `200 { approval }` | `400 validation_error` (`approve_for_session` when not allowed; `question` kind needs `answers` unless rejecting); `404 not_found`; `409 approval_not_pending` |

Error body shape: `{ error: { code: string, message: string, field?: string } }`.

## Client routes

The server answers `GET /office` and `GET /workspace` (and any non-`/api`, non-`/ws`, non-asset path) with the client's `index.html` (SPA fallback, no token required, Host check applies). `/` redirects client-side to `/workspace` keeping the query string. `/workspace?employee=<id>` preselects that employee.

Cross-window UI messages use `new BroadcastChannel("virtual-office")` with `{ type: "focus_employee", employeeId: string }` and a presence ping `{ type: "workspace_ping" }` / `{ type: "workspace_pong" }` so `/office` knows whether a workspace window is open.

## WebSocket `/ws?token=<token>`

Server to client only, one JSON object per frame:

```ts
type ServerEvent =
  | { type: "employee_updated"; employee: Employee }
  | { type: "message_added"; message: Message }
  | { type: "message_delta"; employeeId: string; text: string } // live partial agent text, not persisted
  | { type: "approval_requested"; approval: ApprovalRequest }
  | { type: "approval_updated"; approval: ApprovalRequest };
```

On (re)connect the client reloads `GET /api/state` and, for the open panel, `GET /api/employees/:id/messages`, then applies events. The client discards accumulated deltas for an employee when a `message_added` of kind `agent_text` arrives for it.

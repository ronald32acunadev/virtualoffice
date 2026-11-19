# Virtual Office API Contract (MVP)

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
type Employee = {
  id: string; bossId: BossId; hiredBy: string | null; task: string; workingDirectory: string;
  providerSessionId: string | null; status: EmployeeStatus; failureReason: string | null;
  createdAt: string; updatedAt: string;
};

type MessageKind = "user_text" | "agent_text" | "tool_call" | "tool_result" | "system";
type Message = {
  id: string; employeeId: string; kind: MessageKind; content: string;
  toolName: string | null; toolUseId: string | null; parentToolUseId: string | null; createdAt: string;
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
| `POST /api/employees` | `{ bossId, task, workingDirectory }` | `201 { employee }` | `400 validation_error` with `field` (`task` empty, `workingDirectory` missing / not a directory, unknown `bossId`); `409 boss_unavailable` |
| `POST /api/employees/:id/messages` | `{ text }` (non-empty) | `202 { message }` | `400 validation_error`; `404 not_found` |
| `POST /api/employees/:id/stop` | — | `200 { employee }` (no-op for `idle`, `stopped`, `failed`) | `404 not_found` |
| `POST /api/approvals/:id/decision` | `{ decision, answers? }` | `200 { approval }` | `400 validation_error` (`approve_for_session` when not allowed; `question` kind needs `answers` unless rejecting); `404 not_found`; `409 approval_not_pending` |

Error body shape: `{ error: { code: string, message: string, field?: string } }`.

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

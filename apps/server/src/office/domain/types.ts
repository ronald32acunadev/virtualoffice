export type BossId = "claude" | "codex" | "opencode" | "gemini";
export type Boss = { id: BossId; name: string; available: boolean };

export type EmployeeStatus =
  | "starting"
  | "working"
  | "waiting_approval"
  | "idle"
  | "stopped"
  | "failed";

export type Employee = {
  id: string;
  bossId: BossId;
  hiredBy: string | null;
  task: string;
  workingDirectory: string;
  providerSessionId: string | null;
  status: EmployeeStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageKind = "user_text" | "agent_text" | "tool_call" | "tool_result" | "system";
export type Message = {
  id: string;
  employeeId: string;
  kind: MessageKind;
  content: string;
  toolName: string | null;
  toolUseId: string | null;
  parentToolUseId: string | null;
  createdAt: string;
};

export type ApprovalKind = "permission" | "question" | "plan";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type Decision = "approve" | "approve_for_session" | "reject";
export type ApprovalRequest = {
  id: string;
  employeeId: string;
  kind: ApprovalKind;
  toolName: string;
  summary: string;
  input: unknown;
  status: ApprovalStatus;
  decision: Decision | null;
  answers: Record<string, string> | null;
  canApproveForSession: boolean;
  createdAt: string;
  decidedAt: string | null;
};

export type ServerEvent =
  | { type: "employee_updated"; employee: Employee }
  | { type: "message_added"; message: Message }
  | { type: "message_delta"; employeeId: string; text: string }
  | { type: "approval_requested"; approval: ApprovalRequest }
  | { type: "approval_updated"; approval: ApprovalRequest };

export const BOSSES: readonly Boss[] = [
  { id: "claude", name: "Claude", available: true },
  { id: "codex", name: "Codex", available: false },
  { id: "opencode", name: "OpenCode", available: false },
  { id: "gemini", name: "Gemini CLI", available: false },
];

const DECISIONS: readonly Decision[] = ["approve", "approve_for_session", "reject"];

export function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && (DECISIONS as readonly string[]).includes(value);
}

/** Statuses whose session is (or should be) running and can be stopped. */
export const ACTIVE_STATUSES: readonly EmployeeStatus[] = ["starting", "working", "waiting_approval"];

export function isActiveStatus(status: EmployeeStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export class OfficeError extends Error {
  constructor(
    readonly code: "validation_error" | "not_found" | "boss_unavailable" | "approval_not_pending",
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "OfficeError";
  }
}

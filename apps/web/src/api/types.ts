// Copied from docs/architecture/api-contract.md. Keep in sync with the contract.
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

export type StateSnapshot = {
  bosses: Boss[];
  employees: Employee[];
  approvals: ApprovalRequest[];
};

export type ApiErrorBody = { error: { code: string; message: string; field?: string } };

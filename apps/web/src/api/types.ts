// Copied from docs/architecture/api-contract.md. Keep in sync with the contract.
export type BossId = "claude" | "codex" | "opencode" | "gemini";

export type BossUsage = {
  remainingPercent: number | null;
  utilizationPercent: number | null;
  resetsAt: string | null;
  windowLabel: string | null;
  inputTokens: number;
  outputTokens: number;
  updatedAt: string | null;
};

export type EmployeeUsage = {
  inputTokens: number;
  outputTokens: number;
  contextUsed: number | null;
  contextWindow: number | null;
  costUsd: number | null;
  updatedAt: string | null;
};

export type Boss = {
  id: BossId;
  name: string;
  available: boolean;
  usage?: BossUsage;
  onBreak?: boolean;
  breakUntil?: string | null;
  breakReason?: string | null;
};

export type EmployeeStatus =
  | "starting"
  | "working"
  | "waiting_approval"
  | "idle"
  | "on_break"
  | "stopped"
  | "failed";

export type Species = "wolf" | "dog" | "fox" | "cat" | "bear" | "human";

export type Employee = {
  id: string;
  bossId: BossId;
  hiredBy: string | null;
  task: string;
  workingDirectory: string;
  name: string;
  species: Species;
  importedAt: string | null;
  role: string | null;
  jobTitle: string | null;
  providerSessionId: string | null;
  status: EmployeeStatus;
  failureReason: string | null;
  usage?: EmployeeUsage;
  createdAt: string;
  updatedAt: string;
};

export type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};
export type AttachmentUpload = {
  name: string;
  mimeType: string;
  dataBase64: string;
};

export type MessageKind = "user_text" | "agent_text" | "tool_call" | "tool_result" | "thinking" | "system";
export type Message = {
  id: string;
  employeeId: string;
  kind: MessageKind;
  content: string;
  toolName: string | null;
  toolUseId: string | null;
  parentToolUseId: string | null;
  createdAt: string;
  sourceUuid: string | null;
  attachments?: MessageAttachment[];
};

export type SlashCommand = {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
  builtin?: boolean;
};
export type AgentInfo = { name: string; description: string; model?: string; builtin: boolean };
export type Catalog = { commands: SlashCommand[]; agents: AgentInfo[] };

export type ClaudeSessionSummary = {
  sessionId: string;
  title: string;
  cwd: string | null;
  gitBranch: string | null;
  lastModified: string;
  createdAt: string | null;
  alreadyImported: boolean;
};

export type ImportSkipReason = "already_imported" | "missing_cwd" | "not_found" | "read_failed";
export type ImportResult = {
  imported: Employee[];
  skipped: { sessionId: string; reason: ImportSkipReason }[];
};

export type Project = {
  path: string;
  name: string;
  providers: BossId[];
  lastSeenAt: string;
};

export type ProviderSyncStats = {
  projectsAdded: number;
  sessionsImported: number;
  skipped: number;
  error: string | null;
};

export type SyncSummary = {
  projectsAdded: number;
  sessionsImported: number;
  skipped: number;
  providers: Partial<Record<BossId, ProviderSyncStats>>;
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
  | { type: "boss_updated"; boss: Boss }
  | { type: "employee_updated"; employee: Employee }
  | { type: "message_added"; message: Message }
  | { type: "message_delta"; employeeId: string; text: string }
  | { type: "approval_requested"; approval: ApprovalRequest }
  | { type: "approval_updated"; approval: ApprovalRequest }
  | { type: "terminal_updated"; employeeId: string; active: boolean }
  | { type: "projects_updated"; projects: Project[] };

export type StateSnapshot = {
  bosses: Boss[];
  employees: Employee[];
  approvals: ApprovalRequest[];
  activeTerminals?: string[];
  projects?: Project[];
};

export type ApiErrorBody = { error: { code: string; message: string; field?: string } };



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

export const SPECIES = ["wolf", "dog", "fox", "cat", "bear", "human"] as const;
export type Species = (typeof SPECIES)[number];

export function isSpecies(value: unknown): value is Species {
  return typeof value === "string" && (SPECIES as readonly string[]).includes(value);
}

export const MAX_NAME_LENGTH = 40;
export const MAX_JOB_TITLE_LENGTH = 60;

export type Employee = {
  id: string;
  bossId: BossId;
  hiredBy: string | null;
  task: string;
  workingDirectory: string;
  name: string;
  species: Species;
  importedAt: string | null;
  /** Agent name the employee runs as (provider `agent` option); null means General. */
  role: string | null;
  /** Human-facing position / cargo assigned by the owner (provider-agnostic). */
  jobTitle: string | null;
  providerSessionId: string | null;
  status: EmployeeStatus;
  failureReason: string | null;
  usage?: EmployeeUsage;
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
  /** Provider message uuid (imports and catch-up dedupe); null for entries the provider never numbered. */
  sourceUuid: string | null;
};

export type SlashCommand = {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
  builtin?: boolean;
};
/** An agent as a provider reports it (no source flag). */
export type ProviderAgent = { name: string; description: string; model?: string };
export type AgentInfo = ProviderAgent & { builtin: boolean };
/** Lists as a provider reports them. */
export type ProviderCatalog = { commands: SlashCommand[]; agents: ProviderAgent[] };
/** Lists as the office serves them: commands non-built-in first, agents owner's first. */
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
  | { type: "terminal_updated"; employeeId: string; active: boolean };

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
    readonly code:
      | "validation_error"
      | "not_found"
      | "boss_unavailable"
      | "provider_on_break"
      | "approval_not_pending"
      | "working_directory_missing"
      | "catalog_unavailable"
      | "terminal_active",
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "OfficeError";
  }
}

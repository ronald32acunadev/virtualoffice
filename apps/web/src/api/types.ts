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

export type ToolActivityCategory =
  | "coding"
  | "searching_files"
  | "searching_web"
  | "mcp_request"
  | "delegating";

export type AgentActivity = {
  category: ToolActivityCategory;
  toolName: string;
  serverName: string | null;
  label: string;
  startedAt: string;
};

export type AgentMode =
  | "request_review"
  | "auto"
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions"
  | "turbo";
export type AgentEffort = "low" | "medium" | "high" | "max";
export type ProviderModelOption = { id: string; label: string };

export type Agent = {
  id: string;
  bossId: BossId;
  name: string;
  species: Species;
  role: string | null;
  jobTitle: string | null;
  model?: string | null;
  mode?: AgentMode;
  effort?: AgentEffort | null;
  createdAt: string;
  updatedAt: string;
};

export type Employee = {
  id: string;
  bossId: BossId;
  agentId?: string | null;
  hiredBy: string | null;
  task: string;
  workingDirectory: string;
  name: string;
  species: Species;
  importedAt: string | null;
  role: string | null;
  jobTitle: string | null;
  model?: string | null;
  mode?: AgentMode;
  effort?: AgentEffort | null;
  providerSessionId: string | null;
  status: EmployeeStatus;
  failureReason: string | null;
  usage?: EmployeeUsage;
  activity?: AgentActivity | null;
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
  sessionsRemoved?: number;
};

export type SyncSummary = {
  projectsAdded: number;
  sessionsImported: number;
  skipped: number;
  providers: Partial<Record<BossId, ProviderSyncStats>>;
  sessionsRemoved?: number;
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

export type MediaProvider = "spotify" | "youtube_music" | "apple_music";
export type MediaKind = "audio" | "video";
export type MediaPlaybackState = {
  provider: MediaProvider;
  mediaKind: MediaKind;
  sourceUrl: string;
  embedUrl: string;
  title: string;
  thumbnailUrl: string | null;
  updatedAt: string;
};
export type MediaPreset = {
  id: string;
  provider: MediaProvider;
  mediaKind: MediaKind;
  sourceUrl: string;
  embedUrl: string;
  title: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

export type ServerEvent =
  | { type: "boss_updated"; boss: Boss }
  | { type: "agent_updated"; agent: Agent }
  | { type: "agent_removed"; agentId: string }
  | { type: "employee_updated"; employee: Employee }
  | { type: "employee_activity"; employeeId: string; activity: AgentActivity | null }
  | { type: "employee_removed"; employeeId: string }
  | { type: "message_added"; message: Message }
  | { type: "message_delta"; employeeId: string; text: string }
  | { type: "approval_requested"; approval: ApprovalRequest }
  | { type: "approval_updated"; approval: ApprovalRequest }
  | { type: "terminal_updated"; employeeId: string; active: boolean }
  | { type: "projects_updated"; projects: Project[] }
  | { type: "media_updated"; media: MediaPlaybackState | null }
  | { type: "media_presets_updated"; presets: MediaPreset[] };

export type StateSnapshot = {
  bosses: Boss[];
  agents?: Agent[];
  employees: Employee[];
  approvals: ApprovalRequest[];
  activeTerminals?: string[];
  projects?: Project[];
  media?: MediaPlaybackState | null;
  mediaPresets?: MediaPreset[];
};

export type ApiErrorBody = { error: { code: string; message: string; field?: string } };



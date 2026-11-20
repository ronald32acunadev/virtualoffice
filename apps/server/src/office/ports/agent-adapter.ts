import type { ApprovalKind, Decision, Employee, MessageKind, ProviderCatalog } from "../domain/types.ts";

export type AgentMessage = {
  kind: MessageKind;
  content: string;
  toolName?: string | null;
  toolUseId?: string | null;
  parentToolUseId?: string | null;
  sourceUuid?: string | null;
};

export type ApprovalPrompt = {
  kind: ApprovalKind;
  toolName: string;
  summary: string;
  input: unknown;
  canApproveForSession: boolean;
};

/** Outcome of an approval. Anything other than approve / approve_for_session means "deny". */
export type ApprovalOutcome =
  | { decision: Decision; answers?: Record<string, string> }
  | { decision: "expired" };

export type UsageUpdate = {
  rateLimit?: {
    status: "allowed" | "allowed_warning" | "rejected";
    utilizationPercent: number | null;
    resetsAt: string | null;
    windowLabel: string | null;
  };
  tokens?: {
    inputTokens: number;
    outputTokens: number;
    contextUsed?: number | null;
    contextWindow?: number | null;
    costUsd?: number | null;
    cumulative?: boolean;
  };
};

/** Callbacks the office hands to an adapter for one live session. */
export interface AgentSink {
  onSessionStarted(providerSessionId: string): void;
  onMessage(message: AgentMessage): void;
  onDelta(text: string): void;
  onTurnFinished(): void;
  onFailed(reason: string): void;
  /** The live session's current commands and agents (after init and whenever the provider pushes a change). */
  onCatalog(catalog: ProviderCatalog): void;
  /** Optional provider quota and session token usage telemetry. */
  onUsage?(update: UsageUpdate): void;
  /** Must resolve `expired` (never approve) when the signal aborts or the session ends. */
  requestApproval(prompt: ApprovalPrompt, signal: AbortSignal): Promise<ApprovalOutcome>;
}

export type StartParams = {
  employee: Employee;
  prompt: string;
  /** Provider session id to resume, when reopening a stored session. */
  resume?: string;
};

export interface AgentAdapter {
  /** Starts a live session without blocking. Failures are reported through `sink.onFailed`. */
  start(params: StartParams, sink: AgentSink): void;
  hasSession(employeeId: string): boolean;
  /** Delivers a follow-up message to a live session. Returns false when there is none. */
  sendMessage(employeeId: string, text: string): boolean;
  /** Current lists straight from a live session; null when there is none or it cannot answer. */
  fetchCatalog(employeeId: string): Promise<ProviderCatalog | null>;
  /** Interrupts and closes the session. Safe to call when there is none. */
  stop(employeeId: string): Promise<void>;
}

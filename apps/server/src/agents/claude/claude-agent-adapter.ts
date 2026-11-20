import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  Options,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentAdapter, AgentSink, StartParams } from "../../office/ports/agent-adapter.ts";
import type { ProviderAgent, ProviderCatalog } from "../../office/domain/types.ts";
import { toAgents, toCommands, withTimeout } from "./catalog-support.ts";
import { SETTING_SOURCES, SYSTEM_PROMPT } from "./session-options.ts";
import { approvalKindFor, summarizeToolInput } from "./approval-mapping.ts";
import { mapAssistantContent, mapUserContent } from "./message-mapping.ts";
import { PushQueue } from "./push-queue.ts";
import {
  extractTokenUsage,
  formatRateLimitWindow,
  normalizeResetsAt,
  normalizeUtilizationPercent,
} from "../usage-parser.ts";

/** The subset of the SDK `query` function this adapter needs; tests inject a fake. */
export type QueryFunction = (params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => AsyncIterable<SDKMessage> & SessionHandle;

/** The control methods of an SDK query this module uses; all optional so partial fakes and older SDKs work. */
type SessionHandle = {
  interrupt?: () => Promise<unknown>;
  close?: () => void;
  initializationResult?: () => Promise<unknown>;
  supportedCommands?: () => Promise<unknown>;
  supportedAgents?: () => Promise<unknown>;
};

const CATALOG_READ_TIMEOUT_MS = 15_000;

type Session = {
  queue: PushQueue<SDKUserMessage>;
  abort: AbortController;
  stopped: boolean;
  handle?: SessionHandle;
  /** Agents from the last full read; a command push carries no agents. */
  agents?: ProviderAgent[];
};

/** Loosely typed view of the SDK messages we care about; the real union is large and open. */
type LooseMessage = {
  type?: string;
  subtype?: string;
  session_id?: string;
  uuid?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: unknown };
  event?: { type?: string; delta?: { type?: string; text?: string } };
  result?: unknown;
  errors?: unknown;
  error?: unknown;
  commands?: unknown;
  rate_limit_info?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  modelUsage?: Record<string, Record<string, unknown>>;
  total_cost_usd?: unknown;
};

const REJECTED_MESSAGE = "Rejected by the owner";

function deny(message: string): PermissionResult {
  return { behavior: "deny", message };
}

function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

export class ClaudeAgentAdapter implements AgentAdapter {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly queryFn: QueryFunction = query) {}

  hasSession(employeeId: string): boolean {
    return this.sessions.has(employeeId);
  }

  start({ employee, prompt, resume }: StartParams, sink: AgentSink): void {
    const session: Session = { queue: new PushQueue(), abort: new AbortController(), stopped: false };
    session.queue.push(userMessage(prompt));
    this.sessions.set(employee.id, session);

    const canUseTool: CanUseTool = async (toolName, input, options) => {
      try {
        if (session.stopped || options.signal.aborted) return deny("Session aborted");
        const suggestions = options.suggestions ?? [];
        const outcome = await sink.requestApproval(
          {
            kind: approvalKindFor(toolName),
            toolName,
            summary: summarizeToolInput(toolName, input),
            input,
            canApproveForSession: suggestions.length > 0,
          },
          options.signal,
        );
        // Re-check after waiting: an aborted or stopped session never receives allow.
        if (session.stopped || options.signal.aborted) return deny("Session aborted");
        if (outcome.decision === "approve" || outcome.decision === "approve_for_session") {
          const updatedInput =
            toolName === "AskUserQuestion"
              ? { questions: input.questions, answers: "answers" in outcome ? (outcome.answers ?? {}) : {} }
              : input;
          return {
            behavior: "allow",
            updatedInput,
            ...(outcome.decision === "approve_for_session" ? { updatedPermissions: suggestions } : {}),
          };
        }
        if (outcome.decision === "reject") return deny(REJECTED_MESSAGE);
        return deny("Request expired");
      } catch {
        return deny("The approval could not be delivered");
      }
    };

    const options: Options = {
      cwd: employee.workingDirectory,
      settingSources: SETTING_SOURCES,
      systemPrompt: SYSTEM_PROMPT,
      permissionMode: "default",
      includePartialMessages: true,
      abortController: session.abort,
      canUseTool,
      ...(resume ? { resume } : {}),
      ...(employee.role ? { agent: employee.role } : {}),
    };

    void this.run(employee.id, session, options, sink);
  }

  sendMessage(employeeId: string, text: string): boolean {
    const session = this.sessions.get(employeeId);
    if (!session || session.stopped) return false;
    session.queue.push(userMessage(text));
    return true;
  }

  async fetchCatalog(employeeId: string): Promise<ProviderCatalog | null> {
    const session = this.sessions.get(employeeId);
    return session ? this.readCatalog(session) : null;
  }

  async stop(employeeId: string): Promise<void> {
    const session = this.sessions.get(employeeId);
    if (!session) return;
    this.sessions.delete(employeeId);
    session.stopped = true;
    session.abort.abort();
    try {
      await session.handle?.interrupt?.();
    } catch {
      // the session is being torn down anyway
    }
    try {
      session.handle?.close?.();
    } catch {
      // ignore
    }
    session.queue.close();
  }

  private async run(employeeId: string, session: Session, options: Options, sink: AgentSink): Promise<void> {
    let initSeen = false;
    try {
      const handle = this.queryFn({ prompt: session.queue, options });
      session.handle = handle;
      for await (const raw of handle) {
        if (session.stopped) break;
        const message = raw as unknown as LooseMessage;
        if (message.type === "system" && message.subtype === "init") {
          if (typeof message.session_id === "string") {
            initSeen = true;
            sink.onSessionStarted(message.session_id);
          }
          void this.publishCatalog(session, sink);
        } else if (message.type === "system" && message.subtype === "commands_changed") {
          this.onCommandsChanged(session, message, sink);
        } else if (message.type === "assistant") {
          this.mapAssistant(message, sink);
        } else if (message.type === "user") {
          this.mapUser(message, sink);
        } else if (message.type === "stream_event") {
          this.mapStreamEvent(message, sink);
        } else if (message.type === "rate_limit_event") {
          this.mapRateLimit(message, sink);
        } else if (message.type === "result") {
          if (this.mapResult(message, initSeen, sink) === "failed") {
            this.teardown(employeeId, session);
            return;
          }
        }
        // Unknown message types are ignored on purpose.
      }
      if (!session.stopped) {
        this.teardown(employeeId, session);
        sink.onFailed("The agent session ended unexpectedly");
      }
    } catch (error) {
      if (session.stopped) return;
      this.teardown(employeeId, session);
      sink.onFailed(error instanceof Error ? error.message : String(error));
    }
  }

  /** Reads the live lists, remembers the agents, and returns both; null when the session cannot answer. */
  private async readCatalog(session: Session): Promise<ProviderCatalog | null> {
    const handle = session.handle;
    if (!handle?.supportedCommands || !handle.supportedAgents) return null;
    try {
      const [commands, agents] = await withTimeout(
        Promise.all([handle.supportedCommands(), handle.supportedAgents()]),
        CATALOG_READ_TIMEOUT_MS,
        "Reading the session catalog timed out",
      );
      const catalog = { commands: toCommands(commands), agents: toAgents(agents) };
      session.agents = catalog.agents;
      return catalog;
    } catch {
      return null;
    }
  }

  private async publishCatalog(session: Session, sink: AgentSink): Promise<void> {
    const catalog = await this.readCatalog(session);
    if (catalog && !session.stopped) sink.onCatalog(catalog);
  }

  private onCommandsChanged(session: Session, message: LooseMessage, sink: AgentSink): void {
    if (!session.agents) return; // no full read yet; the post-init read will bring the current commands
    sink.onCatalog({ commands: toCommands(message.commands), agents: session.agents });
  }

  private teardown(employeeId: string, session: Session): void {
    session.stopped = true;
    session.abort.abort();
    try {
      session.handle?.close?.();
    } catch {
      // ignore
    }
    session.queue.close();
    if (this.sessions.get(employeeId) === session) this.sessions.delete(employeeId);
  }

  private mapAssistant(message: LooseMessage, sink: AgentSink): void {
    if (message.error === "rate_limit") {
      sink.onUsage?.({
        rateLimit: {
          status: "rejected",
          utilizationPercent: 100,
          resetsAt: null,
          windowLabel: null,
        },
      });
    }
    const ctx = { parentToolUseId: message.parent_tool_use_id ?? null, sourceUuid: message.uuid ?? null };
    for (const mapped of mapAssistantContent(message.message?.content, ctx)) sink.onMessage(mapped);
  }

  private mapUser(message: LooseMessage, sink: AgentSink): void {
    const ctx = { parentToolUseId: message.parent_tool_use_id ?? null, sourceUuid: message.uuid ?? null };
    for (const mapped of mapUserContent(message.message?.content, ctx)) sink.onMessage(mapped);
  }

  private mapStreamEvent(message: LooseMessage, sink: AgentSink): void {
    if (message.parent_tool_use_id) return;
    const event = message.event;
    if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
      sink.onDelta(event.delta.text);
    }
  }

  private mapRateLimit(message: LooseMessage, sink: AgentSink): void {
    const info = message.rate_limit_info;
    if (!info || typeof info !== "object") return;
    const rawStatus = info.status;
    const status =
      rawStatus === "allowed" || rawStatus === "allowed_warning" || rawStatus === "rejected"
        ? rawStatus
        : "allowed";
    sink.onUsage?.({
      rateLimit: {
        status,
        utilizationPercent: normalizeUtilizationPercent(info.utilization),
        resetsAt: normalizeResetsAt(info.resetsAt),
        windowLabel: formatRateLimitWindow(info.rateLimitType),
      },
    });
  }

  private emitResultUsage(message: LooseMessage, sink: AgentSink): void {
    if (message.modelUsage && typeof message.modelUsage === "object") {
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheRead = 0;
      let contextWindow: number | null = null;
      let found = false;
      for (const entry of Object.values(message.modelUsage)) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.inputTokens === "number" && Number.isFinite(entry.inputTokens)) {
          inputTokens += entry.inputTokens;
          found = true;
        }
        if (typeof entry.outputTokens === "number" && Number.isFinite(entry.outputTokens)) {
          outputTokens += entry.outputTokens;
          found = true;
        }
        if (typeof entry.cacheReadInputTokens === "number" && Number.isFinite(entry.cacheReadInputTokens)) {
          cacheRead += entry.cacheReadInputTokens;
        }
        if (typeof entry.contextWindow === "number" && Number.isFinite(entry.contextWindow) && entry.contextWindow > 0) {
          contextWindow = Math.max(contextWindow ?? 0, entry.contextWindow);
        }
      }
      if (found) {
        const costUsd = typeof message.total_cost_usd === "number" && Number.isFinite(message.total_cost_usd)
          ? message.total_cost_usd
          : null;
        sink.onUsage?.({
          tokens: {
            inputTokens,
            outputTokens,
            contextUsed: contextWindow !== null ? inputTokens + cacheRead : null,
            contextWindow,
            costUsd,
            cumulative: true,
          },
        });
        return;
      }
    }
    const extracted = extractTokenUsage(message as unknown as Record<string, unknown>);
    if (extracted) {
      sink.onUsage?.({ tokens: { ...extracted, cumulative: false } });
    }
  }

  private mapResult(message: LooseMessage, initSeen: boolean, sink: AgentSink): "ok" | "failed" {
    this.emitResultUsage(message, sink);
    if (message.subtype === "success") {
      sink.onTurnFinished();
      return "ok";
    }
    const reason = resultReason(message);
    if (!initSeen) {
      sink.onFailed(reason);
      return "failed";
    }
    sink.onMessage({ kind: "system", content: `The turn ended with an error: ${reason}` });
    sink.onTurnFinished();
    return "ok";
  }
}

function resultReason(message: LooseMessage): string {
  if (Array.isArray(message.errors) && message.errors.length > 0) return message.errors.map(String).join("; ");
  if (typeof message.result === "string" && message.result !== "") return message.result;
  return message.subtype ?? "unknown error";
}

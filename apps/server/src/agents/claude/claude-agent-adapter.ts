import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  Options,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentAdapter, AgentSink, StartParams } from "../../office/ports/agent-adapter.ts";
import { approvalKindFor, summarizeToolInput } from "./approval-mapping.ts";
import { mapAssistantContent, mapUserContent } from "./message-mapping.ts";
import { PushQueue } from "./push-queue.ts";

/** The subset of the SDK `query` function this adapter needs; tests inject a fake. */
export type QueryFunction = (params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => AsyncIterable<SDKMessage> & { interrupt?: () => Promise<unknown>; close?: () => void };

type Session = {
  queue: PushQueue<SDKUserMessage>;
  abort: AbortController;
  stopped: boolean;
  handle?: { interrupt?: () => Promise<unknown>; close?: () => void };
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
      settingSources: ["user", "project", "local"],
      systemPrompt: { type: "preset", preset: "claude_code" },
      permissionMode: "default",
      includePartialMessages: true,
      abortController: session.abort,
      canUseTool,
      ...(resume ? { resume } : {}),
    };

    void this.run(employee.id, session, options, sink);
  }

  sendMessage(employeeId: string, text: string): boolean {
    const session = this.sessions.get(employeeId);
    if (!session || session.stopped) return false;
    session.queue.push(userMessage(text));
    return true;
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
        } else if (message.type === "assistant") {
          this.mapAssistant(message, sink);
        } else if (message.type === "user") {
          this.mapUser(message, sink);
        } else if (message.type === "stream_event") {
          this.mapStreamEvent(message, sink);
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

  private mapResult(message: LooseMessage, initSeen: boolean, sink: AgentSink): "ok" | "failed" {
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

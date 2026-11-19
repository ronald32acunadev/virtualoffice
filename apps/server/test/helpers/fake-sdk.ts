import os from "node:os";
import type { Options, PermissionResult, SDKSessionInfo, SDKUserMessage, SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { PushQueue } from "../../src/agents/claude/push-queue.ts";
import type { QueryFunction } from "../../src/agents/claude/claude-agent-adapter.ts";

type Entry = { kind: "msg"; msg: object } | { kind: "error"; error: Error } | { kind: "end" };

export class FakeSession {
  readonly prompts: string[] = [];
  readonly options: Options;
  interrupted = false;
  closed = false;
  private readonly entries = new PushQueue<Entry>();

  constructor(params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) {
    this.options = params.options ?? {};
    if (typeof params.prompt === "string") {
      this.prompts.push(params.prompt);
    } else {
      void (async () => {
        for await (const message of params.prompt as AsyncIterable<SDKUserMessage>) {
          const content = message.message.content;
          this.prompts.push(typeof content === "string" ? content : JSON.stringify(content));
        }
      })();
    }
    this.options.abortController?.signal.addEventListener("abort", () => this.fail(new Error("aborted")));
  }

  emit(msg: object): void {
    this.entries.push({ kind: "msg", msg });
  }
  fail(error: Error): void {
    this.entries.push({ kind: "error", error });
  }
  end(): void {
    this.entries.push({ kind: "end" });
  }

  init(sessionId = "sess-1"): void {
    this.emit({ type: "system", subtype: "init", session_id: sessionId });
  }
  result(subtype = "success", extra: object = {}): void {
    this.emit({ type: "result", subtype, session_id: "sess-1", ...extra });
  }
  assistant(content: object[], parentToolUseId: string | null = null): void {
    this.emit({ type: "assistant", message: { content }, parent_tool_use_id: parentToolUseId });
  }

  /** Calls the `canUseTool` callback the adapter registered, like the SDK would. */
  askTool(
    toolName: string,
    input: Record<string, unknown>,
    extra: { suggestions?: never[] | object[]; signal?: AbortSignal } = {},
  ): Promise<PermissionResult> {
    const canUseTool = this.options.canUseTool;
    if (!canUseTool) throw new Error("canUseTool missing");
    return canUseTool(toolName, input, {
      signal: extra.signal ?? new AbortController().signal,
      ...(extra.suggestions ? { suggestions: extra.suggestions as never } : {}),
    } as never) as Promise<PermissionResult>;
  }

  asQuery() {
    const entries = this.entries;
    return {
      interrupt: async () => {
        this.interrupted = true;
      },
      close: () => {
        this.closed = true;
        entries.push({ kind: "end" });
      },
      async *[Symbol.asyncIterator]() {
        for await (const entry of entries) {
          if (entry.kind === "msg") yield entry.msg as never;
          else if (entry.kind === "error") throw entry.error;
          else return;
        }
      },
    };
  }
}

export class FakeSdk {
  readonly sessions: FakeSession[] = [];
  /** When set, the next `query()` call throws this error synchronously. */
  throwOnQuery: Error | null = null;

  readonly query: QueryFunction = (params) => {
    if (this.throwOnQuery) {
      const error = this.throwOnQuery;
      this.throwOnQuery = null;
      throw error;
    }
    const session = new FakeSession(params);
    this.sessions.push(session);
    return session.asQuery();
  };

  get last(): FakeSession {
    const session = this.sessions.at(-1);
    if (!session) throw new Error("no fake session started");
    return session;
  }
}

export async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** Fake `listSessions` / `getSessionMessages`; records every call so tests can prove import only reads. */
export class FakeSessionStore {
  sessions: SDKSessionInfo[] = [];
  history = new Map<string, SessionMessage[]>();
  /** Session ids whose `getSessionMessages` rejects. */
  failing = new Set<string>();
  /** When set, `listSessions` rejects with this error. */
  listError: Error | null = null;
  readonly calls: string[] = [];

  readonly list = async (): Promise<SDKSessionInfo[]> => {
    this.calls.push("listSessions");
    if (this.listError) throw this.listError;
    return this.sessions;
  };

  readonly messages = async (sessionId: string): Promise<SessionMessage[]> => {
    this.calls.push(`getSessionMessages:${sessionId}`);
    if (this.failing.has(sessionId)) throw new Error("unreadable");
    return this.history.get(sessionId) ?? [];
  };

  addSession(info: Partial<SDKSessionInfo> & { sessionId: string }, messages: SessionMessage[] = []): void {
    this.sessions.push({ summary: `Summary ${info.sessionId}`, lastModified: 1_000, cwd: os.tmpdir(), ...info });
    this.history.set(info.sessionId, messages);
  }
}

export function userTurn(uuid: string, content: unknown, parent: string | null = null): SessionMessage {
  return { type: "user", uuid, session_id: "s", message: { content }, parent_tool_use_id: parent, parent_agent_id: null };
}

export function assistantTurn(uuid: string, content: object[], parent: string | null = null): SessionMessage {
  return { type: "assistant", uuid, session_id: "s", message: { content }, parent_tool_use_id: parent, parent_agent_id: null };
}

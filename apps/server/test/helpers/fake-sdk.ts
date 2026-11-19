import type { Options, PermissionResult, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
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

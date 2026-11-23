import { describe, it, expect } from "vitest";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { mapAssistantContent } from "../../src/agents/claude/message-mapping.ts";
import { CodexAgentAdapter } from "../../src/agents/codex/codex-agent-adapter.ts";
import { OpenCodeAgentAdapter } from "../../src/agents/opencode/opencode-agent-adapter.ts";
import { AntigravityAgentAdapter } from "../../src/agents/antigravity/antigravity-agent-adapter.ts";
import type { AgentMessage, AgentSink } from "../../src/office/ports/agent-adapter.ts";

function createDummySink(onMessage: (msg: AgentMessage) => void): AgentSink {
  return {
    onSessionStarted: () => {},
    onMessage,
    onDelta: () => {},
    onTurnFinished: () => {},
    onFailed: () => {},
    onCatalog: () => {},
    requestApproval: async () => ({ decision: "reject" }),
  };
}

const dummyEmployee = {
  id: "emp-1",
  bossId: "claude" as const,
  hiredBy: null,
  task: "Test task",
  workingDirectory: "/tmp",
  name: "Test",
  species: "wolf" as const,
  importedAt: null,
  role: null,
  jobTitle: null,
  providerSessionId: null,
  status: "working" as const,
  failureReason: null,
  createdAt: "",
  updatedAt: "",
};

describe("US-02 thinking mapping & persistence", () => {
  it("US-02 / AC-01: SqliteOfficeRepository supports thinking messages", () => {
    const repo = new SqliteOfficeRepository(":memory:");
    repo.insertEmployee({
      ...dummyEmployee,
    });

    repo.insertMessage({
      id: "msg-1",
      employeeId: "emp-1",
      kind: "thinking",
      content: "Evaluating approach...",
      toolName: null,
      toolUseId: null,
      parentToolUseId: null,
      createdAt: "",
      sourceUuid: null,
    });

    const messages = repo.listMessages("emp-1");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.kind).toBe("thinking");
    expect(messages[0]!.content).toBe("Evaluating approach...");
  });

  it("US-02 / AC-02: mapAssistantContent maps thinking blocks correctly", () => {
    const res1 = mapAssistantContent(
      [
        { type: "thinking", thinking: "  Step 1 analysis  " },
        { type: "thinking", thinking: "   " },
      ],
      { parentToolUseId: null, sourceUuid: null },
    );
    expect(res1).toEqual([
      { kind: "thinking", content: "Step 1 analysis", parentToolUseId: null, sourceUuid: null },
    ]);

    const res2 = mapAssistantContent(
      [{ type: "thinking", text: "Fallback text thinking" }],
      { parentToolUseId: "tool-1", sourceUuid: "uuid-9" },
    );
    expect(res2).toEqual([
      { kind: "thinking", content: "Fallback text thinking", parentToolUseId: "tool-1", sourceUuid: "uuid-9" },
    ]);
  });

  it("US-02 / AC-02: CodexAgentAdapter emits thinking message on item.completed reasoning", async () => {
    const messages: AgentMessage[] = [];
    const sink = createDummySink((msg) => messages.push(msg));

    const mockSpawn = () => ({
      stdout: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === "data") {
            cb(Buffer.from(JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "  Codex thought  " } }) + "\n"));
          }
        },
      },
      stderr: { on: () => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") cb(0);
      },
      kill: () => {},
    } as any);

    const adapter = new CodexAgentAdapter(mockSpawn);
    await new Promise<void>((resolve) => {
      const origOnTurnFinished = sink.onTurnFinished;
      sink.onTurnFinished = () => {
        origOnTurnFinished();
        resolve();
      };
      adapter.start({ employee: dummyEmployee, prompt: "hello" }, sink);
    });

    expect(messages).toContainEqual({ kind: "thinking", content: "Codex thought" });
  });

  it("US-02 / AC-02: OpenCodeAgentAdapter emits thinking message on reasoning event", async () => {
    const messages: AgentMessage[] = [];
    const sink = createDummySink((msg) => messages.push(msg));

    const mockSpawn = () => ({
      stdout: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === "data") {
            cb(Buffer.from(JSON.stringify({ type: "reasoning", text: " OpenCode reasoning " }) + "\n"));
          }
        },
      },
      stderr: { on: () => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") cb(0);
      },
      kill: () => {},
    } as any);

    const adapter = new OpenCodeAgentAdapter(mockSpawn);
    await new Promise<void>((resolve) => {
      adapter.start({ employee: dummyEmployee, prompt: "hello" }, sink);
      setTimeout(resolve, 50);
    });

    expect(messages).toContainEqual({ kind: "thinking", content: "OpenCode reasoning" });
  });

  it("US-02 / AC-02: AntigravityAgentAdapter emits thinking message on thought event", async () => {
    const messages: AgentMessage[] = [];
    const sink = createDummySink((msg) => messages.push(msg));

    const mockSpawn = () => ({
      stdout: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === "data") {
            cb(Buffer.from(JSON.stringify({ event: "step_update", step_update: { step_type: "thought", text: " Antigravity thought " } }) + "\n"));
          }
        },
      },
      stderr: { on: () => {} },
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") cb(0);
      },
      kill: () => {},
    } as any);

    const adapter = new AntigravityAgentAdapter({ spawnFn: mockSpawn });
    await new Promise<void>((resolve) => {
      adapter.start({ employee: dummyEmployee, prompt: "hello" }, sink);
      setTimeout(resolve, 50);
    });

    expect(messages).toContainEqual({ kind: "thinking", content: "Antigravity thought" });
  });
});

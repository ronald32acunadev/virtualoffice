import { describe, expect, it } from "vitest";
import { OpenCodeAgentAdapter } from "../../src/agents/opencode/opencode-agent-adapter.ts";
import {
  createFakeSpawner,
  createRecordingSink,
  makeEmployee,
} from "../helpers/fake-cli-process.ts";

describe("OpenCodeAgentAdapter", () => {
  it("spawns start and resume commands with --format json and workingDirectory cwd", () => {
    const spawner = createFakeSpawner();
    const adapter = new OpenCodeAgentAdapter(spawner.spawn);
    const employee = makeEmployee("opencode", "/work/opencode-proj");
    const rec1 = createRecordingSink();

    adapter.start({ employee, prompt: "Fix tests" }, rec1.sink);
    expect(spawner.last.command).toBe("opencode");
    expect(spawner.last.args).toEqual(["run", "--format", "json", "Fix tests"]);
    expect(spawner.last.options.cwd).toBe("/work/opencode-proj");
    expect(adapter.hasSession(employee.id)).toBe(true);
    expect(adapter.sendMessage(employee.id, "ignored")).toBe(false);

    spawner.last.proc.close(0);
    expect(adapter.hasSession(employee.id)).toBe(false);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Continue", resume: "ses_12345" }, rec2.sink);
    expect(spawner.last.args).toEqual([
      "run",
      "--format",
      "json",
      "--session",
      "ses_12345",
      "Continue",
    ]);
    expect(spawner.last.options.cwd).toBe("/work/opencode-proj");
  });

  it("parses step_start, text, tool_use (completed & error), step_finish, and clean exit", () => {
    const spawner = createFakeSpawner();
    const adapter = new OpenCodeAgentAdapter(spawner.spawn);
    const employee = makeEmployee("opencode");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Check files" }, rec.sink);
    const { proc } = spawner.last;

    proc.emitJsonLines([
      { type: "step_start", sessionID: "ses_abc", part: { type: "step-start" } },
      {
        type: "tool_use",
        sessionID: "ses_abc",
        part: {
          type: "tool",
          callID: "call_1",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "pwd" },
            output: "/work/opencode-proj\n",
          },
        },
      },
      {
        type: "tool_use",
        sessionID: "ses_abc",
        part: {
          type: "tool",
          id: "call_2",
          tool: "read",
          state: {
            status: "error",
            input: { path: "missing.txt" },
            output: "",
            error: "ENOENT: no such file",
          },
        },
      },
      { type: "text", sessionID: "ses_abc", part: { type: "text", text: "ok" } },
      { type: "step_finish", sessionID: "ses_abc", part: { reason: "stop" } },
    ]);

    // Waits for clean exit 0 before signaling turn finished
    expect(rec.turnsFinished).toBe(0);
    proc.close(0);

    expect(rec.sessions).toEqual(["ses_abc"]);
    expect(rec.turnsFinished).toBe(1);
    expect(rec.failed).toEqual([]);
    expect(rec.messages).toEqual([
      {
        kind: "tool_call",
        toolName: "bash",
        toolUseId: "call_1",
        content: JSON.stringify({ command: "pwd" }),
      },
      {
        kind: "tool_result",
        toolName: "bash",
        toolUseId: "call_1",
        content: "/work/opencode-proj\n",
      },
      {
        kind: "tool_call",
        toolName: "read",
        toolUseId: "call_2",
        content: JSON.stringify({ path: "missing.txt" }),
      },
      {
        kind: "tool_result",
        toolName: "read",
        toolUseId: "call_2",
        content: "ENOENT: no such file",
      },
      {
        kind: "agent_text",
        content: "ok",
      },
    ]);
  });

  it("handles error events, non-zero exits, signal exits, and stop() cleanly", async () => {
    const spawner = createFakeSpawner();
    const adapter = new OpenCodeAgentAdapter(spawner.spawn, "opencode", 15);
    const employee = makeEmployee("opencode");

    const rec1 = createRecordingSink();
    adapter.start({ employee, prompt: "Error event" }, rec1.sink);
    spawner.last.proc.emitJsonLines([
      { type: "error", error: { name: "ProviderError", data: { message: "Invalid API key" } } },
    ]);
    spawner.last.proc.close(1);
    expect(rec1.failed).toEqual(["Invalid API key"]);
    expect(rec1.turnsFinished).toBe(0);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Non-zero exit" }, rec2.sink);
    spawner.last.proc.emitStderr("connection refused");
    spawner.last.proc.close(1);
    expect(rec2.failed).toEqual(["OpenCode exited with code 1: connection refused"]);

    const rec3 = createRecordingSink();
    adapter.start({ employee, prompt: "External SIGTERM" }, rec3.sink);
    spawner.last.proc.close(null, "SIGTERM");
    expect(rec3.failed).toEqual(["OpenCode process exited with code 143"]);

    const rec4 = createRecordingSink();
    adapter.start({ employee, prompt: "Stop me" }, rec4.sink);
    const proc4 = spawner.last.proc;
    await adapter.stop(employee.id);
    expect(proc4.killSignals).toEqual(["SIGTERM"]);
    proc4.emitJsonLines([{ type: "error", message: "late error" }]);
    proc4.close(1);
    expect(rec4.failed).toEqual([]);
  });
});

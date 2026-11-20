import { describe, expect, it } from "vitest";
import { AntigravityAgentAdapter } from "../../src/agents/antigravity/antigravity-agent-adapter.ts";
import {
  createFakeSpawner,
  createRecordingSink,
  makeEmployee,
} from "../helpers/fake-cli-process.ts";

describe("AntigravityAgentAdapter", () => {
  it("spawns start and resume commands with agy stream-json flags", () => {
    const spawner = createFakeSpawner();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });
    const employee = makeEmployee("gemini", "/work/agy-proj");

    const rec1 = createRecordingSink();
    adapter.start({ employee, prompt: "Check repo" }, rec1.sink);
    expect(spawner.last.command).toBe("agy");
    expect(spawner.last.args).toEqual(["-p", "Check repo", "--output-format", "stream-json"]);
    expect(spawner.last.options.cwd).toBe("/work/agy-proj");
    expect(adapter.hasSession(employee.id)).toBe(true);
    expect(adapter.sendMessage(employee.id, "ignored")).toBe(false);

    spawner.last.proc.close(0);
    expect(adapter.hasSession(employee.id)).toBe(false);

    const rec2 = createRecordingSink();
    adapter.start(
      { employee, prompt: "Follow up", resume: "66989860-9e56-4cab-a072-42dd2febe2a9" },
      rec2.sink,
    );
    expect(spawner.last.args).toEqual([
      "--conversation",
      "66989860-9e56-4cab-a072-42dd2febe2a9",
      "-p",
      "Follow up",
      "--output-format",
      "stream-json",
    ]);
  });

  it("parses real agy NDJSON sequence without duplicating result.response", () => {
    const spawner = createFakeSpawner();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });
    const employee = makeEmployee("gemini");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Reply ok" }, rec.sink);
    const { proc } = spawner.last;

    proc.emitJsonLines([
      {
        event: "init",
        conversation_id: "66989860-9e56-4cab-a072-42dd2febe2a9",
        init: { cwd: "/work/agy-proj", tools: ["read_file"], permission_mode: "always-proceed" },
      },
      {
        event: "step_update",
        step_update: {
          conversation_id: "66989860-9e56-4cab-a072-42dd2febe2a9",
          step_index: 0,
          state: "DONE",
          step_type: "user_input",
        },
      },
      {
        event: "step_update",
        step_update: {
          conversation_id: "66989860-9e56-4cab-a072-42dd2febe2a9",
          step_index: 3,
          state: "ACTIVE",
          step_type: "agent_response",
          text_delta: "ok",
        },
      },
      {
        event: "step_update",
        step_update: {
          conversation_id: "66989860-9e56-4cab-a072-42dd2febe2a9",
          step_index: 3,
          state: "DONE",
          step_type: "agent_response",
          text_delta: "\n",
          duration_seconds: 7.03,
        },
      },
      {
        event: "result",
        result: {
          conversation_id: "66989860-9e56-4cab-a072-42dd2febe2a9",
          status: "SUCCESS",
          response: "ok\n",
          duration_seconds: 25.05,
          num_turns: 1,
        },
      },
    ]);
    proc.close(0);

    expect(rec.sessions).toEqual(["66989860-9e56-4cab-a072-42dd2febe2a9"]);
    expect(rec.deltas).toEqual(["ok", "\n"]);
    expect(rec.messages).toEqual([{ kind: "agent_text", content: "ok" }]);
    expect(rec.turnsFinished).toBe(1);
    expect(rec.failed).toEqual([]);
  });

  it("emits agent_text from result.response when no step_update deltas were sent", () => {
    const spawner = createFakeSpawner();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });
    const employee = makeEmployee("gemini");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Summarize" }, rec.sink);
    spawner.last.proc.emitJsonLines([
      {
        event: "result",
        result: {
          conversation_id: "conv-fallback-1",
          status: "SUCCESS",
          response: "Final summary\n",
        },
      },
    ]);
    spawner.last.proc.close(0);

    expect(rec.sessions).toEqual(["conv-fallback-1"]);
    expect(rec.deltas).toEqual([]);
    expect(rec.messages).toEqual([{ kind: "agent_text", content: "Final summary" }]);
    expect(rec.turnsFinished).toBe(1);
    expect(rec.failed).toEqual([]);
  });

  it("flushes buffered text before tool metadata and emits tool_call and tool_result", () => {
    const spawner = createFakeSpawner();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });
    const employee = makeEmployee("gemini");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Inspect" }, rec.sink);
    spawner.last.proc.emitJsonLines([
      {
        event: "step_update",
        step_update: {
          conversation_id: "conv-tools-1",
          step_index: 1,
          state: "ACTIVE",
          step_type: "agent_response",
          text_delta: "Checking...",
        },
      },
      {
        event: "step_update",
        step_update: {
          conversation_id: "conv-tools-1",
          step_index: 2,
          state: "ACTIVE",
          step_type: "tool_call",
          tool_call_id: "call-1",
          tool_name: "read_file",
          arguments: { path: "package.json" },
        },
      },
      {
        event: "step_update",
        step_update: {
          conversation_id: "conv-tools-1",
          step_index: 2,
          state: "DONE",
          step_type: "tool_call",
          tool_call_id: "call-1",
          tool_name: "read_file",
          output: "{\"name\":\"virtualoffice\"}",
        },
      },
      {
        event: "result",
        result: {
          conversation_id: "conv-tools-1",
          status: "SUCCESS",
          response: "Done",
        },
      },
    ]);
    spawner.last.proc.close(0);

    expect(rec.messages).toEqual([
      { kind: "agent_text", content: "Checking..." },
      {
        kind: "tool_call",
        toolName: "read_file",
        toolUseId: "call-1",
        content: JSON.stringify({ path: "package.json" }),
      },
      {
        kind: "tool_result",
        toolName: "read_file",
        toolUseId: "call-1",
        content: "{\"name\":\"virtualoffice\"}",
      },
    ]);
    expect(rec.turnsFinished).toBe(1);
  });

  it("reports onFailed on non-SUCCESS result status, error event, non-zero exit, and signal", () => {
    const spawner = createFakeSpawner();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });
    const employee = makeEmployee("gemini");

    const rec1 = createRecordingSink();
    adapter.start({ employee, prompt: "Fail status" }, rec1.sink);
    spawner.last.proc.emitJsonLines([
      {
        event: "result",
        result: {
          conversation_id: "conv-err-1",
          status: "FAILED",
          error: { message: "Rate limit reached" },
        },
      },
    ]);
    spawner.last.proc.close(1);
    expect(rec1.failed).toEqual(["Rate limit reached"]);
    expect(rec1.turnsFinished).toBe(0);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Non-zero exit" }, rec2.sink);
    spawner.last.proc.emitStderr("not authenticated");
    spawner.last.proc.close(2);
    expect(rec2.failed).toEqual(["Antigravity exited with code 2: not authenticated"]);

    const rec3 = createRecordingSink();
    adapter.start({ employee, prompt: "Error event" }, rec3.sink);
    spawner.last.proc.emitJsonLines([{ event: "error", message: "Stream aborted" }]);
    spawner.last.proc.close(1);
    expect(rec3.failed).toEqual(["Stream aborted"]);

    const rec4 = createRecordingSink();
    adapter.start({ employee, prompt: "Killed" }, rec4.sink);
    spawner.last.proc.close(null, "SIGTERM");
    expect(rec4.failed).toEqual(["Antigravity process exited with code 143"]);
  });

  it("terminates process cleanly on stop() without calling onFailed", async () => {
    const spawner = createFakeSpawner();
    const adapter = new AntigravityAgentAdapter({
      spawnFn: spawner.spawn,
      command: "custom-agy",
      killGraceMs: 15,
    });
    const employee = makeEmployee("gemini");

    spawner.setNextAutoCloseOnTerm(false);
    const rec = createRecordingSink();
    adapter.start({ employee, prompt: "Long task" }, rec.sink);
    expect(spawner.last.command).toBe("custom-agy");
    const proc = spawner.last.proc;

    await adapter.stop(employee.id);

    expect(proc.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(adapter.hasSession(employee.id)).toBe(false);
    expect(rec.failed).toEqual([]);
    expect(rec.turnsFinished).toBe(0);
  });
});

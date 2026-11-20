import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isBinaryAvailable } from "../../src/agents/binary-availability.ts";
import { GeminiAgentAdapter } from "../../src/agents/gemini/gemini-agent-adapter.ts";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import {
  createFakeSpawner,
  createRecordingSink,
  makeEmployee,
} from "../helpers/fake-cli-process.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("GeminiAgentAdapter", () => {
  it("spawns start and resume commands with stream-json output format", () => {
    const spawner = createFakeSpawner();
    const adapter = new GeminiAgentAdapter(spawner.spawn);
    const employee = makeEmployee("gemini", "/work/gemini-proj");
    const rec1 = createRecordingSink();

    adapter.start({ employee, prompt: "Summarize changes" }, rec1.sink);
    expect(spawner.last.command).toBe("gemini");
    expect(spawner.last.args).toEqual(["-p", "Summarize changes", "--output-format", "stream-json"]);
    expect(spawner.last.options.cwd).toBe("/work/gemini-proj");
    expect(adapter.hasSession(employee.id)).toBe(true);
    expect(adapter.sendMessage(employee.id, "ignored")).toBe(false);

    spawner.last.proc.close(0);
    expect(adapter.hasSession(employee.id)).toBe(false);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "More details", resume: "gem-sess-77" }, rec2.sink);
    expect(spawner.last.args).toEqual([
      "--resume",
      "gem-sess-77",
      "-p",
      "More details",
      "--output-format",
      "stream-json",
    ]);
  });

  it("parses init, streaming deltas flushed around tool calls and result, and non-delta messages", () => {
    const spawner = createFakeSpawner();
    const adapter = new GeminiAgentAdapter(spawner.spawn);
    const employee = makeEmployee("gemini");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Inspect project" }, rec.sink);
    const { proc } = spawner.last;

    proc.emitJsonLines([
      { type: "init", session_id: "gem-123" },
      { type: "message", role: "user", content: "Inspect project" },
      { type: "message", role: "assistant", content: "Let me ", delta: true },
      { type: "message", role: "assistant", content: "check.", delta: true },
      { type: "tool_use", tool_name: "read_file", tool_id: "t1", parameters: { path: "README.md" } },
      { type: "tool_result", tool_id: "t1", output: "# Hello", status: "success" },
      { type: "message", role: "assistant", content: "Done!" },
      { type: "result", status: "success" },
    ]);
    proc.close(0);

    expect(rec.sessions).toEqual(["gem-123"]);
    expect(rec.deltas).toEqual(["Let me ", "check."]);
    expect(rec.turnsFinished).toBe(1);
    expect(rec.failed).toEqual([]);
    expect(rec.messages).toEqual([
      { kind: "agent_text", content: "Let me check." },
      {
        kind: "tool_call",
        toolName: "read_file",
        toolUseId: "t1",
        content: JSON.stringify({ path: "README.md" }),
      },
      {
        kind: "tool_result",
        toolName: "read_file",
        toolUseId: "t1",
        content: "# Hello",
      },
      { kind: "agent_text", content: "Done!" },
    ]);
  });

  it("flushes trailing delta text on result or close without newline", () => {
    const spawner = createFakeSpawner();
    const adapter = new GeminiAgentAdapter(spawner.spawn);
    const employee = makeEmployee("gemini");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Say hi" }, rec.sink);
    spawner.last.proc.emitStdout(
      `${JSON.stringify({ type: "init", session_id: "gem-trailing" })}\n` +
        `${JSON.stringify({ type: "message", role: "assistant", content: "Hi", delta: true })}\n` +
        JSON.stringify({ type: "result", status: "success" }),
    );
    spawner.last.proc.close(0);

    expect(rec.sessions).toEqual(["gem-trailing"]);
    expect(rec.messages).toEqual([{ kind: "agent_text", content: "Hi" }]);
    expect(rec.turnsFinished).toBe(1);
  });

  it("handles error result, non-zero exit, spawn error, and stop() cleanly", async () => {
    const spawner = createFakeSpawner();
    const adapter = new GeminiAgentAdapter(spawner.spawn, "gemini", 15);
    const employee = makeEmployee("gemini");

    const rec1 = createRecordingSink();
    adapter.start({ employee, prompt: "Fail result" }, rec1.sink);
    spawner.last.proc.emitJsonLines([
      { type: "message", role: "assistant", content: "Partial", delta: true },
      { type: "result", status: "error", error: { message: "Quota exceeded" } },
    ]);
    spawner.last.proc.close(1);
    expect(rec1.messages).toEqual([{ kind: "agent_text", content: "Partial" }]);
    expect(rec1.failed).toEqual(["Quota exceeded"]);
    expect(rec1.turnsFinished).toBe(0);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Non-zero exit" }, rec2.sink);
    spawner.last.proc.emitStderr("auth required");
    spawner.last.proc.close(1);
    expect(rec2.failed).toEqual(["Gemini CLI exited with code 1: auth required"]);

    const rec3 = createRecordingSink();
    adapter.start({ employee, prompt: "Missing binary" }, rec3.sink);
    spawner.last.proc.emitError(new Error("spawn gemini ENOENT"));
    expect(rec3.failed).toEqual(["Failed to run Gemini CLI: spawn gemini ENOENT"]);

    spawner.setNextAutoCloseOnTerm(false);
    const rec4 = createRecordingSink();
    adapter.start({ employee, prompt: "Hang" }, rec4.sink);
    const proc4 = spawner.last.proc;
    await adapter.stop(employee.id);
    expect(proc4.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(rec4.failed).toEqual([]);
  });

  it("reflects PATH availability in OfficeService when gemini is absent vs installed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vo-gemini-path-"));
    tempDirs.push(dir);

    const createForPath = (envPath: string) =>
      new OfficeService({
        repository: new SqliteOfficeRepository(":memory:"),
        events: new InMemoryEventBus(),
        adapters: {
          ...(isBinaryAvailable("gemini", envPath) ? { gemini: new GeminiAgentAdapter() } : {}),
        },
      });

    const withoutGemini = createForPath(dir);
    expect(withoutGemini.listBosses().find((b) => b.id === "gemini")?.available).toBe(false);
    expect(() =>
      withoutGemini.hire({ bossId: "gemini", task: "Hi", workingDirectory: dir }),
    ).toThrow(/not available/i);

    const binPath = path.join(dir, "gemini");
    fs.writeFileSync(binPath, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(binPath, 0o755);

    const withGemini = createForPath(dir);
    expect(withGemini.listBosses().find((b) => b.id === "gemini")?.available).toBe(true);
  });
});

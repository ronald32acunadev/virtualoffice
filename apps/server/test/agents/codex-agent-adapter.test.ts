import os from "node:os";
import { describe, expect, it } from "vitest";
import { CodexAgentAdapter } from "../../src/agents/codex/codex-agent-adapter.ts";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import {
  createFakeSpawner,
  createRecordingSink,
  makeEmployee,
} from "../helpers/fake-cli-process.ts";

describe("CodexAgentAdapter", () => {
  it("spawns start and resume commands with the expected arguments and cwd", () => {
    const spawner = createFakeSpawner();
    const adapter = new CodexAgentAdapter(spawner.spawn);
    const employee = makeEmployee("codex", "/work/repo");
    const rec1 = createRecordingSink();

    adapter.start({ employee, prompt: "Inspect repo" }, rec1.sink);
    expect(spawner.last.command).toBe("codex");
    expect(spawner.last.args).toEqual([
      "exec",
      "--json",
      "--cd",
      "/work/repo",
      "--skip-git-repo-check",
      "Inspect repo",
    ]);
    expect(spawner.last.options.cwd).toBe("/work/repo");
    expect(adapter.hasSession(employee.id)).toBe(true);
    expect(adapter.sendMessage(employee.id, "ignored")).toBe(false);

    spawner.last.proc.close(0);
    expect(adapter.hasSession(employee.id)).toBe(false);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Follow up", resume: "01a1f646-abc" }, rec2.sink);
    expect(spawner.last.args).toEqual(["exec", "resume", "01a1f646-abc", "--json", "Follow up"]);
    expect(spawner.last.options.cwd).toBe("/work/repo");
  });

  it("parses thread.started, command_execution, mcp_tool_call, advisory error, agent_message, and turn.completed", async () => {
    const spawner = createFakeSpawner();
    const adapter = new CodexAgentAdapter(spawner.spawn);
    const employee = makeEmployee("codex");
    const rec = createRecordingSink();

    adapter.start({ employee, prompt: "Run checks" }, rec.sink);
    const { proc } = spawner.last;

    // Include noise line, partial chunk split across data events, and advisory error
    proc.emitStdout("non-json warning line\n");
    proc.emitStdout('{"type":"thread.');
    proc.emitStdout('started","thread_id":"01a1f646-1234"}\n');
    proc.emitJsonLines([
      {
        type: "item.completed",
        item: { id: "item_0", type: "error", message: "project_doc_max_bytes exceeded" },
      },
      {
        type: "item.started",
        item: { id: "item_1", type: "command_execution", command: "ls -la", status: "in_progress" },
      },
      {
        type: "item.completed",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "ls -la",
          aggregated_output: "",
          exit_code: 0,
          status: "completed",
        },
      },
      {
        type: "item.started",
        item: {
          id: "item_2",
          type: "mcp_tool_call",
          server: "engram",
          tool: "mem_current_project",
          arguments: { cwd: "/work" },
        },
      },
      {
        type: "item.completed",
        item: {
          id: "item_2",
          type: "mcp_tool_call",
          server: "engram",
          tool: "mem_current_project",
          result: { project: "virtualoffice" },
          error: null,
        },
      },
      {
        type: "item.completed",
        item: { id: "item_4", type: "agent_message", text: "ok" },
      },
      { type: "turn.completed" },
    ]);
    proc.close(0);

    expect(rec.sessions).toEqual(["01a1f646-1234"]);
    expect(rec.failed).toEqual([]);
    expect(rec.turnsFinished).toBe(1);
    expect(rec.messages).toEqual([
      {
        kind: "tool_call",
        toolName: "Bash",
        toolUseId: "item_1",
        content: JSON.stringify({ command: "ls -la" }),
      },
      {
        kind: "tool_result",
        toolName: "Bash",
        toolUseId: "item_1",
        content: "Exit code: 0",
      },
      {
        kind: "tool_call",
        toolName: "engram:mem_current_project",
        toolUseId: "item_2",
        content: JSON.stringify({ cwd: "/work" }),
      },
      {
        kind: "tool_result",
        toolName: "engram:mem_current_project",
        toolUseId: "item_2",
        content: JSON.stringify({ project: "virtualoffice" }),
      },
      {
        kind: "agent_text",
        content: "ok",
      },
    ]);
    await expect(adapter.fetchCatalog(employee.id)).resolves.toBeNull();
  });

  it("reports turn.failed, non-zero exit with stderr, and spawn errors", () => {
    const spawner = createFakeSpawner();
    const adapter = new CodexAgentAdapter(spawner.spawn);
    const employee = makeEmployee("codex");

    const rec1 = createRecordingSink();
    adapter.start({ employee, prompt: "Fail turn" }, rec1.sink);
    spawner.last.proc.emitJsonLines([
      { type: "turn.failed", error: { message: "Rate limit exceeded" } },
    ]);
    spawner.last.proc.close(1);
    expect(rec1.failed).toEqual(["Rate limit exceeded"]);
    expect(rec1.turnsFinished).toBe(0);

    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Crash" }, rec2.sink);
    spawner.last.proc.emitStderr("fatal auth failure\n");
    spawner.last.proc.close(2);
    expect(rec2.failed).toEqual(["Codex exited with code 2: fatal auth failure"]);

    const rec3 = createRecordingSink();
    adapter.start({ employee, prompt: "Missing binary" }, rec3.sink);
    spawner.last.proc.emitError(new Error("spawn codex ENOENT"));
    expect(rec3.failed).toEqual(["Failed to run Codex: spawn codex ENOENT"]);
    expect(adapter.hasSession(employee.id)).toBe(false);
  });

  it("stops cleanly with SIGTERM, suppresses late events, and falls back to SIGKILL", async () => {
    const spawner = createFakeSpawner();
    const adapter = new CodexAgentAdapter(spawner.spawn, "codex", 15);
    const employee = makeEmployee("codex");

    const rec1 = createRecordingSink();
    adapter.start({ employee, prompt: "Long task" }, rec1.sink);
    const proc1 = spawner.last.proc;

    await adapter.stop(employee.id);
    expect(adapter.hasSession(employee.id)).toBe(false);
    expect(proc1.killSignals).toEqual(["SIGTERM"]);

    // Late stdout/error after stop must be suppressed
    proc1.emitJsonLines([{ type: "item.completed", item: { id: "i", type: "agent_message", text: "late" } }]);
    proc1.close(1);
    expect(rec1.messages).toEqual([]);
    expect(rec1.failed).toEqual([]);
    expect(rec1.turnsFinished).toBe(0);

    // Unresponsive process triggers SIGKILL after grace period
    spawner.setNextAutoCloseOnTerm(false);
    const rec2 = createRecordingSink();
    adapter.start({ employee, prompt: "Stubborn task" }, rec2.sink);
    const proc2 = spawner.last.proc;

    await adapter.stop(employee.id);
    expect(proc2.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(rec2.failed).toEqual([]);
  });

  it("integrates with OfficeService across hire, follow-up resume, and stop", async () => {
    const spawner = createFakeSpawner();
    const adapter = new CodexAgentAdapter(spawner.spawn);
    const repository = new SqliteOfficeRepository(":memory:");
    const office = new OfficeService({
      repository,
      adapters: { codex: adapter },
      events: new InMemoryEventBus(),
    });

    const emp = office.hire({
      bossId: "codex",
      task: "First prompt",
      workingDirectory: os.tmpdir(),
    });

    spawner.last.proc.emitJsonLines([
      { type: "thread.started", thread_id: "codex-thread-99" },
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "Done 1" } },
      { type: "turn.completed" },
    ]);
    spawner.last.proc.close(0);

    const idleEmp = repository.getEmployee(emp.id)!;
    expect(idleEmp.status).toBe("idle");
    expect(idleEmp.providerSessionId).toBe("codex-thread-99");

    await office.sendMessage(emp.id, "Second prompt");
    expect(spawner.calls).toHaveLength(2);
    expect(spawner.last.args).toEqual(["exec", "resume", "codex-thread-99", "--json", "Second prompt"]);

    await office.stop(emp.id);
    expect(repository.getEmployee(emp.id)?.status).toBe("stopped");
  });
});

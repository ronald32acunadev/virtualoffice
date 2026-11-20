import { describe, expect, it } from "vitest";
import type { Employee } from "../../src/office/domain/types.ts";
import { resolveAgentCliCommand } from "../../src/terminal/agent-cli-command.ts";
import {
  TerminalError,
  TerminalSessionManager,
  type PtyDisposable,
  type PtyFactory,
  type PtyProcess,
  type PtySpawnOptions,
} from "../../src/terminal/terminal-session-manager.ts";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    bossId: "claude",
    hiredBy: null,
    task: "Fix",
    workingDirectory: "/work/app",
    name: "Ada",
    species: "fox",
    importedAt: null,
    role: null,
    jobTitle: null,
    providerSessionId: null,
    status: "idle",
    failureReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

class FakePty implements PtyProcess {
  writes: string[] = [];
  resizes: Array<[number, number]> = [];
  kills = 0;
  private onDataListeners: Array<(data: string) => void> = [];
  private onExitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void): PtyDisposable {
    this.onDataListeners.push(listener);
    return { dispose: () => {} };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): PtyDisposable {
    this.onExitListeners.push(listener);
    return { dispose: () => {} };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows]);
  }

  kill(): void {
    this.kills++;
  }

  emitData(data: string): void {
    for (const listener of this.onDataListeners) {
      listener(data);
    }
  }

  emitExit(exitCode: number): void {
    for (const listener of this.onExitListeners) {
      listener({ exitCode });
    }
  }
}

function setup(options: {
  employees?: Map<string, Employee>;
  available?: Set<string>;
  pathExists?: boolean;
  scrollbackBytes?: number;
} = {}) {
  const employees = options.employees ?? new Map([["emp-1", makeEmployee()]]);
  const available = options.available ?? new Set(["claude", "codex", "opencode", "agy", "gemini"]);
  const spawned: Array<{ command: string; args: string[]; options: PtySpawnOptions }> = [];
  const ptys: FakePty[] = [];
  const activeChanges: Array<[string, boolean]> = [];

  const getEmployee = (id: string): Employee | null => {
    const emp = employees.get(id);
    return emp ?? null;
  };

  const isBinaryAvailable = (bin: string): boolean => available.has(bin);

  const ptyFactory: PtyFactory = (command, args, opts) => {
    const pty = new FakePty();
    ptys.push(pty);
    spawned.push({ command, args, options: opts });
    return pty;
  };

  const pathExists = (path: string): boolean => options.pathExists ?? true;

  const manager = new TerminalSessionManager({
    getEmployee,
    ptyFactory,
    isBinaryAvailable,
    pathExists,
    env: { PATH: "/usr/bin" },
    ...(options.scrollbackBytes !== undefined ? { scrollbackBytes: options.scrollbackBytes } : {}),
    onActiveChange: (id, active) => activeChanges.push([id, active]),
  });

  return { manager, spawned, ptys, activeChanges };
}

describe("resolveAgentCliCommand", () => {
  it("US-01 / AC-01: claude resumes with --resume", () => {
    const result = resolveAgentCliCommand(
      { bossId: "claude", providerSessionId: "s1" },
      (bin) => bin === "claude",
    );
    expect(result).toEqual({ command: "claude", args: ["--resume", "s1"] });

    const resultNoSid = resolveAgentCliCommand(
      { bossId: "claude", providerSessionId: null },
      (bin) => bin === "claude",
    );
    expect(resultNoSid).toEqual({ command: "claude", args: [] });
  });

  it("US-01 / AC-01: codex resumes with the resume subcommand", () => {
    const result = resolveAgentCliCommand(
      { bossId: "codex", providerSessionId: "s1" },
      (bin) => bin === "codex",
    );
    expect(result).toEqual({ command: "codex", args: ["resume", "s1"] });
  });

  it("US-01 / AC-01: opencode resumes with --session", () => {
    const result = resolveAgentCliCommand(
      { bossId: "opencode", providerSessionId: "s1" },
      (bin) => bin === "opencode",
    );
    expect(result).toEqual({ command: "opencode", args: ["--session", "s1"] });
  });

  it("US-01 / AC-01: gemini slot prefers agy with --conversation and falls back to gemini --resume", () => {
    const withAgy = resolveAgentCliCommand(
      { bossId: "gemini", providerSessionId: "s1" },
      (bin) => bin === "agy" || bin === "gemini",
    );
    expect(withAgy).toEqual({ command: "agy", args: ["--conversation", "s1"] });

    const onlyGemini = resolveAgentCliCommand(
      { bossId: "gemini", providerSessionId: "s1" },
      (bin) => bin === "gemini",
    );
    expect(onlyGemini).toEqual({ command: "gemini", args: ["--resume", "s1"] });
  });

  it("US-01 / AC-04: returns null when the CLI is not installed", () => {
    const result1 = resolveAgentCliCommand(
      { bossId: "claude", providerSessionId: "s1" },
      () => false,
    );
    expect(result1).toBeNull();

    const result2 = resolveAgentCliCommand(
      { bossId: "gemini", providerSessionId: "s1" },
      () => false,
    );
    expect(result2).toBeNull();
  });
});

describe("TerminalSessionManager", () => {
  it("US-01 / AC-01: open spawns the boss CLI in the working directory with the requested size", () => {
    const { manager, spawned, activeChanges } = setup({
      employees: new Map([["emp-1", makeEmployee({ bossId: "codex", providerSessionId: "s9" })]]),
    });

    const session = manager.open("emp-1", { cols: 120, rows: 40 });

    expect(spawned).toEqual([
      {
        command: "codex",
        args: ["resume", "s9"],
        options: {
          name: "xterm-256color",
          cols: 120,
          rows: 40,
          cwd: "/work/app",
          env: { PATH: "/usr/bin", TERM: "xterm-256color", COLORTERM: "truecolor" },
        },
      },
    ]);
    expect(manager.isActive("emp-1")).toBe(true);
    expect(manager.listActive()).toEqual(["emp-1"]);
    expect(activeChanges).toEqual([["emp-1", true]]);
  });

  it("US-01 / AC-02: opening again reuses the live session", () => {
    const { manager, spawned } = setup({
      employees: new Map([["emp-1", makeEmployee()]]),
    });

    const session1 = manager.open("emp-1", { cols: 80, rows: 24 });
    const session2 = manager.open("emp-1", { cols: 100, rows: 30 });

    expect(session1).toBe(session2);
    expect(spawned.length).toBe(1);
  });

  it("US-01 / AC-03: write and resize reach the pty and output is forwarded", () => {
    const { manager, ptys } = setup({
      employees: new Map([["emp-1", makeEmployee()]]),
    });

    const session = manager.open("emp-1", { cols: 80, rows: 24 });
    session.write("ls\r");
    session.resize(100, 30);

    expect(ptys[0]!.writes).toEqual(["ls\r"]);
    expect(ptys[0]!.resizes).toEqual([[100, 30]]);

    const onData: Array<string> = [];
    const unsubscribe = session.onData((data) => onData.push(data));
    ptys[0]!.emitData("hi");
    expect(onData).toEqual(["hi"]);
    expect(session.scrollback()).toBe("hi");

    unsubscribe();
  });

  it("US-01 / AC-03: scrollback keeps only the newest bytes", () => {
    const { manager, ptys } = setup({
      employees: new Map([["emp-1", makeEmployee()]]),
      scrollbackBytes: 10,
    });

    const session = manager.open("emp-1", { cols: 80, rows: 24 });

    ptys[0]!.emitData("aaaa");
    ptys[0]!.emitData("bbbb");
    ptys[0]!.emitData("cccc");
    expect(session.scrollback()).toBe("bbbbcccc");

    ptys[0]!.emitData("0123456789XY");
    expect(session.scrollback()).toBe("23456789XY");
  });

  it("US-01 / AC-03: exit reports the code and frees the slot", () => {
    const { manager, ptys, activeChanges } = setup({
      employees: new Map([["emp-1", makeEmployee()]]),
    });

    const session = manager.open("emp-1", { cols: 80, rows: 24 });
    const onExit: Array<number> = [];
    const unsubscribe = session.onExit((code) => onExit.push(code));

    ptys[0]!.emitExit(3);
    expect(onExit).toEqual([3]);
    expect(session.exited).toBe(true);
    expect(session.exitCode).toBe(3);
    expect(manager.isActive("emp-1")).toBe(false);
    expect(manager.get("emp-1")).toBeUndefined();
    expect(activeChanges).toEqual([["emp-1", true], ["emp-1", false]]);

    session.write("x");
    expect(ptys[0]!.writes).toEqual([]);

    const late: number[] = [];
    session.onExit((code) => late.push(code));
    expect(late).toEqual([3]);
  });

  it("US-01 / AC-04: rejects unknown employee, missing folder and missing CLI without spawning", () => {
    const { manager: manager1, spawned: spawned1 } = setup();
    expect(() => manager1.open("unknown", { cols: 80, rows: 24 })).toThrow(
      expect.objectContaining({ name: "TerminalError", code: "not_found", status: 404 }),
    );
    expect(spawned1).toEqual([]);

    const { manager: manager2, spawned: spawned2 } = setup({ pathExists: false });
    expect(() => manager2.open("emp-1", { cols: 80, rows: 24 })).toThrow(
      expect.objectContaining({ name: "TerminalError", code: "folder_missing", status: 409 }),
    );
    expect(spawned2).toEqual([]);

    const { manager: manager3, spawned: spawned3 } = setup({ available: new Set() });
    expect(() => manager3.open("emp-1", { cols: 80, rows: 24 })).toThrow(
      expect.objectContaining({ name: "TerminalError", code: "target_unavailable", status: 409 }),
    );
    expect(spawned3).toEqual([]);
  });

  it("US-01 / AC-04: killAll kills every live session", () => {
    const { manager, ptys } = setup({
      employees: new Map([
        ["emp-1", makeEmployee()],
        ["emp-2", makeEmployee()],
      ]),
    });

    manager.open("emp-1", { cols: 80, rows: 24 });
    manager.open("emp-2", { cols: 80, rows: 24 });

    manager.killAll();

    expect(ptys[0]!.kills).toBe(1);
    expect(ptys[1]!.kills).toBe(1);
    expect(manager.kill("missing")).toBe(false);
  });
});

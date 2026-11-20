import { EventEmitter } from "node:events";
import type {
  CliChildProcess,
  SpawnFunction,
  SpawnOptions,
} from "../../src/agents/cli-jsonl-adapter.ts";
import type { Employee, BossId } from "../../src/office/domain/types.ts";
import type { AgentMessage, AgentSink } from "../../src/office/ports/agent-adapter.ts";

export class FakeCliProcess implements CliChildProcess {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  private readonly emitter = new EventEmitter();
  killed = false;
  exitCode: number | null = null;
  readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];
  autoCloseOnTerm = true;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.killSignals.push(signal);
    if (signal === "SIGTERM" && this.autoCloseOnTerm) {
      queueMicrotask(() => this.close(null, "SIGTERM"));
    }
    return true;
  }

  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(
    event: string,
    listener:
      | ((error: Error) => void)
      | ((code: number | null, signal: NodeJS.Signals | null) => void),
  ): unknown {
    return this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  emitStdout(chunk: string): void {
    this.stdout.emit("data", Buffer.from(chunk, "utf8"));
  }

  emitJsonLines(events: readonly unknown[]): void {
    const payload = events
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join("\n");
    this.emitStdout(`${payload}\n`);
  }

  emitStderr(text: string): void {
    this.stderr.emit("data", Buffer.from(text, "utf8"));
  }

  emitError(error: Error): void {
    this.emitter.emit("error", error);
  }

  close(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code;
    this.emitter.emit("close", code, signal);
  }
}

export type SpawnCall = {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
  proc: FakeCliProcess;
};

export function createFakeSpawner() {
  const calls: SpawnCall[] = [];
  let nextAutoCloseOnTerm = true;

  const spawn: SpawnFunction = (command, args, options) => {
    const proc = new FakeCliProcess();
    proc.autoCloseOnTerm = nextAutoCloseOnTerm;
    nextAutoCloseOnTerm = true;
    calls.push({ command, args, options, proc });
    return proc;
  };

  return {
    spawn,
    calls,
    setNextAutoCloseOnTerm(value: boolean) {
      nextAutoCloseOnTerm = value;
    },
    get last(): SpawnCall {
      const entry = calls.at(-1);
      if (!entry) throw new Error("No spawn calls recorded");
      return entry;
    },
  };
}

export function createRecordingSink() {
  const sessions: string[] = [];
  const messages: AgentMessage[] = [];
  const deltas: string[] = [];
  const failed: string[] = [];
  let turnsFinished = 0;

  const sink: AgentSink = {
    onSessionStarted: (id) => sessions.push(id),
    onMessage: (message) => messages.push(message),
    onDelta: (text) => deltas.push(text),
    onTurnFinished: () => {
      turnsFinished += 1;
    },
    onFailed: (reason) => failed.push(reason),
    onCatalog: () => {},
    requestApproval: () => Promise.resolve({ decision: "expired" }),
  };

  return {
    sink,
    sessions,
    messages,
    deltas,
    failed,
    get turnsFinished() {
      return turnsFinished;
    },
  };
}

export function makeEmployee(bossId: BossId, workingDirectory = "/tmp/project"): Employee {
  const now = "2026-11-19T00:00:00.000Z";
  return {
    id: `emp-${bossId}-1`,
    bossId,
    hiredBy: null,
    task: "Run task",
    workingDirectory,
    name: "TestBot",
    species: "wolf",
    importedAt: null,
    role: null,
    providerSessionId: null,
    status: "starting",
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

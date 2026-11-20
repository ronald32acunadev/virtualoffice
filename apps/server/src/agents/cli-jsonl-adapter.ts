import { spawn } from "node:child_process";
import type { AgentAdapter, AgentSink, StartParams } from "../office/ports/agent-adapter.ts";
import type { ProviderCatalog } from "../office/domain/types.ts";

const DEFAULT_KILL_GRACE_MS = 500;
const MAX_STDERR_CHARS = 8 * 1024;

export interface CliReadable {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}

export interface CliChildProcess {
  readonly stdout: CliReadable | null;
  readonly stderr: CliReadable | null;
  readonly killed: boolean;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}

export type SpawnOptions = {
  cwd: string;
  stdio: ["ignore", "pipe", "pipe"];
  env: NodeJS.ProcessEnv;
};

export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => CliChildProcess;

export const defaultSpawn: SpawnFunction = (command, args, options) => spawn(command, args, options);

export interface CliLineParser {
  onLine(line: string): void;
  onClose(code: number | null, signal: NodeJS.Signals | null, stderr: string): void;
}

export interface CliProviderSpec {
  name: string;
  command: string;
  buildArgs(params: StartParams): string[];
  createParser(sink: AgentSink): CliLineParser;
}

type ActiveProcess = {
  child: CliChildProcess;
  stopped: boolean;
  closed: boolean;
  onClosed: (() => void)[];
};

function isSignalTerminationCode(code: number | null, signal: NodeJS.Signals | null): boolean {
  return signal === "SIGTERM" || signal === "SIGINT" || code === 130 || code === 143;
}

function signalExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  return signal === "SIGINT" ? 130 : 143;
}

function flushClosedCallbacks(entry: ActiveProcess): void {
  entry.closed = true;
  for (const cb of entry.onClosed.splice(0)) {
    cb();
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export class CliJsonlAdapter implements AgentAdapter {
  private readonly active = new Map<string, ActiveProcess>();

  constructor(
    private readonly spec: CliProviderSpec,
    private readonly spawnFn: SpawnFunction = defaultSpawn,
    private readonly killGraceMs: number = DEFAULT_KILL_GRACE_MS,
  ) {}

  hasSession(employeeId: string): boolean {
    return this.active.has(employeeId);
  }

  start(params: StartParams, sink: AgentSink): void {
    const employeeId = params.employee.id;
    const existing = this.active.get(employeeId);
    if (existing) {
      existing.stopped = true;
      this.active.delete(employeeId);
      try {
        existing.child.kill("SIGTERM");
      } catch {
        // ignore cleanup failure on replaced process
      }
    }

    const args = this.spec.buildArgs(params);
    let child: CliChildProcess;
    try {
      child = this.spawnFn(this.spec.command, args, {
        cwd: params.employee.workingDirectory,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      sink.onFailed(`Failed to start ${this.spec.name}: ${reason}`);
      return;
    }

    const entry: ActiveProcess = {
      child,
      stopped: false,
      closed: false,
      onClosed: [],
    };
    this.active.set(employeeId, entry);

    let terminated = false;
    const guardedSink: AgentSink = {
      onSessionStarted: (providerSessionId) => {
        if (entry.stopped || terminated) return;
        sink.onSessionStarted(providerSessionId);
      },
      onMessage: (message) => {
        if (entry.stopped || terminated) return;
        sink.onMessage(message);
      },
      onDelta: (text) => {
        if (entry.stopped || terminated) return;
        sink.onDelta(text);
      },
      onTurnFinished: () => {
        if (entry.stopped || terminated) return;
        terminated = true;
        sink.onTurnFinished();
      },
      onFailed: (reason) => {
        if (entry.stopped || terminated) return;
        terminated = true;
        sink.onFailed(reason);
      },
      onCatalog: (catalog) => {
        if (entry.stopped || terminated) return;
        sink.onCatalog(catalog);
      },
      requestApproval: (prompt, signal) => {
        if (entry.stopped || terminated) return Promise.resolve({ decision: "expired" });
        return sink.requestApproval(prompt, signal);
      },
    };

    const parser = this.spec.createParser(guardedSink);
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const safeParseLine = (line: string): void => {
      try {
        parser.onLine(line);
      } catch {
        // ignore malformed or unexpected parser errors for a single line
      }
    };

    child.stdout?.on("data", (chunk) => {
      if (entry.stopped) return;
      stdoutBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (line.trim() !== "") {
          safeParseLine(line);
        }
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr?.on("data", (chunk) => {
      if (entry.stopped || stderrBuffer.length >= MAX_STDERR_CHARS) return;
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderrBuffer += text.slice(0, MAX_STDERR_CHARS - stderrBuffer.length);
    });

    child.on("error", (error) => {
      if (this.active.get(employeeId) === entry) {
        this.active.delete(employeeId);
      }
      flushClosedCallbacks(entry);
      if (entry.stopped) return;
      guardedSink.onFailed(`Failed to run ${this.spec.name}: ${error.message}`);
    });

    child.on("close", (code, signal) => {
      if (this.active.get(employeeId) === entry) {
        this.active.delete(employeeId);
      }
      flushClosedCallbacks(entry);
      if (entry.stopped) return;

      const trailing = stdoutBuffer.replace(/\r$/, "");
      stdoutBuffer = "";
      if (trailing.trim() !== "") {
        safeParseLine(trailing);
      }

      if (isSignalTerminationCode(code, signal)) {
        guardedSink.onFailed(
          `${this.spec.name} process exited with code ${signalExitCode(code, signal)}`,
        );
        return;
      }

      parser.onClose(code, signal, stderrBuffer);
    });
  }

  sendMessage(_employeeId: string, _text: string): boolean {
    return false;
  }

  fetchCatalog(_employeeId: string): Promise<ProviderCatalog | null> {
    return Promise.resolve(null);
  }

  async stop(employeeId: string): Promise<void> {
    const entry = this.active.get(employeeId);
    if (!entry) return;
    entry.stopped = true;
    this.active.delete(employeeId);
    if (entry.closed || entry.child.exitCode !== null) return;

    await new Promise<void>((resolve) => {
      let resolved = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve();
      };

      entry.onClosed.push(done);
      try {
        entry.child.kill("SIGTERM");
      } catch {
        done();
        return;
      }

      if (resolved) return;

      timer = setTimeout(() => {
        if (!entry.closed && entry.child.exitCode === null) {
          try {
            entry.child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
        done();
      }, this.killGraceMs);
      timer.unref?.();
    });
  }
}

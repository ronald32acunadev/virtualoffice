import { spawn } from "node-pty";
import fs from "node:fs";
import { isBinaryAvailable } from "../agents/binary-availability.ts";
import type { Employee } from "../office/domain/types.ts";
import { resolveAgentCliCommand } from "./agent-cli-command.ts";

export type PtyDisposable = { dispose(): void };
export type PtyProcess = {
  onData(listener: (data: string) => void): PtyDisposable;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): PtyDisposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};
export type PtySpawnOptions = { name: string; cols: number; rows: number; cwd: string; env: Record<string, string | undefined> };
export type PtyFactory = (command: string, args: string[], options: PtySpawnOptions) => PtyProcess;
export type TerminalSize = { cols: number; rows: number };
export type TerminalErrorCode = "not_found" | "folder_missing" | "target_unavailable";
export class TerminalError extends Error {
  readonly code: TerminalErrorCode;
  readonly status: 404 | 409;
  constructor(code: TerminalErrorCode, message: string) {
    super(message);
    this.name = "TerminalError";
    this.code = code;
    this.status = code === "not_found" ? 404 : 409;
  }
}
export const DEFAULT_SCROLLBACK_BYTES = 256 * 1024;

export class TerminalSession {
  readonly employeeId: string;
  private readonly pty: PtyProcess;
  private readonly limit: number;
  private readonly disposables: PtyDisposable[] = [];
  private readonly chunks: string[] = [];
  private totalBytes = 0;
  private readonly onDataListeners: Array<(data: string) => void> = [];
  private readonly onExitListeners: Array<(exitCode: number) => void> = [];
  private hasExited = false;
  private finalExitCode: number | null = null;
  private killed = false;

  constructor(
    employeeId: string,
    pty: PtyProcess,
    limit: number,
    onExited: (session: TerminalSession) => void,
  ) {
    this.employeeId = employeeId;
    this.pty = pty;
    this.limit = limit;
    const onDataDispose = pty.onData((data: string) => {
      this.appendScrollback(data);
      for (const listener of this.onDataListeners) {
        try {
          listener(data);
        } catch {
          // ignore listener errors
        }
      }
    });
    const onExitDispose = pty.onExit((event: { exitCode: number; signal?: number }) => {
      this.hasExited = true;
      this.finalExitCode = event.exitCode;
      for (const listener of this.onExitListeners) {
        try {
          listener(event.exitCode);
        } catch {
          // ignore listener errors
        }
      }
      for (const dispose of this.disposables) {
        dispose.dispose();
      }
      this.disposables.length = 0;
      try {
        onExited(this);
      } catch {
        // ignore onExited errors
      }
    });
    this.disposables.push(onDataDispose, onExitDispose);
  }

  get exited(): boolean {
    return this.hasExited;
  }

  get exitCode(): number | null {
    return this.finalExitCode;
  }

  scrollback(): string {
    return this.chunks.join("");
  }

  write(data: string): void {
    if (this.hasExited || this.killed) {
      return;
    }
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.hasExited || this.killed) {
      return;
    }
    this.pty.resize(cols, rows);
  }

  kill(): void {
    if (this.hasExited || this.killed) {
      return;
    }
    this.pty.kill();
    this.killed = true;
  }

  onData(listener: (data: string) => void): () => void {
    this.onDataListeners.push(listener);
    return () => {
      const index = this.onDataListeners.indexOf(listener);
      if (index !== -1) {
        this.onDataListeners.splice(index, 1);
      }
    };
  }

  onExit(listener: (exitCode: number) => void): () => void {
    if (this.hasExited) {
      try {
        listener(this.finalExitCode!);
      } catch {
        // ignore listener errors
      }
      return () => {};
    }
    this.onExitListeners.push(listener);
    return () => {
      const index = this.onExitListeners.indexOf(listener);
      if (index !== -1) {
        this.onExitListeners.splice(index, 1);
      }
    };
  }

  private appendScrollback(chunk: string): void {
    const chunkBytes = Buffer.byteLength(chunk, "utf8");
    this.chunks.push(chunk);
    this.totalBytes += chunkBytes;
    while (this.totalBytes > this.limit && this.chunks.length > 1) {
      const firstChunk = this.chunks[0]!;
      const firstChunkBytes = Buffer.byteLength(firstChunk, "utf8");
      this.chunks.shift();
      this.totalBytes -= firstChunkBytes;
    }
    if (this.totalBytes > this.limit) {
      const lastChunk = this.chunks[this.chunks.length - 1]!;
      const lastChunkBytes = Buffer.byteLength(lastChunk, "utf8");
      const keep = this.limit - (this.totalBytes - lastChunkBytes);
      this.chunks[this.chunks.length - 1] = lastChunk.slice(-keep);
      this.totalBytes = this.limit;
    }
  }
}

export type TerminalSessionManagerDeps = {
  getEmployee: (employeeId: string) => Employee | null;
  ptyFactory?: PtyFactory;
  isBinaryAvailable?: (bin: string) => boolean;
  pathExists?: (path: string) => boolean;
  env?: Record<string, string | undefined>;
  scrollbackBytes?: number;
  onActiveChange?: (employeeId: string, active: boolean) => void;
};

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly getEmployee: (id: string) => Employee | null;
  private readonly ptyFactory: PtyFactory;
  private readonly isBinaryAvailable: (bin: string) => boolean;
  private readonly pathExists: (path: string) => boolean;
  private readonly env: Record<string, string | undefined>;
  private readonly scrollbackBytes: number;
  private readonly onActiveChange: ((id: string, active: boolean) => void) | undefined;

  constructor(deps: TerminalSessionManagerDeps) {
    this.getEmployee = deps.getEmployee;
    this.ptyFactory = deps.ptyFactory ?? ((command, args, options) => spawn(command, args, options));
    this.isBinaryAvailable = deps.isBinaryAvailable ?? isBinaryAvailable;
    this.pathExists = deps.pathExists ?? fs.existsSync;
    this.env = deps.env ?? process.env;
    this.scrollbackBytes = deps.scrollbackBytes ?? DEFAULT_SCROLLBACK_BYTES;
    this.onActiveChange = deps.onActiveChange;
  }

  open(employeeId: string, size: TerminalSize): TerminalSession {
    const existing = this.sessions.get(employeeId);
    if (existing != null) {
      return existing;
    }
    const employee = this.getEmployee(employeeId);
    if (employee == null) {
      throw new TerminalError("not_found", "Employee not found");
    }
    if (!this.pathExists(employee.workingDirectory)) {
      throw new TerminalError("folder_missing", "Working directory no longer exists");
    }
    const command = resolveAgentCliCommand(employee, this.isBinaryAvailable);
    if (command == null) {
      throw new TerminalError("target_unavailable", "Agent CLI is not installed");
    }
    const pty = this.ptyFactory(command.command, command.args, {
      name: "xterm-256color",
      cols: size.cols,
      rows: size.rows,
      cwd: employee.workingDirectory,
      env: { ...this.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });
    const session = new TerminalSession(
      employeeId,
      pty,
      this.scrollbackBytes,
      (session) => {
        if (this.sessions.get(employeeId) === session) {
          this.sessions.delete(employeeId);
          try {
            this.onActiveChange?.(employeeId, false);
          } catch {
            // ignore onActiveChange errors
          }
        }
      },
    );
    this.sessions.set(employeeId, session);
    try {
      this.onActiveChange?.(employeeId, true);
    } catch {
      // ignore onActiveChange errors
    }
    return session;
  }

  get(employeeId: string): TerminalSession | undefined {
    return this.sessions.get(employeeId);
  }

  isActive(employeeId: string): boolean {
    const session = this.sessions.get(employeeId);
    return session != null && !session.exited;
  }

  listActive(): string[] {
    const active: string[] = [];
    for (const [id, session] of this.sessions) {
      if (!session.exited) {
        active.push(id);
      }
    }
    return active;
  }

  kill(employeeId: string): boolean {
    const session = this.sessions.get(employeeId);
    if (session == null || session.exited) {
      return false;
    }
    session.kill();
    return true;
  }

  killAll(): void {
    for (const [id, session] of this.sessions) {
      if (!session.exited) {
        session.kill();
      }
    }
    this.sessions.clear();
  }
}

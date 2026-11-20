import { spawn, type ChildProcess } from "node:child_process";
import { isBinaryAvailable } from "../agents/binary-availability.ts";
import net from "node:net";
import { existsSync } from "node:fs";

export type HostedProcess = {
  kill(signal?: NodeJS.Signals): void;
  onExit(listener: (code: number | null) => void): void;
};

export type HostSpawn = (
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string | undefined> }
) => HostedProcess;

export type DesktopErrorCode =
  | "app_not_installed"
  | "folder_missing"
  | "start_timeout"
  | "start_failed";

export class DesktopError extends Error {
  readonly code: DesktopErrorCode;
  readonly status: 409 | 502 | 504;

  constructor(code: DesktopErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "DesktopError";
    this.status = code === "start_timeout" ? 504 : code === "start_failed" ? 502 : 409;
  }
}

export type OpenCodeWebApp = { url: string; port: number };

export type OpenCodeWebHostDeps = {
  allowedOrigins: string[];
  spawn?: HostSpawn;
  isBinaryAvailable?: (bin: string) => boolean;
  pathExists?: (path: string) => boolean;
  findFreePort?: () => Promise<number>;
  waitForPort?: (port: number, timeoutMs: number) => Promise<boolean>;
  readyTimeoutMs?: number;
  env?: Record<string, string | undefined>;
};

export class OpenCodeWebHost {
  private readonly spawnProcess: HostSpawn;
  private readonly isAvailable: (bin: string) => boolean;
  private readonly pathExists: (path: string) => boolean;
  private readonly findFreePort: () => Promise<number>;
  private readonly waitForPort: (port: number, timeoutMs: number) => Promise<boolean>;
  private readonly allowedOrigins: string[];
  private readonly readyTimeoutMs: number;
  private readonly env: Record<string, string | undefined>;

  private readonly ready = new Map<string, { child: HostedProcess; app: OpenCodeWebApp }>();
  private readonly starting = new Map<string, Promise<OpenCodeWebApp>>();
  private readonly startingChildren = new Map<string, HostedProcess>();

  constructor(deps: OpenCodeWebHostDeps) {
    this.spawnProcess = deps.spawn ?? defaultSpawn;
    this.isAvailable = deps.isBinaryAvailable ?? isBinaryAvailable;
    this.pathExists = deps.pathExists ?? existsSync;
    this.findFreePort = deps.findFreePort ?? defaultFindFreePort;
    this.waitForPort = deps.waitForPort ?? defaultWaitForPort;
    this.allowedOrigins = deps.allowedOrigins;
    this.readyTimeoutMs = deps.readyTimeoutMs ?? 20000;
    this.env = deps.env ?? process.env;
  }

  async start(workingDirectory: string): Promise<OpenCodeWebApp> {
    const dir = workingDirectory;

    const existingReady = this.ready.get(dir);
    if (existingReady) {
      return { ...existingReady.app };
    }

    const existingStarting = this.starting.get(dir);
    if (existingStarting) {
      return existingStarting;
    }

    const promise = this.launch(dir);
    this.starting.set(dir, promise);
    promise.then(() => this.starting.delete(dir), () => this.starting.delete(dir));
    return promise;
  }

  private async launch(dir: string): Promise<OpenCodeWebApp> {
    if (!this.isAvailable("opencode")) {
      throw new DesktopError("app_not_installed", "OpenCode is not installed");
    }

    if (!this.pathExists(dir)) {
      throw new DesktopError("folder_missing", "Working directory no longer exists");
    }

    const port = await this.findFreePort();

    const args = [
      "serve",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
      ...this.allowedOrigins.flatMap((o) => ["--cors", o]),
    ];

    const child = this.spawnProcess("opencode", args, { cwd: dir, env: this.env });
    this.startingChildren.set(dir, child);

    let exitedEarly = false;
    let isReady = false;
    child.onExit((code: number | null) => {
      if (!isReady) {
        exitedEarly = true;
        return;
      }
      if (this.ready.get(dir)?.child === child) {
        this.ready.delete(dir);
      }
    });

    const ok = await this.waitForPort(port, this.readyTimeoutMs);
    this.startingChildren.delete(dir);

    if (exitedEarly) {
      throw new DesktopError("start_failed", "OpenCode exited before it was ready");
    }

    if (!ok) {
      child.kill("SIGTERM");
      throw new DesktopError("start_timeout", "OpenCode did not start in time");
    }

    isReady = true;
    const app = { url: `http://127.0.0.1:${port}/`, port };
    this.ready.set(dir, { child, app });
    return { ...app };
  }

  isRunning(workingDirectory: string): boolean {
    return this.ready.has(workingDirectory);
  }

  stop(workingDirectory: string): boolean {
    const entry = this.ready.get(workingDirectory);
    if (!entry) {
      return false;
    }
    entry.child.kill("SIGTERM");
    this.ready.delete(workingDirectory);
    return true;
  }

  stopAll(): void {
    for (const [dir, entry] of this.ready) {
      entry.child.kill("SIGTERM");
    }
    this.ready.clear();

    for (const [dir, child] of this.startingChildren) {
      child.kill("SIGTERM");
    }
    this.startingChildren.clear();
  }
}

function defaultSpawn(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string | undefined> }
): HostedProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "ignore",
  });

  return {
    kill: (signal?: NodeJS.Signals) => {
      child.kill(signal);
    },
    onExit: (listener: (code: number | null) => void) => {
      child.on("exit", (code: number | null) => listener(code));
      child.on("error", () => listener(null));
    },
  };
}

function defaultFindFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function defaultWaitForPort(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const interval = setInterval(() => {
      if (Date.now() >= deadline) {
        clearInterval(interval);
        resolve(false);
        return;
      }

      const socket = net.connect({
        host: "127.0.0.1",
        port,
      });

      socket.once("connect", () => {
        clearInterval(interval);
        socket.destroy();
        resolve(true);
      });

      socket.once("error", () => {
        socket.destroy();
      });
    }, 200);
  });
}

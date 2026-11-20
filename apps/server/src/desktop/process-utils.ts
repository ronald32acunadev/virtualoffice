import { spawn } from "node:child_process";
import net from "node:net";

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
  | "start_failed"
  | "display_server_missing";

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

export function defaultSpawn(
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

export function defaultFindFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

export function defaultWaitForPort(port: number, timeoutMs: number): Promise<boolean> {
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

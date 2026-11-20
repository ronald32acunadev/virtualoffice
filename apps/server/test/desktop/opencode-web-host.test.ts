import { describe, expect, it } from "vitest";
import {
  DesktopError,
  OpenCodeWebHost,
  type HostSpawn,
  type HostedProcess,
} from "../../src/desktop/opencode-web-host.ts";

class FakeProcess implements HostedProcess {
  kills: Array<NodeJS.Signals | undefined> = [];
  private exitListeners: Array<(code: number | null) => void> = [];

  kill(signal?: NodeJS.Signals): void {
    this.kills.push(signal);
  }

  onExit(listener: (code: number | null) => void): void {
    this.exitListeners.push(listener);
  }

  exit(code: number | null): void {
    for (const listener of this.exitListeners) {
      listener(code);
    }
  }
}

function setup(
  options: {
    available?: boolean;
    folderExists?: boolean;
    ready?: boolean | Promise<boolean>;
  } = {},
) {
  const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];
  const processes: FakeProcess[] = [];

  const spawn: HostSpawn = (command, args, opts) => {
    spawned.push({ command, args, cwd: opts.cwd });
    const p = new FakeProcess();
    processes.push(p);
    return p;
  };

  let portCounter = 5101;
  const findFreePort = async (): Promise<number> => {
    const port = portCounter++;
    return port;
  };

  const waitForPort = async (): Promise<boolean> => options.ready ?? true;

  const isBinaryAvailable = (): boolean => options.available ?? true;
  const pathExists = (): boolean => options.folderExists ?? true;
  const allowedOrigins = ["http://127.0.0.1:4317", "http://localhost:4317"];
  const env = { PATH: "/usr/bin" };

  const host = new OpenCodeWebHost({
    spawn,
    isBinaryAvailable,
    pathExists,
    findFreePort,
    waitForPort,
    allowedOrigins,
    env,
  });

  return { host, spawned, processes };
}

describe("OpenCodeWebHost", () => {
  it("US-01 / AC-01: starts opencode serve for the folder and returns its URL", async () => {
    const { host, spawned, processes } = setup();
    const result = await host.start("/work/app");
    expect(result).toEqual({ url: "http://127.0.0.1:5101/", port: 5101 });
    expect(spawned).toEqual([
      {
        command: "opencode",
        args: [
          "serve",
          "--hostname",
          "127.0.0.1",
          "--port",
          "5101",
          "--cors",
          "http://127.0.0.1:4317",
          "--cors",
          "http://localhost:4317",
        ],
        cwd: "/work/app",
      },
    ]);
    expect(host.isRunning("/work/app")).toBe(true);
  });

  it("US-01 / AC-01: reuses the process for the same folder, also for concurrent starts", async () => {
    const { host, spawned, processes } = setup();
    const [a, b] = await Promise.all([
      host.start("/work/app"),
      host.start("/work/app"),
    ]);
    expect(a).toEqual(b);
    const result = await host.start("/work/app");
    expect(result).toEqual(a);
    expect(spawned.length).toBe(1);
    const resultOther = await host.start("/work/other");
    expect(resultOther.port).toBe(5102);
    expect(spawned.length).toBe(2);
  });

  it("US-01 / AC-02: a start that never gets ready is killed and rejected", async () => {
    const { host, processes } = setup({ ready: false });
    await expect(host.start("/work/app")).rejects.toMatchObject({
      code: "start_timeout",
      status: 504,
    });
    expect(processes[0]!.kills).toEqual(["SIGTERM"]);
    expect(host.isRunning("/work/app")).toBe(false);
  });

  it("US-01 / AC-02: a process that exits while starting is reported and can be retried", async () => {
    let release: (value: boolean) => void = () => {};
    const ready = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const { host, processes } = setup({ ready });
    const pending = host.start("/work/app");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      if (processes.length === 1) {
        break;
      }
    }
    processes[0]!.exit(1);
    release(true);
    await expect(pending).rejects.toMatchObject({
      code: "start_failed",
      status: 502,
    });
    expect(host.isRunning("/work/app")).toBe(false);
  });

  it("US-01 / AC-03: stop and stopAll kill the processes", async () => {
    const { host, processes } = setup();
    await host.start("/work/a");
    await host.start("/work/b");
    expect(host.stop("/work/a")).toBe(true);
    expect(processes[0]!.kills).toEqual(["SIGTERM"]);
    expect(host.stop("/work/a")).toBe(false);
    host.stopAll();
    expect(processes[1]!.kills).toEqual(["SIGTERM"]);
    expect(host.isRunning("/work/b")).toBe(false);
    await host.start("/work/c");
    processes[2]!.exit(0);
    expect(host.isRunning("/work/c")).toBe(false);
  });

  it("US-01 / AC-04: rejects a missing CLI or folder without spawning", async () => {
    const { host, spawned } = setup({ available: false });
    await expect(host.start("/work/app")).rejects.toMatchObject({
      code: "app_not_installed",
      status: 409,
      message: "OpenCode is not installed",
    });
    expect(spawned).toEqual([]);
    const { host: host2, spawned: spawned2 } = setup({ folderExists: false });
    await expect(host2.start("/work/app")).rejects.toMatchObject({
      code: "folder_missing",
      status: 409,
    });
    expect(spawned2).toEqual([]);
  });
});

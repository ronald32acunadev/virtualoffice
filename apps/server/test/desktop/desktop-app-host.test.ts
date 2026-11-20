import { describe, expect, it } from "vitest";
import { DesktopAppHost } from "../../src/desktop/desktop-app-host.ts";
import type { HostSpawn, HostedProcess } from "../../src/desktop/process-utils.ts";

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

type SpawnRecord = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  process: FakeProcess;
};

const DEFAULT_BINARIES = [
  "Xvnc",
  "claude-desktop",
  "chatgpt",
  "antigravity",
  "matchbox-window-manager",
];

function setup(options: { binaries?: string[]; ready?: boolean } = {}) {
  const spawned: SpawnRecord[] = [];
  const killed: string[] = [];
  const binaries = new Set(options.binaries ?? DEFAULT_BINARIES);
  let nextDisplay = 61;
  let nextPort = 5961;

  const spawn: HostSpawn = (command, args, opts) => {
    const process = new FakeProcess();
    spawned.push({ command, args, cwd: opts.cwd, env: opts.env, process });
    return process;
  };

  const host = new DesktopAppHost({
    profilesRoot: "/data/profiles",
    spawn,
    isBinaryAvailable: (bin) => binaries.has(bin),
    findFreePort: async () => nextPort++,
    findFreeDisplay: () => nextDisplay++,
    waitForPort: async () => options.ready ?? true,
    killMatching: (pattern) => {
      killed.push(pattern);
    },
    env: { PATH: "/usr/bin", WAYLAND_DISPLAY: "wayland-0" },
  });

  return { host, spawned, killed };
}

describe("DesktopAppHost", () => {
  it("US-02 / AC-01: starts Xvnc, the window manager and the app on a private display", async () => {
    const { host, spawned } = setup();

    const result = await host.start("claude_desktop");
    expect(result).toEqual({
      appId: "claude_desktop",
      display: 61,
      rfbPort: 5961,
      status: "running",
    });
    expect(spawned.map((s) => s.command)).toEqual([
      "Xvnc",
      "matchbox-window-manager",
      "claude-desktop",
    ]);
    expect(spawned[0]?.args).toEqual([
      ":61",
      "-geometry",
      "1600x1000",
      "-depth",
      "24",
      "-localhost",
      "-rfbport",
      "5961",
      "-SecurityTypes",
      "None",
      "-ac",
    ]);
    expect(spawned[0]?.cwd).toBe("/data/profiles");
    expect(spawned[1]?.args).toEqual(["-use_titlebar", "no"]);
    expect(spawned[2]?.args).toEqual([
      "--ozone-platform=x11",
      "--user-data-dir=/data/profiles/claude_desktop",
    ]);
    expect(spawned[2]?.env).toEqual({
      PATH: "/usr/bin",
      DISPLAY: ":61",
      XDG_SESSION_TYPE: "x11",
      WAYLAND_DISPLAY: undefined,
    });
    expect(spawned[2]?.env.WAYLAND_DISPLAY).toBeUndefined();

    const antigravity = await host.start("antigravity");
    expect(antigravity).toEqual({
      appId: "antigravity",
      display: 62,
      rfbPort: 5962,
      status: "running",
    });
    expect(spawned[5]?.command).toBe("antigravity");
    expect(spawned[5]?.args).toEqual([
      "--user-data-dir=/data/profiles/antigravity",
      "--new-window",
    ]);
    expect(spawned[5]?.env.DISPLAY).toBe(":62");
  });

  it("US-02 / AC-01: works without a window manager", async () => {
    const { host, spawned } = setup({ binaries: ["Xvnc", "chatgpt"] });

    await host.start("chatgpt");

    expect(spawned.map((s) => s.command)).toEqual(["Xvnc", "chatgpt"]);
  });

  it("US-02 / AC-02: reuses the running instance, also for concurrent starts", async () => {
    const { host, spawned } = setup();

    const [first, second] = await Promise.all([
      host.start("chatgpt"),
      host.start("chatgpt"),
    ]);
    const third = await host.start("chatgpt");

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(spawned.filter((s) => s.command === "Xvnc")).toHaveLength(1);
  });

  it("US-02 / AC-03: rejects a missing display server or app without spawning", async () => {
    const noDisplay = setup({ binaries: ["claude-desktop"] });
    await expect(noDisplay.host.start("claude_desktop")).rejects.toMatchObject({
      code: "display_server_missing",
      status: 409,
      message: "Install the display server: sudo apt install tigervnc-standalone-server",
    });
    expect(noDisplay.spawned).toEqual([]);

    const noApp = setup({ binaries: ["Xvnc"] });
    await expect(noApp.host.start("claude_desktop")).rejects.toMatchObject({
      code: "app_not_installed",
      status: 409,
      message: "Claude Desktop is not installed",
    });
    expect(noApp.spawned).toEqual([]);
  });

  it("US-02 / AC-03: a display that never gets ready is killed", async () => {
    const { host, spawned } = setup({ ready: false });

    await expect(host.start("chatgpt")).rejects.toMatchObject({
      code: "start_timeout",
      status: 504,
    });
    expect(spawned.map((s) => s.command)).toEqual(["Xvnc"]);
    expect(spawned[0]?.process.kills).toEqual(["SIGTERM"]);
    expect(host.get("chatgpt")).toBeUndefined();
  });

  it("US-02 / AC-04: stop kills the display, the window manager and the app's processes", async () => {
    const { host, spawned, killed } = setup();
    await host.start("claude_desktop");

    expect(host.stop("claude_desktop")).toBe(true);

    expect(spawned[0]?.process.kills).toEqual(["SIGTERM"]);
    expect(spawned[1]?.process.kills).toEqual(["SIGTERM"]);
    expect(killed).toEqual(["/data/profiles/claude_desktop"]);
    expect(host.get("claude_desktop")).toBeUndefined();
    expect(host.stop("claude_desktop")).toBe(false);
  });

  it("US-02 / AC-04: the display exiting by itself cleans up", async () => {
    const { host, spawned, killed } = setup();
    await host.start("claude_desktop");

    spawned[0]?.process.exit(0);

    expect(host.get("claude_desktop")).toBeUndefined();
    expect(spawned[1]?.process.kills).toEqual(["SIGTERM"]);
    expect(killed).toEqual(["/data/profiles/claude_desktop"]);
  });

  it("US-02 / AC-04: relaunch starts the app again on the same display and stopAll stops everything", async () => {
    const { host, spawned, killed } = setup();

    expect(host.relaunch("claude_desktop")).toBe(false);

    await host.start("claude_desktop");
    expect(host.relaunch("claude_desktop")).toBe(true);

    const apps = spawned.filter((s) => s.command === "claude-desktop");
    expect(apps).toHaveLength(2);
    expect(apps[1]?.env.DISPLAY).toBe(":61");
    expect(apps[1]?.env).toEqual(apps[0]?.env);

    await host.start("chatgpt");

    host.stopAll();

    expect(host.get("claude_desktop")).toBeUndefined();
    expect(host.get("chatgpt")).toBeUndefined();
    expect(killed).toEqual(
      expect.arrayContaining([
        "/data/profiles/claude_desktop",
        "/data/profiles/chatgpt",
      ]),
    );
  });

  it("US-01 / AC-01: runs OpenCode Desktop on its own display", async () => {
    const { host, spawned } = setup({
      binaries: [...DEFAULT_BINARIES, "/opt/OpenCode/ai.opencode"],
    });

    const result = await host.start("opencode_desktop");

    expect(result).toEqual({
      appId: "opencode_desktop",
      display: 61,
      rfbPort: 5961,
      status: "running",
    });
    const app = spawned.find((s) => s.command === "/opt/OpenCode/ai.opencode");
    expect(app?.args).toEqual([
      "--ozone-platform=x11",
      "--user-data-dir=/data/profiles/opencode_desktop",
    ]);
    expect(app?.env.DISPLAY).toBe(":61");
  });

  it("US-01 / AC-02: reports OpenCode as not installed", async () => {
    const { host, spawned } = setup({ binaries: ["Xvnc"] });

    await expect(host.start("opencode_desktop")).rejects.toMatchObject({
      code: "app_not_installed",
      status: 409,
      message: "OpenCode is not installed",
    });
    expect(spawned).toEqual([]);
  });
});

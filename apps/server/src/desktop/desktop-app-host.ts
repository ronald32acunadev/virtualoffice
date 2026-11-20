import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isBinaryAvailable as defaultIsBinaryAvailable } from "../agents/binary-availability.ts";
import {
  DesktopError,
  defaultFindFreePort,
  defaultSpawn,
  defaultWaitForPort,
  type HostSpawn,
  type HostedProcess,
} from "./opencode-web-host.ts";

export type DesktopAppId = "claude_desktop" | "chatgpt" | "antigravity";

export const DESKTOP_APPS: Record<
  DesktopAppId,
  { label: string; binary: string; args: (profileDir: string) => string[] }
> = {
  claude_desktop: {
    label: "Claude Desktop",
    binary: "claude-desktop",
    args: (dir) => ["--ozone-platform=x11", `--user-data-dir=${dir}`],
  },
  chatgpt: {
    label: "ChatGPT",
    binary: "chatgpt",
    args: (dir) => ["--ozone-platform=x11", `--user-data-dir=${dir}`],
  },
  antigravity: {
    label: "Antigravity",
    binary: "antigravity",
    args: (dir) => [`--user-data-dir=${dir}`, "--new-window"],
  },
};

export const DISPLAY_GEOMETRY = "1600x1000";

export type DesktopAppInstance = {
  appId: DesktopAppId;
  display: number;
  rfbPort: number;
  status: "running";
};

export type DesktopAppHostDeps = {
  profilesRoot: string;
  spawn?: HostSpawn;
  isBinaryAvailable?: (bin: string) => boolean;
  findFreePort?: () => Promise<number>;
  findFreeDisplay?: () => number;
  waitForPort?: (port: number, timeoutMs: number) => Promise<boolean>;
  killMatching?: (pattern: string) => void;
  readyTimeoutMs?: number;
  env?: Record<string, string | undefined>;
};

type RunningInstance = DesktopAppInstance & {
  xvnc: HostedProcess;
  wm: HostedProcess | undefined;
  profileDir: string;
  appEnv: Record<string, string | undefined>;
};

export class DesktopAppHost {
  private readonly profilesRoot: string;
  private readonly spawnProcess: HostSpawn;
  private readonly isAvailable: (bin: string) => boolean;
  private readonly findFreePort: () => Promise<number>;
  private readonly findFreeDisplay: () => number;
  private readonly waitForPort: (port: number, timeoutMs: number) => Promise<boolean>;
  private readonly killMatching: (pattern: string) => void;
  private readonly readyTimeoutMs: number;
  private readonly env: Record<string, string | undefined>;

  private readonly instances = new Map<DesktopAppId, RunningInstance>();
  private readonly starting = new Map<DesktopAppId, Promise<DesktopAppInstance>>();

  constructor(deps: DesktopAppHostDeps) {
    this.profilesRoot = deps.profilesRoot;
    this.spawnProcess = deps.spawn ?? defaultSpawn;
    this.isAvailable = deps.isBinaryAvailable ?? defaultIsBinaryAvailable;
    this.findFreePort = deps.findFreePort ?? defaultFindFreePort;
    this.findFreeDisplay = deps.findFreeDisplay ?? defaultFindFreeDisplay;
    this.waitForPort = deps.waitForPort ?? defaultWaitForPort;
    this.killMatching = deps.killMatching ?? defaultKillMatching;
    this.readyTimeoutMs = deps.readyTimeoutMs ?? 10000;
    this.env = deps.env ?? process.env;
  }

  start(appId: DesktopAppId): Promise<DesktopAppInstance> {
    const running = this.instances.get(appId);
    if (running) {
      return Promise.resolve(toInstance(running));
    }

    const pending = this.starting.get(appId);
    if (pending) {
      return pending;
    }

    const promise = this.launch(appId);
    this.starting.set(appId, promise);
    promise.then(
      () => this.starting.delete(appId),
      () => this.starting.delete(appId),
    );
    return promise;
  }

  get(appId: DesktopAppId): DesktopAppInstance | undefined {
    const instance = this.instances.get(appId);
    return instance ? toInstance(instance) : undefined;
  }

  relaunch(appId: DesktopAppId): boolean {
    const instance = this.instances.get(appId);
    if (!instance) {
      return false;
    }

    const spec = DESKTOP_APPS[appId];
    this.spawnProcess(spec.binary, spec.args(instance.profileDir), {
      cwd: this.profilesRoot,
      env: instance.appEnv,
    });
    return true;
  }

  stop(appId: DesktopAppId): boolean {
    const instance = this.instances.get(appId);
    if (!instance) {
      return false;
    }

    this.instances.delete(appId);
    instance.xvnc.kill("SIGTERM");
    instance.wm?.kill("SIGTERM");
    this.killMatching(instance.profileDir);
    return true;
  }

  stopAll(): void {
    for (const appId of [...this.instances.keys()]) {
      this.stop(appId);
    }
  }

  private async launch(appId: DesktopAppId): Promise<DesktopAppInstance> {
    const spec = DESKTOP_APPS[appId];

    if (!this.isAvailable("Xvnc")) {
      throw new DesktopError(
        "display_server_missing",
        "Install the display server: sudo apt install tigervnc-standalone-server",
      );
    }

    if (!this.isAvailable(spec.binary)) {
      throw new DesktopError("app_not_installed", `${spec.label} is not installed`);
    }

    const display = this.findFreeDisplay();
    const rfbPort = await this.findFreePort();

    const xvnc = this.spawnProcess(
      "Xvnc",
      [
        `:${display}`,
        "-geometry",
        DISPLAY_GEOMETRY,
        "-depth",
        "24",
        "-localhost",
        "-rfbport",
        String(rfbPort),
        "-SecurityTypes",
        "None",
        "-ac",
      ],
      { cwd: this.profilesRoot, env: this.env },
    );

    let isReady = false;
    let exitedEarly = false;
    xvnc.onExit(() => {
      if (!isReady) {
        exitedEarly = true;
        return;
      }
      if (this.instances.get(appId)?.xvnc === xvnc) {
        this.cleanup(appId);
      }
    });

    const ok = await this.waitForPort(rfbPort, this.readyTimeoutMs);

    if (exitedEarly) {
      throw new DesktopError("start_failed", "The display server exited before it was ready");
    }

    if (!ok) {
      xvnc.kill("SIGTERM");
      throw new DesktopError("start_timeout", "The display server did not start in time");
    }

    isReady = true;

    const appEnv: Record<string, string | undefined> = {
      ...this.env,
      DISPLAY: `:${display}`,
      XDG_SESSION_TYPE: "x11",
      WAYLAND_DISPLAY: undefined,
    };
    const wm = this.isAvailable("matchbox-window-manager")
      ? this.spawnProcess("matchbox-window-manager", ["-use_titlebar", "no"], {
          cwd: this.profilesRoot,
          env: appEnv,
        })
      : undefined;

    const profileDir = `${this.profilesRoot}/${appId}`;
    this.spawnProcess(spec.binary, spec.args(profileDir), {
      cwd: this.profilesRoot,
      env: appEnv,
    });

    const instance: RunningInstance = {
      appId,
      display,
      rfbPort,
      status: "running",
      xvnc,
      wm,
      profileDir,
      appEnv,
    };
    this.instances.set(appId, instance);
    return toInstance(instance);
  }

  /** Called when Xvnc exits by itself: the display is gone, so the window manager and app go too. */
  private cleanup(appId: DesktopAppId): void {
    const instance = this.instances.get(appId);
    if (!instance) {
      return;
    }

    this.instances.delete(appId);
    instance.wm?.kill("SIGTERM");
    this.killMatching(instance.profileDir);
  }
}

function toInstance(instance: RunningInstance): DesktopAppInstance {
  return {
    appId: instance.appId,
    display: instance.display,
    rfbPort: instance.rfbPort,
    status: "running",
  };
}

function defaultFindFreeDisplay(): number {
  for (let n = 60; n <= 99; n++) {
    if (!existsSync(`/tmp/.X11-unix/X${n}`) && !existsSync(`/tmp/.X${n}-lock`)) {
      return n;
    }
  }
  throw new DesktopError("start_failed", "No free display number");
}

function defaultKillMatching(pattern: string): void {
  spawnSync("pkill", ["-TERM", "-f", pattern], { stdio: "ignore" });
}

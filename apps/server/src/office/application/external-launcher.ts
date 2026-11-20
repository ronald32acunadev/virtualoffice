import { spawn } from "node:child_process";
import fs from "node:fs";
import { isBinaryAvailable } from "../../agents/binary-availability.ts";
import type { BossId, Employee } from "../domain/types.ts";

export type LaunchTargetKind = "desktop_app" | "terminal_cli" | "folder";

export type LaunchTarget = {
  id: string;
  label: string;
  kind: LaunchTargetKind;
  available: boolean;
  unavailableReason?: string;
};

export type SpawnRequest = {
  command: string;
  args: string[];
  cwd?: string;
  detached: true;
  stdio: "ignore";
  shell: false;
};

export type ExternalLauncherDeps = {
  isBinaryAvailable?: (bin: string) => boolean;
  pathExists?: (targetPath: string) => boolean;
  platform?: NodeJS.Platform;
  spawnProcess?: (req: SpawnRequest) => void;
};

export type LaunchErrorCode = "invalid_target" | "folder_missing" | "target_unavailable";

export class LaunchError extends Error {
  readonly code: LaunchErrorCode;
  readonly status: 400 | 409;

  constructor(code: LaunchErrorCode, status: 400 | 409, message: string) {
    super(message);
    this.name = "LaunchError";
    this.code = code;
    this.status = status;
  }
}

type ResolvedTarget = {
  target: LaunchTarget;
  buildSpawnRequest: () => SpawnRequest;
};

const LINUX_TERMINAL_CANDIDATES = [
  "x-terminal-emulator",
  "gnome-terminal",
  "konsole",
  "kitty",
  "alacritty",
  "wezterm",
  "xterm",
] as const;

function defaultSpawnProcess(req: SpawnRequest): void {
  const child = spawn(req.command, req.args, {
    ...(req.cwd ? { cwd: req.cwd } : {}),
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.unref();
}

function shellQuote(arg: string): string {
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

export class ExternalLauncherService {
  private readonly isBinaryAvailable: (bin: string) => boolean;
  private readonly pathExists: (targetPath: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly spawnProcess: (req: SpawnRequest) => void;

  constructor(deps: ExternalLauncherDeps = {}) {
    this.isBinaryAvailable = deps.isBinaryAvailable ?? isBinaryAvailable;
    this.pathExists = deps.pathExists ?? fs.existsSync;
    this.platform = deps.platform ?? process.platform;
    this.spawnProcess = deps.spawnProcess ?? defaultSpawnProcess;
  }

  listTargets(employee: Employee): LaunchTarget[] {
    return this.resolveTargets(employee).map((entry) => entry.target);
  }

  launch(employee: Employee, targetId: string): { launched: true; targetId: string } {
    const resolved = this.resolveTargets(employee).find((entry) => entry.target.id === targetId);
    if (!resolved) {
      throw new LaunchError("invalid_target", 400, `Unknown launch target "${targetId}" for boss "${employee.bossId}"`);
    }

    const { target, buildSpawnRequest } = resolved;
    if ((target.kind === "terminal_cli" || target.kind === "folder") && !this.pathExists(employee.workingDirectory)) {
      throw new LaunchError("folder_missing", 409, "Working directory no longer exists");
    }

    if (!target.available) {
      throw new LaunchError("target_unavailable", 409, target.unavailableReason ?? "Launch target is not available");
    }

    this.spawnProcess(buildSpawnRequest());
    return { launched: true, targetId };
  }

  private resolveTargets(employee: Employee): ResolvedTarget[] {
    const bossId: BossId = employee.bossId;
    switch (bossId) {
      case "claude":
        return [
          this.resolveDesktopTarget(employee, {
            id: "claude_desktop",
            label: "Claude Desktop",
            binaryNames: ["claude-desktop"],
            macAppPath: "/Applications/Claude.app",
            unavailableReason: "Claude Desktop is not installed",
          }),
          this.resolveTerminalTarget(employee, {
            id: "claude_cli",
            label: "Claude CLI (Terminal)",
            cliBins: ["claude"],
            cliArgs: employee.providerSessionId ? ["--resume", employee.providerSessionId] : [],
            missingCliReason: "Claude CLI is not installed",
          }),
          this.resolveFolderTarget(employee),
        ];
      case "codex":
        return [
          this.resolveDesktopTarget(employee, {
            id: "chatgpt_desktop",
            label: "ChatGPT",
            binaryNames: ["chatgpt"],
            macAppPath: "/Applications/ChatGPT.app",
            unavailableReason: "ChatGPT desktop app is not installed",
          }),
          this.resolveTerminalTarget(employee, {
            id: "codex_cli",
            label: "Codex CLI (Terminal)",
            cliBins: ["codex"],
            cliArgs: [],
            missingCliReason: "Codex CLI is not installed",
          }),
          this.resolveFolderTarget(employee),
        ];
      case "opencode":
        return [
          this.resolveDesktopTarget(employee, {
            id: "opencode_desktop",
            label: "OpenCode Desktop",
            binaryNames: ["opencode-desktop"],
            fallbackPaths: ["/opt/OpenCode/ai.opencode"],
            macAppPath: "/Applications/OpenCode.app",
            unavailableReason: "OpenCode Desktop is not installed",
          }),
          this.resolveTerminalTarget(employee, {
            id: "opencode_cli",
            label: "OpenCode CLI (Terminal)",
            cliBins: ["opencode"],
            cliArgs: [],
            missingCliReason: "OpenCode CLI is not installed",
          }),
          this.resolveFolderTarget(employee),
        ];
      case "gemini":
        return [
          this.resolveDesktopTarget(employee, {
            id: "antigravity_desktop",
            label: "Antigravity",
            binaryNames: ["antigravity"],
            passWorkingDir: true,
            unavailableReason: "Antigravity is not installed",
          }),
          this.resolveTerminalTarget(employee, {
            id: "gemini_cli",
            label: "Antigravity / Gemini CLI (Terminal)",
            cliBins: ["agy", "gemini"],
            cliArgs: [],
            missingCliReason: "Neither agy nor gemini CLI is installed",
          }),
          this.resolveFolderTarget(employee),
        ];
    }
  }

  private resolveDesktopTarget(
    employee: Employee,
    opts: {
      id: string;
      label: string;
      binaryNames: readonly string[];
      fallbackPaths?: readonly string[];
      macAppPath?: string;
      passWorkingDir?: boolean;
      unavailableReason: string;
    },
  ): ResolvedTarget {
    const cwdAvailable = this.pathExists(employee.workingDirectory);
    const baseArgs = opts.passWorkingDir && cwdAvailable ? [employee.workingDirectory] : [];

    const matchedBin = opts.binaryNames.find((bin) => this.isBinaryAvailable(bin));
    const matchedPath = !matchedBin ? opts.fallbackPaths?.find((candidate) => this.pathExists(candidate)) : undefined;
    const matchedMacApp =
      !matchedBin && !matchedPath && this.platform === "darwin" && opts.macAppPath && this.pathExists(opts.macAppPath)
        ? opts.macAppPath
        : undefined;

    const available = Boolean(matchedBin || matchedPath || matchedMacApp);
    return {
      target: {
        id: opts.id,
        label: opts.label,
        kind: "desktop_app",
        available,
        ...(available ? {} : { unavailableReason: opts.unavailableReason }),
      },
      buildSpawnRequest: () => {
        const cwdFields = cwdAvailable ? { cwd: employee.workingDirectory } : {};
        if (matchedMacApp) {
          return {
            command: "open",
            args: ["-a", matchedMacApp, ...baseArgs],
            ...cwdFields,
            detached: true,
            stdio: "ignore",
            shell: false,
          };
        }
        const command = matchedBin ?? matchedPath;
        if (!command) {
          throw new LaunchError("target_unavailable", 409, opts.unavailableReason);
        }
        return {
          command,
          args: baseArgs,
          ...cwdFields,
          detached: true,
          stdio: "ignore",
          shell: false,
        };
      },
    };
  }

  private resolveTerminalTarget(
    employee: Employee,
    opts: {
      id: string;
      label: string;
      cliBins: readonly string[];
      cliArgs: readonly string[];
      missingCliReason: string;
    },
  ): ResolvedTarget {
    const folderExists = this.pathExists(employee.workingDirectory);
    const cliBin = opts.cliBins.find((bin) => this.isBinaryAvailable(bin)) ?? null;
    const spawnRequest = cliBin ? this.buildTerminalSpawnRequest(cliBin, opts.cliArgs, employee.workingDirectory) : null;

    let unavailableReason: string | undefined;
    if (!folderExists) {
      unavailableReason = "Working directory no longer exists";
    } else if (!cliBin) {
      unavailableReason = opts.missingCliReason;
    } else if (!spawnRequest) {
      unavailableReason = "No terminal emulator found";
    }

    const available = unavailableReason === undefined;
    return {
      target: {
        id: opts.id,
        label: opts.label,
        kind: "terminal_cli",
        available,
        ...(unavailableReason ? { unavailableReason } : {}),
      },
      buildSpawnRequest: () => spawnRequest!,
    };
  }

  private resolveFolderTarget(employee: Employee): ResolvedTarget {
    const folderExists = this.pathExists(employee.workingDirectory);
    const opener = this.folderOpenerCommand();
    const openerAvailable = opener !== null && this.isBinaryAvailable(opener);

    let unavailableReason: string | undefined;
    if (!folderExists) {
      unavailableReason = "Working directory no longer exists";
    } else if (!opener) {
      unavailableReason = `Folder opener is not supported on platform "${this.platform}"`;
    } else if (!openerAvailable) {
      unavailableReason = `Folder opener (${opener}) is not available`;
    }

    const available = unavailableReason === undefined;
    return {
      target: {
        id: "workspace_folder",
        label: "Workspace Folder",
        kind: "folder",
        available,
        ...(unavailableReason ? { unavailableReason } : {}),
      },
      buildSpawnRequest: () => ({
        command: opener!,
        args: [employee.workingDirectory],
        cwd: employee.workingDirectory,
        detached: true,
        stdio: "ignore",
        shell: false,
      }),
    };
  }

  private folderOpenerCommand(): string | null {
    switch (this.platform) {
      case "linux":
        return "xdg-open";
      case "darwin":
        return "open";
      case "win32":
        return "explorer";
      default:
        return null;
    }
  }

  private buildTerminalSpawnRequest(cliBin: string, cliArgs: readonly string[], cwd: string): SpawnRequest | null {
    if (this.platform === "linux") {
      const terminalBin = LINUX_TERMINAL_CANDIDATES.find((candidate) => this.isBinaryAvailable(candidate));
      if (!terminalBin) return null;
      return {
        command: terminalBin,
        args: ["-e", cliBin, ...cliArgs],
        cwd,
        detached: true,
        stdio: "ignore",
        shell: false,
      };
    }

    if (this.platform === "darwin") {
      if (!this.isBinaryAvailable("osascript")) return null;
      const commandLine = [cliBin, ...cliArgs].map(shellQuote).join(" ");
      const script = `tell application "Terminal" to do script ${JSON.stringify(`cd ${shellQuote(cwd)} && ${commandLine}`)}`;
      return {
        command: "osascript",
        args: ["-e", script],
        cwd,
        detached: true,
        stdio: "ignore",
        shell: false,
      };
    }

    if (this.platform === "win32") {
      if (this.isBinaryAvailable("wt")) {
        return {
          command: "wt",
          args: ["-d", cwd, cliBin, ...cliArgs],
          cwd,
          detached: true,
          stdio: "ignore",
          shell: false,
        };
      }
      if (this.isBinaryAvailable("cmd.exe")) {
        return {
          command: "cmd.exe",
          args: ["/c", "start", "", cliBin, ...cliArgs],
          cwd,
          detached: true,
          stdio: "ignore",
          shell: false,
        };
      }
      return null;
    }

    return null;
  }
}

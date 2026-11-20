import { describe, expect, it, vi } from "vitest";
import {
  ExternalLauncherService,
  LaunchError,
  type SpawnRequest,
} from "../../src/office/application/external-launcher.ts";
import type { BossId, Employee } from "../../src/office/domain/types.ts";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    bossId: "claude",
    hiredBy: null,
    task: "Inspect project",
    workingDirectory: "/workspaces/app",
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

describe("ExternalLauncherService", () => {
  it("lists deterministic target catalogs for each boss", () => {
    const launcher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: () => true,
      pathExists: () => true,
      spawnProcess: vi.fn(),
    });

    const expected: Record<BossId, Array<{ id: string; label: string; kind: string }>> = {
      claude: [
        { id: "claude_desktop", label: "Claude Desktop", kind: "desktop_app" },
        { id: "claude_cli", label: "Claude CLI (Terminal)", kind: "terminal_cli" },
        { id: "workspace_folder", label: "Workspace Folder", kind: "folder" },
      ],
      codex: [
        { id: "chatgpt_desktop", label: "ChatGPT", kind: "desktop_app" },
        { id: "codex_cli", label: "Codex CLI (Terminal)", kind: "terminal_cli" },
        { id: "workspace_folder", label: "Workspace Folder", kind: "folder" },
      ],
      opencode: [
        { id: "opencode_desktop", label: "OpenCode Desktop", kind: "desktop_app" },
        { id: "opencode_cli", label: "OpenCode CLI (Terminal)", kind: "terminal_cli" },
        { id: "workspace_folder", label: "Workspace Folder", kind: "folder" },
      ],
      gemini: [
        { id: "antigravity_desktop", label: "Antigravity", kind: "desktop_app" },
        { id: "gemini_cli", label: "Antigravity / Gemini CLI (Terminal)", kind: "terminal_cli" },
        { id: "workspace_folder", label: "Workspace Folder", kind: "folder" },
      ],
    };

    for (const bossId of Object.keys(expected) as BossId[]) {
      const targets = launcher.listTargets(makeEmployee({ bossId }));
      expect(targets).toEqual(expected[bossId].map((t) => ({ ...t, available: true })));
    }
  });

  it("supports /opt/OpenCode/ai.opencode fallback on linux and macOS .app fallbacks on darwin", () => {
    const linuxLauncher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: () => false,
      pathExists: (p) => p === "/opt/OpenCode/ai.opencode",
      spawnProcess: vi.fn(),
    });
    const linuxTargets = linuxLauncher.listTargets(makeEmployee({ bossId: "opencode" }));
    expect(linuxTargets[0]).toEqual({
      id: "opencode_desktop",
      label: "OpenCode Desktop",
      kind: "desktop_app",
      available: true,
    });

    const darwinLauncher = new ExternalLauncherService({
      platform: "darwin",
      isBinaryAvailable: () => false,
      pathExists: (p) => p === "/Applications/Claude.app" || p === "/Applications/ChatGPT.app" || p === "/Applications/OpenCode.app",
      spawnProcess: vi.fn(),
    });
    expect(darwinLauncher.listTargets(makeEmployee({ bossId: "claude" }))[0]?.available).toBe(true);
    expect(darwinLauncher.listTargets(makeEmployee({ bossId: "codex" }))[0]?.available).toBe(true);
    expect(darwinLauncher.listTargets(makeEmployee({ bossId: "opencode" }))[0]?.available).toBe(true);
  });

  it("reports unavailableReason when binaries, terminal emulator, or working directory are missing", () => {
    const noTerminal = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "claude" || bin === "xdg-open",
      pathExists: (p) => p === "/workspaces/app",
      spawnProcess: vi.fn(),
    });
    expect(noTerminal.listTargets(makeEmployee({ bossId: "claude" }))).toEqual([
      {
        id: "claude_desktop",
        label: "Claude Desktop",
        kind: "desktop_app",
        available: false,
        unavailableReason: "Claude Desktop is not installed",
      },
      {
        id: "claude_cli",
        label: "Claude CLI (Terminal)",
        kind: "terminal_cli",
        available: false,
        unavailableReason: "No terminal emulator found",
      },
      {
        id: "workspace_folder",
        label: "Workspace Folder",
        kind: "folder",
        available: true,
      },
    ]);

    const missingDir = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: () => true,
      pathExists: () => false,
      spawnProcess: vi.fn(),
    });
    const missingDirTargets = missingDir.listTargets(makeEmployee({ bossId: "codex" }));
    expect(missingDirTargets[0]).toMatchObject({ id: "chatgpt_desktop", available: true });
    expect(missingDirTargets[1]).toMatchObject({
      id: "codex_cli",
      available: false,
      unavailableReason: "Working directory no longer exists",
    });
    expect(missingDirTargets[2]).toMatchObject({
      id: "workspace_folder",
      available: false,
      unavailableReason: "Working directory no longer exists",
    });
  });

  it("launches claude_cli with --resume when providerSessionId is present and safe spawn options", () => {
    const spawnProcess = vi.fn<(req: SpawnRequest) => void>();
    const launcher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "kitty" || bin === "claude",
      pathExists: (p) => p === "/workspaces/app",
      spawnProcess,
    });

    const result = launcher.launch(
      makeEmployee({ bossId: "claude", providerSessionId: "sess-123" }),
      "claude_cli",
    );

    expect(result).toEqual({ launched: true, targetId: "claude_cli" });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(spawnProcess).toHaveBeenCalledWith({
      command: "kitty",
      args: ["-e", "claude", "--resume", "sess-123"],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });
  });

  it("launches claude_cli without --resume when providerSessionId is null", () => {
    const spawnProcess = vi.fn<(req: SpawnRequest) => void>();
    const launcher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "x-terminal-emulator" || bin === "xterm" || bin === "claude",
      pathExists: (p) => p === "/workspaces/app",
      spawnProcess,
    });

    launcher.launch(makeEmployee({ bossId: "claude", providerSessionId: null }), "claude_cli");

    expect(spawnProcess).toHaveBeenCalledWith({
      command: "x-terminal-emulator",
      args: ["-e", "claude"],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });
  });

  it("prefers agy over gemini for gemini_cli and falls back to gemini when agy is missing", () => {
    const spawnBoth = vi.fn<(req: SpawnRequest) => void>();
    const bothLauncher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "alacritty" || bin === "agy" || bin === "gemini",
      pathExists: () => true,
      spawnProcess: spawnBoth,
    });
    bothLauncher.launch(makeEmployee({ bossId: "gemini" }), "gemini_cli");
    expect(spawnBoth).toHaveBeenCalledWith({
      command: "alacritty",
      args: ["-e", "agy"],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    const spawnFallback = vi.fn<(req: SpawnRequest) => void>();
    const fallbackLauncher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "xterm" || bin === "gemini",
      pathExists: () => true,
      spawnProcess: spawnFallback,
    });
    fallbackLauncher.launch(makeEmployee({ bossId: "gemini" }), "gemini_cli");
    expect(spawnFallback).toHaveBeenCalledWith({
      command: "xterm",
      args: ["-e", "gemini"],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });
  });

  it("passes workingDirectory to antigravity_desktop when present and empty args when missing", () => {
    const spawnPresent = vi.fn<(req: SpawnRequest) => void>();
    const presentLauncher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "antigravity",
      pathExists: (p) => p === "/workspaces/app",
      spawnProcess: spawnPresent,
    });
    presentLauncher.launch(makeEmployee({ bossId: "gemini" }), "antigravity_desktop");
    expect(spawnPresent).toHaveBeenCalledWith({
      command: "antigravity",
      args: ["/workspaces/app"],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    const spawnMissing = vi.fn<(req: SpawnRequest) => void>();
    const missingLauncher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "antigravity",
      pathExists: () => false,
      spawnProcess: spawnMissing,
    });
    missingLauncher.launch(makeEmployee({ bossId: "gemini" }), "antigravity_desktop");
    expect(spawnMissing).toHaveBeenCalledWith({
      command: "antigravity",
      args: [],
      detached: true,
      stdio: "ignore",
      shell: false,
    });
  });

  it("launches opencode_desktop via /opt/OpenCode/ai.opencode when binary is absent", () => {
    const spawnProcess = vi.fn<(req: SpawnRequest) => void>();
    const launcher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: () => false,
      pathExists: (p) => p === "/opt/OpenCode/ai.opencode" || p === "/workspaces/app",
      spawnProcess,
    });

    expect(launcher.launch(makeEmployee({ bossId: "opencode" }), "opencode_desktop")).toEqual({
      launched: true,
      targetId: "opencode_desktop",
    });
    expect(spawnProcess).toHaveBeenCalledWith({
      command: "/opt/OpenCode/ai.opencode",
      args: [],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });
  });

  it("launches workspace_folder using the platform opener", () => {
    const cases: Array<{ platform: NodeJS.Platform; command: string }> = [
      { platform: "linux", command: "xdg-open" },
      { platform: "darwin", command: "open" },
      { platform: "win32", command: "explorer" },
    ];

    for (const { platform, command } of cases) {
      const spawnProcess = vi.fn<(req: SpawnRequest) => void>();
      const launcher = new ExternalLauncherService({
        platform,
        isBinaryAvailable: (bin) => bin === command,
        pathExists: () => true,
        spawnProcess,
      });

      launcher.launch(makeEmployee({ bossId: "codex" }), "workspace_folder");
      expect(spawnProcess).toHaveBeenCalledWith({
        command,
        args: ["/workspaces/app"],
        cwd: "/workspaces/app",
        detached: true,
        stdio: "ignore",
        shell: false,
      });
    }
  });

  it("rejects invalid targetId, missing workingDirectory, and unavailable targets without spawning", () => {
    const spawnProcess = vi.fn<(req: SpawnRequest) => void>();
    const launcher = new ExternalLauncherService({
      platform: "linux",
      isBinaryAvailable: (bin) => bin === "claude",
      pathExists: (p) => p === "/workspaces/existing",
      spawnProcess,
    });

    const employeeExisting = makeEmployee({ bossId: "claude", workingDirectory: "/workspaces/existing" });
    const employeeMissingDir = makeEmployee({ bossId: "claude", workingDirectory: "/workspaces/deleted" });

    try {
      launcher.launch(employeeExisting, "codex_cli");
      expect.unreachable("Expected LaunchError for invalid_target");
    } catch (err) {
      expect(err).toBeInstanceOf(LaunchError);
      expect(err).toMatchObject({ code: "invalid_target", status: 400 });
    }

    try {
      launcher.launch(employeeMissingDir, "claude_cli");
      expect.unreachable("Expected LaunchError for folder_missing on terminal_cli");
    } catch (err) {
      expect(err).toBeInstanceOf(LaunchError);
      expect(err).toMatchObject({ code: "folder_missing", status: 409, message: "Working directory no longer exists" });
    }

    try {
      launcher.launch(employeeMissingDir, "workspace_folder");
      expect.unreachable("Expected LaunchError for folder_missing on folder");
    } catch (err) {
      expect(err).toBeInstanceOf(LaunchError);
      expect(err).toMatchObject({ code: "folder_missing", status: 409, message: "Working directory no longer exists" });
    }

    try {
      launcher.launch(employeeExisting, "claude_desktop");
      expect.unreachable("Expected LaunchError for target_unavailable on desktop_app");
    } catch (err) {
      expect(err).toBeInstanceOf(LaunchError);
      expect(err).toMatchObject({ code: "target_unavailable", status: 409 });
    }

    try {
      launcher.launch(employeeExisting, "claude_cli");
      expect.unreachable("Expected LaunchError for target_unavailable when terminal missing");
    } catch (err) {
      expect(err).toBeInstanceOf(LaunchError);
      expect(err).toMatchObject({ code: "target_unavailable", status: 409, message: "No terminal emulator found" });
    }

    expect(spawnProcess).not.toHaveBeenCalled();
  });
});

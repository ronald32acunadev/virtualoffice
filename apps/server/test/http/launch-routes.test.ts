import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import {
  ExternalLauncherService,
  type ExternalLauncherDeps,
  type SpawnRequest,
} from "../../src/office/application/external-launcher.ts";
import type { Employee } from "../../src/office/domain/types.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { createHarness } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = `127.0.0.1:${PORT}`;
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-launch-1",
    bossId: "claude",
    hiredBy: null,
    task: "Inspect project",
    workingDirectory: "/workspaces/app",
    name: "Ada",
    species: "fox",
    importedAt: null,
    role: null,
    jobTitle: null,
    providerSessionId: "sess-42",
    status: "idle",
    failureReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function setup(launcherDeps: ExternalLauncherDeps = {}) {
  const repository = new SqliteOfficeRepository(":memory:");
  const h = createHarness(repository);
  const spawnProcess = launcherDeps.spawnProcess ?? vi.fn<(req: SpawnRequest) => void>();
  const launcher = new ExternalLauncherService({
    platform: "linux",
    isBinaryAvailable: () => true,
    pathExists: () => true,
    ...launcherDeps,
    spawnProcess,
  });
  const app = await buildApp({
    token: TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
    launcher,
  });
  apps.push(app);
  await app.ready();
  return { h, app, spawnProcess };
}

function call(
  app: FastifyInstance,
  method: "GET" | "POST",
  url: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: {
      host: HOST,
      authorization: `Bearer ${TOKEN}`,
    },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

describe("launch HTTP routes", () => {
  it("GET /api/employees/:id/launch-targets returns 200 with targets and 404 for unknown employee", async () => {
    const { h, app } = await setup({
      isBinaryAvailable: (bin) => bin === "claude" || bin === "x-terminal-emulator",
      pathExists: (p) => p === "/workspaces/app",
    });
    const employee = makeEmployee({ bossId: "claude", workingDirectory: "/workspaces/app" });
    h.repository.insertEmployee(employee);

    const ok = await call(app, "GET", `/api/employees/${employee.id}/launch-targets`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({
      targets: [
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
          available: true,
        },
        {
          id: "workspace_folder",
          label: "Workspace Folder",
          kind: "folder",
          available: false,
          unavailableReason: "Folder opener (xdg-open) is not available",
        },
      ],
    });

    const missing = await call(app, "GET", "/api/employees/does-not-exist/launch-targets");
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: "not_found", message: "Employee not found" } });
  });

  it("POST /api/employees/:id/launch returns 200 and spawns when valid and available", async () => {
    const { h, app, spawnProcess } = await setup({
      isBinaryAvailable: (bin) => bin === "claude" || bin === "gnome-terminal",
      pathExists: (p) => p === "/workspaces/app",
    });
    const employee = makeEmployee({
      bossId: "claude",
      workingDirectory: "/workspaces/app",
      providerSessionId: "sess-99",
    });
    h.repository.insertEmployee(employee);

    const res = await call(app, "POST", `/api/employees/${employee.id}/launch`, { targetId: "claude_cli" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ launched: true, targetId: "claude_cli" });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(spawnProcess).toHaveBeenCalledWith({
      command: "gnome-terminal",
      args: ["-e", "claude", "--resume", "sess-99"],
      cwd: "/workspaces/app",
      detached: true,
      stdio: "ignore",
      shell: false,
    });
  });

  it("POST /api/employees/:id/launch returns 400, 404, and 409 errors without spawning", async () => {
    const { h, app, spawnProcess } = await setup({
      isBinaryAvailable: (bin) => bin === "claude",
      pathExists: (p) => p === "/workspaces/app",
    });
    const existingEmployee = makeEmployee({ id: "emp-existing", workingDirectory: "/workspaces/app" });
    const missingDirEmployee = makeEmployee({ id: "emp-missing-dir", workingDirectory: "/workspaces/missing" });
    h.repository.insertEmployee(existingEmployee);
    h.repository.insertEmployee(missingDirEmployee);

    const unknownEmp = await call(app, "POST", "/api/employees/nope/launch", { targetId: "claude_cli" });
    expect(unknownEmp.statusCode).toBe(404);
    expect(unknownEmp.json()).toEqual({ error: { code: "not_found", message: "Employee not found" } });

    for (const payload of [{}, { targetId: "   " }, { targetId: 123 }]) {
      const missingTargetId = await call(app, "POST", `/api/employees/${existingEmployee.id}/launch`, payload);
      expect(missingTargetId.statusCode).toBe(400);
      expect(missingTargetId.json()).toEqual({
        error: { code: "validation_error", message: "targetId is required", field: "targetId" },
      });
    }

    const unknownTarget = await call(app, "POST", `/api/employees/${existingEmployee.id}/launch`, {
      targetId: "codex_cli",
    });
    expect(unknownTarget.statusCode).toBe(400);
    expect(unknownTarget.json().error.code).toBe("invalid_target");

    const folderMissing = await call(app, "POST", `/api/employees/${missingDirEmployee.id}/launch`, {
      targetId: "workspace_folder",
    });
    expect(folderMissing.statusCode).toBe(409);
    expect(folderMissing.json()).toEqual({
      error: { code: "folder_missing", message: "Working directory no longer exists" },
    });

    const targetUnavailable = await call(app, "POST", `/api/employees/${existingEmployee.id}/launch`, {
      targetId: "claude_desktop",
    });
    expect(targetUnavailable.statusCode).toBe(409);
    expect(targetUnavailable.json()).toEqual({
      error: { code: "target_unavailable", message: "Claude Desktop is not installed" },
    });

    expect(spawnProcess).not.toHaveBeenCalled();
  });
});

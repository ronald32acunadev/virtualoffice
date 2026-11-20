import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import { DesktopError } from "../../src/desktop/process-utils.ts";
import { DesktopAppHost, type DesktopAppId, type DesktopAppInstance } from "../../src/desktop/desktop-app-host.ts";
import type { Employee } from "../../src/office/domain/types.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { createHarness } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = "127.0.0.1:4317";
const apps: FastifyInstance[] = [];

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-oc",
    bossId: "opencode",
    hiredBy: null,
    task: "Fix",
    workingDirectory: "/work/app",
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

class FakeDesktopAppHost extends DesktopAppHost {
  constructor() {
    super({ profilesRoot: "/tmp/unused" });
  }
  startCalls: DesktopAppId[] = [];
  stopCalls: DesktopAppId[] = [];
  relaunchCalls: DesktopAppId[] = [];
  running = false;
  failWith: DesktopError | null = null;

  override async start(appId: DesktopAppId): Promise<DesktopAppInstance> {
    this.startCalls.push(appId);
    if (this.failWith) {
      throw this.failWith;
    }
    return { appId, display: 60, rfbPort: 5960, status: "running" };
  }

  override get(appId: DesktopAppId): DesktopAppInstance | undefined {
    return this.running ? { appId, display: 60, rfbPort: 5960, status: "running" } : undefined;
  }

  override stop(appId: DesktopAppId): boolean {
    this.stopCalls.push(appId);
    return true;
  }

  override relaunch(appId: DesktopAppId): boolean {
    this.relaunchCalls.push(appId);
    return true;
  }
}

async function setupDesktop(employees: Partial<Employee>[]) {
  const repository = new SqliteOfficeRepository(":memory:");
  const h = createHarness(repository);
  for (const employee of employees) {
    h.repository.insertEmployee(makeEmployee(employee));
  }
  const host = new FakeDesktopAppHost();
  const app = await buildApp({
    token: TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
    desktopApps: host,
  });
  apps.push(app);
  await app.ready();
  return { app, host };
}

async function setupWithoutDesktop(employees: Partial<Employee>[]) {
  const repository = new SqliteOfficeRepository(":memory:");
  const h = createHarness(repository);
  for (const employee of employees) {
    h.repository.insertEmployee(makeEmployee(employee));
  }
  const app = await buildApp({
    token: TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
  });
  apps.push(app);
  await app.ready();
  return { app };
}

function post(app: FastifyInstance, url: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { host: HOST, authorization: `Bearer ${TOKEN}` },
  });
}

function get(app: FastifyInstance, url: string) {
  return app.inject({
    method: "GET",
    url,
    headers: { host: HOST, authorization: `Bearer ${TOKEN}` },
  });
}

afterEach(async () => {
  for (const app of apps) {
    await app.close();
  }
  apps.length = 0;
});

describe("US-01 Embedded OpenCode Desktop routes", () => {
  it("US-01 / AC-01: an OpenCode employee starts OpenCode Desktop", async () => {
    const { app, host } = await setupDesktop([{ id: "emp-oc", bossId: "opencode" }]);
    const res = await post(app, "/api/employees/emp-oc/app/start");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ app: { kind: "vnc", appId: "opencode_desktop", running: true } });
    expect(host.startCalls).toEqual(["opencode_desktop"]);
  });

  it("US-01: the routes require the token", async () => {
    const { app, host } = await setupDesktop([{ id: "emp-oc", bossId: "opencode" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/employees/emp-oc/app/start",
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(401);
    expect(host.startCalls).toEqual([]);
  });

  it("US-01: unknown employees are rejected", async () => {
    const { app, host } = await setupDesktop([{ id: "emp-oc", bossId: "opencode" }]);
    const unknownRes = await post(app, "/api/employees/nope/app/start");
    expect(unknownRes.statusCode).toBe(404);
    const unknownStopRes = await post(app, "/api/employees/nope/app/stop");
    expect(unknownStopRes.statusCode).toBe(404);
    expect(host.startCalls).toEqual([]);
  });

  it("US-01: a missing desktop host is reported as app_not_available", async () => {
    const { app } = await setupWithoutDesktop([{ id: "emp-oc", bossId: "opencode" }]);
    const res = await post(app, "/api/employees/emp-oc/app/start");
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("app_not_available");
  });
});

describe("US-04 Embedded desktop app routes", () => {
  it("US-04 / AC-01: starts the desktop app mapped to the boss", async () => {
    const { app, host } = await setupDesktop([
      { id: "emp-claude", bossId: "claude" },
      { id: "emp-codex", bossId: "codex" },
      { id: "emp-gemini", bossId: "gemini" },
    ]);
    const claude = await post(app, "/api/employees/emp-claude/app/start");
    expect(claude.statusCode).toBe(200);
    expect(claude.json()).toEqual({ app: { kind: "vnc", appId: "claude_desktop", running: true } });
    const codex = await post(app, "/api/employees/emp-codex/app/start");
    expect(codex.json()).toEqual({ app: { kind: "vnc", appId: "chatgpt", running: true } });
    const gemini = await post(app, "/api/employees/emp-gemini/app/start");
    expect(gemini.json()).toEqual({ app: { kind: "vnc", appId: "antigravity", running: true } });
    expect(host.startCalls).toEqual(["claude_desktop", "chatgpt", "antigravity"]);
  });

  it("US-04 / AC-01: reports the app status", async () => {
    const { app, host } = await setupDesktop([
      { id: "emp-claude", bossId: "claude" },
      { id: "emp-oc", bossId: "opencode" },
    ]);
    host.running = true;
    const claude = await get(app, "/api/employees/emp-claude/app");
    expect(claude.statusCode).toBe(200);
    expect(claude.json()).toEqual({ app: { kind: "vnc", appId: "claude_desktop", running: true } });
    host.running = false;
    const opencode = await get(app, "/api/employees/emp-oc/app");
    expect(opencode.statusCode).toBe(200);
    expect(opencode.json()).toEqual({ app: { kind: "vnc", appId: "opencode_desktop", running: false } });
  });

  it("US-04 / AC-03: stop and relaunch reach the desktop host", async () => {
    const { app, host } = await setupDesktop([{ id: "emp-claude", bossId: "claude" }]);
    const stopRes = await post(app, "/api/employees/emp-claude/app/stop");
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json()).toEqual({ stopped: true });
    const relaunchRes = await post(app, "/api/employees/emp-claude/app/relaunch");
    expect(relaunchRes.statusCode).toBe(200);
    expect(relaunchRes.json()).toEqual({ relaunched: true });
    expect(host.stopCalls).toEqual(["claude_desktop"]);
    expect(host.relaunchCalls).toEqual(["claude_desktop"]);
  });

  it("US-04 / AC-05: a missing display server is reported", async () => {
    const { app, host } = await setupDesktop([{ id: "emp-claude", bossId: "claude" }]);
    host.failWith = new DesktopError(
      "display_server_missing",
      "Install the display server: sudo apt install tigervnc-standalone-server",
    );
    const res = await post(app, "/api/employees/emp-claude/app/start");
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({
      code: "display_server_missing",
      message: "Install the display server: sudo apt install tigervnc-standalone-server",
    });
  });
});

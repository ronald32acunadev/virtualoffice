import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import { DesktopError, OpenCodeWebHost } from "../../src/desktop/opencode-web-host.ts";
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

class FakeOpenCodeWebHost extends OpenCodeWebHost {
  constructor() {
    super({ allowedOrigins: [] });
  }
  startCalls: string[] = [];
  stopCalls: string[] = [];
  failWith: DesktopError | null = null;

  override async start(dir: string): Promise<{ url: string; port: number }> {
    this.startCalls.push(dir);
    if (this.failWith) {
      throw this.failWith;
    }
    return { url: "http://127.0.0.1:5101/", port: 5101 };
  }

  override stop(dir: string): boolean {
    this.stopCalls.push(dir);
    return true;
  }
}

async function setup(options: { withHost?: boolean; employee?: Partial<Employee> } = {}) {
  const repository = new SqliteOfficeRepository(":memory:");
  const h = createHarness(repository);
  h.repository.insertEmployee(makeEmployee(options.employee));
  const host = new FakeOpenCodeWebHost();
  const app = await buildApp({
    token: TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
    ...(options.withHost === false ? {} : { openCodeWeb: host }),
  });
  apps.push(app);
  await app.ready();
  return { app, host };
}

function post(app: FastifyInstance, url: string) {
  return app.inject({
    method: "POST",
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

describe("US-01 Embedded OpenCode web app", () => {
  it("US-01 / AC-01: starts the OpenCode web app for an OpenCode employee", async () => {
    const { app, host } = await setup();
    const res = await post(app, "/api/employees/emp-oc/app/start");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ app: { kind: "web", url: "http://127.0.0.1:5101/" } });
    expect(host.startCalls).toEqual(["/work/app"]);
  });

  it("US-01 / AC-02: host failures map to their status codes", async () => {
    const { app, host } = await setup();
    host.failWith = new DesktopError("start_timeout", "OpenCode did not start in time");
    const res = await post(app, "/api/employees/emp-oc/app/start");
    expect(res.statusCode).toBe(504);
    expect(res.json().error).toEqual({ code: "start_timeout", message: "OpenCode did not start in time" });
  });

  it("US-01 / AC-03: stop stops the folder's process", async () => {
    const { app, host } = await setup();
    const res = await post(app, "/api/employees/emp-oc/app/stop");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stopped: true });
    expect(host.stopCalls).toEqual(["/work/app"]);
  });

  it("US-01 / AC-04: missing CLI is reported as 409 app_not_installed", async () => {
    const { app, host } = await setup();
    host.failWith = new DesktopError("app_not_installed", "OpenCode is not installed");
    const res = await post(app, "/api/employees/emp-oc/app/start");
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("app_not_installed");
  });

  it("US-01: other bosses, unknown employees and a missing host are rejected without starting", async () => {
    const { app, host } = await setup({ employee: { bossId: "claude" } });
    const startRes = await post(app, "/api/employees/emp-oc/app/start");
    expect(startRes.statusCode).toBe(409);
    expect(startRes.json().error.code).toBe("app_not_available");
    expect(host.startCalls).toEqual([]);
    const stopRes = await post(app, "/api/employees/emp-oc/app/stop");
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json()).toEqual({ stopped: false });
    const unknownRes = await post(app, "/api/employees/nope/app/start");
    expect(unknownRes.statusCode).toBe(404);
    const unknownStopRes = await post(app, "/api/employees/nope/app/stop");
    expect(unknownStopRes.statusCode).toBe(404);
  });

  it("US-01: the routes require the token", async () => {
    const { app, host } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/api/employees/emp-oc/app/start",
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(401);
    expect(host.startCalls).toEqual([]);
  });

  it("US-01: missing host case", async () => {
    const noHost = await setup({ withHost: false });
    const noHostRes = await post(noHost.app, "/api/employees/emp-oc/app/start");
    expect(noHostRes.statusCode).toBe(409);
    expect(noHostRes.json().error.code).toBe("app_not_available");
    expect(noHost.host.startCalls).toEqual([]);
  });
});

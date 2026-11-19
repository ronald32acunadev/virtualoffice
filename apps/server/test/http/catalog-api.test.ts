import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import { createHarness, hireWorking } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function setup(probeTimeoutMs?: number) {
  const h = createHarness(undefined, { random: () => 0, ...(probeTimeoutMs ? { probeTimeoutMs } : {}) });
  const app = await buildApp({ token: TOKEN, port: PORT, repository: h.repository, office: h.office });
  apps.push(app);
  await app.ready();
  return { h, app };
}

function call(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { host: `127.0.0.1:${PORT}`, authorization: `Bearer ${TOKEN}` },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

const lists = {
  commands: [
    { name: "compact", description: "c", argumentHint: "", builtin: true },
    { name: "judgment-day", description: "j", argumentHint: "" },
  ],
  agents: [
    { name: "Plan", description: "p" },
    { name: "review-risk", description: "r" },
  ],
};

describe("US-01 catalog endpoints", () => {
  it("US-01 / AC-01..AC-02: GET /api/catalog returns the sorted catalog, cached; refresh=true re-probes", async () => {
    const { h, app } = await setup();
    const first = call(app, "GET", `/api/catalog?workingDirectory=${encodeURIComponent(h.dir)}`);
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.resolveInit(lists);
    const res = await first;
    expect(res.statusCode).toBe(200);
    expect(res.json().catalog.commands.map((c: { name: string }) => c.name)).toEqual(["judgment-day", "compact"]);
    expect(res.json().catalog.agents.map((a: { name: string; builtin: boolean }) => [a.name, a.builtin])).toEqual([
      ["review-risk", false],
      ["Plan", true],
    ]);
    expect((await call(app, "GET", `/api/catalog?workingDirectory=${encodeURIComponent(h.dir)}`)).statusCode).toBe(200);
    expect(h.sdk.sessions).toHaveLength(1);

    const refreshing = call(app, "GET", `/api/catalog?workingDirectory=${encodeURIComponent(h.dir)}&refresh=true`);
    await waitFor(() => h.sdk.sessions.length === 2);
    h.sdk.last.resolveInit({ commands: [], agents: [] });
    expect((await refreshing).json().catalog).toEqual({ commands: [], agents: [] });
  });

  it("US-01 / AC-04: a missing folder is 400 validation_error and nothing is probed", async () => {
    const { h, app } = await setup();
    for (const url of ["/api/catalog", "/api/catalog?workingDirectory=%2Fnot%2Fhere"]) {
      const res = await call(app, "GET", url);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: "validation_error", field: "workingDirectory" });
    }
    const bad = await call(app, "GET", `/api/catalog?workingDirectory=${encodeURIComponent(h.dir)}&refresh=maybe`);
    expect(bad.statusCode).toBe(400);
    expect(h.sdk.sessions).toHaveLength(0);
  });

  it("US-01 / AC-05: a failing probe is 503 catalog_unavailable", async () => {
    const { h, app } = await setup(20);
    const res = await call(app, "GET", `/api/catalog?workingDirectory=${encodeURIComponent(h.dir)}`);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("catalog_unavailable");
    expect(h.sdk.last.closed).toBe(true);
  });

  it("US-01 / AC-03: GET /api/employees/:id/catalog serves the live session lists; unknown id is 404", async () => {
    const { h, app } = await setup();
    const employee = await hireWorking(h);
    h.sdk.last.liveCommands = [{ name: "judgment-day", description: "j", argumentHint: "" }];
    h.sdk.last.liveAgents = [{ name: "review-risk", description: "r" }];
    const res = await call(app, "GET", `/api/employees/${employee.id}/catalog`);
    expect(res.statusCode).toBe(200);
    expect(res.json().catalog.commands).toHaveLength(1);
    expect(res.json().catalog.agents[0]).toMatchObject({ name: "review-risk", builtin: false });
    expect((await call(app, "GET", "/api/employees/nope/catalog")).statusCode).toBe(404);
  });
});

describe("US-03 role on POST /api/employees", () => {
  const body = (h: { dir: string }, role?: unknown) => ({
    bossId: "claude",
    task: "Review",
    workingDirectory: h.dir,
    ...(role !== undefined ? { role } : {}),
  });

  it("US-03 / AC-02: a valid role returns 201 with employee.role", async () => {
    const { h, app } = await setup();
    const pending = call(app, "POST", "/api/employees", body(h, "review-risk"));
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.resolveInit(lists);
    const res = await pending;
    expect(res.statusCode).toBe(201);
    expect(res.json().employee.role).toBe("review-risk");
  });

  it("US-03 / AC-03: unknown role is 400 on field role; unavailable catalog is 503; nobody is created", async () => {
    const { h, app } = await setup(30);
    const unavailable = await call(app, "POST", "/api/employees", body(h, "review-risk"));
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe("catalog_unavailable");

    const pending = call(app, "POST", "/api/employees", body(h, "ghost"));
    await waitFor(() => h.sdk.sessions.length === 2);
    h.sdk.last.resolveInit(lists);
    const res = await pending;
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: "validation_error", field: "role" });
    expect(h.office.getState().employees).toEqual([]);
  });

  it("US-03 / AC-05: no role keeps the old behavior (201, role null)", async () => {
    const { h, app } = await setup();
    const res = await call(app, "POST", "/api/employees", body(h));
    expect(res.statusCode).toBe(201);
    expect(res.json().employee.role).toBeNull();
  });
});

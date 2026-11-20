import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import { createToken } from "../../src/http/security.ts";
import { createHarness, makeTempDir, type Harness } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = `127.0.0.1:${PORT}`;
const tempDirs: string[] = [];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function setup(options: { token?: string; devOrigin?: string; staticRoot?: string } = {}) {
  const h = createHarness();
  const app = await buildApp({
    token: options.token ?? TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
    ...(options.devOrigin ? { devOrigin: options.devOrigin } : {}),
    ...(options.staticRoot ? { staticRoot: options.staticRoot } : {}),
  });
  apps.push(app);
  await app.ready();
  return { h, app };
}

function call(app: FastifyInstance, method: "GET" | "POST", url: string, opts: { payload?: unknown; headers?: Record<string, string>; token?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, ...(opts.headers ?? {}) };
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? TOKEN}`;
  return app.inject({ method, url, headers, ...(opts.payload !== undefined ? { payload: opts.payload as object } : {}) });
}

describe("US-01 open the office securely", () => {
  it("US-01 / AC-02: requests without a token or with a wrong token get 401 and change nothing", async () => {
    const { app, h } = await setup();
    const payload = { bossId: "claude", task: "x", workingDirectory: h.dir };
    for (const token of [null, "wrong", "t".repeat(63) + "x"]) {
      const get = await call(app, "GET", "/api/state", { token });
      expect(get.statusCode).toBe(401);
      expect(get.json()).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
      const post = await call(app, "POST", "/api/employees", { token, payload });
      expect(post.statusCode).toBe(401);
    }
    expect(h.repository.listEmployees()).toHaveLength(0);
    expect(h.sdk.sessions).toHaveLength(0);
  });

  it("US-01 / AC-02: the WebSocket is refused without a token or with a wrong token", async () => {
    const { app } = await setup();
    await expect(app.injectWS("/ws", { headers: { host: HOST } })).rejects.toThrow();
    await expect(app.injectWS("/ws?token=wrong", { headers: { host: HOST } })).rejects.toThrow();
    const ok = await app.injectWS(`/ws?token=${TOKEN}`, { headers: { host: HOST } });
    ok.terminate();
  });

  it("US-01 / AC-03: a foreign or missing Host is 403 even with a valid token", async () => {
    const { app } = await setup();
    for (const host of ["evil.test", "127.0.0.1:9999", "localhost"]) {
      const res = await call(app, "GET", "/api/state", { headers: { host } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("forbidden_host");
    }
    const ws = app.injectWS(`/ws?token=${TOKEN}`, { headers: { host: "evil.test" } });
    await expect(ws).rejects.toThrow();
  });

  it("US-01 / AC-03: a foreign Origin is 403 even with a valid token; local origins and no Origin pass", async () => {
    const { app } = await setup();
    const bad = await call(app, "GET", "/api/state", { headers: { origin: "http://evil.test" } });
    expect(bad.statusCode).toBe(403);
    expect(bad.json().error.code).toBe("forbidden_origin");
    for (const origin of [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]) {
      expect((await call(app, "GET", "/api/state", { headers: { origin, host: `localhost:${PORT}` } })).statusCode).toBe(200);
    }
    expect((await call(app, "GET", "/api/state")).statusCode).toBe(200);
    await expect(
      app.injectWS(`/ws?token=${TOKEN}`, { headers: { host: HOST, origin: "http://evil.test" } }),
    ).rejects.toThrow();
  });

  it("US-01 / AC-03: the dev origin is allowed only when configured", async () => {
    const { app } = await setup({ devOrigin: "http://localhost:5173" });
    const res = await call(app, "GET", "/api/state", { headers: { origin: "http://localhost:5173" } });
    expect(res.statusCode).toBe(200);
  });

  it("US-01 / AC-03: static files need no token but still obey the Host check", async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "index.html"), "<h1>office</h1>");
    const { app } = await setup({ staticRoot: dir });
    const ok = await app.inject({ method: "GET", url: "/index.html", headers: { host: HOST } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("office");
    const bad = await app.inject({ method: "GET", url: "/index.html", headers: { host: "evil.test" } });
    expect(bad.statusCode).toBe(403);
  });

  it("US-01 / AC-04: a token is generated per launch and the old token is rejected by a new server", async () => {
    const tokenA = createToken();
    const tokenB = createToken();
    expect(tokenA).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenB).not.toBe(tokenA);
    const { app } = await setup({ token: tokenB });
    expect((await call(app, "GET", "/api/state", { token: tokenA })).statusCode).toBe(401);
    expect((await call(app, "GET", "/api/state", { token: tokenB })).statusCode).toBe(200);
  });
});

describe("HTTP contract", () => {
  async function hired(h: Harness, app: FastifyInstance) {
    const res = await call(app, "POST", "/api/employees", {
      payload: { bossId: "claude", task: "Do it", workingDirectory: h.dir },
    });
    expect(res.statusCode).toBe(201);
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.init();
    return res.json().employee as { id: string };
  }

  it("US-02 / AC-02: validation errors name the field and create nothing", async () => {
    const { app, h } = await setup();
    const cases: [object, string][] = [
      [{ bossId: "claude", task: "", workingDirectory: h.dir }, "task"],
      [{ bossId: "claude", task: "x", workingDirectory: "/no/such/dir" }, "workingDirectory"],
      [{ bossId: "claude", task: "x" }, "workingDirectory"],
      [{ bossId: "ghost", task: "x", workingDirectory: h.dir }, "bossId"],
    ];
    for (const [payload, field] of cases) {
      const res = await call(app, "POST", "/api/employees", { payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: "validation_error", field });
    }
    const codex = await call(app, "POST", "/api/employees", { payload: { bossId: "codex", task: "x", workingDirectory: h.dir } });
    expect(codex.statusCode).toBe(409);
    expect(codex.json().error.code).toBe("boss_unavailable");
    expect(h.repository.listEmployees()).toHaveLength(0);
  });

  it("US-04 / AC-04: a second decision over HTTP is 409 approval_not_pending", async () => {
    const { app, h } = await setup();
    const employee = await hired(h, app);
    const result = h.sdk.last.askTool("Bash", { command: "ls" });
    await waitFor(() => h.repository.listPendingApprovals().length === 1);
    const state = (await call(app, "GET", "/api/state")).json();
    expect(state.approvals).toHaveLength(1);
    const id = state.approvals[0].id as string;

    const first = await call(app, "POST", `/api/approvals/${id}/decision`, { payload: { decision: "approve" } });
    expect(first.statusCode).toBe(200);
    expect(first.json().approval.status).toBe("approved");
    expect(await result).toMatchObject({ behavior: "allow" });
    const second = await call(app, "POST", `/api/approvals/${id}/decision`, { payload: { decision: "reject" } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("approval_not_pending");
    expect(h.repository.getApproval(id)?.status).toBe("approved");
    expect(employee.id).toBeTruthy();
  });

  it("decision validation and not_found", async () => {
    const { app } = await setup();
    expect((await call(app, "POST", "/api/approvals/nope/decision", { payload: { decision: "approve" } })).statusCode).toBe(404);
    expect((await call(app, "POST", "/api/approvals/nope/decision", { payload: { decision: "maybe" } })).statusCode).toBe(400);
  });

  it("US-03 / AC-03, AC-05: messages are accepted with 202 and listed without duplicates", async () => {
    const { app, h } = await setup();
    const employee = await hired(h, app);
    const bad = await call(app, "POST", `/api/employees/${employee.id}/messages`, { payload: { text: "  " } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.field).toBe("text");
    const sent = await call(app, "POST", `/api/employees/${employee.id}/messages`, { payload: { text: "hello" } });
    expect(sent.statusCode).toBe(202);
    expect(sent.json().message).toMatchObject({ kind: "user_text", content: "hello" });
    const first = (await call(app, "GET", `/api/employees/${employee.id}/messages`)).json().messages;
    const second = (await call(app, "GET", `/api/employees/${employee.id}/messages`)).json().messages;
    expect(first).toEqual(second);
    expect(first.map((m: { content: string }) => m.content)).toEqual(["Do it", "hello"]);
    expect((await call(app, "GET", "/api/employees/nope/messages")).statusCode).toBe(404);
    expect((await call(app, "POST", "/api/employees/nope/messages", { payload: { text: "x" } })).statusCode).toBe(404);
  });

  it("US-06 / AC-01, AC-02: stop returns the employee; unknown id is 404", async () => {
    const { app, h } = await setup();
    const employee = await hired(h, app);
    await waitFor(() => h.repository.getEmployee(employee.id)?.status === "working");
    const stopped = await call(app, "POST", `/api/employees/${employee.id}/stop`);
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().employee.status).toBe("stopped");
    const again = await call(app, "POST", `/api/employees/${employee.id}/stop`);
    expect(again.json().employee.status).toBe("stopped");
    expect((await call(app, "POST", "/api/employees/nope/stop")).statusCode).toBe(404);
  });

  it("GET /api/state lists the four bosses with only claude available", async () => {
    const { app } = await setup();
    const state = (await call(app, "GET", "/api/state")).json();
    expect(state.bosses.map((b: { id: string; available: boolean }) => [b.id, b.available])).toEqual([
      ["claude", true],
      ["codex", false],
      ["opencode", false],
      ["gemini", false],
    ]);
  });

  it("WebSocket broadcasts server events to authenticated clients", async () => {
    const { app, h } = await setup();
    const ws = await app.injectWS(`/ws?token=${TOKEN}`, { headers: { host: HOST } });
    const received: { type: string }[] = [];
    ws.on("message", (data: Buffer) => received.push(JSON.parse(data.toString())));
    await hired(h, app);
    await waitFor(() => received.some((e) => e.type === "message_added") && received.some((e) => e.type === "employee_updated"));
    ws.terminate();
  });
});

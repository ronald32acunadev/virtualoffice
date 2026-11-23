import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import { assistantTurn, userTurn, waitFor } from "../helpers/fake-sdk.ts";
import { createHarness, makeTempDir } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = `127.0.0.1:${PORT}`;
const tempDirs: string[] = [];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function setup(staticRoot?: string) {
  const h = createHarness(undefined, { random: () => 0 });
  const app = await buildApp({ token: TOKEN, port: PORT, repository: h.repository, office: h.office, ...(staticRoot ? { staticRoot } : {}) });
  apps.push(app);
  await app.ready();
  return { h, app };
}

function call(app: FastifyInstance, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { host: HOST };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.inject({ method, url, headers, ...(payload !== undefined ? { payload: payload as object } : {}) });
}

describe("US-01 SPA fallback", () => {
  function clientDir(): string {
    const dir = makeTempDir();
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "index.html"), "<div id=root>client</div>");
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
    return dir;
  }
  const get = (app: FastifyInstance, url: string, host = HOST) => app.inject({ method: "GET", url, headers: { host } });

  it("US-01 / AC-05: /office and /workspace (with a query) load index.html without a token", async () => {
    const { app } = await setup(clientDir());
    for (const url of ["/office", "/workspace", "/workspace?employee=e1&token=x", "/office/deep/link"]) {
      const res = await get(app, url);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("client");
    }
  });

  it("US-01 / AC-05: existing assets are served as themselves; /api and /ws are never rewritten", async () => {
    const { app } = await setup(clientDir());
    const asset = await get(app, "/assets/app.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe("console.log(1)");
    const unknownApi = await call(app, "GET", "/api/nope");
    expect(unknownApi.statusCode).toBe(404);
    expect(unknownApi.json().error.code).toBe("not_found");
    expect((await call(app, "GET", "/api/nope", undefined, null)).statusCode).toBe(401);
    expect((await get(app, "/ws")).statusCode).toBe(401);
  });

  it("US-01 / AC-05: the Host check still applies to client routes; non-GET requests are not rewritten", async () => {
    const { app } = await setup(clientDir());
    const bad = await get(app, "/workspace", "evil.test");
    expect(bad.statusCode).toBe(403);
    expect(bad.json().error.code).toBe("forbidden_host");
    expect((await app.inject({ method: "POST", url: "/workspace", headers: { host: HOST } })).statusCode).toBe(404);
  });

  it("US-01 / AC-05: without a built client, client routes are 404", async () => {
    const { app } = await setup();
    expect((await get(app, "/workspace")).statusCode).toBe(404);
  });
});

describe("US-04 names over HTTP", () => {
  it("US-04 / AC-01, AC-02: POST /api/employees generates or accepts name and species; invalid ones are 400 with the field", async () => {
    const { app, h } = await setup();
    const generated = await call(app, "POST", "/api/employees", { bossId: "claude", task: "a", workingDirectory: h.dir });
    expect(generated.statusCode).toBe(201);
    expect(generated.json().employee).toMatchObject({ name: "Milo", species: "wolf", importedAt: null });
    const typed = await call(app, "POST", "/api/employees", { bossId: "claude", task: "b", workingDirectory: h.dir, name: "Ada", species: "cat" });
    expect(typed.json().employee).toMatchObject({ name: "Ada", species: "cat" });
    for (const [extra, field] of [[{ name: " " }, "name"], [{ name: "x".repeat(41) }, "name"], [{ species: "dragon" }, "species"]] as const) {
      const res = await call(app, "POST", "/api/employees", { bossId: "claude", task: "c", workingDirectory: h.dir, ...extra });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: "validation_error", field });
    }
    expect(h.repository.listEmployees()).toHaveLength(2);
  });

  it("US-04 / AC-03: PATCH renames, changes species, broadcasts employee_updated; invalid input changes nothing", async () => {
    const { app, h } = await setup();
    const id = (await call(app, "POST", "/api/employees", { bossId: "claude", task: "a", workingDirectory: h.dir })).json().employee.id as string;
    const ws = await app.injectWS(`/ws?token=${TOKEN}`, { headers: { host: HOST } });
    const received: { type: string; employee?: { name: string } }[] = [];
    ws.on("message", (data: Buffer) => received.push(JSON.parse(data.toString())));
    const ok = await call(app, "PATCH", `/api/employees/${id}`, { name: " Ada ", species: "bear" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().employee).toMatchObject({ id, name: "Ada", species: "bear" });
    await waitFor(() => received.some((e) => e.type === "employee_updated" && e.employee?.name === "Ada"));
    ws.terminate();
    for (const payload of [{}, { name: "" }, { name: "x".repeat(41) }, { species: "dragon" }]) {
      const bad = await call(app, "PATCH", `/api/employees/${id}`, payload);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe("validation_error");
    }
    expect(h.repository.getEmployee(id)).toMatchObject({ name: "Ada", species: "bear" });
    expect((await call(app, "PATCH", "/api/employees/nope", { name: "x" })).statusCode).toBe(404);
    expect((await call(app, "PATCH", `/api/employees/${id}`, { name: "x" }, null)).statusCode).toBe(401);
  });
});



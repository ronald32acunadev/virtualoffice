import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { buildApp } from "../../src/http/app.ts";
import { DesktopAppHost, type DesktopAppId, type DesktopAppInstance } from "../../src/desktop/desktop-app-host.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import { createHarness } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = "127.0.0.1:4317";

const apps: FastifyInstance[] = [];
const sockets: WebSocket[] = [];
const servers: net.Server[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const server of servers.splice(0)) {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

class FakeDesktopAppHost extends DesktopAppHost {
  stopCalls = 0;

  constructor(private readonly running: Partial<Record<DesktopAppId, DesktopAppInstance>>) {
    super({ profilesRoot: "/tmp/unused" });
  }

  override get(appId: DesktopAppId) {
    return this.running[appId];
  }

  override stop() {
    this.stopCalls += 1;
    return true;
  }
}

async function fakeVnc() {
  const connections: net.Socket[] = [];
  const received: Buffer[] = [];
  const server = net.createServer((conn) => {
    connections.push(conn);
    conn.on("data", (chunk) => {
      received.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  servers.push(server);
  const address = server.address() as net.AddressInfo;
  return { port: address.port, connections, received };
}

async function setup(host?: FakeDesktopAppHost) {
  const h = createHarness(new SqliteOfficeRepository(":memory:"));
  const app = await buildApp({
    token: TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
    ...(host ? { desktopApps: host } : {}),
  });
  apps.push(app);
  await app.ready();
  return app;
}

async function connect(app: FastifyInstance, path: string) {
  const messages: Array<{ data: Buffer; isBinary: boolean }> = [];
  const closed: { code: number | null } = { code: null };
  const ws = await app.injectWS(path, { headers: { host: HOST } }, {
    onInit: (ws) => {
      sockets.push(ws);
      ws.on("message", (raw: Buffer, isBinary: boolean) => {
        messages.push({ data: raw, isBinary });
      });
      ws.on("close", (code: number) => {
        closed.code = code;
      });
    },
  });
  return { ws, messages, closed };
}

const running = (rfbPort: number): DesktopAppInstance => ({
  appId: "chatgpt",
  display: 61,
  rfbPort,
  status: "running",
});

describe("US-03 — Authenticated desktop stream channel", () => {
  it("US-03 / AC-01: relays bytes between the browser and the VNC server", async () => {
    const vnc = await fakeVnc();
    const host = new FakeDesktopAppHost({ chatgpt: running(vnc.port) });
    const app = await setup(host);
    const { ws, messages } = await connect(app, `/ws/desktop/chatgpt?token=${TOKEN}`);
    ws.send(Buffer.from("hello"));
    await waitFor(() => Buffer.concat(vnc.received).toString() === "hello");
    vnc.connections[0]!.write(Buffer.from("RFB 003.008\n"));
    await waitFor(() => messages.length > 0);
    expect(Buffer.concat(messages.map((m) => m.data)).toString()).toBe("RFB 003.008\n");
    expect(messages[0]!.isBinary).toBe(true);
  });

  it("US-03 / AC-02: rejects a bad token or a foreign origin without connecting", async () => {
    const vnc = await fakeVnc();
    const host = new FakeDesktopAppHost({ chatgpt: running(vnc.port) });
    const app = await setup(host);
    await expect(app.injectWS("/ws/desktop/chatgpt", { headers: { host: HOST } })).rejects.toThrow();
    await expect(app.injectWS("/ws/desktop/chatgpt?token=wrong", { headers: { host: HOST } })).rejects.toThrow();
    await expect(app.injectWS(`/ws/desktop/chatgpt?token=${TOKEN}`, { headers: { host: HOST, origin: "http://evil.test" } })).rejects.toThrow();
    expect(vnc.connections).toEqual([]);
  });

  it("US-03 / AC-02: an app that is not running, an unknown app, or no host closes with an error frame", async () => {
    const host = new FakeDesktopAppHost({});
    const app = await setup(host);
    const { messages, closed } = await connect(app, `/ws/desktop/chatgpt?token=${TOKEN}`);
    await waitFor(() => closed.code !== null);
    expect(closed.code).toBe(1008);
    expect(JSON.parse(messages[0]!.data.toString())).toEqual({
      type: "error",
      code: "app_not_running",
      message: "The desktop app is not running",
    });

    const { messages: messages2, closed: closed2 } = await connect(app, `/ws/desktop/notepad?token=${TOKEN}`);
    await waitFor(() => closed2.code !== null);
    expect(closed2.code).toBe(1008);
    expect(JSON.parse(messages2[0]!.data.toString())).toEqual({
      type: "error",
      code: "unknown_app",
      message: "Unknown desktop app",
    });

    const app2 = await setup();
    const { messages: messages3, closed: closed3 } = await connect(app2, `/ws/desktop/chatgpt?token=${TOKEN}`);
    await waitFor(() => closed3.code !== null);
    expect(closed3.code).toBe(1011);
    expect(JSON.parse(messages3[0]!.data.toString())).toEqual({
      type: "error",
      code: "desktop_unavailable",
      message: "Embedded desktop apps are not enabled",
    });
  });

  it("US-03 / AC-03: closing the browser closes the VNC connection but keeps the app", async () => {
    const vnc = await fakeVnc();
    const host = new FakeDesktopAppHost({ chatgpt: running(vnc.port) });
    const app = await setup(host);
    const { ws } = await connect(app, `/ws/desktop/chatgpt?token=${TOKEN}`);
    await waitFor(() => vnc.connections.length === 1);
    const vncClosed = { value: false };
    vnc.connections[0]!.on("close", () => {
      vncClosed.value = true;
    });
    ws.terminate();
    await waitFor(() => vncClosed.value);
    expect(host.stopCalls).toBe(0);
  });

  it("US-03 / AC-03: the VNC side closing closes the browser socket", async () => {
    const vnc = await fakeVnc();
    const host = new FakeDesktopAppHost({ chatgpt: running(vnc.port) });
    const app = await setup(host);
    const { ws, closed } = await connect(app, `/ws/desktop/chatgpt?token=${TOKEN}`);
    await waitFor(() => vnc.connections.length === 1);
    vnc.connections[0]!.destroy();
    await waitFor(() => closed.code !== null);
    expect(closed.code).toBe(1000);
  });
});

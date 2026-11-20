import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { buildApp } from "../../src/http/app.ts";
import type { Employee } from "../../src/office/domain/types.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { parseClientMessage, parseTerminalSize } from "../../src/terminal/terminal-protocol.ts";
import {
  TerminalSessionManager,
  type PtyDisposable,
  type PtyFactory,
  type PtyProcess,
  type PtySpawnOptions,
} from "../../src/terminal/terminal-session-manager.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import { createHarness } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = "127.0.0.1:4317";
const apps: FastifyInstance[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  for (const app of apps.splice(0)) {
    await app.close();
  }
});

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-ws-1",
    bossId: "claude",
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

class FakePty implements PtyProcess {
  writes: string[] = [];
  resizes: Array<[number, number]> = [];
  kills = 0;
  private listeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void): PtyDisposable {
    this.listeners.push(listener);
    return { dispose: () => {} };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): PtyDisposable {
    this.exitListeners.push(listener);
    return { dispose: () => {} };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows]);
  }

  kill(): void {
    this.kills++;
  }

  emitData(data: string): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) {
      listener({ exitCode });
    }
  }
}

async function setup(options: { withTerminals?: boolean } = {}) {
  const repository = new SqliteOfficeRepository(":memory:");
  const h = createHarness(repository);
  h.repository.insertEmployee(makeEmployee());

  const spawned: Array<{ command: string; args: string[]; options: PtySpawnOptions }> = [];
  const ptys: FakePty[] = [];

  const ptyFactory: PtyFactory = (command, args, options) => {
    const pty = new FakePty();
    ptys.push(pty);
    spawned.push({ command, args, options });
    return pty;
  };

  const terminals = new TerminalSessionManager({
    getEmployee: (id) => h.repository.getEmployee(id) ?? null,
    ptyFactory,
    isBinaryAvailable: () => true,
    pathExists: () => true,
    env: {},
  });

  const app = await buildApp({
    token: TOKEN,
    port: PORT,
    repository: h.repository,
    office: h.office,
    ...(options.withTerminals === false ? {} : { terminals }),
  });

  apps.push(app);
  await app.ready();

  return { app, terminals, spawned, ptys };
}

async function connect(app: FastifyInstance, path: string) {
  const messages: unknown[] = [];
  const closed: { code: number | null } = { code: null };
  const ws = await app.injectWS(path, { headers: { host: HOST } }, {
    onInit: (ws: WebSocket) => {
      sockets.push(ws);
      ws.on("message", (data: Buffer) => messages.push(JSON.parse(data.toString())));
      ws.on("close", (code: number) => { closed.code = code; });
    },
  });
  return { ws, messages, closed };
}

describe("terminal protocol", () => {
  it("US-02 / AC-02: parses input and resize frames", () => {
    expect(parseClientMessage('{"type":"input","data":"ls\\r"}')).toEqual({ type: "input", data: "ls\r" });
    expect(parseClientMessage('{"type":"resize","cols":100,"rows":30}')).toEqual({ type: "resize", cols: 100, rows: 30 });
  });

  it("US-02 / AC-02: rejects malformed frames", () => {
    expect(parseClientMessage("nope")).toBeNull();
    expect(parseClientMessage('{"type":"zap"}')).toBeNull();
    expect(parseClientMessage('{"type":"input","data":5}')).toBeNull();
    expect(parseClientMessage('{"type":"resize","cols":0,"rows":5}')).toBeNull();
    expect(parseClientMessage('{"type":"resize","cols":501,"rows":5}')).toBeNull();
    expect(parseClientMessage('{"type":"resize","cols":1.5,"rows":5}')).toBeNull();
  });

  it("US-02 / AC-01: reads the size from the query with defaults", () => {
    expect(parseTerminalSize({ cols: "120", rows: "40" })).toEqual({ cols: 120, rows: 40 });
    expect(parseTerminalSize({})).toEqual({ cols: 80, rows: 24 });
    expect(parseTerminalSize({ cols: "0", rows: "abc" })).toEqual({ cols: 80, rows: 24 });
    expect(parseTerminalSize({ cols: "501", rows: "30" })).toEqual({ cols: 80, rows: 30 });
    expect(parseTerminalSize(undefined)).toEqual({ cols: 80, rows: 24 });
  });
});

describe("/ws/terminal/:employeeId", () => {
  it("US-02 / AC-03: rejects a missing or wrong token and a foreign origin without spawning", async () => {
    const { app, spawned } = await setup();
    await expect(app.injectWS("/ws/terminal/emp-ws-1", { headers: { host: HOST } })).rejects.toThrow();
    await expect(app.injectWS("/ws/terminal/emp-ws-1?token=wrong", { headers: { host: HOST } })).rejects.toThrow();
    await expect(app.injectWS("/ws/terminal/emp-ws-1?token=" + TOKEN, { headers: { host: HOST, origin: "http://evil.test" } })).rejects.toThrow();
    expect(spawned).toEqual([]);
  });

  it("US-02 / AC-03: an unknown employee gets an error frame and no PTY", async () => {
    const { app, spawned } = await setup();
    const { messages, closed } = await connect(app, "/ws/terminal/missing?token=" + TOKEN);
    await waitFor(() => closed.code !== null);
    expect(messages).toEqual([{ type: "error", code: "not_found", message: "Employee not found" }]);
    expect(closed.code).toBe(1008);
    expect(spawned).toEqual([]);
  });

  it("US-02 / AC-01: opens the PTY with the query size and streams live output", async () => {
    const { app, spawned, ptys } = await setup();
    const { messages } = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN + "&cols=120&rows=40");
    await waitFor(() => ptys.length === 1);
    expect(spawned[0]!.options.cols).toBe(120);
    expect(spawned[0]!.options.rows).toBe(40);
    ptys[0]!.emitData("live");
    await waitFor(() => messages.length === 1);
    expect(messages).toEqual([{ type: "output", data: "live" }]);
  });

  it("US-02 / AC-01: replays the scrollback before live output", async () => {
    const { app, spawned, ptys, terminals } = await setup();
    terminals.open("emp-ws-1", { cols: 80, rows: 24 });
    ptys[0]!.emitData("before");
    const { messages } = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN);
    await waitFor(() => messages.length === 1);
    ptys[0]!.emitData("after");
    await waitFor(() => messages.length === 2);
    expect(messages).toEqual([{ type: "output", data: "before" }, { type: "output", data: "after" }]);
    expect(spawned.length).toBe(1);
  });

  it("US-02 / AC-02: forwards input and resize and ignores bad frames", async () => {
    const { app, terminals, ptys } = await setup();
    const { ws, closed } = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN);
    await waitFor(() => ptys.length === 1);
    ws.send('{"type":"input","data":"ls\\r"}');
    ws.send("nope");
    ws.send('{"type":"resize","cols":0,"rows":5}');
    ws.send('{"type":"zap"}');
    ws.send('{"type":"resize","cols":100,"rows":30}');
    await waitFor(() => ptys[0]!.resizes.length === 1);
    expect(ptys[0]!.writes).toEqual(["ls\r"]);
    expect(ptys[0]!.resizes).toEqual([[100, 30]]);
    expect(terminals.isActive("emp-ws-1")).toBe(true);
    expect(closed.code).toBeNull();
  });

  it("US-02 / AC-04: PTY exit sends an exit frame and closes the socket", async () => {
    const { app, spawned, ptys } = await setup();
    const { messages, closed } = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN);
    await waitFor(() => ptys.length === 1);
    ptys[0]!.emitExit(2);
    await waitFor(() => closed.code !== null);
    expect(messages).toEqual([{ type: "exit", code: 2 }]);
    expect(closed.code).toBe(1000);
  });

  it("US-02 / AC-04: closing the socket keeps the PTY for a reconnect", async () => {
    const { app, spawned, ptys, terminals } = await setup();
    const first = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN);
    await waitFor(() => ptys.length === 1);
    ptys[0]!.emitData("a");
    await waitFor(() => first.messages.length === 1);
    first.ws.terminate();
    await waitFor(() => first.closed.code !== null);
    expect(terminals.isActive("emp-ws-1")).toBe(true);
    expect(ptys[0]!.kills).toBe(0);
    const second = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN);
    await waitFor(() => second.messages.length === 1);
    expect(second.messages).toEqual([{ type: "output", data: "a" }]);
    expect(spawned.length).toBe(1);
  });

  it("US-02 / AC-03: reports terminal_unavailable when no manager is configured", async () => {
    const { app, spawned } = await setup({ withTerminals: false });
    const { messages, closed } = await connect(app, "/ws/terminal/emp-ws-1?token=" + TOKEN);
    await waitFor(() => closed.code !== null);
    expect(messages).toEqual([{ type: "error", code: "terminal_unavailable", message: "Embedded terminal is not enabled" }]);
    expect(closed.code).toBe(1011);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import type { Employee, EmployeeStatus } from "../../src/office/domain/types.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { TerminalSessionManager, type PtyFactory, type PtyProcess } from "../../src/terminal/terminal-session-manager.ts";
import { createHarness } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = "127.0.0.1:4317";
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-c1",
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

function setup() {
  const active = new Set<string>();
  const h = createHarness(new SqliteOfficeRepository(":memory:"), {
    terminals: {
      isActive: (id) => active.has(id),
      listActive: () => [...active],
    },
  });
  h.repository.insertEmployee(makeEmployee({ workingDirectory: h.dir }));
  return { h, active };
}

describe("US-04 — Session-conflict guard between office turns and the embedded terminal", () => {
  it("US-04 / AC-01: no new terminal while the office turn is active", () => {
    const spawned: string[] = [];
    const stub: PtyProcess = {
      onData: () => ({ dispose() {} }),
      onExit: () => ({ dispose() {} }),
      write() {},
      resize() {},
      kill() {},
    };
    const ptyFactory: PtyFactory = (command) => {
      spawned.push(command);
      return stub;
    };

    const statuses: EmployeeStatus[] = ["starting", "working", "waiting_approval"];
    for (const status of statuses) {
      const manager = new TerminalSessionManager({
        getEmployee: () => makeEmployee({ status }),
        ptyFactory,
        isBinaryAvailable: () => true,
        pathExists: () => true,
        env: {},
      });
      expect(() => manager.open("emp-c1", { cols: 80, rows: 24 })).toThrow(
        expect.objectContaining({ code: "employee_busy", status: 409 }),
      );
    }
    expect(spawned).toEqual([]);

    const idleManager = new TerminalSessionManager({
      getEmployee: () => makeEmployee({ status: "idle" }),
      ptyFactory,
      isBinaryAvailable: () => true,
      pathExists: () => true,
      env: {},
    });
    idleManager.open("emp-c1", { cols: 80, rows: 24 });
    expect(spawned).toEqual(["claude"]);
  });

  it("US-04 / AC-02: chat is refused while the terminal holds the session", async () => {
    const { h, active } = setup();
    active.add("emp-c1");
    await expect(h.office.sendMessage("emp-c1", "hi")).rejects.toMatchObject({
      code: "terminal_active",
      message: "The embedded terminal holds this session. End it before chatting.",
    });
    expect(h.repository.listMessages("emp-c1")).toEqual([]);
  });

  it("US-04 / AC-02: the HTTP chat route answers 409 terminal_active", async () => {
    const { h, active } = setup();
    active.add("emp-c1");
    const app = await buildApp({
      token: TOKEN,
      port: PORT,
      repository: h.repository,
      office: h.office,
    });
    apps.push(app);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/employees/emp-c1/messages",
      headers: { host: HOST, authorization: `Bearer ${TOKEN}` },
      payload: { text: "hi" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("terminal_active");
  });

  it("US-04 / AC-02: state lists active terminals and changes are broadcast", async () => {
    const { h, active } = setup();
    active.add("emp-c1");
    expect(h.office.getState().activeTerminals).toEqual(["emp-c1"]);
    h.office.notifyTerminal("emp-c1", false);
    expect(h.emitted).toContainEqual({
      type: "terminal_updated",
      employeeId: "emp-c1",
      active: false,
    });
  });

  it("US-04 / AC-03: chat works again after the terminal ends", async () => {
    const { h, active } = setup();
    active.add("emp-c1");
    await expect(h.office.sendMessage("emp-c1", "hi")).rejects.toMatchObject({
      code: "terminal_active",
      message: "The embedded terminal holds this session. End it before chatting.",
    });
    active.delete("emp-c1");
    const message = await h.office.sendMessage("emp-c1", "hello again");
    expect(message.kind).toBe("user_text");
    expect(message.content).toBe("hello again");
  });
});

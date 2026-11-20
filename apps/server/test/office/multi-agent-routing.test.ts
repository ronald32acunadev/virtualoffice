import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { buildApp } from "../../src/http/app.ts";
import { OfficeService, type OfficeDeps } from "../../src/office/application/office-service.ts";
import { OfficeError, type BossId, type ProviderCatalog } from "../../src/office/domain/types.ts";
import type { AgentAdapter, AgentSink, StartParams } from "../../src/office/ports/agent-adapter.ts";
import type { CatalogProvider } from "../../src/office/ports/catalog-provider.ts";
import type { SessionCatalog } from "../../src/office/ports/session-catalog.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";

class RecordingAdapter implements AgentAdapter {
  readonly started: StartParams[] = [];
  readonly sent: { employeeId: string; text: string }[] = [];
  readonly stopped: string[] = [];
  readonly fetchedCatalogs: string[] = [];
  private readonly liveSessions = new Map<string, AgentSink>();
  catalogToReturn: ProviderCatalog | null = null;

  start(params: StartParams, sink: AgentSink): void {
    this.started.push(params);
    this.liveSessions.set(params.employee.id, sink);
    sink.onSessionStarted(`${params.employee.bossId}-sess-${this.started.length}`);
  }

  hasSession(employeeId: string): boolean {
    return this.liveSessions.has(employeeId);
  }

  sendMessage(employeeId: string, text: string): boolean {
    if (!this.liveSessions.has(employeeId)) return false;
    this.sent.push({ employeeId, text });
    return true;
  }

  async fetchCatalog(employeeId: string): Promise<ProviderCatalog | null> {
    this.fetchedCatalogs.push(employeeId);
    return this.catalogToReturn;
  }

  async stop(employeeId: string): Promise<void> {
    this.stopped.push(employeeId);
    this.liveSessions.delete(employeeId);
  }

  finishTurn(employeeId: string): void {
    this.liveSessions.get(employeeId)?.onTurnFinished();
  }
}

function createOffice(
  deps: Partial<OfficeDeps> = {},
): { office: OfficeService; repository: SqliteOfficeRepository; dir: string } {
  const repository = new SqliteOfficeRepository(":memory:");
  const office = new OfficeService({
    repository,
    events: new InMemoryEventBus(),
    ...deps,
  });
  return { office, repository, dir: os.tmpdir() };
}

const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
});

describe("US-01 multi-agent routing and dynamic boss availability", () => {
  it("US-01 / AC-01: listBosses marks only registered adapters as available", () => {
    const claude = new RecordingAdapter();
    const codex = new RecordingAdapter();

    const { office: claudeAndCodex } = createOffice({ adapters: { claude, codex } });
    expect(claudeAndCodex.listBosses().map((b) => [b.id, b.available])).toEqual([
      ["claude", true],
      ["codex", true],
      ["opencode", false],
      ["gemini", false],
    ]);

    const { office: codexOnly } = createOffice({ adapters: { codex } });
    expect(codexOnly.listBosses().map((b) => [b.id, b.available])).toEqual([
      ["claude", false],
      ["codex", true],
      ["opencode", false],
      ["gemini", false],
    ]);

    const { office: none } = createOffice();
    expect(none.listBosses().every((b) => !b.available)).toBe(true);
  });

  it("allows bossNames to override display names in listBosses", () => {
    const gemini = new RecordingAdapter();
    const { office } = createOffice({
      adapters: { gemini },
      bossNames: { gemini: "Antigravity" },
    });

    expect(office.listBosses()).toEqual([
      { id: "claude", name: "Claude", available: false },
      { id: "codex", name: "Codex", available: false },
      { id: "opencode", name: "OpenCode", available: false },
      { id: "gemini", name: "Antigravity", available: true },
    ]);
  });

  it("US-01 / AC-02: routes start, sendMessage, fetchCatalog, and stop to each employee's own bossId adapter", async () => {
    const claude = new RecordingAdapter();
    const codex = new RecordingAdapter();
    codex.catalogToReturn = { commands: [], agents: [{ name: "codex-agent", description: "Codex" }] };

    const { office, dir } = createOffice({ adapters: { claude, codex } });

    const codexEmp = office.hire({ bossId: "codex", task: "Fix codex bug", workingDirectory: dir });
    const claudeEmp = office.hire({ bossId: "claude", task: "Fix claude bug", workingDirectory: dir });

    expect(codex.started.map((s) => s.employee.id)).toEqual([codexEmp.id]);
    expect(claude.started.map((s) => s.employee.id)).toEqual([claudeEmp.id]);

    await office.sendMessage(codexEmp.id, "follow up codex");
    await office.sendMessage(claudeEmp.id, "follow up claude");

    expect(codex.sent).toEqual([{ employeeId: codexEmp.id, text: "follow up codex" }]);
    expect(claude.sent).toEqual([{ employeeId: claudeEmp.id, text: "follow up claude" }]);

    const codexCatalog = await office.getEmployeeCatalog(codexEmp.id, {});
    expect(codex.fetchedCatalogs).toEqual([codexEmp.id]);
    expect(claude.fetchedCatalogs).toEqual([]);
    expect(codexCatalog.agents.map((a) => a.name)).toEqual(["codex-agent"]);

    await office.stop(codexEmp.id);
    expect(codex.stopped).toEqual([codexEmp.id]);
    expect(claude.stopped).toEqual([]);

    // Reopening a stopped codex session also routes back to the codex adapter with resume.
    await office.sendMessage(codexEmp.id, "resume codex");
    expect(codex.started).toHaveLength(2);
    expect(codex.started[1]?.resume).toBe("codex-sess-1");
    expect(claude.started).toHaveLength(1);
  });

  it("US-01 / AC-02: shutdown stops every active employee through its own bossId adapter", async () => {
    const claude = new RecordingAdapter();
    const codex = new RecordingAdapter();
    const { office, dir } = createOffice({ adapters: { claude, codex } });

    const c1 = office.hire({ bossId: "claude", task: "Task 1", workingDirectory: dir });
    const x1 = office.hire({ bossId: "codex", task: "Task 2", workingDirectory: dir });

    await office.shutdown();

    expect(claude.stopped).toEqual([c1.id]);
    expect(codex.stopped).toEqual([x1.id]);
  });

  it("US-01 / AC-02: hiring for an unregistered boss rejects with boss_unavailable and creates no employee", () => {
    const claude = new RecordingAdapter();
    const { office, repository, dir } = createOffice({ adapters: { claude } });

    expect(() => office.hire({ bossId: "gemini", task: "Try gemini", workingDirectory: dir })).toThrowError(OfficeError);
    try {
      office.hire({ bossId: "gemini", task: "Try gemini", workingDirectory: dir });
    } catch (error) {
      expect(error).toBeInstanceOf(OfficeError);
      expect((error as OfficeError).code).toBe("boss_unavailable");
    }

    expect(repository.listEmployees()).toHaveLength(0);
    expect(claude.started).toHaveLength(0);
  });

  it("US-01 / AC-02: deliver throws boss_unavailable if an existing employee's boss adapter is no longer registered", async () => {
    const repository = new SqliteOfficeRepository(":memory:");
    const codex = new RecordingAdapter();
    const events = new InMemoryEventBus();
    const firstOffice = new OfficeService({ repository, adapters: { codex }, events });
    const employee = firstOffice.hire({ bossId: "codex", task: "Initial task", workingDirectory: os.tmpdir() });
    await firstOffice.stop(employee.id);

    // Simulate restart where codex CLI is no longer available.
    const secondOffice = new OfficeService({ repository, adapters: {}, events });

    await expect(secondOffice.sendMessage(employee.id, "hello again")).rejects.toMatchObject({
      code: "boss_unavailable",
    });
    expect(repository.getEmployee(employee.id)?.status).toBe("stopped");
  });

  it("US-01 / AC-04: hireFromRequest rejects role for non-Claude bosses with validation_error and skips catalog probe", async () => {
    const codex = new RecordingAdapter();
    let probed = false;
    const catalogProvider: CatalogProvider = {
      async probe() {
        probed = true;
        return { commands: [], agents: [{ name: "review-risk", description: "Risk" }] };
      },
    };
    const { office, repository, dir } = createOffice({
      adapters: { codex },
      catalogProvider,
    });

    await expect(
      office.hireFromRequest({ bossId: "codex", task: "Review", workingDirectory: dir, role: "review-risk" }),
    ).rejects.toMatchObject({
      code: "validation_error",
      field: "role",
    });
    expect(probed).toBe(false);
    expect(repository.listEmployees()).toHaveLength(0);
    expect(codex.started).toHaveLength(0);

    // Without a role, hiring codex via hireFromRequest succeeds and never probes the Claude catalog.
    const created = await office.hireFromRequest({ bossId: "codex", task: "Review", workingDirectory: dir });
    expect(created.bossId).toBe("codex");
    expect(created.role).toBeNull();
    expect(probed).toBe(false);
    expect(codex.started).toHaveLength(1);
  });

  it("skips Claude session catch-up for non-Claude employees", async () => {
    const codex = new RecordingAdapter();
    const historyCalls: string[] = [];
    const sessions: SessionCatalog = {
      async list() {
        return [];
      },
      async history(sessionId: string) {
        historyCalls.push(sessionId);
        return [];
      },
    };
    const { office, dir } = createOffice({ adapters: { codex }, sessions });

    const employee = office.hire({ bossId: "codex", task: "Start", workingDirectory: dir });
    await office.stop(employee.id);
    await office.sendMessage(employee.id, "Continue");

    expect(historyCalls).toEqual([]);
  });

  it("preserves backward compatibility when only { adapter } is passed, and lets adapters override adapter", () => {
    const legacyClaude = new RecordingAdapter();
    const { office: legacyOffice, dir } = createOffice({ adapter: legacyClaude });

    expect(legacyOffice.listBosses().map((b) => [b.id, b.available])).toEqual([
      ["claude", true],
      ["codex", false],
      ["opencode", false],
      ["gemini", false],
    ]);

    const emp = legacyOffice.hire({ bossId: "claude", task: "Legacy task", workingDirectory: dir });
    expect(legacyClaude.started.map((s) => s.employee.id)).toEqual([emp.id]);

    const overrideClaude = new RecordingAdapter();
    const codex = new RecordingAdapter();
    const { office: overrideOffice } = createOffice({
      adapter: legacyClaude,
      adapters: { claude: overrideClaude, codex },
    });

    const overrideEmp = overrideOffice.hire({ bossId: "claude", task: "Override", workingDirectory: dir });
    expect(overrideClaude.started.map((s) => s.employee.id)).toEqual([overrideEmp.id]);
    expect(legacyClaude.started).toHaveLength(1);
  });

  it("HTTP API exposes dynamic boss availability, routes hires, and enforces role restriction", async () => {
    const claude = new RecordingAdapter();
    const codex = new RecordingAdapter();
    const { office, repository, dir } = createOffice({ adapters: { claude, codex } });
    const token = "a".repeat(64);
    const port = 4317;
    const host = `127.0.0.1:${port}`;
    const app = await buildApp({ token, port, repository, office });
    apps.push(app);
    await app.ready();

    const headers = { host, authorization: `Bearer ${token}` };

    const stateRes = await app.inject({ method: "GET", url: "/api/state", headers });
    expect(stateRes.statusCode).toBe(200);
    expect(stateRes.json().bosses.map((b: { id: BossId; available: boolean }) => [b.id, b.available])).toEqual([
      ["claude", true],
      ["codex", true],
      ["opencode", false],
      ["gemini", false],
    ]);

    const badRole = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers,
      payload: { bossId: "codex", task: "Do work", workingDirectory: dir, role: "review-risk" },
    });
    expect(badRole.statusCode).toBe(400);
    expect(badRole.json().error).toMatchObject({ code: "validation_error", field: "role" });

    const unavailable = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers,
      payload: { bossId: "gemini", task: "Do work", workingDirectory: dir },
    });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json().error.code).toBe("boss_unavailable");

    const okCodex = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers,
      payload: { bossId: "codex", task: "Do codex work", workingDirectory: dir },
    });
    expect(okCodex.statusCode).toBe(201);
    expect(okCodex.json().employee.bossId).toBe("codex");
    expect(codex.started).toHaveLength(1);
  });
});

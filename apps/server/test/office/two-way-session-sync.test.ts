import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { buildApp } from "../../src/http/app.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import type { ServerEvent } from "../../src/office/domain/types.ts";
import type { SessionCatalog, SessionInfo } from "../../src/office/ports/session-catalog.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { ClaudeSessionCatalog } from "../../src/agents/claude/claude-session-catalog.ts";
import { CodexSessionCatalog } from "../../src/agents/codex/codex-session-catalog.ts";
import { AntigravitySessionCatalog } from "../../src/agents/antigravity/antigravity-session-catalog.ts";

const tempDirs: string[] = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeCatalog(opts: {
  sessions?: SessionInfo[];
  listError?: Error;
  deleteFn?: (sessionId: string) => Promise<boolean>;
}): SessionCatalog {
  return {
    list: async () => {
      if (opts.listError) throw opts.listError;
      return opts.sessions ?? [];
    },
    history: async () => [],
    deleteSession: opts.deleteFn,
  };
}

function makeSession(sessionId: string, cwd: string, title = "session"): SessionInfo {
  return { sessionId, title, cwd, gitBranch: null, lastModified: 1000, createdAt: 1000 };
}

describe("two-way-session-sync (US-04)", () => {
  it("syncProviders prunes an employee whose providerSessionId disappeared, deletes DB rows + attachments, and emits employee_removed", async () => {
    const projA = makeDir();
    const catalog = makeCatalog({
      sessions: [makeSession("s-1", projA, "session 1")],
    });

    const repo = new SqliteOfficeRepository(":memory:");
    const events: ServerEvent[] = [];
    const officeEvents = new InMemoryEventBus();
    officeEvents.subscribe((e) => events.push(e));

    const office = new OfficeService({
      repository: repo,
      events: officeEvents,
      sessionCatalogs: { claude: catalog },
    });

    // First sync imports session s-1
    await office.syncProviders();
    expect(office.getState().employees).toHaveLength(1);
    const emp = office.getState().employees[0]!;

    // Now catalog list is empty (session removed externally)
    const emptyCatalog = makeCatalog({ sessions: [] });
    const office2 = new OfficeService({
      repository: repo,
      events: officeEvents,
      sessionCatalogs: { claude: emptyCatalog },
    });

    const summary = await office2.syncProviders();
    expect(summary.sessionsRemoved).toBe(1);
    expect(office2.getState().employees).toHaveLength(0);
    expect(events.some((e) => e.type === "employee_removed" && e.employeeId === emp.id)).toBe(true);
    repo.close();
  });

  it("syncProviders does NOT prune employees when catalog list throws an error or when employee has active live session", async () => {
    const projA = makeDir();
    const catalog = makeCatalog({
      sessions: [makeSession("s-active", projA, "active session")],
    });

    const repo = new SqliteOfficeRepository(":memory:");
    const office = new OfficeService({
      repository: repo,
      events: new InMemoryEventBus(),
      sessionCatalogs: { claude: catalog },
    });

    await office.syncProviders();
    expect(office.getState().employees).toHaveLength(1);

    // Error catalog sync should not prune
    const errorCatalog = makeCatalog({ listError: new Error("fail") });
    const officeError = new OfficeService({
      repository: repo,
      events: new InMemoryEventBus(),
      sessionCatalogs: { claude: errorCatalog },
    });
    const sumError = await officeError.syncProviders();
    expect(sumError.providers.claude?.error).toBe("fail");
    expect(officeError.getState().employees).toHaveLength(1);
    repo.close();
  });

  it("DELETE /api/employees/:id stops session, invokes catalog.deleteSession, deletes employee/messages/attachments, broadcasts employee_removed, and returns 200 or 404", async () => {
    const projA = makeDir();
    let deletedExternalId = "";
    const catalog = makeCatalog({
      sessions: [makeSession("s-del", projA, "to delete")],
      deleteFn: async (id) => {
        deletedExternalId = id;
        return true;
      },
    });

    const repo = new SqliteOfficeRepository(":memory:");
    const officeEvents = new InMemoryEventBus();
    const events: ServerEvent[] = [];
    officeEvents.subscribe((e) => events.push(e));

    const office = new OfficeService({
      repository: repo,
      events: officeEvents,
      sessionCatalogs: { claude: catalog },
    });

    await office.syncProviders();
    const emp = office.getState().employees[0]!;

    const token = "t".repeat(64);
    const app = await buildApp({ token, port: 4318, repository: repo, office });
    await app.ready();

    // Unknown ID -> 404
    const res404 = await app.inject({
      method: "DELETE",
      url: "/api/employees/unknown-id",
      headers: { authorization: `Bearer ${token}`, host: "127.0.0.1:4318" },
    });
    expect(res404.statusCode).toBe(404);

    // Valid DELETE -> 200
    const res200 = await app.inject({
      method: "DELETE",
      url: `/api/employees/${emp.id}`,
      headers: { authorization: `Bearer ${token}`, host: "127.0.0.1:4318" },
    });
    expect(res200.statusCode).toBe(200);
    expect(res200.json()).toEqual({ deleted: true, providerDeleted: true });
    expect(deletedExternalId).toBe("s-del");
    expect(events.some((e) => e.type === "employee_removed" && e.employeeId === emp.id)).toBe(true);
    expect(office.getState().employees).toHaveLength(0);

    await app.close();
    repo.close();
  });

  it("ClaudeSessionCatalog.deleteSession deletes valid file and rejects path traversal", async () => {
    const projectsDir = makeDir();
    const subDir = path.join(projectsDir, "proj1");
    fs.mkdirSync(subDir, { recursive: true });
    const targetFile = path.join(subDir, "session-123.jsonl");
    fs.writeFileSync(targetFile, "{}", "utf8");

    const catalog = new ClaudeSessionCatalog(undefined, undefined, projectsDir);

    // Valid deletion
    const res1 = await catalog.deleteSession("session-123");
    expect(res1).toBe(true);
    expect(fs.existsSync(targetFile)).toBe(false);

    // Path traversal rejection
    const outsideFile = path.join(makeDir(), "escape.jsonl");
    fs.writeFileSync(outsideFile, "{}", "utf8");
    const res2 = await catalog.deleteSession("../escape");
    expect(res2).toBe(false);
    expect(fs.existsSync(outsideFile)).toBe(true);
  });

  it("CodexSessionCatalog.deleteSession deletes valid file and rejects traversal", async () => {
    const sessionsDir = makeDir();
    const targetFile = path.join(sessionsDir, "thread-abc.jsonl");
    fs.writeFileSync(targetFile, "{}", "utf8");

    const catalog = new CodexSessionCatalog({ sessionsDir });
    const res1 = await catalog.deleteSession("thread-abc");
    expect(res1).toBe(true);
    expect(fs.existsSync(targetFile)).toBe(false);

    const res2 = await catalog.deleteSession("../escape");
    expect(res2).toBe(false);
  });

  it("AntigravitySessionCatalog.deleteSession deletes valid .pb file and rejects traversal", async () => {
    const conversationsDir = makeDir();
    const targetFile = path.join(conversationsDir, "conv-xyz.pb");
    fs.writeFileSync(targetFile, "pb", "utf8");

    const catalog = new AntigravitySessionCatalog({ conversationsDir });
    const res1 = await catalog.deleteSession("conv-xyz");
    expect(res1).toBe(true);
    expect(fs.existsSync(targetFile)).toBe(false);

    const res2 = await catalog.deleteSession("../escape");
    expect(res2).toBe(false);
  });
});

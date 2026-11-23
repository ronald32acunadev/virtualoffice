import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { buildApp } from "../../src/http/app.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import type { ServerEvent } from "../../src/office/domain/types.ts";
import type { AgentMessage } from "../../src/office/ports/agent-adapter.ts";
import type { DiscoveredProject, SessionCatalog, SessionInfo } from "../../src/office/ports/session-catalog.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";

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
  projects?: DiscoveredProject[];
  sessions?: SessionInfo[];
  history?: Record<string, AgentMessage[]>;
  listError?: Error;
}): SessionCatalog {
  return {
    listProjects: async () => opts.projects ?? [],
    list: async () => {
      if (opts.listError) throw opts.listError;
      return opts.sessions ?? [];
    },
    history: async (id: string) => opts.history?.[id] ?? [],
  };
}

function makeSession(sessionId: string, cwd: string, title = "session"): SessionInfo {
  return { sessionId, title, cwd, gitBranch: null, lastModified: 1000, createdAt: 1000 };
}

describe("provider-auto-sync", () => {
  it("US-02 / AC-01: SqliteOfficeRepository persists and reloads projects sorted by lastSeenAt desc", () => {
    const dbPath = path.join(makeDir(), "office.sqlite");
    const repo = new SqliteOfficeRepository(dbPath);
    repo.upsertProject({ path: "/work/a", name: "a", providers: ["claude"], lastSeenAt: "2026-11-20T00:00:00.000Z" });
    repo.upsertProject({ path: "/work/b", name: "b", providers: ["codex"], lastSeenAt: "2026-11-21T00:00:00.000Z" });
    repo.close();

    const reopened = new SqliteOfficeRepository(dbPath);
    expect(reopened.listProjects().map((p) => p.path)).toEqual(["/work/b", "/work/a"]);

    reopened.upsertProject({ path: "/work/a", name: "a", providers: ["claude", "opencode"], lastSeenAt: "2026-11-22T00:00:00.000Z" });
    expect(reopened.listProjects()[0]!.path).toBe("/work/a");
    expect(reopened.listProjects()[0]!.providers).toEqual(["claude", "opencode"]);
    reopened.close();
  });

  it("US-02 / AC-02 & AC-03: syncProviders imports projects and sessions across all 4 providers, skips missing dirs, deduplicates, and preserves user-edited profile", async () => {
    const projA = makeDir();
    const projB = makeDir();

    const claude = makeCatalog({
      sessions: [
        makeSession("s-claude-1", projA, "claude session"),
        makeSession("s-claude-2", "/nonexistent-dir-vo-sync", "missing"),
      ],
    });

    const codex = makeCatalog({
      projects: [
        { path: projB, name: "projB", lastModified: 2000 },
        { path: projA, name: "projA", lastModified: 1000 },
      ],
      sessions: [makeSession("s-codex-1", projA, "codex session")],
    });

    const opencode = makeCatalog({
      sessions: [makeSession("s-oc-1", projA, "oc session")],
    });

    const gemini = makeCatalog({
      sessions: [makeSession("s-agy-1", projA, "agy session")],
    });

    const repo = new SqliteOfficeRepository(":memory:");
    const office = new OfficeService({
      repository: repo,
      events: new InMemoryEventBus(),
      sessionCatalogs: { claude, codex, opencode, gemini },
    });

    const s1 = await office.syncProviders();
    expect(s1.projectsAdded).toBe(2);
    expect(s1.sessionsImported).toBe(4);
    expect(s1.skipped).toBe(1);

    const state = office.getState();
    expect(state.projects).toHaveLength(2);
    const projAState = state.projects.find((p) => p.path === projA)!;
    expect(projAState.providers).toEqual(["claude", "codex", "opencode", "gemini"]);
    const projBState = state.projects.find((p) => p.path === projB)!;
    expect(projBState.providers).toEqual(["codex"]);

    expect(state.employees).toHaveLength(4);
    expect(state.employees.every((e) => e.status === "idle")).toBe(true);

    const first = state.employees[0]!;
    office.updateProfile(first.id, { name: "CustomName", jobTitle: "Staff Eng" });

    const s2 = await office.syncProviders();
    expect(s2.sessionsImported).toBe(0);
    expect(s2.projectsAdded).toBe(0);
    expect(office.getState().employees).toHaveLength(4);
    expect(repo.getEmployee(first.id)!.name).toBe("CustomName");
    expect(repo.getEmployee(first.id)!.jobTitle).toBe("Staff Eng");
    repo.close();
  });

  it("US-02 / AC-04: listMessagesWithCatchUp loads and deduplicates history across non-Claude providers", async () => {
    const projA = makeDir();
    const history: AgentMessage[] = [
      { kind: "user_text", content: "hi", sourceUuid: "m1" },
      { kind: "agent_text", content: "hello", sourceUuid: "m2" },
    ];

    const codex = makeCatalog({
      sessions: [makeSession("s-codex-1", projA, "codex session")],
      history: { "s-codex-1": history },
    });

    const repo = new SqliteOfficeRepository(":memory:");
    const office = new OfficeService({
      repository: repo,
      events: new InMemoryEventBus(),
      sessionCatalogs: { codex },
    });

    await office.syncProviders();
    const emp = office.getState().employees[0]!;

    const msgs1 = await office.listMessagesWithCatchUp(emp.id);
    expect(msgs1).toHaveLength(2);

    history.push({ kind: "user_text", content: "next", sourceUuid: "m3" });
    const msgs2 = await office.listMessagesWithCatchUp(emp.id);
    expect(msgs2).toHaveLength(3);
    expect(msgs2.map((m) => m.sourceUuid)).toEqual(["m1", "m2", "m3"]);
    repo.close();
  });

  it("US-02 / AC-05: POST /api/sync requires auth, returns summary, isolates provider errors, and broadcasts projects_updated", async () => {
    const projA = makeDir();

    const opencode = makeCatalog({ listError: new Error("db locked") });
    const codex = makeCatalog({
      sessions: [makeSession("s-codex-1", projA, "codex session")],
      history: { "s-codex-1": [{ kind: "user_text", content: "hello", sourceUuid: "m1" }] },
    });

    const repo = new SqliteOfficeRepository(":memory:");
    const office = new OfficeService({
      repository: repo,
      events: new InMemoryEventBus(),
      sessionCatalogs: { opencode, codex },
    });

    const token = "t".repeat(64);
    const app = await buildApp({ token, port: 4317, repository: repo, office });
    await app.ready();

    const events: ServerEvent[] = [];
    office.subscribe((e) => events.push(e));

    const res1 = await app.inject({ method: "POST", url: "/api/sync", headers: { host: "127.0.0.1:4317" } });
    expect(res1.statusCode).toBe(401);

    const res2 = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { authorization: `Bearer ${token}`, host: "127.0.0.1:4317" },
    });
    expect(res2.statusCode).toBe(200);
    const body = res2.json();
    expect(body.sessionsImported).toBe(1);
    expect(body.providers.opencode.error).toBe("db locked");
    expect(body.providers.codex.sessionsImported).toBe(1);

    expect(events.some((e) => e.type === "projects_updated")).toBe(true);
    expect(events.some((e) => e.type === "employee_updated")).toBe(true);

    const emp = office.getState().employees[0]!;
    const res3 = await app.inject({
      method: "GET",
      url: `/api/employees/${emp.id}/messages`,
      headers: { authorization: `Bearer ${token}`, host: "127.0.0.1:4317" },
    });
    expect(res3.statusCode).toBe(200);
    const msgBody = res3.json();
    expect(msgBody.messages).toHaveLength(1);
    expect(msgBody.messages[0].sourceUuid).toBe("m1");

    await app.close();
    repo.close();
  });
});

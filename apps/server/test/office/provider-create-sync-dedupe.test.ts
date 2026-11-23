import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import type { BossId } from "../../src/office/domain/types.ts";
import type { AgentAdapter, AgentMessage, AgentSink, StartParams } from "../../src/office/ports/agent-adapter.ts";
import type { SessionCatalog, SessionInfo } from "../../src/office/ports/session-catalog.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";

type Provider = "claude" | "codex" | "opencode" | "gemini";
const PROVIDERS: readonly Provider[] = ["claude", "codex", "opencode", "gemini"] as const;

interface FakeSession {
  sessionId: string;
  title: string;
  cwd: string;
  gitBranch: null;
  lastModified: number;
  createdAt: number;
}

interface FakeMessage {
  kind: "user_text" | "agent_text";
  content: string;
  sourceUuid: string;
}

interface ProviderState {
  sessions: FakeSession[];
  history: Map<string, FakeMessage[]>;
  seq: number;
}

function makeProviderState(): ProviderState {
  return { sessions: [], history: new Map(), seq: 0 };
}

function makeFakePair(state: ProviderState): { adapter: AgentAdapter; catalog: SessionCatalog } {
  const adapter: AgentAdapter = {
    start(params: StartParams, sink: AgentSink): void {
      const bossId = params.employee.bossId;
      state.seq += 1;
      const sid = `${bossId}-native-${state.seq}`;
      const now = Date.now();
      state.sessions.push({
        sessionId: sid,
        title: params.prompt,
        cwd: params.employee.workingDirectory,
        gitBranch: null,
        lastModified: now,
        createdAt: now,
      });
      const msgs: FakeMessage[] = [
        { kind: "user_text", content: params.prompt, sourceUuid: `${sid}:u1` },
        { kind: "agent_text", content: "ok", sourceUuid: `${sid}:a1` },
      ];
      state.history.set(sid, msgs);
      sink.onSessionStarted(sid);
      sink.onMessage({ kind: "agent_text", content: "ok", sourceUuid: `${sid}:a1` });
      sink.onTurnFinished();
    },
    hasSession(): boolean {
      return false;
    },
    sendMessage(): boolean {
      return false;
    },
    async fetchCatalog() {
      return null;
    },
    async stop(): Promise<void> {
      // no-op
    },
  };

  const catalog: SessionCatalog = {
    async list(): Promise<SessionInfo[]> {
      return state.sessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        lastModified: s.lastModified,
        createdAt: s.createdAt,
      }));
    },
    async listProjects(): Promise<{ path: string; name: string; lastModified: number }[]> {
      return state.sessions.map((s) => ({
        path: s.cwd,
        name: path.basename(s.cwd),
        lastModified: s.lastModified,
      }));
    },
    async history(id: string): Promise<AgentMessage[]> {
      const msgs = state.history.get(id);
      if (!msgs) return [];
      return msgs.map((m) => ({ kind: m.kind, content: m.content, sourceUuid: m.sourceUuid }));
    },
  };

  return { adapter, catalog };
}

describe("US-04 / AC-01 & AC-02: provider create sync dedupe", () => {
  let projectDir: string | undefined;
  let repo: SqliteOfficeRepository | undefined;
  let office: OfficeService | undefined;

  afterEach(async () => {
    if (office) {
      await office.shutdown();
      office = undefined;
    }
    if (repo) {
      repo.close();
      repo = undefined;
    }
    if (projectDir && fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      projectDir = undefined;
    }
  });

  it("creating a chat for each provider persists 1-to-1 and syncProviders creates 0 duplicates", async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "office-test-"));
    const dbPath = path.join(projectDir, "office.db");
    repo = new SqliteOfficeRepository(dbPath);
    const bus = new InMemoryEventBus();

    const states = new Map<Provider, ProviderState>();
    const adapters = new Map<Provider, AgentAdapter>();
    const catalogs = new Map<Provider, SessionCatalog>();
    for (const p of PROVIDERS) {
      const st = makeProviderState();
      states.set(p, st);
      const pair = makeFakePair(st);
      adapters.set(p, pair.adapter);
      catalogs.set(p, pair.catalog);
    }

    office = new OfficeService({
      repository: repo,
      events: bus,
      adapters: Object.fromEntries(PROVIDERS.map((p) => [p, adapters.get(p)!])),
      sessionCatalogs: Object.fromEntries(PROVIDERS.map((p) => [p, catalogs.get(p)!])),
    });

    const employees = new Map<Provider, { id: string; providerSessionId: string }>();
    for (const bossId of PROVIDERS) {
      const emp = await office.hireFromRequest({
        bossId: bossId as BossId,
        task: `Hello ${bossId}`,
        workingDirectory: projectDir,
      });
      const updated = repo.getEmployee(emp.id)!;
      const providerSessionId = updated.providerSessionId;
      expect(providerSessionId).toBeTruthy();
      employees.set(bossId, { id: emp.id, providerSessionId: providerSessionId! });

      const ownCatalog = catalogs.get(bossId)!;
      const ownList = await ownCatalog.list();
      const own = ownList.find((s) => s.sessionId === providerSessionId);
      expect(own).toBeDefined();
      expect(own!.cwd).toBe(projectDir);

      for (const other of PROVIDERS) {
        if (other === bossId) continue;
        const otherList = await catalogs.get(other)!.list();
        expect(otherList.some((s) => s.sessionId === providerSessionId)).toBe(false);
      }
    }

    const summary = await office.syncProviders();
    expect(summary.sessionsImported).toBe(0);
    const state = office.getState();
    expect(state.employees).toHaveLength(4);

    const opencodeEmp = employees.get("opencode")!;
    const opencodeState = states.get("opencode")!;
    const opencodeSessionId = opencodeEmp.providerSessionId;
    const existing = opencodeState.history.get(opencodeSessionId) ?? [];
    opencodeState.history.set(opencodeSessionId, [
      ...existing,
      { kind: "agent_text", content: "from native app", sourceUuid: "ext-2" },
    ]);

    const messages = await office.listMessagesWithCatchUp(opencodeEmp.id);
    const contents = messages.map((m) => m.content);
    expect(contents).toContain("from native app");
    const okCount = contents.filter((c) => c === "ok").length;
    expect(okCount).toBe(1);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CodexSessionCatalog } from "../../src/agents/codex/codex-session-catalog.ts";

describe("CodexSessionCatalog", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function setupDbs() {
    tmpDir = mkdtempSync(join(import.meta.dirname ?? "", "codex-test-"));
    const stateDbPath = join(tmpDir, "state_5.sqlite");
    const historyDbPath = join(tmpDir, "thread_history_1.sqlite");

    const stateDb = new DatabaseSync(stateDbPath);
    stateDb.exec(`
      CREATE TABLE projects (id TEXT, name TEXT, updated_at_ms INTEGER);
      CREATE TABLE project_roots (project_id TEXT, position INTEGER, path TEXT);
      CREATE TABLE threads (
        id TEXT,
        cwd TEXT,
        title TEXT,
        first_user_message TEXT,
        archived INTEGER,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        source TEXT,
        git_branch TEXT
      );
    `);

    const historyDb = new DatabaseSync(historyDbPath);
    historyDb.exec(`
      CREATE TABLE thread_items (
        thread_id TEXT,
        item_id TEXT,
        rollout_ordinal INTEGER,
        item_json TEXT,
        item_type TEXT
      );
    `);

    return { stateDbPath, historyDbPath, stateDb, historyDb };
  }

  it("lists projects, active threads (skipping subagent threads), and parses history items", async () => {
    const { stateDbPath, historyDbPath, stateDb, historyDb } = setupDbs();

    stateDb.prepare("INSERT INTO projects VALUES (?, ?, ?)").run("proj1", "Codex Proj", 2000);
    stateDb.prepare("INSERT INTO project_roots VALUES (?, ?, ?)").run("proj1", 0, "/path/to/codexproj");

    // Active thread
    stateDb.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "t1", "/path/to/codexproj", "Thread One", "First prompt", 0, 100, 2000, "user", "main"
    );
    // Archived thread (should be filtered out)
    stateDb.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "t2", "/path/to/codexproj", "Thread Two", "Second prompt", 1, 100, 3000, "user", "main"
    );
    // Subagent thread (should be filtered out)
    stateDb.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "t3", "/path/to/codexproj", "Subagent Thread", "Sub prompt", 0, 100, 4000, "{\"subagent\": true}", "main"
    );

    // History items for t1
    historyDb.prepare("INSERT INTO thread_items VALUES (?, ?, ?, ?, ?)").run(
      "t1", "item1", 1, JSON.stringify({ type: "userMessage", content: [{ text: "Hello Codex" }] }), "userMessage"
    );
    historyDb.prepare("INSERT INTO thread_items VALUES (?, ?, ?, ?, ?)").run(
      "t1", "item2", 2, JSON.stringify({ type: "agentMessage", text: "Hello back" }), "agentMessage"
    );
    historyDb.prepare("INSERT INTO thread_items VALUES (?, ?, ?, ?, ?)").run(
      "t1", "item3", 3, JSON.stringify({ type: "commandExecution", id: "cmd1", command: "npm test", aggregatedOutput: "all pass" }), "commandExecution"
    );
    historyDb.prepare("INSERT INTO thread_items VALUES (?, ?, ?, ?, ?)").run(
      "t1", "item4", 4, JSON.stringify({ type: "mcpToolCall", id: "mcp1", server: "fs", tool: "read", arguments: { path: "a.txt" } }), "mcpToolCall"
    );

    stateDb.close();
    historyDb.close();

    const catalog = new CodexSessionCatalog({ stateDbPath, historyDbPath });

    const projects = await catalog.listProjects();
    expect(projects).toEqual([
      { path: "/path/to/codexproj", name: "Codex Proj", lastModified: 2000 },
    ]);

    const sessions = await catalog.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe("t1");
    expect(sessions[0]?.title).toBe("Thread One");
    expect(sessions[0]?.gitBranch).toBe("main");

    const history = await catalog.history("t1");
    expect(history).toEqual([
      { kind: "user_text", content: "Hello Codex", sourceUuid: "item1" },
      { kind: "agent_text", content: "Hello back", sourceUuid: "item2" },
      { kind: "tool_call", toolName: "bash", toolUseId: "cmd1", content: "npm test", sourceUuid: "item3:call" },
      { kind: "tool_result", toolName: "bash", toolUseId: "cmd1", content: "all pass", sourceUuid: "item3:result" },
      { kind: "tool_call", toolName: "fs:read", toolUseId: "mcp1", content: "{\"path\":\"a.txt\"}", sourceUuid: "item4:call" },
    ]);
  });

  it("handles missing or corrupt DBs gracefully", async () => {
    const catalog = new CodexSessionCatalog({
      stateDbPath: "/non/existent/state.sqlite",
      historyDbPath: "/non/existent/history.sqlite",
    });
    expect(await catalog.listProjects()).toEqual([]);
    expect(await catalog.list()).toEqual([]);
    expect(await catalog.history("t1")).toEqual([]);
  });
});

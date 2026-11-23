import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpenCodeSessionCatalog } from "../../src/agents/opencode/opencode-session-catalog.ts";

describe("OpenCodeSessionCatalog", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function setupDb() {
    tmpDir = mkdtempSync(join(import.meta.dirname ?? "", "opencode-test-"));
    const dbPath = join(tmpDir, "opencode.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE project (
        id TEXT,
        worktree TEXT,
        name TEXT,
        time_created INTEGER,
        time_updated INTEGER,
        time_archived INTEGER
      );
      CREATE TABLE session_v2 (
        id TEXT,
        project_id TEXT,
        parent_id TEXT,
        directory TEXT,
        title TEXT,
        time_created INTEGER,
        time_updated INTEGER,
        time_archived INTEGER
      );
      CREATE TABLE session_message (
        id TEXT,
        session_id TEXT,
        type TEXT,
        seq INTEGER,
        time_created INTEGER,
        data TEXT
      );
    `);
    return { dbPath, db };
  }

  it("lists projects and sessions correctly, including messages mapping", async () => {
    const { dbPath, db } = setupDb();
    db.prepare("INSERT INTO project VALUES (?, ?, ?, ?, ?, ?)").run("p1", "/repo/a", "Project A", 100, 1000, null);
    db.prepare("INSERT INTO project VALUES (?, ?, ?, ?, ?, ?)").run("p2", "/repo/archived", "Archived", 100, 2000, 1500);
    db.prepare("INSERT INTO project VALUES (?, ?, ?, ?, ?, ?)").run("p3", "", "Empty Worktree", 100, 3000, null);

    db.prepare("INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("s1", "p1", null, "/repo/a", "Session 1", 100, 500, null);
    db.prepare("INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("s2", "p1", "s1", "/repo/a", "Child Session", 150, 600, null);
    db.prepare("INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("s3", "p1", null, "/repo/a", "Archived Session", 200, 700, 800);

    // Messages for s1
    db.prepare("INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)").run("m1", "s1", "user", 1, 10, JSON.stringify({ text: "Hello AI" }));
    db.prepare("INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)").run("m2", "s1", "assistant", 2, 20, JSON.stringify({
      content: [
        { type: "text", text: "Hello human" },
        { type: "tool", id: "t1", name: "bash", state: { input: { command: "ls" }, content: "file.txt" } }
      ]
    }));

    db.close();

    const catalog = new OpenCodeSessionCatalog(dbPath);

    const projects = await catalog.listProjects();
    expect(projects).toEqual([
      { path: "/repo/a", name: "Project A", lastModified: 1000 },
    ]);

    const sessions = await catalog.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe("s1");
    expect(sessions[0]?.title).toBe("Session 1");

    const history = await catalog.history("s1");
    expect(history).toEqual([
      { kind: "user_text", content: "Hello AI", sourceUuid: "m1" },
      { kind: "agent_text", content: "Hello human", sourceUuid: "m2:0" },
      { kind: "tool_call", toolName: "bash", toolUseId: "t1", content: "{\"command\":\"ls\"}", sourceUuid: "m2:1:call" },
      { kind: "tool_result", toolName: "bash", toolUseId: "t1", content: "file.txt", sourceUuid: "m2:1:result" },
    ]);
  });

  it("handles missing or corrupt DB gracefully", async () => {
    const catalog = new OpenCodeSessionCatalog("/non/existent/path.db");
    expect(await catalog.listProjects()).toEqual([]);
    expect(await catalog.list()).toEqual([]);
    expect(await catalog.history("s1")).toEqual([]);
  });
});

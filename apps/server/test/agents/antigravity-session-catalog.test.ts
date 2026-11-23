import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AntigravitySessionCatalog } from "../../src/agents/antigravity/antigravity-session-catalog.ts";

describe("AntigravitySessionCatalog", () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists top-level conversations, parses workspace_uris, and excludes subagents", () => {
    dir = mkdtempSync(join(tmpdir(), "vo-agy-"));
    const dbPath = join(dir, "conversation_summaries.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE conversation_summaries (
      conversation_id TEXT,
      title TEXT,
      preview TEXT,
      last_modified_time TEXT,
      workspace_uris TEXT,
      parent_conversation_id TEXT,
      nesting_depth INTEGER
    )`);
    const insert = db.prepare(`INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run("conv-1", "Fix login", "preview", "2026-11-20 10:00:00+00:00", '["file:///work/alpha"]', "", 0);
    insert.run("conv-2", "", "Fallback preview", "2026-11-21 12:00:00+00:00", '["file:///work/beta"]', null, 0);
    insert.run("conv-sub-parent", "Sub", "sub", "2026-11-22 00:00:00+00:00", '["file:///work/alpha"]', "conv-1", 0);
    insert.run("conv-sub-depth", "Deep", "deep", "2026-11-23 00:00:00+00:00", '["file:///work/alpha"]', "", 1);
    db.close();

    const catalog = new AntigravitySessionCatalog({ summariesDbPath: dbPath, brainDir: join(dir, "brain") });

    const sessions = catalog.list();
    const projects = catalog.listProjects();

    return Promise.all([sessions, projects]).then(([sessionList, projectList]) => {
      expect(sessionList).toHaveLength(2);
      expect(sessionList[0]!.sessionId).toBe("conv-2");
      expect(sessionList[0]!.title).toBe("Fallback preview");
      expect(sessionList[0]!.cwd).toBe("/work/beta");
      expect(sessionList[1]!.sessionId).toBe("conv-1");
      expect(sessionList[1]!.title).toBe("Fix login");
      expect(sessionList[1]!.cwd).toBe("/work/alpha");

      expect(projectList).toHaveLength(2);
      expect(projectList[0]!.path).toBe("/work/beta");
      expect(projectList[0]!.name).toBe("beta");
      expect(projectList[1]!.path).toBe("/work/alpha");
      expect(projectList[1]!.name).toBe("alpha");
    });
  });

  it("reads transcript.jsonl USER_INPUT and PLANNER_RESPONSE messages with tool calls", () => {
    dir = mkdtempSync(join(tmpdir(), "vo-agy-"));
    const brainDir = join(dir, "brain");
    const logDir = join(brainDir, "conv-1", ".system_generated", "logs");
    mkdirSync(logDir, { recursive: true });
    const transcriptPath = join(logDir, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      [
        '{"step_index":1,"type":"USER_INPUT","source":"USER_EXPLICIT","content":"Hello agent"}',
        '{"step_index":2,"type":"EPHEMERAL_MESSAGE","source":"SYSTEM_SDK","content":"ignore me"}',
        '{"step_index":3,"type":"PLANNER_RESPONSE","source":"MODEL","content":"Checking files","tool_calls":[{"id":"tc-1","name":"read_file","arguments":{"path":"a.ts"}}]}',
        "{bad json",
      ].join("\n") + "\n",
    );

    const catalog = new AntigravitySessionCatalog({ brainDir });
    return catalog.history("conv-1").then((messages) => {
      expect(messages).toHaveLength(3);
      expect(messages[0]!.kind).toBe("user_text");
      expect(messages[0]!.content).toBe("Hello agent");
      expect(messages[0]!.sourceUuid).toBe("step-1");
      expect(messages[1]!.kind).toBe("agent_text");
      expect(messages[1]!.content).toBe("Checking files");
      expect(messages[1]!.sourceUuid).toBe("step-3:text");
      expect(messages[2]!.kind).toBe("tool_call");
      expect(messages[2]!.toolName).toBe("read_file");
      expect(messages[2]!.toolUseId).toBe("tc-1");
      expect(messages[2]!.content).toBe('{"path":"a.ts"}');
      expect(messages[2]!.sourceUuid).toBe("step-3:tc-0");
    });
  });

  it("rejects path traversal sessionIds and returns empty array for missing or corrupt stores", () => {
    dir = mkdtempSync(join(tmpdir(), "vo-agy-"));
    const brainDir = join(dir, "brain");
    const dbPath = join(dir, "conversation_summaries.db");

    const catalog = new AntigravitySessionCatalog({ summariesDbPath: dbPath, brainDir });

    return Promise.all([
      catalog.history("../etc"),
      catalog.history("a/b"),
      catalog.list(),
      catalog.listProjects(),
      catalog.history("missing"),
    ]).then(([traversal1, traversal2, listResult, projectsResult, missingResult]) => {
      expect(traversal1).toEqual([]);
      expect(traversal2).toEqual([]);
      expect(listResult).toEqual([]);
      expect(projectsResult).toEqual([]);
      expect(missingResult).toEqual([]);
    });
  });

  it("returns empty arrays for corrupt database", () => {
    dir = mkdtempSync(join(tmpdir(), "vo-agy-"));
    const dbPath = join(dir, "corrupt.db");
    writeFileSync(dbPath, Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01, 0x02, 0x03]));
    const brainDir = join(dir, "brain");

    const catalog = new AntigravitySessionCatalog({ summariesDbPath: dbPath, brainDir });

    return Promise.all([catalog.list(), catalog.listProjects()]).then(([listResult, projectsResult]) => {
      expect(listResult).toEqual([]);
      expect(projectsResult).toEqual([]);
    });
  });
});

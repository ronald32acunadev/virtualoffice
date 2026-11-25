import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import type { MediaPlaybackState, MediaPreset } from "../../src/office/domain/types.ts";
import { createHarness, makeTempDir } from "../helpers/harness.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** The MVP-shaped schema: no name, species, imported_at, or source_uuid. */
function createMvpDatabase(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  const file = path.join(dir, "office.sqlite");
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE employees (id TEXT PRIMARY KEY, boss_id TEXT NOT NULL, hired_by TEXT, task TEXT NOT NULL,
      working_directory TEXT NOT NULL, provider_session_id TEXT, status TEXT NOT NULL, failure_reason TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, seq INTEGER);
    CREATE TABLE messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, employee_id TEXT NOT NULL,
      kind TEXT NOT NULL, content TEXT NOT NULL, tool_name TEXT, tool_use_id TEXT, parent_tool_use_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE approvals (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, employee_id TEXT NOT NULL,
      kind TEXT NOT NULL, tool_name TEXT NOT NULL, summary TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL,
      decision TEXT, answers TEXT, can_approve_for_session INTEGER NOT NULL, created_at TEXT NOT NULL, decided_at TEXT);
    INSERT INTO employees VALUES ('e1','claude',NULL,'Old task','/tmp',NULL,'idle',NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',1);
    INSERT INTO employees VALUES ('e2','claude',NULL,'Older task','/tmp',NULL,'stopped',NULL,'2026-01-02T00:00:00Z','2026-01-02T00:00:00Z',2);
    INSERT INTO messages (id, employee_id, kind, content, created_at) VALUES ('m1','e1','user_text','Old task','2026-01-01T00:00:00Z');
  `);
  db.close();
  return file;
}

describe("Schema migration risk: existing database", () => {
  it("opens an MVP-shaped database, keeps its rows, and is idempotent when opened again", () => {
    const file = createMvpDatabase();
    const first = new SqliteOfficeRepository(file);
    expect(first.getEmployee("e1")).toMatchObject({ task: "Old task", name: "", importedAt: null });
    expect(first.listMessages("e1")).toMatchObject([{ id: "m1", content: "Old task", sourceUuid: null }]);
    first.close();
    const second = new SqliteOfficeRepository(file);
    expect(second.listEmployees()).toHaveLength(2);
    second.close();
  });

  it("US-04 / AC-04: startup gives employees without a name a generated name and species", () => {
    const file = createMvpDatabase();
    const h = createHarness(new SqliteOfficeRepository(file), { random: () => 0 });
    expect(h.office.backfillProfiles()).toBe(2);
    const [a, b] = h.office.getState().employees;
    expect([a!.name, a!.species]).toEqual(["Milo", "wolf"]);
    expect([b!.name, b!.species]).toEqual(["Luna", "wolf"]);
    // Running it again changes nothing.
    expect(h.office.backfillProfiles()).toBe(0);
    h.repository.close();
    const reopened = new SqliteOfficeRepository(file);
    expect(reopened.getEmployee("e1")).toMatchObject({ name: "Milo", species: "wolf" });
    reopened.close();
  });
});

describe("US-03 / AC-02 role column", () => {
  it("adds a nullable role column to an older database, keeps rows, and persists a role", () => {
    const file = createMvpDatabase();
    const first = new SqliteOfficeRepository(file);
    expect(first.getEmployee("e1")?.role).toBeNull();
    const e1 = first.getEmployee("e1")!;
    first.updateEmployee({ ...e1, role: "review-risk" });
    first.close();
    const second = new SqliteOfficeRepository(file); // idempotent on reopen
    expect(second.getEmployee("e1")?.role).toBe("review-risk");
    expect(second.getEmployee("e2")?.role).toBeNull();
    second.close();
  });
});

describe("US-01 / AC-01 job_title column", () => {
  it("adds a nullable job_title column to an older database, keeps rows, and persists a job title", () => {
    const file = createMvpDatabase();
    const first = new SqliteOfficeRepository(file);
    expect(first.getEmployee("e1")?.jobTitle).toBeNull();
    const e1 = first.getEmployee("e1")!;
    first.updateEmployee({ ...e1, jobTitle: "Architect" });
    first.close();
    const second = new SqliteOfficeRepository(file);
    expect(second.getEmployee("e1")?.jobTitle).toBe("Architect");
    expect(second.getEmployee("e2")?.jobTitle).toBeNull();
    second.close();
  });
});

describe("US-02 / AC-01 media tables", () => {
  it("creates media tables, preserves employees, persists state and presets across reopen, orders presets newest first, and supports deletion and clearing", () => {
    const file = createMvpDatabase();
    const first = new SqliteOfficeRepository(file);

    expect(first.getEmployee("e1")).not.toBeNull();
    expect(first.getEmployee("e2")).not.toBeNull();

    const state: MediaPlaybackState = {
      provider: "spotify",
      mediaKind: "audio",
      sourceUrl: "https://open.spotify.com/track/abc",
      embedUrl: "https://open.spotify.com/embed/track/abc",
      title: "Track A",
      thumbnailUrl: "https://i.scdn.co/image/abc",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    first.setMediaState(state);
    expect(first.getMediaState()).toEqual(state);

    const preset1: MediaPreset = {
      id: "p1",
      provider: "youtube_music",
      mediaKind: "video",
      sourceUrl: "https://music.youtube.com/watch?v=1",
      embedUrl: "https://music.youtube.com/embed/1",
      title: "Preset 1",
      thumbnailUrl: null,
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const preset2: MediaPreset = {
      id: "p2",
      provider: "apple_music",
      mediaKind: "audio",
      sourceUrl: "https://music.apple.com/track/2",
      embedUrl: "https://music.apple.com/embed/track/2",
      title: "Preset 2",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/2",
      createdAt: "2025-01-02T00:00:00.000Z",
    };
    first.insertMediaPreset(preset1);
    first.insertMediaPreset(preset2);

    let presets = first.listMediaPresets();
    expect(presets).toHaveLength(2);
    expect(presets[0]!.id).toBe("p2");
    expect(presets[1]!.id).toBe("p1");

    first.close();

    const second = new SqliteOfficeRepository(file);
    expect(second.getEmployee("e1")).not.toBeNull();
    expect(second.getEmployee("e2")).not.toBeNull();
    expect(second.getMediaState()).toEqual(state);

    presets = second.listMediaPresets();
    expect(presets).toHaveLength(2);
    expect(presets[0]!.id).toBe("p2");
    expect(presets[1]!.id).toBe("p1");

    second.deleteMediaPreset("p1");
    presets = second.listMediaPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.id).toBe("p2");

    second.setMediaState(null);
    expect(second.getMediaState()).toBeNull();

    second.close();

    const third = new SqliteOfficeRepository(file);
    expect(third.getMediaState()).toBeNull();
    presets = third.listMediaPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.id).toBe("p2");
    third.close();
  });
});

describe("Agent team table and employees.agent_id migration", () => {
  it("adds agents table and nullable agent_id column, supports Agent CRUD, and reassigns chats", () => {
    const file = createMvpDatabase();
    const first = new SqliteOfficeRepository(file);

    expect(first.getEmployee("e1")?.agentId).toBeNull();
    expect(first.listAgents()).toEqual([]);

    const agent = {
      id: "agent-1",
      bossId: "claude" as const,
      name: "Maya",
      species: "fox" as const,
      role: "review-risk",
      jobTitle: "Reviewer",
      model: null,
      mode: "request_review" as const,
      effort: null,
      createdAt: "2026-11-24T00:00:00Z",
      updatedAt: "2026-11-24T00:00:00Z",
    };
    first.insertAgent(agent);
    expect(first.getAgent("agent-1")).toEqual(agent);
    expect(first.listAgents()).toEqual([agent]);

    const e1 = first.getEmployee("e1")!;
    expect(e1.model).toBeNull();
    expect(e1.mode).toBe("request_review");
    first.updateEmployee({ ...e1, agentId: "agent-1", model: "claude-opus-4-1", mode: "turbo" });
    expect(first.getEmployee("e1")).toMatchObject({ agentId: "agent-1", model: "claude-opus-4-1", mode: "turbo" });

    first.updateAgent({
      ...agent,
      name: "Milo",
      jobTitle: "Lead Reviewer",
      model: "claude-sonnet-4-5",
      mode: "turbo",
      updatedAt: "2026-11-24T01:00:00Z",
    });
    expect(first.getAgent("agent-1")).toMatchObject({
      name: "Milo",
      model: "claude-sonnet-4-5",
      mode: "turbo",
    });

    first.reassignEmployeesAgent("agent-1", null);
    expect(first.getEmployee("e1")?.agentId).toBeNull();

    expect(first.deleteAgent("agent-1")).toBe(true);
    expect(first.getAgent("agent-1")).toBeUndefined();
    first.close();

    const second = new SqliteOfficeRepository(file);
    expect(second.listAgents()).toEqual([]);
    expect(second.getEmployee("e1")?.agentId).toBeNull();
    second.close();
  });
});

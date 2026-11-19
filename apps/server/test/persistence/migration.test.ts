import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
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

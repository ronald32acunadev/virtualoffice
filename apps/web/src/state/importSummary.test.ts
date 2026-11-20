import { describe, expect, it } from "vitest";
import type { Employee } from "../api/types";
import { formatImportResult } from "./importSummary";

const emp = (over: Partial<Employee>): Employee => ({
  id: "e",
  bossId: "claude",
  hiredBy: null,
  task: "t",
  workingDirectory: "/tmp",
  name: "Ada",
  species: "cat",
  importedAt: "2026-01-01T00:00:00.000Z",
  role: null,
  providerSessionId: "s1",
  status: "idle",
  failureReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("formatImportResult", () => {
  it("US-05 / AC-04: lists imported names and skipped sessions with readable reasons", () => {
    const summary = formatImportResult(
      {
        imported: [emp({ name: "Ada" }), emp({ name: "Linus", status: "failed", failureReason: "Project folder not found: /gone" })],
        skipped: [
          { sessionId: "s2", reason: "missing_cwd" },
          { sessionId: "s3", reason: "read_failed" },
        ],
      },
      { s2: "Fix login" },
    );
    expect(summary.headline).toBe("Imported 2 sessions, skipped 2");
    expect(summary.imported).toEqual(["Ada", "Linus (Project folder not found: /gone)"]);
    expect(summary.skipped).toEqual([
      "Fix login: No project folder recorded for this session",
      "s3: Could not read the session",
    ]);
  });

  it("US-05 / AC-04: handles a single import with nothing skipped", () => {
    const summary = formatImportResult({ imported: [emp({})], skipped: [] });
    expect(summary.headline).toBe("Imported 1 session");
    expect(summary.skipped).toEqual([]);
  });
});

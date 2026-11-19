import { describe, expect, it } from "vitest";
import type { Employee } from "../api/types";
import { composerKeyAction, formatRelativeTime, groupEmployeesByBoss, isFolderMissing } from "./sidebar";

const emp = (over: Partial<Employee>): Employee => ({
  id: "e",
  bossId: "claude",
  hiredBy: null,
  task: "t",
  workingDirectory: "/tmp",
  name: "Ada",
  species: "cat",
  importedAt: null,
  role: null,
  providerSessionId: null,
  status: "idle",
  failureReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const bosses = [
  { id: "claude" as const, name: "Claude" },
  { id: "codex" as const, name: "Codex" },
];

describe("sidebar", () => {
  it("US-03 / AC-01: groups by boss, newest activity first, dropping empty groups", () => {
    const groups = groupEmployeesByBoss(
      [
        emp({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" }),
        emp({ id: "new", updatedAt: "2026-02-01T00:00:00.000Z" }),
        emp({ id: "x", bossId: "codex", updatedAt: "2026-01-05T00:00:00.000Z" }),
      ],
      bosses,
    );
    expect(groups.map((g) => g.bossName)).toEqual(["Claude", "Codex"]);
    expect(groups[0]?.employees.map((e) => e.id)).toEqual(["new", "old"]);
    expect(groupEmployeesByBoss([emp({ id: "a" })], bosses).map((g) => g.bossId)).toEqual(["claude"]);
  });

  it("US-03 / AC-04: Enter sends, Shift+Enter is a newline, empty is not sent", () => {
    expect(composerKeyAction({ key: "Enter", shiftKey: false }, "hi")).toBe("send");
    expect(composerKeyAction({ key: "Enter", shiftKey: true }, "hi")).toBe("newline");
    expect(composerKeyAction({ key: "Enter", shiftKey: false }, "   ")).toBe("none");
    expect(composerKeyAction({ key: "a", shiftKey: false }, "hi")).toBe("none");
    expect(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: true }, "hi")).toBe("none");
  });

  it("US-05 / AC-05: detects a missing project folder from the failure reason", () => {
    expect(isFolderMissing({ failureReason: "Project folder not found: /gone" })).toBe(true);
    expect(isFolderMissing({ failureReason: "boom" })).toBe(false);
    expect(isFolderMissing({ failureReason: null })).toBe(false);
  });

  it("US-05 / AC-01: formats relative dates", () => {
    const now = Date.parse("2026-03-10T12:00:00.000Z");
    expect(formatRelativeTime("2026-03-10T11:59:50.000Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-03-10T11:30:00.000Z", now)).toBe("30m ago");
    expect(formatRelativeTime("2026-03-10T07:00:00.000Z", now)).toBe("5h ago");
    expect(formatRelativeTime("2026-03-07T12:00:00.000Z", now)).toBe("3d ago");
  });
});

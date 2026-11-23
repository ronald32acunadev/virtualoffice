import { describe, expect, it } from "vitest";
import type { Employee, Project } from "../api/types";
import {
  composerKeyAction,
  formatRelativeTime,
  groupEmployeesByBoss,
  groupEmployeesByProject,
  isNonProjectPath,
  isWorktreePath,
  buildProjectOptions,
} from "./sidebar";

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
  jobTitle: null,
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

  it("US-02 / AC-01: isWorktreePath detection", () => {
    expect(isWorktreePath("/home/pumba/.codex/worktrees/rag-249-ac36-evidence/ardi")).toBe(true);
    expect(isWorktreePath("/home/pumba/.claude/worktrees/feat-1")).toBe(true);
    expect(isWorktreePath("/repo/.git/worktrees/foo")).toBe(true);
    expect(isWorktreePath("/projects/worktrees/bar")).toBe(true);
    expect(isWorktreePath("/run/media/pumba/Proyects/Voiceflip/ardi")).toBe(false);
  });

  it("US-02 / AC-01: isNonProjectPath detection", () => {
    expect(isNonProjectPath("/home/pumba")).toBe(true);
    expect(isNonProjectPath("/Users/alice")).toBe(true);
    expect(isNonProjectPath("/tmp")).toBe(true);
    expect(isNonProjectPath("/tmp/foo")).toBe(true);
    expect(isNonProjectPath("/home/pumba/Downloads/guia-bridge-local")).toBe(true);
    expect(isNonProjectPath("/run/media/pumba/Proyects/Personal/Desktop")).toBe(true);
    expect(isNonProjectPath("/home/pumba/Documents/Default Project", "Default Project")).toBe(true);
    expect(isNonProjectPath("/run/media/pumba/Proyects/Voiceflip/ardi")).toBe(false);
  });

  it("US-02 / AC-01: merges duplicate project folders and worktrees into ONE ardi group with deduplicated providers", () => {
    const employees: Employee[] = [
      emp({ id: "e1", bossId: "claude", workingDirectory: "/run/media/pumba/Proyects/Voiceflip/ardi", updatedAt: "2026-03-01T10:00:00.000Z" }),
      emp({ id: "e2", bossId: "codex", workingDirectory: "/home/pumba/.codex/worktrees/rag-249-ac36-evidence/ardi", updatedAt: "2026-03-01T11:00:00.000Z" }),
      emp({ id: "e3", bossId: "claude", workingDirectory: "/run/media/pumba/Proyects/Voiceflip/armls-bridge-voice", updatedAt: "2026-03-01T09:00:00.000Z" }),
    ];
    const projects: Project[] = [
      { path: "/run/media/pumba/Proyects/Voiceflip/armls-bridge-voice", name: "ardi", providers: ["claude"], lastSeenAt: "2026-03-01T11:00:00.000Z" },
      { path: "/run/media/pumba/Proyects/Voiceflip/ardi", name: "ardi", providers: ["codex"], lastSeenAt: "2026-03-01T12:00:00.000Z" },
    ];

    const groups = groupEmployeesByProject(employees, projects);
    expect(groups.length).toBe(1);
    expect(groups[0]?.projectName).toBe("ardi");
    expect(groups[0]?.projectKey).toBe("/run/media/pumba/Proyects/Voiceflip/ardi");
    expect(groups[0]?.employees.map((e) => e.id)).toEqual(["e2", "e1", "e3"]);
    expect(groups[0]?.providers.sort()).toEqual(["claude", "codex"]);
  });

  it("US-02 / AC-01b: omits empty non-project paths and groups non-project folders with employees under General at the bottom", () => {
    const employees: Employee[] = [
      emp({ id: "gen1", bossId: "claude", workingDirectory: "/home/pumba/Downloads/guia-bridge-local", updatedAt: "2026-03-01T10:00:00.000Z" }),
      emp({ id: "real1", bossId: "codex", workingDirectory: "/run/media/pumba/Proyects/Voiceflip/ardi", updatedAt: "2026-03-01T09:00:00.000Z" }),
    ];
    const projects: Project[] = [
      { path: "/home/pumba/Documents/Default Project", name: "Default Project", providers: [], lastSeenAt: "" },
    ];

    const groups = groupEmployeesByProject(employees, projects);
    expect(groups.map((g) => g.projectName)).toEqual(["ardi", "General"]);
    expect(groups[1]?.isGeneral).toBe(true);
    expect(groups[1]?.employees.map((e) => e.id)).toEqual(["gen1"]);
  });
});

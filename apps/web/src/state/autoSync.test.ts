import { describe, expect, it } from "vitest";
import type { Employee, Project, SyncSummary } from "../api/types";
import { initialOfficeState, officeReducer } from "./officeReducer";
import { buildProjectOptions, formatSyncErrors, groupEmployeesByProject } from "./sidebar";

function emp(id: string, workingDirectory: string, updatedAt: string): Employee {
  return {
    id,
    bossId: "claude",
    hiredBy: null,
    task: "t",
    workingDirectory,
    name: id,
    species: "fox",
    importedAt: null,
    role: null,
    jobTitle: null,
    providerSessionId: null,
    status: "idle",
    failureReason: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("autoSync", () => {
  it("US-03 / AC-01: groupEmployeesByProject merges discovered projects including empty ones", () => {
    const e1 = emp("e1", "/work/alpha", "2026-11-20T10:00:00.000Z");
    const projects: Project[] = [
      { path: "/work/alpha", name: "alpha", providers: ["claude"], lastSeenAt: "2026-11-20T09:00:00.000Z" },
      { path: "/work/beta", name: "Beta App", providers: ["codex"], lastSeenAt: "2026-11-21T10:00:00.000Z" },
    ];

    expect(groupEmployeesByProject([e1], projects)).toEqual([
      { projectKey: "/work/beta", projectName: "Beta App", employees: [] },
      { projectKey: "/work/alpha", projectName: "alpha", employees: [e1] },
    ]);
  });

  it("US-03 / AC-01: officeReducer stores projects from state_loaded and projects_updated", () => {
    const p1: Project = { path: "/work/alpha", name: "alpha", providers: ["claude"], lastSeenAt: "2026-11-20T09:00:00.000Z" };
    const p2: Project = { path: "/work/beta", name: "Beta", providers: ["codex"], lastSeenAt: "2026-11-21T10:00:00.000Z" };

    const s1 = officeReducer(initialOfficeState, {
      type: "state_loaded",
      snapshot: { bosses: [], employees: [], approvals: [], projects: [p1] },
    });
    expect(s1.projects).toEqual([p1]);

    const s2 = officeReducer(s1, {
      type: "server_event",
      event: { type: "projects_updated", projects: [p1, p2] },
    });
    expect(s2.projects).toEqual([p1, p2]);
  });

  it("US-03 / AC-02: formatSyncErrors formats per-provider errors or returns null", () => {
    const clean: SyncSummary = {
      projectsAdded: 1,
      sessionsImported: 2,
      skipped: 0,
      providers: {
        claude: { projectsAdded: 1, sessionsImported: 2, skipped: 0, error: null },
      },
    };
    expect(formatSyncErrors(clean)).toBeNull();

    const withError: SyncSummary = {
      projectsAdded: 0,
      sessionsImported: 0,
      skipped: 0,
      providers: {
        opencode: { projectsAdded: 0, sessionsImported: 0, skipped: 0, error: "db locked" },
      },
    };
    expect(formatSyncErrors(withError)).toBe("Sync issues: opencode: db locked");
  });

  it("US-03 / AC-03: buildProjectOptions deduplicates discovered projects and employee directories", () => {
    const projects: Project[] = [
      { path: "/work/alpha/", name: "alpha", providers: ["claude"], lastSeenAt: "2026-11-20T09:00:00.000Z" },
      { path: "/work/beta", name: "Beta App", providers: ["codex"], lastSeenAt: "2026-11-21T10:00:00.000Z" },
    ];
    const employees: Employee[] = [
      emp("e1", "/work/alpha", "2026-11-20T10:00:00.000Z"),
      emp("e2", "/work/gamma", "2026-11-22T08:00:00.000Z"),
    ];

    expect(buildProjectOptions(projects, employees).map((o) => o.path)).toEqual([
      "/work/gamma",
      "/work/beta",
      "/work/alpha",
    ]);
  });
});

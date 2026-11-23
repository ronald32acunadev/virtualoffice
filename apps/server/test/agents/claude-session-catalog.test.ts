import { describe, it, expect } from "vitest";
import { ClaudeSessionCatalog } from "../../src/agents/claude/claude-session-catalog.ts";

describe("ClaudeSessionCatalog", () => {
  it("listProjects derives deduplicated projects with max lastModified and ignores empty cwd", async () => {
    const catalog = new ClaudeSessionCatalog(
      async () => [
        {
          sessionId: "s1",
          customTitle: "Session 1",
          summary: "",
          firstPrompt: "hello",
          cwd: "/path/to/projectA",
          gitBranch: "main",
          lastModified: 1000,
          createdAt: 100,
        },
        {
          sessionId: "s2",
          customTitle: "Session 2",
          summary: "",
          firstPrompt: "world",
          cwd: "/path/to/projectA",
          gitBranch: "main",
          lastModified: 5000,
          createdAt: 200,
        },
        {
          sessionId: "s3",
          customTitle: "Session 3",
          summary: "",
          firstPrompt: "empty cwd",
          cwd: "   ",
          lastModified: 9000,
          createdAt: 300,
        },
        {
          sessionId: "s4",
          customTitle: "Session 4",
          summary: "",
          firstPrompt: "project B",
          cwd: "/path/to/projectB",
          gitBranch: "dev",
          lastModified: 3000,
          createdAt: 150,
        },
      ],
      async () => []
    );

    const projects = await catalog.listProjects();
    expect(projects).toEqual([
      { path: "/path/to/projectA", name: "projectA", lastModified: 5000 },
      { path: "/path/to/projectB", name: "projectB", lastModified: 3000 },
    ]);
  });

  it("handles SDK failure gracefully and returns []", async () => {
    const catalog = new ClaudeSessionCatalog(
      async () => {
        throw new Error("SDK failure");
      },
      async () => []
    );

    expect(await catalog.listProjects()).toEqual([]);
    await expect(catalog.list()).rejects.toThrow("SDK failure");
  });
});

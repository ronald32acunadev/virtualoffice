import { describe, expect, it } from "vitest";
import { classifyToolActivity } from "../../src/office/domain/tool-activity.ts";

describe("classifyToolActivity", () => {
  it("classifies Claude MCP tools and extracts server and tool names", () => {
    const result = classifyToolActivity("mcp__engram__mem_search", JSON.stringify({ query: "auth" }), "2026-11-24T00:00:00Z");
    expect(result).toEqual({
      category: "mcp_request",
      toolName: "mcp__engram__mem_search",
      serverName: "engram",
      label: "engram · mem_search",
      startedAt: "2026-11-24T00:00:00Z",
    });
  });

  it("classifies Codex server:tool MCP tools", () => {
    const result = classifyToolActivity("codegraph:codegraph_explore", "{}", "2026-11-24T00:00:00Z");
    expect(result.category).toBe("mcp_request");
    expect(result.serverName).toBe("codegraph");
    expect(result.label).toBe("codegraph · codegraph_explore");
  });

  it("classifies bare mcp tool calls", () => {
    const result = classifyToolActivity("mcp", "{}", "2026-11-24T00:00:00Z");
    expect(result.category).toBe("mcp_request");
    expect(result.serverName).toBe("mcp");
  });

  it("classifies file reading and searching tools as searching_files", () => {
    for (const tool of ["Read", "Grep", "Glob", "LS", "Find", "view_file", "grep_search", "find_by_name", "list_dir"]) {
      const result = classifyToolActivity(tool, "{}", "2026-11-24T00:00:00Z");
      expect(result.category, tool).toBe("searching_files");
      expect(result.serverName).toBeNull();
    }
  });

  it("classifies web search and fetch tools as searching_web", () => {
    for (const tool of ["WebSearch", "WebFetch", "search_web"]) {
      expect(classifyToolActivity(tool, "{}", "2026-11-24T00:00:00Z").category).toBe("searching_web");
    }
  });

  it("classifies Task and Agent tools as delegating", () => {
    for (const tool of ["Task", "Agent", "invoke_subagent"]) {
      expect(classifyToolActivity(tool, "{}", "2026-11-24T00:00:00Z").category).toBe("delegating");
    }
  });

  it("classifies editing, bash, and unknown tools as coding", () => {
    for (const tool of ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "command_execution", "CustomTool", null]) {
      expect(classifyToolActivity(tool, "{}", "2026-11-24T00:00:00Z").category).toBe("coding");
    }
  });
});

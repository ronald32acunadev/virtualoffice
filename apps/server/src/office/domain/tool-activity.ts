import type { AgentActivity } from "./types.ts";

const FILE_SEARCH_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "LS",
  "Find",
  "read_file",
  "view_file",
  "grep_search",
  "find_by_name",
  "list_dir",
  "ripgrep",
]);

const WEB_SEARCH_TOOLS = new Set(["WebSearch", "WebFetch", "search_web", "web_search", "fetch_url"]);

const DELEGATION_TOOLS = new Set(["Task", "Agent", "invoke_subagent"]);

const CLAUDE_MCP_RE = /^mcp__([^_]+)__(.+)$/;
const COLON_MCP_RE = /^([a-zA-Z0-9._-]+):([a-zA-Z0-9._-]+)$/;

/** Classifies a tool call into a semantic 3D animation category and readable label. */
export function classifyToolActivity(
  toolName: string | null | undefined,
  _content: string,
  startedAt: string,
): AgentActivity {
  const raw = typeof toolName === "string" && toolName.trim() !== "" ? toolName.trim() : "tool";

  const claudeMcp = CLAUDE_MCP_RE.exec(raw);
  if (claudeMcp) {
    const serverName = claudeMcp[1]!;
    const method = claudeMcp[2]!;
    return {
      category: "mcp_request",
      toolName: raw,
      serverName,
      label: `${serverName} · ${method}`,
      startedAt,
    };
  }

  const colonMcp = COLON_MCP_RE.exec(raw);
  if (colonMcp) {
    const serverName = colonMcp[1]!;
    const method = colonMcp[2]!;
    return {
      category: "mcp_request",
      toolName: raw,
      serverName,
      label: `${serverName} · ${method}`,
      startedAt,
    };
  }

  if (raw.toLowerCase() === "mcp" || raw.toLowerCase().startsWith("mcp_")) {
    return {
      category: "mcp_request",
      toolName: raw,
      serverName: "mcp",
      label: raw,
      startedAt,
    };
  }

  if (FILE_SEARCH_TOOLS.has(raw)) {
    return {
      category: "searching_files",
      toolName: raw,
      serverName: null,
      label: raw,
      startedAt,
    };
  }

  if (WEB_SEARCH_TOOLS.has(raw)) {
    return {
      category: "searching_web",
      toolName: raw,
      serverName: null,
      label: raw,
      startedAt,
    };
  }

  if (DELEGATION_TOOLS.has(raw)) {
    return {
      category: "delegating",
      toolName: raw,
      serverName: null,
      label: raw,
      startedAt,
    };
  }

  return {
    category: "coding",
    toolName: raw,
    serverName: null,
    label: raw,
    startedAt,
  };
}

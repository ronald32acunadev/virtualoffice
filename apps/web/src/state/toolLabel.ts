const MAX_DETAIL = 80;

function parseInput(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function field(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function shorten(text: string): string {
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > MAX_DETAIL ? `${oneLine.slice(0, MAX_DETAIL - 1)}…` : oneLine;
}

/** One-line, human-readable label for a tool call, for example "Ran `npm test`". */
export function buildToolLabel(toolName: string | null, content: string): string {
  const name = toolName ?? "tool";
  const input = parseInput(content);
  const generic = `Used ${name}`;
  const withDetail = (verb: string, detail: string | null) =>
    detail ? `${verb} \`${shorten(detail)}\`` : generic;

  switch (name) {
    case "Bash":
      return withDetail("Ran", field(input, "command"));
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return withDetail("Edited", field(input, "file_path", "notebook_path"));
    case "Write":
      return withDetail("Wrote", field(input, "file_path"));
    case "Read":
      return withDetail("Read", field(input, "file_path"));
    case "Grep":
    case "Glob":
      return withDetail("Searched", field(input, "pattern"));
    case "WebSearch":
      return withDetail("Searched the web for", field(input, "query"));
    case "WebFetch":
      return withDetail("Fetched", field(input, "url"));
    case "Task":
    case "Agent":
      return withDetail("Delegated", field(input, "description"));
    case "TodoWrite":
      return "Updated the to-do list";
    default:
      return generic;
  }
}

/** Splits a label on backticks into plain and code parts, for rendering. */
export function splitLabel(label: string): { text: string; code: boolean }[] {
  return label
    .split("`")
    .map((text, index) => ({ text, code: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

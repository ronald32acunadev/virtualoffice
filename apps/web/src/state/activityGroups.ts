import type { Message } from "../api/types";
import type { TimelineItem } from "./timeline";

export type StepCategory = "read" | "edit" | "search" | "command" | "thought" | "tool";
export type ActivityStatus = "running" | "done" | "error";

export type ParsedEditDiff =
  | { filePath: string | null; oldText: string; newText: string }
  | { filePath: string | null; content: string; isNewFile: true };

export type ParsedCommand = {
  command: string;
  output: string | null;
};

export type ActivityGroupBlock = {
  kind: "activity_group";
  id: string;
  items: TimelineItem[];
  summary: string;
  status: ActivityStatus;
  files: string[];
};

export type TimelineBlock =
  | { kind: "item"; item: TimelineItem }
  | ActivityGroupBlock;

export function classifyStep(item: TimelineItem): StepCategory {
  if (item.message.kind === "thinking") {
    return "thought";
  }
  const toolName = (item.message.toolName ?? "").toLowerCase();
  switch (toolName) {
    case "read":
    case "read_file":
    case "view_file":
    case "view_file_outline":
    case "view_code_item":
      return "read";
    case "edit":
    case "multiedit":
    case "edit_file":
    case "write":
    case "write_file":
    case "write_to_file":
    case "replace_file_content":
    case "multi_replace_file_content":
      return "edit";
    case "grep":
    case "glob":
    case "grep_search":
    case "find_by_name":
    case "search":
    case "websearch":
    case "search_web":
    case "codegraph_explore":
      return "search";
    case "bash":
    case "run_command":
    case "command":
    case "shell":
    case "execute":
      return "command";
    default:
      return "tool";
  }
}

export function extractFilePath(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const keys = ["file_path", "filePath", "path", "Path", "TargetFile", "AbsolutePath"];
      for (const k of keys) {
        const val = obj[k];
        if (typeof val === "string" && val.trim().length > 0) {
          return val.trim();
        }
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return null;
}

export function fileBasename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (p.length > 0) {
      return p;
    }
  }
  return filePath;
}

export function extractEditDiff(toolName: string | null, content: string): ParsedEditDiff | null {
  const dummyMsg: Message = {
    id: "",
    employeeId: "",
    kind: "tool_call",
    content,
    toolName,
    toolUseId: null,
    parentToolUseId: null,
    createdAt: "",
    sourceUuid: null,
  };
  const cat = classifyStep({ message: dummyMsg, result: null, children: [] });
  if (cat !== "edit") {
    return null;
  }

  const filePath = extractFilePath(content);

  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      
      const oldStr = obj["old_string"] ?? obj["Target"] ?? obj["TargetContent"];
      const newStr = obj["new_string"] ?? obj["Replacement"] ?? obj["ReplacementContent"];
      if (typeof oldStr === "string" && typeof newStr === "string") {
        return { filePath, oldText: oldStr, newText: newStr };
      }

      const rawContent = obj["content"] ?? obj["Content"] ?? obj["CodeContent"];
      if (typeof rawContent === "string") {
        return { filePath, content: rawContent, isNewFile: true };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export function extractCommandView(
  toolName: string | null,
  content: string,
  resultContent: string | null
): ParsedCommand | null {
  const dummyMsg: Message = {
    id: "",
    employeeId: "",
    kind: "tool_call",
    content,
    toolName,
    toolUseId: null,
    parentToolUseId: null,
    createdAt: "",
    sourceUuid: null,
  };
  const cat = classifyStep({ message: dummyMsg, result: null, children: [] });
  if (cat !== "command") {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const cmd = obj["command"] ?? obj["CommandLine"] ?? obj["cmd"];
      if (typeof cmd === "string" && cmd.trim().length > 0) {
        return { command: cmd.trim(), output: resultContent };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export function formatActivitySummary(items: readonly TimelineItem[]): string {
  let reads = 0;
  let edits = 0;
  let searches = 0;
  let commands = 0;
  let thoughts = 0;
  let tools = 0;

  for (const item of items) {
    const cat = classifyStep(item);
    if (cat === "read") reads++;
    else if (cat === "edit") edits++;
    else if (cat === "search") searches++;
    else if (cat === "command") commands++;
    else if (cat === "thought") thoughts++;
    else if (cat === "tool") tools++;
  }

  const parts: string[] = [];
  if (reads > 0) parts.push(`Read ${reads} ${reads === 1 ? "file" : "files"}`);
  if (edits > 0) parts.push(`Edited ${edits} ${edits === 1 ? "file" : "files"}`);
  if (searches > 0) parts.push(`Searched ${searches} ${searches === 1 ? "time" : "times"}`);
  if (commands > 0) parts.push(`Ran ${commands} ${commands === 1 ? "command" : "commands"}`);
  if (tools > 0) parts.push(`${tools} ${tools === 1 ? "tool" : "tools"}`);
  if (thoughts > 0 && parts.length === 0) {
    parts.push(`${thoughts} ${thoughts === 1 ? "thought" : "thoughts"}`);
  }

  const totalSteps = items.length;
  const stepLabel = `${totalSteps} ${totalSteps === 1 ? "step" : "steps"}`;

  if (parts.length === 0) {
    if (thoughts > 0) return `${thoughts} ${thoughts === 1 ? "thought" : "thoughts"}`;
    return stepLabel;
  }

  return `${stepLabel} · ${parts.join(", ")}`;
}

export function isToolResultError(result: Message | null): boolean {
  if (!result || !result.content) return false;
  const c = result.content.trim();
  if (c.startsWith("Error:")) return true;
  if (/Command exited with code [1-9]\d*/.test(c)) return true;
  if (/exit code [1-9]\d*/.test(c)) return true;
  return false;
}

export function groupTimelineBlocks(
  items: readonly TimelineItem[],
  employeeActive: boolean
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let currentGroup: TimelineItem[] = [];

  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    
    const hasToolCall = currentGroup.some((i) => i.message.kind === "tool_call");
    if (!hasToolCall) {
      for (const item of currentGroup) {
        blocks.push({ kind: "item", item });
      }
    } else {
      const filesSet = new Set<string>();
      for (const item of currentGroup) {
        if (item.message.kind === "tool_call" && item.message.content) {
          const fp = extractFilePath(item.message.content);
          if (fp) {
            filesSet.add(fileBasename(fp));
          }
        }
      }

      let hasRunning = false;
      let hasError = false;
      for (const item of currentGroup) {
        if (employeeActive && item.message.kind === "tool_call" && item.result === null) {
          hasRunning = true;
        }
        if (isToolResultError(item.result)) {
          hasError = true;
        }
      }

      const status: ActivityStatus = hasRunning ? "running" : hasError ? "error" : "done";
      const id = currentGroup[0]!.message.id;
      const summary = formatActivitySummary(currentGroup);

      blocks.push({
        kind: "activity_group",
        id,
        items: [...currentGroup],
        summary,
        status,
        files: Array.from(filesSet),
      });
    }
    currentGroup = [];
  };

  for (const item of items) {
    const k = item.message.kind;
    const isGroupable = k === "tool_call" || k === "tool_result" || k === "thinking";
    
    if (isGroupable) {
      currentGroup.push(item);
    } else {
      flushGroup();
      blocks.push({ kind: "item", item });
    }
  }
  flushGroup();

  return blocks;
}

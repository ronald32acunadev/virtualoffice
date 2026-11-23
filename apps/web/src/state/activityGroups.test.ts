import { describe, it, expect } from "vitest";
import {
  classifyStep,
  extractFilePath,
  fileBasename,
  extractEditDiff,
  extractCommandView,
  formatActivitySummary,
  isToolResultError,
  groupTimelineBlocks,
} from "./activityGroups";
import type { TimelineItem } from "./timeline";
import type { Message } from "../api/types";

function makeMsg(overrides: Partial<Message>): Message {
  return {
    id: "m1",
    employeeId: "e1",
    kind: "tool_call",
    content: "{}",
    toolName: null,
    toolUseId: null,
    parentToolUseId: null,
    createdAt: "",
    sourceUuid: null,
    ...overrides,
  };
}

describe("activityGroups", () => {
  it("classifies steps correctly", () => {
    const thinkItem: TimelineItem = {
      message: makeMsg({ kind: "thinking", content: "hmm" }),
      result: null,
      children: [],
    };
    expect(classifyStep(thinkItem)).toBe("thought");

    const readItem: TimelineItem = {
      message: makeMsg({ kind: "tool_call", toolName: "read_file" }),
      result: null,
      children: [],
    };
    expect(classifyStep(readItem)).toBe("read");

    const editItem: TimelineItem = {
      message: makeMsg({ kind: "tool_call", toolName: "edit_file" }),
      result: null,
      children: [],
    };
    expect(classifyStep(editItem)).toBe("edit");
  });

  it("extracts file path and basename", () => {
    const content = JSON.stringify({ filePath: "apps/web/src/state/app.ts" });
    expect(extractFilePath(content)).toBe("apps/web/src/state/app.ts");
    expect(fileBasename("apps/web/src/state/app.ts")).toBe("app.ts");
    expect(fileBasename("C:\\windows\\path\\styles.css")).toBe("styles.css");
  });

  it("extracts edit diff and command view", () => {
    const editContent = JSON.stringify({
      filePath: "app.ts",
      old_string: "const x = 1;",
      new_string: "const x = 2;",
    });
    const diff = extractEditDiff("edit_file", editContent);
    expect(diff).not.toBeNull();
    if (diff && "oldText" in diff) {
      expect(diff.oldText).toBe("const x = 1;");
      expect(diff.newText).toBe("const x = 2;");
    }

    const cmdContent = JSON.stringify({ command: "npm test" });
    const cmdView = extractCommandView("bash", cmdContent, "tests passed");
    expect(cmdView).toEqual({ command: "npm test", output: "tests passed" });
  });

  it("formats activity summary correctly", () => {
    const items: TimelineItem[] = [
      { message: makeMsg({ toolName: "read_file" }), result: null, children: [] },
      { message: makeMsg({ toolName: "read_file" }), result: null, children: [] },
      { message: makeMsg({ toolName: "edit_file" }), result: null, children: [] },
      { message: makeMsg({ toolName: "bash" }), result: null, children: [] },
    ];
    expect(formatActivitySummary(items)).toBe("4 steps · Read 2 files, Edited 1 file, Ran 1 command");
  });

  it("detects tool result errors", () => {
    expect(isToolResultError(makeMsg({ kind: "tool_result", content: "Error: failed" }))).toBe(true);
    expect(isToolResultError(makeMsg({ kind: "tool_result", content: "Command exited with code 1" }))).toBe(true);
    expect(isToolResultError(makeMsg({ kind: "tool_result", content: "All good" }))).toBe(false);
  });

  it("groups consecutive tool calls and thinking while standalone thinking stays item", () => {
    const items: TimelineItem[] = [
      { message: makeMsg({ kind: "thinking", id: "t1", content: "standalone" }), result: null, children: [] },
      { message: makeMsg({ kind: "agent_text", id: "msg1", content: "Hello" }), result: null, children: [] },
      { message: makeMsg({ kind: "thinking", id: "t2", content: "thinking before tool" }), result: null, children: [] },
      { message: makeMsg({ kind: "tool_call", id: "c1", toolName: "read_file", content: JSON.stringify({ path: "src/app.ts" }) }), result: null, children: [] },
      { message: makeMsg({ kind: "tool_result", id: "r1", content: "ok" }), result: null, children: [] },
    ];

    const blocksRunning = groupTimelineBlocks(items, true);
    expect(blocksRunning.length).toBe(3);
    expect(blocksRunning[0]!.kind).toBe("item");
    expect(blocksRunning[1]!.kind).toBe("item");
    expect(blocksRunning[2]!.kind).toBe("activity_group");
    if (blocksRunning[2]!.kind === "activity_group") {
      expect(blocksRunning[2]!.status).toBe("running");
      expect(blocksRunning[2]!.files).toEqual(["app.ts"]);
    }

    const blocksDone = groupTimelineBlocks(
      items.map((it, idx) => idx === 3 ? { ...it, result: makeMsg({ kind: "tool_result", content: "ok" }) } : it),
      true
    );
    if (blocksDone[2]!.kind === "activity_group") {
      expect(blocksDone[2]!.status).toBe("done");
    }

    const blocksError = groupTimelineBlocks(
      items.map((it, idx) => idx === 3 ? { ...it, result: makeMsg({ kind: "tool_result", content: "Error: failed" }) } : it),
      false
    );
    if (blocksError[2]!.kind === "activity_group") {
      expect(blocksError[2]!.status).toBe("error");
    }
  });
});

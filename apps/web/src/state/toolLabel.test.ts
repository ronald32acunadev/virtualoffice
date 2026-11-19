import { describe, expect, it } from "vitest";
import type { Message } from "../api/types";
import { buildTimeline } from "./timeline";
import { buildToolLabel, splitLabel } from "./toolLabel";

describe("buildToolLabel", () => {
  it("US-03 / AC-03: labels common tools", () => {
    expect(buildToolLabel("Bash", JSON.stringify({ command: "npm test" }))).toBe("Ran `npm test`");
    expect(buildToolLabel("Edit", JSON.stringify({ file_path: "src/app.ts" }))).toBe("Edited `src/app.ts`");
    expect(buildToolLabel("Read", JSON.stringify({ file_path: "a.md" }))).toBe("Read `a.md`");
    expect(buildToolLabel("Grep", JSON.stringify({ pattern: "foo" }))).toBe("Searched `foo`");
    expect(buildToolLabel("Write", JSON.stringify({ file_path: "b.ts" }))).toBe("Wrote `b.ts`");
  });

  it("US-03 / AC-03: falls back to a generic label", () => {
    expect(buildToolLabel("Mystery", "{}")).toBe("Used Mystery");
    expect(buildToolLabel("Bash", "not json")).toBe("Used Bash");
    expect(buildToolLabel("Bash", JSON.stringify({ command: "  " }))).toBe("Used Bash");
    expect(buildToolLabel(null, "{}")).toBe("Used tool");
  });

  it("US-03 / AC-03: shortens long details to one line", () => {
    const label = buildToolLabel("Bash", JSON.stringify({ command: `echo ${"x".repeat(200)}\nnext` }));
    expect(label.includes("\n")).toBe(false);
    expect(label.length).toBeLessThan(100);
    expect(label.endsWith("…`")).toBe(true);
  });

  it("US-03 / AC-03: splits a label into text and code parts", () => {
    expect(splitLabel("Ran `npm test`")).toEqual([
      { text: "Ran ", code: false },
      { text: "npm test", code: true },
    ]);
  });
});

const msg = (over: Partial<Message>): Message => ({
  id: "m",
  employeeId: "e1",
  kind: "agent_text",
  content: "",
  toolName: null,
  toolUseId: null,
  parentToolUseId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  sourceUuid: null,
  ...over,
});

describe("buildTimeline", () => {
  it("US-03 / AC-03: folds results into calls and nests subagent rows", () => {
    const timeline = buildTimeline([
      msg({ id: "1", kind: "tool_call", toolName: "Task", toolUseId: "t1", content: "{}" }),
      msg({ id: "2", kind: "tool_call", toolName: "Bash", toolUseId: "t2", parentToolUseId: "t1", content: "{}" }),
      msg({ id: "3", kind: "tool_result", toolUseId: "t2", parentToolUseId: "t1", content: "ok" }),
      msg({ id: "4", kind: "tool_result", toolUseId: "t1", content: "done" }),
      msg({ id: "5", kind: "tool_result", toolUseId: "orphan", content: "lost" }),
    ]);
    expect(timeline.map((item) => item.message.id)).toEqual(["1", "5"]);
    expect(timeline[0]?.result?.id).toBe("4");
    expect(timeline[0]?.children.map((c) => c.message.id)).toEqual(["2"]);
    expect(timeline[0]?.children[0]?.result?.id).toBe("3");
  });
});

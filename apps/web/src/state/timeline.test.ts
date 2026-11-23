import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline";
import type { Message } from "../api/types";

describe("US-02 timeline with thinking messages", () => {
  it("US-02 / AC-03: buildTimeline preserves thinking messages and nests under tool_call parents", () => {
    const messages: Message[] = [
      {
        id: "m1",
        employeeId: "e1",
        kind: "user_text",
        content: "Hello",
        toolName: null,
        toolUseId: null,
        parentToolUseId: null,
        createdAt: "",
        sourceUuid: null,
      },
      {
        id: "m2",
        employeeId: "e1",
        kind: "thinking",
        content: "Thinking before action...",
        toolName: null,
        toolUseId: null,
        parentToolUseId: null,
        createdAt: "",
        sourceUuid: null,
      },
      {
        id: "m3",
        employeeId: "e1",
        kind: "tool_call",
        content: "{}",
        toolName: "Subagent",
        toolUseId: "t1",
        parentToolUseId: null,
        createdAt: "",
        sourceUuid: null,
      },
      {
        id: "m4",
        employeeId: "e1",
        kind: "thinking",
        content: "Subagent thinking...",
        toolName: null,
        toolUseId: null,
        parentToolUseId: "t1",
        createdAt: "",
        sourceUuid: null,
      },
      {
        id: "m5",
        employeeId: "e1",
        kind: "agent_text",
        content: "Done",
        toolName: null,
        toolUseId: null,
        parentToolUseId: null,
        createdAt: "",
        sourceUuid: null,
      },
    ];

    const timeline = buildTimeline(messages);
    expect(timeline).toHaveLength(4);
    expect(timeline[0]!.message.kind).toBe("user_text");
    expect(timeline[1]!.message.kind).toBe("thinking");
    expect(timeline[1]!.message.content).toBe("Thinking before action...");
    expect(timeline[2]!.message.kind).toBe("tool_call");
    expect(timeline[2]!.children).toHaveLength(1);
    expect(timeline[2]!.children[0]!.message.kind).toBe("thinking");
    expect(timeline[2]!.children[0]!.message.content).toBe("Subagent thinking...");
    expect(timeline[3]!.message.kind).toBe("agent_text");
  });
});

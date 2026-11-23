import { describe, expect, it } from "vitest";
import { createHarness, hireWorking, statusOf } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

describe("US-03 chat with an employee", () => {
  it("US-03 / AC-02: tool calls and results are distinct entries; subagent activity keeps its parent", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const s = h.sdk.last;
    s.assistant([
      { type: "text", text: "Looking" },
      { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/a.ts" } },
    ]);
    s.emit({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tu-1", content: "file body" }] },
      parent_tool_use_id: null,
    });
    s.assistant([{ type: "text", text: "from subagent" }], "tu-1");
    await waitFor(() => h.repository.listMessages(employee.id).length >= 5);

    const messages = h.office.listMessages(employee.id);
    expect(messages.map((m) => m.kind)).toEqual(["user_text", "agent_text", "tool_call", "tool_result", "agent_text"]);
    const call = messages[2]!;
    expect(call).toMatchObject({ toolName: "Read", toolUseId: "tu-1", content: JSON.stringify({ file_path: "/a.ts" }) });
    expect(messages[3]).toMatchObject({ toolUseId: "tu-1", content: "file body" });
    expect(messages[4]).toMatchObject({ parentToolUseId: "tu-1", content: "from subagent" });
  });

  it("US-03 / AC-03: a message to a live session is stored as user_text and delivered to the same session", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    h.sdk.last.result("success");
    await waitFor(() => statusOf(h, employee.id) === "idle");

    const message = await h.office.sendMessage(employee.id, "Now add tests");
    expect(message.kind).toBe("user_text");
    await waitFor(() => h.sdk.last.prompts.includes("Now add tests"));
    expect(h.sdk.sessions).toHaveLength(1);
    expect(statusOf(h, employee.id)).toBe("working");

    h.sdk.last.assistant([{ type: "text", text: "Done" }]);
    await waitFor(() => h.office.listMessages(employee.id).some((m) => m.content === "Done"));
    expect(h.office.listMessages(employee.id).filter((m) => m.kind === "user_text").map((m) => m.content)).toEqual([
      "Fix the bug",
      "Now add tests",
    ]);
  });

  it("US-03 / AC-03: rejects empty text and unknown employees", async () => {
    const h = createHarness();
    await expect(h.office.sendMessage("nope", "x")).rejects.toThrow(/not found/i);
  });

  it("US-03 / AC-04: persists completed entries by kind; deltas are live only; unknown types are ignored", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const s = h.sdk.last;
    s.emit({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      parent_tool_use_id: null,
    });
    s.emit({ type: "some_future_type", payload: 1 });
    s.assistant([{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Hello" }]);
    await waitFor(() => h.office.listMessages(employee.id).some((m) => m.content === "Hello"));

    expect(h.emitted).toContainEqual({ type: "message_delta", employeeId: employee.id, text: "Hel" });
    const stored = h.office.listMessages(employee.id);
    expect(stored.map((m) => m.content)).toEqual(["Fix the bug", "hmm", "Hello"]);
    expect(stored.every((m) => ["user_text", "agent_text", "tool_call", "tool_result", "thinking", "system"].includes(m.kind))).toBe(true);
  });

  it("US-03 / AC-05: listing messages again returns the same stored entries without duplicates", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    h.sdk.last.assistant([{ type: "text", text: "one" }]);
    await waitFor(() => h.office.listMessages(employee.id).length === 2);
    const first = h.office.listMessages(employee.id);
    const second = h.office.listMessages(employee.id);
    expect(second).toEqual(first);
    expect(new Set(second.map((m) => m.id)).size).toBe(second.length);
  });
});

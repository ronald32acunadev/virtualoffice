import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOfficeLink,
  createWorkspaceLink,
  parseWindowMessage,
  type ChannelLike,
} from "./windowChannel";

type FakeChannel = ChannelLike & { sent: unknown[]; receive: (data: unknown) => void };

function fakeChannel(): FakeChannel {
  const channel: FakeChannel = {
    sent: [],
    onmessage: null,
    postMessage: (data) => {
      channel.sent.push(data);
    },
    close: () => {},
    receive: (data) => channel.onmessage?.({ data }),
  };
  return channel;
}

describe("windowChannel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("US-02 / AC-01: ignores malformed messages", () => {
    expect(parseWindowMessage(null)).toBeNull();
    expect(parseWindowMessage({ type: "focus_employee" })).toBeNull();
    expect(parseWindowMessage({ type: "other" })).toBeNull();
    expect(parseWindowMessage({ type: "focus_employee", employeeId: "e1" })).toEqual({
      type: "focus_employee",
      employeeId: "e1",
    });
    expect(parseWindowMessage({ type: "mood_changed", mood: "day" })).toEqual({
      type: "mood_changed",
      mood: "day",
    });
    expect(parseWindowMessage({ type: "mood_changed", mood: "evening" })).toEqual({
      type: "mood_changed",
      mood: "evening",
    });
    expect(parseWindowMessage({ type: "mood_changed", mood: "midnight" })).toBeNull();
    expect(parseWindowMessage({ type: "mood_changed" })).toBeNull();
    expect(parseWindowMessage({ type: "mood_changed", mood: 123 })).toBeNull();
  });

  it("US-02 / AC-01: workspace answers pings and selects on focus messages", () => {
    const channel = fakeChannel();
    const focused: string[] = [];
    createWorkspaceLink(channel, (id) => focused.push(id));
    channel.receive({ type: "workspace_ping" });
    channel.receive({ type: "focus_employee", employeeId: "e7" });
    channel.receive({ type: "garbage" });
    expect(channel.sent).toEqual([{ type: "workspace_pong" }]);
    expect(focused).toEqual(["e7"]);
  });

  it("US-02 / AC-01: office posts focus when a pong arrives in time", async () => {
    const channel = fakeChannel();
    const link = createOfficeLink(channel);
    const result = link.focusEmployee("e1");
    expect(channel.sent).toEqual([{ type: "workspace_ping" }]);
    channel.receive({ type: "workspace_pong" });
    await expect(result).resolves.toBe(true);
    expect(channel.sent).toEqual([{ type: "workspace_ping" }, { type: "focus_employee", employeeId: "e1" }]);
  });

  it("US-02 / AC-02: office reports no workspace when no pong arrives", async () => {
    const channel = fakeChannel();
    const link = createOfficeLink(channel, { timeoutMs: 300 });
    const result = link.focusEmployee("e1");
    await vi.advanceTimersByTimeAsync(299);
    channel.receive({ type: "workspace_pong" });
    await expect(result).resolves.toBe(true);

    const second = link.focusEmployee("e2");
    await vi.advanceTimersByTimeAsync(300);
    await expect(second).resolves.toBe(false);
    expect(channel.sent).not.toContainEqual({ type: "focus_employee", employeeId: "e2" });
  });
});

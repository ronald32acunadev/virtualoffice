import { describe, it, expect } from "vitest";
import { deriveLiveStatus, isNearBottom, NEAR_BOTTOM_THRESHOLD_PX } from "./chatErgonomics";
import type { TimelineItem } from "./timeline";

describe("chatErgonomics", () => {
  describe("deriveLiveStatus", () => {
    it("returns null for idle, stopped, failed, on_break, or undefined status", () => {
      expect(deriveLiveStatus({ status: "idle", timeline: [], liveText: "" })).toBeNull();
      expect(deriveLiveStatus({ status: "stopped", timeline: [], liveText: "" })).toBeNull();
      expect(deriveLiveStatus({ status: "failed", timeline: [], liveText: "" })).toBeNull();
      expect(deriveLiveStatus({ status: "on_break", timeline: [], liveText: "" })).toBeNull();
      expect(deriveLiveStatus({ status: undefined, timeline: [], liveText: "" })).toBeNull();
    });

    it("returns 'Thinking…' for working status with no pending tool or live text", () => {
      expect(deriveLiveStatus({ status: "working", timeline: [], liveText: "" })).toBe("Thinking…");
      expect(deriveLiveStatus({ status: "starting", timeline: [], liveText: "   " })).toBe("Thinking…");
    });

    it("returns 'Responding…' when liveText is non-empty and no tool is pending", () => {
      expect(deriveLiveStatus({ status: "working", timeline: [], liveText: "Hello world" })).toBe("Responding…");
    });

    it("returns 'Running <tool label>…' when a tool_call has result: null", () => {
      const timeline: TimelineItem[] = [
        {
          message: {
            id: "m1",
            employeeId: "emp1",
            kind: "tool_call",
            content: JSON.stringify({ file_path: "package.json" }),
            toolName: "Read",
            toolUseId: "u1",
            parentToolUseId: null,
            createdAt: "1000",
            sourceUuid: null,
          },
          result: null,
          children: [],
        },
      ];
      expect(deriveLiveStatus({ status: "working", timeline, liveText: "" })).toBe("Running Read `package.json`…");
    });
  });

  describe("isNearBottom", () => {
    it("returns true when distance to bottom <= threshold", () => {
      // scrollHeight = 1000, scrollTop = 850, clientHeight = 100 => bottom = 950, distance = 50 <= 80
      expect(isNearBottom({ scrollTop: 850, clientHeight: 100, scrollHeight: 1000 })).toBe(true);
      expect(isNearBottom({ scrollTop: 920, clientHeight: 100, scrollHeight: 1000 })).toBe(true);
    });

    it("returns false when scrolled up beyond threshold", () => {
      // scrollHeight = 1000, scrollTop = 700, clientHeight = 100 => bottom = 800, distance = 200 > 80
      expect(isNearBottom({ scrollTop: 700, clientHeight: 100, scrollHeight: 1000 })).toBe(false);
    });

    it("respects custom threshold", () => {
      expect(isNearBottom({ scrollTop: 700, clientHeight: 100, scrollHeight: 1000 }, 250)).toBe(true);
    });
  });
});

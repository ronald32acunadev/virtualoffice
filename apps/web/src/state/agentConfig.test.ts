import { describe, expect, it } from "vitest";
import {
  AGENT_MODE_OPTIONS,
  buildModelOptionsForBoss,
  formatEffortLabel,
  getAgentModeOption,
  getDefaultModeForBoss,
  getEffortsForBoss,
  getModesForBoss,
  resolveModelLabel,
} from "./agentConfig";

describe("US-03 / AC-04: agentConfig", () => {
  it("getAgentModeOption defaults to request_review and returns turbo for turbo", () => {
    expect(getAgentModeOption(null)).toEqual(AGENT_MODE_OPTIONS[0]);
    expect(getAgentModeOption(undefined)).toEqual(AGENT_MODE_OPTIONS[0]);
    expect(getAgentModeOption("request_review")).toEqual(AGENT_MODE_OPTIONS[0]);
    expect(getAgentModeOption("turbo")).toEqual(AGENT_MODE_OPTIONS[1]);
  });

  it("resolveModelLabel returns Default model, matching option label, or trimmed custom id", () => {
    const options = [
      { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
      { id: "gemini-4-neon-medium", label: "Gemini 4 Neon (Medium)" },
    ];
    expect(resolveModelLabel(null, options)).toBe("Default model");
    expect(resolveModelLabel("   ", options)).toBe("Default model");
    expect(resolveModelLabel("claude-opus-4-1", options)).toBe("Claude Opus 4.1");
    expect(resolveModelLabel("  my-custom-model  ", options)).toBe("my-custom-model");
  });

  it("buildModelOptionsForBoss appends custom currentModel only when absent", () => {
    const catalog = {
      claude: [{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }],
    };
    expect(buildModelOptionsForBoss("claude", catalog, "claude-sonnet-4-5")).toEqual([
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    ]);
    expect(buildModelOptionsForBoss("claude", catalog, "custom-claude")).toEqual([
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "custom-claude", label: "custom-claude" },
    ]);
    expect(buildModelOptionsForBoss("codex", catalog, null)).toEqual([]);
  });

  it("US-05 / AC-02: getModesForBoss returns native modes per provider and formatEffortLabel formats effort", () => {
    expect(getModesForBoss("claude").map((m) => m.id)).toEqual([
      "auto",
      "default",
      "acceptEdits",
      "plan",
      "bypassPermissions",
    ]);
    expect(getDefaultModeForBoss("claude")).toBe("auto");
    expect(getDefaultModeForBoss("gemini")).toBe("request_review");
    expect(getAgentModeOption(null, "claude").id).toBe("auto");
    expect(getAgentModeOption("acceptEdits", "claude").label).toBe("Accept edits");
    expect(getModesForBoss("codex").map((m) => m.id)).toEqual([
      "auto",
      "request_review",
      "acceptEdits",
      "plan",
      "turbo",
    ]);
    expect(getDefaultModeForBoss("codex")).toBe("auto");
    expect(getEffortsForBoss("claude").map((e) => e.id)).toEqual(["low", "medium", "high", "max"]);
    expect(getEffortsForBoss("codex").map((e) => e.id)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(getEffortsForBoss("gemini")).toEqual([]);
    expect(getModesForBoss("opencode").map((m) => m.id)).toEqual(["request_review", "auto"]);

    expect(formatEffortLabel(null)).toBe("Medium");
    expect(formatEffortLabel("low")).toBe("Low");
    expect(formatEffortLabel("high")).toBe("High");
    expect(formatEffortLabel("xhigh")).toBe("Extra High");
    expect(formatEffortLabel("max")).toBe("Max");
  });
});

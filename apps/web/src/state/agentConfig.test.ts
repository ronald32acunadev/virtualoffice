import { describe, expect, it } from "vitest";
import {
  AGENT_MODE_OPTIONS,
  buildModelOptionsForBoss,
  getAgentModeOption,
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
});

import { describe, expect, it } from "vitest";
import {
  CURATED_MODELS,
  discoverProviderModels,
  parseAgyModelsOutput,
  parseOpenCodeModelsOutput,
} from "../../src/office/domain/provider-models.ts";

describe("US-01 / AC-04: provider-models", () => {
  it("parseAgyModelsOutput skips header lines, trims, and deduplicates", () => {
    const output = [
      "Fetching available models...",
      "  gemini-4-neon-medium \t Gemini 4 Neon (Medium)  ",
      "gemini-4-neon-medium\tDuplicate",
      "claude-opus-5-5-high\tClaude Opus 5.5 (High)",
    ].join("\n");

    expect(parseAgyModelsOutput(output)).toEqual([
      { id: "gemini-4-neon-medium", label: "Gemini 4 Neon (Medium)" },
      { id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)" },
    ]);
  });

  it("parseOpenCodeModelsOutput parses one model id per line and skips blanks/spaces", () => {
    const output = "ollama/qwen3.8:27b-tuned-32k\n\nstatus line with spaces\nopencode/big-pickle\nopencode/big-pickle\n";
    expect(parseOpenCodeModelsOutput(output)).toEqual([
      { id: "ollama/qwen3.8:27b-tuned-32k", label: "ollama/qwen3.8:27b-tuned-32k" },
      { id: "opencode/big-pickle", label: "opencode/big-pickle" },
    ]);
  });

  it("discoverProviderModels uses discovered models and falls back safely to curated defaults", async () => {
    const discovered = await discoverProviderModels({
      hasAgy: true,
      hasOpenCode: true,
      runCommand: async (cmd) =>
        cmd === "agy" ? "gemini-4-neon-high\tGemini 4 Neon (High)\n" : "opencode/flint-40b-free\n",
    });
    expect(discovered.gemini).toEqual([{ id: "gemini-4-neon-high", label: "Gemini 4 Neon (High)" }]);
    expect(discovered.opencode).toEqual([{ id: "opencode/flint-40b-free", label: "opencode/flint-40b-free" }]);
    expect(discovered.claude).toEqual(CURATED_MODELS.claude);
    expect(discovered.codex).toEqual(CURATED_MODELS.codex);

    const fallback = await discoverProviderModels({
      hasAgy: true,
      hasOpenCode: true,
      runCommand: async () => {
        throw new Error("cli missing");
      },
    });
    expect(fallback).toEqual(CURATED_MODELS);
  });
});

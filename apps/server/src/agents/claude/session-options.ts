import type { Options } from "@anthropic-ai/claude-agent-sdk";

/** What a Claude session loads; the catalog probe must use the same so it sees what a real session sees. */
export const SETTING_SOURCES: NonNullable<Options["settingSources"]> = ["user", "project", "local"];
export const SYSTEM_PROMPT: NonNullable<Options["systemPrompt"]> = { type: "preset", preset: "claude_code" };

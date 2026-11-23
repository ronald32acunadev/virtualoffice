import type { AgentMessage } from "../../office/ports/agent-adapter.ts";

/** Loosely typed content block; the real SDK union is large and open. */
export type LooseBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
};

export type MappingContext = {
  parentToolUseId: string | null;
  /** Provider message uuid, kept on every produced message for dedupe. */
  sourceUuid: string | null;
};

export function asBlocks(content: unknown): LooseBlock[] {
  return Array.isArray(content) ? (content as LooseBlock[]) : [];
}

export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = (content as LooseBlock[])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string);
    if (texts.length > 0) return texts.join("\n");
  }
  return JSON.stringify(content ?? "");
}

/** Maps the `message.content` of an assistant message (live or from a stored session). */
export function mapAssistantContent(content: unknown, ctx: MappingContext): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const block of asBlocks(content)) {
    if (block.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      out.push({ kind: "agent_text", content: block.text, parentToolUseId: ctx.parentToolUseId, sourceUuid: ctx.sourceUuid });
    } else if (block.type === "thinking") {
      const text =
        typeof block.thinking === "string" && block.thinking.trim() !== ""
          ? block.thinking
          : typeof block.text === "string"
            ? block.text
            : "";
      if (text.trim() !== "") {
        out.push({
          kind: "thinking",
          content: text.trim(),
          parentToolUseId: ctx.parentToolUseId,
          sourceUuid: ctx.sourceUuid,
        });
      }
    } else if (block.type === "tool_use") {
      out.push({
        kind: "tool_call",
        content: JSON.stringify(block.input ?? {}),
        toolName: block.name ?? null,
        toolUseId: block.id ?? null,
        parentToolUseId: ctx.parentToolUseId,
        sourceUuid: ctx.sourceUuid,
      });
    }
  }
  return out;
}

/**
 * Maps the `message.content` of a user message. Tool results are always mapped. Plain user text is
 * mapped only when `includeUserText` is set (stored sessions): live user text is recorded by the
 * office itself when the owner sends it.
 */
export function mapUserContent(
  content: unknown,
  ctx: MappingContext,
  options: { includeUserText?: boolean } = {},
): AgentMessage[] {
  const out: AgentMessage[] = [];
  const texts: string[] = [];
  if (typeof content === "string") texts.push(content);
  for (const block of asBlocks(content)) {
    if (block.type === "tool_result") {
      out.push({
        kind: "tool_result",
        content: toolResultText(block.content),
        toolUseId: block.tool_use_id ?? null,
        parentToolUseId: ctx.parentToolUseId,
        sourceUuid: ctx.sourceUuid,
      });
    } else if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  const text = texts.join("\n");
  // A subagent's opening prompt is already visible as the parent tool call's input.
  if (options.includeUserText && ctx.parentToolUseId === null && text.trim() !== "") {
    out.unshift({ kind: "user_text", content: text, sourceUuid: ctx.sourceUuid });
  }
  return out;
}

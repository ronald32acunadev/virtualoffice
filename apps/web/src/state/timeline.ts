import type { Message } from "../api/types";
import { groupConversation } from "./conversation";

export type TimelineItem = {
  message: Message;
  /** The tool result paired with a tool call, when present. */
  result: Message | null;
  /** Subagent entries nested under a tool call. */
  children: TimelineItem[];
};

/** Builds the chat timeline: tool results are folded into their call, subagent rows nested. */
export function buildTimeline(messages: Message[]): TimelineItem[] {
  const callIds = new Set<string>();
  const resultByCall = new Map<string, Message>();
  for (const m of messages) {
    if (m.kind === "tool_call" && m.toolUseId) callIds.add(m.toolUseId);
  }
  for (const m of messages) {
    if (m.kind === "tool_result" && m.toolUseId && callIds.has(m.toolUseId)) {
      resultByCall.set(m.toolUseId, m);
    }
  }
  const isPairedResult = (m: Message) => m.kind === "tool_result" && resultByCall.get(m.toolUseId ?? "") === m;
  const toItem = (m: Message, children: Message[]): TimelineItem => ({
    message: m,
    result: m.kind === "tool_call" && m.toolUseId ? (resultByCall.get(m.toolUseId) ?? null) : null,
    children: children.filter((c) => !isPairedResult(c)).map((c) => toItem(c, [])),
  });
  return groupConversation(messages)
    .filter(({ message }) => !isPairedResult(message))
    .map(({ message, children }) => toItem(message, children));
}

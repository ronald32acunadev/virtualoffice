import type { Message } from "../api/types";

export type ConversationNode = { message: Message; children: Message[] };

/** Groups subagent entries (parentToolUseId) under their parent tool call. Order is preserved. */
export function groupConversation(messages: Message[]): ConversationNode[] {
  const callIds = new Set<string>();
  for (const m of messages) {
    if (m.kind === "tool_call" && m.toolUseId) callIds.add(m.toolUseId);
  }
  const childrenByParent = new Map<string, Message[]>();
  const roots: ConversationNode[] = [];
  for (const m of messages) {
    const parent = m.parentToolUseId;
    if (parent && callIds.has(parent)) {
      const list = childrenByParent.get(parent) ?? [];
      list.push(m);
      childrenByParent.set(parent, list);
    }
  }
  for (const m of messages) {
    if (m.parentToolUseId && callIds.has(m.parentToolUseId)) continue;
    const children = m.kind === "tool_call" && m.toolUseId ? childrenByParent.get(m.toolUseId) : undefined;
    roots.push({ message: m, children: children ?? [] });
  }
  return roots;
}

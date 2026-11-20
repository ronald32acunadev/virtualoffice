import type { SlashCommand } from "../api/types";

export type CommandKind = "skill" | "plugin" | "builtin";

export function commandKind(command: Pick<SlashCommand, "name" | "builtin">): CommandKind {
  if (command.builtin) return "builtin";
  return command.name.includes(":") ? "plugin" : "skill";
}

export const KIND_ICON: Record<CommandKind, string> = { skill: "⚡", plugin: "🔌", builtin: "⚙️" };
export const KIND_LABEL: Record<CommandKind, string> = { skill: "Skill", plugin: "Plugin command", builtin: "Built-in" };

/** End index of the first word (first whitespace, or the end of the text). */
function firstWordEnd(text: string): number {
  const match = /\s/.exec(text);
  return match ? match.index : text.length;
}

/** The slash query when the text starts with "/" and the caret sits inside the first word; otherwise null. */
export function slashQuery(text: string, caret: number): string | null {
  if (!text.startsWith("/")) return null;
  const end = firstWordEnd(text);
  if (caret < 1 || caret > end) return null;
  return text.slice(1, end);
}

export type CommandMatch = {
  command: SlashCommand;
  /** Which text matched: the command name or one of its aliases. */
  field: "name" | "alias";
  alias?: string;
  start: number;
  length: number;
  rank: 0 | 1;
};

function findMatch(candidate: string, query: string): { start: number; rank: 0 | 1 } | null {
  const index = candidate.toLowerCase().indexOf(query);
  if (index < 0) return null;
  return { start: index, rank: index === 0 ? 0 : 1 };
}

function matchCommand(command: SlashCommand, query: string): CommandMatch | null {
  if (query === "") return { command, field: "name", start: 0, length: 0, rank: 0 };
  const byName = findMatch(command.name, query);
  let best: CommandMatch | null = byName
    ? { command, field: "name", start: byName.start, length: query.length, rank: byName.rank }
    : null;
  if (best?.rank === 0) return best;
  for (const alias of command.aliases ?? []) {
    const m = findMatch(alias, query);
    if (!m) continue;
    if (!best || m.rank < best.rank) {
      best = { command, field: "alias", alias, start: m.start, length: query.length, rank: m.rank };
      if (m.rank === 0) break;
    }
  }
  return best;
}

/**
 * Filters by name and aliases, case-insensitive. Non-built-in commands come first, then built-in;
 * inside each group prefix matches come before substring matches (server order is kept otherwise).
 */
export function filterCommands(commands: SlashCommand[], rawQuery: string): CommandMatch[] {
  const query = rawQuery.trim().toLowerCase();
  const matches: CommandMatch[] = [];
  for (const command of commands) {
    const match = matchCommand(command, query);
    if (match) matches.push(match);
  }
  const group = (m: CommandMatch) => (m.command.builtin ? 1 : 0);
  return matches
    .map((m, index) => ({ m, index }))
    .sort((a, b) => group(a.m) - group(b.m) || a.m.rank - b.m.rank || a.index - b.index)
    .map(({ m }) => m);
}

export type Segment = { text: string; match: boolean };

/** Splits text so the matched range can be highlighted. */
export function highlightSegments(text: string, start: number, length: number): Segment[] {
  if (length <= 0 || start < 0 || start >= text.length) return [{ text, match: false }];
  const end = Math.min(text.length, start + length);
  const segments: Segment[] = [];
  if (start > 0) segments.push({ text: text.slice(0, start), match: false });
  segments.push({ text: text.slice(start, end), match: true });
  if (end < text.length) segments.push({ text: text.slice(end), match: false });
  return segments;
}

export type Insertion = { text: string; caret: number };

/** Replaces the first word (the slash query) with `/name ` and keeps the rest of the text. */
export function insertCommand(text: string, name: string): Insertion {
  const head = `/${name} `;
  const rest = text.startsWith("/") ? text.slice(firstWordEnd(text)).replace(/^[ \t]+/, "") : text;
  return { text: head + rest, caret: head.length };
}

/** Toolbox insertion: `/name ` at the start of the box; an existing leading slash word is replaced. */
export function insertSkillAtStart(text: string, name: string): Insertion {
  return insertCommand(text, name);
}

export type MenuKey = { key: string; shiftKey?: boolean; isComposing?: boolean };
export type MenuKeyAction = "next" | "prev" | "select" | "close" | "none";

/**
 * Key decision while the menu is open. With no selectable items Enter and Tab fall through
 * (Enter still sends); with the menu closed everything falls through.
 */
export function menuKeyAction(event: MenuKey, state: { open: boolean; itemCount: number }): MenuKeyAction {
  if (!state.open || event.isComposing) return "none";
  switch (event.key) {
    case "Escape":
      return "close";
    case "ArrowDown":
      return state.itemCount > 0 ? "next" : "none";
    case "ArrowUp":
      return state.itemCount > 0 ? "prev" : "none";
    case "Enter":
      return event.shiftKey || state.itemCount === 0 ? "none" : "select";
    case "Tab":
      return event.shiftKey || state.itemCount === 0 ? "none" : "select";
    default:
      return "none";
  }
}

/** Wrapping move of the highlighted index. */
export function moveIndex(index: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return 0;
  return (index + delta + count) % count;
}

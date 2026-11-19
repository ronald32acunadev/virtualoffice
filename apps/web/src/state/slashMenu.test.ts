import { describe, expect, it } from "vitest";
import type { SlashCommand } from "../api/types";
import {
  commandKind,
  filterCommands,
  highlightSegments,
  insertCommand,
  insertSkillAtStart,
  menuKeyAction,
  moveIndex,
  slashQuery,
} from "./slashMenu";

const cmd = (name: string, extra: Partial<SlashCommand> = {}): SlashCommand => ({
  name,
  description: `${name} description`,
  argumentHint: "",
  ...extra,
});

const COMMANDS = [
  cmd("compact", { builtin: true }),
  cmd("judgment-day"),
  cmd("chained-pr", { aliases: ["stack"] }),
  cmd("superpowers:brainstorming"),
  cmd("review", { builtin: true, aliases: ["rv"] }),
  cmd("pr-review"),
];

describe("US-02 / AC-01 menu opens in the first word", () => {
  it("opens for a leading slash with the caret in the first word", () => {
    expect(slashQuery("/", 1)).toBe("");
    expect(slashQuery("/jud", 4)).toBe("jud");
    expect(slashQuery("/jud args", 2)).toBe("jud");
  });
  it("stays closed when the text does not start with a slash or the caret leaves the first word", () => {
    expect(slashQuery("hello /jud", 10)).toBeNull();
    expect(slashQuery("/jud args", 9)).toBeNull();
    expect(slashQuery("/jud args", 5)).toBeNull();
    expect(slashQuery("/jud", 0)).toBeNull();
    expect(slashQuery("", 0)).toBeNull();
  });
  it("lists non-built-in commands before built-in ones", () => {
    const names = filterCommands(COMMANDS, "").map((m) => m.command.name);
    expect(names).toEqual(["judgment-day", "chained-pr", "superpowers:brainstorming", "pr-review", "compact", "review"]);
  });
  it("classifies command kinds for icons", () => {
    expect(commandKind(cmd("x"))).toBe("skill");
    expect(commandKind(cmd("superpowers:x"))).toBe("plugin");
    expect(commandKind(cmd("compact", { builtin: true }))).toBe("builtin");
  });
});

describe("US-02 / AC-02 filtering", () => {
  it("puts prefix matches before substring matches inside each group", () => {
    const names = filterCommands(COMMANDS, "re").map((m) => m.command.name);
    expect(names).toEqual(["pr-review", "review"]);
    const prefixFirst = filterCommands([cmd("pr-review"), cmd("review-risk")], "re").map((m) => m.command.name);
    expect(prefixFirst).toEqual(["review-risk", "pr-review"]);
  });
  it("keeps built-in last even when it is a better match", () => {
    const names = filterCommands(COMMANDS, "rev").map((m) => m.command.name);
    expect(names).toEqual(["pr-review", "review"]);
  });
  it("matches aliases and reports the alias", () => {
    const [match] = filterCommands(COMMANDS, "sta");
    expect(match?.command.name).toBe("chained-pr");
    expect(match?.field).toBe("alias");
    expect(match?.alias).toBe("stack");
    expect(match?.start).toBe(0);
  });
  it("is case-insensitive and returns nothing when there is no match", () => {
    expect(filterCommands(COMMANDS, "JUDG")).toHaveLength(1);
    expect(filterCommands(COMMANDS, "zzz")).toEqual([]);
  });
  it("gives the matched range for highlighting", () => {
    const [match] = filterCommands([cmd("pr-review")], "rev");
    expect(highlightSegments("pr-review", match!.start, match!.length)).toEqual([
      { text: "pr-", match: false },
      { text: "rev", match: true },
      { text: "iew", match: false },
    ]);
    expect(highlightSegments("abc", 0, 0)).toEqual([{ text: "abc", match: false }]);
  });
});

describe("US-02 / AC-03 keyboard and insertion", () => {
  it("Enter and Tab select, Escape closes, arrows move", () => {
    const open = { open: true, itemCount: 3 };
    expect(menuKeyAction({ key: "Enter" }, open)).toBe("select");
    expect(menuKeyAction({ key: "Tab" }, open)).toBe("select");
    expect(menuKeyAction({ key: "Escape" }, open)).toBe("close");
    expect(menuKeyAction({ key: "ArrowDown" }, open)).toBe("next");
    expect(menuKeyAction({ key: "ArrowUp" }, open)).toBe("prev");
  });
  it("Enter with the menu closed is left to the composer so it still sends", () => {
    expect(menuKeyAction({ key: "Enter" }, { open: false, itemCount: 3 })).toBe("none");
  });
  it("Enter falls through when nothing is selectable (loading, unavailable, no match)", () => {
    expect(menuKeyAction({ key: "Enter" }, { open: true, itemCount: 0 })).toBe("none");
    expect(menuKeyAction({ key: "Escape" }, { open: true, itemCount: 0 })).toBe("close");
  });
  it("ignores IME composition and Shift+Enter", () => {
    expect(menuKeyAction({ key: "Enter", isComposing: true }, { open: true, itemCount: 2 })).toBe("none");
    expect(menuKeyAction({ key: "Enter", shiftKey: true }, { open: true, itemCount: 2 })).toBe("none");
  });
  it("wraps the highlighted index", () => {
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(0, 1, 0)).toBe(0);
  });
  it("replaces the first word with /name and a space, keeping the rest", () => {
    expect(insertCommand("/jud", "judgment-day")).toEqual({ text: "/judgment-day ", caret: 14 });
    expect(insertCommand("/jud some args", "judgment-day")).toEqual({ text: "/judgment-day some args", caret: 14 });
  });
});

describe("US-04 / AC-02 toolbox insertion", () => {
  it("inserts /name at the start of an empty box", () => {
    expect(insertSkillAtStart("", "chained-pr")).toEqual({ text: "/chained-pr ", caret: 12 });
  });
  it("prepends to existing text and replaces an existing leading command", () => {
    expect(insertSkillAtStart("fix the bug", "chained-pr").text).toBe("/chained-pr fix the bug");
    expect(insertSkillAtStart("/old args", "chained-pr").text).toBe("/chained-pr args");
  });
});

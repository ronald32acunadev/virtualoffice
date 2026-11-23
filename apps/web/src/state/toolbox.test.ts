import { describe, expect, it } from "vitest";
import type { SlashCommand, AgentInfo } from "../api/types";
import {
  extractPluginNamespace,
  organizeToolboxCommands,
  organizeToolboxAgents,
} from "./toolbox";

const cmd = (name: string, extra: Partial<SlashCommand> = {}): SlashCommand => ({
  name,
  description: `${name} description`,
  argumentHint: "",
  ...extra,
});

const agent = (name: string, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  name,
  description: `${name} agent`,
  builtin: false,
  ...extra,
});

describe("toolbox organization and filtering", () => {
  it("extractPluginNamespace handles various command names", () => {
    expect(extractPluginNamespace("superpowers:brainstorming")).toBe("superpowers");
    expect(extractPluginNamespace("help")).toBeNull();
    expect(extractPluginNamespace(":leading")).toBeNull();
    expect(extractPluginNamespace("trailing:")).toBeNull();
    expect(extractPluginNamespace("a:b:c")).toBe("a");
  });

  it("organizeToolboxCommands splits Skills, Plugins, and Built-in sorted A–Z", () => {
    const commands: SlashCommand[] = [
      cmd("zebra"),
      cmd("apple"),
      cmd("git:commit", { description: "Commit changes" }),
      cmd("git:add", { description: "Add files" }),
      cmd("help", { builtin: true }),
      cmd("about", { builtin: true }),
      cmd("docker:build"),
    ];

    const result = organizeToolboxCommands(commands);
    expect(result.skills.map((c) => c.name)).toEqual(["apple", "zebra"]);
    expect(result.builtins.map((c) => c.name)).toEqual(["about", "help"]);
    expect(result.plugins).toEqual([
      {
        plugin: "docker",
        commands: [cmd("docker:build")],
      },
      {
        plugin: "git",
        commands: [
          cmd("git:add", { description: "Add files" }),
          cmd("git:commit", { description: "Commit changes" }),
        ],
      },
    ]);
    expect(result.totalCount).toBe(7);
  });

  it("organizeToolboxCommands filters case-insensitively across name, description, argumentHint, aliases", () => {
    const commands: SlashCommand[] = [
      cmd("commit", { description: "Save snapshot" }),
      cmd("status", { argumentHint: "[path]" }),
      cmd("diff", { aliases: ["compare"] }),
    ];

    expect(organizeToolboxCommands(commands, "SNAPSHOT").totalCount).toBe(1);
    expect(organizeToolboxCommands(commands, "[path]").totalCount).toBe(1);
    expect(organizeToolboxCommands(commands, "compare").totalCount).toBe(1);
    expect(organizeToolboxCommands(commands, "nonexistent").totalCount).toBe(0);
  });

  it("organizeToolboxAgents separates Custom vs Built-in agents sorted A–Z and filters", () => {
    const agents: AgentInfo[] = [
      agent("Zeta Agent", { model: "gpt-4" }),
      agent("Alpha Agent", { model: "claude-3" }),
      agent("Builtin Assistant", { builtin: true, description: "Helper bot" }),
    ];

    const organized = organizeToolboxAgents(agents);
    expect(organized.custom.map((a) => a.name)).toEqual(["Alpha Agent", "Zeta Agent"]);
    expect(organized.builtins.map((a) => a.name)).toEqual(["Builtin Assistant"]);
    expect(organized.totalCount).toBe(3);

    const filtered = organizeToolboxAgents(agents, "claude-3");
    expect(filtered.custom.map((a) => a.name)).toEqual(["Alpha Agent"]);
    expect(filtered.totalCount).toBe(1);
  });
});

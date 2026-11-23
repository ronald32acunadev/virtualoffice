import { describe, expect, it } from "vitest";
import type { SlashCommand, AgentInfo, Message } from "../api/types";
import {
  extractPluginNamespace,
  organizeToolboxCommands,
  organizeToolboxAgents,
  defaultToolboxTab,
  buildAgentDelegationPrompt,
  countConversationAttachments,
  formatTokenCount,
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

describe("US-03 toolbox helpers", () => {
  it("defaultToolboxTab returns skills for Claude or non-zero skills, and workspace otherwise", () => {
    expect(defaultToolboxTab("claude", 0)).toBe("skills");
    expect(defaultToolboxTab("codex", 5)).toBe("skills");
    expect(defaultToolboxTab("codex", 0)).toBe("workspace");
    expect(defaultToolboxTab("gemini", 0)).toBe("workspace");
  });

  it("buildAgentDelegationPrompt formats agent delegation prompt correctly", () => {
    expect(buildAgentDelegationPrompt("Explore")).toBe("Ask Explore to ");
    expect(buildAgentDelegationPrompt("  Coder  ")).toBe("Ask Coder to ");
  });

  it("countConversationAttachments sums attachments and handles undefined/empty", () => {
    expect(countConversationAttachments(undefined)).toBe(0);
    expect(countConversationAttachments([])).toBe(0);
    const msgs: Message[] = [
      { id: "1", employeeId: "e1", kind: "user_text", content: "hi", toolName: null, toolUseId: null, parentToolUseId: null, createdAt: "", sourceUuid: null, attachments: [{ id: "a1", name: "f1", mimeType: "text/plain", size: 10, url: "blob:/" }] },
      { id: "2", employeeId: "e1", kind: "agent_text", content: "hello", toolName: null, toolUseId: null, parentToolUseId: null, createdAt: "", sourceUuid: null },
      { id: "3", employeeId: "e1", kind: "user_text", content: "bye", toolName: null, toolUseId: null, parentToolUseId: null, createdAt: "", sourceUuid: null, attachments: [{ id: "a2", name: "f2", mimeType: "text/plain", size: 20, url: "blob:/" }, { id: "a3", name: "f3", mimeType: "text/plain", size: 30, url: "blob:/" }] },
    ];
    expect(countConversationAttachments(msgs)).toBe(3);
  });

  it("formatTokenCount formats raw counts, k, and M correctly", () => {
    expect(formatTokenCount(500)).toBe("500");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1500)).toBe("1.5k");
    expect(formatTokenCount(123456)).toBe("123.5k");
    expect(formatTokenCount(1500000)).toBe("1.50M");
  });
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

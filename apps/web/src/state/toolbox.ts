import type { SlashCommand, AgentInfo, BossId, Message } from "../api/types";

export type ToolboxTab = "skills" | "agents" | "workspace";

export function defaultToolboxTab(bossId: BossId, skillCount: number): ToolboxTab {
  return bossId === "claude" || skillCount > 0 ? "skills" : "workspace";
}

export function buildAgentDelegationPrompt(agentName: string): string {
  return `Ask ${agentName.trim()} to `;
}

export function countConversationAttachments(messages: readonly Message[] | undefined): number {
  if (!messages) return 0;
  let total = 0;
  for (const m of messages) {
    total += m.attachments?.length ?? 0;
  }
  return total;
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export type PluginCommandGroup = {
  plugin: string;
  commands: SlashCommand[];
};

export type OrganizedToolboxCommands = {
  skills: SlashCommand[];
  plugins: PluginCommandGroup[];
  builtins: SlashCommand[];
  totalCount: number;
};

export type OrganizedToolboxAgents = {
  custom: AgentInfo[];
  builtins: AgentInfo[];
  totalCount: number;
};

export function extractPluginNamespace(name: string): string | null {
  const index = name.indexOf(":");
  if (index > 0 && index < name.length - 1) {
    return name.slice(0, index);
  }
  return null;
}

const alphaCompare = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function organizeToolboxCommands(
  commands: readonly SlashCommand[],
  rawQuery = ""
): OrganizedToolboxCommands {
  const query = rawQuery.trim().toLowerCase();

  const filtered = query === ""
    ? [...commands]
    : commands.filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(query);
        const descMatch = c.description.toLowerCase().includes(query);
        const hintMatch = c.argumentHint?.toLowerCase().includes(query) ?? false;
        const aliasMatch = c.aliases?.some((a) => a.toLowerCase().includes(query)) ?? false;
        return nameMatch || descMatch || hintMatch || aliasMatch;
      });

  const builtinList: SlashCommand[] = [];
  const pluginMap = new Map<string, SlashCommand[]>();
  const skillList: SlashCommand[] = [];

  for (const c of filtered) {
    if (c.builtin) {
      builtinList.push(c);
    } else {
      const ns = extractPluginNamespace(c.name);
      if (ns !== null) {
        let group = pluginMap.get(ns);
        if (!group) {
          group = [];
          pluginMap.set(ns, group);
        }
        group.push(c);
      } else {
        skillList.push(c);
      }
    }
  }

  builtinList.sort(alphaCompare);
  skillList.sort(alphaCompare);

  const plugins: PluginCommandGroup[] = Array.from(pluginMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([plugin, cmds]) => {
      cmds.sort(alphaCompare);
      return { plugin, commands: cmds };
    });

  const pluginTotal = plugins.reduce((sum, g) => sum + g.commands.length, 0);
  const totalCount = skillList.length + pluginTotal + builtinList.length;

  return {
    skills: skillList,
    plugins,
    builtins: builtinList,
    totalCount,
  };
}

export function organizeToolboxAgents(
  agents: readonly AgentInfo[],
  rawQuery = ""
): OrganizedToolboxAgents {
  const query = rawQuery.trim().toLowerCase();

  const filtered = query === ""
    ? [...agents]
    : agents.filter((a) => {
        const nameMatch = a.name.toLowerCase().includes(query);
        const descMatch = a.description.toLowerCase().includes(query);
        const modelMatch = a.model?.toLowerCase().includes(query) ?? false;
        return nameMatch || descMatch || modelMatch;
      });

  const customList: AgentInfo[] = [];
  const builtinList: AgentInfo[] = [];

  for (const a of filtered) {
    if (a.builtin) {
      builtinList.push(a);
    } else {
      customList.push(a);
    }
  }

  customList.sort(alphaCompare);
  builtinList.sort(alphaCompare);

  return {
    custom: customList,
    builtins: builtinList,
    totalCount: customList.length + builtinList.length,
  };
}

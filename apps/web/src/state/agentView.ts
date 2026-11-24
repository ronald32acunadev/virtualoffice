import type { Agent, AgentActivity, Boss, Employee, EmployeeStatus } from "../api/types";

const STATUS_PRIORITY: readonly EmployeeStatus[] = [
  "waiting_approval",
  "working",
  "starting",
  "failed",
  "on_break",
  "idle",
  "stopped",
];

/** Derives a single 3D status for a team agent from all chats assigned to it. */
export function aggregateAgentStatus(chats: readonly Employee[], boss?: Pick<Boss, "onBreak">): EmployeeStatus {
  if (chats.length === 0) {
    return boss?.onBreak ? "on_break" : "idle";
  }
  for (const status of STATUS_PRIORITY) {
    if (chats.some((c) => c.status === status)) return status;
  }
  return "idle";
}

/** Picks the most visually relevant live tool activity among an agent's active chats. */
export function aggregateAgentActivity(chats: readonly Employee[]): AgentActivity | null {
  const candidates = chats
    .filter((c) => (c.status === "working" || c.status === "starting") && c.activity)
    .map((c) => c.activity!);
  if (candidates.length === 0) return null;
  const mcp = candidates
    .filter((a) => a.category === "mcp_request")
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
  if (mcp) return mcp;
  return [...candidates].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null;
}

/** Character nameplate label: "Name · jobTitle · role" including only non-empty parts. */
export function agentDisplayLabel(agent: Pick<Agent, "name" | "jobTitle" | "role">): string {
  return [agent.name, agent.jobTitle, agent.role]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" · ");
}

/** Finds the team agent owning a chat, or null if unassigned. */
export function resolveChatAgent(chat: Pick<Employee, "agentId">, agents: readonly Agent[]): Agent | null {
  if (!chat.agentId) return null;
  return agents.find((a) => a.id === chat.agentId) ?? null;
}

export type AgentChatGroup = {
  agent: Agent | null;
  groupKey: string;
  employees: Employee[];
};

/** Groups chats by their team agent, keeping 0-chat agents visible when not filtered out by search. */
export function groupEmployeesByAgent(
  employees: readonly Employee[],
  agents: readonly Agent[],
  searchQuery = "",
): AgentChatGroup[] {
  const needle = searchQuery.trim().toLowerCase();
  const byAgent = new Map<string, Employee[]>();
  const unassigned: Employee[] = [];
  const knownAgentIds = new Set(agents.map((a) => a.id));

  for (const emp of employees) {
    if (emp.agentId && knownAgentIds.has(emp.agentId)) {
      const list = byAgent.get(emp.agentId) ?? [];
      list.push(emp);
      byAgent.set(emp.agentId, list);
    } else {
      unassigned.push(emp);
    }
  }

  const newestFirst = (a: Employee, b: Employee) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;

  const groups: AgentChatGroup[] = [];
  for (const agent of agents) {
    const chats = [...(byAgent.get(agent.id) ?? [])].sort(newestFirst);
    if (needle) {
      const agentHaystack = [agent.name, agent.jobTitle ?? "", agent.role ?? "", agent.bossId]
        .join("\n")
        .toLowerCase();
      if (chats.length === 0 && !agentHaystack.includes(needle)) continue;
    }
    groups.push({ agent, groupKey: agent.id, employees: chats });
  }

  if (unassigned.length > 0) {
    groups.push({
      agent: null,
      groupKey: "__unassigned__",
      employees: [...unassigned].sort(newestFirst),
    });
  }

  return groups;
}

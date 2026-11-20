import type { AgentInfo, Catalog, ProviderCatalog } from "./types.ts";

/** Agents the SDK always lists; it reports no source, so the office fixes the names. */
export const BUILTIN_AGENT_NAMES: readonly string[] = [
  "claude",
  "claude-code-guide",
  "Explore",
  "general-purpose",
  "Plan",
  "statusline-setup",
  "web-fetch",
];

/** Orders a provider's lists for display: non-built-in commands first, owner's agents first (stable otherwise). */
export function buildCatalog(raw: ProviderCatalog): Catalog {
  const commands = [...raw.commands.filter((c) => !c.builtin), ...raw.commands.filter((c) => c.builtin)];
  const agents: AgentInfo[] = raw.agents.map((a) => ({ ...a, builtin: BUILTIN_AGENT_NAMES.includes(a.name) }));
  return { commands, agents: [...agents.filter((a) => !a.builtin), ...agents.filter((a) => a.builtin)] };
}

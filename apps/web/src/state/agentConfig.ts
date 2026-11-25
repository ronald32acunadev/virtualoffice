import type { AgentEffort, AgentMode, BossId, ProviderModelOption } from "../api/types";

export type AgentModeOption = {
  id: AgentMode;
  label: string;
  shortLabel: string;
  description: string;
  isDefault?: boolean;
  dangerous?: boolean;
  shortcut?: string;
};

export const AGENT_EFFORT_OPTIONS: readonly { id: AgentEffort; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High" },
  { id: "max", label: "Max" },
] as const;

export function getEffortsForBoss(bossId: BossId): readonly { id: AgentEffort; label: string }[] {
  if (bossId === "claude") {
    return AGENT_EFFORT_OPTIONS.filter((opt) => opt.id !== "xhigh");
  }
  if (bossId === "codex") {
    return AGENT_EFFORT_OPTIONS;
  }
  return [];
}

export const PROVIDER_MODE_OPTIONS: Record<BossId, readonly AgentModeOption[]> = {
  claude: [
    {
      id: "auto",
      label: "Auto",
      shortLabel: "Auto",
      description: "Claude handles permission decisions",
      isDefault: true,
      shortcut: "1",
    },
    {
      id: "default",
      label: "Manual",
      shortLabel: "Manual",
      description: "Always ask before making changes",
      shortcut: "2",
    },
    {
      id: "acceptEdits",
      label: "Accept edits",
      shortLabel: "Accept edits",
      description: "Automatically accept all file edits",
      shortcut: "3",
    },
    {
      id: "plan",
      label: "Plan",
      shortLabel: "Plan",
      description: "Create a plan before making changes",
      shortcut: "4",
    },
    {
      id: "bypassPermissions",
      label: "Bypass permissions",
      shortLabel: "Bypass",
      description: "Skip all permission prompts",
      dangerous: true,
    },
  ],
  gemini: [
    {
      id: "request_review",
      label: "Request Review",
      shortLabel: "Request Review",
      description: "Every command requires approval.",
      isDefault: true,
      shortcut: "1",
    },
    {
      id: "turbo",
      label: "Turbo",
      shortLabel: "Turbo",
      description: "Run all commands without restrictions.",
      dangerous: true,
      shortcut: "2",
    },
    {
      id: "acceptEdits",
      label: "Accept edits",
      shortLabel: "Accept edits",
      description: "Automatically accept file edits.",
      shortcut: "3",
    },
    {
      id: "auto",
      label: "Auto",
      shortLabel: "Auto",
      description: "Let the agent decide approvals automatically.",
      shortcut: "4",
    },
    {
      id: "plan",
      label: "Plan",
      shortLabel: "Plan",
      description: "Create a plan before making changes.",
      shortcut: "5",
    },
  ],
  codex: [
    {
      id: "auto",
      label: "Auto",
      shortLabel: "Auto",
      description: "Automatic approval review in workspace-write sandbox",
      isDefault: true,
      shortcut: "1",
    },
    {
      id: "request_review",
      label: "Manual",
      shortLabel: "Manual",
      description: "Ask before running commands",
      shortcut: "2",
    },
    {
      id: "acceptEdits",
      label: "Workspace write",
      shortLabel: "Workspace write",
      description: "Allow edits inside the workspace",
      shortcut: "3",
    },
    {
      id: "plan",
      label: "Read-only",
      shortLabel: "Read-only",
      description: "Inspect files without making edits",
      shortcut: "4",
    },
    {
      id: "turbo",
      label: "Full access",
      shortLabel: "Full access",
      description: "Bypass approvals and sandbox restrictions",
      dangerous: true,
    },
  ],
  opencode: [
    {
      id: "request_review",
      label: "Manual",
      shortLabel: "Manual",
      description: "Ask before running commands.",
      isDefault: true,
      shortcut: "1",
    },
    {
      id: "auto",
      label: "Auto",
      shortLabel: "Auto",
      description: "Run actions automatically.",
      shortcut: "2",
    },
  ],
};

export const AGENT_MODE_OPTIONS = PROVIDER_MODE_OPTIONS.gemini;

export function getModesForBoss(bossId: BossId): readonly AgentModeOption[] {
  return PROVIDER_MODE_OPTIONS[bossId] ?? PROVIDER_MODE_OPTIONS.gemini;
}

export function getDefaultModeForBoss(bossId: BossId): AgentMode {
  const modes = getModesForBoss(bossId);
  const defaultOption = modes.find((option) => option.isDefault === true);
  return defaultOption?.id ?? modes[0]?.id ?? "request_review";
}

export function getAgentModeOption(
  mode: AgentMode | null | undefined,
  bossId: BossId = "gemini",
): AgentModeOption {
  const modes = getModesForBoss(bossId);
  if (mode) {
    const match = modes.find((option) => option.id === mode);
    if (match) return match;
  }
  const defaultOption = modes.find((option) => option.isDefault === true);
  return defaultOption ?? modes[0]!;
}

export function formatEffortLabel(effort: AgentEffort | null | undefined): string {
  if (!effort) return "Medium";
  const option = AGENT_EFFORT_OPTIONS.find((item) => item.id === effort);
  return option?.label ?? "Medium";
}

export function resolveModelLabel(
  modelId: string | null | undefined,
  options: readonly ProviderModelOption[],
): string {
  if (!modelId || modelId.trim() === "") {
    return "Default model";
  }
  const trimmed = modelId.trim();
  const found = options.find((opt) => opt.id === trimmed);
  if (found) {
    return found.label;
  }
  return trimmed;
}

export function buildModelOptionsForBoss(
  bossId: BossId,
  catalog: Partial<Record<BossId, ProviderModelOption[]>>,
  currentModel?: string | null,
): ProviderModelOption[] {
  const base = catalog[bossId] ?? [];
  const result: ProviderModelOption[] = [...base];
  if (currentModel && currentModel.trim() !== "") {
    const trimmed = currentModel.trim();
    const exists = result.some((opt) => opt.id === trimmed);
    if (!exists) {
      result.push({ id: trimmed, label: trimmed });
    }
  }
  return result;
}

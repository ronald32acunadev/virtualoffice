import type { AgentMode, BossId, ProviderModelOption } from "../api/types";

export type AgentModeOption = {
  id: AgentMode;
  label: string;
  description: string;
  shortLabel: string;
};

export const AGENT_MODE_OPTIONS: readonly AgentModeOption[] = [
  {
    id: "request_review",
    label: "Request Review",
    shortLabel: "Review",
    description: "Every command requires approval.",
  },
  {
    id: "turbo",
    label: "Turbo",
    shortLabel: "Turbo",
    description: "Run all commands without restrictions.",
  },
];

export function getAgentModeOption(mode: AgentMode | null | undefined): AgentModeOption {
  if (mode === "turbo") {
    return AGENT_MODE_OPTIONS[1]!;
  }
  return AGENT_MODE_OPTIONS[0]!;
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

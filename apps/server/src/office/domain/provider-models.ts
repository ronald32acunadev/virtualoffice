import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BossId, ProviderModelOption } from "./types.ts";

const execFileAsync = promisify(execFile);

export const CURATED_MODELS: Record<BossId, readonly ProviderModelOption[]> = {
  claude: [
    { id: "opus", label: "Opus 5.5" },
    { id: "sonnet", label: "Sonnet 5.5" },
    { id: "haiku", label: "Haiku 5.5" },
  ],
  codex: [
    { id: "gpt-6.2-sol", label: "GPT-6.2-Sol" },
    { id: "gpt-6.2-astra", label: "GPT-6.2-Astra" },
    { id: "gpt-6.1-sol", label: "GPT-6.1-Sol" },
  ],
  opencode: [
    { id: "opencode/big-pickle", label: "Big Pickle" },
    { id: "opencode/deepseek-v4.1-flash-free", label: "DeepSeek v4.1 Flash" },
  ],
  gemini: [
    { id: "gemini-4-neon-medium", label: "Gemini 4 Neon (Medium)" },
    { id: "gemini-4-carbon-medium", label: "Gemini 4 Carbon (Medium)" },
    { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
  ],
};

export function parseAgyModelsOutput(stdout: string): ProviderModelOption[] {
  const seen = new Set<string>();
  const result: ProviderModelOption[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.includes("\t")) continue;

    const [rawId, rawLabel] = trimmed.split("\t");
    if (rawId === undefined || rawLabel === undefined) continue;

    const id = rawId.trim();
    const label = rawLabel.trim();
    if (!id || !label) continue;
    if (seen.has(id)) continue;

    seen.add(id);
    result.push({ id, label });
  }

  return result;
}

export function parseOpenCodeModelsOutput(stdout: string): ProviderModelOption[] {
  const seen = new Set<string>();
  const result: ProviderModelOption[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\s/.test(trimmed)) continue;

    if (seen.has(trimmed)) continue;

    seen.add(trimmed);
    result.push({ id: trimmed, label: trimmed });
  }

  return result;
}

export function parseCodexModelsCache(rawJson: string): ProviderModelOption[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }
  const models = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { models?: unknown }).models)
      ? (parsed as { models: unknown[] }).models
      : [];
  const seen = new Set<string>();
  const result: ProviderModelOption[] = [];
  for (const item of models) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.visibility !== undefined && rec.visibility !== "list") continue;
    const id = typeof rec.slug === "string" ? rec.slug.trim() : "";
    const label =
      typeof rec.display_name === "string" && rec.display_name.trim() !== ""
        ? rec.display_name.trim()
        : id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label });
  }
  return result;
}

export type CommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<string>;

export async function discoverProviderModels(options?: {
  hasAgy?: boolean;
  hasOpenCode?: boolean;
  loadClaudeModels?: () => Promise<ProviderModelOption[]>;
  loadCodexModels?: () => Promise<ProviderModelOption[]>;
  runCommand?: CommandRunner;
  timeoutMs?: number;
}): Promise<Record<BossId, ProviderModelOption[]>> {
  const timeoutMs = options?.timeoutMs ?? 4000;
  const runCommand =
    options?.runCommand ??
    (async (command: string, args: string[], ms: number) => {
      const { stdout } = await execFileAsync(command, args, { timeout: ms });
      return stdout;
    });

  const result: Record<BossId, ProviderModelOption[]> = {
    claude: [...CURATED_MODELS.claude],
    codex: [...CURATED_MODELS.codex],
    opencode: [...CURATED_MODELS.opencode],
    gemini: [...CURATED_MODELS.gemini],
  };

  if (options?.loadClaudeModels) {
    try {
      const claudeModels = await options.loadClaudeModels();
      if (claudeModels.length > 0) {
        result.claude = claudeModels;
      }
    } catch {
      // fall back to curated
    }
  }

  if (options?.loadCodexModels) {
    try {
      const codexModels = await options.loadCodexModels();
      if (codexModels.length > 0) {
        result.codex = codexModels;
      }
    } catch {
      // fall back to curated
    }
  }

  if (options?.hasAgy) {
    try {
      const stdout = await runCommand("agy", ["models"], timeoutMs);
      const parsed = parseAgyModelsOutput(stdout);
      if (parsed.length > 0) {
        result.gemini = parsed;
      }
    } catch {
      // fall back to curated
    }
  }

  if (options?.hasOpenCode) {
    try {
      const stdout = await runCommand("opencode", ["models"], timeoutMs);
      const parsed = parseOpenCodeModelsOutput(stdout);
      if (parsed.length > 0) {
        result.opencode = parsed;
      }
    } catch {
      // fall back to curated
    }
  }

  return result;
}

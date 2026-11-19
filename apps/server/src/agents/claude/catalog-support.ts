import type { ProviderAgent, ProviderCatalog, SlashCommand } from "../../office/domain/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Keeps only well-formed commands; the SDK shape is open and tests feed partial objects. */
export function toCommands(value: unknown): SlashCommand[] {
  if (!Array.isArray(value)) return [];
  const commands: SlashCommand[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.name !== "string") continue;
    commands.push({
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : "",
      argumentHint: typeof raw.argumentHint === "string" ? raw.argumentHint : "",
      ...(Array.isArray(raw.aliases) ? { aliases: raw.aliases.filter((a): a is string => typeof a === "string") } : {}),
      ...(typeof raw.builtin === "boolean" ? { builtin: raw.builtin } : {}),
    });
  }
  return commands;
}

export function toAgents(value: unknown): ProviderAgent[] {
  if (!Array.isArray(value)) return [];
  const agents: ProviderAgent[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.name !== "string") continue;
    agents.push({
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : "",
      ...(typeof raw.model === "string" ? { model: raw.model } : {}),
    });
  }
  return agents;
}

export function toCatalog(value: unknown): ProviderCatalog {
  const record = isRecord(value) ? value : {};
  return { commands: toCommands(record.commands), agents: toAgents(record.agents) };
}

/** Rejects with `message` when `promise` has not settled within `ms`; the timer never keeps the process alive. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

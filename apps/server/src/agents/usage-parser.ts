// apps/server/src/agents/usage-parser.ts

export function normalizeUtilizationPercent(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }

  let value: number;
  if (raw === 0) {
    value = 0;
  } else if (raw > 0 && raw <= 1) {
    value = raw * 100;
  } else {
    value = raw;
  }

  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}

export function normalizeResetsAt(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim() !== "") {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString();
    }
    return null;
  }

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }

  return null;
}

export function formatRateLimitWindow(rateLimitType: unknown): string | null {
  const map: Record<string, string> = {
    five_hour: "5h",
    seven_day: "7d",
    seven_day_opus: "7d (Opus)",
    seven_day_sonnet: "7d (Sonnet)",
    overage: "Overage",
    seven_day_overage_included: "7d",
  };

  if (typeof rateLimitType === "string") {
    const normalized = rateLimitType.trim();
    if (normalized === "") {
      return null;
    }
    return map[normalized] ?? normalized;
  }

  return null;
}

export type ExtractedTokens = {
  inputTokens: number;
  outputTokens: number;
  contextUsed: number | null;
  contextWindow: number | null;
  costUsd: number | null;
};

export function extractTokenUsage(record: Record<string, unknown>): ExtractedTokens | null {
  const rawUsage = record.usage;
  const source: Record<string, unknown> =
    typeof rawUsage === "object" && rawUsage !== null && !Array.isArray(rawUsage)
      ? (rawUsage as Record<string, unknown>)
      : record;

  const inputKeys = ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"];
  const outputKeys = ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"];
  const cacheKeys = ["cache_read_input_tokens", "cacheReadInputTokens"];
  const contextKeys = ["context_window", "contextWindow"];
  const costKeys = ["total_cost_usd", "costUsd", "cost"];

  const input = findFirstNumber(source, inputKeys);
  const output = findFirstNumber(source, outputKeys);
  const cache = findFirstNumber(source, cacheKeys) ?? 0;
  const contextWindow = findFirstNumber(source, contextKeys) ?? findFirstNumber(record, contextKeys);
  const costUsd = findFirstNumber(source, costKeys) ?? findFirstNumber(record, costKeys);

  if (input === null && output === null) {
    return null;
  }

  const inputTokens = input ?? 0;
  const outputTokens = output ?? 0;

  return {
    inputTokens,
    outputTokens,
    contextUsed: contextWindow !== null ? inputTokens + cache : null,
    contextWindow,
    costUsd,
  };
}

function findFirstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
      return val;
    }
  }
  return null;
}

export function isRateLimitErrorMessage(reason: string): boolean {
  const pattern = /\b(429|rate[_ -]?limit(ed)?|too many requests|quota (exceeded|exhausted|reached|limit)|usage limit|hit your limit|out of credits|credit balance|insufficient_quota|overloaded_error)\b/i;
  return pattern.test(reason);
}

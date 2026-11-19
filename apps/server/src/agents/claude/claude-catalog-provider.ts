import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CatalogProvider } from "../../office/ports/catalog-provider.ts";
import type { ProviderCatalog } from "../../office/domain/types.ts";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { toCatalog, withTimeout } from "./catalog-support.ts";
import type { QueryFunction } from "./claude-agent-adapter.ts";
import { SETTING_SOURCES, SYSTEM_PROMPT } from "./session-options.ts";

export const PROBE_TIMEOUT_MS = 15_000;

/** A prompt stream that never yields: the session initializes but no model turn ever starts. */
async function* never(): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>(() => {});
}

/** Reads a folder's commands and agents from a probe session's initialization result. */
export class ClaudeCatalogProvider implements CatalogProvider {
  constructor(
    private readonly queryFn: QueryFunction = query,
    private readonly timeoutMs: number = PROBE_TIMEOUT_MS,
  ) {}

  async probe(cwd: string): Promise<ProviderCatalog> {
    const handle = this.queryFn({
      prompt: never(),
      options: { cwd, settingSources: SETTING_SOURCES, systemPrompt: SYSTEM_PROMPT },
    });
    try {
      // The stream must be drained or it stalls; its messages (hooks) are not needed.
      void (async () => {
        try {
          for await (const ignored of handle) void ignored;
        } catch {
          // closing the query ends the stream
        }
      })();
      if (!handle.initializationResult) throw new Error("The agent SDK cannot report its catalog");
      const init = await withTimeout(handle.initializationResult(), this.timeoutMs, "Catalog probe timed out");
      return toCatalog(init);
    } finally {
      try {
        handle.close?.();
      } catch {
        // already closed
      }
    }
  }
}

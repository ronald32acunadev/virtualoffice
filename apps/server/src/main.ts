import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AntigravityAgentAdapter } from "./agents/antigravity/antigravity-agent-adapter.ts";
import { isBinaryAvailable } from "./agents/binary-availability.ts";
import { ClaudeAgentAdapter } from "./agents/claude/claude-agent-adapter.ts";
import { ClaudeCatalogProvider } from "./agents/claude/claude-catalog-provider.ts";
import { ClaudeSessionCatalog } from "./agents/claude/claude-session-catalog.ts";
import { CodexAgentAdapter } from "./agents/codex/codex-agent-adapter.ts";
import { GeminiAgentAdapter } from "./agents/gemini/gemini-agent-adapter.ts";
import { OpenCodeAgentAdapter } from "./agents/opencode/opencode-agent-adapter.ts";
import { InMemoryEventBus } from "./events/in-memory-event-bus.ts";
import { buildApp } from "./http/app.ts";
import { createToken } from "./http/security.ts";
import { OfficeService } from "./office/application/office-service.ts";
import type { BossId } from "./office/domain/types.ts";
import type { AgentAdapter } from "./office/ports/agent-adapter.ts";
import { SqliteOfficeRepository } from "./persistence/sqlite/sqlite-office-repository.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.OFFICE_PORT ?? 4317);
const dbPath = process.env.OFFICE_DB ?? path.join(repoRoot, "data", "office.sqlite");
const devOrigin = process.env.OFFICE_DEV_ORIGIN || undefined;
const webDist = path.join(repoRoot, "apps", "web", "dist");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const hasAgy = isBinaryAvailable("agy");
const hasGemini = !hasAgy && isBinaryAvailable("gemini");

const token = createToken();
const repository = new SqliteOfficeRepository(dbPath);
const adapters: Partial<Record<BossId, AgentAdapter>> = {
  claude: new ClaudeAgentAdapter(),
  ...(isBinaryAvailable("codex") ? { codex: new CodexAgentAdapter() } : {}),
  ...(isBinaryAvailable("opencode") ? { opencode: new OpenCodeAgentAdapter() } : {}),
  ...(hasAgy
    ? { gemini: new AntigravityAgentAdapter() }
    : hasGemini
      ? { gemini: new GeminiAgentAdapter() }
      : {}),
};
const office = new OfficeService({
  repository,
  adapters,
  events: new InMemoryEventBus(),
  sessions: new ClaudeSessionCatalog(),
  catalogProvider: new ClaudeCatalogProvider(),
  ...(hasAgy ? { bossNames: { gemini: "Antigravity" } } : {}),
});
office.recoverOnStartup();
office.backfillProfiles();

const app = await buildApp({
  token,
  port,
  repository,
  office,
  ...(fs.existsSync(webDist) ? { staticRoot: webDist } : {}),
  ...(devOrigin ? { devOrigin } : {}),
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await office.shutdown();
  await app.close();
  repository.close();
  process.exit(0);
}
process.on("SIGINT", () => {
  office.beginShutdown();
  void shutdown();
});
process.on("SIGTERM", () => {
  office.beginShutdown();
  void shutdown();
});

await app.listen({ host: "127.0.0.1", port });
console.log(`Virtual Office: http://127.0.0.1:${port}/?token=${token}`);

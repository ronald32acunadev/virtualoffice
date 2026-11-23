import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { AntigravityAgentAdapter } from "./agents/antigravity/antigravity-agent-adapter.ts";
import { isBinaryAvailable } from "./agents/binary-availability.ts";
import { ClaudeAgentAdapter } from "./agents/claude/claude-agent-adapter.ts";
import { ClaudeCatalogProvider } from "./agents/claude/claude-catalog-provider.ts";
import { ClaudeSessionCatalog } from "./agents/claude/claude-session-catalog.ts";
import { AntigravitySessionCatalog } from "./agents/antigravity/antigravity-session-catalog.ts";
import { CodexSessionCatalog } from "./agents/codex/codex-session-catalog.ts";
import { OpenCodeSessionCatalog } from "./agents/opencode/opencode-session-catalog.ts";
import { CodexAgentAdapter } from "./agents/codex/codex-agent-adapter.ts";
import { GeminiAgentAdapter } from "./agents/gemini/gemini-agent-adapter.ts";
import { OpenCodeAgentAdapter } from "./agents/opencode/opencode-agent-adapter.ts";
import { InMemoryEventBus } from "./events/in-memory-event-bus.ts";
import { buildApp } from "./http/app.ts";
import { TerminalSessionManager } from "./terminal/terminal-session-manager.ts";
import { createToken } from "./http/security.ts";
import { OfficeService } from "./office/application/office-service.ts";
import type { BossId } from "./office/domain/types.ts";
import type { AgentAdapter } from "./office/ports/agent-adapter.ts";
import { SqliteOfficeRepository } from "./persistence/sqlite/sqlite-office-repository.ts";
import { DesktopAppHost } from "./desktop/desktop-app-host.ts";

export type StartOfficeServerOptions = {
  port?: number;
  dbPath?: string;
  staticRoot?: string;
  devOrigin?: string;
  token?: string;
  autoSync?: boolean;
  syncIntervalMs?: number;
};

export type RunningOfficeServer = {
  url: string;
  port: number;
  token: string;
  close: () => Promise<void>;
};

export async function startOfficeServer(
  options: StartOfficeServerOptions = {}
): Promise<RunningOfficeServer> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
  );
  const port = options.port ?? Number(process.env.OFFICE_PORT ?? 4317);
  const dbPath =
    options.dbPath ?? process.env.OFFICE_DB ?? path.join(repoRoot, "data", "office.sqlite");
  const attachmentsDir = path.join(
    path.dirname(dbPath === ":memory:" ? path.join(repoRoot, "data", "x") : dbPath),
    "attachments"
  );
  const devOrigin = options.devOrigin ?? (process.env.OFFICE_DEV_ORIGIN || undefined);
  const webDist = options.staticRoot ?? path.join(repoRoot, "apps", "web", "dist");
  const token = options.token ?? createToken();

  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const repository = new SqliteOfficeRepository(dbPath);
  const hasAgy = isBinaryAvailable("agy");
  const hasGemini = !hasAgy && isBinaryAvailable("gemini");
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

  const terminals = new TerminalSessionManager({
    getEmployee: (id) => repository.getEmployee(id) ?? null,
    onActiveChange: (employeeId, active) => office.notifyTerminal(employeeId, active),
  });

  const office = new OfficeService({
    repository,
    adapters,
    events: new InMemoryEventBus(),
    sessions: new ClaudeSessionCatalog(),
    catalogProvider: new ClaudeCatalogProvider(),
    terminals,
    attachmentsDir,
    sessionCatalogs: {
      claude: new ClaudeSessionCatalog(),
      codex: new CodexSessionCatalog(),
      opencode: new OpenCodeSessionCatalog(),
      ...(hasAgy ? { gemini: new AntigravitySessionCatalog() } : {}),
    },
    ...(hasAgy ? { bossNames: { gemini: "Antigravity" } } : {}),
  });
  office.recoverOnStartup();
  office.backfillProfiles();

  const autoSync = options.autoSync ?? dbPath !== ":memory:";
  let syncTimer: NodeJS.Timeout | undefined;
  if (autoSync) {
    await office.syncProviders();
    const syncIntervalMs = options.syncIntervalMs ?? 30_000;
    if (syncIntervalMs > 0) {
      syncTimer = setInterval(() => {
        void office.syncProviders();
      }, syncIntervalMs);
      syncTimer.unref?.();
    }
  }

  const desktopProfilesRoot = path.join(
    path.dirname(dbPath === ":memory:" ? path.join(repoRoot, "data", "x") : dbPath),
    "desktop-profiles"
  );
  if (dbPath !== ":memory:") {
    // The app processes run with this folder as their working directory, so it must exist.
    fs.mkdirSync(desktopProfilesRoot, { recursive: true });
  }
  const desktopApps = new DesktopAppHost({ profilesRoot: desktopProfilesRoot });

  const app = await buildApp({
    token,
    port,
    repository,
    office,
    ...(fs.existsSync(webDist) ? { staticRoot: webDist } : {}),
    ...(devOrigin ? { devOrigin } : {}),
    terminals,
    desktopApps,
  });

  await app.listen({ host: "127.0.0.1", port });

  const address = app.server.address();
  const boundPort =
    typeof address === "object" && address !== null && "port" in address
      ? (address as AddressInfo).port
      : port;

  let closePromise: Promise<void> | null = null;

  const close = async (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      try {
        if (syncTimer) clearInterval(syncTimer);
        office.beginShutdown();
        await office.shutdown();
        await app.close();
        terminals.killAll();
        desktopApps.stopAll();
        repository.close();
      } finally {
      }
    })();

    return closePromise;
  };

  return {
    url: `http://127.0.0.1:${boundPort}/?token=${token}`,
    port: boundPort,
    token,
    close,
  };
}

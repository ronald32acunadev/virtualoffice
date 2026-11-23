import { getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SDKSessionInfo, SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import type { AgentMessage } from "../../office/ports/agent-adapter.ts";
import type { DiscoveredProject, SessionCatalog, SessionInfo } from "../../office/ports/session-catalog.ts";
import { mapAssistantContent, mapUserContent } from "./message-mapping.ts";

export type ListSessionsFunction = () => Promise<SDKSessionInfo[]>;
export type GetSessionMessagesFunction = (sessionId: string) => Promise<SessionMessage[]>;

function firstNonEmpty(...values: (string | undefined)[]): string {
  return values.find((value) => typeof value === "string" && value.trim() !== "") ?? "Untitled session";
}

/** Reads existing Claude Code sessions through the official SDK (read-only). */
export class ClaudeSessionCatalog implements SessionCatalog {
  constructor(
    private readonly listFn: ListSessionsFunction = () => listSessions(),
    private readonly messagesFn: GetSessionMessagesFunction = (sessionId) => getSessionMessages(sessionId),
  ) {}

  async list(): Promise<SessionInfo[]> {
    const sessions = await this.listFn();
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      title: firstNonEmpty(s.customTitle, s.summary, s.firstPrompt),
      cwd: s.cwd && s.cwd.trim() !== "" ? s.cwd : null,
      gitBranch: s.gitBranch ?? null,
      lastModified: s.lastModified,
      createdAt: s.createdAt ?? null,
    }));
  }

  async listProjects(): Promise<DiscoveredProject[]> {
    try {
      const sessions = await this.list();
      const projectMap = new Map<string, DiscoveredProject>();
      for (const s of sessions) {
        if (!s.cwd) continue;
        const resolved = path.resolve(s.cwd);
        const name = path.basename(resolved) || resolved;
        const existing = projectMap.get(resolved);
        if (!existing || s.lastModified > existing.lastModified) {
          projectMap.set(resolved, {
            path: resolved,
            name,
            lastModified: s.lastModified,
          });
        }
      }
      return Array.from(projectMap.values()).sort((a, b) => b.lastModified - a.lastModified);
    } catch {
      return [];
    }
  }

  async history(sessionId: string): Promise<AgentMessage[]> {
    const stored = await this.messagesFn(sessionId);
    const out: AgentMessage[] = [];
    for (const entry of stored) {
      const ctx = { parentToolUseId: entry.parent_tool_use_id ?? null, sourceUuid: entry.uuid };
      const content = (entry.message as { content?: unknown } | null | undefined)?.content;
      if (entry.type === "assistant") out.push(...mapAssistantContent(content, ctx));
      else if (entry.type === "user") out.push(...mapUserContent(content, ctx, { includeUserText: true }));
    }
    return out;
  }
}

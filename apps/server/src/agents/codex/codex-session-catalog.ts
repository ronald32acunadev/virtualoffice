import { existsSync, rmSync, statSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "../../office/ports/agent-adapter.ts";
import type { DiscoveredProject, SessionCatalog, SessionInfo } from "../../office/ports/session-catalog.ts";

function nonEmpty(val: unknown): string | null {
  return typeof val === "string" && val.trim() !== "" ? val : null;
}

export class CodexSessionCatalog implements SessionCatalog {
  constructor(
    private readonly config: {
      stateDbPath?: string;
      historyDbPath?: string;
      sessionsDir?: string;
    } = {},
  ) {}

  private get stateDbPath(): string {
    return this.config.stateDbPath ?? join(homedir(), ".codex", "state_5.sqlite");
  }

  private get historyDbPath(): string {
    return this.config.historyDbPath ?? join(homedir(), ".codex", "thread_history_1.sqlite");
  }

  private get sessionsDir(): string {
    return this.config.sessionsDir ?? join(homedir(), ".codex", "sessions");
  }

  async listProjects(): Promise<DiscoveredProject[]> {
    if (!existsSync(this.stateDbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.stateDbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT pr.path, p.name, p.updated_at_ms FROM project_roots pr LEFT JOIN projects p ON p.id = pr.project_id WHERE pr.path IS NOT NULL AND trim(pr.path) != ''"
      );
      const rows = stmt.all() as Array<{
        path: string;
        name: string | null;
        updated_at_ms: number | null;
      }>;
      const projectMap = new Map<string, DiscoveredProject>();
      for (const row of rows) {
        const pPath = row.path;
        const name = (row.name && row.name.trim() !== "") ? row.name.trim() : (basename(pPath) || pPath);
        const lastModified = Number(row.updated_at_ms || 0);
        const existing = projectMap.get(pPath);
        if (!existing || lastModified > existing.lastModified) {
          projectMap.set(pPath, { path: pPath, name, lastModified });
        }
      }
      const projects = Array.from(projectMap.values());
      projects.sort((a, b) => b.lastModified - a.lastModified);
      return projects;
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  async list(): Promise<SessionInfo[]> {
    if (!existsSync(this.stateDbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.stateDbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT id, cwd, title, first_user_message, archived, created_at_ms, updated_at_ms, source, git_branch FROM threads WHERE (archived IS NULL OR archived = 0) ORDER BY updated_at_ms DESC"
      );
      const rows = stmt.all() as Array<{
        id: string;
        cwd: string | null;
        title: string | null;
        first_user_message: string | null;
        archived: number | null;
        created_at_ms: number | null;
        updated_at_ms: number | null;
        source: string | null;
        git_branch: string | null;
      }>;

      const sessions: SessionInfo[] = [];
      for (const row of rows) {
        if (typeof row.source === "string" && row.source.trim() !== "") {
          const src = row.source.trim();
          if (src.includes("subagent")) {
            continue;
          }
          try {
            const parsedSrc = JSON.parse(src);
            if (parsedSrc && typeof parsedSrc === "object" && ("subagent" in parsedSrc || parsedSrc.isSubagent)) {
              continue;
            }
          } catch {
            // not json, but checked string inclusion above
          }
        }

        sessions.push({
          sessionId: row.id,
          title: nonEmpty(row.title) ?? nonEmpty(row.first_user_message) ?? "Untitled session",
          cwd: nonEmpty(row.cwd),
          gitBranch: nonEmpty(row.git_branch),
          lastModified: Number(row.updated_at_ms || row.created_at_ms || 0),
          createdAt: row.created_at_ms != null ? Number(row.created_at_ms) : null,
        });
      }
      return sessions;
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  async history(sessionId: string): Promise<AgentMessage[]> {
    if (!existsSync(this.historyDbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.historyDbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT thread_id, item_id, rollout_ordinal, item_json, item_type FROM thread_items WHERE thread_id = ? ORDER BY rollout_ordinal ASC"
      );
      const rows = stmt.all(sessionId) as Array<{
        thread_id: string;
        item_id: string;
        rollout_ordinal: number;
        item_json: string;
        item_type: string;
      }>;

      const out: AgentMessage[] = [];
      for (const row of rows) {
        let item: any;
        try {
          item = JSON.parse(row.item_json);
        } catch {
          continue;
        }
        if (!item) continue;

        if (row.item_type === "userMessage" || item.type === "userMessage") {
          const contentArr = item.content;
          if (Array.isArray(contentArr)) {
            const texts = contentArr
              .map((c: any) => (c && typeof c.text === "string" ? c.text : ""))
              .filter((t: string) => t !== "");
            const combined = texts.join("\n");
            if (combined !== "") {
              out.push({
                kind: "user_text",
                content: combined,
                sourceUuid: row.item_id,
              });
            }
          }
        } else if (row.item_type === "agentMessage" || item.type === "agentMessage") {
          const text = item.text;
          if (typeof text === "string" && text !== "") {
            out.push({
              kind: "agent_text",
              content: text,
              sourceUuid: row.item_id,
            });
          }
        } else if (row.item_type === "commandExecution" || item.type === "commandExecution") {
          const toolUseId = typeof item.id === "string" ? item.id : row.item_id;
          const cmd = typeof item.command === "string" ? item.command : "";
          out.push({
            kind: "tool_call",
            toolName: "bash",
            toolUseId,
            content: cmd,
            sourceUuid: `${row.item_id}:call`,
          });
          const output = item.aggregatedOutput;
          if (output !== undefined && output !== null && output !== "") {
            out.push({
              kind: "tool_result",
              toolName: "bash",
              toolUseId,
              content: String(output),
              sourceUuid: `${row.item_id}:result`,
            });
          }
        } else if (row.item_type === "mcpToolCall" || item.type === "mcpToolCall") {
          const toolUseId = typeof item.id === "string" ? item.id : row.item_id;
          const server = typeof item.server === "string" ? item.server : "mcp";
          const tool = typeof item.tool === "string" ? item.tool : "call";
          const toolName = `${server}:${tool}`;
          const args = item.arguments ?? {};
          out.push({
            kind: "tool_call",
            toolName,
            toolUseId,
            content: JSON.stringify(args),
            sourceUuid: `${row.item_id}:call`,
          });
        }
      }
      return out;
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId || !/^[A-Za-z0-9._-]+$/.test(sessionId)) {
      return false;
    }
    const resolvedSessionsDir = resolve(this.sessionsDir);
    const expectedPrefix = resolvedSessionsDir + "/";
    if (!existsSync(resolvedSessionsDir)) {
      return false;
    }

    let found = false;
    const walk = (dir: string) => {
      if (found) return;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (found) return;
          const fullPath = resolve(dir, entry.name);
          if (!fullPath.startsWith(resolvedSessionsDir)) continue;
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            const base = entry.name;
            if (base === `${sessionId}.jsonl` || base.endsWith(`-${sessionId}.jsonl`)) {
              if (fullPath.startsWith(resolvedSessionsDir)) {
                rmSync(fullPath, { force: true });
                found = true;
              }
            }
          }
        }
      } catch {}
    };

    walk(resolvedSessionsDir);
    return found;
  }
}

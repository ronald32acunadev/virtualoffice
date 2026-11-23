import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "../../office/ports/agent-adapter.ts";
import type { DiscoveredProject, SessionCatalog, SessionInfo } from "../../office/ports/session-catalog.ts";

function nonEmpty(val: unknown): string | null {
  return typeof val === "string" && val.trim() !== "" ? val : null;
}

export class OpenCodeSessionCatalog implements SessionCatalog {
  constructor(
    private readonly dbPath: string = join(homedir(), ".local", "share", "opencode", "opencode.db"),
  ) {}

  async listProjects(): Promise<DiscoveredProject[]> {
    if (!existsSync(this.dbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.dbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT worktree, name, time_updated, time_created FROM project WHERE time_archived IS NULL AND worktree IS NOT NULL AND trim(worktree) != ''"
      );
      const rows = stmt.all() as Array<{
        worktree: string;
        name: string | null;
        time_updated: number | null;
        time_created: number | null;
      }>;
      const projects: DiscoveredProject[] = rows.map((row) => {
        const worktree = row.worktree;
        const name = (row.name && row.name.trim() !== "") ? row.name.trim() : (basename(worktree) || worktree);
        const lastModified = Number(row.time_updated || row.time_created || 0);
        return { path: worktree, name, lastModified };
      });
      projects.sort((a, b) => b.lastModified - a.lastModified);
      return projects;
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  async list(): Promise<SessionInfo[]> {
    if (!existsSync(this.dbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.dbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT id, directory, title, time_created, time_updated FROM session_v2 WHERE time_archived IS NULL AND (parent_id IS NULL OR trim(parent_id) = '') ORDER BY time_updated DESC"
      );
      const rows = stmt.all() as Array<{
        id: string;
        directory: string | null;
        title: string | null;
        time_created: number | null;
        time_updated: number | null;
      }>;
      return rows.map((row) => ({
        sessionId: row.id,
        title: nonEmpty(row.title) ?? "Untitled session",
        cwd: nonEmpty(row.directory),
        gitBranch: null,
        lastModified: Number(row.time_updated || row.time_created || 0),
        createdAt: row.time_created != null ? Number(row.time_created) : null,
      }));
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  async history(sessionId: string): Promise<AgentMessage[]> {
    if (!existsSync(this.dbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.dbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT id, type, seq, time_created, data FROM session_message WHERE session_id = ? ORDER BY seq ASC, time_created ASC"
      );
      const rows = stmt.all(sessionId) as Array<{
        id: string;
        type: string;
        seq: number;
        time_created: number | null;
        data: string;
      }>;
      const out: AgentMessage[] = [];
      for (const row of rows) {
        let parsed: any;
        try {
          parsed = JSON.parse(row.data);
        } catch {
          continue;
        }
        if (!parsed) continue;

        if (row.type === "user") {
          if (typeof parsed.text === "string" && parsed.text.trim() !== "") {
            out.push({
              kind: "user_text",
              content: parsed.text,
              sourceUuid: row.id,
            });
          }
        } else if (row.type === "assistant") {
          const contentBlocks = parsed.content;
          if (Array.isArray(contentBlocks)) {
            contentBlocks.forEach((block: any, i: number) => {
              if (!block) return;
              if (block.type === "text" && typeof block.text === "string" && block.text !== "") {
                out.push({
                  kind: "agent_text",
                  content: block.text,
                  sourceUuid: `${row.id}:${i}`,
                });
              } else if (block.type === "tool") {
                const toolName = typeof block.name === "string" ? block.name : "tool";
                const toolUseId = typeof block.id === "string" ? block.id : `${row.id}:${i}`;
                const inputContent = JSON.stringify(block.state?.input ?? {});
                out.push({
                  kind: "tool_call",
                  toolName,
                  toolUseId,
                  content: inputContent,
                  sourceUuid: `${row.id}:${i}:call`,
                });
                const stContent = block.state?.content;
                if (stContent !== undefined && stContent !== null && stContent !== "") {
                  const resultStr = typeof stContent === "string" ? stContent : JSON.stringify(stContent);
                  out.push({
                    kind: "tool_result",
                    toolName,
                    toolUseId,
                    content: resultStr,
                    sourceUuid: `${row.id}:${i}:result`,
                  });
                }
              }
            });
          }
        }
      }
      return out;
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }
}

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "../../office/ports/agent-adapter.ts";
import type { DiscoveredProject, SessionCatalog, SessionInfo } from "../../office/ports/session-catalog.ts";

function firstNonEmpty(...values: (string | undefined | null)[]): string | null {
  return values.find((val) => typeof val === "string" && val.trim() !== "") ?? null;
}

function parseWorkspaceUri(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const uri of parsed) {
        if (typeof uri === "string" && uri.startsWith("file://")) {
          return fileURLToPath(uri);
        }
      }
    }
  } catch {
    // not json array
  }
  return null;
}

function parseTimestamp(raw: string | number | null): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const normalized = raw.replace(" ", "T");
    const parsed = Date.parse(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export class AntigravitySessionCatalog implements SessionCatalog {
  constructor(
    private readonly config: {
      summariesDbPath?: string;
      brainDir?: string;
    } = {},
  ) {}

  private get summariesDbPath(): string {
    return this.config.summariesDbPath ?? join(homedir(), ".gemini", "antigravity", "conversation_summaries.db");
  }

  private get brainDir(): string {
    return this.config.brainDir ?? join(homedir(), ".gemini", "antigravity", "brain");
  }

  async list(): Promise<SessionInfo[]> {
    if (!existsSync(this.summariesDbPath)) {
      return [];
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.summariesDbPath, { readOnly: true });
      const stmt = db.prepare(
        "SELECT conversation_id, title, preview, last_modified_time, workspace_uris, parent_conversation_id, nesting_depth FROM conversation_summaries WHERE (parent_conversation_id IS NULL OR trim(parent_conversation_id) = '') AND (nesting_depth IS NULL OR nesting_depth = 0)"
      );
      const rows = stmt.all() as Array<{
        conversation_id: string;
        title: string | null;
        preview: string | null;
        last_modified_time: string | number | null;
        workspace_uris: string | null;
        parent_conversation_id: string | null;
        nesting_depth: number | null;
      }>;

      const sessions: SessionInfo[] = rows.map((row) => ({
        sessionId: row.conversation_id,
        title: firstNonEmpty(row.title, row.preview) ?? "Untitled session",
        cwd: parseWorkspaceUri(row.workspace_uris),
        gitBranch: null,
        lastModified: parseTimestamp(row.last_modified_time),
        createdAt: null,
      }));

      sessions.sort((a, b) => b.lastModified - a.lastModified);
      return sessions;
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  async listProjects(): Promise<DiscoveredProject[]> {
    try {
      const sessions = await this.list();
      const projectMap = new Map<string, DiscoveredProject>();
      for (const s of sessions) {
        if (!s.cwd) continue;
        const resolved = s.cwd;
        const name = basename(resolved) || resolved;
        const existing = projectMap.get(resolved);
        if (!existing || s.lastModified > existing.lastModified) {
          projectMap.set(resolved, {
            path: resolved,
            name,
            lastModified: s.lastModified,
          });
        }
      }
      const projects = Array.from(projectMap.values());
      projects.sort((a, b) => b.lastModified - a.lastModified);
      return projects;
    } catch {
      return [];
    }
  }

  async history(sessionId: string): Promise<AgentMessage[]> {
    if (!sessionId || sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes("..")) {
      return [];
    }
    const transcriptPath = join(this.brainDir, sessionId, ".system_generated", "logs", "transcript.jsonl");
    if (!existsSync(transcriptPath)) {
      return [];
    }
    try {
      const content = readFileSync(transcriptPath, "utf8");
      const lines = content.split("\n");
      const out: AgentMessage[] = [];
      for (const line of lines) {
        if (line.trim() === "") continue;
        let entry: any;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        if (!entry) continue;

        const stepIndex = entry.step_index ?? 0;
        if (entry.type === "USER_INPUT" && entry.source === "USER_EXPLICIT") {
          if (typeof entry.content === "string" && entry.content.trim() !== "") {
            out.push({
              kind: "user_text",
              content: entry.content,
              sourceUuid: `step-${stepIndex}`,
            });
          }
        } else if (entry.type === "PLANNER_RESPONSE" && entry.source === "MODEL") {
          if (typeof entry.content === "string" && entry.content !== "") {
            out.push({
              kind: "agent_text",
              content: entry.content,
              sourceUuid: `step-${stepIndex}:text`,
            });
          }
          if (Array.isArray(entry.tool_calls)) {
            entry.tool_calls.forEach((tc: any, idx: number) => {
              if (!tc) return;
              const toolName = typeof tc.name === "string" ? tc.name : "tool";
              const toolUseId = typeof tc.id === "string" ? tc.id : `step-${stepIndex}:tc-${idx}`;
              const argsContent = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {});
              out.push({
                kind: "tool_call",
                toolName,
                toolUseId,
                content: argsContent,
                sourceUuid: `step-${stepIndex}:tc-${idx}`,
              });
            });
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}

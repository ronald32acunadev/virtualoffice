import type { AgentMessage } from "./agent-adapter.ts";

export type SessionInfo = {
  sessionId: string;
  title: string;
  cwd: string | null;
  gitBranch: string | null;
  /** Epoch milliseconds. */
  lastModified: number;
  createdAt: number | null;
};

/** Read-only access to conversations that already exist outside the office. */
export interface SessionCatalog {
  list(): Promise<SessionInfo[]>;
  /** Stored history as office messages, each carrying its provider uuid as `sourceUuid`. */
  history(sessionId: string): Promise<AgentMessage[]>;
}

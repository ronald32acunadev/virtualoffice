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

export type DiscoveredProject = {
  path: string;
  name: string;
  /** Epoch milliseconds. */
  lastModified: number;
};

/** Read-only access to conversations that already exist outside the office. */
export interface SessionCatalog {
  list(): Promise<SessionInfo[]>;
  listProjects?(): Promise<DiscoveredProject[]>;
  /** Stored history as office messages, each carrying its provider uuid as `sourceUuid`. */
  history(sessionId: string): Promise<AgentMessage[]>;
  deleteSession?(sessionId: string): Promise<boolean>;
}

import { DatabaseSync } from "node:sqlite";
import type { OfficeRepository } from "../../office/ports/office-repository.ts";
import {
  isAgentEffort,
  isAgentMode,
  type Agent,
  type AgentEffort,
  type AgentMode,
  type ApprovalRequest,
  type Employee,
  type EmployeeStatus,
  type Message,
  type MessageAttachment,
  type BossId,
  type MessageKind,
  type ApprovalKind,
  type ApprovalStatus,
  type Decision,
  type Species,
  type Project,
  type MediaKind,
  type MediaPlaybackState,
  type MediaPreset,
  type MediaProvider,
} from "../../office/domain/types.ts";

type Row = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  boss_id TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  role TEXT,
  job_title TEXT,
  model TEXT,
  mode TEXT,
  effort TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  boss_id TEXT NOT NULL,
  agent_id TEXT,
  hired_by TEXT,
  task TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  provider_session_id TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  seq INTEGER,
  name TEXT,
  species TEXT,
  imported_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_use_id TEXT,
  parent_tool_use_id TEXT,
  created_at TEXT NOT NULL,
  source_uuid TEXT,
  attachments TEXT
);
CREATE INDEX IF NOT EXISTS messages_employee ON messages (employee_id, seq);
CREATE TABLE IF NOT EXISTS approvals (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  input TEXT NOT NULL,
  status TEXT NOT NULL,
  decision TEXT,
  answers TEXT,
  can_approve_for_session INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  providers TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_state (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_presets (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TEXT NOT NULL
);
`;

/** Columns added after the MVP schema; `CREATE TABLE IF NOT EXISTS` never adds them to an existing table. */
const ADDED_COLUMNS: { table: string; column: string; type: string }[] = [
  { table: "employees", column: "agent_id", type: "TEXT" },
  { table: "employees", column: "name", type: "TEXT" },
  { table: "employees", column: "species", type: "TEXT" },
  { table: "employees", column: "imported_at", type: "TEXT" },
  { table: "employees", column: "role", type: "TEXT" },
  { table: "employees", column: "job_title", type: "TEXT" },
  { table: "messages", column: "source_uuid", type: "TEXT" },
  { table: "messages", column: "attachments", type: "TEXT" },
  { table: "agents", column: "model", type: "TEXT" },
  { table: "agents", column: "mode", type: "TEXT" },
  { table: "agents", column: "effort", type: "TEXT" },
  { table: "employees", column: "model", type: "TEXT" },
  { table: "employees", column: "mode", type: "TEXT" },
  { table: "employees", column: "effort", type: "TEXT" },
];

const str = (value: unknown): string => String(value);
const nullableStr = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const parseStoredMode = (value: unknown): AgentMode => {
  const raw = nullableStr(value);
  return isAgentMode(raw) ? raw : "request_review";
};
const parseStoredEffort = (value: unknown): AgentEffort | null => {
  const raw = nullableStr(value);
  return isAgentEffort(raw) ? raw : null;
};

function toAgent(row: Row): Agent {
  return {
    id: str(row.id),
    bossId: str(row.boss_id) as BossId,
    name: str(row.name),
    species: (nullableStr(row.species) ?? "human") as Species,
    role: nullableStr(row.role),
    jobTitle: nullableStr(row.job_title),
    model: nullableStr(row.model),
    mode: parseStoredMode(row.mode),
    effort: parseStoredEffort(row.effort),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function toEmployee(row: Row): Employee {
  return {
    id: str(row.id),
    bossId: str(row.boss_id) as BossId,
    agentId: nullableStr(row.agent_id),
    hiredBy: nullableStr(row.hired_by),
    task: str(row.task),
    workingDirectory: str(row.working_directory),
    name: nullableStr(row.name) ?? "",
    species: (nullableStr(row.species) ?? "human") as Species,
    importedAt: nullableStr(row.imported_at),
    role: nullableStr(row.role),
    jobTitle: nullableStr(row.job_title),
    model: nullableStr(row.model),
    mode: parseStoredMode(row.mode),
    effort: parseStoredEffort(row.effort),
    providerSessionId: nullableStr(row.provider_session_id),
    status: str(row.status) as EmployeeStatus,
    failureReason: nullableStr(row.failure_reason),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function toMessage(row: Row): Message {
  const attStr = nullableStr(row.attachments);
  let attachments: MessageAttachment[] | undefined;
  if (attStr) {
    try {
      const parsed = JSON.parse(attStr) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        attachments = parsed as MessageAttachment[];
      }
    } catch {}
  }
  return {
    id: str(row.id),
    employeeId: str(row.employee_id),
    kind: str(row.kind) as MessageKind,
    content: str(row.content),
    toolName: nullableStr(row.tool_name),
    toolUseId: nullableStr(row.tool_use_id),
    parentToolUseId: nullableStr(row.parent_tool_use_id),
    createdAt: str(row.created_at),
    sourceUuid: nullableStr(row.source_uuid),
    ...(attachments ? { attachments } : {}),
  };
}

function toApproval(row: Row): ApprovalRequest {
  const answers = nullableStr(row.answers);
  return {
    id: str(row.id),
    employeeId: str(row.employee_id),
    kind: str(row.kind) as ApprovalKind,
    toolName: str(row.tool_name),
    summary: str(row.summary),
    input: JSON.parse(str(row.input)) as unknown,
    status: str(row.status) as ApprovalStatus,
    decision: nullableStr(row.decision) as Decision | null,
    answers: answers ? (JSON.parse(answers) as Record<string, string>) : null,
    canApproveForSession: Number(row.can_approve_for_session) === 1,
    createdAt: str(row.created_at),
    decidedAt: nullableStr(row.decided_at),
  };
}

function toProject(row: Row): Project {
  return {
    path: str(row.path),
    name: str(row.name),
    providers: JSON.parse(str(row.providers)) as BossId[],
    lastSeenAt: str(row.last_seen_at),
  };
}

function toMediaPlaybackState(row: Row): MediaPlaybackState {
  return {
    provider: str(row.provider) as MediaProvider,
    mediaKind: str(row.media_kind) as MediaKind,
    sourceUrl: str(row.source_url),
    embedUrl: str(row.embed_url),
    title: str(row.title),
    thumbnailUrl: nullableStr(row.thumbnail_url),
    updatedAt: str(row.updated_at),
  };
}

function toMediaPreset(row: Row): MediaPreset {
  return {
    id: str(row.id),
    provider: str(row.provider) as MediaProvider,
    mediaKind: str(row.media_kind) as MediaKind,
    sourceUrl: str(row.source_url),
    embedUrl: str(row.embed_url),
    title: str(row.title),
    thumbnailUrl: nullableStr(row.thumbnail_url),
    createdAt: str(row.created_at),
  };
}

export class SqliteOfficeRepository implements OfficeRepository {
  private readonly db: DatabaseSync;

  constructor(dbOrPath: DatabaseSync | string) {
    this.db = typeof dbOrPath === "string" ? new DatabaseSync(dbOrPath) : dbOrPath;
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Idempotent: adds any column an older database is missing. */
  private migrate(): void {
    for (const { table, column, type } of ADDED_COLUMNS) {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((info) => info.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
  }

  insertAgent(a: Agent): void {
    this.db
      .prepare(
        `INSERT INTO agents (id, boss_id, name, species, role, job_title, model, mode, effort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.id,
        a.bossId,
        a.name,
        a.species,
        a.role,
        a.jobTitle,
        a.model ?? null,
        a.mode ?? "request_review",
        a.effort ?? null,
        a.createdAt,
        a.updatedAt,
      );
  }

  updateAgent(a: Agent): void {
    this.db
      .prepare(
        `UPDATE agents SET name = ?, species = ?, role = ?, job_title = ?, model = ?, mode = ?, effort = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        a.name,
        a.species,
        a.role,
        a.jobTitle,
        a.model ?? null,
        a.mode ?? "request_review",
        a.effort ?? null,
        a.updatedAt,
        a.id,
      );
  }

  getAgent(id: string): Agent | undefined {
    const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    return row ? toAgent(row) : undefined;
  }

  listAgents(): Agent[] {
    return this.db.prepare("SELECT * FROM agents ORDER BY seq").all().map(toAgent);
  }

  deleteAgent(agentId: string): boolean {
    const result = this.db.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
    return Number(result.changes) > 0;
  }

  reassignEmployeesAgent(fromAgentId: string, toAgentId: string | null): number {
    const result = this.db
      .prepare("UPDATE employees SET agent_id = ? WHERE agent_id = ?")
      .run(toAgentId, fromAgentId);
    return Number(result.changes);
  }

  insertEmployee(e: Employee): void {
    this.db
      .prepare(
        `INSERT INTO employees (id, boss_id, agent_id, hired_by, task, working_directory, provider_session_id, status, failure_reason, created_at, updated_at, name, species, imported_at, role, job_title, model, mode, effort, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM employees))`,
      )
      .run(
        e.id,
        e.bossId,
        e.agentId ?? null,
        e.hiredBy,
        e.task,
        e.workingDirectory,
        e.providerSessionId,
        e.status,
        e.failureReason,
        e.createdAt,
        e.updatedAt,
        e.name,
        e.species,
        e.importedAt,
        e.role,
        e.jobTitle,
        e.model ?? null,
        e.mode ?? "request_review",
        e.effort ?? null,
      );
  }

  updateEmployee(e: Employee): void {
    this.db
      .prepare(
        `UPDATE employees SET boss_id = ?, agent_id = ?, hired_by = ?, task = ?, working_directory = ?, provider_session_id = ?,
         status = ?, failure_reason = ?, updated_at = ?, name = ?, species = ?, imported_at = ?, role = ?, job_title = ?, model = ?, mode = ?, effort = ? WHERE id = ?`,
      )
      .run(
        e.bossId,
        e.agentId ?? null,
        e.hiredBy,
        e.task,
        e.workingDirectory,
        e.providerSessionId,
        e.status,
        e.failureReason,
        e.updatedAt,
        e.name,
        e.species,
        e.importedAt,
        e.role,
        e.jobTitle,
        e.model ?? null,
        e.mode ?? "request_review",
        e.effort ?? null,
        e.id,
      );
  }

  getEmployee(id: string): Employee | undefined {
    const row = this.db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
    return row ? toEmployee(row) : undefined;
  }

  listEmployees(): Employee[] {
    return this.db.prepare("SELECT * FROM employees ORDER BY seq").all().map(toEmployee);
  }

  deleteEmployee(employeeId: string): boolean {
    this.db.prepare("DELETE FROM approvals WHERE employee_id = ?").run(employeeId);
    this.db.prepare("DELETE FROM messages WHERE employee_id = ?").run(employeeId);
    const result = this.db.prepare("DELETE FROM employees WHERE id = ?").run(employeeId);
    return Number(result.changes) > 0;
  }

  insertMessage(m: Message): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, employee_id, kind, content, tool_name, tool_use_id, parent_tool_use_id, created_at, source_uuid, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        m.id,
        m.employeeId,
        m.kind,
        m.content,
        m.toolName,
        m.toolUseId,
        m.parentToolUseId,
        m.createdAt,
        m.sourceUuid,
        m.attachments && m.attachments.length > 0 ? JSON.stringify(m.attachments) : null,
      );
  }

  listMessages(employeeId: string): Message[] {
    return this.db.prepare("SELECT * FROM messages WHERE employee_id = ? ORDER BY seq").all(employeeId).map(toMessage);
  }

  setMessageSourceUuid(messageId: string, sourceUuid: string): void {
    this.db.prepare("UPDATE messages SET source_uuid = ? WHERE id = ?").run(sourceUuid, messageId);
  }

  findAttachment(id: string): { employeeId: string; attachment: MessageAttachment } | null {
    const rows = this.db.prepare("SELECT employee_id, attachments FROM messages WHERE attachments IS NOT NULL").all() as Row[];
    for (const row of rows) {
      const attStr = nullableStr(row.attachments);
      if (!attStr) continue;
      try {
        const parsed = JSON.parse(attStr) as unknown;
        if (Array.isArray(parsed)) {
          for (const att of parsed) {
            if (typeof att === "object" && att !== null && (att as MessageAttachment).id === id) {
              return { employeeId: str(row.employee_id), attachment: att as MessageAttachment };
            }
          }
        }
      } catch {}
    }
    return null;
  }

  insertApproval(a: ApprovalRequest): void {
    this.db
      .prepare(
        `INSERT INTO approvals (id, employee_id, kind, tool_name, summary, input, status, decision, answers, can_approve_for_session, created_at, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.id,
        a.employeeId,
        a.kind,
        a.toolName,
        a.summary,
        JSON.stringify(a.input ?? null),
        a.status,
        a.decision,
        a.answers ? JSON.stringify(a.answers) : null,
        a.canApproveForSession ? 1 : 0,
        a.createdAt,
        a.decidedAt,
      );
  }

  updateApproval(a: ApprovalRequest): void {
    this.db
      .prepare("UPDATE approvals SET status = ?, decision = ?, answers = ?, decided_at = ? WHERE id = ?")
      .run(a.status, a.decision, a.answers ? JSON.stringify(a.answers) : null, a.decidedAt, a.id);
  }

  getApproval(id: string): ApprovalRequest | undefined {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
    return row ? toApproval(row) : undefined;
  }

  listPendingApprovals(): ApprovalRequest[] {
    return this.db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY seq").all().map(toApproval);
  }

  expirePendingApprovals(decidedAt: string): number {
    const result = this.db
      .prepare("UPDATE approvals SET status = 'expired', decided_at = ? WHERE status = 'pending'")
      .run(decidedAt);
    return Number(result.changes);
  }

  upsertProject(p: Project): void {
    this.db
      .prepare(
        "INSERT INTO projects (path, name, providers, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET name = excluded.name, providers = excluded.providers, last_seen_at = excluded.last_seen_at",
      )
      .run(p.path, p.name, JSON.stringify(p.providers), p.lastSeenAt);
  }

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY last_seen_at DESC, path ASC").all() as Row[];
    return rows.map((row) => toProject(row));
  }

  getMediaState(): MediaPlaybackState | null {
    const row = this.db.prepare("SELECT * FROM media_state WHERE id = 'office_tv'").get() as Row | undefined;
    if (row === undefined) return null;
    return toMediaPlaybackState(row);
  }

  setMediaState(state: MediaPlaybackState | null): void {
    if (state === null) {
      this.db.prepare("DELETE FROM media_state WHERE id = 'office_tv'").run();
      return;
    }
    this.db
      .prepare(
        `INSERT INTO media_state (id, provider, media_kind, source_url, embed_url, title, thumbnail_url, updated_at)
         VALUES ('office_tv', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           provider = excluded.provider,
           media_kind = excluded.media_kind,
           source_url = excluded.source_url,
           embed_url = excluded.embed_url,
           title = excluded.title,
           thumbnail_url = excluded.thumbnail_url,
           updated_at = excluded.updated_at`,
      )
      .run(state.provider, state.mediaKind, state.sourceUrl, state.embedUrl, state.title, state.thumbnailUrl, state.updatedAt);
  }

  insertMediaPreset(preset: MediaPreset): void {
    this.db
      .prepare(
        `INSERT INTO media_presets (id, provider, media_kind, source_url, embed_url, title, thumbnail_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(preset.id, preset.provider, preset.mediaKind, preset.sourceUrl, preset.embedUrl, preset.title, preset.thumbnailUrl, preset.createdAt);
  }

  listMediaPresets(): MediaPreset[] {
    const rows = this.db.prepare("SELECT * FROM media_presets ORDER BY created_at DESC, seq DESC").all() as Row[];
    return rows.map((row) => toMediaPreset(row));
  }

  deleteMediaPreset(id: string): boolean {
    const result = this.db.prepare("DELETE FROM media_presets WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  close(): void {
    this.db.close();
  }
}

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AgentAdapter,
  AgentMessage,
  AgentSink,
  ApprovalOutcome,
  ApprovalPrompt,
  UsageUpdate,
} from "../ports/agent-adapter.ts";
import type { CatalogProvider } from "../ports/catalog-provider.ts";
import type { EventBus } from "../ports/event-bus.ts";
import type { OfficeRepository } from "../ports/office-repository.ts";
import type { SessionCatalog } from "../ports/session-catalog.ts";
import type { TerminalGuard } from "../ports/terminal-guard.ts";
import { buildCatalog } from "../domain/catalog.ts";
import { generateName, generateSpecies, type RandomFn } from "../domain/names.ts";
import { isRateLimitErrorMessage } from "../../agents/usage-parser.ts";
import { isMediaProvider, parseMediaUrl, resolveMediaMetadata, type FetchLike, type MediaKind, type MediaPlaybackState, type MediaPreset, type MediaProvider } from "../domain/media.ts";
import { AttachmentStore, validateAndDecodeAttachments, type DecodedAttachment } from "./attachments.ts";
import {
  BOSSES,
  MAX_JOB_TITLE_LENGTH,
  MAX_NAME_LENGTH,
  OfficeError,
  isActiveStatus,
  isDecision,
  isSpecies,
  type ApprovalRequest,
  type Boss,
  type BossId,
  type BossUsage,
  type Catalog,
  type ClaudeSessionSummary,
  type Decision,
  type Employee,
  type EmployeeUsage,
  type ImportSkipReason,
  type Message,
  type MessageAttachment,
  type Project,
  type ProviderCatalog,
  type ProviderSyncStats,
  type Species,
  type StoredAttachment,
  type SyncSummary,
} from "../domain/types.ts";

export type OfficeDeps = {
  repository: OfficeRepository;
  /** Single Claude adapter shortcut (kept for backward compatibility with existing tests). */
  adapter?: AgentAdapter;
  /** Per-boss adapters; takes precedence over `adapter` when both are provided. */
  adapters?: Partial<Record<BossId, AgentAdapter>>;
  events: EventBus;
  now?: () => Date;
  newId?: () => string;
  /** Returns true when the path exists and is a directory. */
  isDirectory?: (path: string) => boolean;
  /** Existing provider sessions (import and catch-up). Without it, listing is empty and catch-up is skipped. */
  sessions?: SessionCatalog;
  /** Per-boss session catalogs for multi-provider sync. */
  sessionCatalogs?: Partial<Record<BossId, SessionCatalog>>;
  /** Source of randomness for generated names and species; injectable for deterministic tests. */
  random?: RandomFn;
  /** Reads a folder's commands and agents without an employee. Without it, catalogs come only from live sessions. */
  catalogProvider?: CatalogProvider;
  /** Optional display name overrides for boss suites (e.g. `{ gemini: "Antigravity" }`). */
  bossNames?: Partial<Record<BossId, string>>;
  /** Read-only view of the embedded terminals; chat is refused while one is active. */
  terminals?: TerminalGuard;
  attachmentsDir?: string;
  mediaFetch?: FetchLike;
};

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MAX_IMPORT_BATCH = 100;
const CATCH_UP_FAILED = "Earlier turns could not be loaded";

type PendingApproval = {
  employeeId: string;
  resolve: (outcome: ApprovalOutcome) => void;
};

type LiveSession = { active: boolean };

const SIGNAL_INTERRUPTED = "Session interrupted: the agent process was terminated. Send a message to resume.";

/** True when a failure reason says the agent process died from SIGINT/SIGTERM (exit code 130/143 or a signal message). */
export function isSignalTermination(reason: string): boolean {
  if (/exited with code (130|143)\b/i.test(reason)) return true;
  return /\b(terminated|killed)\b/i.test(reason) && /\bSIG(TERM|INT)\b/i.test(reason);
}

function defaultIsDirectory(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export class OfficeService {
  private shuttingDown = false;
  private readonly repository: OfficeRepository;
  private readonly adapters: Partial<Record<BossId, AgentAdapter>>;
  private readonly events: EventBus;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly isDirectory: (path: string) => boolean;
  private readonly catalogs: Partial<Record<BossId, SessionCatalog>>;
  private readonly catalog: SessionCatalog | undefined;
  private readonly random: RandomFn;
  private readonly catalogProvider: CatalogProvider | undefined;
  private readonly bossNames: Partial<Record<BossId, string>>;
  private readonly terminals: TerminalGuard | undefined;
  private readonly attachmentStore: AttachmentStore;
  private readonly mediaFetch: FetchLike | undefined;
  /** Catalogs per absolute folder; only successful reads are stored. */
  private readonly catalogCache = new Map<string, Catalog>();
  /** In-flight probes per folder, so concurrent requests share one. */
  private readonly probes = new Map<string, Promise<Catalog>>();
  /** Per-employee tail of in-flight message deliveries, so concurrent sends keep their order. */
  private readonly deliveries = new Map<string, Promise<unknown>>();

  /** Pending-approval registry: approvalId -> resolver of the agent's waiting promise. */
  private readonly pending = new Map<string, PendingApproval>();
  private readonly sessions = new Map<string, LiveSession>();

  constructor(deps: OfficeDeps) {
    this.repository = deps.repository;
    this.adapters = {
      ...(deps.adapter ? { claude: deps.adapter } : {}),
      ...(deps.adapters ?? {}),
    };
    this.events = deps.events;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.isDirectory = deps.isDirectory ?? defaultIsDirectory;
    this.catalogs = { ...(deps.sessions ? { claude: deps.sessions } : {}), ...(deps.sessionCatalogs ?? {}) };
    this.catalog = this.catalogs.claude;
    this.random = deps.random ?? Math.random;
    this.catalogProvider = deps.catalogProvider;
    this.bossNames = deps.bossNames ?? {};
    this.terminals = deps.terminals;
    this.attachmentStore = new AttachmentStore(deps.attachmentsDir ?? path.join(os.tmpdir(), "virtualoffice-attachments"));
    this.mediaFetch = deps.mediaFetch;
  }

  subscribe(listener: Parameters<EventBus["subscribe"]>[0]): () => void {
    return this.events.subscribe(listener);
  }

  /** Publishes whether an employee's embedded terminal currently holds its session. */
  notifyTerminal(employeeId: string, active: boolean): void {
    this.events.publish({ type: "terminal_updated", employeeId, active });
  }

  private readonly bossUsage = new Map<BossId, BossUsage>();
  private readonly employeeUsage = new Map<string, EmployeeUsage>();
  private readonly bossBreaks = new Map<
    BossId,
    { reason: string; until: string | null; timer?: ReturnType<typeof setTimeout> }
  >();

  // ---- queries ----

  private getActiveBreak(bossId: BossId): { reason: string; until: string | null } | null {
    const active = this.bossBreaks.get(bossId);
    if (!active) return null;
    if (active.until !== null) {
      const untilMs = Date.parse(active.until);
      if (Number.isFinite(untilMs) && untilMs <= this.now().getTime()) {
        this.clearBreakState(bossId);
        return null;
      }
    }
    return { reason: active.reason, until: active.until };
  }

  private clearBreakState(bossId: BossId): void {
    const existing = this.bossBreaks.get(bossId);
    if (existing?.timer) clearTimeout(existing.timer);
    this.bossBreaks.delete(bossId);
    for (const employee of this.repository.listEmployees()) {
      if (employee.bossId === bossId && employee.status === "on_break") {
        this.setStatus(employee.id, "idle", { failureReason: null });
      }
    }
    this.events.publish({ type: "boss_updated", boss: this.buildBoss(bossId) });
  }

  private triggerProviderBreak(bossId: BossId, reason: string, until: string | null): void {
    const existing = this.bossBreaks.get(bossId);
    if (existing?.timer) clearTimeout(existing.timer);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (until !== null) {
      const delayMs = Date.parse(until) - this.now().getTime();
      if (Number.isFinite(delayMs) && delayMs > 0) {
        timer = setTimeout(() => {
          this.clearBreakState(bossId);
        }, Math.min(delayMs, 2_147_483_647));
        timer.unref?.();
      }
    }
    this.bossBreaks.set(bossId, { reason, until, ...(timer ? { timer } : {}) });

    const adapter = this.adapterFor(bossId);
    for (const employee of this.repository.listEmployees()) {
      if (employee.bossId !== bossId || employee.status === "stopped") continue;
      const live = this.sessions.get(employee.id);
      if (live) {
        live.active = false;
        this.sessions.delete(employee.id);
        this.expireApprovalsOf(employee.id);
        if (adapter) void adapter.stop(employee.id).catch(() => {});
      }
      if (employee.status !== "on_break" || employee.failureReason !== reason) {
        this.setStatus(employee.id, "on_break", { failureReason: reason });
      }
    }
    this.events.publish({ type: "boss_updated", boss: this.buildBoss(bossId) });
  }

  /** Manually ends a provider's break and restores resting employees to idle. */
  resumeBoss(bossIdInput: string): Boss {
    const base = BOSSES.find((b) => b.id === bossIdInput);
    if (!base) throw new OfficeError("not_found", `Unknown boss: ${bossIdInput}`);
    this.clearBreakState(base.id);
    return this.buildBoss(base.id);
  }

  private getOrCreateBossUsage(bossId: BossId): BossUsage {
    const existing = this.bossUsage.get(bossId);
    if (existing) return existing;
    const initial: BossUsage = {
      remainingPercent: null,
      utilizationPercent: null,
      resetsAt: null,
      windowLabel: null,
      inputTokens: 0,
      outputTokens: 0,
      updatedAt: null,
    };
    this.bossUsage.set(bossId, initial);
    return initial;
  }

  private decorateEmployee(employee: Employee): Employee {
    const usage = this.employeeUsage.get(employee.id);
    return usage ? { ...employee, usage } : employee;
  }

  private buildBoss(bossId: BossId): Boss {
    const base = BOSSES.find((b) => b.id === bossId)!;
    const activeBreak = this.getActiveBreak(bossId);
    return {
      ...base,
      name: this.bossNames[bossId] ?? base.name,
      available: Boolean(this.adapters[bossId]),
      usage: { ...this.getOrCreateBossUsage(bossId) },
      onBreak: Boolean(activeBreak),
      breakUntil: activeBreak?.until ?? null,
      breakReason: activeBreak?.reason ?? null,
    };
  }

  listBosses(): Boss[] {
    return BOSSES.map((boss) => this.buildBoss(boss.id));
  }

  private adapterFor(bossId: BossId): AgentAdapter | undefined {
    return this.adapters[bossId];
  }

  getState(): {
    bosses: Boss[];
    employees: Employee[];
    approvals: ApprovalRequest[];
    activeTerminals: string[];
    projects: Project[];
    media: MediaPlaybackState | null;
    mediaPresets: MediaPreset[];
  } {
    return {
      bosses: this.listBosses(),
      employees: this.repository.listEmployees().map((e) => this.decorateEmployee(e)),
      approvals: this.repository.listPendingApprovals(),
      activeTerminals: this.terminals?.listActive() ?? [],
      projects: this.repository.listProjects(),
      media: this.repository.getMediaState(),
      mediaPresets: this.repository.listMediaPresets(),
    };
  }

  getMedia(): { media: MediaPlaybackState | null; presets: MediaPreset[] } {
    return {
      media: this.repository.getMediaState(),
      presets: this.repository.listMediaPresets(),
    };
  }

  private async resolveMediaInput(input: { url: unknown; provider?: unknown; title?: unknown }): Promise<{
    provider: MediaProvider;
    mediaKind: MediaKind;
    canonicalUrl: string;
    embedUrl: string;
    title: string;
    thumbnailUrl: string | null;
  }> {
    if (typeof input.url !== "string") {
      throw new OfficeError("validation_error", "Media URL is required", "url");
    }
    const url = input.url;

    let expectedProvider: MediaProvider | undefined;
    if (input.provider !== undefined && input.provider !== null && input.provider !== "") {
      if (!isMediaProvider(input.provider)) {
        throw new OfficeError("validation_error", "Unsupported media provider", "provider");
      }
      expectedProvider = input.provider;
    }

    let customTitle: string | undefined;
    if (input.title !== undefined && input.title !== null) {
      if (typeof input.title !== "string") {
        throw new OfficeError("validation_error", "Title must be a string", "title");
      }
      const trimmed = input.title.trim();
      if (trimmed.length > 0) {
        customTitle = trimmed.slice(0, 160);
      }
    }

    const parsed = parseMediaUrl(url, expectedProvider);
    if (!parsed.ok) {
      throw new OfficeError("validation_error", parsed.error, "url");
    }

    const meta = await resolveMediaMetadata(parsed.value, this.mediaFetch ? { fetchImpl: this.mediaFetch } : undefined);

    return {
      provider: parsed.value.provider,
      mediaKind: parsed.value.mediaKind,
      canonicalUrl: parsed.value.canonicalUrl,
      embedUrl: parsed.value.embedUrl,
      title: customTitle || meta.title,
      thumbnailUrl: meta.thumbnailUrl,
    };
  }

  async setMediaPlayback(input: { url: unknown; provider?: unknown; title?: unknown }): Promise<MediaPlaybackState> {
    const resolved = await this.resolveMediaInput(input);
    const state: MediaPlaybackState = {
      provider: resolved.provider,
      mediaKind: resolved.mediaKind,
      sourceUrl: resolved.canonicalUrl,
      embedUrl: resolved.embedUrl,
      title: resolved.title,
      thumbnailUrl: resolved.thumbnailUrl,
      updatedAt: this.now().toISOString(),
    };
    this.repository.setMediaState(state);
    this.events.publish({ type: "media_updated", media: state });
    return state;
  }

  clearMediaPlayback(): null {
    this.repository.setMediaState(null);
    this.events.publish({ type: "media_updated", media: null });
    return null;
  }

  async addMediaPreset(input: { url: unknown; provider?: unknown; title?: unknown }): Promise<{ preset: MediaPreset; presets: MediaPreset[] }> {
    const resolved = await this.resolveMediaInput(input);
    const preset: MediaPreset = {
      id: this.newId(),
      provider: resolved.provider,
      mediaKind: resolved.mediaKind,
      sourceUrl: resolved.canonicalUrl,
      embedUrl: resolved.embedUrl,
      title: resolved.title,
      thumbnailUrl: resolved.thumbnailUrl,
      createdAt: this.now().toISOString(),
    };
    this.repository.insertMediaPreset(preset);
    const presets = this.repository.listMediaPresets();
    this.events.publish({ type: "media_presets_updated", presets });
    return { preset, presets };
  }

  deleteMediaPreset(id: string): { deleted: true; presets: MediaPreset[] } {
    if (!this.repository.deleteMediaPreset(id)) {
      throw new OfficeError("not_found", `Media preset not found: ${id}`);
    }
    const presets = this.repository.listMediaPresets();
    this.events.publish({ type: "media_presets_updated", presets });
    return { deleted: true, presets };
  }

  listMessages(employeeId: string): Message[] {
    this.requireEmployee(employeeId);
    return this.repository.listMessages(employeeId);
  }

  async listMessagesWithCatchUp(employeeId: string): Promise<Message[]> {
    const employee = this.requireEmployee(employeeId);
    if (!this.sessions.get(employeeId)?.active || !this.adapterFor(employee.bossId)?.hasSession(employeeId)) {
      await this.catchUp(employee);
    }
    return this.repository.listMessages(employeeId);
  }

  async syncProviders(): Promise<SyncSummary> {
    const existingProjects = new Map<string, Project>(
      this.repository.listProjects().map((p) => [p.path, p]),
    );
    const existingSessions = new Set<string>(
      this.repository
        .listEmployees()
        .filter((e) => e.providerSessionId !== null)
        .map((e) => `${e.bossId}:${e.providerSessionId}`),
    );
    let projectsChanged = false;
    let projectsAdded = 0;
    let sessionsImported = 0;
    let sessionsRemoved = 0;
    let skipped = 0;
    const providers: Partial<Record<BossId, ProviderSyncStats>> = {};

    const upsertDiscoveredProject = (
      rawPath: string,
      fallbackName: string,
      bossId: BossId,
      lastModifiedMs: number,
    ): boolean => {
      const resolved = path.resolve(rawPath);
      if (!this.isDirectory(resolved)) return false;
      const seenIso = lastModifiedMs > 0 ? new Date(lastModifiedMs).toISOString() : this.timestamp();
      const existing = existingProjects.get(resolved);
      if (!existing) {
        const next: Project = {
          path: resolved,
          name: fallbackName || path.basename(resolved) || resolved,
          providers: [bossId],
          lastSeenAt: seenIso,
        };
        this.repository.upsertProject(next);
        existingProjects.set(resolved, next);
        projectsChanged = true;
        return true;
      }
      const nextProviders = existing.providers.includes(bossId)
        ? existing.providers
        : [...existing.providers, bossId];
      const existingSeen = Date.parse(existing.lastSeenAt);
      const seen = Date.parse(seenIso);
      const lastSeenAt =
        Number.isNaN(existingSeen) || (!Number.isNaN(seen) && seen > existingSeen)
          ? seenIso
          : existing.lastSeenAt;
      const changed = nextProviders !== existing.providers || lastSeenAt !== existing.lastSeenAt;
      if (changed) {
        const next: Project = { ...existing, providers: nextProviders, lastSeenAt };
        this.repository.upsertProject(next);
        existingProjects.set(resolved, next);
        projectsChanged = true;
      }
      return false;
    };

    for (const [bossId, catalog] of Object.entries(this.catalogs) as [BossId, SessionCatalog][]) {
      const stats: ProviderSyncStats = { projectsAdded: 0, sessionsImported: 0, sessionsRemoved: 0, skipped: 0, error: null };
      try {
        if (catalog.listProjects) {
          for (const p of await catalog.listProjects()) {
            if (upsertDiscoveredProject(p.path, p.name, bossId, p.lastModified)) {
              stats.projectsAdded += 1;
              projectsAdded += 1;
            }
          }
        }
        const seenSessionIds = new Set<string>();
        for (const s of await catalog.list()) {
          seenSessionIds.add(s.sessionId);
          if (!s.cwd || !this.isDirectory(s.cwd)) {
            stats.skipped += 1;
            skipped += 1;
            continue;
          }
          const resolvedCwd = path.resolve(s.cwd);
          if (upsertDiscoveredProject(resolvedCwd, path.basename(resolvedCwd) || resolvedCwd, bossId, s.lastModified)) {
            stats.projectsAdded += 1;
            projectsAdded += 1;
          }
          const key = `${bossId}:${s.sessionId}`;
          if (existingSessions.has(key)) {
            stats.skipped += 1;
            skipped += 1;
            continue;
          }
          const nowIso = this.timestamp();
          const employee: Employee = {
            id: this.newId(),
            bossId,
            hiredBy: null,
            task: s.title,
            workingDirectory: resolvedCwd,
            name: this.nextName(),
            species: generateSpecies(this.random),
            importedAt: nowIso,
            role: null,
            jobTitle: null,
            providerSessionId: s.sessionId,
            status: "idle",
            failureReason: null,
            createdAt: s.createdAt && s.createdAt > 0 ? new Date(s.createdAt).toISOString() : nowIso,
            updatedAt: s.lastModified > 0 ? new Date(s.lastModified).toISOString() : nowIso,
          };
          this.repository.insertEmployee(employee);
          existingSessions.add(key);
          this.events.publish({ type: "employee_updated", employee: this.decorateEmployee(employee) });
          stats.sessionsImported += 1;
          sessionsImported += 1;
        }

        // Prune stale employees for this boss (only when stats.error === null)
        const employeesForBoss = this.repository.listEmployees().filter(
          (e) => e.bossId === bossId && e.providerSessionId !== null && !seenSessionIds.has(e.providerSessionId) && !this.sessions.get(e.id)?.active
        );
        for (const stale of employeesForBoss) {
          this.expireApprovalsOf(stale.id);
          this.repository.deleteEmployee(stale.id);
          this.attachmentStore.removeEmployeeDir(stale.id);
          this.events.publish({ type: "employee_removed", employeeId: stale.id });
          stats.sessionsRemoved = (stats.sessionsRemoved ?? 0) + 1;
          sessionsRemoved += 1;
        }
      } catch (error) {
        stats.error = errorReason(error);
      }
      providers[bossId] = stats;
    }

    if (projectsChanged) {
      this.events.publish({ type: "projects_updated", projects: this.repository.listProjects() });
    }

    return { projectsAdded, sessionsImported, sessionsRemoved, skipped, providers };
  }

  /** Commands and agents of a folder: cached, or probed on a miss or when `refresh` is true. */
  async getCatalog(query: { workingDirectory?: unknown; refresh?: unknown }): Promise<Catalog> {
    const folder = this.requireFolder(query.workingDirectory);
    return this.folderCatalog(folder, parseRefresh(query.refresh));
  }

  /** An employee's catalog: the live session's lists when it has one, else its folder's. */
  async getEmployeeCatalog(employeeId: string, query: { refresh?: unknown }): Promise<Catalog> {
    const employee = this.requireEmployee(employeeId);
    const refresh = parseRefresh(query.refresh);
    const adapter = this.adapterFor(employee.bossId);
    if (this.sessions.get(employeeId)?.active && adapter) {
      const live = await adapter.fetchCatalog(employeeId);
      if (live) return this.cacheCatalog(employee.workingDirectory, live);
    }
    if (!this.isDirectory(employee.workingDirectory)) {
      throw new OfficeError("catalog_unavailable", `Project folder not found: ${employee.workingDirectory}`);
    }
    return this.folderCatalog(path.resolve(employee.workingDirectory), refresh);
  }

  /** Existing Claude sessions, filtered by `q` over title and folder, newest first, then paged. */
  async listClaudeSessions(query: {
    q?: unknown;
    limit?: unknown;
    offset?: unknown;
  }): Promise<{ sessions: ClaudeSessionSummary[]; total: number }> {
    const limit = parseCount(query.limit, "limit", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const offset = parseCount(query.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
    if (query.q !== undefined && typeof query.q !== "string") {
      throw new OfficeError("validation_error", "q must be a string", "q");
    }
    const needle = (query.q ?? "").trim().toLowerCase();
    const all = this.catalog ? await this.catalog.list() : [];
    const imported = this.importedSessionIds();
    const matching = all
      .filter((s) => needle === "" || s.title.toLowerCase().includes(needle) || (s.cwd ?? "").toLowerCase().includes(needle))
      .sort((a, b) => b.lastModified - a.lastModified);
    return {
      total: matching.length,
      sessions: matching.slice(offset, offset + limit).map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        lastModified: new Date(s.lastModified).toISOString(),
        createdAt: s.createdAt === null ? null : new Date(s.createdAt).toISOString(),
        alreadyImported: imported.has(s.sessionId),
      })),
    };
  }

  /** Creates one employee per chosen session, with its history. Only reads from the provider. */
  async importClaudeSessions(
    sessionIds: unknown,
  ): Promise<{ imported: Employee[]; skipped: { sessionId: string; reason: ImportSkipReason }[] }> {
    if (
      !Array.isArray(sessionIds) ||
      sessionIds.length < 1 ||
      sessionIds.length > MAX_IMPORT_BATCH ||
      sessionIds.some((id) => typeof id !== "string" || id === "")
    ) {
      throw new OfficeError("validation_error", `sessionIds must list 1-${MAX_IMPORT_BATCH} session ids`, "sessionIds");
    }
    const catalog = this.catalog;
    let known: Map<string, Awaited<ReturnType<SessionCatalog["list"]>>[number]> | null = null;
    if (catalog) {
      try {
        known = new Map((await catalog.list()).map((s) => [s.sessionId, s]));
      } catch {
        known = null;
      }
    }
    const imported: Employee[] = [];
    const skipped: { sessionId: string; reason: ImportSkipReason }[] = [];
    for (const sessionId of sessionIds as string[]) {
      if (this.importedSessionIds().has(sessionId)) {
        skipped.push({ sessionId, reason: "already_imported" });
        continue;
      }
      if (!catalog || !known) {
        skipped.push({ sessionId, reason: "read_failed" });
        continue;
      }
      const info = known.get(sessionId);
      if (!info) {
        skipped.push({ sessionId, reason: "not_found" });
        continue;
      }
      if (!info.cwd) {
        skipped.push({ sessionId, reason: "missing_cwd" });
        continue;
      }
      let history;
      try {
        history = await catalog.history(sessionId);
      } catch {
        skipped.push({ sessionId, reason: "read_failed" });
        continue;
      }
      const timestamp = this.timestamp();
      const folderExists = this.isDirectory(info.cwd);
      const employee: Employee = {
        id: this.newId(),
        bossId: "claude",
        hiredBy: null,
        task: info.title,
        workingDirectory: info.cwd,
        name: this.nextName(),
        species: generateSpecies(this.random),
        importedAt: timestamp,
        role: null,
        jobTitle: null,
        providerSessionId: sessionId,
        status: folderExists ? "idle" : "failed",
        failureReason: folderExists ? null : `Project folder not found: ${info.cwd}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.repository.insertEmployee(employee);
      // History is stored silently: clients load it when the employee is opened.
      for (const entry of history) this.repository.insertMessage(this.buildMessage(employee.id, entry));
      this.events.publish({ type: "employee_updated", employee });
      imported.push(employee);
    }
    return { imported, skipped };
  }

  // ---- commands ----

  /**
   * Hire as the HTTP layer receives it: a role is checked against the folder's agents (probing when
   * the catalog is not cached) before anyone is created; every other rule is checked first.
   */
  async hireFromRequest(input: HireInput): Promise<Employee> {
    this.validateHire(input);
    const role = parseRole(input.role);
    if (role !== null && input.bossId !== "claude") {
      throw new OfficeError("validation_error", "Roles are only supported for Claude employees", "role");
    }
    if (role !== null) {
      const catalog = await this.folderCatalog(path.resolve(input.workingDirectory as string), false);
      if (!catalog.agents.some((agent) => agent.name === role)) {
        throw new OfficeError("validation_error", `Unknown role: ${role}`, "role");
      }
    }
    return this.hire(input);
  }

  hire(input: HireInput): Employee {
    const { boss, task, workingDirectory } = this.validateHire(input);
    const role = parseRole(input.role);
    const jobTitle = parseJobTitle(input.jobTitle);
    const name = input.name === undefined ? this.nextName() : parseName(input.name);
    const species = input.species === undefined ? generateSpecies(this.random) : parseSpecies(input.species);
    const timestamp = this.timestamp();
    const employee: Employee = {
      id: this.newId(),
      bossId: boss.id,
      hiredBy: null,
      task,
      workingDirectory,
      name,
      species,
      importedAt: null,
      role,
      jobTitle,
      providerSessionId: null,
      status: "starting",
      failureReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.repository.insertEmployee(employee);
    this.events.publish({ type: "employee_updated", employee });
    this.appendMessage(employee.id, { kind: "user_text", content: task });
    this.openSession(employee, task);
    return this.requireEmployee(employee.id);
  }

  /** Checks the rules every hire shares and returns the parsed values. */
  private validateHire(input: HireInput): { boss: Boss; task: string; workingDirectory: string } {
    const boss = this.listBosses().find((candidate) => candidate.id === input.bossId);
    if (!boss) throw new OfficeError("validation_error", "Unknown boss", "bossId");
    if (!boss.available) throw new OfficeError("boss_unavailable", `${boss.name} is not available yet`);
    const activeBreak = this.getActiveBreak(boss.id);
    if (activeBreak) {
      throw new OfficeError("provider_on_break", `${boss.name} is on break: ${activeBreak.reason}`);
    }
    if (typeof input.task !== "string" || input.task.trim() === "") {
      throw new OfficeError("validation_error", "Task must not be empty", "task");
    }
    return { boss, task: input.task.trim(), workingDirectory: this.requireFolder(input.workingDirectory) };
  }

  /** Renames an employee, changes its species, and/or updates its job title. Nothing changes when any value is invalid. */
  updateProfile(
    employeeId: string,
    input: { name?: unknown; species?: unknown; jobTitle?: unknown },
  ): Employee {
    this.requireEmployee(employeeId);
    if (input.name === undefined && input.species === undefined && input.jobTitle === undefined) {
      throw new OfficeError("validation_error", "Provide a name, species, or job title", "name");
    }
    const patch: Partial<Employee> = {};
    if (input.name !== undefined) patch.name = parseName(input.name);
    if (input.species !== undefined) patch.species = parseSpecies(input.species);
    if (input.jobTitle !== undefined) patch.jobTitle = parseJobTitle(input.jobTitle);
    return this.patchEmployee(employeeId, patch);
  }

  /** Startup: gives every employee created before names existed a generated name and species. */
  backfillProfiles(): number {
    let updated = 0;
    for (const employee of this.repository.listEmployees()) {
      if (employee.name.trim() !== "") continue;
      this.repository.updateEmployee({
        ...employee,
        name: this.nextName(),
        species: generateSpecies(this.random),
        updatedAt: this.timestamp(),
      });
      updated += 1;
    }
    return updated;
  }

  async sendMessage(employeeId: string, rawText: unknown, rawAttachments?: unknown): Promise<Message> {
    const employee = this.requireEmployee(employeeId);
    if (this.terminals?.isActive(employeeId)) {
      throw new OfficeError("terminal_active", "The embedded terminal holds this session. End it before chatting.");
    }
    const activeBreak = this.getActiveBreak(employee.bossId);
    if (activeBreak) {
      const bossName = this.buildBoss(employee.bossId).name;
      throw new OfficeError("provider_on_break", `${bossName} is on break: ${activeBreak.reason}`);
    }
    if (rawText !== undefined && rawText !== null && typeof rawText !== "string") {
      throw new OfficeError("validation_error", "Message text must be a string", "text");
    }
    const text = typeof rawText === "string" ? rawText.trim() : "";
    const decoded = validateAndDecodeAttachments(rawAttachments);
    if (text === "" && decoded.length === 0) {
      throw new OfficeError("validation_error", "Message cannot be empty", "text");
    }
    const adapter = this.adapterFor(employee.bossId);
    if (!adapter) {
      throw new OfficeError("boss_unavailable", `Boss ${employee.bossId} is not available`);
    }
    const isLive = Boolean(this.sessions.get(employeeId)?.active && adapter.hasSession(employeeId));
    if (!isLive && !this.isDirectory(employee.workingDirectory)) {
      throw new OfficeError(
        "working_directory_missing",
        `Project folder not found: ${employee.workingDirectory}`,
      );
    }
    const stored = this.attachmentStore.saveAll(employeeId, decoded, () => this.newId());

    const previous = this.deliveries.get(employeeId) ?? Promise.resolve();
    const run = previous.then(() => this.deliver(employeeId, text, stored));
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.deliveries.set(employeeId, tail);
    void tail.then(() => {
      if (this.deliveries.get(employeeId) === tail) this.deliveries.delete(employeeId);
    });
    return run;
  }

  private async deliver(employeeId: string, text: string, stored: StoredAttachment[]): Promise<Message> {
    const employee = this.requireEmployee(employeeId);
    const adapter = this.adapterFor(employee.bossId)!;
    const publicAttachments: MessageAttachment[] = stored.map(({ id, name, mimeType, size, url }) => ({
      id,
      name,
      mimeType,
      size,
      url,
    }));

    if (this.sessions.get(employeeId)?.active && adapter.sendMessage(employeeId, text, stored)) {
      const message = this.appendMessage(employeeId, { kind: "user_text", content: text }, publicAttachments);
      if (employee.status === "idle") this.setStatus(employeeId, "working");
      return message;
    }
    const stale = this.sessions.get(employeeId);
    if (stale) stale.active = false;
    // No live session: reopen the stored one (or start fresh if none was ever recorded).
    this.setStatus(employeeId, "working", { failureReason: null });
    await this.catchUp(this.requireEmployee(employeeId));
    const message = this.appendMessage(employeeId, { kind: "user_text", content: text }, publicAttachments);
    this.openSession(this.requireEmployee(employeeId), text, employee.providerSessionId ?? undefined, stored);
    return message;
  }

  async stop(employeeId: string): Promise<Employee> {
    const employee = this.requireEmployee(employeeId);
    if (!isActiveStatus(employee.status)) return employee;
    const session = this.sessions.get(employeeId);
    if (session) session.active = false;
    this.expireApprovalsOf(employeeId);
    try {
      await this.adapterFor(employee.bossId)?.stop(employeeId);
    } finally {
      this.sessions.delete(employeeId);
    }
    return this.setStatus(employeeId, "stopped");
  }

  async deleteEmployee(employeeId: string): Promise<{ deleted: true; providerDeleted: boolean }> {
    const employee = this.requireEmployee(employeeId);
    await this.stop(employeeId);
    if (this.terminals && typeof (this.terminals as unknown as { kill?: (id: string) => void }).kill === "function") {
      try {
        (this.terminals as unknown as { kill: (id: string) => void }).kill(employeeId);
      } catch {}
    }
    this.expireApprovalsOf(employeeId);

    let providerDeleted = false;
    if (employee.providerSessionId) {
      const catalog = this.catalogs[employee.bossId];
      if (catalog && typeof catalog.deleteSession === "function") {
        try {
          providerDeleted = Boolean(await catalog.deleteSession(employee.providerSessionId));
        } catch {
          providerDeleted = false;
        }
      }
    }

    this.repository.deleteEmployee(employeeId);
    this.attachmentStore.removeEmployeeDir(employeeId);
    this.events.publish({ type: "employee_removed", employeeId });
    return { deleted: true, providerDeleted };
  }

  decide(approvalId: string, input: { decision: unknown; answers?: unknown }): ApprovalRequest {
    if (!isDecision(input.decision)) {
      throw new OfficeError("validation_error", "Unknown decision", "decision");
    }
    const decision: Decision = input.decision;
    const stored = this.repository.getApproval(approvalId);
    if (!stored) throw new OfficeError("not_found", "Approval not found");
    const waiting = this.pending.get(approvalId);
    if (stored.status !== "pending" || !waiting) {
      throw new OfficeError("approval_not_pending", "Approval is no longer pending");
    }
    if (decision === "approve_for_session" && !stored.canApproveForSession) {
      throw new OfficeError("validation_error", "Approve for session is not available for this request", "decision");
    }
    let answers: Record<string, string> | null = null;
    if (stored.kind === "question" && decision !== "reject") {
      answers = parseAnswers(input.answers);
      if (!answers) throw new OfficeError("validation_error", "Question requests need answers", "answers");
    }
    const updated: ApprovalRequest = {
      ...stored,
      status: decision === "reject" ? "rejected" : "approved",
      decision,
      answers,
      decidedAt: this.timestamp(),
    };
    this.repository.updateApproval(updated);
    this.pending.delete(approvalId);
    this.events.publish({ type: "approval_updated", approval: updated });
    this.resumeWorkingIfUnblocked(stored.employeeId);
    waiting.resolve(decision === "reject" ? { decision } : { decision, ...(answers ? { answers } : {}) });
    return updated;
  }

  /** Startup recovery: interrupted employees become stopped and pending approvals expire. */
  recoverOnStartup(): { stopped: number; expired: number } {
    let stopped = 0;
    for (const employee of this.repository.listEmployees()) {
      if (isActiveStatus(employee.status)) {
        this.repository.updateEmployee({ ...employee, status: "stopped", updatedAt: this.timestamp() });
        stopped += 1;
      }
    }
    const expired = this.repository.expirePendingApprovals(this.timestamp());
    return { stopped, expired };
  }

  /** Marks the server as shutting down so agent process deaths are not reported as failures. */
  beginShutdown(): void {
    this.shuttingDown = true;
  }

  /** Server shutdown: expire every pending request (agents get deny) and stop live sessions. */
  async shutdown(): Promise<void> {
    this.beginShutdown();
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      try {
        await this.stop(id);
      } catch {
        // keep shutting down the rest
      }
    }
    for (const id of [...this.pending.keys()]) this.expire(id);
    for (const entry of this.bossBreaks.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.bossBreaks.clear();
  }

  /**
   * Before resuming, appends the stored-session turns this office has not seen (made in a terminal),
   * in order. A failure to read adds a system note and the resume continues.
   */
  private async catchUp(employee: Employee): Promise<void> {
    const catalog = this.catalogs[employee.bossId];
    const sessionId = employee.providerSessionId;
    if (!sessionId || !catalog) return;
    const stored = this.repository.listMessages(employee.id);
    const storedUuids = new Set(stored.flatMap((m) => (m.sourceUuid ? [m.sourceUuid] : [])));
    // Without any provider uuid on record (a pre-import employee), a diff would re-add everything.
    if (!employee.importedAt && storedUuids.size === 0) return;
    let history;
    try {
      history = await catalog.history(sessionId);
    } catch {
      this.appendMessage(employee.id, { kind: "system", content: CATCH_UP_FAILED });
      return;
    }
    // Owner messages sent from the office are stored without a uuid; claim their echo instead of duplicating it.
    const unnumbered = stored.filter((m) => m.kind === "user_text" && !m.sourceUuid);
    const claimed = new Set<string>();
    for (const entry of history) {
      const uuid = entry.sourceUuid ?? null;
      if (uuid && (storedUuids.has(uuid) || claimed.has(uuid))) continue;
      if (uuid && entry.kind === "user_text") {
        const index = unnumbered.findIndex((m) => m.content === entry.content);
        if (index >= 0) {
          this.repository.setMessageSourceUuid(unnumbered[index]!.id, uuid);
          unnumbered.splice(index, 1);
          claimed.add(uuid);
          continue;
        }
      }
      this.appendMessage(employee.id, entry);
    }
  }

  private importedSessionIds(): Set<string> {
    const ids = new Set<string>();
    for (const employee of this.repository.listEmployees()) {
      if (employee.providerSessionId) ids.add(employee.providerSessionId);
    }
    return ids;
  }

  private nextName(): string {
    return generateName(this.repository.listEmployees().map((e) => e.name), this.random);
  }

  // ---- session plumbing ----

  private openSession(employee: Employee, prompt: string, resume?: string, attachments?: StoredAttachment[]): void {
    const session: LiveSession = { active: true };
    this.sessions.set(employee.id, session);
    const sink = this.createSink(employee.id, session);
    const adapter = this.adapterFor(employee.bossId);
    if (!adapter) {
      sink.onFailed(`Boss ${employee.bossId} is not available`);
      return;
    }
    try {
      adapter.start(
        {
          employee,
          prompt,
          ...(resume ? { resume } : {}),
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        },
        sink,
      );
    } catch (error) {
      sink.onFailed(errorReason(error));
    }
  }

  private createSink(employeeId: string, session: LiveSession): AgentSink {
    return {
      onSessionStarted: (providerSessionId) => {
        if (!session.active) return;
        this.patchEmployee(employeeId, { providerSessionId });
        const current = this.repository.getEmployee(employeeId);
        if (current?.status === "starting") this.setStatus(employeeId, "working");
      },
      onMessage: (message) => {
        if (!session.active) return;
        this.appendMessage(employeeId, message);
      },
      onDelta: (text) => {
        if (!session.active) return;
        this.events.publish({ type: "message_delta", employeeId, text });
      },
      onTurnFinished: () => {
        if (!session.active) return;
        const current = this.repository.getEmployee(employeeId);
        if (current && (current.status === "working" || current.status === "starting")) {
          this.setStatus(employeeId, "idle");
        }
      },
      onFailed: (reason) => {
        if (!session.active) return;
        session.active = false;
        this.sessions.delete(employeeId);
        this.expireApprovalsOf(employeeId);
        if (this.shuttingDown) {
          this.setStatus(employeeId, "stopped");
          return;
        }
        if (isSignalTermination(reason)) {
          this.appendMessage(employeeId, { kind: "system", content: SIGNAL_INTERRUPTED });
          this.setStatus(employeeId, "stopped");
          return;
        }
        if (isRateLimitErrorMessage(reason)) {
          const employee = this.repository.getEmployee(employeeId);
          this.appendMessage(employeeId, {
            kind: "system",
            content: `Provider reached its usage limit — on break: ${reason}`,
          });
          if (employee) {
            const until = this.bossUsage.get(employee.bossId)?.resetsAt ?? null;
            this.triggerProviderBreak(employee.bossId, reason, until);
          }
          return;
        }
        this.appendMessage(employeeId, { kind: "system", content: `Employee failed: ${reason}` });
        this.setStatus(employeeId, "failed", { failureReason: reason });
      },
      onCatalog: (catalog) => {
        if (!session.active) return;
        const employee = this.repository.getEmployee(employeeId);
        if (employee) this.cacheCatalog(employee.workingDirectory, catalog);
      },
      onUsage: (update) => {
        if (!session.active) return;
        this.recordUsage(employeeId, update);
      },
      requestApproval: (prompt, signal) => this.requestApproval(employeeId, session, prompt, signal),
    };
  }

  private requestApproval(
    employeeId: string,
    session: LiveSession,
    prompt: ApprovalPrompt,
    signal: AbortSignal,
  ): Promise<ApprovalOutcome> {
    if (!session.active || signal.aborted) return Promise.resolve({ decision: "expired" });
    const approval: ApprovalRequest = {
      id: this.newId(),
      employeeId,
      kind: prompt.kind,
      toolName: prompt.toolName,
      summary: prompt.summary,
      input: prompt.input,
      status: "pending",
      decision: null,
      answers: null,
      canApproveForSession: prompt.canApproveForSession,
      createdAt: this.timestamp(),
      decidedAt: null,
    };
    return new Promise<ApprovalOutcome>((resolve) => {
      this.repository.insertApproval(approval);
      this.pending.set(approval.id, { employeeId, resolve });
      signal.addEventListener("abort", () => this.expire(approval.id), { once: true });
      this.events.publish({ type: "approval_requested", approval });
      this.setStatus(employeeId, "waiting_approval");
    });
  }

  /** Resolves a pending request as expired (the agent receives deny). */
  private expire(approvalId: string): void {
    const waiting = this.pending.get(approvalId);
    if (!waiting) return;
    this.pending.delete(approvalId);
    const stored = this.repository.getApproval(approvalId);
    if (stored && stored.status === "pending") {
      const expired: ApprovalRequest = { ...stored, status: "expired", decidedAt: this.timestamp() };
      this.repository.updateApproval(expired);
      this.events.publish({ type: "approval_updated", approval: expired });
    }
    this.resumeWorkingIfUnblocked(waiting.employeeId);
    waiting.resolve({ decision: "expired" });
  }

  private expireApprovalsOf(employeeId: string): void {
    for (const [id, waiting] of [...this.pending]) {
      if (waiting.employeeId === employeeId) this.expire(id);
    }
  }

  private resumeWorkingIfUnblocked(employeeId: string): void {
    const stillWaiting = [...this.pending.values()].some((entry) => entry.employeeId === employeeId);
    const employee = this.repository.getEmployee(employeeId);
    if (!stillWaiting && employee?.status === "waiting_approval" && this.sessions.get(employeeId)?.active) {
      this.setStatus(employeeId, "working");
    }
  }

  // ---- helpers ----

  /** The folder as an absolute path, or a validation error when it is not an existing directory. */
  private requireFolder(value: unknown): string {
    if (typeof value !== "string" || !this.isDirectory(value)) {
      throw new OfficeError("validation_error", "Working directory must be an existing folder", "workingDirectory");
    }
    return value;
  }

  private cacheCatalog(folder: string, provided: ProviderCatalog): Catalog {
    const catalog = buildCatalog(provided);
    this.catalogCache.set(path.resolve(folder), catalog);
    return catalog;
  }

  private async folderCatalog(folder: string, refresh: boolean): Promise<Catalog> {
    const key = path.resolve(folder);
    if (!refresh) {
      const cached = this.catalogCache.get(key);
      if (cached) return cached;
    }
    const running = this.probes.get(key);
    if (running) return running;
    const provider = this.catalogProvider;
    if (!provider) throw new OfficeError("catalog_unavailable", "Skills and agents cannot be read for this folder");
    const probe = (async () => {
      try {
        return this.cacheCatalog(key, await provider.probe(key));
      } catch (error) {
        throw new OfficeError("catalog_unavailable", `Skills and agents could not be read: ${errorReason(error)}`);
      }
    })();
    this.probes.set(key, probe);
    try {
      return await probe;
    } finally {
      if (this.probes.get(key) === probe) this.probes.delete(key);
    }
  }

  private requireEmployee(id: string): Employee {
    const employee = this.repository.getEmployee(id);
    if (!employee) throw new OfficeError("not_found", "Employee not found");
    return employee;
  }

  private recordUsage(employeeId: string, update: UsageUpdate): void {
    const employee = this.repository.getEmployee(employeeId);
    if (!employee) return;
    const timestamp = this.timestamp();
    const bossUsage = this.getOrCreateBossUsage(employee.bossId);
    let bossChanged = false;
    let employeeChanged = false;

    if (update.rateLimit) {
      const { utilizationPercent, resetsAt, windowLabel } = update.rateLimit;
      if (utilizationPercent !== null) {
        bossUsage.utilizationPercent = utilizationPercent;
        bossUsage.remainingPercent = Math.round(Math.max(0, Math.min(100, 100 - utilizationPercent)) * 10) / 10;
      }
      if (resetsAt !== null) bossUsage.resetsAt = resetsAt;
      if (windowLabel !== null) bossUsage.windowLabel = windowLabel;
      bossUsage.updatedAt = timestamp;
      bossChanged = true;
    }

    if (update.tokens) {
      const prev = this.employeeUsage.get(employeeId) ?? {
        inputTokens: 0,
        outputTokens: 0,
        contextUsed: null,
        contextWindow: null,
        costUsd: null,
        updatedAt: null,
      };
      const deltaIn = update.tokens.cumulative
        ? Math.max(0, update.tokens.inputTokens - prev.inputTokens)
        : update.tokens.inputTokens;
      const deltaOut = update.tokens.cumulative
        ? Math.max(0, update.tokens.outputTokens - prev.outputTokens)
        : update.tokens.outputTokens;
      const nextEmployeeUsage: EmployeeUsage = {
        inputTokens: update.tokens.cumulative ? update.tokens.inputTokens : prev.inputTokens + update.tokens.inputTokens,
        outputTokens: update.tokens.cumulative
          ? update.tokens.outputTokens
          : prev.outputTokens + update.tokens.outputTokens,
        contextUsed: update.tokens.contextUsed !== undefined ? update.tokens.contextUsed : prev.contextUsed,
        contextWindow: update.tokens.contextWindow !== undefined ? update.tokens.contextWindow : prev.contextWindow,
        costUsd: update.tokens.costUsd !== undefined ? update.tokens.costUsd : prev.costUsd,
        updatedAt: timestamp,
      };
      this.employeeUsage.set(employeeId, nextEmployeeUsage);
      bossUsage.inputTokens += deltaIn;
      bossUsage.outputTokens += deltaOut;
      bossUsage.updatedAt = timestamp;
      bossChanged = true;
      employeeChanged = true;
    }

    if (bossChanged) {
      this.events.publish({ type: "boss_updated", boss: this.buildBoss(employee.bossId) });
    }
    if (employeeChanged) {
      this.events.publish({ type: "employee_updated", employee: this.decorateEmployee(employee) });
    }
    if (
      update.rateLimit &&
      (update.rateLimit.status === "rejected" ||
        (update.rateLimit.utilizationPercent !== null && update.rateLimit.utilizationPercent >= 100))
    ) {
      this.triggerProviderBreak(
        employee.bossId,
        "Usage limit reached — on break",
        update.rateLimit.resetsAt ?? bossUsage.resetsAt,
      );
    }
  }

  private patchEmployee(id: string, patch: Partial<Employee>): Employee {
    const next: Employee = { ...this.requireEmployee(id), ...patch, updatedAt: this.timestamp() };
    this.repository.updateEmployee(next);
    const decorated = this.decorateEmployee(next);
    this.events.publish({ type: "employee_updated", employee: decorated });
    return decorated;
  }

  private setStatus(id: string, status: Employee["status"], patch: Partial<Employee> = {}): Employee {
    return this.patchEmployee(id, { status, ...patch });
  }

  resolveAttachment(id: string): { path: string; name: string; mimeType: string; size: number } | null {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    const found = this.repository.findAttachment?.(id);
    if (!found) return null;
    const filePath = this.attachmentStore.resolvePath(found.employeeId, found.attachment.id, found.attachment.name);
    if (!filePath) return null;
    return {
      path: filePath,
      name: found.attachment.name,
      mimeType: found.attachment.mimeType,
      size: found.attachment.size,
    };
  }

  private buildMessage(employeeId: string, input: AgentMessage, attachments?: MessageAttachment[]): Message {
    return {
      id: this.newId(),
      employeeId,
      kind: input.kind,
      content: input.content,
      toolName: input.toolName ?? null,
      toolUseId: input.toolUseId ?? null,
      parentToolUseId: input.parentToolUseId ?? null,
      createdAt: this.timestamp(),
      sourceUuid: input.sourceUuid ?? null,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };
  }

  private appendMessage(employeeId: string, input: AgentMessage, attachments?: MessageAttachment[]): Message {
    const message = this.buildMessage(employeeId, input, attachments);
    this.repository.insertMessage(message);
    this.events.publish({ type: "message_added", message });
    return message;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

type HireInput = {
  bossId: unknown;
  task: unknown;
  workingDirectory: unknown;
  name?: unknown;
  species?: unknown;
  role?: unknown;
  jobTitle?: unknown;
};

/** `undefined`, `null`, or blank string clears job title; otherwise trimmed up to MAX_JOB_TITLE_LENGTH. */
function parseJobTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new OfficeError("validation_error", "Job title must be a string", "jobTitle");
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_JOB_TITLE_LENGTH) {
    throw new OfficeError(
      "validation_error",
      `Job title must be at most ${MAX_JOB_TITLE_LENGTH} characters`,
      "jobTitle",
    );
  }
  return trimmed;
}

/** `undefined` and `null` mean General; anything else must be a non-empty agent name. */
function parseRole(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new OfficeError("validation_error", "Role must be an agent name", "role");
  }
  return value;
}

function parseRefresh(value: unknown): boolean {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new OfficeError("validation_error", "refresh must be true or false", "refresh");
}

function parseName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "" || name.length > MAX_NAME_LENGTH) {
    throw new OfficeError("validation_error", `Name must be 1-${MAX_NAME_LENGTH} characters`, "name");
  }
  return name;
}

function parseSpecies(value: unknown): Species {
  if (!isSpecies(value)) throw new OfficeError("validation_error", "Unknown species", "species");
  return value;
}

function parseCount(value: unknown, field: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new OfficeError("validation_error", `${field} must be an integer from ${min} to ${max}`, field);
  }
  return n;
}

function parseAnswers(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, answer]) => typeof answer !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

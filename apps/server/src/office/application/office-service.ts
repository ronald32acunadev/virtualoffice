import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { AgentAdapter, AgentMessage, AgentSink, ApprovalOutcome, ApprovalPrompt } from "../ports/agent-adapter.ts";
import type { EventBus } from "../ports/event-bus.ts";
import type { OfficeRepository } from "../ports/office-repository.ts";
import {
  BOSSES,
  OfficeError,
  isActiveStatus,
  isDecision,
  type ApprovalRequest,
  type Boss,
  type Decision,
  type Employee,
  type Message,
} from "../domain/types.ts";

export type OfficeDeps = {
  repository: OfficeRepository;
  adapter: AgentAdapter;
  events: EventBus;
  now?: () => Date;
  newId?: () => string;
  /** Returns true when the path exists and is a directory. */
  isDirectory?: (path: string) => boolean;
};

type PendingApproval = {
  employeeId: string;
  resolve: (outcome: ApprovalOutcome) => void;
};

type LiveSession = { active: boolean };

function defaultIsDirectory(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export class OfficeService {
  private readonly repository: OfficeRepository;
  private readonly adapter: AgentAdapter;
  private readonly events: EventBus;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly isDirectory: (path: string) => boolean;

  /** Pending-approval registry: approvalId -> resolver of the agent's waiting promise. */
  private readonly pending = new Map<string, PendingApproval>();
  private readonly sessions = new Map<string, LiveSession>();

  constructor(deps: OfficeDeps) {
    this.repository = deps.repository;
    this.adapter = deps.adapter;
    this.events = deps.events;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.isDirectory = deps.isDirectory ?? defaultIsDirectory;
  }

  subscribe(listener: Parameters<EventBus["subscribe"]>[0]): () => void {
    return this.events.subscribe(listener);
  }

  // ---- queries ----

  listBosses(): Boss[] {
    return BOSSES.map((boss) => ({ ...boss }));
  }

  getState(): { bosses: Boss[]; employees: Employee[]; approvals: ApprovalRequest[] } {
    return {
      bosses: this.listBosses(),
      employees: this.repository.listEmployees(),
      approvals: this.repository.listPendingApprovals(),
    };
  }

  listMessages(employeeId: string): Message[] {
    this.requireEmployee(employeeId);
    return this.repository.listMessages(employeeId);
  }

  // ---- commands ----

  hire(input: { bossId: unknown; task: unknown; workingDirectory: unknown }): Employee {
    const boss = BOSSES.find((candidate) => candidate.id === input.bossId);
    if (!boss) throw new OfficeError("validation_error", "Unknown boss", "bossId");
    if (!boss.available) throw new OfficeError("boss_unavailable", `${boss.name} is not available yet`);
    if (typeof input.task !== "string" || input.task.trim() === "") {
      throw new OfficeError("validation_error", "Task must not be empty", "task");
    }
    if (typeof input.workingDirectory !== "string" || !this.isDirectory(input.workingDirectory)) {
      throw new OfficeError("validation_error", "Working directory must be an existing folder", "workingDirectory");
    }
    const task = input.task.trim();
    const timestamp = this.timestamp();
    const employee: Employee = {
      id: this.newId(),
      bossId: boss.id,
      hiredBy: null,
      task,
      workingDirectory: input.workingDirectory,
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

  sendMessage(employeeId: string, text: unknown): Message {
    const employee = this.requireEmployee(employeeId);
    if (typeof text !== "string" || text.trim() === "") {
      throw new OfficeError("validation_error", "Message text must not be empty", "text");
    }
    const message = this.appendMessage(employeeId, { kind: "user_text", content: text });
    if (this.sessions.get(employeeId)?.active && this.adapter.sendMessage(employeeId, text)) {
      if (employee.status === "idle") this.setStatus(employeeId, "working");
      return message;
    }
    const stale = this.sessions.get(employeeId);
    if (stale) stale.active = false;
    // No live session: reopen the stored one (or start fresh if none was ever recorded).
    this.setStatus(employeeId, "working", { failureReason: null });
    this.openSession(this.requireEmployee(employeeId), text, employee.providerSessionId ?? undefined);
    return message;
  }

  async stop(employeeId: string): Promise<Employee> {
    const employee = this.requireEmployee(employeeId);
    if (!isActiveStatus(employee.status)) return employee;
    const session = this.sessions.get(employeeId);
    if (session) session.active = false;
    this.expireApprovalsOf(employeeId);
    try {
      await this.adapter.stop(employeeId);
    } finally {
      this.sessions.delete(employeeId);
    }
    return this.setStatus(employeeId, "stopped");
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

  /** Server shutdown: expire every pending request (agents get deny) and stop live sessions. */
  async shutdown(): Promise<void> {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      try {
        await this.stop(id);
      } catch {
        // keep shutting down the rest
      }
    }
    for (const id of [...this.pending.keys()]) this.expire(id);
  }

  // ---- session plumbing ----

  private openSession(employee: Employee, prompt: string, resume?: string): void {
    const session: LiveSession = { active: true };
    this.sessions.set(employee.id, session);
    const sink = this.createSink(employee.id, session);
    try {
      this.adapter.start({ employee, prompt, ...(resume ? { resume } : {}) }, sink);
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
        this.appendMessage(employeeId, { kind: "system", content: `Employee failed: ${reason}` });
        this.setStatus(employeeId, "failed", { failureReason: reason });
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

  private requireEmployee(id: string): Employee {
    const employee = this.repository.getEmployee(id);
    if (!employee) throw new OfficeError("not_found", "Employee not found");
    return employee;
  }

  private patchEmployee(id: string, patch: Partial<Employee>): Employee {
    const next: Employee = { ...this.requireEmployee(id), ...patch, updatedAt: this.timestamp() };
    this.repository.updateEmployee(next);
    this.events.publish({ type: "employee_updated", employee: next });
    return next;
  }

  private setStatus(id: string, status: Employee["status"], patch: Partial<Employee> = {}): Employee {
    return this.patchEmployee(id, { status, ...patch });
  }

  private appendMessage(employeeId: string, input: AgentMessage): Message {
    const message: Message = {
      id: this.newId(),
      employeeId,
      kind: input.kind,
      content: input.content,
      toolName: input.toolName ?? null,
      toolUseId: input.toolUseId ?? null,
      parentToolUseId: input.parentToolUseId ?? null,
      createdAt: this.timestamp(),
    };
    this.repository.insertMessage(message);
    this.events.publish({ type: "message_added", message });
    return message;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
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

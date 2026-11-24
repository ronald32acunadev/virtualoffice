import type { Agent, ApprovalRequest, Employee, MediaPlaybackState, MediaPreset, Message, MessageAttachment, Project } from "../domain/types.ts";

export interface OfficeRepository {
  insertAgent(agent: Agent): void;
  updateAgent(agent: Agent): void;
  getAgent(id: string): Agent | undefined;
  listAgents(): Agent[];
  deleteAgent(agentId: string): boolean;
  reassignEmployeesAgent(fromAgentId: string, toAgentId: string | null): number;

  insertEmployee(employee: Employee): void;
  updateEmployee(employee: Employee): void;
  getEmployee(id: string): Employee | undefined;
  listEmployees(): Employee[];
  deleteEmployee(employeeId: string): boolean;

  insertMessage(message: Message): void;
  listMessages(employeeId: string): Message[];
  /** Records the provider uuid of a message that was stored without one. */
  setMessageSourceUuid(messageId: string, sourceUuid: string): void;
  findAttachment?(id: string): { employeeId: string; attachment: MessageAttachment } | null;

  insertApproval(approval: ApprovalRequest): void;
  updateApproval(approval: ApprovalRequest): void;
  getApproval(id: string): ApprovalRequest | undefined;
  listPendingApprovals(): ApprovalRequest[];
  /** Marks every pending approval as expired. Returns how many changed. */
  expirePendingApprovals(decidedAt: string): number;

  upsertProject(project: Project): void;
  listProjects(): Project[];

  getMediaState(): MediaPlaybackState | null;
  setMediaState(state: MediaPlaybackState | null): void;
  insertMediaPreset(preset: MediaPreset): void;
  listMediaPresets(): MediaPreset[];
  deleteMediaPreset(id: string): boolean;

  close(): void;
}

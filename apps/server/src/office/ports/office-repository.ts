import type { ApprovalRequest, Employee, Message, MessageAttachment, Project } from "../domain/types.ts";

export interface OfficeRepository {
  insertEmployee(employee: Employee): void;
  updateEmployee(employee: Employee): void;
  getEmployee(id: string): Employee | undefined;
  listEmployees(): Employee[];

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

  close(): void;
}

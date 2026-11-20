/** Read-only view of the embedded terminals, so the office can refuse chat turns while one holds a session. */
export type TerminalGuard = {
  isActive(employeeId: string): boolean;
  listActive(): string[];
};

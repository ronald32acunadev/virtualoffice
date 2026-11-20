import type { AgentInfo, Employee } from "../api/types";

/** Character label: "Name · jobTitle · role" including only set fields. */
export function employeeLabel(
  employee: Pick<Employee, "name" | "role"> & { jobTitle?: string | null },
): string {
  const parts = [employee.name, employee.jobTitle, employee.role].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.join(" · ");
}

export type RoleOptions = { owner: AgentInfo[]; builtin: AgentInfo[] };

/** Splits agents for the Role selector: the owner's agents first, built-in agents under "Built-in". */
export function groupRoleOptions(agents: AgentInfo[]): RoleOptions {
  return { owner: agents.filter((a) => !a.builtin), builtin: agents.filter((a) => a.builtin) };
}

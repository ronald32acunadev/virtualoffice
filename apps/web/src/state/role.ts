import type { AgentInfo, Employee } from "../api/types";

/** Character label: "Name · role" when a role is set. */
export function employeeLabel(employee: Pick<Employee, "name" | "role">): string {
  return employee.role ? `${employee.name} · ${employee.role}` : employee.name;
}

export type RoleOptions = { owner: AgentInfo[]; builtin: AgentInfo[] };

/** Splits agents for the Role selector: the owner's agents first, built-in agents under "Built-in". */
export function groupRoleOptions(agents: AgentInfo[]): RoleOptions {
  return { owner: agents.filter((a) => !a.builtin), builtin: agents.filter((a) => a.builtin) };
}

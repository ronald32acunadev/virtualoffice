import type { Boss, Employee } from "../api/types";

export type EmployeeGroup = { bossId: string; bossName: string; employees: Employee[] };
export type ProjectGroup = { projectKey: string; projectName: string; employees: Employee[] };

function projectNameFromPath(dir: string): string {
  const normalized = dir.replace(/[\\/]+$/, "");
  if (!normalized) return dir || "Workspace";
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

/** Case-insensitive search across employee name, job title, task, folder, and specialist role. */
export function filterEmployees(employees: Employee[], query: string): Employee[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return employees;
  return employees.filter((e) => {
    const haystack = [e.name, e.jobTitle ?? "", e.task, e.workingDirectory, e.role ?? ""].join("\n").toLowerCase();
    return haystack.includes(needle);
  });
}

/** Groups employees by project folder (newest activity first within and across groups). */
export function groupEmployeesByProject(employees: Employee[]): ProjectGroup[] {
  const byProject = new Map<string, Employee[]>();
  for (const employee of employees) {
    const key = employee.workingDirectory.replace(/[\\/]+$/, "") || employee.workingDirectory;
    const list = byProject.get(key) ?? [];
    list.push(employee);
    byProject.set(key, list);
  }
  const newestFirst = (a: Employee, b: Employee) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  const groups: ProjectGroup[] = [];
  for (const [projectKey, list] of byProject) {
    const sorted = [...list].sort(newestFirst);
    groups.push({ projectKey, projectName: projectNameFromPath(projectKey), employees: sorted });
  }
  return groups.sort((a, b) => {
    const aTime = a.employees[0]?.updatedAt ?? "";
    const bTime = b.employees[0]?.updatedAt ?? "";
    return aTime < bTime ? 1 : aTime > bTime ? -1 : 0;
  });
}

/** Groups employees by boss (boss order preserved, empty groups dropped), newest activity first. */
export function groupEmployeesByBoss(employees: Employee[], bosses: Pick<Boss, "id" | "name">[]): EmployeeGroup[] {
  const byBoss = new Map<string, Employee[]>();
  for (const employee of employees) {
    const list = byBoss.get(employee.bossId) ?? [];
    list.push(employee);
    byBoss.set(employee.bossId, list);
  }
  const newestFirst = (a: Employee, b: Employee) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  const groups: EmployeeGroup[] = [];
  const seen = new Set<string>();
  for (const boss of bosses) {
    seen.add(boss.id);
    const list = byBoss.get(boss.id);
    if (list?.length) groups.push({ bossId: boss.id, bossName: boss.name, employees: [...list].sort(newestFirst) });
  }
  for (const [bossId, list] of byBoss) {
    if (!seen.has(bossId)) groups.push({ bossId, bossName: bossId, employees: [...list].sort(newestFirst) });
  }
  return groups;
}

export const FOLDER_MISSING_PREFIX = "Project folder not found";

/** True when the employee cannot take messages because its project folder is gone. */
export function isFolderMissing(employee: Pick<Employee, "failureReason">): boolean {
  return employee.failureReason?.startsWith(FOLDER_MISSING_PREFIX) ?? false;
}

export type ComposerKey = { key: string; shiftKey: boolean; isComposing?: boolean };

/** Enter sends, Shift+Enter inserts a newline, empty text is never sent. */
export function composerKeyAction(event: ComposerKey, text: string): "send" | "newline" | "none" {
  if (event.key !== "Enter" || event.isComposing) return "none";
  if (event.shiftKey) return "newline";
  return text.trim() === "" ? "none" : "send";
}

/** Short relative date such as "5m ago" or "3d ago". */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}

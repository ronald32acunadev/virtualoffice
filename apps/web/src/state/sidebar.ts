import type { Boss, Employee, Project, SyncSummary } from "../api/types";

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
export function groupEmployeesByProject(employees: Employee[], projects: Project[] = []): ProjectGroup[] {
  const byProject = new Map<string, Employee[]>();
  for (const employee of employees) {
    const key = employee.workingDirectory.replace(/[\\/]+$/, "") || employee.workingDirectory;
    const list = byProject.get(key) ?? [];
    list.push(employee);
    byProject.set(key, list);
  }
  const projectLastSeen = new Map<string, string>();
  const projectNameOverride = new Map<string, string>();
  for (const project of projects) {
    const key = project.path.replace(/[\\/]+$/, "") || project.path;
    if (project.lastSeenAt) {
      const existing = projectLastSeen.get(key) ?? "";
      if (project.lastSeenAt > existing) {
        projectLastSeen.set(key, project.lastSeenAt);
      }
    }
    if (project.name) {
      projectNameOverride.set(key, project.name);
    }
  }
  const newestFirst = (a: Employee, b: Employee) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  const groups: ProjectGroup[] = [];
  const seenKeys = new Set<string>();
  for (const [projectKey, list] of byProject) {
    const sorted = [...list].sort(newestFirst);
    groups.push({
      projectKey,
      projectName: projectNameOverride.get(projectKey) ?? projectNameFromPath(projectKey),
      employees: sorted,
    });
    seenKeys.add(projectKey);
  }
  for (const project of projects) {
    const key = project.path.replace(/[\\/]+$/, "") || project.path;
    if (seenKeys.has(key)) continue;
    groups.push({
      projectKey: key,
      projectName: project.name || projectNameFromPath(key),
      employees: [],
    });
    seenKeys.add(key);
  }
  return groups.sort((a, b) => {
    const aEmpTime = a.employees[0]?.updatedAt ?? "";
    const aProjTime = projectLastSeen.get(a.projectKey) ?? "";
    const aTime = aEmpTime > aProjTime ? aEmpTime : aProjTime;
    const bEmpTime = b.employees[0]?.updatedAt ?? "";
    const bProjTime = projectLastSeen.get(b.projectKey) ?? "";
    const bTime = bEmpTime > bProjTime ? bEmpTime : bProjTime;
    if (aTime !== bTime) return aTime < bTime ? 1 : -1;
    return a.projectName < b.projectName ? -1 : a.projectName > b.projectName ? 1 : 0;
  });
}

/** Builds a deduplicated list of project options from projects and employees. */
export function buildProjectOptions(
  projects: Project[],
  employees: Employee[],
): { path: string; name: string }[] {
  const byPath = new Map<string, { path: string; name: string; lastSeen: string }>();
  for (const project of projects) {
    const key = project.path.replace(/[\\/]+$/, "") || project.path;
    const name = project.name || projectNameFromPath(key);
    const lastSeen = project.lastSeenAt ?? "";
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, { path: key, name, lastSeen });
    } else {
      if (project.name) existing.name = project.name;
      if (lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
    }
  }
  for (const employee of employees) {
    const key = employee.workingDirectory.replace(/[\\/]+$/, "") || employee.workingDirectory;
    const name = projectNameFromPath(key);
    const lastSeen = employee.updatedAt;
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, { path: key, name, lastSeen });
    } else {
      if (lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
    }
  }
  const options = Array.from(byPath.values());
  options.sort((a, b) => {
    if (a.lastSeen !== b.lastSeen) return a.lastSeen < b.lastSeen ? 1 : -1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return options.map(({ path, name }) => ({ path, name }));
}

/** Formats sync errors from a SyncSummary into a human-readable string, or null if none. */
export function formatSyncErrors(summary: SyncSummary): string | null {
  const entries: [string, string][] = [];
  for (const [bossId, stats] of Object.entries(summary.providers)) {
    if (stats?.error) {
      entries.push([bossId, stats.error]);
    }
  }
  if (entries.length === 0) return null;
  return "Sync issues: " + entries.map(([b, e]) => `${b}: ${e}`).join("; ");
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

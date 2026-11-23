import type { Boss, Employee, Project, SyncSummary, BossId } from "../api/types";

export type EmployeeGroup = { bossId: string; bossName: string; employees: Employee[] };
export type ProjectGroup = {
  projectKey: string;
  projectName: string;
  employees: Employee[];
  providers: BossId[];
  isGeneral?: boolean;
};

export function isWorktreePath(dir: string): boolean {
  if (!dir) return false;
  const normalized = dir.replace(/\\/g, "/");
  return (
    normalized.includes("/.codex/worktrees/") ||
    normalized.includes("/.claude/worktrees/") ||
    normalized.includes("/.git/worktrees/") ||
    normalized.includes("/worktrees/")
  );
}

export function isNonProjectPath(dir: string, projectName?: string): boolean {
  if (!dir) return false;
  const normalized = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return false;

  // Bare user home root: /^\/(?:home|Users)\/[^/]+$/ or Windows C:/Users/<name>
  if (/^\/(?:home|Users)\/[^/]+$/i.test(normalized)) return true;
  if (/^[A-Za-z]:\/Users\/[^/]+$/i.test(normalized)) return true;

  // /tmp or starts with /tmp/
  if (normalized === "/tmp" || normalized.startsWith("/tmp/")) return true;

  // Downloads directory check: /(?:^|\/)downloads(?:\/|$)/i
  if (/(?:^|\/)downloads(?:\/|$)/i.test(normalized)) return true;

  const parts = normalized.split("/").filter(Boolean);
  const basename = (parts[parts.length - 1] ?? "").trim().toLowerCase();

  if (basename === "desktop" || basename === "downloads" || basename === "documents") {
    return true;
  }
  if (basename === "default project" || (projectName?.trim().toLowerCase() === "default project")) {
    return true;
  }

  return false;
}

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
  const projectNameOverride = new Map<string, string>();
  const projectLastSeen = new Map<string, string>();

  for (const project of projects) {
    const key = project.path.replace(/[\\/]+$/, "") || project.path;
    if (project.name) {
      projectNameOverride.set(key, project.name);
    }
    if (project.lastSeenAt) {
      const existing = projectLastSeen.get(key) ?? "";
      if (project.lastSeenAt > existing) {
        projectLastSeen.set(key, project.lastSeenAt);
      }
    }
  }

  type Bucket = {
    projectKey: string;
    projectName: string;
    employees: Employee[];
    providers: Set<BossId>;
    isGeneral?: boolean;
    nonWorktreeKeys: string[];
  };

  const buckets = new Map<string, Bucket>();

  const getOrCreateBucket = (rawDir: string, nameOverride?: string) => {
    const isGeneral = isNonProjectPath(rawDir, nameOverride);
    if (isGeneral) {
      let generalBucket = buckets.get("__general__");
      if (!generalBucket) {
        generalBucket = {
          projectKey: rawDir,
          projectName: "General",
          employees: [],
          providers: new Set<BossId>(),
          isGeneral: true,
          nonWorktreeKeys: [],
        };
        buckets.set("__general__", generalBucket);
      }
      return generalBucket;
    }

    const normDir = rawDir.replace(/[\\/]+$/, "") || rawDir;
    const resolvedName = nameOverride || projectNameOverride.get(normDir) || projectNameFromPath(normDir);
    const bucketKey = resolvedName.trim().toLowerCase();

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        projectKey: normDir,
        projectName: resolvedName,
        employees: [],
        providers: new Set<BossId>(),
        nonWorktreeKeys: [],
      };
      buckets.set(bucketKey, bucket);
    }
    return bucket;
  };

  for (const project of projects) {
    const key = project.path.replace(/[\\/]+$/, "") || project.path;
    const nameOverride = projectNameOverride.get(key);
    const bucket = getOrCreateBucket(key, nameOverride);

    if (!isWorktreePath(key) && !bucket.isGeneral) {
      bucket.nonWorktreeKeys.push(key);
    }
  }

  for (const employee of employees) {
    const dir = employee.workingDirectory;
    const nameOverride = projectNameOverride.get(dir.replace(/[\\/]+$/, "") || dir);
    const bucket = getOrCreateBucket(dir, nameOverride);

    bucket.employees.push(employee);
    bucket.providers.add(employee.bossId);

    const normDir = dir.replace(/[\\/]+$/, "") || dir;
    if (!isWorktreePath(normDir) && !bucket.isGeneral) {
      if (!bucket.nonWorktreeKeys.includes(normDir)) {
        bucket.nonWorktreeKeys.push(normDir);
      }
    }
  }

  for (const project of projects) {
    const key = project.path.replace(/[\\/]+$/, "") || project.path;
    const nameOverride = projectNameOverride.get(key);
    const bucket = getOrCreateBucket(key, nameOverride);
    if (!bucket.isGeneral && !bucket.nonWorktreeKeys.includes(key) && !isWorktreePath(key)) {
      bucket.nonWorktreeKeys.push(key);
    }
  }

  const newestFirst = (a: Employee, b: Employee) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;

  const regularGroups: ProjectGroup[] = [];
  let generalGroup: ProjectGroup | null = null;

  for (const [bucketKey, bucket] of buckets) {
    const sortedEmployees = [...bucket.employees].sort(newestFirst);
    const deduplicatedProviders = Array.from(bucket.providers);

    if (bucket.isGeneral) {
      if (sortedEmployees.length > 0) {
        generalGroup = {
          projectKey: bucket.projectKey,
          projectName: "General",
          employees: sortedEmployees,
          providers: deduplicatedProviders,
          isGeneral: true,
        };
      }
      continue;
    }

    let chosenKey = bucket.projectKey;
    const allPaths = Array.from(
      new Set([
        bucket.projectKey,
        ...bucket.nonWorktreeKeys,
        ...bucket.employees.map((e) => e.workingDirectory.replace(/[\\/]+$/, "") || e.workingDirectory),
        ...projects.map((p) => p.path.replace(/[\\/]+$/, "") || p.path),
      ])
    );

    const nonWorktreePaths = allPaths.filter((p) => !isWorktreePath(p));
    const candidatePaths = nonWorktreePaths.length > 0 ? nonWorktreePaths : allPaths;

    if (candidatePaths.length > 0) {
      const matchingBasename = candidatePaths.find(
        (p) => projectNameFromPath(p).toLowerCase() === bucket.projectName.toLowerCase()
      );
      if (matchingBasename) {
        chosenKey = matchingBasename;
      } else {
        chosenKey = candidatePaths[0] ?? bucket.projectKey;
      }
    }

    regularGroups.push({
      projectKey: chosenKey,
      projectName: bucket.projectName,
      employees: sortedEmployees,
      providers: deduplicatedProviders,
    });
  }

  regularGroups.sort((a, b) => {
    const getGroupTime = (g: ProjectGroup) => {
      const empTime = g.employees[0]?.updatedAt ?? "";
      const projTime = projectLastSeen.get(g.projectKey) ?? "";
      return empTime > projTime ? empTime : projTime;
    };
    const aTime = getGroupTime(a);
    const bTime = getGroupTime(b);
    if (aTime !== bTime) return aTime < bTime ? 1 : -1;
    return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" });
  });

  const result: ProjectGroup[] = [...regularGroups];
  if (generalGroup && generalGroup.employees.length > 0) {
    result.push(generalGroup);
  }

  return result;
}

/** Builds a deduplicated list of project options from projects and employees. */
export function buildProjectOptions(
  projects: Project[],
  employees: Employee[],
): { path: string; name: string }[] {
  const groups = groupEmployeesByProject(employees, projects);
  const options: { path: string; name: string; lastSeen: string }[] = [];

  for (const group of groups) {
    if (group.isGeneral) continue;
    const key = group.projectKey;
    const name = group.projectName;
    const empTime = group.employees[0]?.updatedAt ?? "";
    const projTime = projects.find((p) => p.path.replace(/[\\/]+$/, "") === key)?.lastSeenAt ?? "";
    const lastSeen = empTime > projTime ? empTime : projTime;
    options.push({ path: key, name, lastSeen });
  }

  options.sort((a, b) => {
    if (a.lastSeen !== b.lastSeen) return a.lastSeen < b.lastSeen ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
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

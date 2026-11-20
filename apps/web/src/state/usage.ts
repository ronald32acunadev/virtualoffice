import type { BossUsage, EmployeeUsage } from "../api/types";

export function formatCompactTokens(count: number): string {
  if (count < 1000) {
    return String(Math.round(count));
  }
  if (count < 1_000_000) {
    return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k`;
  }
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function formatResetCountdown(
  resetsAt: string | null | undefined,
  nowMs = Date.now()
): string | null {
  if (!resetsAt) {
    return null;
  }
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) {
    return null;
  }
  const diffMs = target - nowMs;
  if (diffMs <= 0) {
    return "now";
  }
  const totalMin = Math.ceil(diffMs / 60_000);
  if (totalMin < 60) {
    return `in ${totalMin}m`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) {
    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`;
}

export function usageRingPercent(
  bossUsage?: BossUsage | null,
  employeeUsage?: EmployeeUsage | null
): {
  percent: number | null;
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
} {
  if (bossUsage && bossUsage.remainingPercent !== null) {
    const remaining = Math.max(0, Math.min(100, Math.round(bossUsage.remainingPercent)));
    const used = 100 - remaining;
    const tone = remaining <= 10 ? "danger" : remaining <= 25 ? "warn" : "ok";
    const label = `${remaining}% left${bossUsage.windowLabel ? ` (${bossUsage.windowLabel})` : ""}`;
    return { percent: used, label, tone };
  }
  if (
    employeeUsage &&
    employeeUsage.contextUsed !== null &&
    employeeUsage.contextWindow &&
    employeeUsage.contextWindow > 0
  ) {
    const used = Math.max(0, Math.min(100, Math.round((employeeUsage.contextUsed / employeeUsage.contextWindow) * 100)));
    const tone = used >= 90 ? "danger" : used >= 75 ? "warn" : "ok";
    const label = `${used}% ctx`;
    return { percent: used, label, tone };
  }
  if (employeeUsage && (employeeUsage.inputTokens + employeeUsage.outputTokens) > 0) {
    const total = employeeUsage.inputTokens + employeeUsage.outputTokens;
    return { percent: null, label: `${formatCompactTokens(total)} tok`, tone: "muted" };
  }
  if (bossUsage && (bossUsage.inputTokens + bossUsage.outputTokens) > 0) {
    const total = bossUsage.inputTokens + bossUsage.outputTokens;
    return { percent: null, label: `${formatCompactTokens(total)} tok`, tone: "muted" };
  }
  return { percent: null, label: "Available", tone: "muted" };
}

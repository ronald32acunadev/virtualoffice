import type { BossUsage, EmployeeUsage } from "../api/types";
import { formatResetCountdown, usageRingPercent } from "../state/usage";

export function UsageRing({
  bossUsage,
  employeeUsage,
  onBreak = false,
  breakUntil,
}: {
  bossUsage?: BossUsage | null;
  employeeUsage?: EmployeeUsage | null;
  onBreak?: boolean;
  breakUntil?: string | null;
}) {
  const info = usageRingPercent(bossUsage, employeeUsage);

  if (onBreak) {
    const countdown = formatResetCountdown(breakUntil);
    return (
      <span className="usage-break" aria-label={`On break${countdown ? ` (${countdown})` : ""}`}>
        ☕ On break
        {countdown ? <span className="usage-break-countdown">· {countdown}</span> : null}
      </span>
    );
  }

  const circumference = 2 * Math.PI * 7;
  const offset = info.percent == null ? circumference : circumference - (info.percent / 100) * circumference;
  const resetCountdown = formatResetCountdown(bossUsage?.resetsAt);
  const tooltip = resetCountdown ? `${info.label} · resets ${resetCountdown}` : info.label;

  return (
    <span className={`usage-ring usage-tone-${info.tone}`} title={tooltip} aria-label={tooltip}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <circle className="usage-ring-track" cx="10" cy="10" r="7" strokeWidth="2.5" fill="none" />
        {info.percent != null ? (
          <circle
            className="usage-ring-fill"
            cx="10"
            cy="10"
            r="7"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 10 10)"
          />
        ) : null}
      </svg>
      <span className="usage-ring-label">{info.label}</span>
    </span>
  );
}

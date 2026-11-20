import type { LaunchTarget, LaunchTargetKind } from "../api/types";

const LAUNCH_KIND_LABELS: Record<LaunchTargetKind, string> = {
  desktop_app: "App",
  terminal_cli: "Terminal",
  folder: "Folder",
};

/** Maps a launch target kind to its short display badge label. */
export function launchKindLabel(kind: LaunchTargetKind): string {
  return LAUNCH_KIND_LABELS[kind];
}

/** Returns whether an external launch target can currently be invoked. */
export function canLaunchTarget(target: LaunchTarget): boolean {
  return target.available;
}

/** Guards async launch-target operations against employee switches while in flight. */
export function isCurrentEmployee(requestEmployeeId: string, activeEmployeeId: string): boolean {
  return requestEmployeeId === activeEmployeeId;
}

/** Formats the brief status message shown after launching an external target. */
export function formatLaunchFeedback(target: LaunchTarget): string {
  return `Opened ${target.label}`;
}

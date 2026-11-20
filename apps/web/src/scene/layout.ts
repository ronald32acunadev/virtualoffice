import type { BossId, EmployeeStatus } from "../api/types";

export type Vec3 = [number, number, number];

export const AREA_SIZE = 12;
export const AREA_CENTERS: Record<BossId, [number, number]> = {
  claude: [-7, -7],
  codex: [7, -7],
  opencode: [-7, 7],
  gemini: [7, 7],
};
export const AREA_COLORS: Record<BossId, string> = {
  claude: "#d9774a",
  codex: "#4aa3d9",
  opencode: "#5bbf7a",
  gemini: "#9a7ad9",
};

const COLUMNS = 3;
const DESK_SPACING = 3;

export function bossDeskPosition(bossId: BossId): Vec3 {
  const [cx, cz] = AREA_CENTERS[bossId];
  return [cx, 0, cz - 4];
}

/** Desk position for the nth employee of a boss, laid out as a grid in front of the boss desk. */
export function employeeDeskPosition(bossId: BossId, index: number): Vec3 {
  const [cx, cz] = AREA_CENTERS[bossId];
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return [cx + (col - 1) * DESK_SPACING, 0, cz - 1 + row * DESK_SPACING];
}

export const STATUS_COLORS: Record<EmployeeStatus, string> = {
  starting: "#8fb8ff",
  working: "#5bbf7a",
  waiting_approval: "#ffb02e",
  idle: "#c9c2b8",
  on_break: "#d9924a",
  stopped: "#7a7a7a",
  failed: "#d95050",
};

import type { EmployeeStatus } from "../api/types";

export type CharacterPoseSpec = {
  leanX: number;
  headTiltX: number;
  typing: boolean;
  waving: boolean;
  breathingSpeed: number;
  muted: boolean;
  accentGlow: string | null;
};

/** Pose and animation parameters per employee status for seated 3D characters. */
export const CHARACTER_POSES: Record<EmployeeStatus, CharacterPoseSpec> = {
  working: {
    leanX: -0.14,
    headTiltX: 0.08,
    typing: true,
    waving: false,
    breathingSpeed: 2.8,
    muted: false,
    accentGlow: null,
  },
  waiting_approval: {
    leanX: -0.04,
    headTiltX: -0.08,
    typing: false,
    waving: true,
    breathingSpeed: 3.2,
    muted: false,
    accentGlow: "#ffb02e",
  },
  idle: {
    leanX: 0.02,
    headTiltX: 0,
    typing: false,
    waving: false,
    breathingSpeed: 1.5,
    muted: false,
    accentGlow: null,
  },
  starting: {
    leanX: -0.06,
    headTiltX: -0.04,
    typing: false,
    waving: false,
    breathingSpeed: 3.6,
    muted: false,
    accentGlow: "#8fb8ff",
  },
  stopped: {
    leanX: 0.16,
    headTiltX: 0.12,
    typing: false,
    waving: false,
    breathingSpeed: 0.6,
    muted: true,
    accentGlow: null,
  },
  failed: {
    leanX: -0.24,
    headTiltX: 0.28,
    typing: false,
    waving: false,
    breathingSpeed: 1.1,
    muted: false,
    accentGlow: "#d95050",
  },
};

/** Returns true when the employee has a non-empty specialist role assigned. */
export function hasSpecialistAccessory(role: string | null | undefined): boolean {
  return typeof role === "string" && role.trim().length > 0;
}

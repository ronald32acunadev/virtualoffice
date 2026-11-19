import { describe, expect, it } from "vitest";
import type { EmployeeStatus } from "../api/types";
import { CHARACTER_POSES, hasSpecialistAccessory } from "./characterVisuals";

const ALL_STATUSES: EmployeeStatus[] = [
  "starting",
  "working",
  "waiting_approval",
  "idle",
  "stopped",
  "failed",
];

describe("characterVisuals", () => {
  it("US-03 / AC-02: CHARACTER_POSES defines distinct poses for all 6 employee statuses", () => {
    for (const status of ALL_STATUSES) {
      const pose = CHARACTER_POSES[status];
      expect(pose).toBeDefined();
      expect(typeof pose.leanX).toBe("number");
      expect(typeof pose.headTiltX).toBe("number");
      expect(pose.breathingSpeed).toBeGreaterThan(0);
    }

    expect(CHARACTER_POSES.working.typing).toBe(true);
    expect(CHARACTER_POSES.working.waving).toBe(false);
    expect(CHARACTER_POSES.working.leanX).toBeLessThan(0);

    expect(CHARACTER_POSES.waiting_approval.waving).toBe(true);
    expect(CHARACTER_POSES.waiting_approval.typing).toBe(false);
    expect(CHARACTER_POSES.waiting_approval.accentGlow).toBe("#ffb02e");

    expect(CHARACTER_POSES.idle.typing).toBe(false);
    expect(CHARACTER_POSES.idle.waving).toBe(false);
    expect(CHARACTER_POSES.idle.muted).toBe(false);

    expect(CHARACTER_POSES.stopped.muted).toBe(true);
    expect(CHARACTER_POSES.stopped.leanX).toBeGreaterThan(0);

    expect(CHARACTER_POSES.failed.leanX).toBeLessThan(CHARACTER_POSES.working.leanX);
    expect(CHARACTER_POSES.failed.headTiltX).toBeGreaterThan(0.15);
    expect(CHARACTER_POSES.failed.accentGlow).toBe("#d95050");

    expect(CHARACTER_POSES.starting.accentGlow).toBeTruthy();
    expect(CHARACTER_POSES.starting.breathingSpeed).toBeGreaterThan(CHARACTER_POSES.idle.breathingSpeed);
  });

  it("US-03 / AC-01: hasSpecialistAccessory returns true only for non-empty trimmed roles", () => {
    expect(hasSpecialistAccessory("reviewer")).toBe(true);
    expect(hasSpecialistAccessory("  architect  ")).toBe(true);
    expect(hasSpecialistAccessory(null)).toBe(false);
    expect(hasSpecialistAccessory(undefined)).toBe(false);
    expect(hasSpecialistAccessory("")).toBe(false);
    expect(hasSpecialistAccessory("   \t\n ")).toBe(false);
  });
});

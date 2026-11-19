import { describe, expect, it } from "vitest";
import type { BossId, EmployeeStatus } from "../api/types";
import { bossDeskPosition, employeeDeskPosition } from "./layout";
import {
  MONITOR_VISUALS,
  MOOD_PALETTES,
  OFFICE_HALF_SIZE,
  PROP_PLACEMENTS,
  overlapsAnyDesk,
} from "./officeTheme";
import { createRugTexture, createScreenTexture, createWoodFloorTexture } from "./textures";

const ALL_STATUSES: EmployeeStatus[] = [
  "starting",
  "working",
  "waiting_approval",
  "idle",
  "stopped",
  "failed",
];

const ALL_BOSSES: BossId[] = ["claude", "codex", "opencode", "gemini"];

function hexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("officeTheme", () => {
  it("US-01 / AC-01: day palette provides a bright sky and evening increases interior lamp intensity", () => {
    expect(MOOD_PALETTES.day.sky.toLowerCase()).not.toBe("#1a1d24");
    expect(hexLuminance(MOOD_PALETTES.day.sky)).toBeGreaterThan(170);
    expect(MOOD_PALETTES.day.sunIntensity).toBeGreaterThan(MOOD_PALETTES.evening.sunIntensity);
    expect(MOOD_PALETTES.evening.lampIntensity).toBeGreaterThan(MOOD_PALETTES.day.lampIntensity);
  });

  it("US-01 / AC-02: procedural texture helpers are Node/SSR safe when document is unavailable", () => {
    expect(createWoodFloorTexture()).toBeNull();
    expect(createRugTexture("#d9774a")).toBeNull();
    for (const status of ALL_STATUSES) {
      expect(createScreenTexture(status)).toBeNull();
    }
  });

  it("US-02 / AC-04: MONITOR_VISUALS provides distinct glowing states for all 6 employee statuses", () => {
    const emissives = new Set<string>();
    for (const status of ALL_STATUSES) {
      const visual = MONITOR_VISUALS[status];
      expect(visual).toBeDefined();
      expect(visual.screen).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.emissive).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.accent).toMatch(/^#[0-9a-f]{6}$/i);
      emissives.add(visual.emissive);
    }

    expect(emissives.size).toBe(ALL_STATUSES.length);
    expect(MONITOR_VISUALS.working.emissiveIntensity).toBeGreaterThan(0.5);
    expect(MONITOR_VISUALS.waiting_approval.emissiveIntensity).toBeGreaterThan(0.5);
    expect(MONITOR_VISUALS.failed.emissiveIntensity).toBeGreaterThan(0.5);
    expect(MONITOR_VISUALS.stopped.emissiveIntensity).toBeLessThan(0.1);
  });

  it("US-02 / AC-03: PROP_PLACEMENTS stay inside the office bounds and never overlap any desk", () => {
    expect(PROP_PLACEMENTS.length).toBeGreaterThan(0);
    const ids = new Set<string>();

    for (const prop of PROP_PLACEMENTS) {
      expect(ids.has(prop.id)).toBe(false);
      ids.add(prop.id);

      const [x, , z] = prop.position;
      expect(Math.abs(x) + prop.radius).toBeLessThanOrEqual(OFFICE_HALF_SIZE);
      expect(Math.abs(z) + prop.radius).toBeLessThanOrEqual(OFFICE_HALF_SIZE);
      expect(overlapsAnyDesk(x, z, prop.radius)).toBe(false);
    }
  });

  it("US-02 / AC-03: overlapsAnyDesk detects collisions with boss desks and employee desks 0..8", () => {
    for (const bossId of ALL_BOSSES) {
      const [bx, , bz] = bossDeskPosition(bossId);
      expect(overlapsAnyDesk(bx, bz, 0.4)).toBe(true);

      for (let i = 0; i < 9; i += 1) {
        const [ex, , ez] = employeeDeskPosition(bossId, i);
        expect(overlapsAnyDesk(ex, ez, 0.4)).toBe(true);
        // Chair behind desk also counts as occupied workstation space
        expect(overlapsAnyDesk(ex, ez + 0.95, 0.3)).toBe(true);
      }
    }
  });
});

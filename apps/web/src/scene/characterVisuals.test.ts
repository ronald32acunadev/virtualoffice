import { describe, expect, it } from "vitest";
import type { EmployeeStatus } from "../api/types";
import { CHARACTER_POSES, getEffectiveCharacterPose, hasSpecialistAccessory } from "./characterVisuals";
import { WORLD_THEME_IDS } from "./themes/registry";
import { getThemeStationVisual } from "./themes/themeVisuals";

const ALL_STATUSES: EmployeeStatus[] = [
  "starting",
  "working",
  "waiting_approval",
  "idle",
  "on_break",
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

    expect(CHARACTER_POSES.on_break.typing).toBe(false);
    expect(CHARACTER_POSES.on_break.waving).toBe(false);
    expect(CHARACTER_POSES.on_break.leanX).toBeGreaterThan(0);
    expect(CHARACTER_POSES.on_break.accentGlow).toBe("#e09f5a");

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

  it("US-04 / AC-01, AC-02: every theme defines distinct station and accessory visuals without forbidden colors", () => {
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    const forbidden = ["#212121", "#171717"];
    for (const id of WORLD_THEME_IDS) {
      const visual = getThemeStationVisual(id);
      for (const value of [visual.desktopColor, visual.bossDesktopColor, visual.trimColor, visual.legColor, visual.panelColor]) {
        expect(value).toMatch(hexRe);
        expect(forbidden).not.toContain(value.toLowerCase());
      }
    }
    expect(getThemeStationVisual("office").accessoryKind).toBe("none");
    const nonOffice = ["western", "horror", "metal"] as const;
    const accessoryKinds = nonOffice.map((id) => getThemeStationVisual(id).accessoryKind);
    const accentKinds = nonOffice.map((id) => getThemeStationVisual(id).stationAccentKind);
    expect(new Set(accessoryKinds).size).toBe(3);
    expect(new Set(accentKinds).size).toBe(3);
    for (const kind of accessoryKinds) {
      expect(kind).not.toBe("none");
    }
  });

  it("derives distinct tool-activity poses while working and preserves urgent status precedence", () => {
    const filePose = getEffectiveCharacterPose("working", {
      category: "searching_files",
      toolName: "Grep",
      serverName: null,
      label: "Grep",
      startedAt: "2026-11-24T00:00:00Z",
    });
    expect(filePose.typing).toBe(false);
    expect(filePose.accentGlow).toBe("#38bdf8");

    const mcpPose = getEffectiveCharacterPose("working", {
      category: "mcp_request",
      toolName: "mcp__engram__mem_search",
      serverName: "engram",
      label: "engram · mem_search",
      startedAt: "2026-11-24T00:00:00Z",
    });
    expect(mcpPose.typing).toBe(false);
    expect(mcpPose.accentGlow).toBe("#c084fc");

    // Urgent waiting_approval takes precedence over tool activity
    const urgentPose = getEffectiveCharacterPose("waiting_approval", {
      category: "mcp_request",
      toolName: "mcp__engram__mem_search",
      serverName: "engram",
      label: "engram · mem_search",
      startedAt: "2026-11-24T00:00:00Z",
    });
    expect(urgentPose.waving).toBe(true);
    expect(urgentPose.accentGlow).toBe("#ffb02e");
  });
});

import { describe, expect, it } from "vitest";
import { formatCompactTokens, formatResetCountdown, usageRingPercent } from "./usage";
import type { BossUsage, EmployeeUsage } from "../api/types";

describe("usage", () => {
  describe("formatCompactTokens", () => {
    it("formats numbers correctly", () => {
      expect(formatCompactTokens(500)).toBe("500");
      expect(formatCompactTokens(1500)).toBe("1.5k");
      expect(formatCompactTokens(12500)).toBe("13k");
      expect(formatCompactTokens(1_250_000)).toBe("1.3M");
    });
  });

  describe("formatResetCountdown", () => {
    it("handles null, past, and future durations", () => {
      expect(formatResetCountdown(null)).toBe(null);
      const now = 1_800_000_000_000;
      expect(formatResetCountdown(new Date(now - 1000 * 60 * 60).toISOString(), now)).toBe("now");
      expect(formatResetCountdown(new Date(now + 1000 * 60 * 25).toISOString(), now)).toBe("in 25m");
      expect(formatResetCountdown(new Date(now + 1000 * 60 * 60 * 2 + 1000 * 60 * 15).toISOString(), now)).toBe("in 2h 15m");
      expect(formatResetCountdown(new Date(now + 1000 * 60 * 60 * 26).toISOString(), now)).toBe("in 1d 2h");
    });
  });

  describe("usageRingPercent", () => {
    const baseBossUsage = (overrides: Partial<BossUsage> = {}): BossUsage => ({
      remainingPercent: null,
      utilizationPercent: null,
      resetsAt: null,
      windowLabel: null,
      inputTokens: 0,
      outputTokens: 0,
      updatedAt: null,
      ...overrides,
    });
    const baseEmpUsage = (overrides: Partial<EmployeeUsage> = {}): EmployeeUsage => ({
      inputTokens: 0,
      outputTokens: 0,
      contextUsed: null,
      contextWindow: null,
      costUsd: null,
      updatedAt: null,
      ...overrides,
    });

    it("calculates percent and label for boss usage", () => {
      const bossUsage = baseBossUsage({ remainingPercent: 65, windowLabel: "5h" });
      const result = usageRingPercent(bossUsage, null);
      expect(result).toEqual({ percent: 35, label: "65% left (5h)", tone: "ok" });
    });

    it("returns warn tone for low remaining percent", () => {
      const bossUsage = baseBossUsage({ remainingPercent: 20 });
      const result = usageRingPercent(bossUsage, null);
      expect(result.tone).toBe("warn");
    });

    it("returns danger tone for very low remaining percent", () => {
      const bossUsage = baseBossUsage({ remainingPercent: 5 });
      const result = usageRingPercent(bossUsage, null);
      expect(result.tone).toBe("danger");
    });

    it("calculates percent from employee usage context", () => {
      const employeeUsage = baseEmpUsage({ contextUsed: 80000, contextWindow: 100000 });
      const result = usageRingPercent(null, employeeUsage);
      expect(result).toEqual({ percent: 80, label: "80% ctx", tone: "warn" });
    });

    it("returns null percent and muted tone for token-only usage", () => {
      const bossUsage = baseBossUsage({ remainingPercent: null, inputTokens: 1000, outputTokens: 500 });
      const result = usageRingPercent(bossUsage, null);
      expect(result).toEqual({ percent: null, label: "1.5k tok", tone: "muted" });
    });

    it("returns null percent and muted tone when no usage exists", () => {
      const result = usageRingPercent(null, null);
      expect(result).toEqual({ percent: null, label: "Available", tone: "muted" });
    });
  });
});

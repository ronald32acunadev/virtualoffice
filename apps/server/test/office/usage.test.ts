import { describe, expect, it } from "vitest";
import { createHarness, hireWorking } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import {
  extractTokenUsage,
  formatRateLimitWindow,
  isRateLimitErrorMessage,
  normalizeResetsAt,
  normalizeUtilizationPercent,
} from "../../src/agents/usage-parser.ts";

describe("US-02 Office Usage", () => {
  describe("Pure Parser Unit Tests", () => {
    it("normalizeUtilizationPercent", () => {
      expect(normalizeUtilizationPercent(0.35)).toBe(35);
      expect(normalizeUtilizationPercent(0.0)).toBe(0);
      expect(normalizeUtilizationPercent(1.0)).toBe(100);
    });

    it("normalizeResetsAt", () => {
      const timestamp = 1800000000;
      const result = normalizeResetsAt(timestamp);
      expect(result).toBe(new Date(timestamp * 1000).toISOString());
    });

    it("formatRateLimitWindow", () => {
      expect(formatRateLimitWindow("five_hour")).toBe("5h");
      expect(formatRateLimitWindow("seven_day")).toBe("7d");
    });

    it("extractTokenUsage", () => {
      const input = {
        total_cost_usd: 0.04,
        usage: {
          input_tokens: 1200,
          output_tokens: 300,
          cache_read_input_tokens: 500,
          context_window: 200000,
        },
      };
      const result = extractTokenUsage(input);
      expect(result).toEqual({
        costUsd: 0.04,
        inputTokens: 1200,
        outputTokens: 300,
        contextUsed: 1700,
        contextWindow: 200000,
      });
    });

    it("isRateLimitErrorMessage", () => {
      expect(isRateLimitErrorMessage("Rate limit exceeded")).toBe(true);
      expect(isRateLimitErrorMessage("Success")).toBe(false);
    });
  });

  describe("US-02 / AC-01 & AC-02: Hiring and Rate Limit Updates", () => {
    it("updates boss usage on rate_limit_event", async () => {
      const h = createHarness();
      await hireWorking(h);
      h.sdk.last.emit({
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed",
          utilization: 0.35,
          resetsAt: 1800000000,
          rateLimitType: "five_hour",
        },
        uuid: "u1",
        session_id: "s1",
      });
      await waitFor(
        () => h.office.getState().bosses.find((b) => b.id === "claude")?.usage?.utilizationPercent === 35,
      );

      const boss = h.office.getState().bosses.find((b) => b.id === "claude")!;
      expect(boss.usage?.utilizationPercent).toBe(35);
      expect(boss.usage?.remainingPercent).toBe(65);
      expect(boss.usage?.windowLabel).toBe("5h");
      expect(boss.usage?.resetsAt).toBe(new Date(1800000000 * 1000).toISOString());
      expect(h.emitted).toContainEqual(expect.objectContaining({ type: "boss_updated" }));
    });

    it("updates employee and boss usage on result", async () => {
      const h = createHarness();
      const emp = await hireWorking(h);
      h.sdk.last.emit({
        type: "result",
        subtype: "success",
        total_cost_usd: 0.04,
        modelUsage: {
          "claude-sonnet": {
            inputTokens: 1200,
            outputTokens: 300,
            cacheReadInputTokens: 500,
            contextWindow: 200000,
          },
        },
        session_id: "s1",
      });
      await waitFor(
        () => h.office.getState().employees.find((e) => e.id === emp.id)?.usage?.inputTokens === 1200,
      );

      const employee = h.office.getState().employees.find((e) => e.id === emp.id)!;
      expect(employee.usage).toMatchObject({
        inputTokens: 1200,
        outputTokens: 300,
        contextUsed: 1700,
        contextWindow: 200000,
        costUsd: 0.04,
      });

      const boss = h.office.getState().bosses.find((b) => b.id === "claude")!;
      expect(boss.usage?.inputTokens).toBe(1200);
      expect(boss.usage?.outputTokens).toBe(300);
    });
  });
});

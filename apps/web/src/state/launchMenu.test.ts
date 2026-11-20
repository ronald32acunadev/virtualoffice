import { describe, expect, it } from "vitest";
import type { LaunchTarget } from "../api/types";
import { canLaunchTarget, formatLaunchFeedback, isCurrentEmployee, launchKindLabel } from "./launchMenu";

describe("launchMenu", () => {
  describe("launchKindLabel", () => {
    it("returns the display label for each launch target kind", () => {
      expect(launchKindLabel("desktop_app")).toBe("App");
      expect(launchKindLabel("terminal_cli")).toBe("Terminal");
      expect(launchKindLabel("folder")).toBe("Folder");
    });
  });

  describe("canLaunchTarget", () => {
    it("returns true for available targets and false for unavailable targets", () => {
      const availableTarget: LaunchTarget = {
        id: "chatgpt",
        label: "ChatGPT",
        kind: "desktop_app",
        available: true,
      };
      const unavailableTarget: LaunchTarget = {
        id: "codex-cli",
        label: "Codex CLI",
        kind: "terminal_cli",
        available: false,
        unavailableReason: "codex binary not found in PATH",
      };

      expect(canLaunchTarget(availableTarget)).toBe(true);
      expect(canLaunchTarget(unavailableTarget)).toBe(false);
    });
  });

  describe("isCurrentEmployee", () => {
    it("returns true only when the response matches the active employee", () => {
      expect(isCurrentEmployee("emp-1", "emp-1")).toBe(true);
      expect(isCurrentEmployee("emp-1", "emp-2")).toBe(false);
    });
  });

  describe("formatLaunchFeedback", () => {
    it("formats the opened confirmation label for a target", () => {
      const target: LaunchTarget = {
        id: "chatgpt",
        label: "ChatGPT",
        kind: "desktop_app",
        available: true,
      };
      expect(formatLaunchFeedback(target)).toBe("Opened ChatGPT");
    });
  });
});

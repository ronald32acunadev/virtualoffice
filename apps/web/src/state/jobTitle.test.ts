import { describe, expect, it } from "vitest";
import { JOB_TITLE_PRESETS, normalizeJobTitle, validateJobTitle } from "./jobTitle";
import { employeeLabel } from "./role";

describe("jobTitle", () => {
  describe("JOB_TITLE_PRESETS", () => {
    it("is non-empty and includes 'Software Engineer' and 'Architect'", () => {
      expect(JOB_TITLE_PRESETS).not.toHaveLength(0);
      expect(JOB_TITLE_PRESETS).toContain("Software Engineer");
      expect(JOB_TITLE_PRESETS).toContain("Architect");
    });
  });

  describe("normalizeJobTitle", () => {
    it("trims whitespace and returns null for blank strings", () => {
      expect(normalizeJobTitle("")).toBeNull();
      expect(normalizeJobTitle("   ")).toBeNull();
      expect(normalizeJobTitle("\t\n")).toBeNull();
    });
  });

  describe("validateJobTitle", () => {
    it("allows up to 60 characters and returns an error string for 61+ characters", () => {
      const validTitle = "a".repeat(60);
      const invalidTitle = "a".repeat(61);
      expect(validateJobTitle(validTitle)).toBeNull();
      expect(validateJobTitle(invalidTitle)).not.toBeNull();
    });
  });
});

describe("role", () => {
  describe("employeeLabel", () => {
    it("renders jobTitle, role, both independently, and neither cleanly", () => {
      const employee = { name: "Rex", jobTitle: "Architect", role: "review-risk" };
      expect(employeeLabel(employee)).toBe("Rex · Architect · review-risk");

      const employeeWithNullRole = { name: "Rex", jobTitle: "Architect", role: null };
      expect(employeeLabel(employeeWithNullRole)).toBe("Rex · Architect");

      const employeeWithNullJobTitle = { name: "Rex", jobTitle: null, role: "review-risk" };
      expect(employeeLabel(employeeWithNullJobTitle)).toBe("Rex · review-risk");

      const employeeWithNulls = { name: "Rex", jobTitle: null, role: null };
      expect(employeeLabel(employeeWithNulls)).toBe("Rex");
    });
  });
});

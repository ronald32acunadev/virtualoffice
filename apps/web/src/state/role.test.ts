import { describe, expect, it } from "vitest";
import { employeeLabel, groupRoleOptions } from "./role";

describe("US-03 / AC-04 role label", () => {
  it("reads Name · role when set and just Name otherwise", () => {
    expect(employeeLabel({ name: "Rex", role: "review-risk" })).toBe("Rex · review-risk");
    expect(employeeLabel({ name: "Rex", role: null })).toBe("Rex");
  });
});

describe("US-03 / AC-01 role options", () => {
  it("lists the owner's agents apart from built-in ones", () => {
    const grouped = groupRoleOptions([
      { name: "review-risk", description: "d", builtin: false },
      { name: "Explore", description: "d", builtin: true },
    ]);
    expect(grouped.owner.map((a) => a.name)).toEqual(["review-risk"]);
    expect(grouped.builtin.map((a) => a.name)).toEqual(["Explore"]);
  });
});

import { describe, expect, it } from "vitest";
import { NAME_LIST, generateName, generateSpecies } from "../../src/office/domain/names.ts";
import { SPECIES } from "../../src/office/domain/types.ts";
import { createHarness } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

describe("US-04 named characters", () => {
  it("US-04 / AC-01: the built-in list has at least 40 short names", () => {
    expect(NAME_LIST.length).toBeGreaterThanOrEqual(40);
    expect(new Set(NAME_LIST.map((n) => n.toLowerCase())).size).toBe(NAME_LIST.length);
    expect(NAME_LIST.every((n) => n.length <= 12)).toBe(true);
  });

  it("US-04 / AC-01: generated names avoid names in use and fall back to name + number", () => {
    expect(generateName(["Milo"], () => 0)).toBe("Luna");
    expect(generateName(["milo", "LUNA"], () => 0)).toBe("Otto");
    expect(generateName(NAME_LIST, () => 0)).toBe("Milo 2");
    expect(generateName([...NAME_LIST, "Milo 2"], () => 0)).toBe("Milo 3");
  });

  it("US-04 / AC-01: species comes from the contract list", () => {
    expect([0, 0.2, 0.5, 0.99].map((r) => generateSpecies(() => r))).toEqual(["wolf", "dog", "cat", "human"]);
    expect(new Set(SPECIES)).toEqual(new Set(["wolf", "dog", "fox", "cat", "bear", "human"]));
  });

  it("US-04 / AC-01: creating agents generates distinct names while default chats share the agent", async () => {
    const h = createHarness(undefined, { random: () => 0 });
    const agentA = h.office.createAgent({ bossId: "claude" });
    const agentB = h.office.createAgent({ bossId: "claude" });
    expect([agentA.name, agentB.name]).toEqual(["Milo", "Luna"]);
    expect(agentA.species).toBe("wolf");

    const a = h.office.hire({ bossId: "claude", task: "a", workingDirectory: h.dir });
    const b = h.office.hire({ bossId: "claude", task: "b", workingDirectory: h.dir });
    await waitFor(() => h.sdk.sessions.length === 2);
    expect([a.name, b.name]).toEqual(["Milo", "Milo"]);
    expect(a.agentId).toBe(agentA.id);
    expect(b.agentId).toBe(agentA.id);
    expect(a.importedAt).toBeNull();
  });

  it("US-04 / AC-02: a typed name (trimmed) and species are used as given; names need not be unique", async () => {
    const h = createHarness();
    const a = h.office.hire({ bossId: "claude", task: "a", workingDirectory: h.dir, name: "  Rex  ", species: "bear" });
    const b = h.office.hire({ bossId: "claude", task: "b", workingDirectory: h.dir, name: "Rex", species: "fox" });
    expect(a).toMatchObject({ name: "Rex", species: "bear" });
    expect(b.name).toBe("Rex");
  });

  it("US-04 / AC-02: an empty, too long, or non-string name and an unknown species are rejected and nothing is created", () => {
    const h = createHarness();
    const base = { bossId: "claude", task: "a", workingDirectory: h.dir };
    for (const name of ["", "   ", "x".repeat(41), 7]) {
      expect(() => h.office.hire({ ...base, name })).toThrowError(expect.objectContaining({ code: "validation_error", field: "name" }));
    }
    expect(() => h.office.hire({ ...base, species: "dragon" })).toThrowError(
      expect.objectContaining({ code: "validation_error", field: "species" }),
    );
    expect(h.repository.listEmployees()).toHaveLength(0);
    expect(h.sdk.sessions).toHaveLength(0);
    expect(h.office.hire({ ...base, name: "x".repeat(40) }).name).toHaveLength(40);
  });

  it("US-04 / AC-03: renaming and changing species persists and publishes employee_updated", () => {
    const h = createHarness();
    const e = h.office.hire({ bossId: "claude", task: "a", workingDirectory: h.dir, name: "Rex", species: "dog" });
    const before = h.emitted.length;
    const updated = h.office.updateProfile(e.id, { name: " Ada ", species: "fox" });
    expect(updated).toMatchObject({ name: "Ada", species: "fox" });
    expect(h.repository.getEmployee(e.id)).toMatchObject({ name: "Ada", species: "fox" });
    expect(h.emitted.slice(before)).toContainEqual({ type: "employee_updated", employee: updated });
    expect(h.office.updateProfile(e.id, { species: "cat" })).toMatchObject({ name: "Ada", species: "cat" });
  });

  it("US-04 / AC-03: invalid values are rejected and nothing changes", () => {
    const h = createHarness();
    const e = h.office.hire({ bossId: "claude", task: "a", workingDirectory: h.dir, name: "Rex", species: "dog" });
    const before = h.emitted.length;
    for (const input of [{}, { name: "" }, { name: "y".repeat(41) }, { species: "dragon" }, { name: "Ok", species: "dragon" }]) {
      expect(() => h.office.updateProfile(e.id, input)).toThrowError(expect.objectContaining({ code: "validation_error" }));
    }
    expect(() => h.office.updateProfile("nope", { name: "x" })).toThrowError(expect.objectContaining({ code: "not_found" }));
    expect(h.repository.getEmployee(e.id)).toMatchObject({ name: "Rex", species: "dog" });
    expect(h.emitted).toHaveLength(before);
  });
});

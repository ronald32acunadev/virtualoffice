import { describe, expect, it } from "vitest";
import { WORLD_THEME_IDS } from "../scene/themes/registry";
import { buildThemeOptions } from "./SettingsModal";

describe("buildThemeOptions", () => {
  it("US-02 / AC-01: returns 4 options in WORLD_THEME_IDS order with office selected", () => {
    const options = buildThemeOptions("office");

    expect(options).toHaveLength(4);
    expect(options.map((o) => o.id)).toEqual(["office", "western", "horror", "metal"]);

    const office = options[0]!;
    expect(office.selected).toBe(true);
    expect(office.label).toBeTruthy();
    expect(office.shortLabel).toBeTruthy();
    expect(office.description).toBeTruthy();
    expect(office.swatchColors).toHaveLength(3);

    for (const option of options) {
      expect(option.label).toBeTruthy();
      expect(option.shortLabel).toBeTruthy();
      expect(option.description).toBeTruthy();
      expect(option.swatchColors).toHaveLength(3);
    }
  });

  it("US-02 / AC-01: marks only metal as selected when metal is the current theme", () => {
    const options = buildThemeOptions("metal");

    const selected = options.filter((o) => o.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.id).toBe("metal");

    for (const option of options) {
      if (option.id === "metal") {
        expect(option.selected).toBe(true);
      } else {
        expect(option.selected).toBe(false);
      }
    }
  });

  it("US-02 / AC-01: marks exactly one matching theme as selected for western and horror", () => {
    const westernOptions = buildThemeOptions("western");
    const westernSelected = westernOptions.filter((o) => o.selected);
    expect(westernSelected).toHaveLength(1);
    expect(westernSelected[0]!.id).toBe("western");

    const horrorOptions = buildThemeOptions("horror");
    const horrorSelected = horrorOptions.filter((o) => o.selected);
    expect(horrorSelected).toHaveLength(1);
    expect(horrorSelected[0]!.id).toBe("horror");
  });
});

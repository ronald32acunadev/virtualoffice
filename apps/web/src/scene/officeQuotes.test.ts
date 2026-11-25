import { describe, expect, it } from "vitest";
import {
  CHATTER_STORAGE_KEY,
  STATUS_QUOTES,
  THE_OFFICE_QUOTES,
  pickOfficeQuote,
  pickSpeaker,
  readSavedChatter,
  saveChatter,
} from "./officeQuotes";
import { WORLD_THEME_IDS } from "./themes/registry";
import { THEME_QUOTE_BANKS } from "./themes/themeQuotes";

describe("officeQuotes", () => {
  it("US-05 / AC-01: THE_OFFICE_QUOTES is populated and pickOfficeQuote avoids repeating lastQuote back-to-back", () => {
    expect(THE_OFFICE_QUOTES.length).toBeGreaterThanOrEqual(16);

    for (const lastQuote of THE_OFFICE_QUOTES) {
      for (const roll of [0, 0.25, 0.5, 0.999]) {
        const picked = pickOfficeQuote(undefined, lastQuote, () => roll);
        expect(THE_OFFICE_QUOTES).toContain(picked);
        expect(picked).not.toBe(lastQuote);
      }
    }
  });

  it("US-05 / AC-01: pickOfficeQuote uses status-aware pools for working, waiting_approval, idle, on_break, and failed", () => {
    const statuses = ["working", "waiting_approval", "idle", "on_break", "failed"] as const;
    for (const status of statuses) {
      const statusPool = STATUS_QUOTES[status] ?? [];
      expect(statusPool.length).toBeGreaterThan(0);

      const first = pickOfficeQuote(status, null, () => 0);
      expect(statusPool).toContain(first);

      const next = pickOfficeQuote(status, first, () => 0);
      expect(next).not.toBe(first);
    }
  });

  it("US-05 / AC-02: pickSpeaker handles empty, single, and multi-speaker pools without back-to-back repeats", () => {
    expect(pickSpeaker([], null)).toBeNull();

    const solo = [{ id: "emp-1" }];
    expect(pickSpeaker(solo, "emp-1", () => 0)).toEqual({ id: "emp-1" });

    const duo = [{ id: "emp-1" }, { id: "boss:claude" }];
    for (const roll of [0, 0.4, 0.99]) {
      expect(pickSpeaker(duo, "emp-1", () => roll)).toEqual({ id: "boss:claude" });
      expect(pickSpeaker(duo, "boss:claude", () => roll)).toEqual({ id: "emp-1" });
    }

    const trio = [{ id: "emp-1" }, { id: "emp-2" }, { id: "boss:claude" }];
    for (const roll of [0, 0.5, 0.99]) {
      const picked = pickSpeaker(trio, "boss:claude", () => roll);
      expect(picked).not.toBeNull();
      expect(picked?.id).not.toBe("boss:claude");
    }
  });

  it("US-05 / AC-03: readSavedChatter and saveChatter default to true, persist toggles, and survive throwing storage", () => {
    const store = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(readSavedChatter(null)).toBe(true);
    expect(readSavedChatter(memoryStorage)).toBe(true);

    saveChatter(false, memoryStorage);
    expect(store.get(CHATTER_STORAGE_KEY)).toBe("false");
    expect(readSavedChatter(memoryStorage)).toBe(false);

    saveChatter(true, memoryStorage);
    expect(store.get(CHATTER_STORAGE_KEY)).toBe("true");
    expect(readSavedChatter(memoryStorage)).toBe(true);

    store.set(CHATTER_STORAGE_KEY, "off");
    expect(readSavedChatter(memoryStorage)).toBe(false);

    store.set(CHATTER_STORAGE_KEY, "unexpected-value");
    expect(readSavedChatter(memoryStorage)).toBe(true);

    const throwingStorage = {
      getItem: () => {
        throw new Error("Storage disabled");
      },
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    };

    expect(readSavedChatter(throwingStorage)).toBe(true);
    expect(() => saveChatter(false, throwingStorage)).not.toThrow();
  });

  it("US-05 / AC-01: pickOfficeQuote returns themed quotes for all 4 themes without back-to-back repeats", () => {
    expect(WORLD_THEME_IDS.length).toBe(4);
    const officeQuote = pickOfficeQuote(undefined, null, () => 0, "office");
    expect(THE_OFFICE_QUOTES).toContain(officeQuote);

    for (const theme of ["western", "horror", "metal"] as const) {
      const bank = THEME_QUOTE_BANKS[theme];
      expect(bank.general.length).toBeGreaterThan(0);

      const generalQuote = pickOfficeQuote(undefined, null, () => 0, theme);
      expect(bank.general).toContain(generalQuote);

      const workingQuote = pickOfficeQuote("working", null, () => 0, theme);
      expect(bank.byStatus.working).toContain(workingQuote);

      const repeated = pickOfficeQuote(undefined, generalQuote, () => 0, theme);
      expect(repeated).not.toBe(generalQuote);
    }
  });
});

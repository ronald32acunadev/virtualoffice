import * as fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  WORLD_THEMES,
  WORLD_THEME_IDS,
  getThemePalette,
  getWorldTheme,
  type WorldThemeId,
} from "../scene/themes/registry";
import { MOOD_PALETTES } from "../scene/officeTheme";
import {
  OFFICE_UI_PALETTES,
  getTerminalTheme,
  type MoodRoot,
  type StorageEventLike,
} from "./officeMood";
import {
  THEME_STORAGE_KEY,
  applyWorldTheme,
  createWorldThemeSync,
  parseWorldTheme,
  readSavedWorldTheme,
  saveWorldTheme,
} from "./worldTheme";
import { parseWindowMessage, type ChannelLike } from "./windowChannel";

function fakeChannel() {
  const sent: unknown[] = [];
  const channel: ChannelLike & { sent: unknown[]; receive: (data: unknown) => void } = {
    sent,
    onmessage: null,
    postMessage(data: unknown) {
      sent.push(data);
    },
    close() {},
    receive(data: unknown) {
      if (channel.onmessage) {
        channel.onmessage({ data });
      }
    },
  };
  return channel;
}

describe("US-01 / AC-01: WORLD_THEMES registry", () => {
  it("exposes the four theme IDs in order", () => {
    expect(WORLD_THEME_IDS).toEqual(["office", "western", "horror", "metal"]);
  });

  it("has non-empty metadata, 3 swatches, and all palette slots for every theme", () => {
    for (const id of WORLD_THEME_IDS) {
      const theme = WORLD_THEMES[id];
      expect(theme.id).toBe(id);
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.shortLabel.length).toBeGreaterThan(0);
      expect(theme.description.length).toBeGreaterThan(0);
      expect(theme.swatchColors).toHaveLength(3);
      expect(theme.tvStandbyTitle.length).toBeGreaterThan(0);
      expect(theme.tvStandbySubtitle.length).toBeGreaterThan(0);
      expect(theme.palettes.day).toBeTruthy();
      expect(theme.palettes.evening).toBeTruthy();
      expect(theme.uiPalettes.day).toBeTruthy();
      expect(theme.uiPalettes.evening).toBeTruthy();
      expect(theme.terminalThemes.day).toBeTruthy();
      expect(theme.terminalThemes.evening).toBeTruthy();
    }
  });

  it("office theme matches MOOD_PALETTES and OFFICE_UI_PALETTES", () => {
    const office = WORLD_THEMES.office;
    expect(office.palettes).toEqual(MOOD_PALETTES);
    expect(office.uiPalettes).toEqual(OFFICE_UI_PALETTES);
  });

  it("getWorldTheme and getThemePalette resolve each theme", () => {
    for (const id of WORLD_THEME_IDS) {
      expect(getWorldTheme(id)).toBe(WORLD_THEMES[id]);
      expect(getThemePalette(id, "day")).toBe(WORLD_THEMES[id].palettes.day);
      expect(getThemePalette(id, "evening")).toBe(WORLD_THEMES[id].palettes.evening);
    }
  });

  it("contains no #212121 or #171717 colors", () => {
    const json = JSON.stringify(WORLD_THEMES);
    expect(json).not.toContain("#212121");
    expect(json).not.toContain("#171717");
  });
});

describe("US-01 / AC-02: parse, read, and save world theme", () => {
  it("parseWorldTheme accepts all 4 IDs", () => {
    expect(parseWorldTheme("office")).toBe("office");
    expect(parseWorldTheme("western")).toBe("western");
    expect(parseWorldTheme("horror")).toBe("horror");
    expect(parseWorldTheme("metal")).toBe("metal");
  });

  it("parseWorldTheme returns null for invalid inputs", () => {
    expect(parseWorldTheme(null)).toBeNull();
    expect(parseWorldTheme("")).toBeNull();
    expect(parseWorldTheme("cyberpunk")).toBeNull();
    expect(parseWorldTheme(123)).toBeNull();
  });

  it("readSavedWorldTheme reads a valid saved theme", () => {
    const storage = {
      getItem: vi.fn((key: string) => (key === THEME_STORAGE_KEY ? "western" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(readSavedWorldTheme(storage)).toBe("western");
  });

  it("readSavedWorldTheme falls back to office on invalid value", () => {
    const storage = {
      getItem: vi.fn(() => "cyberpunk"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(readSavedWorldTheme(storage)).toBe("office");
  });

  it("readSavedWorldTheme falls back to office on missing value", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(readSavedWorldTheme(storage)).toBe("office");
  });

  it("readSavedWorldTheme falls back to office when storage throws", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage error");
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(readSavedWorldTheme(storage)).toBe("office");
  });

  it("saveWorldTheme writes THEME_STORAGE_KEY", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    saveWorldTheme("metal", storage);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "metal");
  });

  it("saveWorldTheme ignores throwing storage", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("storage error");
      }),
      removeItem: vi.fn(),
    };
    expect(() => saveWorldTheme("horror", storage)).not.toThrow();
  });
});

describe("US-01 / AC-03: applyWorldTheme and createWorldThemeSync", () => {
  it("applyWorldTheme sets root.dataset.officeTheme", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    applyWorldTheme("western", root);
    expect(root.dataset["officeTheme"]).toBe("western");
  });

  it("createWorldThemeSync reads saved theme and applies on mount", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    const storage = {
      getItem: vi.fn((key: string) => (key === THEME_STORAGE_KEY ? "horror" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const channel = fakeChannel();
    const onThemeChange = vi.fn();
    const subscribeStorage = vi.fn(() => () => {});

    const sync = createWorldThemeSync({
      onThemeChange,
      storage,
      root,
      channel,
      subscribeStorage,
    });

    expect(sync.getTheme()).toBe("horror");
    expect(root.dataset["officeTheme"]).toBe("horror");
    expect(subscribeStorage).toHaveBeenCalled();
    sync.dispose();
  });

  it("setTheme persists, updates dataset, calls onThemeChange, and posts message", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const channel = fakeChannel();
    const onThemeChange = vi.fn();
    const subscribeStorage = vi.fn(() => () => {});

    const sync = createWorldThemeSync({
      onThemeChange,
      storage,
      root,
      channel,
      subscribeStorage,
    });

    sync.setTheme("metal");

    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "metal");
    expect(root.dataset["officeTheme"]).toBe("metal");
    expect(onThemeChange).toHaveBeenCalledWith("metal");
    expect(channel.sent).toContainEqual({ type: "theme_changed", theme: "metal" });
    sync.dispose();
  });

  it("receiving channel theme_changed message updates state and dataset", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const channel = fakeChannel();
    const onThemeChange = vi.fn();
    const subscribeStorage = vi.fn(() => () => {});

    const sync = createWorldThemeSync({
      onThemeChange,
      storage,
      root,
      channel,
      subscribeStorage,
    });

    channel.receive({ type: "theme_changed", theme: "western" });

    expect(sync.getTheme()).toBe("western");
    expect(root.dataset["officeTheme"]).toBe("western");
    expect(onThemeChange).toHaveBeenCalledWith("western");
    sync.dispose();
  });

  it("subscribeStorage event with THEME_STORAGE_KEY updates state and dataset", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const channel = fakeChannel();
    const onThemeChange = vi.fn();
    let storageHandler: ((event: StorageEventLike) => void) | null = null;
    const subscribeStorage = vi.fn((handler: (event: StorageEventLike) => void) => {
      storageHandler = handler;
      return () => {
        storageHandler = null;
      };
    });

    const sync = createWorldThemeSync({
      onThemeChange,
      storage,
      root,
      channel,
      subscribeStorage,
    });

    expect(storageHandler).not.toBeNull();
    storageHandler!({ key: THEME_STORAGE_KEY, newValue: "horror" } as StorageEventLike);

    expect(sync.getTheme()).toBe("horror");
    expect(root.dataset["officeTheme"]).toBe("horror");
    expect(onThemeChange).toHaveBeenCalledWith("horror");
    sync.dispose();
  });

  it("handles invalid channel messages safely", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const channel = fakeChannel();
    const onThemeChange = vi.fn();
    const subscribeStorage = vi.fn(() => () => {});

    const sync = createWorldThemeSync({
      onThemeChange,
      storage,
      root,
      channel,
      subscribeStorage,
    });

    expect(() => channel.receive({ type: "unknown", data: 1 })).not.toThrow();
    expect(() => channel.receive({ type: "theme_changed", theme: "cyberpunk" })).not.toThrow();
    expect(sync.getTheme()).toBe("office");
    sync.dispose();
  });

  it("handles throwing storage and channel safely", () => {
    const root = { dataset: {} } as unknown as MoodRoot;
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage error");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage error");
      }),
      removeItem: vi.fn(),
    };
    const channel = fakeChannel();
    channel.postMessage = vi.fn(() => {
      throw new Error("channel error");
    });
    const onThemeChange = vi.fn();
    const subscribeStorage = vi.fn(() => () => {});

    const sync = createWorldThemeSync({
      onThemeChange,
      storage,
      root,
      channel,
      subscribeStorage,
    });

    expect(sync.getTheme()).toBe("office");
    expect(() => sync.setTheme("metal")).not.toThrow();
    sync.dispose();
  });
});

describe("US-01 / AC-04: parseWindowMessage, getTerminalTheme, and styles.css", () => {
  it("parseWindowMessage parses valid theme_changed for all 4 IDs", () => {
    for (const id of WORLD_THEME_IDS) {
      expect(parseWindowMessage({ type: "theme_changed", theme: id })).toEqual({
        type: "theme_changed",
        theme: id,
      });
    }
  });

  it("parseWindowMessage returns null for invalid or missing theme", () => {
    expect(parseWindowMessage({ type: "theme_changed", theme: "cyberpunk" })).toBeNull();
    expect(parseWindowMessage({ type: "theme_changed" })).toBeNull();
    expect(parseWindowMessage({ type: "other" })).toBeNull();
    expect(parseWindowMessage(null)).toBeNull();
  });

  it("getTerminalTheme returns distinct readable palettes for all 4 themes x 2 moods", () => {
    const seen = new Set<string>();
    for (const id of WORLD_THEME_IDS) {
      for (const mood of ["day", "evening"] as const) {
        const palette = getTerminalTheme(mood, id);
        expect(palette).toBeTruthy();
        const key = `${id}:${mood}:${JSON.stringify(palette)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("getTerminalTheme defaults to office when theme is invalid", () => {
    const officeDay = getTerminalTheme("day", "office");
    expect(getTerminalTheme("day", "invalid" as WorldThemeId)).toEqual(officeDay);
  });

  it("styles.css contains all 6 data-office-theme/mood selectors and no forbidden colors", () => {
    const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf-8");
    for (const id of ["western", "horror", "metal"] as const) {
      for (const mood of ["day", "evening"] as const) {
        expect(css).toContain(`[data-office-theme="${id}"][data-office-mood="${mood}"]`);
      }
    }
    expect(css).not.toContain("#212121");
    expect(css).not.toContain("#171717");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOOD_STORAGE_KEY } from "../scene/camera";
import type { LightingMood } from "../scene/officeTheme";
import { createMoodSync, parseMoodValue, applyOfficeMood, type MoodRoot, type StorageEventLike } from "./officeMood";
import type { ChannelLike } from "./windowChannel";

type FakeChannel = ChannelLike & { sent: unknown[]; receive: (data: unknown) => void };

function fakeChannel(): FakeChannel {
  const channel: FakeChannel = {
    sent: [],
    onmessage: null,
    postMessage: (data) => {
      channel.sent.push(data);
    },
    close: () => {},
    receive: (data) => channel.onmessage?.({ data }),
  };
  return channel;
}

describe("officeMood", () => {
  it("US-01 / AC-01: parses mood values", () => {
    expect(parseMoodValue("day")).toBe("day");
    expect(parseMoodValue("evening")).toBe("evening");
    expect(parseMoodValue("midnight")).toBeNull();
    expect(parseMoodValue(null)).toBeNull();
    expect(parseMoodValue(123)).toBeNull();
  });

  it("US-01 / AC-01: applies office mood to root dataset", () => {
    const root: MoodRoot = { dataset: {} };
    applyOfficeMood("evening", root);
    expect(root.dataset["officeMood"]).toBe("evening");
  });

  it("US-01 / AC-01: createMoodSync reads saved mood and applies on mount", () => {
    const storage = {
      getItem: (key: string) => (key === MOOD_STORAGE_KEY ? "evening" : null),
      setItem: () => {},
    };
    const root: MoodRoot = { dataset: {} };
    const changes: LightingMood[] = [];
    const controller = createMoodSync({
      onMoodChange: (m) => changes.push(m),
      storage,
      root,
      channel: null,
      subscribeStorage: () => () => {},
    });

    expect(controller.getMood()).toBe("evening");
    expect(root.dataset["officeMood"]).toBe("evening");
    controller.dispose();
  });

  it("US-01 / AC-02: toggleMood switches day/evening, persists, updates root, invokes callback, and posts on channel", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
    };
    const root: MoodRoot = { dataset: {} };
    const channel = fakeChannel();
    const changes: LightingMood[] = [];

    const controller = createMoodSync({
      onMoodChange: (m) => changes.push(m),
      storage,
      root,
      channel,
      subscribeStorage: () => () => {},
    });

    expect(controller.getMood()).toBe("day");
    const next = controller.toggleMood();
    expect(next).toBe("evening");
    expect(controller.getMood()).toBe("evening");
    expect(store.get(MOOD_STORAGE_KEY)).toBe("evening");
    expect(root.dataset["officeMood"]).toBe("evening");
    expect(changes).toEqual(["evening"]);
    expect(channel.sent).toEqual([{ type: "mood_changed", mood: "evening" }]);

    controller.dispose();
  });

  it("US-01 / AC-03: receives mood_changed via channel and storage events", () => {
    const root: MoodRoot = { dataset: {} };
    const channel = fakeChannel();
    const changes: LightingMood[] = [];
    let storageListener: ((event: StorageEventLike) => void) | undefined;

    const controller = createMoodSync({
      onMoodChange: (m) => changes.push(m),
      storage: { getItem: () => null, setItem: () => {} },
      root,
      channel,
      subscribeStorage: (listener) => {
        storageListener = listener;
        return () => {};
      },
    });

    expect(controller.getMood()).toBe("day");

    // Receive channel message
    channel.receive({ type: "mood_changed", mood: "evening" });
    expect(controller.getMood()).toBe("evening");
    expect(root.dataset["officeMood"]).toBe("evening");
    expect(changes).toEqual(["evening"]);

    // Receive storage event
    storageListener?.({ key: MOOD_STORAGE_KEY, newValue: "day" });
    expect(controller.getMood()).toBe("day");
    expect(root.dataset["officeMood"]).toBe("day");
    expect(changes).toEqual(["evening", "day"]);

    // Unrelated storage key ignored
    storageListener?.({ key: "other_key", newValue: "evening" });
    expect(controller.getMood()).toBe("day");

    controller.dispose();
  });

  it("US-01 / AC-04: handles throwing channel and storage gracefully", () => {
    const badChannel: ChannelLike = {
      postMessage: () => {
        throw new Error("fail post");
      },
      onmessage: null,
      close: () => {
        throw new Error("fail close");
      },
    };
    const badStorage = {
      getItem: () => {
        throw new Error("fail get");
      },
      setItem: () => {
        throw new Error("fail set");
      },
    };

    const controller = createMoodSync({
      onMoodChange: () => {},
      storage: badStorage,
      channel: badChannel,
      subscribeStorage: () => () => {},
    });

    expect(() => controller.setMood("evening")).not.toThrow();
    expect(() => controller.dispose()).not.toThrow();
  });
});

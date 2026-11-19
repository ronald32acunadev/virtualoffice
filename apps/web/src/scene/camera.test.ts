import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  MOOD_STORAGE_KEY,
  PAN_BOUNDS,
  clampCameraTarget,
  readSavedMood,
  saveMood,
} from "./camera";

describe("camera", () => {
  it("US-04 / AC-01: clampCameraTarget preserves in-bounds targets and clamps out-of-range X/Y/Z", () => {
    expect(DEFAULT_CAMERA_POSITION).toEqual([0, 17, 21]);
    expect(DEFAULT_CAMERA_TARGET).toEqual([0, 0.5, 0]);

    expect(clampCameraTarget(3, 1.2, -5)).toEqual([3, 1.2, -5]);
    expect(clampCameraTarget(PAN_BOUNDS.minX, PAN_BOUNDS.minY, PAN_BOUNDS.minZ)).toEqual([
      PAN_BOUNDS.minX,
      PAN_BOUNDS.minY,
      PAN_BOUNDS.minZ,
    ]);
    expect(clampCameraTarget(PAN_BOUNDS.maxX, PAN_BOUNDS.maxY, PAN_BOUNDS.maxZ)).toEqual([
      PAN_BOUNDS.maxX,
      PAN_BOUNDS.maxY,
      PAN_BOUNDS.maxZ,
    ]);

    expect(clampCameraTarget(-45, -2, 80)).toEqual([PAN_BOUNDS.minX, PAN_BOUNDS.minY, PAN_BOUNDS.maxZ]);
    expect(clampCameraTarget(99, 10, -50)).toEqual([PAN_BOUNDS.maxX, PAN_BOUNDS.maxY, PAN_BOUNDS.minZ]);
    expect(clampCameraTarget(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toEqual([
      DEFAULT_CAMERA_TARGET[0],
      DEFAULT_CAMERA_TARGET[1],
      DEFAULT_CAMERA_TARGET[2],
    ]);
  });

  it("US-04 / AC-02: readSavedMood and saveMood persist valid moods and fall back safely", () => {
    const store = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(readSavedMood(null)).toBe("day");
    expect(readSavedMood(memoryStorage)).toBe("day");

    saveMood("evening", memoryStorage);
    expect(store.get(MOOD_STORAGE_KEY)).toBe("evening");
    expect(readSavedMood(memoryStorage)).toBe("evening");

    saveMood("day", memoryStorage);
    expect(readSavedMood(memoryStorage)).toBe("day");

    store.set(MOOD_STORAGE_KEY, "midnight");
    expect(readSavedMood(memoryStorage)).toBe("day");

    const throwingStorage = {
      getItem: () => {
        throw new Error("Storage disabled");
      },
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    };

    expect(readSavedMood(throwingStorage)).toBe("day");
    expect(() => saveMood("evening", throwingStorage)).not.toThrow();
  });
});

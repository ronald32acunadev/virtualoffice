import type { LightingMood } from "./officeTheme";

export const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 17, 21];
export const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0.5, 0];

export const TV_FOCUS_CAMERA_POSITION: [number, number, number] = [0.2, 3.4, -4.6];
export const TV_FOCUS_CAMERA_TARGET: [number, number, number] = [0.2, 2.85, -12];

export const PAN_BOUNDS = {
  minX: -12,
  maxX: 12,
  minZ: -12,
  maxZ: 12,
  minY: 0,
  maxY: 3,
} as const;

export const MOOD_STORAGE_KEY = "virtualoffice:mood";

function clampValue(value: number, min: number, max: number, fallback: number): number {
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, safe));
}

/** Clamps OrbitControls target coordinates within the office room bounds. */
export function clampCameraTarget(x: number, y: number, z: number): [number, number, number] {
  return [
    clampValue(x, PAN_BOUNDS.minX, PAN_BOUNDS.maxX, DEFAULT_CAMERA_TARGET[0]),
    clampValue(y, PAN_BOUNDS.minY, PAN_BOUNDS.maxY, DEFAULT_CAMERA_TARGET[1]),
    clampValue(z, PAN_BOUNDS.minZ, PAN_BOUNDS.maxZ, DEFAULT_CAMERA_TARGET[2]),
  ];
}

function resolveDefaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the saved lighting mood from storage, falling back safely to "day". */
export function readSavedMood(storage?: Pick<Storage, "getItem"> | null): LightingMood {
  const target = storage === undefined ? resolveDefaultStorage() : storage;
  if (!target) return "day";
  try {
    const raw = target.getItem(MOOD_STORAGE_KEY);
    return raw === "evening" ? "evening" : "day";
  } catch {
    return "day";
  }
}

/** Persists the selected lighting mood to storage without throwing on restricted environments. */
export function saveMood(mood: LightingMood, storage?: Pick<Storage, "setItem"> | null): void {
  const target = storage === undefined ? resolveDefaultStorage() : storage;
  if (!target) return;
  try {
    target.setItem(MOOD_STORAGE_KEY, mood);
  } catch {
    // Ignore storage quota or security errors in restricted browsers.
  }
}

import { MOOD_STORAGE_KEY, readSavedMood, saveMood } from "../scene/camera";
import type { LightingMood } from "../scene/officeTheme";
import { parseWindowMessage, openWindowChannel, type ChannelLike } from "./windowChannel";
import { useCallback, useEffect, useRef, useState } from "react";

export type MoodRoot = { dataset: Record<string, string | undefined> };
export type StorageEventLike = { key: string | null; newValue: string | null };

export function parseMoodValue(raw: unknown): LightingMood | null {
  if (raw === "day" || raw === "evening") return raw;
  return null;
}

export function applyOfficeMood(mood: LightingMood, root?: MoodRoot | null): void {
  const target =
    root === undefined
      ? typeof document !== "undefined"
        ? (document.documentElement as unknown as MoodRoot)
        : null
      : root;
  if (!target) return;
  try {
    target.dataset["officeMood"] = mood;
  } catch {
    // Ignore restricted environment errors
  }
}

export type MoodSyncOptions = {
  onMoodChange: (mood: LightingMood) => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  root?: MoodRoot | null;
  channel?: ChannelLike | null;
  subscribeStorage?: (listener: (event: StorageEventLike) => void) => () => void;
};

export type MoodSyncController = {
  getMood: () => LightingMood;
  setMood: (next: LightingMood) => void;
  toggleMood: () => LightingMood;
  dispose: () => void;
};

export function createMoodSync(options: MoodSyncOptions): MoodSyncController {
  let current: LightingMood = readSavedMood(options.storage);
  applyOfficeMood(current, options.root);

  const channel = options.channel === undefined ? openWindowChannel() : options.channel;
  if (channel) {
    channel.onmessage = (event) => {
      const msg = parseWindowMessage(event.data);
      if (msg?.type !== "mood_changed") return;
      if (msg.mood === current) return;
      current = msg.mood;
      applyOfficeMood(current, options.root);
      options.onMoodChange(current);
    };
  }

  const subscribe =
    options.subscribeStorage ??
    ((listener) => {
      if (typeof window === "undefined") return () => {};
      const handler = (e: StorageEvent) => {
        listener({ key: e.key, newValue: e.newValue });
      };
      window.addEventListener("storage", handler as EventListener);
      return () => window.removeEventListener("storage", handler as EventListener);
    });

  const unsubscribe = subscribe((event) => {
    if (event.key === MOOD_STORAGE_KEY) {
      const parsed = parseMoodValue(event.newValue);
      if (parsed && parsed !== current) {
        current = parsed;
        applyOfficeMood(current, options.root);
        options.onMoodChange(current);
      }
    }
  });

  const setMood = (next: LightingMood) => {
    current = next;
    try {
      saveMood(next, options.storage);
    } catch {
      // Ignore storage errors
    }
    applyOfficeMood(next, options.root);
    if (channel) {
      try {
        channel.postMessage({ type: "mood_changed", mood: next });
      } catch {
        // Ignore channel errors
      }
    }
    options.onMoodChange(next);
  };

  const toggleMood = () => {
    const next: LightingMood = current === "day" ? "evening" : "day";
    setMood(next);
    return next;
  };

  const dispose = () => {
    unsubscribe();
    if (channel) {
      try {
        channel.onmessage = null;
        channel.close();
      } catch {
        // Ignore channel close errors
      }
    }
  };

  return {
    getMood: () => current,
    setMood,
    toggleMood,
    dispose,
  };
}

export function useOfficeMood(): {
  mood: LightingMood;
  setMood: (next: LightingMood) => void;
  toggleMood: () => void;
} {
  const [mood, setMoodState] = useState<LightingMood>(() => readSavedMood());
  const controllerRef = useRef<MoodSyncController | null>(null);

  useEffect(() => {
    const controller = createMoodSync({
      onMoodChange: setMoodState,
    });
    controllerRef.current = controller;
    setMoodState(controller.getMood());
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, []);

  const setMood = useCallback((next: LightingMood) => {
    if (controllerRef.current) {
      controllerRef.current.setMood(next);
    } else {
      saveMood(next);
      applyOfficeMood(next);
      setMoodState(next);
    }
  }, []);

  const toggleMood = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.toggleMood();
    } else {
      setMoodState((prev) => {
        const next = prev === "day" ? "evening" : "day";
        saveMood(next);
        applyOfficeMood(next);
        return next;
      });
    }
  }, []);

  return {
    mood,
    setMood,
    toggleMood,
  };
}

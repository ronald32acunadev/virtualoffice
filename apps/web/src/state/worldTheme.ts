import { useCallback, useEffect, useRef, useState } from "react";
import { WORLD_THEME_IDS, type WorldThemeId } from "../scene/themes/registry";
import type { MoodRoot, StorageEventLike } from "./officeMood";
import { openWindowChannel, parseWindowMessage, type ChannelLike } from "./windowChannel";

export const THEME_STORAGE_KEY = "virtualoffice:theme";

export function parseWorldTheme(raw: unknown): WorldThemeId | null {
  if (typeof raw === "string" && (WORLD_THEME_IDS as readonly string[]).includes(raw)) {
    return raw as WorldThemeId;
  }
  return null;
}

function resolveDefaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readSavedWorldTheme(storage?: Pick<Storage, "getItem"> | null): WorldThemeId {
  const target = storage === undefined ? resolveDefaultStorage() : storage;
  if (target === null) return "office";
  try {
    const raw = target.getItem(THEME_STORAGE_KEY);
    const parsed = parseWorldTheme(raw);
    return parsed ?? "office";
  } catch {
    return "office";
  }
}

export function saveWorldTheme(theme: WorldThemeId, storage?: Pick<Storage, "setItem"> | null): void {
  const target = storage === undefined ? resolveDefaultStorage() : storage;
  if (target === null) return;
  try {
    target.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function applyWorldTheme(theme: WorldThemeId, root?: MoodRoot | null): void {
  const target = root === undefined
    ? (typeof document !== "undefined" ? (document.documentElement as unknown as MoodRoot) : null)
    : root;
  if (target === null) return;
  try {
    target.dataset["officeTheme"] = theme;
  } catch {
    // ignore
  }
}

export type WorldThemeSyncOptions = {
  onThemeChange: (theme: WorldThemeId) => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  root?: MoodRoot | null;
  channel?: ChannelLike | null;
  subscribeStorage?: (listener: (event: StorageEventLike) => void) => () => void;
};

export type WorldThemeSyncController = {
  getTheme: () => WorldThemeId;
  setTheme: (next: WorldThemeId) => void;
  dispose: () => void;
};

export function createWorldThemeSync(options: WorldThemeSyncOptions): WorldThemeSyncController {
  let current: WorldThemeId = readSavedWorldTheme(options.storage);
  applyWorldTheme(current, options.root);

  const channel = options.channel === undefined ? openWindowChannel() : options.channel;

  if (channel) {
    channel.onmessage = (event) => {
      const msg = parseWindowMessage(event.data);
      if (msg?.type !== "theme_changed") return;
      if (msg.theme === current) return;
      current = msg.theme;
      applyWorldTheme(current, options.root);
      options.onThemeChange(current);
    };
  }

  const storageListener = (event: StorageEventLike) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const parsed = parseWorldTheme(event.newValue);
    if (parsed === null) return;
    if (parsed === current) return;
    current = parsed;
    applyWorldTheme(current, options.root);
    options.onThemeChange(current);
  };

  let unsubscribe: (() => void) | null = null;
  if (options.subscribeStorage) {
    unsubscribe = options.subscribeStorage(storageListener);
  } else if (typeof window !== "undefined") {
    window.addEventListener("storage", storageListener);
    unsubscribe = () => {
      window.removeEventListener("storage", storageListener);
    };
  }

  const setTheme = (next: WorldThemeId) => {
    current = next;
    saveWorldTheme(next, options.storage);
    applyWorldTheme(next, options.root);
    if (channel) {
      try {
        channel.postMessage({ type: "theme_changed", theme: next });
      } catch {
        // ignore
      }
    }
    options.onThemeChange(next);
  };

  const dispose = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (channel) {
      try {
        channel.onmessage = null;
        channel.close();
      } catch {
        // ignore
      }
    }
  };

  return {
    getTheme: () => current,
    setTheme,
    dispose,
  };
}

export function useWorldTheme(): { theme: WorldThemeId; setTheme: (next: WorldThemeId) => void } {
  const [theme, setThemeState] = useState<WorldThemeId>(() => readSavedWorldTheme());
  const controllerRef = useRef<WorldThemeSyncController | null>(null);

  useEffect(() => {
    const controller = createWorldThemeSync({
      onThemeChange: (next) => {
        setThemeState(next);
      },
    });
    controllerRef.current = controller;
    setThemeState(controller.getTheme());
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  const setTheme = useCallback((next: WorldThemeId) => {
    controllerRef.current?.setTheme(next);
  }, []);

  return { theme, setTheme };
}

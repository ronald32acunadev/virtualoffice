import type { EmployeeStatus } from "../api/types";
import type { WorldThemeId } from "./themes/registry";
import { THEME_QUOTE_BANKS } from "./themes/themeQuotes";

export const THE_OFFICE_QUOTES: readonly string[] = [
  "Bears. Beets. Battlestar Galactica.",
  "Identity theft is not a joke, Jim!",
  "I declare bankruptcy!",
  "Sometimes I'll start a sentence and I don't even know where it's going.",
  "I'm not superstitious, but I am a little stitious.",
  "Assistant TO the Regional Manager.",
  "Why waste time say lot word when few word do trick?",
  "Parkour!",
  "No God, please no!",
  "I am Beyoncé, always.",
  "Would I rather be feared or loved? Easy. Both.",
  "Fact: bears eat beets.",
  "That's what she said.",
  "I'm an early bird and a night owl. So I'm wise and I have worms.",
  "Whenever I'm about to do something, I think, 'Would an idiot do that?'",
  "I talk a lot, so I've learned to tune myself out.",
];

export const STATUS_QUOTES: Partial<Record<EmployeeStatus, readonly string[]>> = {
  working: [
    "Dunder Mifflin, this is Pam.",
    "I am fast. To give you a reference point, I am somewhere between a snake and a mongoose.",
    "Through concentration, I can raise and lower my cholesterol at will.",
    "I'm an early bird and a night owl. So I'm wise and I have worms.",
  ],
  waiting_approval: [
    "Did I stutter?",
    "Well, well, well, how the turntables...",
    "Assistant TO the Regional Manager.",
    "Whenever I'm about to do something, I think, 'Would an idiot do that?'",
  ],
  idle: [
    "Well, I like Pretzel Day.",
    "Sometimes I'll start a sentence and I don't even know where it's going.",
    "I talk a lot, so I've learned to tune myself out.",
    "I'm not superstitious, but I am a little stitious.",
  ],
  on_break: [
    "Coffee break! Back right after the quota resets.",
    "It's Pretzel Day break — recharging for the next sprint.",
    "Even Dundie winners need a breather.",
    "Stepping away from the keyboard while limits cool down.",
  ],
  failed: [
    "Why are you the way that you are?",
    "No God, please no!",
    "I declare bankruptcy!",
    "The worst thing about prison was the Dementors!",
  ],
};

export const CHATTER_STORAGE_KEY = "virtualoffice:chatter";

function pickIndex(length: number, rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return length - 1;
  return Math.floor(value * length);
}

/** Picks a random The Office quote (prioritizing status-relevant lines) without repeating `lastQuote` back-to-back. */
export function pickOfficeQuote(
  status?: EmployeeStatus,
  lastQuote?: string | null,
  rng: () => number = Math.random,
  theme: WorldThemeId = "office",
): string {
  const bank = theme === "office" ? null : THEME_QUOTE_BANKS[theme];
  const statusPool = status ? (bank ? bank.byStatus[status] ?? [] : STATUS_QUOTES[status] ?? []) : [];
  const generalPool = bank ? bank.general : THE_OFFICE_QUOTES;
  const combined = Array.from(new Set([...statusPool, ...generalPool]));
  const filtered =
    lastQuote && combined.length > 1
      ? combined.filter((quote) => quote !== lastQuote)
      : combined;
  const pool = filtered.length > 0 ? filtered : combined;
  return pool[pickIndex(pool.length, rng)] ?? "Bears. Beets. Battlestar Galactica.";
}

/** Picks a speaker from `speakers` while avoiding `lastSpeakerId` back-to-back when multiple speakers exist. */
export function pickSpeaker<T extends { id: string }>(
  speakers: readonly T[],
  lastSpeakerId?: string | null,
  rng: () => number = Math.random,
): T | null {
  if (speakers.length === 0) return null;
  const candidates =
    lastSpeakerId && speakers.length > 1
      ? speakers.filter((speaker) => speaker.id !== lastSpeakerId)
      : speakers;
  const pool = candidates.length > 0 ? candidates : speakers;
  return pool[pickIndex(pool.length, rng)] ?? null;
}

function resolveDefaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads whether office quote chatter is enabled, defaulting safely to `true`. */
export function readSavedChatter(storage?: Pick<Storage, "getItem"> | null): boolean {
  const target = storage === undefined ? resolveDefaultStorage() : storage;
  if (!target) return true;
  try {
    const raw = target.getItem(CHATTER_STORAGE_KEY);
    return raw !== "off" && raw !== "false";
  } catch {
    return true;
  }
}

/** Persists the office quote chatter toggle without throwing on restricted storage environments. */
export function saveChatter(enabled: boolean, storage?: Pick<Storage, "setItem"> | null): void {
  const target = storage === undefined ? resolveDefaultStorage() : storage;
  if (!target) return;
  try {
    target.setItem(CHATTER_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage quota or security errors in restricted browsers.
  }
}

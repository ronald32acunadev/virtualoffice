import { SPECIES, type Species } from "./types.ts";

export const NAME_LIST: readonly string[] = [
  "Milo", "Luna", "Otto", "Nova", "Pip", "Juno", "Rex", "Maple", "Finn", "Zoe",
  "Bruno", "Ivy", "Echo", "Atlas", "Willow", "Sage", "Cleo", "Biscuit", "Orion", "Poppy",
  "Ziggy", "Hazel", "Sunny", "Pixel", "Mochi", "Ember", "Rocco", "Daisy", "Felix", "Olive",
  "Tango", "Wren", "Cosmo", "Lola", "Moss", "Pepper", "Quinn", "Rusty", "Sparky", "Tilly",
  "Basil", "Coco", "Dash", "Fern", "Gus", "Hugo", "Indie", "Jasper", "Kiwi", "Lumi",
];

export type RandomFn = () => number;

function pick<T>(items: readonly T[], random: RandomFn): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index] as T;
}

/** A name from the built-in list that no other employee uses; name + number when exhausted. */
export function generateName(usedNames: Iterable<string>, random: RandomFn): string {
  const used = new Set([...usedNames].map((name) => name.trim().toLowerCase()));
  const free = NAME_LIST.filter((name) => !used.has(name.toLowerCase()));
  if (free.length > 0) return pick(free, random);
  const base = pick(NAME_LIST, random);
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export function generateSpecies(random: RandomFn): Species {
  return pick(SPECIES, random);
}

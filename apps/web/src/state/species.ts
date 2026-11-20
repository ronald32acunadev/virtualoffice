import type { Species } from "../api/types";

export const SPECIES_LIST: readonly Species[] = ["wolf", "dog", "fox", "cat", "bear", "human"];

export const SPECIES_EMOJI: Record<Species, string> = {
  wolf: "🐺",
  dog: "🐶",
  fox: "🦊",
  cat: "🐱",
  bear: "🐻",
  human: "🧑",
};

export function speciesLabel(species: Species): string {
  return species.charAt(0).toUpperCase() + species.slice(1);
}

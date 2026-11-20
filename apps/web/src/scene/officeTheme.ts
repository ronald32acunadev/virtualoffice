import type { BossId, EmployeeStatus } from "../api/types";
import { bossDeskPosition, employeeDeskPosition } from "./layout";

export type LightingMood = "day" | "evening";

export type MoodPalette = {
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  fillColor: string;
  fillIntensity: number;
  windowGlow: string;
  lampIntensity: number;
  lampEmissive: string;
  exteriorSky: string;
  wallColor: string;
  trimColor: string;
};

export const MOOD_PALETTES: Record<LightingMood, MoodPalette> = {
  day: {
    sky: "#cfe6f8",
    fog: "#dcebf7",
    fogNear: 36,
    fogFar: 78,
    ambientIntensity: 0.35,
    hemiSky: "#edf6ff",
    hemiGround: "#d9c2a3",
    hemiIntensity: 0.78,
    sunColor: "#fff5e4",
    sunIntensity: 1.55,
    sunPosition: [14, 22, 12],
    fillColor: "#d9edff",
    fillIntensity: 0.45,
    windowGlow: "#eff8ff",
    lampIntensity: 0.15,
    lampEmissive: "#ffe4b5",
    exteriorSky: "#7fb069",
    wallColor: "#f2ece1",
    trimColor: "#c49a6c",
  },
  evening: {
    sky: "#2a3654",
    fog: "#242e48",
    fogNear: 30,
    fogFar: 68,
    ambientIntensity: 0.22,
    hemiSky: "#4f6499",
    hemiGround: "#4d3b2b",
    hemiIntensity: 0.45,
    sunColor: "#9eb8f5",
    sunIntensity: 0.55,
    sunPosition: [-12, 18, 10],
    fillColor: "#ffb86c",
    fillIntensity: 0.36,
    windowGlow: "#364a78",
    lampIntensity: 1.4,
    lampEmissive: "#ffbe6b",
    exteriorSky: "#2a4033",
    wallColor: "#ddd2c2",
    trimColor: "#9e774e",
  },
};

export type MonitorVisual = {
  screen: string;
  emissive: string;
  emissiveIntensity: number;
  accent: string;
};

export const MONITOR_VISUALS: Record<EmployeeStatus, MonitorVisual> = {
  working: {
    screen: "#102a2e",
    emissive: "#3be898",
    emissiveIntensity: 0.9,
    accent: "#7efcd0",
  },
  waiting_approval: {
    screen: "#36250c",
    emissive: "#ffb02e",
    emissiveIntensity: 1.05,
    accent: "#ffd57e",
  },
  idle: {
    screen: "#1d2a3a",
    emissive: "#6ea8e5",
    emissiveIntensity: 0.38,
    accent: "#a8cef5",
  },
  starting: {
    screen: "#1b2840",
    emissive: "#8fb8ff",
    emissiveIntensity: 0.65,
    accent: "#c4dbff",
  },
  stopped: {
    screen: "#1a1d22",
    emissive: "#22262e",
    emissiveIntensity: 0.04,
    accent: "#4e545e",
  },
  failed: {
    screen: "#381216",
    emissive: "#f04e4e",
    emissiveIntensity: 1.0,
    accent: "#ff9a9a",
  },
};

export const OFFICE_HALF_SIZE = 15;

export type PropKind =
  | "plant"
  | "bookshelf"
  | "whiteboard"
  | "coffee_bar"
  | "water_cooler"
  | "wall_art"
  | "lounge_rug";

export type PropPlacement = {
  id: string;
  kind: PropKind;
  position: [number, number, number];
  rotationY?: number;
  radius: number;
  variant?: number;
};

export const PROP_PLACEMENTS: readonly PropPlacement[] = [
  // Corner and walkway potted plants
  { id: "plant-nw", kind: "plant", position: [-13.8, 0, -13.8], radius: 0.65, variant: 0 },
  { id: "plant-ne", kind: "plant", position: [13.8, 0, -13.8], radius: 0.65, variant: 1 },
  { id: "plant-sw", kind: "plant", position: [-13.8, 0, 13.8], radius: 0.65, variant: 2 },
  { id: "plant-se", kind: "plant", position: [13.8, 0, 13.8], radius: 0.65, variant: 0 },
  { id: "plant-back-center", kind: "plant", position: [-2.4, 0, -13.9], radius: 0.55, variant: 1 },
  { id: "plant-left-south", kind: "plant", position: [-13.8, 0, 4.6], radius: 0.55, variant: 2 },

  // Bookshelves along back and left cutaway walls
  { id: "bookshelf-back-left", kind: "bookshelf", position: [-11.2, 0, -14.0], radius: 0.9, variant: 0 },
  { id: "bookshelf-back-right", kind: "bookshelf", position: [3.4, 0, -14.0], radius: 0.9, variant: 1 },
  {
    id: "bookshelf-left-north",
    kind: "bookshelf",
    position: [-14.0, 0, -8.5],
    rotationY: Math.PI / 2,
    radius: 0.9,
    variant: 1,
  },
  {
    id: "bookshelf-left-south",
    kind: "bookshelf",
    position: [-14.0, 0, 9.5],
    rotationY: Math.PI / 2,
    radius: 0.9,
    variant: 0,
  },

  // Large whiteboard mounted on the back wall center pier
  { id: "whiteboard-main", kind: "whiteboard", position: [0, 0, -14.5], radius: 0.45 },

  // Cozy coffee bar & water cooler along the left wall walkway
  {
    id: "coffee-bar",
    kind: "coffee_bar",
    position: [-13.7, 0, 0.5],
    rotationY: Math.PI / 2,
    radius: 1.05,
  },
  { id: "water-cooler", kind: "water_cooler", position: [-13.8, 0, -2.5], radius: 0.55 },

  // Framed minimalist art on the left wall
  {
    id: "wall-art-north",
    kind: "wall_art",
    position: [-14.65, 0, -5.5],
    rotationY: Math.PI / 2,
    radius: 0.3,
    variant: 0,
  },
  {
    id: "wall-art-south",
    kind: "wall_art",
    position: [-14.65, 0, 6.5],
    rotationY: Math.PI / 2,
    radius: 0.3,
    variant: 1,
  },

  // Central corridor lounge runner rug
  { id: "lounge-rug-center", kind: "lounge_rug", position: [0, 0, 0.2], radius: 1.5 },
];

const BOSS_IDS: readonly BossId[] = ["claude", "codex", "opencode", "gemini"];
const EMPLOYEE_SLOTS_PER_BOSS = 9;

function circleOverlapsBox(
  cx: number,
  cz: number,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const closestX = Math.max(minX, Math.min(cx, maxX));
  const closestZ = Math.max(minZ, Math.min(cz, maxZ));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * Checks whether a circular footprint `(x, z, radius)` collides with any boss desk
 * or the first 9 employee desk workstations across all 4 quadrants.
 */
export function overlapsAnyDesk(x: number, z: number, radius: number): boolean {
  for (const bossId of BOSS_IDS) {
    const [bx, , bz] = bossDeskPosition(bossId);
    if (circleOverlapsBox(x, z, radius, bx - 1.35, bx + 1.35, bz - 0.55, bz + 1.45)) {
      return true;
    }

    for (let i = 0; i < EMPLOYEE_SLOTS_PER_BOSS; i += 1) {
      const [ex, , ez] = employeeDeskPosition(bossId, i);
      if (circleOverlapsBox(x, z, radius, ex - 0.95, ex + 0.95, ez - 0.5, ez + 1.4)) {
        return true;
      }
    }
  }
  return false;
}

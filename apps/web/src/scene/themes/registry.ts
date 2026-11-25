import { MOOD_PALETTES } from "../officeTheme";
import type { LightingMood, MoodPalette } from "../officeTheme";
import type { OfficeUiPalette, TerminalThemePalette } from "../../state/officeMood";

export const WORLD_THEME_IDS = ["office", "western", "horror", "metal"] as const;

export type WorldThemeId = (typeof WORLD_THEME_IDS)[number];

export type WorldThemeDefinition = {
  id: WorldThemeId;
  label: string;
  shortLabel: string;
  description: string;
  swatchColors: [string, string, string];
  tvStandbyTitle: string;
  tvStandbySubtitle: string;
  palettes: Record<LightingMood, MoodPalette>;
  uiPalettes: Record<LightingMood, OfficeUiPalette>;
  terminalThemes: Record<LightingMood, TerminalThemePalette>;
};

export const WORLD_THEMES: Record<WorldThemeId, WorldThemeDefinition> = {
  office: {
    id: "office",
    label: "Virtual Office",
    shortLabel: "Office",
    description: "Warm studio office with daylight windows and cozy evening lamps.",
    swatchColors: ["#f2ece1", "#c49a6c", "#c46d49"],
    tvStandbyTitle: "OFFICE TV",
    tvStandbySubtitle: "Stream music or videos live on the office screen",
    palettes: MOOD_PALETTES,
    uiPalettes: {
      day: { bg: "#f7f2ea", panel: "#ede5d8", card: "#f2ece1", border: "#d2bc9c", text: "#2c2218", muted: "#6d5c4b", accent: "#c46d49" },
      evening: { bg: "#1d263b", panel: "#171f33", card: "#242e48", border: "#5a4b44", text: "#f3ece2", muted: "#b7ad9f", accent: "#ffbe6b" },
    },
    terminalThemes: {
      day: {
        background: "#f2ece1",
        foreground: "#2c2218",
        cursor: "#c46d49",
        selectionBackground: "rgba(196, 109, 73, 0.25)",
      },
      evening: {
        background: "#171f33",
        foreground: "#f3ece2",
        cursor: "#ffbe6b",
        selectionBackground: "rgba(255, 190, 107, 0.25)",
      },
    },
  },
  western: {
    id: "western",
    label: "Western Camp",
    shortLabel: "Western",
    description: "Frontier desert camp with canvas tents, cacti, and crackling campfires.",
    swatchColors: ["#e6c38e", "#a4572c", "#d97b29"],
    tvStandbyTitle: "TRAIL MARQUEE",
    tvStandbySubtitle: "Play frontier tunes or videos by the campfire",
    palettes: {
      day: {
        sky: "#f4d9a8",
        fog: "#e8c48a",
        fogNear: 12,
        fogFar: 90,
        ambientIntensity: 0.85,
        hemiSky: "#f7e3b8",
        hemiGround: "#b57a3c",
        hemiIntensity: 0.9,
        sunColor: "#fff2cf",
        sunIntensity: 1.6,
        sunPosition: [18, 30, 12],
        fillColor: "#e8b878",
        fillIntensity: 0.45,
        windowGlow: "#ffe9b0",
        lampIntensity: 0.25,
        lampEmissive: "#ffcf8a",
        exteriorSky: "#f4d9a8",
        wallColor: "#c98a4a",
        trimColor: "#7a4a22",
      },
      evening: {
        sky: "#2a2440",
        fog: "#3a2e4a",
        fogNear: 8,
        fogFar: 70,
        ambientIntensity: 0.35,
        hemiSky: "#3a2e5a",
        hemiGround: "#4a2a1a",
        hemiIntensity: 0.4,
        sunColor: "#ff8a3a",
        sunIntensity: 0.9,
        sunPosition: [-20, 8, -14],
        fillColor: "#ff6a2a",
        fillIntensity: 0.5,
        windowGlow: "#ffb060",
        lampIntensity: 1.4,
        lampEmissive: "#ff9a40",
        exteriorSky: "#2a2440",
        wallColor: "#5a3a22",
        trimColor: "#3a2414",
      },
    },
    uiPalettes: {
      day: {
        bg: "#f4e4c4",
        panel: "#e8d0a4",
        card: "#f0dcb8",
        border: "#b58a52",
        text: "#3a2a18",
        muted: "#7a5a3a",
        accent: "#a4572c",
      },
      evening: {
        bg: "#1a1428",
        panel: "#241c34",
        card: "#2a2038",
        border: "#4a3a5a",
        text: "#f0e4d4",
        muted: "#a090b0",
        accent: "#d97b29",
      },
    },
    terminalThemes: {
      day: {
        background: "#f4e4c4",
        foreground: "#3a2a18",
        cursor: "#a4572c",
        selectionBackground: "rgba(164, 87, 44, 0.25)",
      },
      evening: {
        background: "#1a1428",
        foreground: "#f0e4d4",
        cursor: "#ff9a40",
        selectionBackground: "rgba(255, 154, 64, 0.25)",
      },
    },
  },
  horror: {
    id: "horror",
    label: "Horror Office",
    shortLabel: "Horror",
    description: "Haunted late-night office with cobwebs, boarded windows, and flickering candles.",
    swatchColors: ["#3e4a44", "#7b2cbf", "#c94a4a"],
    tvStandbyTitle: "CURSED MONITOR",
    tvStandbySubtitle: "Tune into eerie signals or late-night streams",
    palettes: {
      day: {
        sky: "#6a7a72",
        fog: "#5a6a62",
        fogNear: 6,
        fogFar: 50,
        ambientIntensity: 0.4,
        hemiSky: "#7a8a82",
        hemiGround: "#3a4a42",
        hemiIntensity: 0.5,
        sunColor: "#a0b0a8",
        sunIntensity: 0.5,
        sunPosition: [10, 20, 8],
        fillColor: "#8a9a92",
        fillIntensity: 0.3,
        windowGlow: "#90a098",
        lampIntensity: 0.3,
        lampEmissive: "#b0c0b8",
        exteriorSky: "#6a7a72",
        wallColor: "#4a5a52",
        trimColor: "#2a3a32",
      },
      evening: {
        sky: "#1a1028",
        fog: "#2a1a38",
        fogNear: 4,
        fogFar: 40,
        ambientIntensity: 0.2,
        hemiSky: "#2a1a3a",
        hemiGround: "#1a1020",
        hemiIntensity: 0.3,
        sunColor: "#4a2a5a",
        sunIntensity: 0.3,
        sunPosition: [-15, 6, -10],
        fillColor: "#c94a4a",
        fillIntensity: 0.4,
        windowGlow: "#ff8a40",
        lampIntensity: 1.6,
        lampEmissive: "#ff6a30",
        exteriorSky: "#1a1028",
        wallColor: "#2a2030",
        trimColor: "#1a1420",
      },
    },
    uiPalettes: {
      day: {
        bg: "#3e4a44",
        panel: "#4a5a52",
        card: "#526258",
        border: "#6a7a72",
        text: "#e0e8e4",
        muted: "#a0b0a8",
        accent: "#7b2cbf",
      },
      evening: {
        bg: "#120c1a",
        panel: "#1a1224",
        card: "#201830",
        border: "#3a2a4a",
        text: "#e8e0f0",
        muted: "#9080a0",
        accent: "#c94a4a",
      },
    },
    terminalThemes: {
      day: {
        background: "#3e4a44",
        foreground: "#e0e8e4",
        cursor: "#7b2cbf",
        selectionBackground: "rgba(123, 44, 191, 0.25)",
      },
      evening: {
        background: "#120c1a",
        foreground: "#e8e0f0",
        cursor: "#ff6a30",
        selectionBackground: "rgba(255, 106, 48, 0.25)",
      },
    },
  },
  metal: {
    id: "metal",
    label: "Metal Concert",
    shortLabel: "Metal",
    description: "Live heavy-metal concert stage with lighting trusses, amp stacks, and pyro.",
    swatchColors: ["#242733", "#e11d48", "#f59e0b"],
    tvStandbyTitle: "STAGE JUMBOTRON",
    tvStandbySubtitle: "Blast concert sets, metal playlists, or live video",
    palettes: {
      day: {
        sky: "#8ab4d4",
        fog: "#a0c0d8",
        fogNear: 15,
        fogFar: 100,
        ambientIntensity: 0.7,
        hemiSky: "#b0d0e8",
        hemiGround: "#6a7a8a",
        hemiIntensity: 0.8,
        sunColor: "#fff8e8",
        sunIntensity: 1.4,
        sunPosition: [20, 35, 15],
        fillColor: "#c0d8e8",
        fillIntensity: 0.4,
        windowGlow: "#e0f0ff",
        lampIntensity: 0.2,
        lampEmissive: "#d0e8ff",
        exteriorSky: "#8ab4d4",
        wallColor: "#4a5568",
        trimColor: "#2d3748",
      },
      evening: {
        sky: "#0a0a14",
        fog: "#1a1028",
        fogNear: 5,
        fogFar: 60,
        ambientIntensity: 0.15,
        hemiSky: "#1a1030",
        hemiGround: "#0a0a14",
        hemiIntensity: 0.25,
        sunColor: "#e11d48",
        sunIntensity: 0.6,
        sunPosition: [-10, 12, -8],
        fillColor: "#f59e0b",
        fillIntensity: 0.7,
        windowGlow: "#ff2a5a",
        lampIntensity: 2.0,
        lampEmissive: "#ff4a6a",
        exteriorSky: "#0a0a14",
        wallColor: "#1a1a2a",
        trimColor: "#0f0f1a",
      },
    },
    uiPalettes: {
      day: {
        bg: "#242733",
        panel: "#2d3040",
        card: "#343848",
        border: "#4a4e60",
        text: "#e8eaf0",
        muted: "#a0a4b8",
        accent: "#e11d48",
      },
      evening: {
        bg: "#0a0a14",
        panel: "#12121e",
        card: "#181828",
        border: "#2a2a40",
        text: "#f0f0f8",
        muted: "#8080a0",
        accent: "#f59e0b",
      },
    },
    terminalThemes: {
      day: {
        background: "#242733",
        foreground: "#e8eaf0",
        cursor: "#e11d48",
        selectionBackground: "rgba(225, 29, 72, 0.25)",
      },
      evening: {
        background: "#0a0a14",
        foreground: "#f0f0f8",
        cursor: "#f59e0b",
        selectionBackground: "rgba(245, 158, 11, 0.25)",
      },
    },
  },
};

export function getWorldTheme(theme: WorldThemeId): WorldThemeDefinition {
  return WORLD_THEMES[theme];
}

export function getThemePalette(theme: WorldThemeId, mood: LightingMood): MoodPalette {
  return WORLD_THEMES[theme].palettes[mood];
}

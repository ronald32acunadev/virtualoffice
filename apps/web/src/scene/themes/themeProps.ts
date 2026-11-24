import { PROP_PLACEMENTS, type PropPlacement } from "../officeTheme";
import { WORLD_THEMES, type WorldThemeId } from "./registry";

export type ThemePropKind =
  | "cactus"
  | "tent"
  | "campfire"
  | "barrel"
  | "wagon_wheel"
  | "candle_cluster"
  | "cobweb"
  | "haunted_frame"
  | "dead_plant"
  | "speaker_stack"
  | "stage_light_tower"
  | "pyro_pot"
  | "amp_crate";

export type ThemePropPlacement = {
  id: string;
  kind: ThemePropKind;
  position: [number, number, number];
  rotationY?: number;
  radius: number;
  variant?: number;
};

export const WESTERN_PROPS: readonly ThemePropPlacement[] = [
  { id: "western-campfire-1", kind: "campfire", position: [0, 0, 0.2], radius: 1.1 },
  { id: "western-tent-1", kind: "tent", position: [-11.2, 0, -14.0], radius: 0.9 },
  { id: "western-tent-2", kind: "tent", position: [3.4, 0, -14.0], radius: 0.9 },
  { id: "western-cactus-1", kind: "cactus", position: [-13.8, 0, -13.8], radius: 0.65 },
  { id: "western-cactus-2", kind: "cactus", position: [13.8, 0, -13.8], radius: 0.65 },
  { id: "western-cactus-3", kind: "cactus", position: [-13.8, 0, 13.8], radius: 0.65 },
  { id: "western-cactus-4", kind: "cactus", position: [13.8, 0, 13.8], radius: 0.65 },
  { id: "western-barrel-1", kind: "barrel", position: [-14.0, 0, -8.5], radius: 0.9 },
  { id: "western-barrel-2", kind: "barrel", position: [-14.0, 0, 9.5], radius: 0.9 },
  { id: "western-wagon-wheel-1", kind: "wagon_wheel", position: [-13.8, 0, -2.5], radius: 0.55 },
  { id: "western-wagon-wheel-2", kind: "wagon_wheel", position: [-13.8, 0, 4.6], radius: 0.55 },
  { id: "western-barrel-3", kind: "barrel", position: [-13.7, 0, 0.5], radius: 0.95 },
];

export const HORROR_PROPS: readonly ThemePropPlacement[] = [
  { id: "horror-candle-1", kind: "candle_cluster", position: [0, 0, 0.2], radius: 1.2 },
  { id: "horror-dead-plant-1", kind: "dead_plant", position: [-13.8, 0, -13.8], radius: 0.65 },
  { id: "horror-dead-plant-2", kind: "dead_plant", position: [13.8, 0, -13.8], radius: 0.65 },
  { id: "horror-dead-plant-3", kind: "dead_plant", position: [-13.8, 0, 13.8], radius: 0.65 },
  { id: "horror-dead-plant-4", kind: "dead_plant", position: [13.8, 0, 13.8], radius: 0.65 },
  { id: "horror-cobweb-1", kind: "cobweb", position: [-2.4, 0, -13.9], radius: 0.55 },
  { id: "horror-cobweb-2", kind: "cobweb", position: [-13.8, 0, -2.5], radius: 0.55 },
  { id: "horror-frame-1", kind: "haunted_frame", position: [-13.8, 0, 4.6], radius: 0.55 },
  { id: "horror-frame-2", kind: "haunted_frame", position: [-13.7, 0, 0.5], radius: 0.95 },
  { id: "horror-candle-2", kind: "candle_cluster", position: [-14.0, 0, -8.5], radius: 0.9 },
  { id: "horror-candle-3", kind: "candle_cluster", position: [-14.0, 0, 9.5], radius: 0.9 },
  { id: "horror-dead-plant-5", kind: "dead_plant", position: [-11.2, 0, -14.0], radius: 0.9 },
];

export const METAL_PROPS: readonly ThemePropPlacement[] = [
  { id: "metal-pyro-1", kind: "pyro_pot", position: [0, 0, 0.2], radius: 1.2 },
  { id: "metal-speaker-1", kind: "speaker_stack", position: [-13.8, 0, -13.8], radius: 0.65 },
  { id: "metal-speaker-2", kind: "speaker_stack", position: [13.8, 0, -13.8], radius: 0.65 },
  { id: "metal-speaker-3", kind: "speaker_stack", position: [-13.8, 0, 13.8], radius: 0.65 },
  { id: "metal-speaker-4", kind: "speaker_stack", position: [13.8, 0, 13.8], radius: 0.65 },
  { id: "metal-light-1", kind: "stage_light_tower", position: [-14.0, 0, -8.5], radius: 0.9 },
  { id: "metal-light-2", kind: "stage_light_tower", position: [-14.0, 0, 9.5], radius: 0.9 },
  { id: "metal-light-3", kind: "stage_light_tower", position: [-2.4, 0, -13.9], radius: 0.55 },
  { id: "metal-pyro-2", kind: "pyro_pot", position: [-11.2, 0, -14.0], radius: 0.9 },
  { id: "metal-pyro-3", kind: "pyro_pot", position: [3.4, 0, -14.0], radius: 0.9 },
  { id: "metal-amp-1", kind: "amp_crate", position: [-13.8, 0, -2.5], radius: 0.55 },
  { id: "metal-amp-2", kind: "amp_crate", position: [-13.7, 0, 0.5], radius: 0.95 },
  { id: "metal-amp-3", kind: "amp_crate", position: [-13.8, 0, 4.6], radius: 0.55 },
];

export function getThemeProps(theme: WorldThemeId): readonly (PropPlacement | ThemePropPlacement)[] {
  switch (theme) {
    case "office":
      return PROP_PLACEMENTS;
    case "western":
      return WESTERN_PROPS;
    case "horror":
      return HORROR_PROPS;
    case "metal":
      return METAL_PROPS;
  }
}

export type ThemeTvFrameStyle = {
  styleKind: WorldThemeId;
  bezelColor: string;
  mountColor: string;
  soundbarColor: string;
  accentColor: string;
  standbyTitle: string;
  standbySubtitle: string;
};

export function getThemeTvFrameStyle(theme: WorldThemeId): ThemeTvFrameStyle {
  const themeDef = WORLD_THEMES[theme];
  const standbyTitle = themeDef.tvStandbyTitle;
  const standbySubtitle = themeDef.tvStandbySubtitle;

  switch (theme) {
    case "office":
      return {
        styleKind: theme,
        bezelColor: "#151922",
        mountColor: "#262b34",
        soundbarColor: "#1c222e",
        accentColor: "#64748b",
        standbyTitle,
        standbySubtitle,
      };
    case "western":
      return {
        styleKind: theme,
        bezelColor: "#3b2a1a",
        mountColor: "#4a3524",
        soundbarColor: "#2e2115",
        accentColor: "#c98a3d",
        standbyTitle,
        standbySubtitle,
      };
    case "horror":
      return {
        styleKind: theme,
        bezelColor: "#120d14",
        mountColor: "#1c1420",
        soundbarColor: "#0e0a10",
        accentColor: "#7a1f2b",
        standbyTitle,
        standbySubtitle,
      };
    case "metal":
      return {
        styleKind: theme,
        bezelColor: "#1a1d24",
        mountColor: "#2a2f3a",
        soundbarColor: "#14171d",
        accentColor: "#38bdf8",
        standbyTitle,
        standbySubtitle,
      };
  }
}

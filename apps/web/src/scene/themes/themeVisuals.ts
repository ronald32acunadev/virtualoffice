import type { WorldThemeId } from "./registry";

export type ThemeAccessoryKind = "none" | "western_hat" | "horror_gothic" | "metal_rock";

export type ThemeStationAccentKind = "office_lamp" | "western_lantern" | "horror_candle" | "metal_amp";

export type ThemeStationVisual = {
  desktopColor: string;
  bossDesktopColor: string;
  legColor: string;
  trimColor: string;
  panelColor: string;
  railPostColor: string;
  accessoryKind: ThemeAccessoryKind;
  stationAccentKind: ThemeStationAccentKind;
};

export const THEME_STATION_VISUALS: Record<WorldThemeId, ThemeStationVisual> = {
  office: {
    desktopColor: "#c8a37a",
    bossDesktopColor: "#b98a5a",
    legColor: "#3a3f47",
    trimColor: "#3c3733",
    panelColor: "#7c5e42",
    railPostColor: "#b88e60",
    accessoryKind: "none",
    stationAccentKind: "office_lamp",
  },
  western: {
    desktopColor: "#9c6638",
    bossDesktopColor: "#855228",
    legColor: "#3d2c20",
    trimColor: "#4a321e",
    panelColor: "#6e4423",
    railPostColor: "#7d512d",
    accessoryKind: "western_hat",
    stationAccentKind: "western_lantern",
  },
  horror: {
    desktopColor: "#3b2d30",
    bossDesktopColor: "#2e2226",
    legColor: "#252026",
    trimColor: "#1c171e",
    panelColor: "#2d2228",
    railPostColor: "#45363d",
    accessoryKind: "horror_gothic",
    stationAccentKind: "horror_candle",
  },
  metal: {
    desktopColor: "#2b2e3a",
    bossDesktopColor: "#232632",
    legColor: "#4b5263",
    trimColor: "#b91c1c",
    panelColor: "#1c1e28",
    railPostColor: "#525866",
    accessoryKind: "metal_rock",
    stationAccentKind: "metal_amp",
  },
};

export function getThemeStationVisual(theme: WorldThemeId): ThemeStationVisual {
  return THEME_STATION_VISUALS[theme];
}

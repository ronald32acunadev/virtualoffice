import type { MediaKind, MediaPlaybackState, MediaProvider } from "../api/types";

export const TV_MOUNT_POSITION: [number, number, number] = [0.2, 2.95, -14.88];

export const TV_BEZEL_SIZE = { width: 4.6, height: 2.6, depth: 0.12 } as const;

export const TV_HTML_CONFIG = { widthPx: 640, heightPx: 360, distanceFactor: 2.75 } as const;

export type MediaProviderVisual = {
  id: MediaProvider;
  label: string;
  shortLabel: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
};

export const MEDIA_PROVIDER_VISUALS: Record<MediaProvider, MediaProviderVisual> = {
  spotify: {
    id: "spotify",
    label: "Spotify",
    shortLabel: "Spotify",
    accent: "#1db954",
    badgeBg: "rgba(29, 185, 84, 0.22)",
    badgeText: "#6ee7a0",
  },
  youtube_music: {
    id: "youtube_music",
    label: "YouTube Music / Video",
    shortLabel: "YouTube",
    accent: "#ff3b5c",
    badgeBg: "rgba(255, 59, 92, 0.22)",
    badgeText: "#ff99aa",
  },
  apple_music: {
    id: "apple_music",
    label: "Apple Music",
    shortLabel: "Apple Music",
    accent: "#fa586a",
    badgeBg: "rgba(250, 88, 106, 0.22)",
    badgeText: "#ff9ea9",
  },
};

export function isAllowedEmbedUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;

  const embedPrefix = "/embed/";

  if (
    url.hostname === "open.spotify.com" &&
    url.pathname.startsWith(embedPrefix) &&
    url.pathname.length > embedPrefix.length
  ) {
    return true;
  }

  if (
    url.hostname === "www.youtube.com" &&
    url.pathname.startsWith(embedPrefix) &&
    url.pathname.length > embedPrefix.length
  ) {
    return true;
  }

  if (url.hostname === "embed.music.apple.com" && url.pathname.length > 1) {
    return true;
  }

  return false;
}

export type TvScreenModel =
  | {
      mode: "standby";
      ledColor: string;
      emissiveIntensity: number;
      provider: null;
      providerLabel: null;
      mediaKind: null;
      title: string;
      embedUrl: null;
    }
  | {
      mode: "playing";
      ledColor: string;
      emissiveIntensity: number;
      provider: MediaProvider;
      providerLabel: string;
      mediaKind: MediaKind;
      title: string;
      embedUrl: string;
    };

export function getTvScreenModel(media: MediaPlaybackState | null): TvScreenModel {
  if (media === null || !isAllowedEmbedUrl(media.embedUrl)) {
    return {
      mode: "standby",
      ledColor: "#64748b",
      emissiveIntensity: 0.12,
      provider: null,
      providerLabel: null,
      mediaKind: null,
      title: "Office TV — Standby",
      embedUrl: null,
    };
  }

  const visual = MEDIA_PROVIDER_VISUALS[media.provider];

  return {
    mode: "playing",
    ledColor: visual.accent,
    emissiveIntensity: 0.72,
    provider: media.provider,
    providerLabel: visual.shortLabel,
    mediaKind: media.mediaKind,
    title: media.title,
    embedUrl: media.embedUrl,
  };
}

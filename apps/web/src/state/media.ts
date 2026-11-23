import type { MediaProvider } from "../api/types";

export type MediaAppOption = {
  id: MediaProvider;
  name: string;
  subtitle: string;
  placeholder: string;
  playbackHint: string | null;
  accent: string;
  badge: string;
};

export const MEDIA_APP_OPTIONS: readonly MediaAppOption[] = [
  {
    id: "spotify",
    name: "Spotify",
    subtitle: "Tracks, albums, playlists & podcasts",
    placeholder: "https://open.spotify.com/track/...",
    playbackHint:
      "Spotify embeds play full tracks when signed into Spotify in this browser; otherwise 30s previews.",
    accent: "#1db954",
    badge: "SP",
  },
  {
    id: "youtube_music",
    name: "YouTube Music / Video",
    subtitle: "Songs, playlists & YouTube videos on TV",
    placeholder:
      "https://www.youtube.com/watch?v=... or https://music.youtube.com/...",
    playbackHint: null,
    accent: "#ff3b5c",
    badge: "YT",
  },
  {
    id: "apple_music",
    name: "Apple Music",
    subtitle: "Songs, albums, playlists & stations",
    placeholder: "https://music.apple.com/us/album/...",
    playbackHint:
      "Apple Music embeds play full tracks with an active Apple Music browser session; otherwise previews.",
    accent: "#fa586a",
    badge: "AM",
  },
];

const SPOTIFY_URI_PATTERN = /^spotify:(track|album|playlist|episode|show|artist):/i;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const APPLE_MUSIC_HOSTS = new Set([
  "music.apple.com",
  "embed.music.apple.com",
]);

export function detectMediaProviderFromUrl(rawUrl: string): MediaProvider | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (SPOTIFY_URI_PATTERN.test(trimmed)) {
    return "spotify";
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "open.spotify.com") {
    return "spotify";
  }

  if (YOUTUBE_HOSTS.has(hostname)) {
    return "youtube_music";
  }

  if (APPLE_MUSIC_HOSTS.has(hostname)) {
    return "apple_music";
  }

  return null;
}

export function validateMediaFormInput(
  rawUrl: string,
  selectedProvider: MediaProvider,
): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return "Paste a Spotify, YouTube / YouTube Music, or Apple Music link.";
  }

  const detected = detectMediaProviderFromUrl(trimmed);
  if (detected === null) {
    return "Unsupported link. Use an HTTPS link from Spotify, YouTube / YouTube Music, or Apple Music.";
  }

  if (detected !== selectedProvider) {
    const detectedOption = getMediaAppOption(detected);
    const selectedOption = getMediaAppOption(selectedProvider);
    return `That link belongs to ${detectedOption.name}. Switch app or paste a ${selectedOption.name} link.`;
  }

  return null;
}

export function truncateMediaTitle(title: string, maxLength = 28): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, Math.max(1, maxLength - 1)).trimEnd() + "…";
}

export function getMediaAppOption(provider: MediaProvider): MediaAppOption {
  const match = MEDIA_APP_OPTIONS.find((option) => option.id === provider);
  if (match === undefined) {
    throw new Error(`Unknown media provider: ${provider}`);
  }
  return match;
}

export const MEDIA_PROVIDERS = ["spotify", "youtube_music", "apple_music"] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];
export type MediaKind = "audio" | "video";

export function isMediaProvider(value: unknown): value is MediaProvider {
  return typeof value === "string" && (MEDIA_PROVIDERS as readonly string[]).includes(value);
}

export type ParsedMediaUrl = {
  provider: MediaProvider;
  mediaKind: MediaKind;
  canonicalUrl: string;
  embedUrl: string;
  fallbackTitle: string;
};

export type MediaPlaybackState = {
  provider: MediaProvider;
  mediaKind: MediaKind;
  sourceUrl: string;
  embedUrl: string;
  title: string;
  thumbnailUrl: string | null;
  updatedAt: string;
};

export type MediaPreset = {
  id: string;
  provider: MediaProvider;
  mediaKind: MediaKind;
  sourceUrl: string;
  embedUrl: string;
  title: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

export type MediaParseResult = { ok: true; value: ParsedMediaUrl } | { ok: false; error: string };

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type ResolvedMediaMetadata = { title: string; thumbnailUrl: string | null };

const SPOTIFY_URI_RE = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/;
const SPOTIFY_KINDS = ["track", "album", "playlist", "episode", "show", "artist"] as const;
const SPOTIFY_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;
const APPLE_STOREFRONT_RE = /^[a-z]{2}$/i;
const APPLE_KINDS = ["album", "playlist", "song", "station"] as const;
const APPLE_SEGMENT_RE = /^[A-Za-z0-9._~%-]+$/;
const APPLE_ID_RE = /^(?:\d+|(?:pl|ra)\.[A-Za-z0-9._-]+)$/i;

function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function titleCase(str: string): string {
  return str
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => capitalize(word))
    .join(" ");
}

export function parseMediaUrl(rawUrl: string, expectedProvider?: MediaProvider): MediaParseResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "Media URL is required" };
  }

  // 1. Spotify URI format
  const spotifyUriMatch = trimmed.match(SPOTIFY_URI_RE);
  if (spotifyUriMatch) {
    const kind = spotifyUriMatch[1] as string;
    const id = spotifyUriMatch[2] as string;
    const parsed: ParsedMediaUrl = {
      provider: "spotify",
      mediaKind: "audio",
      canonicalUrl: `https://open.spotify.com/${kind}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`,
      fallbackTitle: `Spotify ${capitalize(kind)}`,
    };
    if (expectedProvider !== undefined && parsed.provider !== expectedProvider) {
      return { ok: false, error: `URL belongs to ${parsed.provider}, expected ${expectedProvider}` };
    }
    return { ok: true, value: parsed };
  }

  // 2. Standard URL parsing
  const lowerTrimmed = trimmed.toLowerCase();
  const rawPathStart = lowerTrimmed.indexOf("/", 8);
  const rawPath = rawPathStart >= 0 ? lowerTrimmed.slice(rawPathStart) : lowerTrimmed;
  if (rawPath.includes("..") || rawPath.includes("%2e") || rawPath.includes("%2f")) {
    return { ok: false, error: "Invalid URL path" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return { ok: false, error: "Invalid URL format" };
  }

  const host = url.hostname.toLowerCase();
  let parsed: ParsedMediaUrl | null = null;

  // 3. Spotify Web
  if (host === "open.spotify.com") {
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    
    // Shift intl prefix
    if (segments.length > 0 && /^intl-[a-z]{2}(?:-[a-z]{2})?$/i.test(segments[0]!)) {
      segments.shift();
    }
    
    // Shift embed prefix
    if (segments.length > 0 && segments[0] === "embed") {
      segments.shift();
    }

    if (segments.length === 2) {
      const kind = segments[0]!;
      const id = segments[1]!;
      if ((SPOTIFY_KINDS as readonly string[]).includes(kind) && SPOTIFY_ID_RE.test(id)) {
        parsed = {
          provider: "spotify",
          mediaKind: "audio",
          canonicalUrl: `https://open.spotify.com/${kind}/${id}`,
          embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`,
          fallbackTitle: `Spotify ${capitalize(kind)}`,
        };
      }
    }
  }
  // 4. YouTube / YouTube Music
  else if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be"
  ) {
    const isMusicHost = host === "music.youtube.com";
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    const rawList = url.searchParams.get("list");
    const validList = rawList && YOUTUBE_PLAYLIST_ID_RE.test(rawList) ? rawList : null;
    
    let videoId: string | null = null;
    let isPlaylistOnly = false;

    if (host === "youtu.be") {
      if (segments.length === 1 && YOUTUBE_VIDEO_ID_RE.test(segments[0]!)) {
        videoId = segments[0]!;
      }
    } else if (url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      if (v && YOUTUBE_VIDEO_ID_RE.test(v)) {
        videoId = v;
      }
    } else if (segments.length === 2) {
      const first = segments[0]!;
      const second = segments[1]!;
      if ((first === "shorts" || first === "live" || first === "embed") && YOUTUBE_VIDEO_ID_RE.test(second)) {
        videoId = second;
      }
    } else if (url.pathname === "/playlist") {
      if (validList) {
        isPlaylistOnly = true;
      }
    }

    if (videoId) {
      const canonicalBase = isMusicHost
        ? "https://music.youtube.com/watch?v="
        : "https://www.youtube.com/watch?v=";
      const canonicalUrl = validList
        ? `${canonicalBase}${videoId}&list=${encodeURIComponent(validList)}`
        : `${canonicalBase}${videoId}`;
      const embedUrl = validList
        ? `https://www.youtube.com/embed/${videoId}?list=${encodeURIComponent(validList)}`
        : `https://www.youtube.com/embed/${videoId}`;
      
      parsed = {
        provider: "youtube_music",
        mediaKind: isMusicHost ? "audio" : "video",
        canonicalUrl,
        embedUrl,
        fallbackTitle: isMusicHost ? "YouTube Music Track" : "YouTube Video",
      };
    } else if (isPlaylistOnly && validList) {
      const canonicalUrl = isMusicHost
        ? `https://music.youtube.com/playlist?list=${encodeURIComponent(validList)}`
        : `https://www.youtube.com/playlist?list=${encodeURIComponent(validList)}`;
      const embedUrl = `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(validList)}`;
      
      parsed = {
        provider: "youtube_music",
        mediaKind: isMusicHost ? "audio" : "video",
        canonicalUrl,
        embedUrl,
        fallbackTitle: isMusicHost ? "YouTube Music Playlist" : "YouTube Playlist",
      };
    }
  }
  // 5. Apple Music
  else if (host === "music.apple.com" || host === "embed.music.apple.com") {
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    
    if (segments.length >= 3) {
      const storefront = segments[0]!;
      const kind = segments[1]!;
      const rest = segments.slice(2);

      if (
        APPLE_STOREFRONT_RE.test(storefront) &&
        (APPLE_KINDS as readonly string[]).includes(kind) &&
        (rest.length === 1 || rest.length === 2)
      ) {
        let validRest = true;
        for (const seg of rest) {
          if (!APPLE_SEGMENT_RE.test(seg) || seg === "." || seg === "..") {
            validRest = false;
            break;
          }
        }

        if (validRest) {
          const idSegment = rest[rest.length - 1]!;
          if (APPLE_ID_RE.test(idSegment)) {
            const rawTrack = url.searchParams.get("i");
            let trackSuffix = "";
            if (rawTrack !== null) {
              if (!/^\d+$/.test(rawTrack)) {
                return { ok: false, error: "Invalid URL format" };
              }
              trackSuffix = `?i=${rawTrack}`;
            }

            const restPath = rest.join("/");
            const canonicalUrl = `https://music.apple.com/${storefront.toLowerCase()}/${kind}/${restPath}${trackSuffix}`;
            const embedUrl = `https://embed.music.apple.com/${storefront.toLowerCase()}/${kind}/${restPath}${trackSuffix}`;

            let fallbackTitle = `Apple Music ${capitalize(kind)}`;
            if (rest.length === 2) {
              try {
                const decoded = decodeURIComponent(rest[0]!);
                const titled = titleCase(decoded);
                if (titled) {
                  fallbackTitle = titled;
                }
              } catch {
                // ignore decode errors
              }
            }

            parsed = {
              provider: "apple_music",
              mediaKind: "audio",
              canonicalUrl,
              embedUrl,
              fallbackTitle,
            };
          }
        }
      }
    }
  }

  if (!parsed) {
    return {
      ok: false,
      error: "Unsupported media provider. Use a Spotify, YouTube / YouTube Music, or Apple Music URL.",
    };
  }

  if (expectedProvider !== undefined && parsed.provider !== expectedProvider) {
    return { ok: false, error: `URL belongs to ${parsed.provider}, expected ${expectedProvider}` };
  }

  return { ok: true, value: parsed };
}

export async function resolveMediaMetadata(
  parsed: ParsedMediaUrl,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number }
): Promise<ResolvedMediaMetadata> {
  const fetchImpl = options?.fetchImpl ?? ((input: string, init?: { signal?: AbortSignal }) =>
    fetch(input, init).then((res) => ({
      ok: res.ok,
      json: () => res.json(),
    }))
  );
  const timeoutMs = options?.timeoutMs ?? 3000;

  if (parsed.provider === "apple_music") {
    return { title: parsed.fallbackTitle, thumbnailUrl: null };
  }

  let oembedUrl: string;
  if (parsed.provider === "spotify") {
    oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}`;
  } else {
    oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}&format=json`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(oembedUrl, { signal: controller.signal });
    if (!response.ok) {
      return { title: parsed.fallbackTitle, thumbnailUrl: null };
    }

    const rawData = await response.json();
    if (!rawData || typeof rawData !== "object") {
      return { title: parsed.fallbackTitle, thumbnailUrl: null };
    }
    const data = rawData as Record<string, unknown>;
    
    let title = parsed.fallbackTitle;
    if (typeof data.title === "string" && data.title.trim().length > 0) {
      title = data.title.trim().slice(0, 160);
    }

    let thumbnailUrl: string | null = null;
    if (typeof data.thumbnail_url === "string") {
      try {
        const thumbUrl = new URL(data.thumbnail_url);
        if (thumbUrl.protocol === "https:") {
          thumbnailUrl = thumbUrl.href;
        }
      } catch {
        // ignore invalid url
      }
    }

    return { title, thumbnailUrl };
  } catch {
    return { title: parsed.fallbackTitle, thumbnailUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

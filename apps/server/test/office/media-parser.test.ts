import { describe, expect, it } from "vitest";
import {
  MEDIA_PROVIDERS,
  isMediaProvider,
  parseMediaUrl,
} from "../../src/office/domain/media.ts";

describe("MEDIA_PROVIDERS", () => {
  it("exposes the three supported providers in order", () => {
    expect(MEDIA_PROVIDERS).toEqual(["spotify", "youtube_music", "apple_music"]);
  });
});

describe("isMediaProvider", () => {
  it("returns true for each supported provider literal", () => {
    expect(isMediaProvider("spotify")).toBe(true);
    expect(isMediaProvider("youtube_music")).toBe(true);
    expect(isMediaProvider("apple_music")).toBe(true);
  });

  it("returns false for unsupported or non-string values", () => {
    expect(isMediaProvider("soundcloud")).toBe(false);
    expect(isMediaProvider("")).toBe(false);
    expect(isMediaProvider(null)).toBe(false);
    expect(isMediaProvider(42)).toBe(false);
  });
});

describe("parseMediaUrl", () => {
  describe("US-01 / AC-01 Spotify", () => {
    const spotifyCases: Array<{
      raw: string;
      kind: string;
      id: string;
      fallbackTitle: string;
    }> = [
      { raw: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", kind: "track", id: "4cOdK2wGLETKBW3PvgPWqT", fallbackTitle: "Spotify Track" },
      { raw: "https://open.spotify.com/album/2up3OPMp9Tb4dAKM2QstPZ", kind: "album", id: "2up3OPMp9Tb4dAKM2QstPZ", fallbackTitle: "Spotify Album" },
      { raw: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", kind: "playlist", id: "37i9dQZF1DXcBWIGoYBM5M", fallbackTitle: "Spotify Playlist" },
      { raw: "https://open.spotify.com/episode/4cOdK2wGLETKBW3PvgPWqT", kind: "episode", id: "4cOdK2wGLETKBW3PvgPWqT", fallbackTitle: "Spotify Episode" },
      { raw: "https://open.spotify.com/show/4cOdK2wGLETKBW3PvgPWqT", kind: "show", id: "4cOdK2wGLETKBW3PvgPWqT", fallbackTitle: "Spotify Show" },
      { raw: "https://open.spotify.com/artist/4cOdK2wGLETKBW3PvgPWqT", kind: "artist", id: "4cOdK2wGLETKBW3PvgPWqT", fallbackTitle: "Spotify Artist" },
    ];

    for (const c of spotifyCases) {
      it(`parses ${c.kind} URL`, () => {
        const result = parseMediaUrl(c.raw);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual({
          provider: "spotify",
          mediaKind: "audio",
          canonicalUrl: `https://open.spotify.com/${c.kind}/${c.id}`,
          embedUrl: `https://open.spotify.com/embed/${c.kind}/${c.id}?utm_source=generator`,
          fallbackTitle: c.fallbackTitle,
        });
      });
    }

    it("strips locale prefix and query string", () => {
      const result = parseMediaUrl("https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=abc");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "spotify",
        mediaKind: "audio",
        canonicalUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
        embedUrl: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator",
        fallbackTitle: "Spotify Track",
      });
    });

    it("parses spotify: URI scheme", () => {
      const result = parseMediaUrl("spotify:track:4cOdK2wGLETKBW3PvgPWqT");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "spotify",
        mediaKind: "audio",
        canonicalUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
        embedUrl: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator",
        fallbackTitle: "Spotify Track",
      });
    });
  });

  describe("US-01 / AC-02 YouTube / YouTube Music", () => {
    it("parses youtube.com watch URL with timestamp", () => {
      const result = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "youtube_music",
        mediaKind: "video",
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        fallbackTitle: "YouTube Video",
      });
    });

    it("parses youtu.be short link with playlist", () => {
      const result = parseMediaUrl("https://youtu.be/dQw4w9WgXcQ?list=PL1234567890abcd");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "youtube_music",
        mediaKind: "video",
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcd",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ?list=PL1234567890abcd",
        fallbackTitle: "YouTube Video",
      });
    });

    it("parses youtube.com shorts URL", () => {
      const result = parseMediaUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "youtube_music",
        mediaKind: "video",
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        fallbackTitle: "YouTube Video",
      });
    });

    it("parses youtube.com live URL", () => {
      const result = parseMediaUrl("https://www.youtube.com/live/dQw4w9WgXcQ");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "youtube_music",
        mediaKind: "video",
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        fallbackTitle: "YouTube Video",
      });
    });

    it("parses music.youtube.com watch URL as audio", () => {
      const result = parseMediaUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "youtube_music",
        mediaKind: "audio",
        canonicalUrl: "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        fallbackTitle: "YouTube Music Track",
      });
    });

    it("parses music.youtube.com playlist URL as audio", () => {
      const result = parseMediaUrl("https://music.youtube.com/playlist?list=PL1234567890abcd");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "youtube_music",
        mediaKind: "audio",
        canonicalUrl: "https://music.youtube.com/playlist?list=PL1234567890abcd",
        embedUrl: "https://www.youtube.com/embed/videoseries?list=PL1234567890abcd",
        fallbackTitle: "YouTube Music Playlist",
      });
    });
  });

  describe("US-01 / AC-03 Apple Music", () => {
    it("parses Apple Music album URL", () => {
      const result = parseMediaUrl("https://music.apple.com/us/album/abbey-road/1441164426");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "apple_music",
        mediaKind: "audio",
        canonicalUrl: "https://music.apple.com/us/album/abbey-road/1441164426",
        embedUrl: "https://embed.music.apple.com/us/album/abbey-road/1441164426",
        fallbackTitle: "Abbey Road",
      });
    });

    it("preserves ?i= track id on both canonical and embed URLs", () => {
      const result = parseMediaUrl("https://music.apple.com/us/album/abbey-road/1441164426?i=1441164430");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "apple_music",
        mediaKind: "audio",
        canonicalUrl: "https://music.apple.com/us/album/abbey-road/1441164426?i=1441164430",
        embedUrl: "https://embed.music.apple.com/us/album/abbey-road/1441164426?i=1441164430",
        fallbackTitle: "Abbey Road",
      });
    });

    it("parses Apple Music playlist URL", () => {
      const result = parseMediaUrl("https://music.apple.com/us/playlist/lofi-beats/pl.u-12345");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        provider: "apple_music",
        mediaKind: "audio",
        canonicalUrl: "https://music.apple.com/us/playlist/lofi-beats/pl.u-12345",
        embedUrl: "https://embed.music.apple.com/us/playlist/lofi-beats/pl.u-12345",
        fallbackTitle: "Lofi Beats",
      });
    });
  });

  describe("US-01 / AC-04 Rejections", () => {
    const rejectionCases: Array<string> = [
      "",
      "   ",
      "http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://example.com/track/123",
      "https://evil-spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      "https://music.apple.com/us/album/../secret/123456",
      "https://music.apple.com/us/album/foo/../1441164426",
      "https://music.apple.com/us/album/%2e%2e/123456",
      "https://open.spotify.com/track/",
      "https://www.youtube.com/watch?v=short",
      "https://music.apple.com/us/album/not-an-id",
    ];

    for (const raw of rejectionCases) {
      it(`rejects ${JSON.stringify(raw)}`, () => {
        const result = parseMediaUrl(raw);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.length).toBeGreaterThan(0);
      });
    }

    it("rejects provider mismatch", () => {
      const result = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "spotify");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(0);
    });
  });
});

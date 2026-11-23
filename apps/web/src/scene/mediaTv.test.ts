import { describe, expect, it } from "vitest";
import {
  MEDIA_PROVIDER_VISUALS,
  TV_BEZEL_SIZE,
  TV_HTML_CONFIG,
  TV_MOUNT_POSITION,
  getTvScreenModel,
  isAllowedEmbedUrl,
} from "./mediaTv";
import type { MediaPlaybackState } from "../api/types";

describe("isAllowedEmbedUrl", () => {
  it("accepts official HTTPS embed URLs for Spotify, YouTube, and Apple Music", () => {
    expect(
      isAllowedEmbedUrl(
        "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator",
      ),
    ).toBe(true);
    expect(isAllowedEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
    expect(
      isAllowedEmbedUrl("https://embed.music.apple.com/us/album/abbey-road/1441164426"),
    ).toBe(true);
  });

  it("rejects non-HTTPS, non-embed paths, unknown hosts, and malformed URLs", () => {
    expect(isAllowedEmbedUrl("http://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(false);
    expect(isAllowedEmbedUrl("javascript:alert(1)")).toBe(false);
    expect(
      isAllowedEmbedUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"),
    ).toBe(false);
    expect(isAllowedEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(isAllowedEmbedUrl("https://evil.test/embed/123")).toBe(false);
    expect(isAllowedEmbedUrl("not a url")).toBe(false);
    expect(isAllowedEmbedUrl("")).toBe(false);
  });
});

describe("getTvScreenModel", () => {
  it("returns standby mode for null playback state", () => {
    const model = getTvScreenModel(null);
    expect(model.mode).toBe("standby");
    expect(model.embedUrl).toBeNull();
    expect(model.provider).toBeNull();
    expect(model.title).toBe("Office TV — Standby");
  });

  it("returns playing mode with distinct visuals for each provider", () => {
    const spotify: MediaPlaybackState = {
      provider: "spotify",
      mediaKind: "audio",
      sourceUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      embedUrl: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator",
      title: "Never Gonna Give You Up",
      thumbnailUrl: null,
      updatedAt: "2026-11-23T00:00:00.000Z",
    };
    const spotifyModel = getTvScreenModel(spotify);
    expect(spotifyModel.mode).toBe("playing");
    expect(spotifyModel.provider).toBe("spotify");
    expect(spotifyModel.embedUrl).toBe(
      "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator",
    );
    expect(spotifyModel.title).toBe("Never Gonna Give You Up");
    expect(spotifyModel.providerLabel).toBe(MEDIA_PROVIDER_VISUALS.spotify.shortLabel);
    expect(spotifyModel.ledColor).toBe(MEDIA_PROVIDER_VISUALS.spotify.accent);

    const youtube: MediaPlaybackState = {
      provider: "youtube_music",
      mediaKind: "video",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      title: "Blinding Lights",
      thumbnailUrl: null,
      updatedAt: "2026-11-23T00:00:00.000Z",
    };
    const youtubeModel = getTvScreenModel(youtube);
    expect(youtubeModel.mode).toBe("playing");
    expect(youtubeModel.provider).toBe("youtube_music");
    expect(youtubeModel.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(youtubeModel.title).toBe("Blinding Lights");
    expect(youtubeModel.providerLabel).toBe(MEDIA_PROVIDER_VISUALS.youtube_music.shortLabel);
    expect(youtubeModel.ledColor).toBe(MEDIA_PROVIDER_VISUALS.youtube_music.accent);

    const apple: MediaPlaybackState = {
      provider: "apple_music",
      mediaKind: "audio",
      sourceUrl: "https://music.apple.com/us/album/abbey-road/1441164426",
      embedUrl: "https://embed.music.apple.com/us/album/abbey-road/1441164426",
      title: "Abbey Road",
      thumbnailUrl: null,
      updatedAt: "2026-11-23T00:00:00.000Z",
    };
    const appleModel = getTvScreenModel(apple);
    expect(appleModel.mode).toBe("playing");
    expect(appleModel.provider).toBe("apple_music");
    expect(appleModel.embedUrl).toBe(
      "https://embed.music.apple.com/us/album/abbey-road/1441164426",
    );
    expect(appleModel.title).toBe("Abbey Road");
    expect(appleModel.providerLabel).toBe(MEDIA_PROVIDER_VISUALS.apple_music.shortLabel);
    expect(appleModel.ledColor).toBe(MEDIA_PROVIDER_VISUALS.apple_music.accent);
  });

  it("falls back to standby mode when embedUrl is disallowed", () => {
    const tampered: MediaPlaybackState = {
      provider: "spotify",
      mediaKind: "audio",
      sourceUrl: "https://evil.test/source/123",
      embedUrl: "https://evil.test/embed/123",
      title: "Evil Track",
      thumbnailUrl: null,
      updatedAt: "2026-11-23T00:00:00.000Z",
    };
    const model = getTvScreenModel(tampered);
    expect(model.mode).toBe("standby");
    expect(model.embedUrl).toBeNull();
    expect(model.provider).toBeNull();
    expect(model.title).toBe("Office TV — Standby");
  });
});

describe("TV geometry constants", () => {
  it("produces rendered HTML dimensions strictly inside the bezel", () => {
    const distanceFactor = TV_HTML_CONFIG.distanceFactor;
    const renderedWidth = (TV_HTML_CONFIG.widthPx * distanceFactor) / 400;
    const renderedHeight = (TV_HTML_CONFIG.heightPx * distanceFactor) / 400;

    expect(renderedWidth).toBeLessThan(TV_BEZEL_SIZE.width);
    expect(renderedHeight).toBeLessThan(TV_BEZEL_SIZE.height);
    expect(renderedWidth).toBeGreaterThan(0);
    expect(renderedHeight).toBeGreaterThan(0);
  });

  it("exposes a finite mount position", () => {
    expect(Number.isFinite(TV_MOUNT_POSITION[0]!)).toBe(true);
    expect(Number.isFinite(TV_MOUNT_POSITION[1]!)).toBe(true);
    expect(Number.isFinite(TV_MOUNT_POSITION[2]!)).toBe(true);
  });
});

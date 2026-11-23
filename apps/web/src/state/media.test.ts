import { describe, expect, it } from "vitest";
import {
  MEDIA_APP_OPTIONS,
  detectMediaProviderFromUrl,
  getMediaAppOption,
  truncateMediaTitle,
  validateMediaFormInput,
} from "./media";

describe("MEDIA_APP_OPTIONS", () => {
  it("lists Spotify, YouTube Music / Video, and Apple Music in order", () => {
    expect(MEDIA_APP_OPTIONS.map((option) => option.id)).toEqual([
      "spotify",
      "youtube_music",
      "apple_music",
    ]);
  });

  it("has non-null playbackHint for Spotify and Apple Music", () => {
    const spotify = MEDIA_APP_OPTIONS[0]!;
    const appleMusic = MEDIA_APP_OPTIONS[2]!;
    expect(spotify.playbackHint).not.toBeNull();
    expect(appleMusic.playbackHint).not.toBeNull();
  });

  it("has null playbackHint for YouTube Music / Video", () => {
    const youtubeMusic = MEDIA_APP_OPTIONS[1]!;
    expect(youtubeMusic.playbackHint).toBeNull();
  });
});

describe("detectMediaProviderFromUrl", () => {
  it("detects Spotify URLs", () => {
    expect(
      detectMediaProviderFromUrl(
        "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      ),
    ).toBe("spotify");
    expect(
      detectMediaProviderFromUrl("spotify:track:4cOdK2wGLETKBW3PvgPWqT"),
    ).toBe("spotify");
  });

  it("detects YouTube Music / Video URLs", () => {
    expect(
      detectMediaProviderFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("youtube_music");
    expect(
      detectMediaProviderFromUrl("https://youtu.be/dQw4w9WgXcQ"),
    ).toBe("youtube_music");
    expect(
      detectMediaProviderFromUrl(
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      ),
    ).toBe("youtube_music");
  });

  it("detects Apple Music URLs", () => {
    expect(
      detectMediaProviderFromUrl(
        "https://music.apple.com/us/album/abbey-road/1441164426",
      ),
    ).toBe("apple_music");
  });

  it("returns null for unsupported inputs", () => {
    expect(detectMediaProviderFromUrl("")).toBeNull();
    expect(
      detectMediaProviderFromUrl("http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"),
    ).toBeNull();
    expect(detectMediaProviderFromUrl("javascript:alert(1)")).toBeNull();
    expect(detectMediaProviderFromUrl("https://example.com/x")).toBeNull();
  });
});

describe("validateMediaFormInput", () => {
  it("returns an error message for empty input", () => {
    const result = validateMediaFormInput("", "spotify");
    expect(result).not.toBeNull();
    expect(result).toMatch(/required|empty|link/i);
  });

  it("returns an error message for an unsupported link", () => {
    const result = validateMediaFormInput("https://example.com/x", "spotify");
    expect(result).not.toBeNull();
    expect(result).toMatch(/unsupported|not supported|invalid/i);
  });

  it("returns null for a matching provider link", () => {
    expect(
      validateMediaFormInput(
        "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
        "spotify",
      ),
    ).toBeNull();
  });

  it("returns a clear mismatch error for a mismatched provider link", () => {
    const result = validateMediaFormInput(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "spotify",
    );
    expect(result).not.toBeNull();
    expect(result).toMatch(/belongs to|switch app/i);
  });
});

describe("truncateMediaTitle", () => {
  it("leaves short titles intact", () => {
    expect(truncateMediaTitle("Hello", 10)).toBe("Hello");
  });

  it("truncates long titles with an ellipsis at maxLength", () => {
    expect(truncateMediaTitle("Hello World", 6)).toBe("Hello…");
    expect(truncateMediaTitle("Hello World", 5)).toBe("Hell…");
  });
});

describe("getMediaAppOption", () => {
  it("returns the matching descriptor for each provider", () => {
    expect(getMediaAppOption("spotify")).toBe(MEDIA_APP_OPTIONS[0]);
    expect(getMediaAppOption("youtube_music")).toBe(MEDIA_APP_OPTIONS[1]);
    expect(getMediaAppOption("apple_music")).toBe(MEDIA_APP_OPTIONS[2]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { parseMediaUrl, resolveMediaMetadata } from "../../src/office/domain/media.ts";
import type { ParsedMediaUrl } from "../../src/office/domain/media.ts";

function mustParse(url: string): ParsedMediaUrl {
  const result = parseMediaUrl(url);
  if (!result.ok) {
    throw new Error(`parseMediaUrl failed for ${url}: ${result.error}`);
  }
  return result.value;
}

describe("resolveMediaMetadata", () => {
  it("resolves Spotify oEmbed metadata", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      expect(input).toBe(
        "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F4cOdK2wGLETKBW3PvgPWqT",
      );
      return {
        ok: true,
        json: async () => ({
          title: "Daft Punk - Instant Crush",
          thumbnail_url: "https://i.scdn.co/image/abc",
        }),
      };
    });

    const parsed = mustParse("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    const result = await resolveMediaMetadata(parsed, { fetchImpl });

    expect(result).toEqual({
      title: "Daft Punk - Instant Crush",
      thumbnailUrl: "https://i.scdn.co/image/abc",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("resolves YouTube oEmbed metadata", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      expect(input).toBe(
        "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json",
      );
      return {
        ok: true,
        json: async () => ({
          title: "Lofi Hip Hop Radio",
          thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        }),
      };
    });

    const parsed = mustParse("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const result = await resolveMediaMetadata(parsed, { fetchImpl });

    expect(result).toEqual({
      title: "Lofi Hip Hop Radio",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the title but nulls out non-HTTPS thumbnail URLs", async () => {
    const insecureFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        title: "Some Title",
        thumbnail_url: "http://insecure.example/img.jpg",
      }),
    }));
    const jsFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        title: "Some Title",
        thumbnail_url: "javascript:alert(1)",
      }),
    }));

    const parsed = mustParse("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");

    const insecureResult = await resolveMediaMetadata(parsed, { fetchImpl: insecureFetch });
    expect(insecureResult).toEqual({ title: "Some Title", thumbnailUrl: null });

    const jsResult = await resolveMediaMetadata(parsed, { fetchImpl: jsFetch });
    expect(jsResult).toEqual({ title: "Some Title", thumbnailUrl: null });
  });

  it("returns fallback metadata on network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const parsed = mustParse("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    const result = await resolveMediaMetadata(parsed, { fetchImpl });

    expect(result).toEqual({ title: parsed.fallbackTitle, thumbnailUrl: null });
  });

  it("returns fallback metadata on non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => {
        throw new Error("no body");
      },
    }));

    const parsed = mustParse("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    const result = await resolveMediaMetadata(parsed, { fetchImpl });

    expect(result).toEqual({ title: parsed.fallbackTitle, thumbnailUrl: null });
  });

  it("returns fallback metadata when JSON parsing fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error("invalid JSON");
      },
    }));

    const parsed = mustParse("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    const result = await resolveMediaMetadata(parsed, { fetchImpl });

    expect(result).toEqual({ title: parsed.fallbackTitle, thumbnailUrl: null });
  });

  it("returns fallback metadata on timeout abort", async () => {
    const fetchImpl = vi.fn(
      (_input: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const parsed = mustParse("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
    const result = await resolveMediaMetadata(parsed, { fetchImpl, timeoutMs: 25 });

    expect(result).toEqual({ title: parsed.fallbackTitle, thumbnailUrl: null });
  });

  it("never calls fetchImpl for Apple Music and returns fallback metadata", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("should not be called");
    });

    const parsed = mustParse("https://music.apple.com/us/album/abbey-road/1441164426");
    const result = await resolveMediaMetadata(parsed, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ title: "Abbey Road", thumbnailUrl: null });
  });
});

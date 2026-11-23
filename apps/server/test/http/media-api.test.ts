import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/http/app.ts";
import type { FetchLike } from "../../src/office/domain/media.ts";
import { createHarness } from "../helpers/harness.ts";

const PORT = 4317;
const TOKEN = "t".repeat(64);
const HOST = `127.0.0.1:${PORT}`;
const AUTH_HEADERS = { host: HOST, authorization: `Bearer ${TOKEN}` };
const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function setup(mediaFetch?: FetchLike) {
  const h = createHarness(undefined, mediaFetch ? { mediaFetch } : {});
  const app = await buildApp({ token: TOKEN, port: PORT, repository: h.repository, office: h.office });
  apps.push(app);
  await app.ready();
  return { h, app };
}

function nextWsMessage(ws: { once(event: "message", cb: (data: Buffer) => void): void }): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once("message", (data: Buffer) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
  });
}

function stubOEmbedFetch(): FetchLike {
  return async (_input: string, _init?: { signal?: AbortSignal }) => {
    const body = {
      title: "Stub Title",
      thumbnail_url: "https://example.com/thumb.jpg",
      provider_name: "YouTube",
    };
    return { ok: true, json: async () => body };
  };
}

describe("US-02 / AC-02", () => {
  it("returns initial empty state and media endpoints", async () => {
    const { app } = await setup();

    const stateRes = await app.inject({ method: "GET", url: "/api/state", headers: AUTH_HEADERS });
    expect(stateRes.statusCode).toBe(200);
    const state = stateRes.json();
    expect(state.media).toBeNull();
    expect(state.mediaPresets).toEqual([]);

    const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
    expect(mediaRes.statusCode).toBe(200);
    const media = mediaRes.json();
    expect(media.media).toBeNull();
    expect(media.presets).toEqual([]);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { app } = await setup();

    const res = await app.inject({ method: "GET", url: "/api/state", headers: { host: HOST } });
    expect(res.statusCode).toBe(401);
  });
});

describe("US-02 / AC-03", () => {
  it("resolves oEmbed, persists, and broadcasts media_updated", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const ws = await app.injectWS("/ws?token=" + TOKEN, { headers: { host: HOST } });
    try {
      const msgPromise = nextWsMessage(ws);
      const putRes = await app.inject({
        method: "PUT",
        url: "/api/media/playback",
        headers: AUTH_HEADERS,
        payload: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      });
      expect(putRes.statusCode).toBe(200);
      const putBody = putRes.json();
      expect(putBody.media.provider).toBe("youtube_music");
      expect(putBody.media.mediaKind).toBe("video");
      expect(putBody.media.title).toBe("Stub Title");
      expect(putBody.media.thumbnailUrl).toBe("https://example.com/thumb.jpg");
      expect(putBody.media.sourceUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

      const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
      expect(mediaRes.statusCode).toBe(200);
      expect(mediaRes.json().media).toMatchObject({
        provider: "youtube_music",
        mediaKind: "video",
        title: "Stub Title",
        thumbnailUrl: "https://example.com/thumb.jpg",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });

      const stateRes = await app.inject({ method: "GET", url: "/api/state", headers: AUTH_HEADERS });
      expect(stateRes.statusCode).toBe(200);
      expect(stateRes.json().media).toMatchObject({
        provider: "youtube_music",
        mediaKind: "video",
        title: "Stub Title",
      });

      const msg = await msgPromise;
      expect(msg.type).toBe("media_updated");
      expect(msg.media).toMatchObject({
        provider: "youtube_music",
        mediaKind: "video",
        title: "Stub Title",
      });
    } finally {
      ws.terminate();
    }
  });

  it("supports custom title override", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/media/playback",
      headers: AUTH_HEADERS,
      payload: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "My Custom Title" },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().media.title).toBe("My Custom Title");
  });
});

describe("US-02 / AC-03 negative", () => {
  it("returns 400 validation_error for invalid URL and leaves media unchanged", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const res = await app.inject({
      method: "PUT",
      url: "/api/media/playback",
      headers: AUTH_HEADERS,
      payload: { url: "https://example.com/bad" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");

    const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
    expect(mediaRes.json().media).toBeNull();
  });

  it("returns 400 validation_error for provider mismatch and leaves media unchanged", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const res = await app.inject({
      method: "PUT",
      url: "/api/media/playback",
      headers: AUTH_HEADERS,
      payload: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", provider: "spotify" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");

    const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
    expect(mediaRes.json().media).toBeNull();
  });
});

describe("US-02 / AC-04", () => {
  it("clears playback, returns 200, and broadcasts media_updated with null", async () => {
    const { app } = await setup(stubOEmbedFetch());

    await app.inject({
      method: "PUT",
      url: "/api/media/playback",
      headers: AUTH_HEADERS,
      payload: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    const ws = await app.injectWS("/ws?token=" + TOKEN, { headers: { host: HOST } });
    try {
      const msgPromise = nextWsMessage(ws);
      const delRes = await app.inject({ method: "DELETE", url: "/api/media/playback", headers: AUTH_HEADERS });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toEqual({ media: null });

      const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
      expect(mediaRes.json().media).toBeNull();

      const stateRes = await app.inject({ method: "GET", url: "/api/state", headers: AUTH_HEADERS });
      expect(stateRes.json().media).toBeNull();

      const msg = await msgPromise;
      expect(msg.type).toBe("media_updated");
      expect(msg.media).toBeNull();
    } finally {
      ws.terminate();
    }
  });
});

describe("US-02 / AC-05", () => {
  it("creates preset, broadcasts, and deletes it", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const ws = await app.injectWS("/ws?token=" + TOKEN, { headers: { host: HOST } });
    try {
      const msgPromise = nextWsMessage(ws);
      const postRes = await app.inject({
        method: "POST",
        url: "/api/media/presets",
        headers: AUTH_HEADERS,
        payload: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      });
      expect(postRes.statusCode).toBe(201);
      const postBody = postRes.json();
      expect(postBody.preset).toBeDefined();
      expect(postBody.presets).toHaveLength(1);
      const presetId = postBody.preset.id as string;

      const msg = await msgPromise;
      expect(msg.type).toBe("media_presets_updated");
      expect(msg.presets).toHaveLength(1);

      const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
      expect(mediaRes.json().presets).toHaveLength(1);

      const delMsgPromise = nextWsMessage(ws);
      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/media/presets/${presetId}`,
        headers: AUTH_HEADERS,
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toEqual({ deleted: true, presets: [] });

      const delMsg = await delMsgPromise;
      expect(delMsg.type).toBe("media_presets_updated");
      expect(delMsg.presets).toEqual([]);

      const mediaRes2 = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
      expect(mediaRes2.json().presets).toEqual([]);
    } finally {
      ws.terminate();
    }
  });

  it("returns 400 for invalid preset URL and leaves presets unchanged", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const res = await app.inject({
      method: "POST",
      url: "/api/media/presets",
      headers: AUTH_HEADERS,
      payload: { url: "https://example.com/bad" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");

    const mediaRes = await app.inject({ method: "GET", url: "/api/media", headers: AUTH_HEADERS });
    expect(mediaRes.json().presets).toEqual([]);
  });

  it("returns 404 not_found for unknown preset ID", async () => {
    const { app } = await setup(stubOEmbedFetch());

    const res = await app.inject({
      method: "DELETE",
      url: "/api/media/presets/nonexistent-id",
      headers: AUTH_HEADERS,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });
});

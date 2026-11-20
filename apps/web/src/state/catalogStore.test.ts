import { describe, expect, it, vi } from "vitest";
import type { Catalog } from "../api/types";
import { createCatalogStore } from "./catalogStore";

const CATALOG: Catalog = { commands: [{ name: "a", description: "", argumentHint: "" }], agents: [] };
const key = { kind: "employee", id: "e1" } as const;

describe("US-02 / AC-05 and US-04 / AC-01 catalog cache", () => {
  it("fetches once per key and serves the cache afterwards", async () => {
    const fetcher = vi.fn().mockResolvedValue(CATALOG);
    const store = createCatalogStore(fetcher);
    expect(store.get(key).status).toBe("idle");
    await Promise.all([store.load(key), store.load(key)]);
    await store.load(key);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get(key)).toEqual({ status: "ready", catalog: CATALOG });
  });
  it("refresh re-fetches with refresh=true and keeps old data while loading", async () => {
    const fetcher = vi.fn().mockResolvedValue(CATALOG);
    const store = createCatalogStore(fetcher);
    await store.load(key);
    const pending = store.load(key, { refresh: true });
    expect(store.get(key)).toEqual({ status: "loading", catalog: CATALOG });
    await pending;
    expect(fetcher).toHaveBeenLastCalledWith(key, true);
  });
  it("marks unavailable on failure and retries on the next load", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue(CATALOG);
    const store = createCatalogStore(fetcher);
    await store.load(key);
    expect(store.get(key).status).toBe("unavailable");
    await store.load(key);
    expect(store.get(key).status).toBe("ready");
  });
  it("keeps employee and folder caches separate and notifies subscribers", async () => {
    const store = createCatalogStore(vi.fn().mockResolvedValue(CATALOG));
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load({ kind: "folder", path: "/x" });
    expect(listener).toHaveBeenCalled();
    expect(store.get(key).status).toBe("idle");
    expect(store.get({ kind: "folder", path: "/x" }).status).toBe("ready");
  });
});

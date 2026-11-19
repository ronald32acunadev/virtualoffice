import type { Catalog } from "../api/types";

export type CatalogEntry =
  | { status: "idle" }
  | { status: "loading"; catalog?: Catalog }
  | { status: "ready"; catalog: Catalog }
  | { status: "unavailable"; catalog?: Catalog };

export const IDLE_ENTRY: CatalogEntry = { status: "idle" };

export type CatalogKey = { kind: "employee"; id: string } | { kind: "folder"; path: string };

export function catalogKeyString(key: CatalogKey): string {
  return key.kind === "employee" ? `employee:${key.id}` : `folder:${key.path}`;
}

type Fetcher = (key: CatalogKey, refresh: boolean) => Promise<Catalog>;

/**
 * Catalog cache per employee and per folder. A key is fetched once; `refresh` re-fetches with
 * refresh=true. Concurrent loads of the same key share one request.
 */
export function createCatalogStore(fetcher: Fetcher) {
  const entries = new Map<string, CatalogEntry>();
  const inflight = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const get = (key: CatalogKey): CatalogEntry => entries.get(catalogKeyString(key)) ?? IDLE_ENTRY;

  const load = (key: CatalogKey, options: { refresh?: boolean } = {}): Promise<void> => {
    const id = catalogKeyString(key);
    const current = entries.get(id);
    if (inflight.has(id)) return inflight.get(id)!;
    if (current?.status === "ready" && !options.refresh) return Promise.resolve();
    const previous = current && "catalog" in current ? current.catalog : undefined;
    entries.set(id, { status: "loading", ...(previous ? { catalog: previous } : {}) });
    notify();
    const run = fetcher(key, options.refresh === true)
      .then((catalog) => {
        entries.set(id, { status: "ready", catalog });
      })
      .catch(() => {
        entries.set(id, { status: "unavailable", ...(previous ? { catalog: previous } : {}) });
      })
      .finally(() => {
        inflight.delete(id);
        notify();
      });
    inflight.set(id, run);
    return run;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { get, load, subscribe };
}

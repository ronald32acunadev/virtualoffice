import { useCallback, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { catalogKeyString, createCatalogStore, IDLE_ENTRY, type CatalogEntry, type CatalogKey } from "./catalogStore";

const store = createCatalogStore(async (key, refresh) => {
  const { catalog } =
    key.kind === "employee"
      ? await api.getEmployeeCatalog(key.id, refresh)
      : await api.getFolderCatalog(key.path, refresh);
  return catalog;
});

/** Shared per-employee / per-folder catalog. Nothing is fetched until `load` is called. */
export function useCatalog(key: CatalogKey | null): {
  entry: CatalogEntry;
  load: () => void;
  refresh: () => void;
} {
  const id = key ? catalogKeyString(key) : null;
  const entry = useSyncExternalStore(
    store.subscribe,
    () => (key ? store.get(key) : IDLE_ENTRY),
    () => IDLE_ENTRY,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => void (key && store.load(key)), [id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => void (key && store.load(key, { refresh: true })), [id]);
  return { entry, load, refresh };
}

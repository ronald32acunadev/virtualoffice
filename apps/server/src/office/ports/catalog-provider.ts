import type { ProviderCatalog } from "../domain/types.ts";

/** Reads the commands and agents a provider offers in a folder, without a model turn. */
export interface CatalogProvider {
  /** Rejects when the lists cannot be read; the provider releases everything it opened either way. */
  probe(cwd: string): Promise<ProviderCatalog>;
}

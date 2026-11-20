import type { ServerEvent } from "../domain/types.ts";

export interface EventBus {
  publish(event: ServerEvent): void;
  subscribe(listener: (event: ServerEvent) => void): () => void;
}

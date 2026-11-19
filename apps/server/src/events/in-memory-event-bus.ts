import type { EventBus } from "../office/ports/event-bus.ts";
import type { ServerEvent } from "../office/domain/types.ts";

export class InMemoryEventBus implements EventBus {
  private readonly listeners = new Set<(event: ServerEvent) => void>();

  publish(event: ServerEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // a broken subscriber must never affect the office
      }
    }
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

import type { LightingMood } from "../scene/officeTheme";

export const CHANNEL_NAME = "virtual-office";

export type WindowMessage =
  | { type: "focus_employee"; employeeId: string }
  | { type: "workspace_ping" }
  | { type: "workspace_pong" }
  | { type: "mood_changed"; mood: LightingMood };

/** The subset of BroadcastChannel used here, so tests can inject a fake. */
export type ChannelLike = {
  postMessage: (data: unknown) => void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close: () => void;
};

export function parseWindowMessage(data: unknown): WindowMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record["type"] === "workspace_ping") return { type: "workspace_ping" };
  if (record["type"] === "workspace_pong") return { type: "workspace_pong" };
  if (
    record["type"] === "focus_employee" &&
    typeof record["employeeId"] === "string" &&
    record["employeeId"] !== ""
  ) {
    return { type: "focus_employee", employeeId: record["employeeId"] };
  }
  if (
    record["type"] === "mood_changed" &&
    (record["mood"] === "day" || record["mood"] === "evening")
  ) {
    return { type: "mood_changed", mood: record["mood"] };
  }
  return null;
}

/** Opens the shared channel, or returns null when BroadcastChannel is unavailable. */
export function openWindowChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike;
}

/** Workspace side: answers presence pings and reports focus requests. Returns a disposer. */
export function createWorkspaceLink(
  channel: ChannelLike,
  onFocus: (employeeId: string) => void,
): () => void {
  channel.onmessage = (event) => {
    const message = parseWindowMessage(event.data);
    if (!message) return;
    if (message.type === "workspace_ping") {
      channel.postMessage({ type: "workspace_pong" } satisfies WindowMessage);
    } else if (message.type === "focus_employee") {
      onFocus(message.employeeId);
    }
  };
  return () => {
    channel.onmessage = null;
    channel.close();
  };
}

export type OfficeLink = {
  /** Pings the workspace; resolves true when it answered within the timeout. */
  ping: () => Promise<boolean>;
  /** Posts a focus message when a workspace answers; resolves false when none is open. */
  focusEmployee: (employeeId: string) => Promise<boolean>;
  dispose: () => void;
};

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/** Office side: decides between focusing the open workspace and falling back to the local card. */
export function createOfficeLink(
  channel: ChannelLike,
  options: { timeoutMs?: number; timers?: Timers } = {},
): OfficeLink {
  const timeoutMs = options.timeoutMs ?? 300;
  const timers: Timers = options.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const waiting = new Set<() => void>();

  channel.onmessage = (event) => {
    if (parseWindowMessage(event.data)?.type !== "workspace_pong") return;
    for (const resolve of [...waiting]) resolve();
  };

  const ping = () =>
    new Promise<boolean>((resolve) => {
      const done = (answered: boolean) => {
        timers.clearTimeout(handle);
        waiting.delete(onPong);
        resolve(answered);
      };
      const onPong = () => done(true);
      const handle = timers.setTimeout(() => done(false), timeoutMs);
      waiting.add(onPong);
      channel.postMessage({ type: "workspace_ping" } satisfies WindowMessage);
    });

  return {
    ping,
    focusEmployee: async (employeeId) => {
      const open = await ping();
      if (open) channel.postMessage({ type: "focus_employee", employeeId } satisfies WindowMessage);
      return open;
    },
    dispose: () => {
      channel.onmessage = null;
      waiting.clear();
      channel.close();
    },
  };
}

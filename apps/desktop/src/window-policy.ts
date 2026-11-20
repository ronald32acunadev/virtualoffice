export type WindowOpenDecision =
  | { kind: "allow_office" }
  | { kind: "open_external"; url: string }
  | { kind: "deny" };

const ALLOWED_OFFICE_PATHS = new Set(["/", "/office", "/workspace"]);

export function classifyWindowOpen(
  targetUrl: string,
  serverOrigin: string
): WindowOpenDecision {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { kind: "deny" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { kind: "deny" };
  }

  if (parsed.origin === serverOrigin) {
    if (ALLOWED_OFFICE_PATHS.has(parsed.pathname)) {
      return { kind: "allow_office" };
    }
    return { kind: "deny" };
  }

  return { kind: "open_external", url: parsed.toString() };
}

export type ShutdownGuard = {
  isDone: () => boolean;
  run: () => Promise<void>;
};

export function createShutdownGuard(
  closeServer: () => Promise<void>
): ShutdownGuard {
  let promise: Promise<void> | null = null;
  let done = false;

  return {
    isDone: () => done,
    run: () => {
      if (promise !== null) {
        return promise;
      }

      let rawPromise: Promise<void>;
      try {
        rawPromise = Promise.resolve(closeServer());
      } catch (err) {
        rawPromise = Promise.reject(err);
      }

      promise = rawPromise.finally(() => {
        done = true;
      });

      return promise;
    },
  };
}

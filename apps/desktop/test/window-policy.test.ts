import { describe, expect, it, vi } from "vitest";
import {
  classifyWindowOpen,
  createShutdownGuard,
} from "../src/window-policy.js";

const SERVER_ORIGIN = "http://127.0.0.1:4317";

describe("classifyWindowOpen", () => {
  it("allows same-origin /office and /workspace paths", () => {
    expect(
      classifyWindowOpen("http://127.0.0.1:4317/office?token=secret", SERVER_ORIGIN)
    ).toEqual({ kind: "allow_office" });

    expect(
      classifyWindowOpen("http://127.0.0.1:4317/workspace?token=secret", SERVER_ORIGIN)
    ).toEqual({ kind: "allow_office" });

    expect(
      classifyWindowOpen("http://127.0.0.1:4317/", SERVER_ORIGIN)
    ).toEqual({ kind: "allow_office" });
  });

  it("denies non-UI same-origin paths such as /api/state", () => {
    expect(
      classifyWindowOpen("http://127.0.0.1:4317/api/state", SERVER_ORIGIN)
    ).toEqual({ kind: "deny" });
  });

  it("routes external http and https URLs to open_external", () => {
    expect(
      classifyWindowOpen("https://example.com/docs?ref=1", SERVER_ORIGIN)
    ).toEqual({
      kind: "open_external",
      url: "https://example.com/docs?ref=1",
    });

    expect(
      classifyWindowOpen("http://example.org", SERVER_ORIGIN)
    ).toEqual({
      kind: "open_external",
      url: "http://example.org/",
    });
  });

  it("denies javascript:, file:, and invalid URLs", () => {
    expect(classifyWindowOpen("javascript:alert(1)", SERVER_ORIGIN)).toEqual({
      kind: "deny",
    });
    expect(classifyWindowOpen("file:///etc/passwd", SERVER_ORIGIN)).toEqual({
      kind: "deny",
    });
    expect(classifyWindowOpen("not a valid url", SERVER_ORIGIN)).toEqual({
      kind: "deny",
    });
  });
});

describe("createShutdownGuard", () => {
  it("calls closeServer once across concurrent and repeated runs and flips isDone only after completion", async () => {
    let resolveClose: (() => void) | undefined;
    const closeServer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        })
    );

    const guard = createShutdownGuard(closeServer);
    expect(guard.isDone()).toBe(false);

    const first = guard.run();
    const second = guard.run();

    expect(first).toBe(second);
    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(guard.isDone()).toBe(false);

    resolveClose?.();
    await first;
    await second;

    expect(guard.isDone()).toBe(true);

    await guard.run();
    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(guard.isDone()).toBe(true);
  });
});

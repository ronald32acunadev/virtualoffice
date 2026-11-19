import { describe, expect, it } from "vitest";
import { buildViewUrl, resolveRoute } from "./routing";

describe("routing", () => {
  it("US-01 / AC-01: /office resolves to the office view", () => {
    expect(resolveRoute("/office", "?token=abc")).toEqual({ view: "office", redirectTo: null });
  });

  it("US-01 / AC-02: /workspace resolves to the workspace view", () => {
    expect(resolveRoute("/workspace", "?token=abc")).toEqual({ view: "workspace", redirectTo: null });
    expect(resolveRoute("/workspace/", "")).toEqual({ view: "workspace", redirectTo: null });
  });

  it("US-01 / AC-03: / redirects to /workspace keeping the query string", () => {
    expect(resolveRoute("/", "?token=abc")).toEqual({ view: "workspace", redirectTo: "/workspace?token=abc" });
    expect(resolveRoute("/unknown", "")).toEqual({ view: "workspace", redirectTo: "/workspace" });
  });

  it("US-02 / AC-02: builds a workspace URL with employee and token", () => {
    expect(buildViewUrl("/workspace", "tok", { employee: "e1" })).toBe("/workspace?employee=e1&token=tok");
    expect(buildViewUrl("/office", "tok")).toBe("/office?token=tok");
    expect(buildViewUrl("/office", null)).toBe("/office");
  });
});

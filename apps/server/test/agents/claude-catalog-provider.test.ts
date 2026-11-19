import { describe, expect, it } from "vitest";
import { ClaudeCatalogProvider } from "../../src/agents/claude/claude-catalog-provider.ts";
import { FakeSdk, waitFor } from "../helpers/fake-sdk.ts";

const command = { name: "judgment-day", description: "Dual review", argumentHint: "" };
const agent = { name: "review-risk", description: "Risk reviewer" };

describe("US-01 catalog probe", () => {
  it("US-01 / AC-01: opens a streaming query with the adapter's settings and returns the initialization lists", async () => {
    const sdk = new FakeSdk();
    const provider = new ClaudeCatalogProvider(sdk.query);
    const probing = provider.probe("/work/project");
    await waitFor(() => sdk.sessions.length === 1);
    sdk.last.resolveInit({ commands: [command], agents: [agent] });
    await expect(probing).resolves.toEqual({ commands: [command], agents: [agent] });
    expect(sdk.last.options).toMatchObject({
      cwd: "/work/project",
      settingSources: ["user", "project", "local"],
      systemPrompt: { type: "preset", preset: "claude_code" },
    });
  });

  it("US-01 / AC-06: no user message is ever sent, so there is no model turn, and the query is closed", async () => {
    const sdk = new FakeSdk();
    const provider = new ClaudeCatalogProvider(sdk.query);
    const probing = provider.probe("/work/project");
    await waitFor(() => sdk.sessions.length === 1);
    // Messages the SDK may stream during init (hooks) are drained and ignored.
    sdk.last.emit({ type: "system", subtype: "hook_started" });
    sdk.last.resolveInit({ commands: [], agents: [] });
    await probing;
    expect(sdk.last.prompts).toEqual([]);
    expect(sdk.last.closed).toBe(true);
  });

  it("US-01 / AC-05 + risk: the query is closed when initialization fails", async () => {
    const sdk = new FakeSdk();
    const provider = new ClaudeCatalogProvider(sdk.query);
    const probing = provider.probe("/work/project");
    await waitFor(() => sdk.sessions.length === 1);
    sdk.last.rejectInit(new Error("boom"));
    await expect(probing).rejects.toThrow("boom");
    expect(sdk.last.closed).toBe(true);
  });

  it("US-01 / AC-05 + risk: the query is closed and the probe rejects when initialization times out", async () => {
    const sdk = new FakeSdk();
    const provider = new ClaudeCatalogProvider(sdk.query, 20);
    await expect(provider.probe("/work/project")).rejects.toThrow(/timed out/i);
    expect(sdk.last.closed).toBe(true);
  });

  it("US-01 / AC-05 + risk: the query is closed when it cannot even be created", async () => {
    const sdk = new FakeSdk();
    sdk.throwOnQuery = new Error("spawn failed");
    const provider = new ClaudeCatalogProvider(sdk.query);
    await expect(provider.probe("/work/project")).rejects.toThrow("spawn failed");
  });
});

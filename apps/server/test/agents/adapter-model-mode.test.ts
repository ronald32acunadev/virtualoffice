import { describe, expect, it } from "vitest";
import { createHarness } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import { createFakeSpawner, createRecordingSink, makeEmployee } from "../helpers/fake-cli-process.ts";
import { CodexAgentAdapter } from "../../src/agents/codex/codex-agent-adapter.ts";
import { OpenCodeAgentAdapter } from "../../src/agents/opencode/opencode-agent-adapter.ts";
import { AntigravityAgentAdapter } from "../../src/agents/antigravity/antigravity-agent-adapter.ts";
import { GeminiAgentAdapter } from "../../src/agents/gemini/gemini-agent-adapter.ts";

describe("US-02 / AC-01", () => {
  it("ClaudeAgentAdapter passes model and turbo permission flags to the SDK", async () => {
    const h = createHarness();
    const agent = h.office.createAgent({
      bossId: "claude",
      name: "TurboClaude",
      species: "fox",
      model: "claude-opus-4-1",
      mode: "turbo",
    });
    h.office.hire({
      agentId: agent.id,
      bossId: "claude",
      task: "Run fast",
      workingDirectory: h.dir,
    });
    await waitFor(() => h.sdk.sessions.length > 0);
    expect(h.sdk.last.options).toMatchObject({
      model: "claude-opus-4-1",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    });
  });
});

describe("US-02 / AC-02", () => {
  it("CodexAgentAdapter passes model and turbo flags", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new CodexAgentAdapter(spawner.spawn);
    const employee = { ...makeEmployee("codex", "/repo"), model: "gpt-5.4", mode: "turbo" as const };
    adapter.start({ employee, prompt: "Do it" }, sink);
    expect(spawner.last.args).toContain("-m");
    expect(spawner.last.args).toContain("gpt-5.4");
    expect(spawner.last.args).toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("CodexAgentAdapter default request_review with null model omits flags", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new CodexAgentAdapter(spawner.spawn);
    const employee = { ...makeEmployee("codex", "/repo"), model: null, mode: "request_review" as const };
    adapter.start({ employee, prompt: "Do it" }, sink);
    expect(spawner.last.args).not.toContain("-m");
    expect(spawner.last.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});

describe("US-02 / AC-03", () => {
  it("OpenCodeAgentAdapter passes model and turbo flags", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new OpenCodeAgentAdapter(spawner.spawn);
    const employee = { ...makeEmployee("opencode", "/repo"), model: "opencode/big-pickle", mode: "turbo" as const };
    adapter.start({ employee, prompt: "Do it" }, sink);
    expect(spawner.last.args).toContain("-m");
    expect(spawner.last.args).toContain("opencode/big-pickle");
    expect(spawner.last.args).toContain("--auto");
  });
});

describe("US-02 / AC-04", () => {
  it("AntigravityAgentAdapter passes model and turbo flags", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });
    const employee = { ...makeEmployee("gemini", "/repo"), model: "gemini-4-neon-high", mode: "turbo" as const };
    adapter.start({ employee, prompt: "Do it" }, sink);
    expect(spawner.last.args).toContain("--model");
    expect(spawner.last.args).toContain("gemini-4-neon-high");
    expect(spawner.last.args).toContain("--dangerously-skip-permissions");
  });

  it("GeminiAgentAdapter passes model and turbo flags", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new GeminiAgentAdapter(spawner.spawn);
    const employee = { ...makeEmployee("gemini", "/repo"), model: "gemini-3.8-flash-medium", mode: "turbo" as const };
    adapter.start({ employee, prompt: "Do it" }, sink);
    expect(spawner.last.args).toContain("-m");
    expect(spawner.last.args).toContain("gemini-3.8-flash-medium");
    expect(spawner.last.args).toContain("--yolo");
  });
});

describe("US-05 / AC-02: native per-provider modes and Claude effort", () => {
  it("ClaudeAgentAdapter passes native permissionMode (auto/acceptEdits/plan/default) and effort", async () => {
    const h = createHarness();
    const agent = h.office.createAgent({
      bossId: "claude",
      name: "NativeClaude",
      species: "cat",
      model: "opus",
      mode: "acceptEdits",
      effort: "high",
    });
    h.office.hire({
      agentId: agent.id,
      bossId: "claude",
      task: "Edit carefully",
      workingDirectory: h.dir,
    });
    await waitFor(() => h.sdk.sessions.length > 0);
    expect(h.sdk.last.options).toMatchObject({
      model: "opus",
      permissionMode: "acceptEdits",
      effort: "high",
    });
    expect(h.sdk.last.options.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("CodexAgentAdapter passes --approve-for-me for auto mode, sandbox flags for acceptEdits/plan, and reasoning effort", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new CodexAgentAdapter(spawner.spawn);

    adapter.start({ employee: { ...makeEmployee("codex", "/repo"), mode: "auto", effort: "xhigh" }, prompt: "Check" }, sink);
    expect(spawner.last.args).toContain("--approve-for-me");
    expect(spawner.last.args).toContain("-c");
    expect(spawner.last.args).toContain("model_reasoning_effort=xhigh");
    expect(spawner.last.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");

    adapter.start({ employee: { ...makeEmployee("codex", "/repo"), mode: "acceptEdits" }, prompt: "Edit" }, sink);
    expect(spawner.last.args).toContain("-s");
    expect(spawner.last.args).toContain("workspace-write");

    adapter.start({ employee: { ...makeEmployee("codex", "/repo"), mode: "plan" }, prompt: "Inspect" }, sink);
    expect(spawner.last.args).toContain("-s");
    expect(spawner.last.args).toContain("read-only");
  });

  it("AntigravityAgentAdapter passes --mode accept-edits / auto / plan", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new AntigravityAgentAdapter({ spawnFn: spawner.spawn });

    adapter.start({ employee: { ...makeEmployee("gemini", "/repo"), mode: "acceptEdits" }, prompt: "Edit" }, sink);
    expect(spawner.last.args).toContain("--mode");
    expect(spawner.last.args).toContain("accept-edits");

    adapter.start({ employee: { ...makeEmployee("gemini", "/repo"), mode: "plan" }, prompt: "Plan" }, sink);
    expect(spawner.last.args).toContain("plan");
  });

  it("OpenCodeAgentAdapter passes --auto for auto mode", () => {
    const spawner = createFakeSpawner();
    const { sink } = createRecordingSink();
    const adapter = new OpenCodeAgentAdapter(spawner.spawn);
    const employee = { ...makeEmployee("opencode", "/repo"), mode: "auto" as const };
    adapter.start({ employee, prompt: "Go" }, sink);
    expect(spawner.last.args).toContain("--auto");
  });
});

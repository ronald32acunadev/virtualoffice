import { describe, expect, it } from "vitest";
import { createHarness } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import type { ServerEvent } from "../../src/office/domain/types.ts";

describe("Agent team management & live tool activity", () => {
  it("supports creating, listing, updating, and deleting agents and cascades identity to linked chats", async () => {
    const h = createHarness();
    const events: ServerEvent[] = [];
    h.office.subscribe((e) => events.push(e));

    const agent = h.office.createAgent({
      bossId: "claude",
      name: "Maya",
      species: "fox",
      role: "review-risk",
      jobTitle: "Risk Reviewer",
    });

    expect(agent).toMatchObject({
      bossId: "claude",
      name: "Maya",
      species: "fox",
      role: "review-risk",
      jobTitle: "Risk Reviewer",
    });
    expect(h.office.getState().agents).toEqual([agent]);

    const chat = h.office.hire({
      agentId: agent.id,
      bossId: "claude",
      task: "Audit auth module",
      workingDirectory: h.dir,
    });
    expect(chat.agentId).toBe(agent.id);
    expect(chat.name).toBe("Maya");
    expect(chat.species).toBe("fox");
    expect(chat.role).toBe("review-risk");
    expect(chat.jobTitle).toBe("Risk Reviewer");

    // Updating the agent cascades to linked chats
    const updated = h.office.updateAgent(agent.id, { name: "Nova", species: "cat", jobTitle: "Lead Auditor" });
    expect(updated).toMatchObject({ name: "Nova", species: "cat", jobTitle: "Lead Auditor" });
    const reloadedChat = h.office.getState().employees.find((e) => e.id === chat.id)!;
    expect(reloadedChat).toMatchObject({ name: "Nova", species: "cat", jobTitle: "Lead Auditor" });

    // Cannot delete agent while it has an active chat
    expect(() => h.office.deleteAgent(agent.id)).toThrow(/active/i);

    // Stop chat, then delete agent -> historical chat survives with agentId null (no General fallback)
    await h.office.stop(chat.id);
    const del = h.office.deleteAgent(agent.id);
    expect(del).toEqual({ deleted: true });
    expect(h.office.getState().agents).toEqual([]);
    expect(h.office.getState().employees.find((e) => e.id === chat.id)?.agentId).toBeNull();
  });

  it("reassigns historical chats to another General agent of the same boss on delete", async () => {
    const h = createHarness();
    const general = h.office.createAgent({ bossId: "claude", name: "General", species: "wolf" });
    const specialist = h.office.createAgent({ bossId: "claude", name: "Spec", species: "fox", role: "Explore" });

    const chat = h.office.hire({
      agentId: specialist.id,
      bossId: "claude",
      task: "Map repo",
      workingDirectory: h.dir,
    });
    await h.office.stop(chat.id);

    h.office.deleteAgent(specialist.id);
    expect(h.office.getState().employees.find((e) => e.id === chat.id)?.agentId).toBe(general.id);
  });

  it("backfillAgents groups legacy employees without agentId by (bossId, role)", () => {
    const h = createHarness();
    const now = "2026-11-24T00:00:00Z";
    h.repository.insertEmployee({
      id: "legacy-1",
      bossId: "claude",
      agentId: null,
      hiredBy: null,
      task: "Chat 1",
      workingDirectory: h.dir,
      name: "Milo",
      species: "wolf",
      importedAt: null,
      role: null,
      jobTitle: "Engineer",
      providerSessionId: null,
      status: "idle",
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    });
    h.repository.insertEmployee({
      id: "legacy-2",
      bossId: "claude",
      agentId: null,
      hiredBy: null,
      task: "Chat 2",
      workingDirectory: h.dir,
      name: "Luna",
      species: "cat",
      importedAt: null,
      role: null,
      jobTitle: null,
      providerSessionId: null,
      status: "idle",
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    });

    const created = h.office.backfillAgents();
    expect(created).toBe(1);
    const agents = h.office.getState().agents;
    expect(agents).toHaveLength(1);
    expect(agents[0]!.name).toBe("Milo");
    const [e1, e2] = h.office.getState().employees;
    expect(e1!.agentId).toBe(agents[0]!.id);
    expect(e2!.agentId).toBe(agents[0]!.id);
  });

  it("tracks live tool_call / tool_result activity and emits employee_activity events", async () => {
    const h = createHarness();
    const activities: Array<{ employeeId: string; category: string | null; serverName: string | null }> = [];
    h.office.subscribe((e) => {
      if (e.type === "employee_activity") {
        activities.push({
          employeeId: e.employeeId,
          category: e.activity?.category ?? null,
          serverName: e.activity?.serverName ?? null,
        });
      }
    });

    const chat = h.office.hire({ bossId: "claude", task: "Check memory", workingDirectory: h.dir });
    await waitFor(() => h.sdk.sessions.length > 0);
    h.sdk.last.init();
    await waitFor(() => h.repository.getEmployee(chat.id)?.status === "working");

    h.sdk.last.assistant([
      { type: "tool_use", id: "tu-1", name: "mcp__engram__mem_search", input: { query: "agents" } },
    ]);
    await waitFor(() => h.office.getState().employees.find((e) => e.id === chat.id)?.activity?.category === "mcp_request");

    expect(h.office.getState().employees.find((e) => e.id === chat.id)?.activity).toMatchObject({
      category: "mcp_request",
      serverName: "engram",
      label: "engram · mem_search",
    });

    h.sdk.last.emit({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tu-1", content: "ok" }] },
    });
    await waitFor(() => !h.office.getState().employees.find((e) => e.id === chat.id)?.activity);

    expect(activities).toEqual([
      { employeeId: chat.id, category: "mcp_request", serverName: "engram" },
      { employeeId: chat.id, category: null, serverName: null },
    ]);
  });

  it("US-01 / AC-02, AC-03: persists and cascades agent model and mode and rejects invalid values", () => {
    const h = createHarness();
    const agent = h.office.createAgent({
      bossId: "claude",
      name: "Ada",
      species: "fox",
      model: "claude-opus-4-1",
      mode: "turbo",
    });
    expect(agent.model).toBe("claude-opus-4-1");
    expect(agent.mode).toBe("turbo");

    const chat = h.office.hire({
      agentId: agent.id,
      bossId: "claude",
      task: "Check config",
      workingDirectory: h.dir,
    });
    expect(chat.model).toBe("claude-opus-4-1");
    expect(chat.mode).toBe("turbo");

    h.office.updateProfile(chat.id, { model: "claude-sonnet-4-5", mode: "request_review" });
    const state = h.office.getState();
    expect(state.employees.find((e) => e.id === chat.id)).toMatchObject({
      model: "claude-sonnet-4-5",
      mode: "request_review",
    });
    expect(state.agents.find((a) => a.id === agent.id)).toMatchObject({
      model: "claude-sonnet-4-5",
      mode: "request_review",
    });

    expect(() => h.office.updateAgent(agent.id, { mode: "invalid" })).toThrow(/mode/i);
    expect(h.office.getState().agents.find((a) => a.id === agent.id)?.mode).toBe("request_review");
  });
});

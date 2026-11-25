import { describe, expect, it } from "vitest";
import type { Agent, Employee } from "../api/types";
import {
  aggregateAgentActivity,
  aggregateAgentStatus,
  agentDisplayLabel,
  groupEmployeesByAgent,
} from "./agentView";
import { initialOfficeState, officeReducer } from "./officeReducer";

const baseAgent: Agent = {
  id: "a1",
  bossId: "claude",
  name: "Maya",
  species: "fox",
  role: "review-risk",
  jobTitle: "Reviewer",
  createdAt: "2026-11-24T00:00:00Z",
  updatedAt: "2026-11-24T00:00:00Z",
};

function makeChat(overrides: Partial<Employee>): Employee {
  return {
    id: "e1",
    bossId: "claude",
    agentId: "a1",
    hiredBy: null,
    task: "Audit code",
    workingDirectory: "/repo",
    name: "Maya",
    species: "fox",
    importedAt: null,
    role: "review-risk",
    jobTitle: "Reviewer",
    providerSessionId: null,
    status: "idle",
    failureReason: null,
    createdAt: "2026-11-24T00:00:00Z",
    updatedAt: "2026-11-24T00:00:00Z",
    ...overrides,
  };
}

describe("agentView helpers", () => {
  it("aggregates agent status with urgent states taking precedence", () => {
    expect(aggregateAgentStatus([])).toBe("idle");
    expect(aggregateAgentStatus([], { onBreak: true })).toBe("on_break");
    expect(aggregateAgentStatus([makeChat({ status: "idle" }), makeChat({ id: "e2", status: "working" })])).toBe(
      "working",
    );
    expect(
      aggregateAgentStatus([
        makeChat({ status: "working" }),
        makeChat({ id: "e2", status: "waiting_approval" }),
      ]),
    ).toBe("waiting_approval");
  });

  it("prioritizes mcp_request activity among active working chats", () => {
    const fileChat = makeChat({
      id: "e1",
      status: "working",
      activity: {
        category: "searching_files",
        toolName: "Grep",
        serverName: null,
        label: "Grep",
        startedAt: "2026-11-24T00:00:02Z",
      },
    });
    const mcpChat = makeChat({
      id: "e2",
      status: "working",
      activity: {
        category: "mcp_request",
        toolName: "mcp__engram__mem_search",
        serverName: "engram",
        label: "engram · mem_search",
        startedAt: "2026-11-24T00:00:01Z",
      },
    });
    expect(aggregateAgentActivity([fileChat, mcpChat])?.category).toBe("mcp_request");
    expect(aggregateAgentActivity([makeChat({ status: "idle", activity: mcpChat.activity })])).toBeNull();
  });

  it("formats agent display labels cleanly", () => {
    expect(agentDisplayLabel(baseAgent)).toBe("Maya · Reviewer · review-risk");
    expect(agentDisplayLabel({ name: "Milo", jobTitle: null, role: null })).toBe("Milo");
  });

  it("groups chats by team agent and includes 0-chat agents", () => {
    const idleAgent: Agent = { ...baseAgent, id: "a2", name: "Koda", role: null, jobTitle: null };
    const chat = makeChat({ id: "e1", agentId: "a1" });
    const groups = groupEmployeesByAgent([chat], [baseAgent, idleAgent]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.employees).toHaveLength(1);
    expect(groups[1]!.employees).toHaveLength(0);
  });

  it("handles agent_updated, agent_removed, and employee_activity in officeReducer", () => {
    let state = officeReducer(initialOfficeState, {
      type: "server_event",
      event: { type: "agent_updated", agent: baseAgent },
    });
    expect(state.agents).toEqual([baseAgent]);

    const chat = makeChat({ id: "e1", status: "working" });
    state = officeReducer(state, {
      type: "server_event",
      event: { type: "employee_updated", employee: chat },
    });
    state = officeReducer(state, {
      type: "server_event",
      event: {
        type: "employee_activity",
        employeeId: "e1",
        activity: {
          category: "searching_files",
          toolName: "Read",
          serverName: null,
          label: "Read",
          startedAt: "2026-11-24T00:00:00Z",
        },
      },
    });
    expect(state.employees[0]!.activity?.category).toBe("searching_files");

    state = officeReducer(state, {
      type: "server_event",
      event: { type: "agent_removed", agentId: "a1" },
    });
    expect(state.agents).toEqual([]);
  });
});

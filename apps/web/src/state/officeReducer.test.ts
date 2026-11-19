import { describe, expect, it } from "vitest";
import type { ApprovalRequest, Employee, Message } from "../api/types";
import { initialOfficeState, officeReducer, type OfficeState } from "./officeReducer";

const employee = (over: Partial<Employee> = {}): Employee => ({
  id: "e1",
  bossId: "claude",
  hiredBy: null,
  task: "Fix bug",
  workingDirectory: "/tmp",
  name: "Ada",
  species: "fox",
  importedAt: null,
  providerSessionId: null,
  status: "working",
  failureReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const message = (over: Partial<Message> = {}): Message => ({
  id: "m1",
  employeeId: "e1",
  kind: "agent_text",
  content: "hello",
  toolName: null,
  toolUseId: null,
  parentToolUseId: null,
  createdAt: "2026-01-01T00:00:01.000Z",
  sourceUuid: null,
  ...over,
});

const approval = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: "a1",
  employeeId: "e1",
  kind: "permission",
  toolName: "Bash",
  summary: "ls",
  input: {},
  status: "pending",
  decision: null,
  answers: null,
  canApproveForSession: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  decidedAt: null,
  ...over,
});

const apply = (state: OfficeState, event: Parameters<typeof officeReducer>[1]) =>
  officeReducer(state, event);

describe("office reducer", () => {
  it("US-03 / AC-05: does not duplicate messages after reconnect reload", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "message_added", message: message({ id: "m1" }) },
    });
    state = apply(state, {
      type: "messages_loaded",
      employeeId: "e1",
      messages: [message({ id: "m1" }), message({ id: "m2", createdAt: "2026-01-01T00:00:02.000Z" })],
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "message_added", message: message({ id: "m2", createdAt: "2026-01-01T00:00:02.000Z" }) },
    });
    expect((state.messages["e1"] ?? []).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("US-03 / AC-01: accumulates deltas per employee", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "message_delta", employeeId: "e1", text: "Hel" },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "message_delta", employeeId: "e1", text: "lo" },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "message_delta", employeeId: "e2", text: "x" },
    });
    expect(state.liveText).toEqual({ e1: "Hello", e2: "x" });
  });

  it("US-03 / AC-04: drops live text when agent_text arrives, keeps it for other kinds", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "message_delta", employeeId: "e1", text: "partial" },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "message_added", message: message({ id: "t1", kind: "tool_call" }) },
    });
    expect(state.liveText["e1"]).toBe("partial");
    state = apply(state, {
      type: "server_event",
      event: { type: "message_added", message: message({ id: "m9", kind: "agent_text" }) },
    });
    expect(state.liveText["e1"]).toBeUndefined();
  });

  it("US-04 / AC-01: approval_requested adds a pending request without duplicates", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "approval_requested", approval: approval() },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "approval_requested", approval: approval() },
    });
    expect(state.approvals).toHaveLength(1);
  });

  it("US-04 / AC-02: approval_updated removes the request once decided", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "approval_requested", approval: approval() },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "approval_updated", approval: approval({ status: "approved", decision: "approve" }) },
    });
    expect(state.approvals).toEqual([]);
  });

  it("US-04 / AC-05: expired approvals leave the inbox", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "approval_requested", approval: approval({ id: "a2" }) },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "approval_updated", approval: approval({ id: "a2", status: "expired" }) },
    });
    expect(state.approvals).toEqual([]);
  });

  it("US-02 / AC-03: employee_updated replaces status in place", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "employee_updated", employee: employee({ status: "working" }) },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "employee_updated", employee: employee({ status: "idle" }) },
    });
    expect(state.employees).toHaveLength(1);
    expect(state.employees[0]?.status).toBe("idle");
  });

  it("US-07 / AC-01: state_loaded keeps only pending approvals and clears stale live text", () => {
    let state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "message_delta", employeeId: "e1", text: "stale" },
    });
    state = apply(state, { type: "select", employeeId: "gone" });
    state = apply(state, {
      type: "state_loaded",
      snapshot: {
        bosses: [],
        employees: [employee()],
        approvals: [approval(), approval({ id: "a3", status: "approved" })],
      },
    });
    expect(state.approvals.map((a) => a.id)).toEqual(["a1"]);
    expect(state.liveText).toEqual({});
    expect(state.selectedId).toBeNull();
    expect(state.loaded).toBe(true);
  });
});

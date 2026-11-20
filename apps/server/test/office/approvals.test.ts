import { describe, expect, it } from "vitest";
import type { ApprovalRequest } from "../../src/office/domain/types.ts";
import { createHarness, hireWorking, statusOf, type Harness } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

function pending(h: Harness): ApprovalRequest[] {
  return h.repository.listPendingApprovals();
}

async function ask(
  h: Harness,
  toolName: string,
  input: Record<string, unknown>,
  extra: { suggestions?: object[]; signal?: AbortSignal } = {},
) {
  const before = pending(h).length;
  const result = h.sdk.last.askTool(toolName, input, extra);
  await waitFor(() => pending(h).length === before + 1);
  return { result, approval: pending(h).at(-1)! };
}

describe("US-04 approve or reject permission requests", () => {
  it("US-04 / AC-01: persists a pending request with a readable summary and marks the employee waiting", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const { approval } = await ask(h, "Bash", { command: "rm -rf build" });

    expect(approval).toMatchObject({
      employeeId: employee.id,
      kind: "permission",
      toolName: "Bash",
      summary: "rm -rf build",
      status: "pending",
      canApproveForSession: false,
      input: { command: "rm -rf build" },
    });
    expect(statusOf(h, employee.id)).toBe("waiting_approval");
    expect(h.office.getState().approvals.map((a) => a.id)).toEqual([approval.id]);
    expect(h.emitted.some((e) => e.type === "approval_requested" && e.approval.id === approval.id)).toBe(true);
  });

  it("US-04 / AC-01: edits summarize as the file path; other tools as compact JSON", async () => {
    const h = createHarness();
    await hireWorking(h);
    const edit = await ask(h, "Edit", { file_path: "/src/a.ts", old_string: "a", new_string: "b" });
    expect(edit.approval.summary).toBe("/src/a.ts");
    const other = await ask(h, "WebFetch", { url: "https://x.test" });
    expect(other.approval.summary).toBe('{"url":"https://x.test"}');
  });

  it("US-04 / AC-02: approving allows with the original input, stores approved, returns to working", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const input = { command: "npm test" };
    const { result, approval } = await ask(h, "Bash", input);

    const decided = h.office.decide(approval.id, { decision: "approve" });
    expect(decided).toMatchObject({ status: "approved", decision: "approve" });
    expect(decided.decidedAt).not.toBeNull();
    expect(await result).toEqual({ behavior: "allow", updatedInput: input });
    expect(h.repository.getApproval(approval.id)?.status).toBe("approved");
    expect(statusOf(h, employee.id)).toBe("working");
  });

  it("US-04 / AC-03: rejecting denies with 'Rejected by the owner' and stores rejected", async () => {
    const h = createHarness();
    await hireWorking(h);
    const { result, approval } = await ask(h, "Bash", { command: "rm x" });
    h.office.decide(approval.id, { decision: "reject" });
    expect(await result).toEqual({ behavior: "deny", message: "Rejected by the owner" });
    expect(h.repository.getApproval(approval.id)).toMatchObject({ status: "rejected", decision: "reject" });
  });

  it("US-04 / AC-04: a second decision is rejected with approval_not_pending and nothing reaches the agent", async () => {
    const h = createHarness();
    await hireWorking(h);
    const { result, approval } = await ask(h, "Bash", { command: "ls" });
    h.office.decide(approval.id, { decision: "reject" });
    const first = await result;

    expect(() => h.office.decide(approval.id, { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "approval_not_pending" }),
    );
    expect(h.repository.getApproval(approval.id)?.status).toBe("rejected");
    expect(first).toEqual({ behavior: "deny", message: "Rejected by the owner" });
  });

  it("US-04 / AC-04: deciding an unknown request is not_found", () => {
    const h = createHarness();
    expect(() => h.office.decide("missing", { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "not_found" }),
    );
  });

  it("US-04 / AC-05: stopping the employee expires the request and the agent receives deny", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const { result, approval } = await ask(h, "Bash", { command: "ls" });
    await h.office.stop(employee.id);
    expect(await result).toMatchObject({ behavior: "deny" });
    expect(h.repository.getApproval(approval.id)?.status).toBe("expired");
    expect(() => h.office.decide(approval.id, { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "approval_not_pending" }),
    );
  });

  it("US-04 / AC-05: the SDK aborting the call expires the request and the agent receives deny", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const controller = new AbortController();
    const { result, approval } = await ask(h, "Bash", { command: "ls" }, { signal: controller.signal });
    controller.abort();
    expect(await result).toMatchObject({ behavior: "deny" });
    expect(h.repository.getApproval(approval.id)?.status).toBe("expired");
    expect(statusOf(h, employee.id)).toBe("working");
    expect(() => h.office.decide(approval.id, { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "approval_not_pending" }),
    );
  });

  it("US-04 / AC-06: tools the settings allow never reach canUseTool, so no request exists", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    // The SDK auto-approves by itself: the agent just uses the tool and the result streams in.
    h.sdk.last.assistant([{ type: "tool_use", id: "tu-9", name: "Read", input: { file_path: "/ok" } }]);
    await waitFor(() => h.office.listMessages(employee.id).some((m) => m.kind === "tool_call"));
    expect(pending(h)).toHaveLength(0);
    expect(h.office.getState().approvals).toHaveLength(0);
  });

  it("US-04 / AC-07: approve for session stores the decision and passes the suggestions to the provider", async () => {
    const h = createHarness();
    await hireWorking(h);
    const suggestions = [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "npm test" }], behavior: "allow", destination: "session" }];
    const { result, approval } = await ask(h, "Bash", { command: "npm test" }, { suggestions });
    expect(approval.canApproveForSession).toBe(true);

    h.office.decide(approval.id, { decision: "approve_for_session" });
    expect(await result).toEqual({
      behavior: "allow",
      updatedInput: { command: "npm test" },
      updatedPermissions: suggestions,
    });
    expect(h.repository.getApproval(approval.id)).toMatchObject({ status: "approved", decision: "approve_for_session" });
  });

  it("US-04 / AC-07: approve for session is a validation error when the provider offers no suggestions", async () => {
    const h = createHarness();
    await hireWorking(h);
    const { approval } = await ask(h, "Bash", { command: "ls" });
    expect(() => h.office.decide(approval.id, { decision: "approve_for_session" })).toThrowError(
      expect.objectContaining({ code: "validation_error", field: "decision" }),
    );
    expect(h.repository.getApproval(approval.id)?.status).toBe("pending");
  });
});

describe("US-05 answer agent questions and plans", () => {
  const questions = [
    {
      question: "Which database?",
      header: "DB",
      multiSelect: false,
      options: [
        { label: "SQLite", description: "file" },
        { label: "Postgres", description: "server" },
      ],
    },
  ];

  it("US-05 / AC-01: AskUserQuestion becomes a question request carrying its options", async () => {
    const h = createHarness();
    await hireWorking(h);
    const { approval } = await ask(h, "AskUserQuestion", { questions });
    expect(approval).toMatchObject({ kind: "question", toolName: "AskUserQuestion", summary: "Which database?" });
    expect(approval.input).toEqual({ questions });
  });

  it("US-05 / AC-02: the picked option is returned as the tool answer and stored on the request", async () => {
    const h = createHarness();
    await hireWorking(h);
    const { result, approval } = await ask(h, "AskUserQuestion", { questions });
    const decided = h.office.decide(approval.id, { decision: "approve", answers: { "Which database?": "SQLite" } });
    expect(decided.answers).toEqual({ "Which database?": "SQLite" });
    expect(await result).toEqual({
      behavior: "allow",
      updatedInput: { questions, answers: { "Which database?": "SQLite" } },
    });
    expect(h.repository.getApproval(approval.id)?.answers).toEqual({ "Which database?": "SQLite" });
  });

  it("US-05 / AC-02: approving a question without answers is a validation error; rejecting needs none", async () => {
    const h = createHarness();
    await hireWorking(h);
    const { result, approval } = await ask(h, "AskUserQuestion", { questions });
    expect(() => h.office.decide(approval.id, { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "validation_error", field: "answers" }),
    );
    h.office.decide(approval.id, { decision: "reject" });
    expect(((await result) as PermissionResult).behavior).toBe("deny");
  });

  it("US-05 / AC-03: ExitPlanMode becomes a plan request with the plan text; approve and reject behave as permissions", async () => {
    const h = createHarness();
    await hireWorking(h);
    const input = { plan: "1. Add tests\n2. Fix bug" };
    const approved = await ask(h, "ExitPlanMode", input);
    expect(approved.approval).toMatchObject({ kind: "plan", summary: input.plan });
    h.office.decide(approved.approval.id, { decision: "approve" });
    expect(await approved.result).toEqual({ behavior: "allow", updatedInput: input });

    const rejected = await ask(h, "ExitPlanMode", input);
    h.office.decide(rejected.approval.id, { decision: "reject" });
    expect(await rejected.result).toEqual({ behavior: "deny", message: "Rejected by the owner" });
  });
});

describe("Safety invariant: no non-approval path ever answers allow", () => {
  it("adapter error while pending: request expires and the agent receives deny", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const { result, approval } = await ask(h, "Bash", { command: "ls" });
    h.sdk.last.fail(new Error("boom"));
    expect(await result).toMatchObject({ behavior: "deny" });
    expect(h.repository.getApproval(approval.id)?.status).toBe("expired");
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(() => h.office.decide(approval.id, { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "approval_not_pending" }),
    );
  });

  it("server shutdown while pending: request expires and the agent receives deny", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const { result, approval } = await ask(h, "Bash", { command: "ls" });
    await h.office.shutdown();
    expect(await result).toMatchObject({ behavior: "deny" });
    expect(h.repository.getApproval(approval.id)?.status).toBe("expired");
    expect(statusOf(h, employee.id)).toBe("stopped");
  });

  it("a request arriving after the session was stopped is denied and never persisted as pending", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const session = h.sdk.last;
    await h.office.stop(employee.id);
    expect(await session.askTool("Bash", { command: "ls" })).toMatchObject({ behavior: "deny" });
    expect(pending(h)).toHaveLength(0);
  });

  it("an already aborted signal is denied immediately", async () => {
    const h = createHarness();
    await hireWorking(h);
    const controller = new AbortController();
    controller.abort();
    expect(await h.sdk.last.askTool("Bash", { command: "ls" }, { signal: controller.signal })).toMatchObject({
      behavior: "deny",
    });
    expect(pending(h)).toHaveLength(0);
  });

  it("a failing delivery path (repository error) is denied, never allowed", async () => {
    const h = createHarness();
    await hireWorking(h);
    h.repository.insertApproval = () => {
      throw new Error("disk full");
    };
    expect(await h.sdk.last.askTool("Bash", { command: "ls" })).toMatchObject({ behavior: "deny" });
  });
});

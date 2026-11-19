import { describe, expect, it } from "vitest";
import { OfficeError } from "../../src/office/domain/types.ts";
import { createHarness, statusOf } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

describe("US-02 hire a Claude employee", () => {
  it("US-02 / AC-01: persists the employee as starting, then working, running in the chosen folder", async () => {
    const h = createHarness();
    const employee = h.office.hire({ bossId: "claude", task: "  Fix the bug  ", workingDirectory: h.dir });

    expect(employee.status).toBe("starting");
    expect(employee.hiredBy).toBeNull();
    expect(employee.task).toBe("Fix the bug");
    expect(h.repository.getEmployee(employee.id)).toBeDefined();

    await waitFor(() => h.sdk.sessions.length === 1);
    const session = h.sdk.last;
    expect(session.options.cwd).toBe(h.dir);
    expect(session.options.settingSources).toEqual(["user", "project", "local"]);
    expect(session.options.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
    expect(session.options.permissionMode).toBe("default");
    expect(session.options.includePartialMessages).toBe(true);
    expect(session.options.resume).toBeUndefined();
    await waitFor(() => session.prompts.length === 1);
    expect(session.prompts[0]).toBe("Fix the bug");

    session.init("sess-42");
    await waitFor(() => statusOf(h, employee.id) === "working");
    expect(h.repository.getEmployee(employee.id)?.providerSessionId).toBe("sess-42");

    const statuses = h.emitted.flatMap((e) => (e.type === "employee_updated" ? [e.employee.status] : []));
    expect(statuses.indexOf("starting")).toBeLessThan(statuses.indexOf("working"));
  });

  it("US-02 / AC-02: rejects an empty task and invalid folders without creating an employee", () => {
    const h = createHarness();
    const field = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        expect(error).toBeInstanceOf(OfficeError);
        return (error as OfficeError).field;
      }
      throw new Error("expected an error");
    };
    expect(field(() => h.office.hire({ bossId: "claude", task: "   ", workingDirectory: h.dir }))).toBe("task");
    expect(field(() => h.office.hire({ bossId: "claude", task: "x", workingDirectory: "/definitely/not/here" }))).toBe(
      "workingDirectory",
    );
    expect(field(() => h.office.hire({ bossId: "claude", task: "x", workingDirectory: import.meta.filename }))).toBe(
      "workingDirectory",
    );
    expect(field(() => h.office.hire({ bossId: "nobody", task: "x", workingDirectory: h.dir }))).toBe("bossId");
    expect(h.repository.listEmployees()).toHaveLength(0);
    expect(h.sdk.sessions).toHaveLength(0);
  });

  it("US-02 / AC-02: a boss that is not available is rejected with boss_unavailable", () => {
    const h = createHarness();
    try {
      h.office.hire({ bossId: "codex", task: "x", workingDirectory: h.dir });
      throw new Error("expected an error");
    } catch (error) {
      expect((error as OfficeError).code).toBe("boss_unavailable");
    }
    expect(h.repository.listEmployees()).toHaveLength(0);
  });

  it("US-02 / AC-03: becomes idle when the agent finishes its task", async () => {
    const h = createHarness();
    const employee = h.office.hire({ bossId: "claude", task: "t", workingDirectory: h.dir });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.init();
    h.sdk.last.result("success");
    await waitFor(() => statusOf(h, employee.id) === "idle");
  });

  it("US-02 / AC-04: becomes failed with the reason when the CLI cannot start (query throws)", async () => {
    const h = createHarness();
    h.sdk.throwOnQuery = new Error("Not logged in");
    const employee = h.office.hire({ bossId: "claude", task: "t", workingDirectory: h.dir });
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBe("Not logged in");
  });

  it("US-02 / AC-04: becomes failed when the stream errors before init", async () => {
    const h = createHarness();
    const employee = h.office.hire({ bossId: "claude", task: "t", workingDirectory: h.dir });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.fail(new Error("Claude Code process exited with code 1"));
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toContain("exited with code 1");
  });

  it("US-02 / AC-04: becomes failed when an error result arrives before init", async () => {
    const h = createHarness();
    const employee = h.office.hire({ bossId: "claude", task: "t", workingDirectory: h.dir });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.result("error_during_execution", { errors: ["Authentication required"] });
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBe("Authentication required");
  });
});

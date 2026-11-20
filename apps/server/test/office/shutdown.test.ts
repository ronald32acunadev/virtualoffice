import { describe, expect, it } from "vitest";
import { createHarness, hireWorking, statusOf } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import { isSignalTermination } from "../../src/office/application/office-service.ts";

const INTERRUPTED = "Session interrupted: the agent process was terminated. Send a message to resume.";

describe("US-07 shutdown is not a failure", () => {
  it("US-07 / AC-01: process death during shutdown leaves the employee stopped and expires approvals", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const result = h.sdk.last.askTool("Bash", { command: "ls" });
    await waitFor(() => statusOf(h, employee.id) === "waiting_approval");
    h.office.beginShutdown();
    h.sdk.last.fail(new Error("Claude Code process exited with code 143"));
    await waitFor(() => statusOf(h, employee.id) !== "waiting_approval");
    expect(statusOf(h, employee.id)).toBe("stopped");
    expect(h.office.listMessages(employee.id).map((m) => m.content).join("\n")).not.toContain("Employee failed");
    expect(h.repository.listPendingApprovals()).toHaveLength(0);
    expect(await result).toMatchObject({ behavior: "deny" });
  });

  it("US-07 / AC-01: shutdown() itself still stops working employees", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    await h.office.shutdown();
    expect(statusOf(h, employee.id)).toBe("stopped");
  });

  it.each([143, 130])("US-07 / AC-02: exit code %i without shutdown becomes stopped with the interruption message", async (code) => {
    const h = createHarness();
    const employee = await hireWorking(h);
    h.sdk.last.fail(new Error(`Claude Code process exited with code ${code}`));
    await waitFor(() => statusOf(h, employee.id) === "stopped");
    const messages = h.office.listMessages(employee.id).map((m) => m.content);
    expect(messages).toContain(INTERRUPTED);
    expect(messages.join("\n")).not.toContain("Employee failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBeNull();
  });

  it("US-07 / AC-03: another exit code still fails with its reason", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    h.sdk.last.fail(new Error("Claude Code process exited with code 1"));
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBe("Claude Code process exited with code 1");
    expect(h.office.listMessages(employee.id).map((m) => m.content)).toContain(
      "Employee failed: Claude Code process exited with code 1",
    );
  });

  it("US-07 / AC-03: a start error still fails with its reason", async () => {
    const h = createHarness();
    h.sdk.throwOnQuery = new Error("nope");
    const employee = h.office.hire({ bossId: "claude", task: "c", workingDirectory: h.dir });
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBe("nope");
  });
});

describe("isSignalTermination", () => {
  it("detects exit codes 130 and 143", () => {
    expect(isSignalTermination("Claude Code process exited with code 143")).toBe(true);
    expect(isSignalTermination("Claude Code process exited with code 130")).toBe(true);
  });
  it("detects termination messages", () => {
    expect(isSignalTermination("Claude Code process terminated by signal SIGTERM")).toBe(true);
    expect(isSignalTermination("process was killed by SIGINT")).toBe(true);
  });
  it("rejects other failures", () => {
    expect(isSignalTermination("Claude Code process exited with code 1")).toBe(false);
    expect(isSignalTermination("exited with code 1430")).toBe(false);
    expect(isSignalTermination("nope")).toBe(false);
  });
});

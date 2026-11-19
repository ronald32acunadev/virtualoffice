import { describe, expect, it } from "vitest";
import { createHarness, hireWorking, statusOf } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

describe("US-06 stop an employee", () => {
  it("US-06 / AC-01: stopping a working employee interrupts the session and marks it stopped", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const session = h.sdk.last;
    const stopped = await h.office.stop(employee.id);
    expect(stopped.status).toBe("stopped");
    expect(statusOf(h, employee.id)).toBe("stopped");
    expect(session.interrupted).toBe(true);
    expect(session.closed).toBe(true);
    expect(session.options.abortController?.signal.aborted).toBe(true);
    expect(h.adapter.hasSession(employee.id)).toBe(false);
  });

  it("US-06 / AC-01: stopping a waiting_approval employee expires its pending requests", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const result = h.sdk.last.askTool("Bash", { command: "ls" });
    await waitFor(() => statusOf(h, employee.id) === "waiting_approval");
    await h.office.stop(employee.id);
    expect(statusOf(h, employee.id)).toBe("stopped");
    expect(h.repository.listPendingApprovals()).toHaveLength(0);
    expect(await result).toMatchObject({ behavior: "deny" });
  });

  it("US-06 / AC-01: late events from a stopped session do not change the employee", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    const session = h.sdk.last;
    await h.office.stop(employee.id);
    session.assistant([{ type: "text", text: "late" }]);
    session.result("success");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statusOf(h, employee.id)).toBe("stopped");
    expect(h.office.listMessages(employee.id).map((m) => m.content)).toEqual(["Fix the bug"]);
  });

  it("US-06 / AC-02: stop on idle, stopped, and failed employees is a no-op without errors", async () => {
    const h = createHarness();
    const idle = await hireWorking(h, "a");
    h.sdk.last.result("success");
    await waitFor(() => statusOf(h, idle.id) === "idle");
    await expect(h.office.stop(idle.id)).resolves.toMatchObject({ status: "idle" });

    const stopped = await hireWorking(h, "b");
    await h.office.stop(stopped.id);
    await expect(h.office.stop(stopped.id)).resolves.toMatchObject({ status: "stopped" });

    h.sdk.throwOnQuery = new Error("nope");
    const failed = h.office.hire({ bossId: "claude", task: "c", workingDirectory: h.dir });
    await waitFor(() => statusOf(h, failed.id) === "failed");
    await expect(h.office.stop(failed.id)).resolves.toMatchObject({ status: "failed" });
  });

  it("US-06 / AC-02: stopping an unknown employee is not_found", async () => {
    const h = createHarness();
    await expect(h.office.stop("nope")).rejects.toMatchObject({ code: "not_found" });
  });
});

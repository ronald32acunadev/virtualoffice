import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { createHarness, hireWorking, makeTempDir, statusOf } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

const tempDirs: string[] = [];
function dbFile(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return path.join(dir, "office.sqlite");
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("US-07 keep history and resume employees", () => {
  it("US-07 / AC-01: employees, conversations, and decisions survive a restart", async () => {
    const file = dbFile();
    const first = createHarness(new SqliteOfficeRepository(file));
    const employee = await hireWorking(first);
    first.sdk.last.assistant([{ type: "text", text: "Hello" }]);
    const result = first.sdk.last.askTool("Bash", { command: "ls" });
    await waitFor(() => first.repository.listPendingApprovals().length === 1);
    const approvalId = first.repository.listPendingApprovals()[0]!.id;
    first.office.decide(approvalId, { decision: "approve" });
    await result;
    first.sdk.last.result("success");
    await waitFor(() => statusOf(first, employee.id) === "idle");
    const messages = first.office.listMessages(employee.id);
    const stored = first.repository.getEmployee(employee.id)!;
    first.repository.close();

    const second = createHarness(new SqliteOfficeRepository(file));
    second.office.recoverOnStartup();
    expect(second.office.getState().employees).toEqual([stored]);
    expect(second.office.listMessages(employee.id)).toEqual(messages);
    expect(second.repository.getApproval(approvalId)).toMatchObject({ status: "approved", decision: "approve" });
    second.repository.close();
  });

  it("US-07 / AC-02: working and waiting_approval employees become stopped and pending requests expire", async () => {
    const file = dbFile();
    const first = createHarness(new SqliteOfficeRepository(file));
    const working = await hireWorking(first, "w");
    const waiting = await hireWorking(first, "x");
    void first.sdk.last.askTool("Bash", { command: "ls" });
    await waitFor(() => statusOf(first, waiting.id) === "waiting_approval");
    const approvalId = first.repository.listPendingApprovals()[0]!.id;
    first.repository.close();

    const second = createHarness(new SqliteOfficeRepository(file));
    expect(second.office.recoverOnStartup()).toEqual({ stopped: 2, expired: 1 });
    expect(statusOf(second, working.id)).toBe("stopped");
    expect(statusOf(second, waiting.id)).toBe("stopped");
    expect(second.repository.getApproval(approvalId)?.status).toBe("expired");
    expect(second.office.getState().approvals).toHaveLength(0);
    // The old request can no longer be decided and nothing is delivered anywhere.
    expect(() => second.office.decide(approvalId, { decision: "approve" })).toThrowError(
      expect.objectContaining({ code: "approval_not_pending" }),
    );
    second.repository.close();
  });

  it("US-07 / AC-03: messaging a stopped employee without a live session resumes the stored session", async () => {
    const file = dbFile();
    const first = createHarness(new SqliteOfficeRepository(file));
    const employee = await hireWorking(first);
    first.sdk.last.init("sess-keep");
    await waitFor(() => first.repository.getEmployee(employee.id)?.providerSessionId === "sess-keep");
    first.repository.close();

    const second = createHarness(new SqliteOfficeRepository(file));
    second.office.recoverOnStartup();
    expect(statusOf(second, employee.id)).toBe("stopped");
    second.office.sendMessage(employee.id, "Continue please");
    expect(statusOf(second, employee.id)).toBe("working");
    await waitFor(() => second.sdk.sessions.length === 1);
    expect(second.sdk.last.options.resume).toBe("sess-keep");
    expect(second.sdk.last.options.cwd).toBe(second.dir);
    await waitFor(() => second.sdk.last.prompts.includes("Continue please"));
    second.repository.close();
  });

  it("US-07 / AC-03: an idle employee with no live session (after restart) is resumed too", async () => {
    const file = dbFile();
    const first = createHarness(new SqliteOfficeRepository(file));
    const employee = await hireWorking(first);
    first.sdk.last.result("success");
    await waitFor(() => statusOf(first, employee.id) === "idle");
    first.repository.close();

    const second = createHarness(new SqliteOfficeRepository(file));
    second.office.recoverOnStartup();
    expect(statusOf(second, employee.id)).toBe("idle");
    second.office.sendMessage(employee.id, "More");
    await waitFor(() => second.sdk.sessions.length === 1);
    expect(second.sdk.last.options.resume).toBe("sess-1");
    second.repository.close();
  });

  it("US-07 / AC-04: a failed resume marks the employee failed with the reason and keeps the history", async () => {
    const file = dbFile();
    const first = createHarness(new SqliteOfficeRepository(file));
    const employee = await hireWorking(first);
    first.sdk.last.assistant([{ type: "text", text: "earlier work" }]);
    await waitFor(() => first.office.listMessages(employee.id).length === 2);
    first.sdk.last.result("success");
    await waitFor(() => statusOf(first, employee.id) === "idle");
    first.repository.close();

    const second = createHarness(new SqliteOfficeRepository(file));
    second.office.recoverOnStartup();
    second.sdk.throwOnQuery = new Error("No conversation found with session ID: sess-1");
    second.office.sendMessage(employee.id, "Are you there?");
    await waitFor(() => statusOf(second, employee.id) === "failed");
    expect(second.repository.getEmployee(employee.id)?.failureReason).toContain("No conversation found");
    const contents = second.office.listMessages(employee.id).map((m) => m.content);
    expect(contents).toContain("earlier work");
    expect(contents).toContain("Are you there?");
    second.repository.close();
  });

  it("US-07 / AC-04: a failed employee can be resumed again with a new message", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    h.sdk.last.fail(new Error("crash"));
    await waitFor(() => statusOf(h, employee.id) === "failed");
    h.office.sendMessage(employee.id, "retry");
    await waitFor(() => h.sdk.sessions.length === 2);
    expect(h.sdk.last.options.resume).toBe("sess-1");
    expect(statusOf(h, employee.id)).toBe("working");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { createHarness, hireWorking } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";
import { buildApp } from "../../src/http/app.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { ClaudeAgentAdapter } from "../../src/agents/claude/claude-agent-adapter.ts";
import { FakeSdk } from "../helpers/fake-sdk.ts";
import os from "node:os";

describe("US-03: Break Time Management", () => {
  it("AC-01: Rate limit event transitions boss and employees to break", async () => {
    const h = createHarness();
    const emp1 = await hireWorking(h, "Task 1");
    const emp2 = await hireWorking(h, "Task 2");
    const stoppedEmp = await hireWorking(h, "Stopped task");
    await h.office.stop(stoppedEmp.id);

    const futureEpochSec = Math.floor(Date.now() / 1000) + 60;

    h.sdk.sessions[0]!.emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "rejected",
        utilization: 1,
        resetsAt: futureEpochSec,
        rateLimitType: "five_hour",
      },
      uuid: "u1",
      session_id: "sess-1",
    });

    await waitFor(() => h.office.getState().bosses.find((b) => b.id === "claude")?.onBreak === true);

    const state = h.office.getState();
    const claudeBoss = state.bosses.find((b) => b.id === "claude");

    expect(claudeBoss).toBeDefined();
    expect(claudeBoss?.onBreak).toBe(true);
    expect(claudeBoss?.breakUntil).toBe(new Date(futureEpochSec * 1000).toISOString());

    expect(state.employees.find((e) => e.id === emp1.id)?.status).toBe("on_break");
    expect(state.employees.find((e) => e.id === emp2.id)?.status).toBe("on_break");
    expect(state.employees.find((e) => e.id === stoppedEmp.id)?.status).toBe("stopped");

    await h.office.shutdown();
  });

  it("AC-01: Adapter failure with rate limit message transitions to break", async () => {
    const h = createHarness();
    const emp = await hireWorking(h);

    h.sdk.last.fail(new Error("HTTP 429 Too Many Requests: rate limit exceeded"));
    await waitFor(() => h.office.getState().bosses.find((b) => b.id === "claude")?.onBreak === true);

    const state = h.office.getState();
    const claudeBoss = state.bosses.find((b) => b.id === "claude");

    expect(claudeBoss?.onBreak).toBe(true);
    expect(claudeBoss?.breakReason).toContain("429");
    expect(state.employees.find((e) => e.id === emp.id)?.status).toBe("on_break");

    await h.office.shutdown();
  });

  it("AC-02: Operations reject during break", async () => {
    const h = createHarness();
    const emp = await hireWorking(h);

    const futureEpochSec = Math.floor(Date.now() / 1000) + 60;
    h.sdk.last.emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "rejected",
        utilization: 1,
        resetsAt: futureEpochSec,
        rateLimitType: "five_hour",
      },
      uuid: "u1",
      session_id: "sess-1",
    });

    await waitFor(() => h.office.getState().bosses.find((b) => b.id === "claude")?.onBreak === true);

    const sendMessageError = await h.office.sendMessage(emp.id, "hello").catch((e) => e);
    expect(sendMessageError).toBeDefined();
    expect(sendMessageError.code).toBe("provider_on_break");

    expect(() =>
      h.office.hire({ bossId: "claude", task: "New", workingDirectory: h.dir }),
    ).toThrow(expect.objectContaining({ code: "provider_on_break" }));

    const app = await buildApp({
      token: "test-token",
      port: 4321,
      repository: h.repository,
      office: h.office,
    });
    try {
      const headers = { host: "127.0.0.1:4321", authorization: "Bearer test-token" };
      const msgRes = await app.inject({
        method: "POST",
        url: `/api/employees/${emp.id}/messages`,
        headers,
        payload: { text: "blocked while resting" },
      });
      expect(msgRes.statusCode).toBe(409);
      expect(msgRes.json().error.code).toBe("provider_on_break");

      const hireRes = await app.inject({
        method: "POST",
        url: "/api/employees",
        headers,
        payload: { bossId: "claude", task: "Blocked hire", workingDirectory: h.dir },
      });
      expect(hireRes.statusCode).toBe(409);
      expect(hireRes.json().error.code).toBe("provider_on_break");
    } finally {
      await app.close();
      await h.office.shutdown();
    }
  });

  it("AC-03: Resume clears break and restores employees via HTTP", async () => {
    const h = createHarness();
    const emp = await hireWorking(h);

    const futureEpochSec = Math.floor(Date.now() / 1000) + 60;
    h.sdk.last.emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "rejected",
        utilization: 1,
        resetsAt: futureEpochSec,
        rateLimitType: "five_hour",
      },
      uuid: "u1",
      session_id: "sess-1",
    });
    await waitFor(() => h.office.getState().bosses.find((b) => b.id === "claude")?.onBreak === true);

    const app = await buildApp({
      token: "test-token",
      port: 4321,
      repository: h.repository,
      office: h.office,
    });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/bosses/claude/resume",
        headers: { host: "127.0.0.1:4321", authorization: "Bearer test-token" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().boss.onBreak).toBe(false);
    } finally {
      await app.close();
    }

    const state = h.office.getState();
    const claudeBoss = state.bosses.find((b) => b.id === "claude");
    expect(claudeBoss?.onBreak).toBe(false);
    expect(claudeBoss?.breakUntil).toBeNull();
    expect(state.employees.find((e) => e.id === emp.id)?.status).toBe("idle");

    await h.office.shutdown();
  });

  it("AC-03: Auto-clear when breakUntil elapses", async () => {
    let currentMs = 1_800_000_000_000;
    const sdk = new FakeSdk();
    const repository = new SqliteOfficeRepository(":memory:");
    const events = new InMemoryEventBus();
    const adapter = new ClaudeAgentAdapter(sdk.query);
    const office = new OfficeService({
      repository,
      adapter,
      events,
      now: () => new Date(currentMs),
    });

    const emp = office.hire({ bossId: "claude", task: "Clock test", workingDirectory: os.tmpdir() });
    await waitFor(() => sdk.sessions.length > 0);
    sdk.last.init();
    await waitFor(() => repository.getEmployee(emp.id)?.status === "working");

    const resetsAtSec = Math.floor(currentMs / 1000) + 60;
    sdk.last.emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "rejected",
        utilization: 1,
        resetsAt: resetsAtSec,
        rateLimitType: "five_hour",
      },
      uuid: "u1",
      session_id: "sess-1",
    });
    await waitFor(() => office.getState().bosses.find((b) => b.id === "claude")?.onBreak === true);
    expect(office.getState().employees.find((e) => e.id === emp.id)?.status).toBe("on_break");

    currentMs += 61_000;
    const afterState = office.getState();
    expect(afterState.bosses.find((b) => b.id === "claude")?.onBreak).toBe(false);
    expect(afterState.employees.find((e) => e.id === emp.id)?.status).toBe("idle");

    await office.shutdown();
  });
});

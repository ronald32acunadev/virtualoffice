import { describe, expect, it } from "vitest";
import { OfficeError } from "../../src/office/domain/types.ts";
import { createHarness, hireWorking, statusOf, type Harness } from "../helpers/harness.ts";
import { waitFor } from "../helpers/fake-sdk.ts";

const skill = { name: "judgment-day", description: "Dual review", argumentHint: "<target>" };
const builtinA = { name: "compact", description: "Compact", argumentHint: "", builtin: true };
const builtinB = { name: "help", description: "Help", argumentHint: "", builtin: true };
const skillB = { name: "chained-pr", description: "Chained PRs", argumentHint: "" };
const ownerAgent = { name: "review-risk", description: "Risk reviewer" };
const builtinAgent = { name: "Explore", description: "Explorer" };
const lists = {
  commands: [builtinA, skill, builtinB, skillB],
  agents: [builtinAgent, ownerAgent, { name: "claude", description: "General" }],
};

/** Runs one catalog request against a fake probe that answers with `lists`. */
async function probeOnce(h: Harness, run: () => Promise<unknown>, answer: object = lists) {
  const before = h.sdk.sessions.length;
  const pending = run();
  await waitFor(() => h.sdk.sessions.length === before + 1);
  h.sdk.last.resolveInit(answer);
  return pending;
}

/** Lets the adapter's fire-and-forget catalog reads finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const catalogOf = (h: Harness, extra: { refresh?: unknown } = {}) =>
  h.office.getCatalog({ workingDirectory: h.dir, ...extra });

async function expectCode(promise: Promise<unknown>, code: string, field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OfficeError);
  expect(error).toMatchObject({ code, ...(field ? { field } : {}) });
}

describe("US-01 folder catalog", () => {
  it("US-01 / AC-01: probes a folder with no employee; commands non-built-in first, agents owner's first with builtin flags", async () => {
    const h = createHarness();
    const catalog = (await probeOnce(h, () => catalogOf(h))) as Awaited<ReturnType<typeof catalogOf>>;
    expect(catalog.commands.map((c) => c.name)).toEqual(["judgment-day", "chained-pr", "compact", "help"]);
    expect(catalog.agents).toEqual([
      { name: "review-risk", description: "Risk reviewer", builtin: false },
      { name: "Explore", description: "Explorer", builtin: true },
      { name: "claude", description: "General", builtin: true },
    ]);
    expect(h.sdk.last.closed).toBe(true);
    expect(h.office.getState().employees).toEqual([]);
  });

  it("US-01 / AC-02: a second request is served from the cache; refresh re-probes", async () => {
    const h = createHarness();
    await probeOnce(h, () => catalogOf(h));
    const cached = await catalogOf(h);
    expect(h.sdk.sessions).toHaveLength(1);
    expect(cached.commands[0]!.name).toBe("judgment-day");

    const refreshed = (await probeOnce(h, () => catalogOf(h, { refresh: true }), { commands: [skillB], agents: [] })) as typeof cached;
    expect(h.sdk.sessions).toHaveLength(2);
    expect(refreshed.commands.map((c) => c.name)).toEqual(["chained-pr"]);
    expect((await catalogOf(h)).commands.map((c) => c.name)).toEqual(["chained-pr"]);
  });

  it("US-01 / AC-02: concurrent requests for the same folder share one probe", async () => {
    const h = createHarness();
    const first = catalogOf(h);
    const second = catalogOf(h);
    await waitFor(() => h.sdk.sessions.length >= 1);
    h.sdk.last.resolveInit(lists);
    await Promise.all([first, second]);
    expect(h.sdk.sessions).toHaveLength(1);
  });

  it("US-01 / AC-03: an employee with a live session answers from the session and refreshes the folder cache", async () => {
    const h = createHarness();
    const employee = await hireWorking(h);
    h.sdk.last.liveCommands = [builtinA, skill];
    h.sdk.last.liveAgents = [ownerAgent];
    const catalog = await h.office.getEmployeeCatalog(employee.id, {});
    expect(h.sdk.sessions).toHaveLength(1); // no probe
    expect(catalog.commands.map((c) => c.name)).toEqual(["judgment-day", "compact"]);
    expect(catalog.agents).toEqual([{ name: "review-risk", description: "Risk reviewer", builtin: false }]);
    // The folder cache now holds the same lists.
    expect((await catalogOf(h)).commands.map((c) => c.name)).toEqual(["judgment-day", "compact"]);
    expect(h.sdk.sessions).toHaveLength(1);
  });

  it("US-01 / AC-03: after init the live lists are cached, and a commands_changed push replaces the commands", async () => {
    const h = createHarness();
    const employee = h.office.hire({ bossId: "claude", task: "T", workingDirectory: h.dir });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.liveCommands = [skill];
    h.sdk.last.liveAgents = [ownerAgent];
    h.sdk.last.init();
    await waitFor(() => statusOf(h, employee.id) === "working");
    await settle();
    // Served from the cache filled after init (no probe).
    expect((await catalogOf(h)).commands.map((c) => c.name)).toEqual(["judgment-day"]);
    expect(h.sdk.sessions).toHaveLength(1);

    h.sdk.last.commandsChanged([skillB, builtinA]);
    await settle();
    expect((await catalogOf(h)).commands.map((c) => c.name)).toEqual(["chained-pr", "compact"]);
    expect(h.sdk.sessions).toHaveLength(1);
    // Agents are kept from the last known lists.
    expect((await catalogOf(h)).agents.map((a) => a.name)).toEqual(["review-risk"]);
  });

  it("US-01 / AC-04: a missing folder or a file is rejected before any probe runs", async () => {
    const h = createHarness();
    await expectCode(h.office.getCatalog({ workingDirectory: "/definitely/not/here" }), "validation_error", "workingDirectory");
    await expectCode(h.office.getCatalog({ workingDirectory: undefined }), "validation_error", "workingDirectory");
    expect(h.sdk.sessions).toHaveLength(0);
  });

  it("US-01 / AC-05: a failed probe is catalog_unavailable, is closed, and is not cached", async () => {
    const h = createHarness();
    const failing = catalogOf(h);
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.rejectInit(new Error("boom"));
    await expectCode(failing, "catalog_unavailable");
    expect(h.sdk.last.closed).toBe(true);
    // Not cached: the next request probes again and can succeed.
    const ok = (await probeOnce(h, () => catalogOf(h))) as Awaited<ReturnType<typeof catalogOf>>;
    expect(h.sdk.sessions).toHaveLength(2);
    expect(ok.commands).toHaveLength(4);
  });

  it("US-01 / AC-05: a probe that exceeds the timeout is catalog_unavailable and closed", async () => {
    const h = createHarness(undefined, { probeTimeoutMs: 20 });
    await expectCode(catalogOf(h), "catalog_unavailable");
    expect(h.sdk.last.closed).toBe(true);
  });

  it("US-01 / AC-03: an unknown employee is not_found", async () => {
    const h = createHarness();
    await expectCode(h.office.getEmployeeCatalog("nope", {}), "not_found");
  });
});

describe("US-03 specialists (server)", () => {
  it("US-03 / AC-02: hire with a role stores it and starts the session with agent: role; resume passes it too", async () => {
    const h = createHarness();
    const hiring = h.office.hireFromRequest({ bossId: "claude", task: "Review it", workingDirectory: h.dir, role: "review-risk" });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.resolveInit(lists); // the probe validating the role
    const employee = await hiring;
    expect(employee.role).toBe("review-risk");
    expect(h.repository.getEmployee(employee.id)?.role).toBe("review-risk");
    await waitFor(() => h.sdk.sessions.length === 2);
    expect(h.sdk.last.options.agent).toBe("review-risk");

    h.sdk.last.init();
    await waitFor(() => statusOf(h, employee.id) === "working");
    await h.office.stop(employee.id);
    const sending = h.office.sendMessage(employee.id, "again");
    await sending;
    await waitFor(() => h.sdk.sessions.length === 3);
    expect(h.sdk.last.options).toMatchObject({ agent: "review-risk", resume: "sess-1" });
  });

  it("US-03 / AC-02: a cached folder catalog validates the role without another probe", async () => {
    const h = createHarness();
    await probeOnce(h, () => catalogOf(h));
    const employee = await h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: h.dir, role: "Explore" });
    expect(employee.role).toBe("Explore");
    expect(h.sdk.sessions).toHaveLength(2); // one probe + the employee session
  });

  it("US-03 / AC-03: a role that is not in the folder's agents is a validation_error on role and creates nobody", async () => {
    const h = createHarness();
    const hiring = h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: h.dir, role: "ghost" });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.resolveInit(lists);
    await expectCode(hiring, "validation_error", "role");
    expect(h.office.getState().employees).toEqual([]);
    expect(h.sdk.sessions).toHaveLength(1);
  });

  it("US-03 / AC-03: with the catalog unavailable, a hire with a role is catalog_unavailable and creates nobody", async () => {
    const h = createHarness();
    const hiring = h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: h.dir, role: "review-risk" });
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.rejectInit(new Error("boom"));
    await expectCode(hiring, "catalog_unavailable");
    expect(h.office.getState().employees).toEqual([]);
  });

  it("US-03 / AC-03: other validation errors win before any probe", async () => {
    const h = createHarness();
    await expectCode(
      h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: "/not/here", role: "review-risk" }),
      "validation_error",
      "workingDirectory",
    );
    await expectCode(
      h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: h.dir, role: 7 }),
      "validation_error",
      "role",
    );
    expect(h.sdk.sessions).toHaveLength(0);
  });

  it("US-03 / AC-05: a hire without a role has role null and the session gets no agent option", async () => {
    const h = createHarness();
    const employee = await h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: h.dir });
    expect(employee.role).toBeNull();
    await waitFor(() => h.sdk.sessions.length === 1);
    expect("agent" in h.sdk.last.options).toBe(false);
    expect(h.sdk.sessions).toHaveLength(1); // no probe
  });

  it("US-03 / AC-06: when the role's agent is gone on resume, the employee fails with the SDK's reason", async () => {
    const h = createHarness();
    await probeOnce(h, () => catalogOf(h));
    const employee = await h.office.hireFromRequest({ bossId: "claude", task: "T", workingDirectory: h.dir, role: "review-risk" });
    await waitFor(() => h.sdk.sessions.length === 2);
    h.sdk.last.init();
    await waitFor(() => statusOf(h, employee.id) === "working");
    await h.office.stop(employee.id);
    await h.office.sendMessage(employee.id, "again");
    await waitFor(() => h.sdk.sessions.length === 3);
    h.sdk.last.fail(new Error("Agent 'review-risk' not found"));
    await waitFor(() => statusOf(h, employee.id) === "failed");
    expect(h.repository.getEmployee(employee.id)?.failureReason).toBe("Agent 'review-risk' not found");
    expect(h.repository.getEmployee(employee.id)?.role).toBe("review-risk");
  });
});

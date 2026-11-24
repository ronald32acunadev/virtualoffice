import { describe, expect, it } from "vitest";
import { assistantTurn, userTurn, waitFor } from "../helpers/fake-sdk.ts";
import { createHarness, hireWorking, statusOf } from "../helpers/harness.ts";

const HISTORY = [
  userTurn("u1", "Fix the login bug"),
  assistantTurn("a1", [
    { type: "text", text: "Looking" },
    { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/a.ts" } },
  ]),
  userTurn("u2", [{ type: "tool_result", tool_use_id: "tu-1", content: "body" }]),
  assistantTurn("a2", [{ type: "text", text: "from subagent" }], "tu-1"),
];

function setup() {
  const h = createHarness(undefined, { random: () => 0 });
  h.store.addSession({ sessionId: "s1", customTitle: "Login fix", cwd: h.dir, gitBranch: "main", lastModified: 3000, createdAt: 1000 }, HISTORY);
  return h;
}

describe("US-05 import existing Claude sessions", () => {
  it("US-05 / AC-01: sessions are listed newest first with title, folder, branch, dates and alreadyImported", async () => {
    const h = createHarness();
    h.store.addSession({ sessionId: "old", summary: "Old", lastModified: 1000 });
    h.store.addSession({ sessionId: "new", summary: "S", customTitle: "Custom", firstPrompt: "fp", lastModified: 5000, gitBranch: "dev", createdAt: 4000 });
    h.store.addSession({ sessionId: "bare", summary: "", firstPrompt: "First prompt", lastModified: 3000, cwd: undefined as never });
    const { sessions, total } = await h.office.listClaudeSessions({});
    expect(total).toBe(3);
    expect(sessions.map((s) => s.sessionId)).toEqual(["new", "bare", "old"]);
    expect(sessions[0]).toEqual({
      sessionId: "new",
      title: "Custom",
      cwd: h.dir,
      gitBranch: "dev",
      lastModified: new Date(5000).toISOString(),
      createdAt: new Date(4000).toISOString(),
      alreadyImported: false,
    });
    expect(sessions[1]).toMatchObject({ title: "First prompt", gitBranch: null, createdAt: null });
    await h.office.importClaudeSessions(["old"]);
    const after = await h.office.listClaudeSessions({});
    expect(after.sessions.map((s) => [s.sessionId, s.alreadyImported])).toEqual([["new", false], ["bare", false], ["old", true]]);
  });

  it("US-05 / AC-01: sessions started by the office itself are marked as already imported", async () => {
    const h = createHarness();
    const e = await hireWorking(h);
    h.sdk.last.init("sess-1");
    await waitFor(() => h.repository.getEmployee(e.id)?.providerSessionId === "sess-1");
    h.store.addSession({ sessionId: "sess-1" });
    expect((await h.office.listClaudeSessions({})).sessions[0]!.alreadyImported).toBe(true);
  });

  it("US-05 / AC-02: q filters all sessions by title and folder, case-insensitive, before paging", async () => {
    const h = createHarness();
    for (let i = 0; i < 5; i += 1) {
      h.store.addSession({ sessionId: `s${i}`, summary: i % 2 === 0 ? `Billing ${i}` : `Other ${i}`, cwd: i === 3 ? "/work/Billing-api" : "/x", lastModified: 1000 + i });
    }
    const all = await h.office.listClaudeSessions({ q: "bIlLiNg" });
    expect(all.total).toBe(4);
    expect(all.sessions.map((s) => s.sessionId)).toEqual(["s4", "s3", "s2", "s0"]);
    const page = await h.office.listClaudeSessions({ q: "billing", limit: "2", offset: "2" });
    expect(page.total).toBe(4);
    expect(page.sessions.map((s) => s.sessionId)).toEqual(["s2", "s0"]);
    expect((await h.office.listClaudeSessions({})).sessions).toHaveLength(5);
  });

  it("US-05 / AC-02: limit defaults to 30 and invalid paging is rejected", async () => {
    const h = createHarness();
    for (let i = 0; i < 35; i += 1) h.store.addSession({ sessionId: `s${i}`, lastModified: i });
    expect((await h.office.listClaudeSessions({})).sessions).toHaveLength(30);
    for (const query of [{ limit: "0" }, { limit: "101" }, { limit: "abc" }, { offset: "-1" }, { q: ["a"] }]) {
      await expect(h.office.listClaudeSessions(query)).rejects.toMatchObject({ code: "validation_error" });
    }
  });

  it("US-05 / AC-03: import creates one idle Claude employee per session with name, species, folder, title and history", async () => {
    const h = setup();
    const before = h.emitted.length;
    const { imported, skipped } = await h.office.importClaudeSessions(["s1"]);
    expect(skipped).toEqual([]);
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      bossId: "claude",
      status: "idle",
      task: "Login fix",
      workingDirectory: h.dir,
      providerSessionId: "s1",
      name: "Milo",
      species: "wolf",
      failureReason: null,
    });
    expect(imported[0]!.importedAt).toEqual(expect.any(String));
    const messages = h.office.listMessages(imported[0]!.id);
    expect(messages.map((m) => [m.kind, m.content, m.toolUseId, m.parentToolUseId, m.sourceUuid])).toEqual([
      ["user_text", "Fix the login bug", null, null, "u1"],
      ["agent_text", "Looking", null, null, "a1"],
      ["tool_call", JSON.stringify({ file_path: "/a.ts" }), "tu-1", null, "a1"],
      ["tool_result", "body", "tu-1", null, "u2"],
      ["agent_text", "from subagent", null, "tu-1", "a2"],
    ]);
    expect(messages[2]).toMatchObject({ toolName: "Read" });
    expect(h.emitted.slice(before).map((e) => e.type)).toEqual(["agent_updated", "employee_updated"]);
    expect(h.sdk.sessions).toHaveLength(0);
  });

  it("US-05 / AC-03: imported sessions share the provider's General agent identity", async () => {
    const h = createHarness(undefined, { random: () => 0 });
    h.store.addSession({ sessionId: "a" });
    h.store.addSession({ sessionId: "b" });
    const { imported } = await h.office.importClaudeSessions(["a", "b"]);
    expect(imported.map((e) => e.name)).toEqual(["Milo", "Milo"]);
    expect(imported[0]!.agentId).toBe(imported[1]!.agentId);
  });

  it("US-05 / AC-04: reports already_imported, not_found, missing_cwd and read_failed while the others import", async () => {
    const h = setup();
    h.store.addSession({ sessionId: "nocwd", cwd: undefined as never });
    h.store.addSession({ sessionId: "bad" });
    h.store.failing.add("bad");
    h.store.addSession({ sessionId: "ok" });
    await h.office.importClaudeSessions(["s1"]);
    const { imported, skipped } = await h.office.importClaudeSessions(["s1", "ghost", "nocwd", "bad", "ok", "ok"]);
    expect(skipped).toEqual([
      { sessionId: "s1", reason: "already_imported" },
      { sessionId: "ghost", reason: "not_found" },
      { sessionId: "nocwd", reason: "missing_cwd" },
      { sessionId: "bad", reason: "read_failed" },
      { sessionId: "ok", reason: "already_imported" },
    ]);
    expect(imported.map((e) => e.providerSessionId)).toEqual(["ok"]);
    expect(h.repository.listEmployees()).toHaveLength(2);
  });

  it("US-05 / AC-04: listing failure reports read_failed; bad input is a validation error", async () => {
    const h = createHarness();
    h.store.listError = new Error("boom");
    expect((await h.office.importClaudeSessions(["x"])).skipped).toEqual([{ sessionId: "x", reason: "read_failed" }]);
    for (const bad of [undefined, [], "s1", [1], [""], Array.from({ length: 101 }, (_, i) => `s${i}`)]) {
      await expect(h.office.importClaudeSessions(bad)).rejects.toMatchObject({ code: "validation_error", field: "sessionIds" });
    }
  });

  it("US-05 / AC-05: a session whose folder no longer exists imports as failed with a readable history", async () => {
    const h = createHarness();
    h.store.addSession({ sessionId: "gone", cwd: "/no/such/folder" }, HISTORY);
    const { imported, skipped } = await h.office.importClaudeSessions(["gone"]);
    expect(skipped).toEqual([]);
    expect(imported[0]).toMatchObject({
      status: "failed",
      failureReason: "Project folder not found: /no/such/folder",
      workingDirectory: "/no/such/folder",
    });
    expect(h.office.listMessages(imported[0]!.id)).toHaveLength(5);
  });

  it("US-05 / AC-05: sending to an employee whose folder is missing is 409 working_directory_missing and changes nothing", async () => {
    const h = createHarness();
    h.store.addSession({ sessionId: "gone", cwd: "/no/such/folder" }, HISTORY);
    const id = (await h.office.importClaudeSessions(["gone"])).imported[0]!.id;
    await expect(h.office.sendMessage(id, "hello")).rejects.toMatchObject({ code: "working_directory_missing" });
    expect(h.office.listMessages(id)).toHaveLength(5);
    expect(h.sdk.sessions).toHaveLength(0);
    expect(h.store.calls.filter((c) => c.startsWith("getSessionMessages"))).toEqual(["getSessionMessages:gone"]);
    expect(statusOf(h, id)).toBe("failed");
  });

  it("US-05 / AC-06: messaging an imported employee resumes the stored session", async () => {
    const h = setup();
    const id = (await h.office.importClaudeSessions(["s1"])).imported[0]!.id;
    await h.office.sendMessage(id, "Continue");
    await waitFor(() => h.sdk.sessions.length === 1);
    expect(h.sdk.last.options.resume).toBe("s1");
    expect(h.sdk.last.options.cwd).toBe(h.dir);
    await waitFor(() => h.sdk.last.prompts.includes("Continue"));
    expect(statusOf(h, id)).toBe("working");
  });

  it("US-05 / AC-07: import and resume only call the read APIs of the session store", async () => {
    const h = setup();
    const id = (await h.office.importClaudeSessions(["s1"])).imported[0]!.id;
    await h.office.sendMessage(id, "Continue");
    expect(h.store.calls.length).toBeGreaterThan(0);
    expect(h.store.calls.every((c) => c === "listSessions" || c.startsWith("getSessionMessages:"))).toBe(true);
  });

  it("US-05 / AC-03: live messages keep the SDK uuid as sourceUuid", async () => {
    const h = createHarness();
    const e = await hireWorking(h);
    h.sdk.last.emit({ type: "assistant", uuid: "live-1", message: { content: [{ type: "text", text: "hi" }] }, parent_tool_use_id: null });
    await waitFor(() => h.repository.listMessages(e.id).length === 2);
    expect(h.repository.listMessages(e.id).map((m) => m.sourceUuid)).toEqual([null, "live-1"]);
  });
});

describe("US-06 catch up on terminal turns before resuming", () => {
  const TERMINAL = [userTurn("u3", "From the terminal"), assistantTurn("a3", [{ type: "text", text: "Terminal answer" }])];

  it("US-06 / AC-01: missing turns are appended in order, without duplicates, before the new owner message", async () => {
    const h = setup();
    const id = (await h.office.importClaudeSessions(["s1"])).imported[0]!.id;
    h.store.history.set("s1", [...HISTORY, ...TERMINAL]);
    const before = h.emitted.length;
    await h.office.sendMessage(id, "Continue");
    const tail = h.office.listMessages(id).slice(5);
    expect(tail.map((m) => [m.kind, m.content, m.sourceUuid])).toEqual([
      ["user_text", "From the terminal", "u3"],
      ["agent_text", "Terminal answer", "a3"],
      ["user_text", "Continue", null],
    ]);
    expect(h.emitted.slice(before).filter((e) => e.type === "message_added")).toHaveLength(3);
    expect(h.office.listMessages(id)).toHaveLength(8);
  });

  it("US-06 / AC-01: a second resume does not duplicate turns, including the echo of the owner's own message", async () => {
    const h = setup();
    const id = (await h.office.importClaudeSessions(["s1"])).imported[0]!.id;
    await h.office.sendMessage(id, "Continue");
    await waitFor(() => h.sdk.sessions.length === 1);
    h.sdk.last.fail(new Error("gone"));
    await waitFor(() => statusOf(h, id) === "failed");
    h.store.history.set("s1", [...HISTORY, userTurn("u9", "Continue"), assistantTurn("a9", [{ type: "text", text: "Done" }])]);
    await h.office.sendMessage(id, "Again");
    const contents = h.office.listMessages(id).map((m) => m.content);
    expect(contents.filter((c) => c === "Continue")).toHaveLength(1);
    expect(contents.slice(-2)).toEqual(["Done", "Again"]);
    expect(h.repository.listMessages(id).find((m) => m.content === "Continue")!.sourceUuid).toBe("u9");
  });

  it("US-06 / AC-02: with no new turns only the owner message is added", async () => {
    const h = setup();
    const id = (await h.office.importClaudeSessions(["s1"])).imported[0]!.id;
    await h.office.sendMessage(id, "Continue");
    expect(h.office.listMessages(id).slice(5).map((m) => m.content)).toEqual(["Continue"]);
    expect(h.store.calls.filter((c) => c === "getSessionMessages:s1")).toHaveLength(2);
  });

  it("US-06 / AC-03: when reading fails, a system note is added and the resume continues", async () => {
    const h = setup();
    const id = (await h.office.importClaudeSessions(["s1"])).imported[0]!.id;
    h.store.failing.add("s1");
    await h.office.sendMessage(id, "Continue");
    expect(h.office.listMessages(id).slice(5).map((m) => [m.kind, m.content])).toEqual([
      ["system", "Earlier turns could not be loaded"],
      ["user_text", "Continue"],
    ]);
    await waitFor(() => h.sdk.sessions.length === 1);
    expect(h.sdk.last.options.resume).toBe("s1");
  });

  it("US-06 / AC-01: catch-up also applies to employees the office started (live messages carry uuids)", async () => {
    const h = createHarness();
    const e = await hireWorking(h);
    h.sdk.last.emit({ type: "assistant", uuid: "live-1", message: { content: [{ type: "text", text: "hi" }] }, parent_tool_use_id: null });
    await waitFor(() => h.repository.listMessages(e.id).length === 2);
    await h.office.stop(e.id);
    h.store.history.set("sess-1", [assistantTurn("live-1", [{ type: "text", text: "hi" }]), ...TERMINAL]);
    await h.office.sendMessage(e.id, "Back");
    expect(h.office.listMessages(e.id).map((m) => m.content).slice(2)).toEqual(["From the terminal", "Terminal answer", "Back"]);
  });

  it("US-06 / AC-02: a live session receives messages without any history read", async () => {
    const h = createHarness();
    const e = await hireWorking(h);
    h.sdk.last.result("success");
    await waitFor(() => statusOf(h, e.id) === "idle");
    await h.office.sendMessage(e.id, "More");
    expect(h.store.calls).toEqual([]);
  });
});

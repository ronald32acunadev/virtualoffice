import { describe, expect, it } from "vitest";
import type { ApprovalRequest, Employee, MediaPreset, Message, StateSnapshot } from "../api/types";
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
  role: null,
  jobTitle: null,
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

  it("US-04 / AC-02: tracks active terminals from the snapshot and events", () => {
    let state = apply(initialOfficeState, {
      type: "state_loaded",
      snapshot: { bosses: [], employees: [employee()], approvals: [], activeTerminals: ["e1"] },
    });
    expect(state.activeTerminals).toEqual(["e1"]);

    state = apply(state, {
      type: "server_event",
      event: { type: "terminal_updated", employeeId: "e2", active: true },
    });
    expect(state.activeTerminals).toEqual(["e1", "e2"]);

    state = apply(state, {
      type: "server_event",
      event: { type: "terminal_updated", employeeId: "e2", active: true },
    });
    expect(state.activeTerminals).toEqual(["e1", "e2"]);
  });

  it("US-04 / AC-03: removes a terminal when it ends", () => {
    let state = apply(initialOfficeState, {
      type: "state_loaded",
      snapshot: { bosses: [], employees: [employee()], approvals: [], activeTerminals: ["e1", "e2"] },
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "terminal_updated", employeeId: "e1", active: false },
    });
    expect(state.activeTerminals).toEqual(["e2"]);

    state = apply(state, {
      type: "state_loaded",
      snapshot: { bosses: [], employees: [employee()], approvals: [] },
    });
    expect(state.activeTerminals).toEqual([]);
  });

  it("US-04 / AC-03: receives employee_removed and cleans up state properly", () => {
    let state = apply(initialOfficeState, {
      type: "state_loaded",
      snapshot: {
        bosses: [],
        employees: [employee({ id: "e1", name: "Ada" }), employee({ id: "e2", name: "Bob" })],
        approvals: [approval({ employeeId: "e1" }), approval({ employeeId: "e2", id: "a2" })],
      },
    });
    state = apply(state, {
      type: "messages_loaded",
      employeeId: "e1",
      messages: [message({ employeeId: "e1" })],
    });
    state = apply(state, {
      type: "server_event",
      event: { type: "message_delta", employeeId: "e1", text: "live" },
    });
    state = apply(state, { type: "select", employeeId: "e1" });

    // Remove e1
    state = apply(state, {
      type: "server_event",
      event: { type: "employee_removed", employeeId: "e1" },
    });

    expect(state.employees.map((e) => e.id)).toEqual(["e2"]);
    expect(state.approvals.map((a) => a.id)).toEqual(["a2"]);
    expect(state.messages["e1"]).toBeUndefined();
    expect(state.liveText["e1"]).toBeUndefined();
    expect(state.selectedId).toBeNull();

    // Now select e2 and remove a different employee, selectedId should remain e2
    state = apply(state, { type: "select", employeeId: "e2" });
    state = apply(state, {
      type: "server_event",
      event: { type: "employee_removed", employeeId: "e99" },
    });
    expect(state.selectedId).toBe("e2");
  });
});

describe("US-02 / AC-06 media state", () => {
  it("hydrates media and mediaPresets via state_loaded and applies media_updated", () => {
    const snapshot: StateSnapshot = {
      bosses: [],
      employees: [employee({ id: "e1" })],
      approvals: [approval({ id: "a1" })],
      media: {
        provider: "spotify",
        mediaKind: "audio",
        sourceUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
        embedUrl: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator",
        title: "Test Track",
        thumbnailUrl: "https://example.com/thumb.jpg",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      mediaPresets: [],
    };

    const hydrated = apply(initialOfficeState, {
      type: "state_loaded",
      snapshot,
    });
    expect(hydrated.media).toEqual(snapshot.media);
    expect(hydrated.mediaPresets).toEqual([]);

    const state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "media_updated", media: snapshot.media! },
    });

    expect(state.media).toEqual(snapshot.media);
  });

  it("applies media_updated with null to clear the playback state", () => {
    const state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "media_updated", media: null },
    });

    expect(state.media).toBeNull();
  });

  it("applies media_presets_updated to replace the preset list", () => {
    const presets: MediaPreset[] = [
      {
        id: "p1",
        provider: "youtube_music",
        mediaKind: "video",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        title: "Preset Video",
        thumbnailUrl: null,
        createdAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "p2",
        provider: "apple_music",
        mediaKind: "audio",
        sourceUrl: "https://music.apple.com/us/album/abbey-road/1441164426",
        embedUrl: "https://embed.music.apple.com/us/album/abbey-road/1441164426",
        title: "Preset Audio",
        thumbnailUrl: "https://example.com/p2-thumb.jpg",
        createdAt: "2025-01-02T00:00:00Z",
      },
    ];

    const state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "media_presets_updated", presets },
    });

    expect(state.mediaPresets).toEqual(presets);
  });

  it("applies media_presets_updated with an empty array to clear presets", () => {
    const state = apply(initialOfficeState, {
      type: "server_event",
      event: { type: "media_presets_updated", presets: [] },
    });

    expect(state.mediaPresets).toEqual([]);
  });
});

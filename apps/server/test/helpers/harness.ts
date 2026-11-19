import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClaudeSessionCatalog } from "../../src/agents/claude/claude-session-catalog.ts";
import { ClaudeAgentAdapter } from "../../src/agents/claude/claude-agent-adapter.ts";
import { InMemoryEventBus } from "../../src/events/in-memory-event-bus.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import type { Employee, ServerEvent } from "../../src/office/domain/types.ts";
import type { OfficeRepository } from "../../src/office/ports/office-repository.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { FakeSdk, FakeSessionStore, waitFor } from "./fake-sdk.ts";

export function createHarness(
  repository: OfficeRepository = new SqliteOfficeRepository(":memory:"),
  options: { random?: () => number } = {},
) {
  const sdk = new FakeSdk();
  const store = new FakeSessionStore();
  const catalog = new ClaudeSessionCatalog(store.list, store.messages);
  const adapter = new ClaudeAgentAdapter(sdk.query);
  const events = new InMemoryEventBus();
  const office = new OfficeService({
    repository,
    adapter,
    events,
    sessions: catalog,
    ...(options.random ? { random: options.random } : {}),
  });
  const emitted: ServerEvent[] = [];
  events.subscribe((event) => emitted.push(event));
  return { sdk, store, adapter, events, repository, office, emitted, dir: os.tmpdir() };
}

export type Harness = ReturnType<typeof createHarness>;

/** Hires an employee and drives the fake session through init so it is `working`. */
export async function hireWorking(h: Harness, task = "Fix the bug"): Promise<Employee> {
  const employee = h.office.hire({ bossId: "claude", task, workingDirectory: h.dir });
  await waitFor(() => h.sdk.sessions.length > 0);
  h.sdk.last.init();
  await waitFor(() => h.repository.getEmployee(employee.id)?.status === "working");
  return employee;
}

export function statusOf(h: Harness, id: string) {
  return h.repository.getEmployee(id)?.status;
}

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vo-test-"));
}

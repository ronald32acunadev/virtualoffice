import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeAgentAdapter } from "../../src/agents/claude/claude-agent-adapter.ts";
import { CodexAgentAdapter } from "../../src/agents/codex/codex-agent-adapter.ts";
import { OpenCodeAgentAdapter } from "../../src/agents/opencode/opencode-agent-adapter.ts";
import { AntigravityAgentAdapter } from "../../src/agents/antigravity/antigravity-agent-adapter.ts";
import { GeminiAgentAdapter } from "../../src/agents/gemini/gemini-agent-adapter.ts";
import type { Employee, StoredAttachment } from "../../src/office/domain/types.ts";
import type { AgentSink } from "../../src/office/ports/agent-adapter.ts";
import type { SpawnFunction } from "../../src/agents/cli-jsonl-adapter.ts";

describe("Agent Adapter Attachments (US-03 / AC-04)", () => {
  let tmpDir: string;
  let imagePath: string;
  let pdfPath: string;
  let employee: Employee;
  let sink: AgentSink;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vo-adapter-att-"));
    imagePath = path.join(tmpDir, "test.png");
    pdfPath = path.join(tmpDir, "doc.pdf");

    fs.writeFileSync(imagePath, Buffer.from("fake-png-data"));
    fs.writeFileSync(pdfPath, Buffer.from("fake-pdf-data"));

    employee = {
      id: "emp-1",
      bossId: "claude",
      hiredBy: null,
      task: "test task",
      name: "Test Employee",
      species: "human",
      importedAt: null,
      role: "developer",
      jobTitle: "Developer",
      providerSessionId: null,
      workingDirectory: tmpDir,
      status: "idle",
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sink = {
      onSessionStarted: () => {},
      onMessage: () => {},
      onDelta: () => {},
      onTurnFinished: () => {},
      onFailed: () => {},
      onCatalog: () => {},
      requestApproval: async () => ({ decision: "approve" }),
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("ClaudeAgentAdapter handles image and non-image attachments in start and sendMessage", async () => {
    let capturedPrompt: any = null;
    const fakeQuery = (params: any) => {
      capturedPrompt = params.prompt;
      async function* generator() {
        yield { type: "system", subtype: "init", session_id: "claude-session-1" };
        yield { type: "result", subtype: "success" };
      }
      return Object.assign(generator(), {
        interrupt: async () => {},
        close: () => {},
      });
    };

    const adapter = new ClaudeAgentAdapter(fakeQuery as any);
    const attachments: StoredAttachment[] = [
      { id: "att-1", name: "test.png", mimeType: "image/png", size: 13, url: "/api/att-1", path: imagePath },
      { id: "att-2", name: "doc.pdf", mimeType: "application/pdf", size: 13, url: "/api/att-2", path: pdfPath },
    ];

    adapter.start({ employee, prompt: "Inspect these", attachments }, sink);

    const iterator = capturedPrompt[Symbol.asyncIterator]();
    const firstMsg = await iterator.next();
    expect(firstMsg.value.message.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image",
          source: expect.objectContaining({ type: "base64", media_type: "image/png" }),
        }),
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("doc.pdf"),
        }),
      ]),
    );

    // Test sendMessage with attachments
    adapter.sendMessage("emp-1", "Followup", [attachments[0]!]);
    const secondMsg = await iterator.next();
    expect(secondMsg.value.message.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image" }),
        expect.objectContaining({ type: "text", text: "Followup" }),
      ]),
    );

    // Text-only backward compatibility
    adapter.start({ employee, prompt: "Plain text" }, sink);
    const plainIterator = capturedPrompt[Symbol.asyncIterator]();
    const plainMsg = await plainIterator.next();
    expect(plainMsg.value.message.content).toBe("Plain text");

    await adapter.stop("emp-1");
  });

  it("CodexAgentAdapter passes -i for images and non-image paths in prompt", async () => {
    let spawnedArgs: readonly string[] = [];
    const fakeSpawn: SpawnFunction = (_cmd, args) => {
      spawnedArgs = args;
      const cp: any = {
        stdout: { on: () => {} },
        stderr: { on: (event: string, cb: any) => { if (event === "data") cb(Buffer.from("")); } },
        on: (event: string, cb: any) => { if (event === "close") cb(0); },
        kill: () => {},
      };
      return cp;
    };

    const adapter = new CodexAgentAdapter(fakeSpawn);
    const attachments: StoredAttachment[] = [
      { id: "att-1", name: "test.png", mimeType: "image/png", size: 13, url: "/api/att-1", path: imagePath },
      { id: "att-2", name: "doc.pdf", mimeType: "application/pdf", size: 13, url: "/api/att-2", path: pdfPath },
    ];

    adapter.start({ employee, prompt: "Do work", attachments }, sink);
    expect(spawnedArgs).toContain("-i");
    expect(spawnedArgs).toContain(imagePath);
    expect(spawnedArgs.some((arg) => arg.includes("doc.pdf"))).toBe(true);

    // Resume test
    adapter.start({ employee, prompt: "Resume work", resume: "codex-thread-1", attachments }, sink);
    expect(spawnedArgs).toContain("resume");
    expect(spawnedArgs).toContain("codex-thread-1");
    expect(spawnedArgs).toContain(imagePath);
  });

  it("OpenCodeAgentAdapter passes --file for all attachments", async () => {
    let spawnedArgs: readonly string[] = [];
    const fakeSpawn: SpawnFunction = (_cmd, args) => {
      spawnedArgs = args;
      const cp: any = {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: any) => { if (event === "close") cb(0); },
        kill: () => {},
      };
      return cp;
    };

    const adapter = new OpenCodeAgentAdapter(fakeSpawn);
    const attachments: StoredAttachment[] = [
      { id: "att-1", name: "test.png", mimeType: "image/png", size: 13, url: "/api/att-1", path: imagePath },
      { id: "att-2", name: "doc.pdf", mimeType: "application/pdf", size: 13, url: "/api/att-2", path: pdfPath },
    ];

    adapter.start({ employee, prompt: "OpenCode start", attachments }, sink);
    expect(spawnedArgs).toContain("--file");
    expect(spawnedArgs).toContain(imagePath);
    expect(spawnedArgs).toContain(pdfPath);

    adapter.start({ employee, prompt: "OpenCode resume", resume: "sess-1", attachments }, sink);
    expect(spawnedArgs).toContain("--session");
    expect(spawnedArgs).toContain("sess-1");
    expect(spawnedArgs).toContain(imagePath);
  });

  it("AntigravityAgentAdapter passes --add-dir and includes file notes in prompt", async () => {
    let spawnedArgs: readonly string[] = [];
    const fakeSpawn: SpawnFunction = (_cmd, args) => {
      spawnedArgs = args;
      const cp: any = {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: any) => { if (event === "close") cb(0); },
        kill: () => {},
      };
      return cp;
    };

    const adapter = new AntigravityAgentAdapter({ spawnFn: fakeSpawn });
    const attachments: StoredAttachment[] = [
      { id: "att-1", name: "test.png", mimeType: "image/png", size: 13, url: "/api/att-1", path: imagePath },
    ];

    adapter.start({ employee, prompt: "AGY start", attachments }, sink);
    expect(spawnedArgs).toContain("--add-dir");
    expect(spawnedArgs).toContain(tmpDir);
    expect(spawnedArgs.some((arg) => arg.includes("test.png"))).toBe(true);

    adapter.start({ employee, prompt: "AGY resume", resume: "conv-1", attachments }, sink);
    expect(spawnedArgs).toContain("--conversation");
    expect(spawnedArgs).toContain("conv-1");
    expect(spawnedArgs).toContain("--add-dir");
  });

  it("GeminiAgentAdapter appends attachment notes to prompt", async () => {
    let spawnedArgs: readonly string[] = [];
    const fakeSpawn: SpawnFunction = (_cmd, args) => {
      spawnedArgs = args;
      const cp: any = {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: any) => { if (event === "close") cb(0); },
        kill: () => {},
      };
      return cp;
    };

    const adapter = new GeminiAgentAdapter(fakeSpawn);
    const attachments: StoredAttachment[] = [
      { id: "att-1", name: "doc.pdf", mimeType: "application/pdf", size: 13, url: "/api/att-1", path: pdfPath },
    ];

    adapter.start({ employee, prompt: "Gemini prompt", attachments }, sink);
    expect(spawnedArgs.some((arg) => arg.includes("doc.pdf"))).toBe(true);

    adapter.start({ employee, prompt: "Gemini resume", resume: "gem-1", attachments }, sink);
    expect(spawnedArgs).toContain("--resume");
    expect(spawnedArgs).toContain("gem-1");
  });
});

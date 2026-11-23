import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  isSafeInlineImageMime,
  sanitizeAttachmentName,
  validateAndDecodeAttachments,
  AttachmentStore,
} from "../../src/office/application/attachments.ts";
import { OfficeService } from "../../src/office/application/office-service.ts";
import { SqliteOfficeRepository } from "../../src/persistence/sqlite/sqlite-office-repository.ts";
import { buildApp } from "../../src/http/app.ts";
import { createHarness, hireWorking } from "../helpers/harness.ts";

describe("US-03 Chat Attachments", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vo-att-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Validation & Helpers", () => {
    it("validates safe inline image mimes case-insensitively and handles unsafe types", () => {
      expect(isSafeInlineImageMime("image/png")).toBe(true);
      expect(isSafeInlineImageMime("IMAGE/JPEG")).toBe(true);
      expect(isSafeInlineImageMime("image/gif")).toBe(true);
      expect(isSafeInlineImageMime("image/webp")).toBe(true);
      expect(isSafeInlineImageMime("image/svg+xml")).toBe(false);
      expect(isSafeInlineImageMime("text/html")).toBe(false);
      expect(isSafeInlineImageMime("application/pdf")).toBe(false);
    });

    it("sanitizes attachment names safely", () => {
      expect(sanitizeAttachmentName("foo/bar\\baz..txt")).toBe("foo_bar_baz_txt");
      expect(sanitizeAttachmentName("   ..invalid   ")).toBe("invalid");
      expect(sanitizeAttachmentName("\u0000test\u001f.png")).toBe("test.png");
      expect(sanitizeAttachmentName("")).toBe("attachment");
      expect(sanitizeAttachmentName("   ")).toBe("attachment");
    });

    it("decodes valid attachments and enforces limits", () => {
      const validBase64 = Buffer.from("hello world").toString("base64");
      const decoded = validateAndDecodeAttachments([
        {
          name: "test.txt",
          mimeType: "text/plain",
          dataBase64: validBase64,
        },
      ]);
      expect(decoded).toHaveLength(1);
      expect(decoded[0]!.name).toBe("test.txt");
      expect(decoded[0]!.mimeType).toBe("text/plain");
      expect(decoded[0]!.size).toBe(11);
      expect(decoded[0]!.data.toString()).toBe("hello world");
    });

    it("throws validation error when attachment count exceeds maximum", () => {
      const items = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) => ({
        name: `file${i}.txt`,
        dataBase64: Buffer.from("data").toString("base64"),
      }));
      expect(() => validateAndDecodeAttachments(items)).toThrow(/At most 5 attachments/);
    });

    it("throws validation error when attachment size exceeds maximum", () => {
      const largeBuffer = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, "a");
      const largeBase64 = largeBuffer.toString("base64");
      expect(() =>
        validateAndDecodeAttachments([
          {
            name: "large.bin",
            dataBase64: largeBase64,
          },
        ])
      ).toThrow();
    });

    it("rejects invalid base64 and prevents partial files from being written", () => {
      const store = new AttachmentStore(tmpDir);
      const invalidPayload = [
        {
          name: "valid.txt",
          mimeType: "text/plain",
          dataBase64: Buffer.from("valid").toString("base64"),
        },
        {
          name: "invalid.txt",
          mimeType: "text/plain",
          dataBase64: "not-valid-base64!",
        },
      ];

      expect(() => validateAndDecodeAttachments(invalidPayload)).toThrow(/Invalid base64 encoding/);

      const decoded = validateAndDecodeAttachments([invalidPayload[0]!]);
      const spyWrite = store.saveAll("emp-partial", decoded, () => "att-1");
      expect(spyWrite).toHaveLength(1);
    });
  });

  describe("AttachmentStore & SQLite Persistence", () => {
    it("saves attachments securely and resolves paths correctly", () => {
      const store = new AttachmentStore(tmpDir);
      const data = Buffer.from("secret content");
      const decoded = [
        {
          name: "doc.txt",
          sanitizedName: "doc.txt",
          mimeType: "text/plain",
          size: data.byteLength,
          data,
        },
      ];

      const stored = store.saveAll("emp-1", decoded, () => "att-123");
      expect(stored).toHaveLength(1);
      expect(stored[0]!.id).toBe("att-123");
      expect(stored[0]!.url).toBe("/api/attachments/att-123");

      const resolvedPath = store.resolvePath("emp-1", "att-123", "doc.txt");
      expect(resolvedPath).not.toBeNull();
      expect(fs.readFileSync(resolvedPath!, "utf-8")).toBe("secret content");

      // Path traversal attempts should be rejected
      expect(store.resolvePath("emp-1", "../outside", "doc.txt")).toBeNull();
      expect(store.resolvePath("emp-1", "att-123", "../traversal")).toBeNull();
    });

    it("US-03 / AC-01: migrates an older DB without attachments column successfully", () => {
      const dbPath = path.join(tmpDir, "legacy.db");
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE employees (
          id TEXT PRIMARY KEY,
          boss_id TEXT NOT NULL,
          hired_by TEXT,
          task TEXT NOT NULL,
          working_directory TEXT NOT NULL,
          provider_session_id TEXT,
          status TEXT NOT NULL,
          failure_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          seq INTEGER
        );
        CREATE TABLE messages (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          employee_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_name TEXT,
          tool_use_id TEXT,
          parent_tool_use_id TEXT,
          created_at TEXT NOT NULL,
          source_uuid TEXT
        );
        INSERT INTO employees VALUES ('e1','claude',NULL,'Old task','/tmp',NULL,'idle',NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',1);
        INSERT INTO messages (id, employee_id, kind, content, created_at) VALUES ('m1','e1','user_text','Old task','2026-01-01T00:00:00Z');
      `);
      db.close();

      const dbMigrated = new DatabaseSync(dbPath);
      const repo = new SqliteOfficeRepository(dbMigrated);
      expect(repo).toBeDefined();

      const messages = repo.listMessages("e1");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.attachments).toBeUndefined();
      dbMigrated.close();
    });

    it("persists messages with attachments in SQLite and retrieves via findAttachment", () => {
      const h = createHarness();
      const repo = h.repository as SqliteOfficeRepository;

      const message = {
        id: "msg-1",
        employeeId: "emp-1",
        kind: "user_text" as const,
        content: "Check this out",
        createdAt: new Date().toISOString(),
        toolName: null,
        toolUseId: null,
        parentToolUseId: null,
        sourceUuid: null,
        attachments: [
          {
            id: "att-1",
            name: "image.png",
            mimeType: "image/png",
            size: 100,
            url: "/api/attachments/att-1",
          },
        ],
      };

      repo.insertMessage(message);

      const found = repo.findAttachment("att-1");
      expect(found).not.toBeNull();
      expect(found?.employeeId).toBe("emp-1");
      expect(found?.attachment.name).toBe("image.png");
    });
  });

  describe("OfficeService & Fastify Endpoints", () => {
    it("US-03 / AC-02 & AC-03: handles attachment-only send, security headers, auth, and 404s", async () => {
      const h = createHarness();
      const employee = await hireWorking(h, "Test task");

      const token = "secret-token-123";
      const attachmentsDir = path.join(tmpDir, "attachments");
      (h.office as unknown as { attachmentStore: AttachmentStore }).attachmentStore = new AttachmentStore(attachmentsDir);

      const app = await buildApp({
        token,
        port: 4317,
        repository: h.repository,
        office: h.office,
      });
      await app.ready();

      const validBase64 = Buffer.from("attachment only binary").toString("base64");

      // AC-02: Attachment-only send (empty text)
      const res = await app.inject({
        method: "POST",
        url: `/api/employees/${employee.id}/messages`,
        headers: {
          authorization: `Bearer ${token}`,
          host: "127.0.0.1:4317",
        },
        payload: {
          text: "",
          attachments: [
            {
              name: "file.bin",
              mimeType: "application/octet-stream",
              dataBase64: validBase64,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(202);
      const json = res.json();
      expect(json.message.attachments).toHaveLength(1);
      const attId = json.message.attachments[0].id;

      // AC-03: X-Content-Type-Options: nosniff header on attachment download
      const dlRes = await app.inject({
        method: "GET",
        url: `/api/attachments/${attId}`,
        headers: {
          authorization: `Bearer ${token}`,
          host: "127.0.0.1:4317",
        },
      });
      expect(dlRes.statusCode).toBe(200);
      expect(dlRes.headers["x-content-type-options"]).toBe("nosniff");
      expect(dlRes.body).toBe("attachment only binary");

      // AC-03: Missing or bad token -> 401
      const unauthRes = await app.inject({
        method: "GET",
        url: `/api/attachments/${attId}`,
        headers: {
          host: "127.0.0.1:4317",
        },
      });
      expect(unauthRes.statusCode).toBe(401);

      // AC-03: Unknown ID or path traversal -> 404
      const notFoundRes = await app.inject({
        method: "GET",
        url: `/api/attachments/nonexistent-id`,
        headers: {
          authorization: `Bearer ${token}`,
          host: "127.0.0.1:4317",
        },
      });
      expect(notFoundRes.statusCode).toBe(404);

      await app.close();
    });
  });
});

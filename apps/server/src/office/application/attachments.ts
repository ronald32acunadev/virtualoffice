import fs from "node:fs";
import path from "node:path";
import { OfficeError, type StoredAttachment } from "../domain/types.ts";

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const SAFE_INLINE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isSafeInlineImageMime(mimeType: string): boolean {
  return SAFE_INLINE_IMAGE_MIMES.has(mimeType.toLowerCase().trim());
}

export function sanitizeAttachmentName(raw: string): string {
  if (typeof raw !== "string") return "attachment";
  const trimmedInput = raw.trim();
  const replaced = trimmedInput
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\/\\]/g, "_")
    .replace(/\.\./g, "_");
  const trimmed = replaced.replace(/^[\.\/_]+/, "").trim();
  const capped = trimmed.slice(0, 120);
  return capped === "" ? "attachment" : capped;
}

export type DecodedAttachment = {
  name: string;
  sanitizedName: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

export function validateAndDecodeAttachments(raw: unknown): DecodedAttachment[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new OfficeError("validation_error", "attachments must be an array", "attachments");
  }
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new OfficeError("validation_error", `At most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message`, "attachments");
  }

  const results: DecodedAttachment[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new OfficeError("validation_error", "Attachment must be an object", "attachments");
    }
    const record = item as Record<string, unknown>;
    const name = record.name;
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      name === "." ||
      name === ".." ||
      name.includes("\0")
    ) {
      throw new OfficeError("validation_error", "Attachment name is invalid", "attachments");
    }

    let mimeType = "application/octet-stream";
    if (record.mimeType !== undefined && record.mimeType !== null) {
      if (typeof record.mimeType !== "string") {
        throw new OfficeError("validation_error", "Attachment mimeType must be a string", "attachments");
      }
      const trimmedMime = record.mimeType.trim();
      if (trimmedMime !== "") {
        mimeType = trimmedMime;
      }
    }

    const base64 = record.dataBase64;
    if (typeof base64 !== "string" || base64.trim() === "") {
      throw new OfficeError("validation_error", "Attachment dataBase64 is required", "attachments");
    }

    const clean = base64.replace(/[\r\n\s]/g, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) {
      throw new OfficeError("validation_error", "Invalid base64 encoding", "attachments");
    }

    let data: Buffer;
    try {
      data = Buffer.from(clean, "base64");
    } catch {
      throw new OfficeError("validation_error", "Failed to decode base64 attachment data", "attachments");
    }

    if (data.byteLength === 0 || data.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new OfficeError("validation_error", `Attachment size exceeds limit of ${MAX_ATTACHMENT_BYTES} bytes`, "attachments");
    }

    const trimmedName = name.trim();
    results.push({
      name: trimmedName,
      sanitizedName: sanitizeAttachmentName(trimmedName),
      mimeType,
      size: data.byteLength,
      data,
    });
  }

  return results;
}

export class AttachmentStore {
  constructor(private readonly rootDir: string) {}

  saveAll(employeeId: string, items: DecodedAttachment[], newId: () => string): StoredAttachment[] {
    if (items.length === 0) return [];
    const safeEmployeeDir = employeeId.replace(/[^A-Za-z0-9_-]/g, "_");
    const resolvedRoot = path.resolve(this.rootDir);
    const dir = path.resolve(resolvedRoot, safeEmployeeDir);
    if (!dir.startsWith(resolvedRoot)) {
      throw new OfficeError("validation_error", "Invalid attachment path", "attachments");
    }

    fs.mkdirSync(dir, { recursive: true });

    const writtenPaths: string[] = [];
    const stored: StoredAttachment[] = [];

    try {
      for (const item of items) {
        const id = newId();
        const fileName = `${id}-${item.sanitizedName}`;
        const filePath = path.join(dir, fileName);
        if (!filePath.startsWith(resolvedRoot)) {
          throw new OfficeError("validation_error", "Invalid attachment path", "attachments");
        }
        fs.writeFileSync(filePath, item.data);
        writtenPaths.push(filePath);
        stored.push({
          id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          url: `/api/attachments/${id}`,
          path: filePath,
        });
      }
      return stored;
    } catch (err) {
      for (const p of writtenPaths) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
      if (err instanceof OfficeError) throw err;
      throw new OfficeError("validation_error", "Failed to save attachments", "attachments");
    }
  }

  resolvePath(employeeId: string, id: string, originalName: string): string | null {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    const resolvedRoot = path.resolve(this.rootDir);
    const safeEmployeeDir = employeeId.replace(/[^A-Za-z0-9_-]/g, "_");
    const dir = path.resolve(resolvedRoot, safeEmployeeDir);
    const sanitized = sanitizeAttachmentName(originalName);
    const candidate = path.resolve(dir, `${id}-${sanitized}`);

    if (!candidate.startsWith(resolvedRoot + path.sep)) return null;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
    return null;
  }
}

import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  isPreviewableImageMime,
  isPlayableAudioMime,
  pickRecorderAudioMime,
  buildVoiceRecordingFilename,
  formatDurationSeconds,
  formatFileSize,
  validateFilesToStage,
  canSendComposer,
  bytesToBase64,
  encodeAttachmentFile,
  buildAuthenticatedAttachmentUrl,
  buildSendMessagePayload,
} from "./attachments";

describe("attachments utility", () => {
  it("isPreviewableImageMime correctly identifies image types", () => {
    expect(isPreviewableImageMime("image/png")).toBe(true);
    expect(isPreviewableImageMime("  IMAGE/JPEG ")).toBe(true);
    expect(isPreviewableImageMime("image/gif")).toBe(true);
    expect(isPreviewableImageMime("image/webp")).toBe(true);
    expect(isPreviewableImageMime("image/svg+xml")).toBe(false);
    expect(isPreviewableImageMime("text/plain")).toBe(false);
    expect(isPreviewableImageMime("application/pdf")).toBe(false);
  });

  it("formatFileSize formats bytes correctly", () => {
    expect(formatFileSize(-1)).toBe("0 B");
    expect(formatFileSize(NaN)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("validateFilesToStage validates size, counts, and empty files", () => {
    const validFile = { name: "test.png", type: "image/png", size: 1000 };
    const emptyFile = { name: "empty.txt", type: "text/plain", size: 0 };
    const hugeFile = { name: "huge.bin", type: "application/octet-stream", size: MAX_ATTACHMENT_BYTES + 1 };

    // 0-byte rejected
    const res1 = validateFilesToStage(0, [emptyFile]);
    expect(res1.accepted.length).toBe(0);
    expect(res1.error).toBe("Empty files cannot be attached.");

    // > 10MB rejected, valid not corrupted
    const res2 = validateFilesToStage(0, [hugeFile, validFile]);
    expect(res2.accepted).toEqual([validFile]);
    expect(res2.error).toBe("Each file must be 10 MB or smaller.");

    // capped at MAX_ATTACHMENTS (5)
    const files = Array.from({ length: 6 }, (_, i) => ({ name: `file${i}.png`, type: "image/png", size: 100 }));
    const res3 = validateFilesToStage(0, files);
    expect(res3.accepted.length).toBe(MAX_ATTACHMENTS);
    expect(res3.error).toBe("You can attach up to 5 files per message.");
  });

  it("canSendComposer checks inputs correctly", () => {
    expect(canSendComposer("hello", 0, false, false)).toBe(true);
    expect(canSendComposer("", 1, false, false)).toBe(true);
    expect(canSendComposer("", 0, false, false)).toBe(false);
    expect(canSendComposer("hello", 0, true, false)).toBe(false);
    expect(canSendComposer("hello", 0, false, true)).toBe(false);
  });

  it("bytesToBase64 and encodeAttachmentFile encode properly", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = bytesToBase64(bytes);
    expect(b64).toBe("SGVsbG8=");
  });

  it("buildAuthenticatedAttachmentUrl handles tokens correctly", () => {
    expect(buildAuthenticatedAttachmentUrl("/api/att/1", null)).toBe("/api/att/1");
    expect(buildAuthenticatedAttachmentUrl("/api/att/1", "secret")).toBe("/api/att/1?token=secret");
    expect(buildAuthenticatedAttachmentUrl("/api/att/1?foo=bar", "secret")).toBe("/api/att/1?foo=bar&token=secret");
  });

  it("buildSendMessagePayload omits attachments when empty", () => {
    expect(buildSendMessagePayload("hi", [])).toEqual({ text: "hi" });
    expect(buildSendMessagePayload("hi", undefined)).toEqual({ text: "hi" });
    expect(buildSendMessagePayload("hi", [{ name: "a", mimeType: "text/plain", dataBase64: "abc" }])).toEqual({
      text: "hi",
      attachments: [{ name: "a", mimeType: "text/plain", dataBase64: "abc" }],
    });
  });

  it("US-04 / AC-02, AC-04: detects playable audio MIME types and formats voice filenames and durations", () => {
    expect(isPlayableAudioMime("audio/webm")).toBe(true);
    expect(isPlayableAudioMime("audio/webm;codecs=opus")).toBe(true);
    expect(isPlayableAudioMime("AUDIO/MPEG")).toBe(true);
    expect(isPlayableAudioMime("audio/ogg;codecs=opus")).toBe(true);
    expect(isPlayableAudioMime("application/octet-stream")).toBe(false);

    expect(pickRecorderAudioMime((m) => m === "audio/ogg;codecs=opus")).toBe("audio/ogg;codecs=opus");
    expect(pickRecorderAudioMime(() => false)).toBe("audio/webm");

    const fixed = new Date(2026, 10, 25, 9, 5, 3);
    expect(buildVoiceRecordingFilename("audio/webm;codecs=opus", fixed)).toBe("voice-20261125-090503.webm");
    expect(buildVoiceRecordingFilename("audio/ogg", fixed)).toBe("voice-20261125-090503.ogg");
    expect(buildVoiceRecordingFilename("audio/mp4", fixed)).toBe("voice-20261125-090503.m4a");

    expect(formatDurationSeconds(0)).toBe("0:00");
    expect(formatDurationSeconds(7)).toBe("0:07");
    expect(formatDurationSeconds(83)).toBe("1:23");
  });
});

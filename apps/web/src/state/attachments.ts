export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const SAFE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isPreviewableImageMime(mimeType: string): boolean {
  return SAFE_IMAGE_MIMES.has(mimeType.trim().toLowerCase());
}

export const SAFE_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/aac",
  "audio/flac",
]);

export function isPlayableAudioMime(mimeType: string): boolean {
  return SAFE_AUDIO_MIMES.has(mimeType.split(";")[0]!.trim().toLowerCase());
}

export function pickRecorderAudioMime(isTypeSupported?: (mime: string) => boolean): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  if (isTypeSupported) {
    for (const mime of candidates) {
      if (isTypeSupported(mime)) return mime;
    }
  }
  return "audio/webm";
}

export function buildVoiceRecordingFilename(mimeType: string, now = new Date()): string {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  let ext = "webm";
  if (base === "audio/ogg") ext = "ogg";
  else if (base === "audio/mp4" || base === "audio/aac") ext = "m4a";
  else if (base === "audio/mpeg") ext = "mp3";
  else if (base === "audio/wav") ext = "wav";
  else if (base === "audio/flac") ext = "flac";

  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `voice-${date}-${time}.${ext}`;
}

export function formatDurationSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type FileLike = { name: string; type: string; size: number };

export function validateFilesToStage<T extends FileLike>(
  existingCount: number,
  incoming: readonly T[],
): { accepted: T[]; error: string | null } {
  const remaining = Math.max(0, MAX_ATTACHMENTS - existingCount);
  const accepted: T[] = [];
  let error: string | null = null;

  for (const file of incoming) {
    if (file.size <= 0) {
      error = "Empty files cannot be attached.";
      continue;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      error = "Each file must be 10 MB or smaller.";
      continue;
    }
    if (accepted.length >= remaining) {
      error = "You can attach up to 5 files per message.";
      break;
    }
    accepted.push(file);
  }
  return { accepted, error };
}

export function canSendComposer(text: string, stagedCount: number, disabled: boolean, busy: boolean): boolean {
  return !disabled && !busy && (text.trim() !== "" || stagedCount > 0);
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  const chunkLength = 0x8000;
  for (let i = 0; i < len; i += chunkLength) {
    const chunk = bytes.subarray(i, Math.min(i + chunkLength, len));
    let chunkChars = "";
    for (let j = 0; j < chunk.length; j += 3) {
      const b1 = chunk[j]!;
      const b2 = chunk[j + 1];
      const b3 = chunk[j + 2];

      const has2 = b2 !== undefined;
      const has3 = b3 !== undefined;

      const enc1 = b1 >> 2;
      const enc2 = ((b1 & 3) << 4) | (has2 ? b2 >> 4 : 0);
      const enc3 = has2 ? (((b2 & 15) << 2) | (has3 ? b3 >> 6 : 0)) : 64;
      const enc4 = has3 ? (b3 & 63) : 64;

      chunkChars +=
        BASE64_ALPHABET[enc1]! +
        BASE64_ALPHABET[enc2]! +
        (enc3 === 64 ? "=" : BASE64_ALPHABET[enc3]!) +
        (enc4 === 64 ? "=" : BASE64_ALPHABET[enc4]!);
    }
    result += chunkChars;
  }
  return result;
}

export type AttachmentUpload = {
  name: string;
  mimeType: string;
  dataBase64: string;
};

export async function encodeAttachmentFile(file: {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<AttachmentUpload> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const dataBase64 = bytesToBase64(bytes);
  return {
    name: file.name.trim() || "attachment",
    mimeType: file.type.trim() || "application/octet-stream",
    dataBase64,
  };
}

export function buildAuthenticatedAttachmentUrl(url: string, token: string | null): string {
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export function buildSendMessagePayload(
  text: string,
  attachments?: readonly AttachmentUpload[],
): { text: string; attachments?: AttachmentUpload[] } {
  return attachments && attachments.length > 0 ? { text, attachments: [...attachments] } : { text };
}

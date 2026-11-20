import type { TerminalSize } from "./terminal-session-manager.ts";

export const MAX_TERMINAL_DIMENSION = 500;
export const DEFAULT_TERMINAL_SIZE: TerminalSize = { cols: 80, rows: 24 };

export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

export type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; code: string; message: string };

export function parseClientMessage(raw: string): TerminalClientMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.type !== "string"
    ) {
      return null;
    }
    switch (parsed.type) {
      case "input":
        if (
          typeof parsed.data !== "string" ||
          parsed.data.length === 0
        ) {
          return null;
        }
        return { type: "input", data: parsed.data };
      case "resize":
        if (
          typeof parsed.cols !== "number" ||
          typeof parsed.rows !== "number" ||
          !Number.isInteger(parsed.cols) ||
          !Number.isInteger(parsed.rows) ||
          parsed.cols < 1 ||
          parsed.cols > MAX_TERMINAL_DIMENSION ||
          parsed.rows < 1 ||
          parsed.rows > MAX_TERMINAL_DIMENSION
        ) {
          return null;
        }
        return { type: "resize", cols: parsed.cols, rows: parsed.rows };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function parseTerminalSize(query: unknown): TerminalSize {
  const fallback: TerminalSize = { ...DEFAULT_TERMINAL_SIZE };
  if (typeof query !== "object" || query === null) {
    return fallback;
  }
  const record = query as Record<string, unknown>;
  const { cols, rows } = record;
  const parseDim = (value: unknown, defaultVal: number): number => {
    if (typeof value === "number") {
      if (Number.isInteger(value) && value >= 1 && value <= MAX_TERMINAL_DIMENSION) {
        return value;
      }
    } else if (typeof value === "string") {
      const num = Number(value);
      if (Number.isInteger(num) && num >= 1 && num <= MAX_TERMINAL_DIMENSION) {
        return num;
      }
    }
    return defaultVal;
  };
  return {
    cols: parseDim(cols, fallback.cols),
    rows: parseDim(rows, fallback.rows),
  };
}

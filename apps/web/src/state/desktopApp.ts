import type { BossId } from "../api/types";

export type DesktopAppId = "claude_desktop" | "chatgpt" | "antigravity";

export type EmbeddedAppTarget =
  | { kind: "web"; label: string }
  | { kind: "vnc"; appId: DesktopAppId; label: string };

export type EmbeddedAppStatus =
  | { kind: "web"; running: boolean; url: string | null }
  | { kind: "vnc"; appId: DesktopAppId; running: boolean };

export function embeddedAppFor(bossId: BossId): EmbeddedAppTarget {
  switch (bossId) {
    case "opencode":
      return { kind: "web", label: "OpenCode" };
    case "claude":
      return { kind: "vnc", appId: "claude_desktop", label: "Claude Desktop" };
    case "codex":
      return { kind: "vnc", appId: "chatgpt", label: "ChatGPT" };
    case "gemini":
      return { kind: "vnc", appId: "antigravity", label: "Antigravity" };
    default:
      throw new Error(`Unknown bossId: ${bossId}`);
  }
}

export function buildDesktopUrl(
  location: { protocol: string; host: string },
  token: string | null,
  appId: DesktopAppId
): string {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws/desktop/${appId}?token=${encodeURIComponent(token ?? "")}`;
}

export function describeAppError(code: string, message: string, label: string): string {
  switch (code) {
    case "display_server_missing":
      return "The display server is missing. Install it with: sudo apt install tigervnc-standalone-server";
    case "app_not_installed":
      return `${label} is not installed on this computer.`;
    case "start_timeout":
      return `${label} did not start in time.`;
    default:
      return message;
  }
}

export function startingText(label: string): string {
  return `Starting ${label}…`;
}

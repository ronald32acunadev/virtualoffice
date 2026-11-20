import { describe, expect, it } from "vitest";
import {
  buildDesktopUrl,
  describeAppError,
  embeddedAppFor,
  startingText,
} from "./desktopApp";

describe("desktopApp", () => {
  it("US-04 / AC-01: maps each boss to its embedded app", () => {
    expect(embeddedAppFor("opencode")).toEqual({
      kind: "web",
      label: "OpenCode",
    });
    expect(embeddedAppFor("claude")).toEqual({
      kind: "vnc",
      appId: "claude_desktop",
      label: "Claude Desktop",
    });
    expect(embeddedAppFor("codex")).toEqual({
      kind: "vnc",
      appId: "chatgpt",
      label: "ChatGPT",
    });
    expect(embeddedAppFor("gemini")).toEqual({
      kind: "vnc",
      appId: "antigravity",
      label: "Antigravity",
    });
  });

  it("US-04 / AC-01: builds the desktop stream URL", () => {
    expect(
      buildDesktopUrl(
        { protocol: "http:", host: "127.0.0.1:4317" },
        "a b",
        "chatgpt"
      )
    ).toEqual("ws://127.0.0.1:4317/ws/desktop/chatgpt?token=a%20b");
    expect(
      buildDesktopUrl(
        { protocol: "https:", host: "office.test" },
        null,
        "antigravity"
      )
    ).toEqual("wss://office.test/ws/desktop/antigravity?token=");
  });

  it("US-04 / AC-05: explains why an app cannot start", () => {
    expect(
      describeAppError("display_server_missing", "x", "ChatGPT")
    ).toEqual("The display server is missing. Install it with: sudo apt install tigervnc-standalone-server");
    expect(
      describeAppError("app_not_installed", "x", "Claude Desktop")
    ).toEqual("Claude Desktop is not installed on this computer.");
    expect(
      describeAppError("start_timeout", "x", "Antigravity")
    ).toEqual("Antigravity did not start in time.");
    expect(
      describeAppError("folder_missing", "Working directory no longer exists", "OpenCode")
    ).toEqual("Working directory no longer exists");
  });

  it("US-04 / AC-01: shows the starting text", () => {
    expect(startingText("OpenCode")).toEqual("Starting OpenCode…");
  });
});

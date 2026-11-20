import type { AgentSink, StartParams } from "../../office/ports/agent-adapter.ts";
import {
  CliJsonlAdapter,
  asRecord,
  asString,
  defaultSpawn,
  parseJsonLine,
  type CliLineParser,
  type CliProviderSpec,
  type SpawnFunction,
} from "../cli-jsonl-adapter.ts";

function stringifyValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function extractOpenCodeError(event: Record<string, unknown>): string {
  const topMessage = asString(event.message);
  if (topMessage) return topMessage;
  const directError = asString(event.error);
  if (directError) return directError;
  const errorObj = asRecord(event.error);
  if (errorObj) {
    const nested = asString(errorObj.message) ?? asString(asRecord(errorObj.data)?.message);
    if (nested) return nested;
    return JSON.stringify(errorObj);
  }
  return "OpenCode error";
}

function createOpenCodeParser(sink: AgentSink): CliLineParser {
  let sessionStarted = false;

  return {
    onLine(line: string): void {
      const event = parseJsonLine(line);
      if (!event) return;

      const sessionId = asString(event.sessionID);
      if (!sessionStarted && sessionId) {
        sessionStarted = true;
        sink.onSessionStarted(sessionId);
      }

      const type = asString(event.type);
      if (type === "text") {
        const part = asRecord(event.part);
        const text = asString(part?.text);
        if (text !== undefined) {
          sink.onMessage({ kind: "agent_text", content: text });
        }
        return;
      }

      if (type === "tool_use") {
        const part = asRecord(event.part);
        if (!part) return;
        const toolName = asString(part.tool) ?? "tool";
        const toolUseId = asString(part.callID) ?? asString(part.id) ?? null;
        const state = asRecord(part.state);

        sink.onMessage({
          kind: "tool_call",
          toolName,
          toolUseId,
          content: stringifyValue(state?.input ?? {}),
        });

        const hasError =
          state?.error !== undefined && state.error !== null && state.error !== "";
        const hasOutput = state?.output !== undefined && state.output !== null;

        if (hasError && (state?.status === "error" || !hasOutput || state?.output === "")) {
          sink.onMessage({
            kind: "tool_result",
            toolName,
            toolUseId,
            content: stringifyValue(state?.error),
          });
        } else if (hasOutput) {
          sink.onMessage({
            kind: "tool_result",
            toolName,
            toolUseId,
            content: stringifyValue(state?.output),
          });
        }
        return;
      }

      if (type === "error") {
        sink.onFailed(extractOpenCodeError(event));
      }
      // step_finish waits for process exit 0 so the session lock is released before next turn
    },

    onClose(code: number | null, _signal: NodeJS.Signals | null, stderr: string): void {
      if (code === 0) {
        sink.onTurnFinished();
        return;
      }
      const detail = stderr.trim();
      const suffix = detail ? `: ${detail}` : "";
      sink.onFailed(`OpenCode exited with code ${code ?? "unknown"}${suffix}`);
    },
  };
}

export class OpenCodeAgentAdapter extends CliJsonlAdapter {
  constructor(
    spawnFn: SpawnFunction = defaultSpawn,
    command = "opencode",
    killGraceMs?: number,
  ) {
    const spec: CliProviderSpec = {
      name: "OpenCode",
      command,
      buildArgs: ({ prompt, resume }: StartParams) =>
        resume
          ? ["run", "--format", "json", "--session", resume, prompt]
          : ["run", "--format", "json", prompt],
      createParser: createOpenCodeParser,
    };
    super(spec, spawnFn, killGraceMs);
  }
}

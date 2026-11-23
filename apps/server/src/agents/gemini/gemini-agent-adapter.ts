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
import { extractTokenUsage } from "../usage-parser.ts";

function extractGeminiError(event: Record<string, unknown>, fallback: string): string {
  const message = asString(event.message);
  if (message) return message;
  const directError = asString(event.error);
  if (directError) return directError;
  const errorObj = asRecord(event.error);
  if (errorObj) {
    const nested = asString(errorObj.message);
    if (nested) return nested;
    return JSON.stringify(errorObj);
  }
  return fallback;
}

function createGeminiParser(sink: AgentSink): CliLineParser {
  let deltaBuffer = "";
  const toolNamesById = new Map<string, string>();

  const flushAssistantText = (): void => {
    if (deltaBuffer === "") return;
    const content = deltaBuffer;
    deltaBuffer = "";
    sink.onMessage({ kind: "agent_text", content });
  };

  return {
    onLine(line: string): void {
      const event = parseJsonLine(line);
      if (!event) return;

      const type = asString(event.type);
      if (type === "init") {
        const sessionId = asString(event.session_id);
        if (sessionId) sink.onSessionStarted(sessionId);
        return;
      }

      if (type === "message") {
        const role = asString(event.role);
        if (role !== undefined && role !== "assistant") return;

        const content = asString(event.content) ?? "";
        if (event.delta) {
          if (content !== "") {
            deltaBuffer += content;
            sink.onDelta(content);
          }
        } else {
          flushAssistantText();
          if (content !== "") {
            sink.onMessage({ kind: "agent_text", content });
          }
        }
        return;
      }

      if (type === "tool_use") {
        flushAssistantText();
        const toolName = asString(event.tool_name) ?? "tool";
        const toolUseId = asString(event.tool_id) ?? null;
        if (toolUseId) toolNamesById.set(toolUseId, toolName);
        sink.onMessage({
          kind: "tool_call",
          toolName,
          toolUseId,
          content: JSON.stringify(event.parameters ?? {}),
        });
        return;
      }

      if (type === "tool_result") {
        const toolUseId = asString(event.tool_id) ?? null;
        const toolName =
          asString(event.tool_name) ?? (toolUseId ? toolNamesById.get(toolUseId) ?? null : null);
        const content =
          typeof event.output === "string" ? event.output : JSON.stringify(event.output ?? "");
        sink.onMessage({
          kind: "tool_result",
          toolName,
          toolUseId,
          content,
        });
        return;
      }

      if (type === "result") {
        flushAssistantText();
        const stats = asRecord(event.stats);
        const tokens = (stats ? extractTokenUsage(stats) : null) ?? extractTokenUsage(event);
        if (tokens) sink.onUsage?.({ tokens });
        if (asString(event.status) === "error") {
          sink.onFailed(extractGeminiError(event, "Gemini CLI turn failed"));
        } else {
          sink.onTurnFinished();
        }
        return;
      }

      if (type === "error") {
        flushAssistantText();
        sink.onFailed(extractGeminiError(event, "Gemini CLI error"));
      }
    },

    onClose(code: number | null, _signal: NodeJS.Signals | null, stderr: string): void {
      flushAssistantText();
      if (code === 0) {
        sink.onTurnFinished();
        return;
      }
      const detail = stderr.trim();
      const suffix = detail ? `: ${detail}` : "";
      sink.onFailed(`Gemini CLI exited with code ${code ?? "unknown"}${suffix}`);
    },
  };
}

export class GeminiAgentAdapter extends CliJsonlAdapter {
  constructor(
    spawnFn: SpawnFunction = defaultSpawn,
    command = "gemini",
    killGraceMs?: number,
  ) {
    const spec: CliProviderSpec = {
      name: "Gemini CLI",
      command,
      buildArgs: ({ prompt, resume, attachments }: StartParams) => {
        let finalPrompt = prompt.trim();
        if (attachments && attachments.length > 0) {
          const lines = attachments.map((a) => `- ${a.name} (${a.mimeType}): ${a.path}`);
          const notes = `Attached files:\n${lines.join("\n")}`;
          finalPrompt = finalPrompt ? `${finalPrompt}\n\n${notes}` : notes;
        }
        if (attachments && attachments.length > 0 && !finalPrompt) {
          finalPrompt = "Please inspect the attached file(s).";
        }

        return resume
          ? ["--resume", resume, "-p", finalPrompt, "--output-format", "stream-json"]
          : ["-p", finalPrompt, "--output-format", "stream-json"];
      },
      createParser: createGeminiParser,
    };
    super(spec, spawnFn, killGraceMs);
  }
}

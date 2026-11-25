import path from "node:path";
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

export type AntigravityAgentAdapterOptions = {
  spawnFn?: SpawnFunction;
  command?: string;
  killGraceMs?: number;
};

function stringifyPayload(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function extractAntigravityError(
  primary: Record<string, unknown>,
  fallbackEvent: Record<string, unknown>,
  fallback: string,
): string {
  for (const source of [primary, fallbackEvent]) {
    const message = asString(source.message);
    if (message) return message;
    const directError = asString(source.error);
    if (directError) return directError;
    const errorObj = asRecord(source.error);
    if (errorObj) {
      const nested = asString(errorObj.message);
      if (nested) return nested;
      return JSON.stringify(errorObj);
    }
  }
  return fallback;
}

function extractToolUseId(record: Record<string, unknown>): string | null {
  return (
    asString(record.tool_call_id) ??
    asString(record.tool_use_id) ??
    asString(record.call_id) ??
    asString(record.id) ??
    (typeof record.step_index === "number" ? `step-${record.step_index}` : null)
  );
}

function createAntigravityParser(sink: AgentSink): CliLineParser {
  let sessionStarted = false;
  let bufferedText = "";
  let emittedAgentText = false;
  let finished = false;
  let failed = false;
  const seenToolCalls = new Set<string>();
  const toolNamesById = new Map<string, string>();

  const emitSessionStarted = (conversationId: string | undefined): void => {
    if (sessionStarted || !conversationId) return;
    sessionStarted = true;
    sink.onSessionStarted(conversationId);
  };

  const flushBufferedText = (): void => {
    if (bufferedText.trim() !== "") {
      sink.onMessage({ kind: "agent_text", content: bufferedText.trimEnd() });
      emittedAgentText = true;
    }
    bufferedText = "";
  };

  const handleToolStep = (record: Record<string, unknown>): void => {
    const fn = asRecord(record.function);
    const toolName =
      asString(record.tool_name) ?? asString(record.name) ?? asString(fn?.name) ?? "tool";
    const toolUseId = extractToolUseId(record);
    const input = record.arguments ?? record.input ?? record.parameters ?? fn?.arguments;
    const hasOutput =
      record.output !== undefined || record.result !== undefined || record.error !== undefined;

    if (!toolUseId || !seenToolCalls.has(toolUseId)) {
      if (toolUseId) {
        seenToolCalls.add(toolUseId);
        toolNamesById.set(toolUseId, toolName);
      }
      sink.onMessage({
        kind: "tool_call",
        toolName,
        toolUseId,
        content: stringifyPayload(input ?? {}),
      });
    }

    if (hasOutput) {
      const payload =
        record.error !== undefined &&
        record.error !== null &&
        record.output === undefined &&
        record.result === undefined
          ? record.error
          : (record.output ?? record.result ?? record.error);
      sink.onMessage({
        kind: "tool_result",
        toolName,
        toolUseId,
        content: stringifyPayload(payload ?? ""),
      });
    }
  };

  return {
    onLine(line: string): void {
      const event = parseJsonLine(line);
      if (!event) return;

      const eventName = asString(event.event);
      if (eventName === "init") {
        const initObj = asRecord(event.init);
        emitSessionStarted(asString(event.conversation_id) ?? asString(initObj?.conversation_id));
        return;
      }

      if (eventName === "step_update") {
        const step = asRecord(event.step_update);
        if (!step) return;

        emitSessionStarted(asString(step.conversation_id) ?? asString(event.conversation_id));

        const stepType = asString(step.step_type) ?? asString(step.type);
        const state = asString(step.state);

        if (stepType === "thinking" || stepType === "thought" || stepType === "reasoning") {
          const rawText = asString(step.text) ?? asString(step.thinking) ?? asString(step.thought) ?? asString(event.text) ?? asString(event.thinking) ?? asString(event.thought);
          if (rawText !== undefined && rawText.trim() !== "") {
            sink.onMessage({ kind: "thinking", content: rawText.trim() });
          }
          return;
        }

        if (stepType === "agent_response") {
          const textDelta = asString(step.text_delta);
          if (textDelta !== undefined && textDelta.length > 0) {
            bufferedText += textDelta;
            sink.onDelta(textDelta);
          }
          if (state === "DONE") {
            flushBufferedText();
          }
          return;
        }

        const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : null;
        const directToolName = asString(step.tool_name);
        if (stepType === "tool_call" || directToolName !== undefined || toolCalls !== null) {
          flushBufferedText();
          if (toolCalls && toolCalls.length > 0) {
            for (const rawCall of toolCalls) {
              const call = asRecord(rawCall);
              if (call) handleToolStep(call);
            }
          } else if (stepType === "tool_call" || directToolName !== undefined) {
            handleToolStep(step);
          }
          return;
        }

        if (stepType === "tool_result") {
          flushBufferedText();
          const toolUseId = extractToolUseId(step);
          const toolName =
            asString(step.tool_name) ??
            asString(step.name) ??
            (toolUseId ? toolNamesById.get(toolUseId) ?? null : null);
          const payload = step.output ?? step.result ?? step.error ?? step.content ?? "";
          sink.onMessage({
            kind: "tool_result",
            toolName,
            toolUseId,
            content: stringifyPayload(payload),
          });
        }
        return;
      }

      if (eventName === "result") {
        const result = asRecord(event.result) ?? event;
        emitSessionStarted(asString(result.conversation_id) ?? asString(event.conversation_id));
        flushBufferedText();

        const status = asString(result.status);
        if (status !== undefined && status.toUpperCase() !== "SUCCESS") {
          if (!failed) {
            failed = true;
            sink.onFailed(
              extractAntigravityError(result, event, `Antigravity turn failed (${status})`),
            );
          }
          return;
        }

        if (!emittedAgentText) {
          const response = asString(result.response);
          if (response !== undefined && response.trim() !== "") {
            sink.onMessage({ kind: "agent_text", content: response.trimEnd() });
            emittedAgentText = true;
          }
        }

        const tokens = extractTokenUsage(result) ?? extractTokenUsage(event);
        if (tokens) sink.onUsage?.({ tokens });

        if (!failed && !finished) {
          finished = true;
          sink.onTurnFinished();
        }
        return;
      }

      if (eventName === "error") {
        if (!failed && !finished) {
          flushBufferedText();
        }
        if (!failed) {
          failed = true;
          sink.onFailed(
            extractAntigravityError(asRecord(event.error) ?? event, event, "Antigravity error"),
          );
        }
      }
    },

    onClose(code: number | null, _signal: NodeJS.Signals | null, stderr: string): void {
      if (!failed && !finished) {
        flushBufferedText();
      }
      if (failed) return;
      if (code === 0) {
        if (!finished) {
          finished = true;
          sink.onTurnFinished();
        }
        return;
      }
      const detail = stderr.trim();
      const suffix = detail ? `: ${detail}` : "";
      failed = true;
      sink.onFailed(`Antigravity exited with code ${code ?? "unknown"}${suffix}`);
    },
  };
}

export class AntigravityAgentAdapter extends CliJsonlAdapter {
  constructor(options: AntigravityAgentAdapterOptions = {}) {
    const { spawnFn = defaultSpawn, command = "agy", killGraceMs } = options;
    const spec: CliProviderSpec = {
      name: "Antigravity",
      command,
      buildArgs: ({ employee, prompt, resume, attachments }: StartParams) => {
        const dirs = [...new Set((attachments ?? []).map((a) => path.dirname(a.path)))];
        const addDirFlags = dirs.flatMap((dir) => ["--add-dir", dir]);
        const modelFlags = employee.model ? ["--model", employee.model] : [];
        const turboFlags = employee.mode === "turbo" ? ["--dangerously-skip-permissions"] : [];

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
          ? ["--conversation", resume, ...modelFlags, ...turboFlags, ...addDirFlags, "-p", finalPrompt, "--output-format", "stream-json"]
          : [...modelFlags, ...turboFlags, ...addDirFlags, "-p", finalPrompt, "--output-format", "stream-json"];
      },
      createParser: createAntigravityParser,
    };
    super(spec, spawnFn, killGraceMs);
  }
}

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

function formatMcpToolName(item: Record<string, unknown>): string {
  const server = asString(item.server);
  const tool = asString(item.tool);
  if (server && tool) return `${server}:${tool}`;
  return tool ?? server ?? "mcp";
}

function stringifyPayload(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatMcpResult(item: Record<string, unknown>): string {
  if (item.error !== undefined && item.error !== null) {
    return stringifyPayload(item.error);
  }
  if (item.result !== undefined && item.result !== null) {
    return stringifyPayload(item.result);
  }
  return "";
}

function createCodexParser(sink: AgentSink): CliLineParser {
  return {
    onLine(line: string): void {
      const event = parseJsonLine(line);
      if (!event) return;

      const type = asString(event.type);
      if (type === "thread.started") {
        const threadId = asString(event.thread_id);
        if (threadId) sink.onSessionStarted(threadId);
        return;
      }

      if (type === "item.started") {
        const item = asRecord(event.item);
        if (!item) return;
        const itemType = asString(item.type);
        const toolUseId = asString(item.id) ?? null;

        if (itemType === "command_execution") {
          sink.onMessage({
            kind: "tool_call",
            toolName: "Bash",
            toolUseId,
            content: JSON.stringify({ command: asString(item.command) ?? "" }),
          });
        } else if (itemType === "mcp_tool_call") {
          sink.onMessage({
            kind: "tool_call",
            toolName: formatMcpToolName(item),
            toolUseId,
            content: JSON.stringify(item.arguments ?? {}),
          });
        }
        return;
      }

      if (type === "item.completed") {
        const item = asRecord(event.item);
        if (!item) return;
        const itemType = asString(item.type);
        const toolUseId = asString(item.id) ?? null;

        if (itemType === "command_execution") {
          const output = asString(item.aggregated_output) ?? "";
          const exitCode = typeof item.exit_code === "number" ? item.exit_code : 0;
          sink.onMessage({
            kind: "tool_result",
            toolName: "Bash",
            toolUseId,
            content: output || `Exit code: ${exitCode}`,
          });
        } else if (itemType === "mcp_tool_call") {
          sink.onMessage({
            kind: "tool_result",
            toolName: formatMcpToolName(item),
            toolUseId,
            content: formatMcpResult(item),
          });
        } else if (itemType === "agent_message") {
          const text = asString(item.text);
          if (text !== undefined) {
            sink.onMessage({ kind: "agent_text", content: text });
          }
        }
        // item.type === "error" is a non-fatal advisory warning in Codex JSONL
        return;
      }

      if (type === "turn.completed") {
        const tokens = extractTokenUsage(event);
        if (tokens) sink.onUsage?.({ tokens });
        sink.onTurnFinished();
        return;
      }

      if (type === "turn.failed") {
        const errorObj = asRecord(event.error);
        const message =
          asString(errorObj?.message) ?? asString(event.message) ?? "Codex turn failed";
        sink.onFailed(message);
        return;
      }

      if (type === "error") {
        const errorObj = asRecord(event.error);
        const message =
          asString(event.message) ?? asString(errorObj?.message) ?? "Codex error";
        sink.onFailed(message);
      }
    },

    onClose(code: number | null, _signal: NodeJS.Signals | null, stderr: string): void {
      if (code === 0) {
        sink.onTurnFinished();
        return;
      }
      const detail = stderr.trim();
      const suffix = detail ? `: ${detail}` : "";
      sink.onFailed(`Codex exited with code ${code ?? "unknown"}${suffix}`);
    },
  };
}

export class CodexAgentAdapter extends CliJsonlAdapter {
  constructor(
    spawnFn: SpawnFunction = defaultSpawn,
    command = "codex",
    killGraceMs?: number,
  ) {
    const spec: CliProviderSpec = {
      name: "Codex",
      command,
      buildArgs: ({ employee, prompt, resume }: StartParams) =>
        resume
          ? ["exec", "resume", resume, "--json", prompt]
          : ["exec", "--json", "--cd", employee.workingDirectory, "--skip-git-repo-check", prompt],
      createParser: createCodexParser,
    };
    super(spec, spawnFn, killGraceMs);
  }
}

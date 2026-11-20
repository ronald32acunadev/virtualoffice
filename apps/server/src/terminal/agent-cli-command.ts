import type { Employee } from "../office/domain/types.ts";

export type AgentCliCommand = { command: string; args: string[] };

export function resolveAgentCliCommand(
  employee: Pick<Employee, "bossId" | "providerSessionId">,
  isAvailable: (bin: string) => boolean,
): AgentCliCommand | null {
  const sid = employee.providerSessionId;
  const bossId = employee.bossId;

  if (bossId === "claude") {
    if (!isAvailable("claude")) {
      return null;
    }
    return { command: "claude", args: sid ? ["--resume", sid] : [] };
  }

  if (bossId === "codex") {
    if (!isAvailable("codex")) {
      return null;
    }
    return { command: "codex", args: sid ? ["resume", sid] : [] };
  }

  if (bossId === "opencode") {
    if (!isAvailable("opencode")) {
      return null;
    }
    return { command: "opencode", args: sid ? ["--session", sid] : [] };
  }

  if (bossId === "gemini") {
    if (isAvailable("agy")) {
      return { command: "agy", args: sid ? ["--conversation", sid] : [] };
    }
    if (isAvailable("gemini")) {
      return { command: "gemini", args: sid ? ["--resume", sid] : [] };
    }
    return null;
  }

  return null;
}

import type { ApprovalKind } from "../../office/domain/types.ts";

export function approvalKindFor(toolName: string): ApprovalKind {
  if (toolName === "AskUserQuestion") return "question";
  if (toolName === "ExitPlanMode") return "plan";
  return "permission";
}

export function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "AskUserQuestion") {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const texts = questions
      .map((entry) => (entry && typeof entry === "object" ? (entry as { question?: unknown }).question : undefined))
      .filter((text): text is string => typeof text === "string");
    if (texts.length > 0) return texts.join("\n");
  }
  if (toolName === "ExitPlanMode" && typeof input.plan === "string") return input.plan;
  if (toolName === "Bash" && typeof input.command === "string") return input.command;
  if (typeof input.file_path === "string") return input.file_path;
  return JSON.stringify(input);
}

import type { EmployeeStatus } from "../api/types";
import type { TimelineItem } from "./timeline";
import { buildToolLabel } from "./toolLabel";

export const NEAR_BOTTOM_THRESHOLD_PX = 80;

export const STARTER_PROMPTS: readonly { label: string; prompt: string }[] = [
  {
    label: "Explain this codebase",
    prompt: "Give me a high-level overview of this project's architecture and key entry points.",
  },
  {
    label: "Find & fix bugs",
    prompt: "Inspect recent changes or failing tests and identify any bugs or edge cases.",
  },
  {
    label: "Plan a feature",
    prompt: "Help me design a clear step-by-step plan before editing code.",
  },
  {
    label: "Review git diff",
    prompt: "Review the current uncommitted changes and flag any risks or improvements.",
  },
];

export function isNearBottom(
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
  thresholdPx = NEAR_BOTTOM_THRESHOLD_PX
): boolean {
  return metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight) <= thresholdPx;
}

export function deriveLiveStatus(params: {
  status: EmployeeStatus | undefined;
  timeline: readonly TimelineItem[];
  liveText: string;
}): string | null {
  if (params.status !== "starting" && params.status !== "working") {
    return null;
  }

  // Check from the end of timeline for the latest tool_call item whose result === null
  for (let i = params.timeline.length - 1; i >= 0; i--) {
    const item = params.timeline[i]!;
    if (item.message.kind === "tool_call" && item.result === null) {
      const label = buildToolLabel(item.message.toolName, item.message.content);
      return `Running ${label}…`;
    }
  }

  if (params.liveText.trim() !== "") {
    return "Responding…";
  }

  return "Thinking…";
}

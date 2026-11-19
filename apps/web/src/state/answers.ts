export type QuestionOption = { label: string; description: string };
export type Question = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extracts AskUserQuestion questions from an approval's raw input. Malformed entries are skipped. */
export function parseQuestions(input: unknown): Question[] {
  if (!isRecord(input) || !Array.isArray(input["questions"])) return [];
  const questions: Question[] = [];
  for (const raw of input["questions"] as unknown[]) {
    if (!isRecord(raw) || typeof raw["question"] !== "string") continue;
    const options: QuestionOption[] = [];
    if (Array.isArray(raw["options"])) {
      for (const option of raw["options"] as unknown[]) {
        if (isRecord(option) && typeof option["label"] === "string") {
          options.push({
            label: option["label"],
            description: typeof option["description"] === "string" ? option["description"] : "",
          });
        }
      }
    }
    questions.push({
      question: raw["question"],
      header: typeof raw["header"] === "string" ? raw["header"] : "",
      options,
      multiSelect: raw["multiSelect"] === true,
    });
  }
  return questions;
}

/**
 * Builds the `answers` payload: question text -> selected label, or comma-joined labels
 * for multi-select. Returns null while any question has no selection.
 */
export function buildAnswers(
  questions: Question[],
  selections: Record<string, string[]>,
): Record<string, string> | null {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const selected = (selections[q.question] ?? []).filter((label) =>
      q.options.some((option) => option.label === label),
    );
    if (selected.length === 0) return null;
    // Keep option order so the payload is deterministic.
    const ordered = q.options.map((o) => o.label).filter((label) => selected.includes(label));
    answers[q.question] = q.multiSelect ? ordered.join(", ") : (ordered[0] ?? "");
  }
  return answers;
}

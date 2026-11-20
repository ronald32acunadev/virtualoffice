import { useState } from "react";
import { buildAnswers, type Question } from "../state/answers";

type Props = {
  questions: Question[];
  busy: boolean;
  onSubmit: (answers: Record<string, string>) => void;
  onReject: () => void;
};

export function QuestionForm({ questions, busy, onSubmit, onReject }: Props) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const answers = buildAnswers(questions, selections);

  const toggle = (question: Question, label: string) => {
    setSelections((current) => {
      const existing = current[question.question] ?? [];
      if (!question.multiSelect) return { ...current, [question.question]: [label] };
      const next = existing.includes(label) ? existing.filter((l) => l !== label) : [...existing, label];
      return { ...current, [question.question]: next };
    });
  };

  return (
    <div className="question-form">
      {questions.map((q, qi) => (
        <fieldset key={q.question}>
          <legend>{q.question}</legend>
          {q.options.map((option) => {
            const checked = (selections[q.question] ?? []).includes(option.label);
            return (
              <label key={option.label} className="option">
                <input
                  type={q.multiSelect ? "checkbox" : "radio"}
                  name={`q-${qi}`}
                  checked={checked}
                  onChange={() => toggle(q, option.label)}
                />
                <span>
                  <strong>{option.label}</strong>
                  {option.description ? <small> {option.description}</small> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      <div className="actions">
        <button type="button" disabled={busy || answers === null} onClick={() => answers && onSubmit(answers)}>
          Submit answers
        </button>
        <button type="button" className="danger" disabled={busy} onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}

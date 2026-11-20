import { describe, expect, it } from "vitest";
import { buildAnswers, parseQuestions } from "./answers";

const input = {
  questions: [
    {
      question: "Which database?",
      header: "DB",
      multiSelect: false,
      options: [
        { label: "SQLite", description: "Embedded" },
        { label: "Postgres", description: "Server" },
      ],
    },
    {
      question: "Which features?",
      header: "Features",
      multiSelect: true,
      options: [
        { label: "Auth", description: "" },
        { label: "Search", description: "" },
        { label: "Export", description: "" },
      ],
    },
  ],
};

describe("question answers", () => {
  it("US-05 / AC-01: parses questions with their options", () => {
    const questions = parseQuestions(input);
    expect(questions).toHaveLength(2);
    expect(questions[0]?.options.map((o) => o.label)).toEqual(["SQLite", "Postgres"]);
    expect(questions[1]?.multiSelect).toBe(true);
  });

  it("US-05 / AC-01: malformed input yields no questions", () => {
    expect(parseQuestions(null)).toEqual([]);
    expect(parseQuestions({ questions: "x" })).toEqual([]);
    expect(parseQuestions({ questions: [{ nope: 1 }] })).toEqual([]);
  });

  it("US-05 / AC-02: single select maps question text to the label, multi-select comma-joins", () => {
    const answers = buildAnswers(parseQuestions(input), {
      "Which database?": ["Postgres"],
      "Which features?": ["Export", "Auth"],
    });
    expect(answers).toEqual({
      "Which database?": "Postgres",
      "Which features?": "Auth, Export",
    });
  });

  it("US-05 / AC-02: returns null until every question is answered", () => {
    expect(buildAnswers(parseQuestions(input), { "Which database?": ["SQLite"] })).toBeNull();
  });

  it("US-05 / AC-02: ignores labels that are not options", () => {
    expect(buildAnswers(parseQuestions(input), { "Which database?": ["Oracle"], "Which features?": ["Auth"] })).toBeNull();
  });
});

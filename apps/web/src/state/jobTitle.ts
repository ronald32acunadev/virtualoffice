export const MAX_JOB_TITLE_LENGTH = 60;

export const JOB_TITLE_PRESETS: readonly string[] = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full-Stack Engineer",
  "Architect",
  "QA Engineer",
  "DevOps Engineer",
  "Product Manager",
  "UX Designer",
  "Data Engineer",
];

export function normalizeJobTitle(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function validateJobTitle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > MAX_JOB_TITLE_LENGTH) {
    return "Job title must be at most 60 characters";
  }
  return null;
}

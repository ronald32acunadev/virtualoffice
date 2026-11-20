import type { ImportResult, ImportSkipReason } from "../api/types";

export const SKIP_REASON_TEXT: Record<ImportSkipReason, string> = {
  already_imported: "Already in the office",
  missing_cwd: "No project folder recorded for this session",
  not_found: "Session not found",
  read_failed: "Could not read the session",
};

export type ImportSummary = {
  headline: string;
  imported: string[];
  skipped: string[];
};

/** Formats an import result for display. `titles` maps session ids to picker titles. */
export function formatImportResult(result: ImportResult, titles: Record<string, string> = {}): ImportSummary {
  const count = result.imported.length;
  const skippedCount = result.skipped.length;
  const parts: string[] = [`Imported ${count} ${count === 1 ? "session" : "sessions"}`];
  if (skippedCount > 0) parts.push(`skipped ${skippedCount}`);
  return {
    headline: parts.join(", "),
    imported: result.imported.map((employee) =>
      employee.status === "failed" && employee.failureReason
        ? `${employee.name} (${employee.failureReason})`
        : employee.name,
    ),
    skipped: result.skipped.map(
      (entry) => `${titles[entry.sessionId] ?? entry.sessionId}: ${SKIP_REASON_TEXT[entry.reason]}`,
    ),
  };
}

import { useState } from "react";
import type { ApprovalRequest, Decision, Employee } from "../api/types";
import { parseQuestions } from "../state/answers";
import { decisionErrorMessage } from "./errors";
import { QuestionForm } from "./QuestionForm";

type Props = {
  approval: ApprovalRequest;
  employee: Employee | undefined;
  onSelectEmployee: (id: string) => void;
  onDecide: (id: string, decision: Decision, answers?: Record<string, string>) => Promise<void>;
};

export function ApprovalCard({ approval, employee, onSelectEmployee, onDecide }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: Decision, answers?: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(approval.id, decision, answers);
    } catch (err) {
      setError(decisionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`approval approval-${approval.kind}`}>
      <button type="button" className="approval-head" onClick={() => onSelectEmployee(approval.employeeId)}>
        <span className="approval-task">{employee?.name ?? approval.employeeId}</span>
        <span className="approval-tool">{approval.toolName}</span>
      </button>
      {approval.kind === "question" ? (
        <QuestionForm
          questions={parseQuestions(approval.input)}
          busy={busy}
          onSubmit={(answers) => void decide("approve", answers)}
          onReject={() => void decide("reject")}
        />
      ) : (
        <>
          {approval.kind === "plan" ? (
            <pre className="approval-summary plan">{approval.summary}</pre>
          ) : (
            <pre className="approval-summary">{approval.summary}</pre>
          )}
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void decide("approve")}>
              Approve
            </button>
            {approval.kind === "permission" && approval.canApproveForSession ? (
              <button type="button" className="secondary" disabled={busy} onClick={() => void decide("approve_for_session")}>
                Approve for session
              </button>
            ) : null}
            <button type="button" className="danger" disabled={busy} onClick={() => void decide("reject")}>
              Reject
            </button>
          </div>
        </>
      )}
      {error ? <p className="field-error">{error}</p> : null}
    </li>
  );
}

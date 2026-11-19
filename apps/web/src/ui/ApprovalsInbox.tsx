import { useOffice } from "../state/OfficeProvider";
import { ApprovalCard } from "./ApprovalCard";

export function ApprovalsInbox() {
  const { state, actions } = useOffice();
  return (
    <section className="card inbox">
      <h2>
        Approvals <span className="badge">{state.approvals.length}</span>
      </h2>
      {state.approvals.length === 0 ? (
        <p className="muted">No pending requests.</p>
      ) : (
        <ul className="approval-list">
          {state.approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              employee={state.employees.find((e) => e.id === approval.employeeId)}
              onSelectEmployee={actions.select}
              onDecide={actions.decide}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

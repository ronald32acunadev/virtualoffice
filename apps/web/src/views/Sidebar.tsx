import { useMemo } from "react";
import { useOffice } from "../state/OfficeProvider";
import { RoleBadge } from "../ui/RoleBadge";
import { SPECIES_EMOJI } from "../state/species";
import { groupEmployeesByBoss } from "../state/sidebar";

type Props = { onNewTask: () => void; onImport: () => void; onOpenOffice: () => void };

export function Sidebar({ onNewTask, onImport, onOpenOffice }: Props) {
  const { state, actions } = useOffice();
  const groups = useMemo(() => groupEmployeesByBoss(state.employees, state.bosses), [state.employees, state.bosses]);
  const employeeName = (id: string) => state.employees.find((e) => e.id === id)?.name ?? id;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button type="button" onClick={onNewTask}>
          New task
        </button>
        <button type="button" className="secondary" onClick={onImport}>
          Import from Claude
        </button>
      </div>

      <section className="sidebar-section">
        <h2>
          Approvals <span className="badge">{state.approvals.length}</span>
        </h2>
        {state.approvals.length === 0 ? (
          <p className="muted">No pending requests.</p>
        ) : (
          <ul className="pending-list">
            {state.approvals.map((approval) => (
              <li key={approval.id}>
                <button type="button" className="pending-row" onClick={() => actions.select(approval.employeeId)}>
                  <strong>{employeeName(approval.employeeId)}</strong>
                  <span className="approval-tool">{approval.toolName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="sidebar-list" aria-label="Employees">
        {groups.length === 0 ? <p className="muted">No employees yet. Start a new task or import a session.</p> : null}
        {groups.map((group) => (
          <section key={group.bossId} className="sidebar-section">
            <h2>{group.bossName}</h2>
            <ul className="employee-list">
              {group.employees.map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    className="employee-row"
                    aria-pressed={state.selectedId === employee.id}
                    onClick={() => actions.select(employee.id)}
                  >
                    <span className="avatar" title={employee.species}>
                      {SPECIES_EMOJI[employee.species]}
                    </span>
                    <span className="employee-text">
                      <span className="employee-name">
                        {employee.name}
                        {employee.jobTitle ? <span className="job-title-badge">{employee.jobTitle}</span> : null}
                        <RoleBadge role={employee.role} />
                      </span>
                      <span className="employee-task" title={employee.task}>
                        {employee.task}
                      </span>
                    </span>
                    <span
                      className={`dot dot-${employee.status}`}
                      role="img"
                      aria-label={employee.status.replace("_", " ")}
                      title={employee.status.replace("_", " ")}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button type="button" className="secondary" onClick={onOpenOffice}>
          Open office
        </button>
        <span className={`connection-text connection-${state.connection}`}>
          {state.connection === "online" ? "Connected" : state.connection === "connecting" ? "Connecting..." : "Reconnecting..."}
        </span>
      </div>
    </aside>
  );
}

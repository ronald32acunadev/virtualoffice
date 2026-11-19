import { useOffice } from "../state/OfficeProvider";

export function EmployeeList() {
  const { state, actions } = useOffice();
  const employees = [...state.employees].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bossName = (id: string) => state.bosses.find((b) => b.id === id)?.name ?? id;

  return (
    <section className="card">
      <h2>
        Employees <span className="badge">{employees.length}</span>
      </h2>
      {employees.length === 0 ? (
        <p className="muted">No employees yet. Hire one below.</p>
      ) : (
        <ul className="employee-list">
          {employees.map((employee) => (
            <li key={employee.id}>
              <button
                type="button"
                className="employee-row"
                aria-pressed={state.selectedId === employee.id}
                onClick={() => actions.select(employee.id)}
              >
                <span className="employee-row-head">
                  <span className="employee-boss">{bossName(employee.bossId)}</span>
                  <span className={`status status-${employee.status}`}>{employee.status.replace("_", " ")}</span>
                </span>
                <span className="employee-task" title={employee.task}>
                  {employee.task}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

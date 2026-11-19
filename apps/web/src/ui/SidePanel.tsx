import { useOffice } from "../state/OfficeProvider";
import { ApprovalsInbox } from "./ApprovalsInbox";
import { EmployeeDetail } from "./EmployeeDetail";
import { EmployeeList } from "./EmployeeList";
import { NewTaskForm } from "./NewTaskForm";

export function SidePanel() {
  const { state } = useOffice();
  return (
    <aside className="side-panel">
      <ApprovalsInbox />
      <EmployeeList />
      {state.selectedId ? <EmployeeDetail key={state.selectedId} employeeId={state.selectedId} /> : null}
      <NewTaskForm />
    </aside>
  );
}

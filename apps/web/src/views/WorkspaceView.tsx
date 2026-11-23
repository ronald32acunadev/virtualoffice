import { useEffect, useState } from "react";
import { getToken } from "../api/client";
import { useOffice } from "../state/OfficeProvider";
import { useOfficeMood } from "../state/officeMood";
import { buildViewUrl } from "../state/routing";
import { createWorkspaceLink, openWindowChannel } from "../state/windowChannel";
import { ConversationPane } from "./ConversationPane";
import { ImportModal } from "./ImportModal";
import { NewTaskModal } from "./NewTaskModal";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
  const { state, actions } = useOffice();
  const { mood, toggleMood } = useOfficeMood();
  const [modal, setModal] = useState<"new" | "import" | null>(null);
  const [newTaskDir, setNewTaskDir] = useState<string | null>(null);

  useEffect(() => {
    const channel = openWindowChannel();
    if (!channel) return;
    return createWorkspaceLink(channel, (employeeId) => {
      actions.select(employeeId);
      try {
        window.focus();
      } catch {
        // Browsers may refuse to focus a window; the selection already changed.
      }
    });
  }, [actions]);

  const openOffice = () => window.open(buildViewUrl("/office", getToken()), "_blank");
  const selected = state.selectedId && state.employees.some((e) => e.id === state.selectedId) ? state.selectedId : null;

  return (
    <div className="workspace">
      <Sidebar
        mood={mood}
        onToggleMood={toggleMood}
        onNewTask={(projectPath) => {
          setNewTaskDir(projectPath ?? null);
          setModal("new");
        }}
        onImport={() => setModal("import")}
        onOpenOffice={openOffice}
      />
      <main className="workspace-main">
        {selected ? (
          <ConversationPane key={selected} employeeId={selected} />
        ) : (
          <div className="workspace-empty">
            <h1>Virtual Office</h1>
            <p className="muted">
              {state.loaded && state.employees.length === 0
                ? "Start a new task or import a Claude session to hire your first employee."
                : "Select an employee to see their conversation."}
            </p>
          </div>
        )}
      </main>
      {modal === "new" ? (
        <NewTaskModal
          initialWorkingDirectory={newTaskDir}
          onClose={() => {
            setModal(null);
            setNewTaskDir(null);
          }}
        />
      ) : null}
      {modal === "import" ? <ImportModal onClose={() => setModal(null)} /> : null}
    </div>
  );
}

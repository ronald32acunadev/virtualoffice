import { useState, type FormEvent } from "react";
import type { BossId } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { toFormError, type FormError } from "./errors";

export function NewTaskForm() {
  const { state, actions } = useOffice();
  const [bossId, setBossId] = useState<BossId>("claude");
  const [task, setTask] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  const bosses =
    state.bosses.length > 0
      ? state.bosses
      : [{ id: "claude" as BossId, name: "Claude", available: true }];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await actions.createEmployee({ bossId, task, workingDirectory });
      setTask("");
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (field: string) =>
    error?.field === field ? <p className="field-error">{error.message}</p> : null;

  return (
    <form className="card new-task" onSubmit={(e) => void submit(e)}>
      <h2>New task</h2>
      <label>
        Boss
        <select value={bossId} onChange={(e) => setBossId(e.target.value as BossId)}>
          {bosses.map((boss) => (
            <option key={boss.id} value={boss.id} disabled={!boss.available}>
              {boss.name}
              {boss.available ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
        {fieldError("bossId")}
      </label>
      <label>
        Task
        <textarea rows={3} value={task} onChange={(e) => setTask(e.target.value)} placeholder="What should the employee do?" />
        {fieldError("task")}
      </label>
      <label>
        Working directory
        <input type="text" value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="/path/to/project" />
        {fieldError("workingDirectory")}
      </label>
      {error && !error.field ? <p className="field-error">{error.message}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? "Hiring..." : "Hire employee"}
      </button>
    </form>
  );
}

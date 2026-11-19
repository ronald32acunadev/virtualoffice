import { useState, type FormEvent } from "react";
import type { BossId, Species } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { SPECIES_LIST, speciesLabel } from "../state/species";
import { toFormError, type FormError } from "../ui/errors";
import { Modal } from "./Modal";

export function NewTaskModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useOffice();
  const [bossId, setBossId] = useState<BossId>("claude");
  const [task, setTask] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<"" | Species>("");
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  const bosses =
    state.bosses.length > 0 ? state.bosses : [{ id: "claude" as BossId, name: "Claude", available: true }];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await actions.createEmployee({
        bossId,
        task,
        workingDirectory,
        ...(name.trim() !== "" ? { name } : {}),
        ...(species !== "" ? { species } : {}),
      });
      onClose();
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (field: string) =>
    error?.field === field ? <p className="field-error">{error.message}</p> : null;

  return (
    <Modal title="New task" onClose={onClose}>
      <form className="modal-body" onSubmit={(e) => void submit(e)}>
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
        <div className="form-row">
          <label>
            Name (optional)
            <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Generated if empty" />
            {fieldError("name")}
          </label>
          <label>
            Species (optional)
            <select value={species} onChange={(e) => setSpecies(e.target.value as "" | Species)}>
              <option value="">Random</option>
              {SPECIES_LIST.map((s) => (
                <option key={s} value={s}>
                  {speciesLabel(s)}
                </option>
              ))}
            </select>
            {fieldError("species")}
          </label>
        </div>
        {error && !error.field ? <p className="field-error">{error.message}</p> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? "Hiring..." : "Hire employee"}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

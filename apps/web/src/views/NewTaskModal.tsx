import { useEffect, useId, useState, type FormEvent } from "react";
import type { BossId, Species } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { JOB_TITLE_PRESETS, MAX_JOB_TITLE_LENGTH } from "../state/jobTitle";
import { groupRoleOptions } from "../state/role";
import { SPECIES_LIST, speciesLabel } from "../state/species";
import { useCatalog } from "../state/useCatalog";
import { toFormError, type FormError } from "../ui/errors";
import { Modal } from "./Modal";

export function NewTaskModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useOffice();
  const bosses =
    state.bosses.length > 0 ? state.bosses : [{ id: "claude" as BossId, name: "Claude", available: true }];
  const [bossId, setBossId] = useState<BossId>(() => bosses.find((b) => b.available)?.id ?? "claude");
  const [task, setTask] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [species, setSpecies] = useState<"" | Species>("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const jobTitleListId = useId();

  useEffect(() => {
    const selected = bosses.find((b) => b.id === bossId);
    if (selected && !selected.available) {
      const fallback = bosses.find((b) => b.available);
      if (fallback && fallback.id !== bossId) {
        setBossId(fallback.id);
        if (fallback.id !== "claude") setRole("");
      }
    }
  }, [bosses, bossId]);

  const isClaude = bossId === "claude";
  const folder = workingDirectory.trim();
  // Roles are read only on an explicit action (focusing/opening the selector or "Load roles"), never on keystrokes.
  const { entry: rolesEntry, load: loadRoles, refresh: refreshRoles } = useCatalog(
    isClaude && folder ? { kind: "folder", path: folder } : null,
  );
  const agents = "catalog" in rolesEntry ? (rolesEntry.catalog?.agents ?? []) : [];
  const roleGroups = groupRoleOptions(agents);
  const selectedAgent = agents.find((a) => a.name === role);
  const rolesLoading = rolesEntry.status === "loading";
  const rolesUnavailable = rolesEntry.status === "unavailable" && agents.length === 0;

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
        ...(jobTitle.trim() !== "" ? { jobTitle } : {}),
        ...(species !== "" ? { species } : {}),
        ...(isClaude && role !== "" ? { role } : {}),
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
          <select
            value={bossId}
            onChange={(e) => {
              const next = e.target.value as BossId;
              setBossId(next);
              if (next !== "claude") setRole("");
            }}
          >
            {bosses.map((boss) => (
              <option key={boss.id} value={boss.id} disabled={!boss.available}>
                {boss.name}
                {boss.available ? "" : " (not installed)"}
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
          <input type="text" value={workingDirectory} onChange={(e) => {
              setWorkingDirectory(e.target.value);
              setRole("");
            }} placeholder="/path/to/project" />
          {fieldError("workingDirectory")}
        </label>
        <div className="form-row">
          <label>
            Name (optional)
            <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Generated if empty" />
            {fieldError("name")}
          </label>
          <label>
            Job title (optional)
            <input
              type="text"
              list={jobTitleListId}
              value={jobTitle}
              maxLength={MAX_JOB_TITLE_LENGTH}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Frontend Engineer, Architect"
            />
            <datalist id={jobTitleListId}>
              {JOB_TITLE_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
            {fieldError("jobTitle")}
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
        {isClaude ? (
          <div className="role-field">
            <label>
              Role (optional)
              <select
                value={role}
                disabled={!folder}
                onFocus={() => {
                  if (rolesEntry.status === "idle") loadRoles();
                }}
                onChange={(e) => setRole(e.target.value)}
                aria-describedby="role-help"
              >
                <option value="">General</option>
                {roleGroups.owner.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
                {roleGroups.builtin.length > 0 ? (
                  <optgroup label="Built-in">
                    {roleGroups.builtin.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              {fieldError("role")}
            </label>
            <p id="role-help" className="role-help muted">
              {!folder
                ? "Enter a working directory to choose a specialist."
                : rolesLoading
                  ? "Loading roles…"
                  : rolesUnavailable
                    ? "Couldn't read this folder's agents."
                    : selectedAgent
                      ? selectedAgent.description
                      : "General runs as a plain employee. Open the list to see your agents."}
            </p>
            {folder ? (
              <button type="button" className="link" disabled={rolesLoading} onClick={rolesEntry.status === "ready" ? refreshRoles : loadRoles}>
                {rolesEntry.status === "ready" ? "Reload roles" : "Load roles"}
              </button>
            ) : null}
            {roleGroups.owner.length + roleGroups.builtin.length > 0 ? (
              <ul className="role-list">
                {[...roleGroups.owner, ...roleGroups.builtin].map((a) => (
                  <li key={a.name}>
                    <button
                      type="button"
                      className={`role-option${role === a.name ? " is-selected" : ""}`}
                      aria-pressed={role === a.name}
                      onClick={() => setRole(role === a.name ? "" : a.name)}
                    >
                      <strong>{a.name}</strong>
                      {a.builtin ? <span className="menu-alias">built-in</span> : null}
                      <span className="menu-desc">{a.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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

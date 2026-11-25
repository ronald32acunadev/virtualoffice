import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { BossId } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { agentDisplayLabel } from "../state/agentView";
import { buildProjectOptions } from "../state/sidebar";
import { SPECIES_EMOJI } from "../state/species";
import { toFormError, type FormError } from "../ui/errors";
import { Modal } from "./Modal";

export function NewTaskModal({
  onClose,
  initialWorkingDirectory,
  initialAgentId,
  onManageTeam,
}: {
  onClose: () => void;
  initialWorkingDirectory?: string | null;
  initialAgentId?: string | null;
  onManageTeam?: () => void;
}) {
  const { state, actions } = useOffice();
  const bosses =
    state.bosses.length > 0 ? state.bosses : [{ id: "claude" as BossId, name: "Claude", available: true }];
  const availableBossIds = useMemo(
    () => new Set(bosses.filter((b) => b.available).map((b) => b.id)),
    [bosses],
  );
  const selectableAgents = useMemo(
    () => state.agents.filter((a) => availableBossIds.has(a.bossId)),
    [state.agents, availableBossIds],
  );

  const [agentId, setAgentId] = useState<string>(
    () => initialAgentId ?? selectableAgents[0]?.id ?? "",
  );
  const [bossId, setBossId] = useState<BossId>(() => {
    const pre = state.agents.find((a) => a.id === initialAgentId);
    if (pre) return pre.bossId;
    return bosses.find((b) => b.available)?.id ?? "claude";
  });
  const [task, setTask] = useState("");
  const projectOptions = useMemo(
    () => buildProjectOptions(state.projects, state.employees),
    [state.projects, state.employees],
  );
  const [workingDirectory, setWorkingDirectory] = useState(
    () => initialWorkingDirectory ?? projectOptions[0]?.path ?? "",
  );
  const [customPath, setCustomPath] = useState(
    () =>
      projectOptions.length === 0 ||
      (Boolean(initialWorkingDirectory) &&
        !projectOptions.some((p) => p.path === initialWorkingDirectory)),
  );
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (agentId && !state.agents.some((a) => a.id === agentId)) {
      setAgentId(selectableAgents[0]?.id ?? "");
    }
  }, [agentId, state.agents, selectableAgents]);

  const selectedAgent = state.agents.find((a) => a.id === agentId) ?? null;

  const bossName = (id: BossId) => bosses.find((b) => b.id === id)?.name ?? id;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await actions.createEmployee({
        bossId: selectedAgent ? selectedAgent.bossId : bossId,
        ...(selectedAgent ? { agentId: selectedAgent.id } : {}),
        task,
        workingDirectory,
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
    <Modal title="New chat" onClose={onClose}>
      <form className="modal-body" onSubmit={(e) => void submit(e)}>
        <div className="agent-picker-head">
          <label className="agent-picker-label">
            Agent
            {selectableAgents.length > 0 ? (
              <select
                value={agentId}
                onChange={(e) => {
                  const next = e.target.value;
                  setAgentId(next);
                  const found = state.agents.find((a) => a.id === next);
                  if (found) setBossId(found.bossId);
                }}
              >
                {selectableAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {SPECIES_EMOJI[a.species]} {agentDisplayLabel(a)} ({bossName(a.bossId)})
                  </option>
                ))}
                <option value="">Default provider agent…</option>
              </select>
            ) : (
              <select
                value={bossId}
                onChange={(e) => setBossId(e.target.value as BossId)}
              >
                {bosses.map((boss) => (
                  <option key={boss.id} value={boss.id} disabled={!boss.available}>
                    {boss.name}
                    {boss.available ? " (General)" : " (not installed)"}
                  </option>
                ))}
              </select>
            )}
          </label>
          {onManageTeam ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                onClose();
                onManageTeam();
              }}
            >
              Manage team
            </button>
          ) : null}
        </div>
        {selectableAgents.length > 0 && !selectedAgent ? (
          <label>
            Provider
            <select value={bossId} onChange={(e) => setBossId(e.target.value as BossId)}>
              {bosses.map((boss) => (
                <option key={boss.id} value={boss.id} disabled={!boss.available}>
                  {boss.name}
                  {boss.available ? "" : " (not installed)"}
                </option>
              ))}
            </select>
            {fieldError("bossId")}
          </label>
        ) : null}
        <label>
          Task / Opening message
          <textarea
            rows={3}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What should this agent work on?"
          />
          {fieldError("task")}
        </label>
        {projectOptions.length > 0 ? (
          <label>
            Project
            <select
              value={customPath ? "__custom__" : workingDirectory}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "__custom__") {
                  setCustomPath(true);
                  setWorkingDirectory("");
                } else {
                  setCustomPath(false);
                  setWorkingDirectory(value);
                }
              }}
            >
              {projectOptions.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name} — {p.path}
                </option>
              ))}
              <option value="__custom__">Custom directory...</option>
            </select>
          </label>
        ) : null}
        {customPath || projectOptions.length === 0 ? (
          <label>
            Working directory
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/project"
            />
            {fieldError("workingDirectory")}
          </label>
        ) : null}
        {error && !error.field ? <p className="field-error">{error.message}</p> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? "Starting..." : "Start chat"}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Agent, AgentEffort, AgentInfo, AgentMode, BossId, Species } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import {
  buildModelOptionsForBoss,
  formatEffortLabel,
  getAgentModeOption,
  getDefaultModeForBoss,
  getEffortsForBoss,
  getModesForBoss,
  resolveModelLabel,
} from "../state/agentConfig";
import { JOB_TITLE_PRESETS, MAX_JOB_TITLE_LENGTH } from "../state/jobTitle";
import { groupRoleOptions } from "../state/role";
import { SPECIES_EMOJI, SPECIES_LIST, speciesLabel } from "../state/species";
import { toFormError, type FormError } from "../ui/errors";
import { RoleBadge } from "../ui/RoleBadge";
import { Modal } from "./Modal";

export function TeamModal({
  open,
  onClose,
  onStartChatWithAgent,
}: {
  open: boolean;
  onClose: () => void;
  onStartChatWithAgent?: (agentId: string) => void;
}) {
  const { state, actions } = useOffice();
  const bosses =
    state.bosses.length > 0 ? state.bosses : [{ id: "claude" as BossId, name: "Claude", available: true }];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [bossId, setBossId] = useState<BossId>(() => bosses.find((b) => b.available)?.id ?? "claude");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<"" | Species>("");
  const [jobTitle, setJobTitle] = useState("");
  const [role, setRole] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<AgentMode>(() => getDefaultModeForBoss(bosses.find((b) => b.available)?.id ?? "claude"));
  const [effort, setEffort] = useState<"" | AgentEffort>("");
  const [catalogAgents, setCatalogAgents] = useState<AgentInfo[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const jobTitleListId = useId();

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  const loadGlobalRoles = async (refresh = false) => {
    setLoadingRoles(true);
    try {
      const { catalog } = await api.getGlobalCatalog(refresh);
      setCatalogAgents(catalog.agents);
    } catch {
      // Optional catalog — user can still pick General or type a role name.
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    if (open && bossId === "claude" && catalogAgents.length === 0) {
      void loadGlobalRoles(false);
    }
  }, [open, bossId, catalogAgents.length]);

  if (!open) return null;

  const roleGroups = groupRoleOptions(catalogAgents);
  const bossName = (id: BossId) => bosses.find((b) => b.id === id)?.name ?? id;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setSpecies("");
    setJobTitle("");
    setRole("");
    setModel("");
    setMode(getDefaultModeForBoss(bossId));
    setEffort("");
    setError(null);
  };

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setBossId(agent.bossId);
    setName(agent.name);
    setSpecies(agent.species);
    setJobTitle(agent.jobTitle ?? "");
    setRole(agent.role ?? "");
    setModel(agent.model ?? "");
    setMode(agent.mode ?? getDefaultModeForBoss(agent.bossId));
    setEffort(agent.effort ?? "");
    setError(null);
  };

  const modelOptions = buildModelOptionsForBoss(bossId, state.providerModels, model || null);
  const modeOptions = getModesForBoss(bossId);
  const effortOptions = getEffortsForBoss(bossId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await actions.updateAgent(editingId, {
          ...(name.trim() !== "" ? { name: name.trim() } : {}),
          ...(species !== "" ? { species } : {}),
          jobTitle: jobTitle.trim() === "" ? null : jobTitle.trim(),
          model: model.trim() === "" ? null : model.trim(),
          mode,
          ...(effortOptions.length > 0 ? { effort: effort === "" ? null : effort } : {}),
          ...(bossId === "claude" ? { role: role.trim() === "" ? null : role.trim() } : {}),
        });
      } else {
        await actions.createAgent({
          bossId,
          ...(name.trim() !== "" ? { name: name.trim() } : {}),
          ...(species !== "" ? { species } : {}),
          ...(jobTitle.trim() !== "" ? { jobTitle: jobTitle.trim() } : {}),
          ...(model.trim() !== "" ? { model: model.trim() } : {}),
          mode,
          ...(effortOptions.length > 0 && effort !== "" ? { effort } : {}),
          ...(bossId === "claude" && role.trim() !== "" ? { role: role.trim() } : {}),
        });
      }
      resetForm();
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    setBusy(true);
    setError(null);
    try {
      await actions.deleteAgent(agent.id);
      if (editingId === agent.id) resetForm();
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Agent Team" onClose={onClose}>
      <div className="modal-body team-modal">
        <section className="team-list-section">
          <h3 className="team-section-title">Your team ({state.agents.length})</h3>
          {state.agents.length === 0 ? (
            <p className="muted">No agents yet. Create your first team member below.</p>
          ) : (
            <ul className="team-agent-list">
              {state.agents.map((agent) => {
                const chatCount = state.employees.filter((e) => e.agentId === agent.id).length;
                return (
                  <li key={agent.id} className={`team-agent-row${editingId === agent.id ? " is-editing" : ""}`}>
                    <span className="avatar" title={agent.species}>
                      {SPECIES_EMOJI[agent.species]}
                    </span>
                    <div className="team-agent-info">
                      <div className="team-agent-head">
                        <strong>{agent.name}</strong>
                        <span className="employee-agent-tag" data-boss={agent.bossId}>
                          <span className="boss-accent-dot" aria-hidden="true" />
                          {bossName(agent.bossId)}
                        </span>
                        {agent.jobTitle ? <span className="job-title-badge">{agent.jobTitle}</span> : null}
                        <RoleBadge role={agent.role} />
                      </div>
                      <span className="muted team-agent-meta">
                        {chatCount} {chatCount === 1 ? "chat" : "chats"} ·{" "}
                        {resolveModelLabel(agent.model, buildModelOptionsForBoss(agent.bossId, state.providerModels, agent.model))}
                        {getEffortsForBoss(agent.bossId).length > 0 && agent.effort ? ` (${formatEffortLabel(agent.effort)})` : ""} ·{" "}
                        {getAgentModeOption(agent.mode, agent.bossId).shortLabel}
                      </span>
                    </div>
                    <div className="team-agent-actions">
                      {onStartChatWithAgent ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            onClose();
                            onStartChatWithAgent(agent.id);
                          }}
                        >
                          + Chat
                        </button>
                      ) : null}
                      <button type="button" className="link" onClick={() => startEdit(agent)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link danger-link"
                        disabled={busy}
                        onClick={() => void handleDelete(agent)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form className="team-form" onSubmit={(e) => void handleSubmit(e)}>
          <h3 className="team-section-title">{editingId ? "Edit agent" : "Add agent to team"}</h3>
          <div className="form-row">
            <label>
              Provider
              <select
                value={bossId}
                disabled={Boolean(editingId)}
                onChange={(e) => {
                  const next = e.target.value as BossId;
                  setBossId(next);
                  setModel("");
                  setMode(getDefaultModeForBoss(next));
                  if (next !== "claude") setRole("");
                  if (getEffortsForBoss(next).length === 0) setEffort("");
                }}
              >
                {bosses.map((boss) => (
                  <option key={boss.id} value={boss.id}>
                    {boss.name}
                    {boss.available ? "" : " (not installed)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                type="text"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Generated if empty"
              />
            </label>
            <label>
              Species
              <select value={species} onChange={(e) => setSpecies(e.target.value as "" | Species)}>
                <option value="">Random</option>
                {SPECIES_LIST.map((s) => (
                  <option key={s} value={s}>
                    {speciesLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Job title (optional)
              <input
                type="text"
                list={jobTitleListId}
                value={jobTitle}
                maxLength={MAX_JOB_TITLE_LENGTH}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Architect, Reviewer"
              />
              <datalist id={jobTitleListId}>
                {JOB_TITLE_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </label>
            {bossId === "claude" ? (
              <label>
                Claude agent role (optional)
                <select value={role} onChange={(e) => setRole(e.target.value)}>
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
                  {role && !catalogAgents.some((a) => a.name === role) ? (
                    <option value={role}>{role}</option>
                  ) : null}
                </select>
              </label>
            ) : null}
          </div>
          <div className="form-row">
            <label>
              Model
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Default model</option>
                {modelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Execution mode
              <select value={mode} onChange={(e) => setMode(e.target.value as AgentMode)}>
                {modeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {effortOptions.length > 0 ? (
              <label>
                Effort
                <select value={effort} onChange={(e) => setEffort(e.target.value as "" | AgentEffort)}>
                  <option value="">Default (Medium)</option>
                  {effortOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {bossId === "claude" ? (
            <button
              type="button"
              className="link"
              disabled={loadingRoles}
              onClick={() => void loadGlobalRoles(true)}
            >
              {loadingRoles ? "Loading Claude roles…" : "Refresh Claude roles"}
            </button>
          ) : null}
          {error ? <p className="field-error">{error.message}</p> : null}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : editingId ? "Save agent" : "Create agent"}
            </button>
            {editingId ? (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel edit
              </button>
            ) : (
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

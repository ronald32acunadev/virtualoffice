import { useMemo, useState } from "react";
import type { Employee, BossId } from "../api/types";
import type { LightingMood } from "../scene/officeTheme";
import { useOffice } from "../state/OfficeProvider";
import { groupEmployeesByAgent, resolveChatAgent } from "../state/agentView";
import { filterEmployees, formatSyncErrors, groupEmployeesByProject } from "../state/sidebar";
import { SPECIES_EMOJI } from "../state/species";
import { RoleBadge } from "../ui/RoleBadge";
import { UsageRing } from "../ui/UsageRing";

type Props = {
  mood: LightingMood;
  onToggleMood: () => void;
  onNewTask: (projectPath?: string, agentId?: string) => void;
  onOpenOffice: () => void;
  onOpenTeam?: () => void;
  onOpenSettings?: () => void;
};
type GroupMode = "project" | "agent";

export function Sidebar({ mood, onToggleMood, onNewTask, onOpenOffice, onOpenTeam, onOpenSettings }: Props) {
  const { state, actions } = useOffice();
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("project");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [resumingBoss, setResumingBoss] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const filtered = useMemo(() => filterEmployees(state.employees, search), [state.employees, search]);
  const agentGroups = useMemo(
    () => groupEmployeesByAgent(filtered, state.agents, search),
    [filtered, state.agents, search],
  );
  const projectGroups = useMemo(
    () => groupEmployeesByProject(filtered, search.trim() ? [] : state.projects),
    [filtered, search, state.projects],
  );

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const summary = await actions.syncProviders();
      setSyncError(formatSyncErrors(summary));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };
  const employeeName = (id: string) => state.employees.find((e) => e.id === id)?.name ?? id;

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const bossLabel = (bossId: BossId): string => {
    const found = state.bosses.find((b) => b.id === bossId);
    if (found?.name) return found.name;
    if (bossId === "claude") return "Claude";
    if (bossId === "codex") return "Codex";
    if (bossId === "opencode") return "OpenCode";
    if (bossId === "gemini") return "Gemini";
    return "Antigravity";
  };

  const renderEmployeeRow = (employee: Employee) => {
    const agent = resolveChatAgent(employee, state.agents);
    const agentName = agent?.name ?? employee.name;
    const agentSpecies = agent?.species ?? employee.species;
    const agentRole = agent?.role ?? employee.role;
    return (
      <li key={employee.id}>
        <button
          type="button"
          className={`employee-row${employee.status === "on_break" ? " employee-row-break" : ""}`}
          aria-pressed={state.selectedId === employee.id}
          onClick={() => actions.select(employee.id)}
          data-boss={employee.bossId}
        >
          <span className="avatar" title={`${agentName} (${agentSpecies})`}>
            {SPECIES_EMOJI[agentSpecies]}
          </span>
          <span className="employee-text">
            <span className="chat-title-text" title={employee.task}>
              {employee.task}
            </span>
            <span className="employee-name chat-agent-meta">
              <span className="employee-name-text">{agentName}</span>
              <span
                className="employee-agent-tag"
                data-boss={employee.bossId}
                title={bossLabel(employee.bossId)}
              >
                <span className="boss-accent-dot" aria-hidden="true" />
                {bossLabel(employee.bossId)}
              </span>
              <RoleBadge role={agentRole} />
            </span>
          </span>
          <span
            className={`dot dot-${employee.status}`}
            role="img"
            aria-label={employee.status.replace("_", " ")}
            title={employee.status === "on_break" ? "On break" : employee.status.replace("_", " ")}
          />
        </button>
      </li>
    );
  };

  const availableBosses = state.bosses.filter((b) => b.available);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button type="button" className="sidebar-nav-btn sidebar-nav-primary" onClick={() => onNewTask()}>
          <span className="nav-icon" aria-hidden="true">+</span>
          New
        </button>
        <div className="sidebar-search-wrap">
          <input
            type="search"
            className="sidebar-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search chats"
          />
        </div>
        <div className="sidebar-quick-links">
          <button type="button" className="sidebar-nav-btn" onClick={onOpenOffice}>
            3D Office
          </button>
          {onOpenTeam ? (
            <button type="button" className="sidebar-nav-btn" onClick={onOpenTeam} title="Create and manage your agent team">
              👥 Team
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-nav-btn"
            aria-pressed={mood === "evening"}
            onClick={onToggleMood}
            title={mood === "day" ? "Switch to cozy evening theme" : "Switch to warm daylight theme"}
          >
            {mood === "day" ? "☀ Day" : "🌙 Evening"}
          </button>
          {onOpenSettings ? (
            <button
              type="button"
              className="sidebar-nav-btn"
              onClick={onOpenSettings}
              title="Open theme and view settings"
            >
              ⚙ Settings
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar-nav-btn"
            disabled={syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
        {syncError ? (
          <p className="field-error" role="alert">
            {syncError}
          </p>
        ) : null}
      </div>

      {state.approvals.length > 0 ? (
        <section className="sidebar-section">
          <h2>
            Approvals <span className="badge">{state.approvals.length}</span>
          </h2>
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
        </section>
      ) : null}

      <div className="sidebar-group-toggle" role="tablist" aria-label="Group conversations">
        <button
          type="button"
          role="tab"
          className={`group-tab${groupMode === "project" ? " is-active" : ""}`}
          aria-selected={groupMode === "project"}
          onClick={() => setGroupMode("project")}
        >
          Projects
        </button>
        <button
          type="button"
          role="tab"
          className={`group-tab${groupMode === "agent" ? " is-active" : ""}`}
          aria-selected={groupMode === "agent"}
          onClick={() => setGroupMode("agent")}
        >
          Agents
        </button>
      </div>

      <nav className="sidebar-list" aria-label="Chats">
        {(groupMode === "project" ? projectGroups.length === 0 : agentGroups.length === 0) ? (
          <p className="muted sidebar-empty">
            {search.trim() ? "No matching conversations." : "No chats yet. Create an agent or start a new chat."}
          </p>
        ) : groupMode === "project" ? (
          projectGroups.map((group) => {
            const isCollapsed = Boolean(collapsed[group.projectKey]);
            return (
              <section key={group.projectKey} className="sidebar-section">
                <div className="sidebar-group-head-row">
                  <button
                    type="button"
                    className="sidebar-group-head"
                    aria-expanded={!isCollapsed}
                    title={group.projectKey}
                    onClick={() => toggleGroup(group.projectKey)}
                  >
                    <span className="project-group-title">
                      <span className="project-group-name">{group.projectName}</span>
                      {group.providers.length > 0 ? (
                        <span className="project-provider-dots" aria-hidden="true">
                          {group.providers.map((pid) => (
                            <span key={pid} className="project-provider-dot" data-boss={pid} title={bossLabel(pid)} />
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="group-chevron" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                  </button>
                  {!group.isGeneral ? (
                    <button
                      type="button"
                      className="sidebar-group-new"
                      title="New chat in this project"
                      aria-label={`New chat in ${group.projectName}`}
                      onClick={() => onNewTask(group.projectKey)}
                    >
                      +
                    </button>
                  ) : null}
                </div>
                {!isCollapsed ? (
                  group.employees.length === 0 ? (
                    <p className="muted sidebar-empty">No chats yet.</p>
                  ) : (
                    <ul className="employee-list">{group.employees.map(renderEmployeeRow)}</ul>
                  )
                ) : null}
              </section>
            );
          })
        ) : (
          agentGroups.map((group) => {
            const isCollapsed = Boolean(collapsed[group.groupKey]);
            const agent = group.agent;
            return (
              <section
                key={group.groupKey}
                className="sidebar-section"
                data-boss={agent?.bossId}
              >
                <div className="sidebar-group-head-row">
                  <button
                    type="button"
                    className="sidebar-group-head"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleGroup(group.groupKey)}
                  >
                    <span className="project-group-title">
                      {agent ? (
                        <>
                          <span aria-hidden="true">{SPECIES_EMOJI[agent.species]}</span>
                          <span className="project-group-name">{agent.name}</span>
                          <span className="employee-agent-tag" data-boss={agent.bossId}>
                            <span className="boss-accent-dot" aria-hidden="true" />
                            {bossLabel(agent.bossId)}
                          </span>
                          <RoleBadge role={agent.role} />
                        </>
                      ) : (
                        <span className="project-group-name">Unassigned</span>
                      )}
                    </span>
                    <span className="group-chevron" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                  </button>
                  {agent ? (
                    <button
                      type="button"
                      className="sidebar-group-new"
                      title={`New chat with ${agent.name}`}
                      aria-label={`New chat with ${agent.name}`}
                      onClick={() => onNewTask(undefined, agent.id)}
                    >
                      +
                    </button>
                  ) : null}
                </div>
                {!isCollapsed ? (
                  group.employees.length === 0 ? (
                    <p className="muted sidebar-empty">No chats yet.</p>
                  ) : (
                    <ul className="employee-list">{group.employees.map(renderEmployeeRow)}</ul>
                  )
                ) : null}
              </section>
            );
          })
        )}
      </nav>

      {availableBosses.length > 0 ? (
        <section className="sidebar-usage-panel" aria-label="Agent usage">
          <h2>Agent usage</h2>
          <ul className="usage-list">
            {availableBosses.map((boss) => (
              <li key={boss.id} className={`usage-row${boss.onBreak ? " is-break" : ""}`}>
                <span className="usage-boss-name">{boss.name}</span>
                <div className="usage-row-right">
                  <UsageRing
                    bossUsage={boss.usage}
                    onBreak={Boolean(boss.onBreak)}
                    breakUntil={boss.breakUntil}
                  />
                  {boss.onBreak ? (
                    <button
                      type="button"
                      className="resume-mini-btn"
                      disabled={resumingBoss === boss.id}
                      onClick={async () => {
                        setResumingBoss(boss.id);
                        try {
                          await actions.resumeBoss(boss.id);
                        } finally {
                          setResumingBoss(null);
                        }
                      }}
                    >
                      Resume
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="sidebar-bottom">
        <span className={`connection-text connection-${state.connection}`}>
          {state.connection === "online" ? "● Connected" : state.connection === "connecting" ? "● Connecting..." : "● Reconnecting..."}
        </span>
      </div>
    </aside>
  );
}

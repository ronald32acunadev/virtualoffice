import { useMemo, useState } from "react";
import type { Employee } from "../api/types";
import type { LightingMood } from "../scene/officeTheme";
import { useOffice } from "../state/OfficeProvider";
import { filterEmployees, formatSyncErrors, groupEmployeesByBoss, groupEmployeesByProject } from "../state/sidebar";
import { SPECIES_EMOJI } from "../state/species";
import { RoleBadge } from "../ui/RoleBadge";
import { UsageRing } from "../ui/UsageRing";

type Props = {
  mood: LightingMood;
  onToggleMood: () => void;
  onNewTask: (projectPath?: string) => void;
  onImport: () => void;
  onOpenOffice: () => void;
};
type GroupMode = "project" | "boss";

export function Sidebar({ mood, onToggleMood, onNewTask, onImport, onOpenOffice }: Props) {
  const { state, actions } = useOffice();
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("project");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [resumingBoss, setResumingBoss] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const filtered = useMemo(() => filterEmployees(state.employees, search), [state.employees, search]);
  const bossGroups = useMemo(() => groupEmployeesByBoss(filtered, state.bosses), [filtered, state.bosses]);
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

  const renderEmployeeRow = (employee: Employee) => (
    <li key={employee.id}>
      <button
        type="button"
        className={`employee-row${employee.status === "on_break" ? " employee-row-break" : ""}`}
        aria-pressed={state.selectedId === employee.id}
        onClick={() => actions.select(employee.id)}
      >
        <span className="avatar" title={employee.species}>
          {SPECIES_EMOJI[employee.species]}
        </span>
        <span className="employee-text">
          <span className="employee-name">
            <span className="employee-name-text">{employee.name}</span>
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
          title={employee.status === "on_break" ? "On break" : employee.status.replace("_", " ")}
        />
      </button>
    </li>
  );

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
          <button type="button" className="sidebar-nav-btn" onClick={onImport}>
            Import from Claude
          </button>
          <button type="button" className="sidebar-nav-btn" onClick={onOpenOffice}>
            3D Office
          </button>
          <button
            type="button"
            className="sidebar-nav-btn"
            aria-pressed={mood === "evening"}
            onClick={onToggleMood}
            title={mood === "day" ? "Switch to cozy evening theme" : "Switch to warm daylight theme"}
          >
            {mood === "day" ? "☀ Day" : "🌙 Evening"}
          </button>
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
          className={`group-tab${groupMode === "boss" ? " is-active" : ""}`}
          aria-selected={groupMode === "boss"}
          onClick={() => setGroupMode("boss")}
        >
          Agents
        </button>
      </div>

      <nav className="sidebar-list" aria-label="Employees">
        {(groupMode === "project" ? projectGroups.length === 0 : filtered.length === 0) ? (
          <p className="muted sidebar-empty">
            {search.trim() ? "No matching conversations." : "No employees yet. Start a new task or sync providers."}
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
                    <span>{group.projectName}</span>
                    <span className="group-chevron" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-group-new"
                    title="New chat in this project"
                    aria-label={`New chat in ${group.projectName}`}
                    onClick={() => onNewTask(group.projectKey)}
                  >
                    +
                  </button>
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
          bossGroups.map((group) => {
            const boss = state.bosses.find((b) => b.id === group.bossId);
            const isCollapsed = Boolean(collapsed[group.bossId]);
            return (
              <section key={group.bossId} className="sidebar-section">
                <button
                  type="button"
                  className="sidebar-group-head"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.bossId)}
                >
                  <span>
                    {group.bossName}
                    {boss?.onBreak ? <span className="boss-break-tag">☕ On break</span> : null}
                  </span>
                  <span className="group-chevron" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                </button>
                {!isCollapsed ? <ul className="employee-list">{group.employees.map(renderEmployeeRow)}</ul> : null}
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

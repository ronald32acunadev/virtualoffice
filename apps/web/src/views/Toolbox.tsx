import { useEffect, useRef, useState, useMemo } from "react";
import { useCatalog } from "../state/useCatalog";
import { commandKind, KIND_ICON, KIND_LABEL } from "../state/slashMenu";
import { organizeToolboxAgents, organizeToolboxCommands, defaultToolboxTab, buildAgentDelegationPrompt, countConversationAttachments, formatTokenCount, type ToolboxTab } from "../state/toolbox";
import { usePresence } from "../ui/usePresence";
import { useOffice } from "../state/OfficeProvider";
import type { SlashCommand } from "../api/types";

type Props = {
  employeeId: string;
  onInsertSkill: (name: string) => void;
  onInsertPrompt: (prompt: string) => void;
};

export function Toolbox({ employeeId, onInsertSkill, onInsertPrompt }: Props) {
  const { state } = useOffice();
  const employee = state.employees.find((e) => e.id === employeeId);
  const boss = state.bosses.find((b) => b.id === employee?.bossId);
  const attachmentCount = countConversationAttachments(state.messages[employeeId]);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ToolboxTab>("skills");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ builtin: true });
  const [copiedDir, setCopiedDir] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);

  const { entry, load, refresh } = useCatalog({ kind: "employee", id: employeeId });
  const { mounted, visible } = usePresence(open);
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const catalog = "catalog" in entry ? entry.catalog : undefined;

  useEffect(() => {
    setQuery("");
    if (employee) {
      setTab(defaultToolboxTab(employee.bossId, catalog?.commands.length ?? 0));
    }
  }, [employeeId, catalog?.commands.length]);

  useEffect(() => {
    if (!open) return;
    if (tab !== "workspace") {
      searchRef.current?.focus();
    }
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, tab]);

  const toggle = () => {
    if (!open) {
      load();
      if (employee) {
        setTab(defaultToolboxTab(employee.bossId, catalog?.commands.length ?? 0));
      }
    }
    setOpen((v) => !v);
  };

  const loading = entry.status === "loading";
  const isSearching = query.trim() !== "";

  const organizedSkills = useMemo(
    () => organizeToolboxCommands(catalog?.commands ?? [], query),
    [catalog?.commands, query]
  );
  const organizedAgents = useMemo(
    () => organizeToolboxAgents(catalog?.agents ?? [], query),
    [catalog?.agents, query]
  );

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderCommandRow = (c: SlashCommand) => {
    const kind = commandKind(c);
    const displayName = kind === "plugin" ? c.name.slice(c.name.indexOf(":") + 1) : c.name;
    return (
      <li key={c.name}>
        <button
          type="button"
          className="tool-item"
          onClick={() => {
            onInsertSkill(c.name);
            setOpen(false);
          }}
        >
          <span className={`kind-icon kind-${kind}`} title={KIND_LABEL[kind]}>
            {KIND_ICON[kind]}
          </span>
          <span className="menu-main">
            <span className="menu-name">
              /{displayName}
              {c.argumentHint ? <span className="menu-hint">{c.argumentHint}</span> : null}
            </span>
            <span className="menu-desc">{c.description}</span>
          </span>
        </button>
      </li>
    );
  };

  let body;
  if (tab === "workspace") {
    if (!employee) {
      body = <div className="menu-note">Employee not found</div>;
    } else {
      const usage = employee.usage;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      const costUsd = usage?.costUsd;

      body = (
        <div className="toolbox-workspace">
          <div className="toolbox-info-grid">
            <div className="toolbox-info-row">
              <span className="toolbox-info-label">Agent / Provider</span>
              <span className="toolbox-info-value">
                <span className="composer-boss-pill" data-boss={employee.bossId} style={{ display: "inline-flex", padding: "2px 8px" }}>
                  <span className="boss-accent-dot" aria-hidden="true" />
                  {boss?.name ?? employee.bossId}
                </span>
                <span className={`status status-${employee.status}`} style={{ marginLeft: "8px" }}>
                  {employee.status.replace("_", " ")}
                </span>
              </span>
            </div>
            <div className="toolbox-info-row">
              <span className="toolbox-info-label">Working Directory</span>
              <span className="toolbox-info-value">
                <span className="mono" title={employee.workingDirectory} style={{ wordBreak: "break-all" }}>
                  {employee.workingDirectory}
                </span>
                <button
                  type="button"
                  className="toolbox-copy-btn secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(employee.workingDirectory);
                    setCopiedDir(true);
                    setTimeout(() => setCopiedDir(false), 2000);
                  }}
                >
                  {copiedDir ? "Copied" : "Copy"}
                </button>
              </span>
            </div>
            <div className="toolbox-info-row">
              <span className="toolbox-info-label">Session ID</span>
              <span className="toolbox-info-value">
                <span className="mono" style={{ wordBreak: "break-all" }}>
                  {employee.providerSessionId || "Not started yet"}
                </span>
                {employee.providerSessionId ? (
                  <button
                    type="button"
                    className="toolbox-copy-btn secondary"
                    onClick={() => {
                      if (employee.providerSessionId) {
                        void navigator.clipboard.writeText(employee.providerSessionId);
                        setCopiedSession(true);
                        setTimeout(() => setCopiedSession(false), 2000);
                      }
                    }}
                  >
                    {copiedSession ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </span>
            </div>
            <div className="toolbox-info-row">
              <span className="toolbox-info-label">Role / Job Title</span>
              <span className="toolbox-info-value">
                {employee.role ?? "General"} · {employee.jobTitle ?? "—"}
              </span>
            </div>
            {usage ? (
              <div className="toolbox-info-row">
                <span className="toolbox-info-label">Usage</span>
                <span className="toolbox-info-value">
                  In: {formatTokenCount(inputTokens)} · Out: {formatTokenCount(outputTokens)}
                  {costUsd !== null && costUsd !== undefined ? ` · $${costUsd.toFixed(4)}` : ""}
                </span>
              </div>
            ) : null}
            <div className="toolbox-info-row">
              <span className="toolbox-info-label">Attachments</span>
              <span className="toolbox-info-value">{attachmentCount} shared in this chat</span>
            </div>
          </div>
        </div>
      );
    }
  } else if (!catalog && (entry.status === "idle" || loading)) {
    body = <p className="menu-note menu-loading">Loading skills…</p>;
  } else if (!catalog) {
    body = (
      <div className="menu-note">
        <p>Skills will appear once the employee starts</p>
        <button type="button" className="secondary" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  } else if (tab === "skills") {
    const { skills, plugins, builtins, totalCount } = organizedSkills;
    body = (
      <ul className="tool-list">
        {skills.length > 0 && (
          <li className="toolbox-group">
            <div className="toolbox-group-head">
              <span>Skills</span>
              <span className="toolbox-count">{skills.length}</span>
            </div>
            <ul className="toolbox-sublist">{skills.map(renderCommandRow)}</ul>
          </li>
        )}

        {plugins.map((group) => {
          const groupKey = `plugin-${group.plugin}`;
          const isCollapsed = !isSearching && !!collapsed[groupKey];
          return (
            <li key={group.plugin} className="toolbox-group">
              <button
                type="button"
                className="toolbox-group-head toolbox-group-toggle"
                onClick={() => toggleGroup(groupKey)}
                aria-expanded={!isCollapsed}
              >
                <span>
                  <span className="toolbox-chevron">{isCollapsed ? "▸" : "▾"}</span> Plugin: {group.plugin}
                </span>
                <span className="toolbox-count">{group.commands.length}</span>
              </button>
              {!isCollapsed && <ul className="toolbox-sublist">{group.commands.map(renderCommandRow)}</ul>}
            </li>
          );
        })}

        {builtins.length > 0 && (
          <li className="toolbox-group">
            <button
              type="button"
              className="toolbox-group-head toolbox-group-toggle"
              onClick={() => toggleGroup("builtin")}
              aria-expanded={!(!isSearching && !!collapsed["builtin"])}
            >
              <span>
                <span className="toolbox-chevron">{!isSearching && collapsed["builtin"] ? "▸" : "▾"}</span> Built-in
              </span>
              <span className="toolbox-count">{builtins.length}</span>
            </button>
            {(!isSearching && !collapsed["builtin"]) || isSearching ? (
              <ul className="toolbox-sublist">{builtins.map(renderCommandRow)}</ul>
            ) : null}
          </li>
        )}

        {totalCount === 0 && (
          <li className="menu-note">{isSearching ? "No matching skills" : "No skills found"}</li>
        )}
      </ul>
    );
  } else {
    const { custom, builtins, totalCount } = organizedAgents;
    body = (
      <ul className="tool-list">
        {custom.length > 0 && (
          <li className="toolbox-group">
            <div className="toolbox-group-head">
              <span>Custom Agents</span>
              <span className="toolbox-count">{custom.length}</span>
            </div>
            <ul className="toolbox-sublist">
              {custom.map((a) => (
                <li key={a.name}>
                  <button
                    type="button"
                    className="tool-item tool-agent"
                    onClick={() => {
                      onInsertPrompt(buildAgentDelegationPrompt(a.name));
                      setOpen(false);
                    }}
                  >
                    <span className="kind-icon">🤖</span>
                    <span className="menu-main">
                      <span className="menu-name">
                        {a.name}
                        {a.model ? <span className="menu-alias">{a.model}</span> : null}
                      </span>
                      <span className="menu-desc">{a.description}</span>
                      <span className="menu-hint-line">Click to delegate in chat</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}

        {builtins.length > 0 && (
          <li className="toolbox-group">
            <div className="toolbox-group-head">
              <span>Built-in Agents</span>
              <span className="toolbox-count">{builtins.length}</span>
            </div>
            <ul className="toolbox-sublist">
              {builtins.map((a) => (
                <li key={a.name}>
                  <button
                    type="button"
                    className="tool-item tool-agent"
                    onClick={() => {
                      onInsertPrompt(buildAgentDelegationPrompt(a.name));
                      setOpen(false);
                    }}
                  >
                    <span className="kind-icon">🤖</span>
                    <span className="menu-main">
                      <span className="menu-name">
                        {a.name}
                        <span className="menu-alias">built-in</span>
                      </span>
                      <span className="menu-desc">{a.description}</span>
                      <span className="menu-hint-line">Click to delegate in chat</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}

        {totalCount === 0 && (
          <li className="menu-note">{isSearching ? "No matching agents" : "No agents found"}</li>
        )}
      </ul>
    );
  }

  return (
    <div className="toolbox" ref={root}>
      <button
        type="button"
        className={`toolbox-button secondary${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Skills, agents and workspace"
        onClick={toggle}
      >
        <span aria-hidden="true">🧰</span> Toolbox
      </button>
      {mounted ? (
        <div className={`toolbox-popover popover-anim${visible && open ? " is-open" : ""}`} role="dialog" aria-label="Toolbox">
          <div className="toolbox-tabs">
            <div role="tablist">
              <button type="button" role="tab" aria-selected={tab === "skills"} className="tab" onClick={() => setTab("skills")}>
                Skills{catalog ? ` (${organizedSkills.totalCount})` : ""}
              </button>
              <button type="button" role="tab" aria-selected={tab === "agents"} className="tab" onClick={() => setTab("agents")}>
                Agents{catalog ? ` (${organizedAgents.totalCount})` : ""}
              </button>
              <button type="button" role="tab" aria-selected={tab === "workspace"} className="tab" onClick={() => setTab("workspace")}>
                Workspace
              </button>
            </div>
            <button type="button" className="link" disabled={loading} onClick={refresh} title="Re-read skills and agents">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
          {tab !== "workspace" && (
            <div className="toolbox-search-bar">
              <input
                ref={searchRef}
                type="search"
                className="toolbox-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "skills" ? "Filter skills, plugins, commands..." : "Filter agents..."}
                aria-label={tab === "skills" ? "Filter skills" : "Filter agents"}
              />
              {query !== "" && (
                <button
                  type="button"
                  className="toolbox-search-clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          )}
          <div className="toolbox-body">{body}</div>
        </div>
      ) : null}
    </div>
  );
}

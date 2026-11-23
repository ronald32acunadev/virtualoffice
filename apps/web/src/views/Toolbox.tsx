import { useEffect, useRef, useState, useMemo } from "react";
import { useCatalog } from "../state/useCatalog";
import { commandKind, KIND_ICON, KIND_LABEL } from "../state/slashMenu";
import { organizeToolboxAgents, organizeToolboxCommands } from "../state/toolbox";
import { usePresence } from "../ui/usePresence";
import type { SlashCommand } from "../api/types";

type Props = { employeeId: string; onInsertSkill: (name: string) => void };

export function Toolbox({ employeeId, onInsertSkill }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"skills" | "agents">("skills");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ builtin: true });
  const { entry, load, refresh } = useCatalog({ kind: "employee", id: employeeId });
  const { mounted, visible } = usePresence(open);
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery("");
  }, [employeeId]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
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
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen((v) => !v);
  };

  const catalog = "catalog" in entry ? entry.catalog : undefined;
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
  if (!catalog && (entry.status === "idle" || loading)) {
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
                <li key={a.name} className="tool-item tool-agent">
                  <span className="kind-icon">🤖</span>
                  <span className="menu-main">
                    <span className="menu-name">
                      {a.name}
                      {a.model ? <span className="menu-alias">{a.model}</span> : null}
                    </span>
                    <span className="menu-desc">{a.description}</span>
                    <span className="menu-hint-line">Ask in chat to delegate</span>
                  </span>
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
                <li key={a.name} className="tool-item tool-agent">
                  <span className="kind-icon">🤖</span>
                  <span className="menu-main">
                    <span className="menu-name">
                      {a.name}
                      <span className="menu-alias">built-in</span>
                    </span>
                    <span className="menu-desc">{a.description}</span>
                    <span className="menu-hint-line">Ask in chat to delegate</span>
                  </span>
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
        title="Skills and agents"
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
            </div>
            <button type="button" className="link" disabled={loading} onClick={refresh} title="Re-read skills and agents">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
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
          <div className="toolbox-body">{body}</div>
        </div>
      ) : null}
    </div>
  );
}

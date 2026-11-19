import { useEffect, useRef, useState } from "react";
import { useCatalog } from "../state/useCatalog";
import { commandKind, KIND_ICON, KIND_LABEL } from "../state/slashMenu";
import { usePresence } from "../ui/usePresence";

type Props = { employeeId: string; onInsertSkill: (name: string) => void };

export function Toolbox({ employeeId, onInsertSkill }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"skills" | "agents">("skills");
  const { entry, load, refresh } = useCatalog({ kind: "employee", id: employeeId });
  const { mounted, visible } = usePresence(open);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  const skills = catalog?.commands.filter((c) => !c.builtin) ?? [];
  const builtins = catalog?.commands.filter((c) => c.builtin) ?? [];

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
    const row = (c: (typeof skills)[number]) => {
      const kind = commandKind(c);
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
                /{c.name}
                {c.argumentHint ? <span className="menu-hint">{c.argumentHint}</span> : null}
              </span>
              <span className="menu-desc">{c.description}</span>
            </span>
          </button>
        </li>
      );
    };
    body = (
      <ul className="tool-list">
        {skills.map(row)}
        {builtins.length > 0 ? <li className="menu-heading">Built-in</li> : null}
        {builtins.map(row)}
        {skills.length + builtins.length === 0 ? <li className="menu-note">No skills found</li> : null}
      </ul>
    );
  } else {
    body = (
      <ul className="tool-list">
        {catalog.agents.map((a) => (
          <li key={a.name} className="tool-item tool-agent">
            <span className="kind-icon">🤖</span>
            <span className="menu-main">
              <span className="menu-name">
                {a.name}
                {a.builtin ? <span className="menu-alias">built-in</span> : null}
              </span>
              <span className="menu-desc">{a.description}</span>
              <span className="menu-hint-line">Ask in chat to delegate</span>
            </span>
          </li>
        ))}
        {catalog.agents.length === 0 ? <li className="menu-note">No agents found</li> : null}
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
                Skills{catalog ? ` (${catalog.commands.length})` : ""}
              </button>
              <button type="button" role="tab" aria-selected={tab === "agents"} className="tab" onClick={() => setTab("agents")}>
                Agents{catalog ? ` (${catalog.agents.length})` : ""}
              </button>
            </div>
            <button type="button" className="link" disabled={loading} onClick={refresh} title="Re-read skills and agents">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
          <div className="toolbox-body">{body}</div>
        </div>
      ) : null}
    </div>
  );
}

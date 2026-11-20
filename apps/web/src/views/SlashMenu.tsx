import { useEffect, useRef } from "react";
import type { CatalogEntry } from "../state/catalogStore";
import { commandKind, KIND_ICON, KIND_LABEL, type CommandMatch } from "../state/slashMenu";
import { Highlight } from "../ui/Highlight";
import { usePresence } from "../ui/usePresence";

type Props = {
  open: boolean;
  entry: CatalogEntry;
  matches: CommandMatch[];
  activeIndex: number;
  listId: string;
  onHover: (index: number) => void;
  onPick: (index: number) => void;
};

export const optionId = (listId: string, index: number) => `${listId}-opt-${index}`;

export function SlashMenu({ open, entry, matches, activeIndex, listId, onHover, onPick }: Props) {
  const { mounted, visible } = usePresence(open);
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);
  if (!mounted) return null;

  const hasData = "catalog" in entry && entry.catalog !== undefined;
  let body;
  if (!hasData && (entry.status === "idle" || entry.status === "loading")) {
    body = <p className="menu-note menu-loading">Loading skills…</p>;
  } else if (!hasData) {
    body = <p className="menu-note">Skills will appear once the employee starts</p>;
  } else if (matches.length === 0) {
    body = <p className="menu-note">No matching skills</p>;
  } else {
    const firstBuiltin = matches.findIndex((m) => m.command.builtin);
    body = (
      <ul className="menu-list" role="listbox" id={listId} aria-label="Skills and commands">
        {matches.map((match, index) => {
          const { command } = match;
          const kind = commandKind(command);
          const active = index === activeIndex;
          return (
            <li key={command.name} role="presentation">
              {index === firstBuiltin ? <div className="menu-heading">Built-in</div> : null}
              <div
                id={optionId(listId, index)}
                ref={active ? (activeRef as never) : undefined}
                role="option"
                aria-selected={active}
                className={`menu-item${active ? " is-active" : ""}`}
                onMouseEnter={() => onHover(index)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the message box
                  onPick(index);
                }}
              >
                <span className={`kind-icon kind-${kind}`} title={KIND_LABEL[kind]} aria-label={KIND_LABEL[kind]}>
                  {KIND_ICON[kind]}
                </span>
                <span className="menu-main">
                  <span className="menu-name">
                    <span className="menu-command">
                      /
                      {match.field === "name" ? (
                        <Highlight text={command.name} start={match.start} length={match.length} />
                      ) : (
                        command.name
                      )}
                    </span>
                    {command.argumentHint ? <span className="menu-hint">{command.argumentHint}</span> : null}
                    {match.field === "alias" && match.alias ? (
                      <span className="menu-alias">
                        also /<Highlight text={match.alias} start={match.start} length={match.length} />
                      </span>
                    ) : null}
                  </span>
                  <span className="menu-desc">{command.description}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return <div className={`slash-menu popover-anim${visible && open ? " is-open" : ""}`}>{body}</div>;
}

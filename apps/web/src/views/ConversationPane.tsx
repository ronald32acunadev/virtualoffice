import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError } from "../api/client";
import type { Species } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { SPECIES_EMOJI, SPECIES_LIST, speciesLabel } from "../state/species";
import { composerKeyAction, isFolderMissing } from "../state/sidebar";
import { buildTimeline } from "../state/timeline";
import { ApprovalCard } from "../ui/ApprovalCard";
import { toFormError } from "../ui/errors";
import { TextBubble, ToolRow } from "./ToolRow";

const STOPPABLE = new Set(["starting", "working", "waiting_approval"]);
const FOLDER_MISSING_TEXT =
  "This session's project folder no longer exists, so it can't be resumed. You can still read its history.";

function Header({ employeeId }: { employeeId: string }) {
  const { state, actions } = useOffice();
  const employee = state.employees.find((e) => e.id === employeeId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!employee) return null;

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(toFormError(err).message);
    }
  };
  const saveName = () =>
    run(async () => {
      await actions.updateEmployee(employee.id, { name: draft });
      setEditing(false);
    });

  return (
    <header className="conv-head">
      <div className="conv-title">
        <span className="avatar avatar-lg">{SPECIES_EMOJI[employee.species]}</span>
        {editing ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <input
              type="text"
              autoFocus
              value={draft}
              aria-label="Employee name"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <h1>{employee.name}</h1>
            <button
              type="button"
              className="link"
              onClick={() => {
                setDraft(employee.name);
                setError(null);
                setEditing(true);
              }}
            >
              Rename
            </button>
          </>
        )}
        <span className={`status status-${employee.status}`}>{employee.status.replace("_", " ")}</span>
        <select
          aria-label="Species"
          value={employee.species}
          onChange={(e) => void run(() => actions.updateEmployee(employee.id, { species: e.target.value as Species }))}
        >
          {SPECIES_LIST.map((s) => (
            <option key={s} value={s}>
              {speciesLabel(s)}
            </option>
          ))}
        </select>
        {STOPPABLE.has(employee.status) ? (
          <button type="button" className="danger" onClick={() => void run(() => actions.stopEmployee(employee.id))}>
            Stop
          </button>
        ) : null}
      </div>
      <div className="conv-sub">
        <span className="mono" title={employee.workingDirectory}>
          {employee.workingDirectory}
        </span>
        <span className="muted"> · {employee.task}</span>
      </div>
      {employee.failureReason ? <p className="field-error">{employee.failureReason}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </header>
  );
}

function Composer({ employeeId }: { employeeId: string }) {
  const { state, actions } = useOffice();
  const employee = state.employees.find((e) => e.id === employeeId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [missingFolder, setMissingFolder] = useState(false);
  if (!employee) return null;
  const disabled = missingFolder || isFolderMissing(employee);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await actions.sendMessage(employeeId, trimmed);
      setText("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "working_directory_missing") setMissingFolder(true);
      else setError(toFormError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = composerKeyAction(
      { key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing },
      text,
    );
    if (action === "send") {
      event.preventDefault();
      void send();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); // Empty text is never sent and never adds a newline.
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void send();
      }}
    >
      {disabled ? <p className="field-error">{FOLDER_MISSING_TEXT}</p> : null}
      <div className="composer-row">
        <textarea
          rows={2}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Messaging is unavailable" : "Message this employee (Enter to send, Shift+Enter for a new line)"}
        />
        <button type="submit" disabled={disabled || busy || text.trim() === ""}>
          Send
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </form>
  );
}

export function ConversationPane({ employeeId }: { employeeId: string }) {
  const { state, actions } = useOffice();
  const messages = state.messages[employeeId];
  const live = state.liveText[employeeId] ?? "";
  const timeline = useMemo(() => buildTimeline(messages ?? []), [messages]);
  const approvals = state.approvals.filter((a) => a.employeeId === employeeId);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [timeline.length, live]);

  return (
    <section className="conversation-pane">
      <Header employeeId={employeeId} />
      <div className="conv-scroll">
        {approvals.length > 0 ? (
          <ul className="approval-list conv-approvals">
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                employee={state.employees.find((e) => e.id === approval.employeeId)}
                onSelectEmployee={actions.select}
                onDecide={actions.decide}
              />
            ))}
          </ul>
        ) : null}
        {timeline.length === 0 && !live ? <p className="muted">No messages yet.</p> : null}
        {timeline.map((item) =>
          item.message.kind === "tool_call" || item.message.kind === "tool_result" ? (
            <ToolRow key={item.message.id} item={item} />
          ) : (
            <TextBubble key={item.message.id} item={item} />
          ),
        )}
        {live ? (
          <div className="bubble bubble-agent markdown bubble-live">
            <Markdown remarkPlugins={[remarkGfm]}>{live}</Markdown>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <Composer key={employeeId} employeeId={employeeId} />
    </section>
  );
}

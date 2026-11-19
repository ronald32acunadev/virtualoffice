import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOffice } from "../state/OfficeProvider";
import { groupConversation } from "../state/conversation";
import { toFormError } from "./errors";
import { MessageItem } from "./MessageItem";

const STOPPABLE = new Set(["starting", "working", "waiting_approval"]);

export function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const { state, actions } = useOffice();
  const employee = state.employees.find((e) => e.id === employeeId);
  const messages = state.messages[employeeId] ?? [];
  const live = state.liveText[employeeId] ?? "";
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, live]);

  if (!employee) return null;
  const nodes = groupConversation(messages);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await actions.sendMessage(employeeId, trimmed);
      setText("");
    } catch (err) {
      setError(toFormError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setError(null);
    try {
      await actions.stopEmployee(employeeId);
    } catch (err) {
      setError(toFormError(err).message);
    }
  };

  return (
    <section className="card detail">
      <header className="detail-head">
        <h2>{employee.task}</h2>
        <button type="button" className="link" onClick={() => actions.select(null)}>
          Close
        </button>
      </header>
      <dl className="meta">
        <dt>Status</dt>
        <dd>
          <span className={`status status-${employee.status}`}>{employee.status.replace("_", " ")}</span>
        </dd>
        <dt>Directory</dt>
        <dd className="mono">{employee.workingDirectory}</dd>
        {employee.failureReason ? (
          <>
            <dt>Failure</dt>
            <dd className="field-error">{employee.failureReason}</dd>
          </>
        ) : null}
      </dl>
      {STOPPABLE.has(employee.status) ? (
        <button type="button" className="danger" onClick={() => void stop()}>
          Stop
        </button>
      ) : null}
      <div className="conversation">
        {nodes.length === 0 && !live ? <p className="muted">No messages yet.</p> : null}
        {nodes.map(({ message, children }) => (
          <div key={message.id} className="msg-group">
            <MessageItem message={message} />
            {children.length > 0 ? (
              <div className="msg-children">
                {children.map((child) => (
                  <MessageItem key={child.id} message={child} nested />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {live ? (
          <div className="msg msg-agent_text msg-live">
            <span className="msg-who">Agent (typing)</span>
            <p>{live}</p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => void send(e)}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message this employee" />
        <button type="submit" disabled={busy || text.trim() === ""}>
          Send
        </button>
      </form>
      {error ? <p className="field-error">{error}</p> : null}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ClaudeSessionSummary } from "../api/types";
import { formatImportResult, type ImportSummary } from "../state/importSummary";
import { useOffice } from "../state/OfficeProvider";
import { formatRelativeTime } from "../state/sidebar";
import { toFormError } from "../ui/errors";
import { Modal } from "./Modal";

const PAGE_SIZE = 30;
const DEBOUNCE_MS = 300;

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { actions } = useOffice();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sessions, setSessions] = useState<ClaudeSessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const titles = useRef<Record<string, string>>({});
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = async (q: string, offset: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await api.listClaudeSessions({ q, limit: PAGE_SIZE, offset });
      if (id !== requestId.current) return;
      for (const s of page.sessions) titles.current[s.sessionId] = s.title;
      setSessions((current) => (offset === 0 ? page.sessions : [...current, ...page.sessions]));
      setTotal(page.total);
    } catch (err) {
      if (id === requestId.current) setError(toFormError(err).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load(debounced, 0);
  }, [debounced]);

  const toggle = (sessionId: string) =>
    setSelected((current) =>
      current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId],
    );

  const runImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const result = await actions.importSessions(selected);
      setSummary(formatImportResult(result, titles.current));
      setSelected([]);
    } catch (err) {
      setError(toFormError(err).message);
    } finally {
      setImporting(false);
    }
  };

  if (summary) {
    return (
      <Modal title="Import from Claude" onClose={onClose}>
        <div className="modal-body">
          <p>
            <strong>{summary.headline}</strong>
          </p>
          {summary.imported.length > 0 ? (
            <>
              <h3>Joined the office</h3>
              <ul>
                {summary.imported.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
          {summary.skipped.length > 0 ? (
            <>
              <h3>Skipped</h3>
              <ul>
                {summary.skipped.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="actions">
            <button type="button" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Import from Claude" onClose={onClose}>
      <div className="modal-body">
        <p className="warning">Close a session in the terminal before resuming it here.</p>
        <input
          type="text"
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or folder"
          aria-label="Search sessions"
        />
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <label className={`session-row${s.alreadyImported ? " session-disabled" : ""}`}>
                <input
                  type="checkbox"
                  disabled={s.alreadyImported}
                  checked={selected.includes(s.sessionId)}
                  onChange={() => toggle(s.sessionId)}
                />
                <span className="session-text">
                  <strong title={s.title}>{s.title}</strong>
                  <small className="mono">{s.cwd ?? "No folder recorded"}</small>
                  <small>
                    {s.gitBranch ? `${s.gitBranch} · ` : ""}
                    {formatRelativeTime(s.lastModified)}
                    {s.alreadyImported ? " · Already in the office" : ""}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {!loading && sessions.length === 0 && !error ? <p className="muted">No sessions found.</p> : null}
        {loading ? <p className="muted">Loading...</p> : null}
        {error ? <p className="field-error">{error}</p> : null}
        <div className="actions">
          {sessions.length < total ? (
            <button type="button" className="secondary" disabled={loading} onClick={() => void load(debounced, sessions.length)}>
              Load more
            </button>
          ) : null}
          <button type="button" disabled={selected.length === 0 || importing} onClick={() => void runImport()}>
            {importing ? "Importing..." : `Import ${selected.length}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

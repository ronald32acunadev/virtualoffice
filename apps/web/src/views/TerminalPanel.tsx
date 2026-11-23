import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getToken } from "../api/client";
import { getTerminalTheme } from "../state/officeMood";
import type { LightingMood } from "../scene/officeTheme";
import {
  buildTerminalUrl,
  createResizeScheduler,
  createTerminalConnection,
  formatTerminalEnd,
  terminalGate,
  type TerminalConnection,
  type TerminalSocket,
  type TerminalConnectionHandlers,
  type TerminalServerMessage,
} from "../state/terminalChannel";

type Status = "connecting" | "open" | "ended";
/** Embedded xterm.js terminal attached to the employee's agent CLI over /ws/terminal. */
export function TerminalPanel({ employeeId, busy, mood }: { employeeId: string; busy: boolean; mood: LightingMood }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [endText, setEndText] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [armed, setArmed] = useState(!busy);
  const gate = terminalGate(busy, armed);
  const canConnect = gate === "connect";
  const hostRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<TerminalConnection | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const moodRef = useRef<LightingMood>(mood);
  moodRef.current = mood;

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTerminalTheme(mood);
    }
  }, [mood]);

  useEffect(() => {
    if (!canConnect) return;
    const host = hostRef.current;
    if (host == null) return;

    setStatus("connecting");
    setEndText(null);

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      scrollback: 5000,
      theme: getTerminalTheme(moodRef.current),
    });
    termRef.current = term;

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const socket = new WebSocket(
      buildTerminalUrl(
        window.location,
        getToken(),
        employeeId,
        { cols: term.cols, rows: term.rows }
      )
    );

    const handlers: TerminalConnectionHandlers = {
      onOpen: () => {
        setStatus("open");
        term.focus();
      },
      onMessage: (message: TerminalServerMessage) => {
        if (message.type === "output") {
          term.write(message.data);
        } else if (message.type === "exit" || message.type === "error") {
          setEndText(formatTerminalEnd(message));
          setStatus("ended");
        }
      },
      onClose: () => {
        setEndText((current) => current ?? "Connection closed");
        setStatus("ended");
      },
    };

    const connection = createTerminalConnection(socket as unknown as TerminalSocket, handlers);
    connectionRef.current = connection;

    const inputSubscription = term.onData((data) => {
      connection.sendInput(data);
    });

    const resizer = createResizeScheduler(
      (cols, rows) => connection.sendResize(cols, rows),
      {
        request: (cb) => window.requestAnimationFrame(cb),
        cancel: (handle) => window.cancelAnimationFrame(handle),
      }
    );

    const observer = new ResizeObserver(() => {
      fit.fit();
      resizer.request(term.cols, term.rows);
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      resizer.dispose();
      inputSubscription.dispose();
      connection.close();
      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
      term.dispose();
      if (termRef.current === term) {
        termRef.current = null;
      }
    };
  }, [employeeId, generation, canConnect]);

  const endSession = () => {
    if (window.confirm("End this terminal session? The agent CLI will be closed.")) {
      connectionRef.current?.kill();
    }
  };

  if (!canConnect) {
    return (
      <div className="terminal-panel">
        <div className="terminal-gate muted" style={{ padding: 16 }}>
          {gate === "offer" ? (
            <>
              <p>A turn is in progress. The terminal opens when this employee is idle.</p>
              <button type="button" className="secondary" onClick={() => setArmed(true)}>
                Open when idle
              </button>
            </>
          ) : (
            <p>Waiting for the turn to finish…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-toolbar">
        <span
          className={`terminal-status terminal-status-${status}`}
        >
          {status === "connecting"
            ? "Connecting…"
            : status === "open"
              ? "Connected"
              : endText ?? "Session ended"}
        </span>
        {status === "open" ? (
          <button type="button" className="danger" onClick={endSession}>
            End session
          </button>
        ) : null}
        {status === "ended" ? (
          <button
            type="button"
            className="secondary"
            onClick={() => setGeneration((g) => g + 1)}
          >
            Restart
          </button>
        ) : null}
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}

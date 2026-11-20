import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import RFB from "@novnc/novnc";
import { ApiError, api, getToken } from "../api/client";
import type { BossId } from "../api/types";
import { buildDesktopUrl, describeAppError, embeddedAppFor, startingText } from "../state/desktopApp";
import { isCurrentEmployee } from "../state/launchMenu";
import { toFormError } from "../ui/errors";

type Phase =
  | { name: "checking" }
  | { name: "stopped" }
  | { name: "starting" }
  | { name: "running" }
  | { name: "error"; message: string };

type StreamState = "connecting" | "connected" | "disconnected";

type Props = { employeeId: string; bossId: BossId };

function errorText(err: unknown, label: string): string {
  return err instanceof ApiError ? describeAppError(err.code, err.message, label) : toFormError(err).message;
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard access can be denied; copying out of the app is best effort.
  }
}

async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** The "App" tab: the boss's embedded desktop app, streamed over noVNC. */
export function AppPanel({ employeeId, bossId }: Props) {
  const { appId, label } = embeddedAppFor(bossId);
  const [phase, setPhase] = useState<Phase>({ name: "checking" });
  const [stream, setStream] = useState<StreamState>("connecting");
  const [streamKey, setStreamKey] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const activeEmployeeRef = useRef(employeeId);

  activeEmployeeRef.current = employeeId;

  const isCurrent = (requestEmployeeId: string) => isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current);

  const start = useCallback(
    (requestEmployeeId: string) => {
      setPhase({ name: "starting" });
      api
        .startApp(requestEmployeeId)
        .then((res) => {
          if (!isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) return;
          setStreamKey((key) => key + 1);
          setPhase({ name: "running" });
        })
        .catch((err: unknown) => {
          if (!isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) return;
          setPhase({ name: "error", message: errorText(err, label) });
        });
    },
    [label],
  );

  // Checks the app on mount and whenever the employee changes. A running app is started again only to
  // reuse its display; the start call never spawns a second one.
  useEffect(() => {
    const requestEmployeeId = employeeId;
    setPhase({ name: "checking" });
    setStream("connecting");
    api
      .getApp(requestEmployeeId)
      .then((res) => {
        if (!isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) return;
        if (res.app.running) start(requestEmployeeId);
        else setPhase({ name: "stopped" });
      })
      .catch((err: unknown) => {
        if (!isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) return;
        setPhase({ name: "error", message: errorText(err, label) });
      });
  }, [employeeId, label, start]);

  const running = phase.name === "running";

  // The noVNC stream exists only while a desktop app runs. Leaving the tab or switching employee closes the stream, never the app.
  useEffect(() => {
    if (!running) return;
    const host = hostRef.current;
    if (host === null) return;

    const rfb = new RFB(host, buildDesktopUrl(window.location, getToken(), appId));
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "#171717";
    const onConnect = () => setStream("connected");
    const onDisconnect = () => setStream("disconnected");
    const onClipboard = (event: Event) => {
      void writeClipboard((event as CustomEvent<{ text: string }>).detail.text);
    };
    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);
    rfb.addEventListener("clipboard", onClipboard);
    rfbRef.current = rfb;
    setStream("connecting");

    return () => {
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      rfb.removeEventListener("clipboard", onClipboard);
      rfb.disconnect();
      if (rfbRef.current === rfb) rfbRef.current = null;
    };
  }, [appId, running, streamKey]);

  const stopApp = () => {
    const requestEmployeeId = employeeId;
    api
      .stopApp(requestEmployeeId)
      .then(() => {
        if (isCurrent(requestEmployeeId)) setPhase({ name: "stopped" });
      })
      .catch((err: unknown) => {
        if (isCurrent(requestEmployeeId)) setPhase({ name: "error", message: errorText(err, label) });
      });
  };

  const restartApp = () => {
    const requestEmployeeId = employeeId;
    api
      .relaunchApp(requestEmployeeId)
      .then((res) => {
        if (!isCurrent(requestEmployeeId)) return;
        if (res.relaunched) setStreamKey((key) => key + 1);
        else setPhase({ name: "stopped" });
      })
      .catch((err: unknown) => {
        if (isCurrent(requestEmployeeId)) setPhase({ name: "error", message: errorText(err, label) });
      });
  };

  const pasteIntoApp = () => {
    void readClipboard().then((text) => {
      if (text !== null) rfbRef.current?.clipboardPasteFrom(text);
    });
  };

  const statusText = (): string => {
    switch (phase.name) {
      case "checking":
        return "Checking…";
      case "stopped":
        return "Stopped";
      case "starting":
        return "Starting…";
      case "error":
        return "Error";
      case "running":
        if (stream === "connected") return "Connected";
        return stream === "connecting" ? "Connecting…" : "Stream disconnected";
    }
  };

  let body: ReactNode;
  if (phase.name === "checking") {
    body = <p className="app-message">Checking…</p>;
  } else if (phase.name === "stopped") {
    body = (
      <div className="app-message">
        <p>{label} is not running.</p>
        <button type="button" onClick={() => start(employeeId)}>
          Start app
        </button>
      </div>
    );
  } else if (phase.name === "starting") {
    body = <p className="app-message">{startingText(label)}</p>;
  } else if (phase.name === "error") {
    body = (
      <div className="app-message">
        <p className="field-error">{phase.message}</p>
        <button type="button" onClick={() => start(employeeId)}>
          Retry
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {stream === "disconnected" ? (
          <div className="app-message" role="alert">
            <p>Stream disconnected</p>
            <button type="button" onClick={() => setStreamKey((key) => key + 1)}>
              Reconnect
            </button>{" "}
            <button type="button" className="secondary" onClick={restartApp}>
              Restart app
            </button>
          </div>
        ) : null}
        <div className="app-host" ref={hostRef} />
      </>
    );
  }

  return (
    <div className="app-panel">
      <div className="app-toolbar">
        <span className="app-label">{label}</span>
        <span className="app-status">{statusText()}</span>
        {running ? (
          <button type="button" className="secondary" onClick={pasteIntoApp}>
            Paste into app
          </button>
        ) : null}
        {running ? (
          <button type="button" className="danger" onClick={stopApp}>
            Stop app
          </button>
        ) : null}
      </div>
      {body}
    </div>
  );
}

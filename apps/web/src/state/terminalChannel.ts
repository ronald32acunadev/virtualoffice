export type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; code: string; message: string };
export type TerminalSize = { cols: number; rows: number };
export type TerminalLocation = { protocol: string; host: string };

/** `ws(s)://<host>/ws/terminal/<encodeURIComponent(employeeId)>?token=<encodeURIComponent(token ?? "")>&cols=<cols>&rows=<rows>`; `wss` only when protocol is "https:". */
export function buildTerminalUrl(location: TerminalLocation, token: string | null, employeeId: string, size: TerminalSize): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/terminal/${encodeURIComponent(employeeId)}?token=${encodeURIComponent(token ?? "")}&cols=${size.cols}&rows=${size.rows}`;
}

/** Parses one server frame; null for invalid JSON or any shape other than the three above (output.data string, exit.code number, error.code and error.message strings). */
export function parseServerMessage(raw: string): TerminalServerMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { type, data, code, message } = parsed;
    if (type === "output" && typeof data === "string") return { type, data };
    if (type === "exit" && typeof code === "number") return { type, code };
    if (type === "error" && typeof code === "string" && typeof message === "string") return { type, code, message };
    return null;
  } catch {
    return null;
  }
}

export type TerminalGate = "connect" | "offer" | "wait";
/** Decides whether the panel may connect: busy employees get an "Open when idle" offer, then wait once armed. */
export function terminalGate(busy: boolean, armed: boolean): TerminalGate {
  if (!busy) return armed ? "connect" : "offer";
  return armed ? "wait" : "offer";
}

/** Short status line for an ended session: exit → `Session ended (exit code ${code})`; error → the error's `message`. */
export function formatTerminalEnd(message: Extract<TerminalServerMessage, { type: "exit" | "error" }>): string {
  if (message.type === "exit") return `Session ended (exit code ${message.code})`;
  return message.message;
}

/** The subset of the browser WebSocket used here, so tests can pass a fake. */
export type TerminalSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};
export type TerminalConnectionHandlers = {
  onOpen: () => void;
  onMessage: (message: TerminalServerMessage) => void;
  onClose: () => void;
};
export type TerminalConnection = {
  sendInput(data: string): void;
  sendResize(cols: number, rows: number): void;
  kill(): void;
  close(): void;
};
/** Wires a socket: sends only while readyState === 1 and not closed by us; onmessage parses `String(event.data)` and forwards non-null messages; onclose calls handlers.onClose() unless closed by us; onerror calls socket.close(). */
export function createTerminalConnection(socket: TerminalSocket, handlers: TerminalConnectionHandlers): TerminalConnection {
  let closedByUs = false;
  const onopen = () => {
    if (closedByUs) return;
    handlers.onOpen();
  };
  const onmessage = (event: { data: unknown }) => {
    if (closedByUs) return;
    const raw = String(event.data);
    const msg = parseServerMessage(raw);
    if (msg !== null) handlers.onMessage(msg);
  };
  const onclose = () => {
    if (closedByUs) return;
    handlers.onClose();
  };
  const onerror = () => {
    if (closedByUs) return;
    socket.close();
  };
  socket.onopen = onopen;
  socket.onmessage = onmessage;
  socket.onclose = onclose;
  socket.onerror = onerror;
  return {
    sendInput(data: string): void {
      if (closedByUs || socket.readyState !== 1) return;
      socket.send(JSON.stringify({ type: "input", data }));
    },
    sendResize(cols: number, rows: number): void {
      if (closedByUs || socket.readyState !== 1) return;
      socket.send(JSON.stringify({ type: "resize", cols, rows }));
    },
    kill(): void {
      if (closedByUs || socket.readyState !== 1) return;
      socket.send(JSON.stringify({ type: "kill" }));
    },
    close(): void {
      closedByUs = true;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    },
  };
}
export type FrameScheduler = { request(callback: () => void): number; cancel(handle: number): void };
export type ResizeScheduler = { request(cols: number, rows: number): void; dispose(): void };
/** Coalesces resize requests into at most one `send` per animation frame with the latest size; skips sending when the size equals the last size sent; dispose cancels a pending frame and ignores later requests. */
export function createResizeScheduler(send: (cols: number, rows: number) => void, frames: FrameScheduler): ResizeScheduler {
  let pending: { cols: number; rows: number } | null = null;
  let handle: number | null = null;
  let lastSent: { cols: number; rows: number } | null = null;
  let disposed = false;
  const flush = (): void => {
    handle = null;
    if (pending === null) return;
    if (lastSent !== null && lastSent.cols === pending.cols && lastSent.rows === pending.rows) {
      pending = null;
      return;
    }
    lastSent = { cols: pending.cols, rows: pending.rows };
    send(pending.cols, pending.rows);
    pending = null;
  };
  const request = (cols: number, rows: number): void => {
    if (disposed) return;
    pending = { cols, rows };
    if (handle === null) {
      handle = frames.request(flush);
    }
  };
  const dispose = (): void => {
    disposed = true;
    if (handle !== null) {
      frames.cancel(handle);
      handle = null;
    }
    pending = null;
  };
  return { request, dispose };
}

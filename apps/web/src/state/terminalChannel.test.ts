import { describe, expect, it } from "vitest";
import type {
  FrameScheduler,
  TerminalConnectionHandlers,
  TerminalServerMessage,
  TerminalSocket,
} from "./terminalChannel";

import {
  buildTerminalUrl,
  createResizeScheduler,
  createTerminalConnection,
  formatTerminalEnd,
  parseServerMessage,
} from "./terminalChannel";

class FakeSocket implements TerminalSocket {
  readyState = 0;
  sent: string[] = [];
  closeCalls = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(data: string): void {
    this.onmessage?.({ data });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function makeHandlers() {
  const opened = { count: 0 };
  const closes = { count: 0 };
  const messages: TerminalServerMessage[] = [];
  const handlers: TerminalConnectionHandlers = {
    onOpen: () => {
      opened.count += 1;
    },
    onMessage: (msg) => {
      messages.push(msg);
    },
    onClose: () => {
      closes.count += 1;
    },
  };
  return { handlers, opened, messages, closes };
}

class FakeFrames implements FrameScheduler {
  private callbacks = new Map<number, () => void>();
  private id = 0;

  request(callback: () => void): number {
    const handle = this.id++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  flush(): void {
    for (const callback of this.callbacks.values()) {
      callback();
    }
    this.callbacks.clear();
  }

  get pending(): number {
    return this.callbacks.size;
  }
}

describe("terminalChannel", () => {
  it("US-03 / AC-01: builds the terminal socket URL", () => {
    const url = buildTerminalUrl(
      { protocol: "http:", host: "127.0.0.1:4317" },
      "tok en",
      "emp/1",
      { cols: 120, rows: 40 },
    );
    expect(url).toBe(
      "ws://127.0.0.1:4317/ws/terminal/emp%2F1?token=tok%20en&cols=120&rows=40",
    );
  });

  it("US-03 / AC-01: parses server frames", () => {
    expect(parseServerMessage('{"type":"output","data":"hi"}')).toEqual({
      type: "output",
      data: "hi",
    });
    expect(parseServerMessage('{"type":"exit","code":2}')).toEqual({
      type: "exit",
      code: 2,
    });
    expect(
      parseServerMessage(
        '{"type":"error","code":"not_found","message":"Employee not found"}',
      ),
    ).toEqual({
      type: "error",
      code: "not_found",
      message: "Employee not found",
    });
    expect(parseServerMessage("nope")).toBeNull();
    expect(parseServerMessage('{"type":"output","data":5}')).toBeNull();
    expect(parseServerMessage('{"type":"exit"}')).toBeNull();
    expect(parseServerMessage('{"type":"zap"}')).toBeNull();
    expect(parseServerMessage("null")).toBeNull();
  });

  it("US-03 / AC-04: formats the end of a session", () => {
    const text = formatTerminalEnd({ type: "exit", code: 0 });
    expect(text).toBe("Session ended (exit code 0)");
    const text2 = formatTerminalEnd({
      type: "error",
      code: "not_found",
      message: "Employee not found",
    });
    expect(text2).toBe("Employee not found");
  });

  it("US-03 / AC-02: sends input, resize and kill only while open", () => {
    const socket = new FakeSocket();
    const { handlers, opened } = makeHandlers();
    createTerminalConnection(socket, handlers);

    expect(socket.sent).toEqual([]);

    socket.open();
    expect(opened.count).toBe(1);

    createTerminalConnection(socket, handlers).sendInput("ls\r");
    createTerminalConnection(socket, handlers).sendResize(100, 30);
    createTerminalConnection(socket, handlers).kill();

    expect(socket.sent).toEqual([
      '{"type":"input","data":"ls\\r"}',
      '{"type":"resize","cols":100,"rows":30}',
      '{"type":"kill"}',
    ]);
  });

  it("US-03 / AC-01: forwards parsed frames and ignores malformed ones", () => {
    const socket = new FakeSocket();
    const { handlers, messages } = makeHandlers();
    createTerminalConnection(socket, handlers);

    socket.open();
    socket.receive('{"type":"output","data":"x"}');
    socket.receive("garbage");
    socket.receive('{"type":"exit","code":1}');

    expect(messages).toEqual([
      { type: "output", data: "x" },
      { type: "exit", code: 1 },
    ]);
  });

  it("US-03 / AC-03: close detaches handlers so nothing reaches the old PTY", () => {
    const socket = new FakeSocket();
    const { handlers, closes } = makeHandlers();
    createTerminalConnection(socket, handlers);

    const connection = createTerminalConnection(socket, handlers);
    socket.open();
    connection.close();

    expect(socket.closeCalls).toBe(1);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();

    connection.sendInput("x");
    expect(socket.sent).toEqual([]);

    expect(closes.count).toBe(0);
  });

  it("US-03 / AC-04: a server-side close is reported", () => {
    const socket = new FakeSocket();
    const { handlers, closes } = makeHandlers();
    createTerminalConnection(socket, handlers);

    socket.open();
    socket.drop();

    expect(closes.count).toBe(1);

    const fresh = new FakeSocket();
    const { handlers: freshHandlers } = makeHandlers();
    createTerminalConnection(fresh, freshHandlers);
    fresh.onerror?.();
    expect(fresh.closeCalls).toBe(1);
  });

  it("US-03 / AC-02: coalesces resizes to one send per frame", () => {
    const sent: Array<[number, number]> = [];
    const frames = new FakeFrames();
    const scheduler = createResizeScheduler(
      (cols, rows) => sent.push([cols, rows]),
      frames,
    );

    scheduler.request(100, 30);
    scheduler.request(110, 31);

    expect(frames.pending).toBe(1);
    expect(sent).toEqual([]);

    frames.flush();

    expect(sent).toEqual([[110, 31]]);

    scheduler.request(110, 31);
    frames.flush();

    expect(sent).toEqual([[110, 31]]);

    scheduler.request(90, 20);
    scheduler.dispose();
    frames.flush();

    expect(sent).toEqual([[110, 31]]);
    expect(frames.pending).toBe(0);

    scheduler.request(50, 10);

    expect(frames.pending).toBe(0);
  });
});

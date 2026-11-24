import type {
  Agent,
  ApprovalRequest,
  AttachmentUpload,
  Catalog,
  BossId,
  Decision,
  Employee,
  MediaPlaybackState,
  MediaPreset,
  MediaProvider,
  Message,
  ServerEvent,
  Species,
  StateSnapshot,
  SyncSummary,
} from "./types";

const TOKEN_KEY = "virtualoffice.token";

function readToken(): string | null {
  let token: string | null = null;
  try {
    token = new URLSearchParams(location.search).get("token");
  } catch {
    token = null;
  }
  if (token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // sessionStorage may be unavailable; the in-memory token still works.
    }
    return token;
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Read once at module load and kept in memory.
const token: string | null = readToken();

export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token ?? ""}` };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) {
    const err = (parsed as { error?: { code?: string; message?: string; field?: string } } | null)
      ?.error;
    throw new ApiError(
      response.status,
      err?.code ?? "http_error",
      err?.message ?? `Request failed (${response.status})`,
      err?.field,
    );
  }
  return parsed as T;
}

export const api = {
  getState: () => request<StateSnapshot>("GET", "/api/state"),
  syncProviders: () => request<SyncSummary>("POST", "/api/sync"),
  listAgents: () => request<{ agents: Agent[] }>("GET", "/api/agents"),
  createAgent: (input: {
    bossId: BossId;
    name?: string;
    species?: Species;
    role?: string | null;
    jobTitle?: string | null;
  }) => request<{ agent: Agent }>("POST", "/api/agents", input),
  updateAgent: (
    agentId: string,
    patch: { name?: string; species?: Species; role?: string | null; jobTitle?: string | null },
  ) => request<{ agent: Agent }>("PATCH", `/api/agents/${encodeURIComponent(agentId)}`, patch),
  deleteAgent: (agentId: string) =>
    request<{ deleted: boolean }>("DELETE", `/api/agents/${encodeURIComponent(agentId)}`),
  getMessages: (employeeId: string) =>
    request<{ messages: Message[] }>("GET", `/api/employees/${encodeURIComponent(employeeId)}/messages`),
  createEmployee: (input: {
    bossId: BossId;
    agentId?: string;
    task: string;
    workingDirectory: string;
    name?: string;
    species?: Species;
    role?: string;
    jobTitle?: string;
  }) => request<{ employee: Employee }>("POST", "/api/employees", input),
  getGlobalCatalog: (refresh = false) =>
    request<{ catalog: Catalog }>("GET", `/api/catalog?scope=global${refresh ? "&refresh=true" : ""}`),
  getFolderCatalog: (workingDirectory: string, refresh = false) => {
    const query = new URLSearchParams({ workingDirectory });
    if (refresh) query.set("refresh", "true");
    return request<{ catalog: Catalog }>("GET", `/api/catalog?${query.toString()}`);
  },
  getEmployeeCatalog: (employeeId: string, refresh = false) =>
    request<{ catalog: Catalog }>(
      "GET",
      `/api/employees/${encodeURIComponent(employeeId)}/catalog${refresh ? "?refresh=true" : ""}`,
    ),
  updateEmployee: (employeeId: string, patch: { name?: string; species?: Species; jobTitle?: string | null }) =>
    request<{ employee: Employee }>("PATCH", `/api/employees/${encodeURIComponent(employeeId)}`, patch),
  sendMessage: (employeeId: string, text: string, attachments?: AttachmentUpload[]) =>
    request<{ message: Message }>("POST", `/api/employees/${encodeURIComponent(employeeId)}/messages`, {
      text,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    }),
  stopEmployee: (employeeId: string) =>
    request<{ employee: Employee }>("POST", `/api/employees/${encodeURIComponent(employeeId)}/stop`),
  deleteEmployee: (employeeId: string) => request<{ deleted: boolean; providerDeleted: boolean }>("DELETE", `/api/employees/${encodeURIComponent(employeeId)}`),
  resumeBoss: (bossId: BossId) =>
    request<{ boss: import("./types").Boss }>("POST", `/api/bosses/${encodeURIComponent(bossId)}/resume`),
  decide: (approvalId: string, decision: Decision, answers?: Record<string, string>) =>
    request<{ approval: ApprovalRequest }>(
      "POST",
      `/api/approvals/${encodeURIComponent(approvalId)}/decision`,
      answers ? { decision, answers } : { decision },
    ),

  getMedia: () =>
    request<{ media: MediaPlaybackState | null; presets: MediaPreset[] }>("GET", "/api/media"),

  setMediaPlayback: (input: { url: string; provider?: MediaProvider; title?: string }) =>
    request<{ media: MediaPlaybackState }>("PUT", "/api/media/playback", input),

  clearMediaPlayback: () =>
    request<{ media: null }>("DELETE", "/api/media/playback"),

  addMediaPreset: (input: { url: string; provider?: MediaProvider; title?: string }) =>
    request<{ preset: MediaPreset; presets: MediaPreset[] }>("POST", "/api/media/presets", input),

  deleteMediaPreset: (id: string) =>
    request<{ deleted: boolean; presets: MediaPreset[] }>("DELETE", `/api/media/presets/${encodeURIComponent(id)}`),

};

export type SocketHandlers = {
  onOpen: () => void;
  onClose: () => void;
  onEvent: (event: ServerEvent) => void;
};

const MAX_BACKOFF_MS = 15_000;

export function backoffDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
}

/** Opens the event socket and reconnects with exponential backoff. Returns a disposer. */
export function openEventSocket(handlers: SocketHandlers): () => void {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url = `${scheme}://${location.host}/ws?token=${encodeURIComponent(token ?? "")}`;
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      handlers.onOpen();
    };
    ws.onmessage = (frame) => {
      try {
        handlers.onEvent(JSON.parse(String(frame.data)) as ServerEvent);
      } catch {
        // Ignore malformed frames.
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (disposed) return;
      handlers.onClose();
      timer = setTimeout(connect, backoffDelay(attempt));
      attempt += 1;
    };
    ws.onerror = () => ws.close();
  };

  connect();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}

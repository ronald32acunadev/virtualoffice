import type {
  ApprovalRequest,
  Boss,
  Employee,
  Message,
  ServerEvent,
  StateSnapshot,
} from "../api/types";

export type ConnectionState = "connecting" | "online" | "offline";

export type OfficeState = {
  bosses: Boss[];
  employees: Employee[];
  /** Pending approvals only. */
  approvals: ApprovalRequest[];
  messages: Record<string, Message[]>;
  /** Live streaming text per employee, not persisted. */
  liveText: Record<string, string>;
  selectedId: string | null;
  connection: ConnectionState;
  loaded: boolean;
};

export type OfficeAction =
  | { type: "state_loaded"; snapshot: StateSnapshot }
  | { type: "messages_loaded"; employeeId: string; messages: Message[] }
  | { type: "server_event"; event: ServerEvent }
  | { type: "select"; employeeId: string | null }
  | { type: "connection"; connection: ConnectionState };

export const initialOfficeState: OfficeState = {
  bosses: [],
  employees: [],
  approvals: [],
  messages: {},
  liveText: {},
  selectedId: null,
  connection: "connecting",
  loaded: false,
};

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

/** Merges two message lists, deduplicating by id. Existing order wins; new ids are appended. */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const seen = new Set<string>();
  const result: Message[] = [];
  for (const message of [...incoming, ...existing]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    result.push(message);
  }
  return result.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function applyEvent(state: OfficeState, event: ServerEvent): OfficeState {
  switch (event.type) {
    case "boss_updated":
      return { ...state, bosses: upsertById(state.bosses, event.boss) };
    case "employee_updated":
      return { ...state, employees: upsertById(state.employees, event.employee) };
    case "message_added": {
      const { message } = event;
      const current = state.messages[message.employeeId] ?? [];
      const messages = {
        ...state.messages,
        [message.employeeId]: mergeMessages(current, [message]),
      };
      const liveText =
        message.kind === "agent_text"
          ? withoutKey(state.liveText, message.employeeId)
          : state.liveText;
      return { ...state, messages, liveText };
    }
    case "message_delta":
      return {
        ...state,
        liveText: {
          ...state.liveText,
          [event.employeeId]: (state.liveText[event.employeeId] ?? "") + event.text,
        },
      };
    case "approval_requested":
    case "approval_updated": {
      const { approval } = event;
      if (approval.status === "pending") {
        return { ...state, approvals: upsertById(state.approvals, approval) };
      }
      return { ...state, approvals: state.approvals.filter((entry) => entry.id !== approval.id) };
    }
  }
}

export function officeReducer(state: OfficeState, action: OfficeAction): OfficeState {
  switch (action.type) {
    case "state_loaded": {
      const { snapshot } = action;
      const selectedStillExists =
        state.selectedId !== null && snapshot.employees.some((e) => e.id === state.selectedId);
      return {
        ...state,
        bosses: snapshot.bosses,
        employees: snapshot.employees,
        approvals: snapshot.approvals.filter((approval) => approval.status === "pending"),
        // Partial streaming text is lost across a reconnect; stored messages replace it.
        liveText: {},
        selectedId: selectedStillExists ? state.selectedId : null,
        loaded: true,
      };
    }
    case "messages_loaded":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.employeeId]: mergeMessages(state.messages[action.employeeId] ?? [], action.messages),
        },
      };
    case "server_event":
      return applyEvent(state, action.event);
    case "select":
      return { ...state, selectedId: action.employeeId };
    case "connection":
      return { ...state, connection: action.connection };
  }
}

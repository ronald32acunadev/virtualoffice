import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { api, ApiError, openEventSocket } from "../api/client";
import type { BossId, Decision, ImportResult, Species, SyncSummary } from "../api/types";
import { initialOfficeState, officeReducer, type OfficeState } from "./officeReducer";

export type OfficeActions = {
  select: (employeeId: string | null) => void;
  createEmployee: (input: {
    bossId: BossId;
    task: string;
    workingDirectory: string;
    name?: string;
    species?: Species;
    role?: string;
    jobTitle?: string;
  }) => Promise<void>;
  updateEmployee: (employeeId: string, patch: { name?: string; species?: Species; jobTitle?: string | null }) => Promise<void>;
  importSessions: (sessionIds: string[]) => Promise<ImportResult>;
  syncProviders: () => Promise<SyncSummary>;
  sendMessage: (employeeId: string, text: string) => Promise<void>;
  stopEmployee: (employeeId: string) => Promise<void>;
  resumeBoss: (bossId: BossId) => Promise<void>;
  decide: (approvalId: string, decision: Decision, answers?: Record<string, string>) => Promise<void>;
};

type OfficeContextValue = { state: OfficeState; actions: OfficeActions };

const OfficeContext = createContext<OfficeContextValue | null>(null);

export function useOffice(): OfficeContextValue {
  const value = useContext(OfficeContext);
  if (!value) throw new Error("useOffice must be used inside OfficeProvider");
  return value;
}

function readPreselectedEmployee(): string | null {
  try {
    return new URLSearchParams(location.search).get("employee");
  } catch {
    return null;
  }
}

export function OfficeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(officeReducer, initialOfficeState, (initial) => ({
    ...initial,
    selectedId: readPreselectedEmployee(),
  }));
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = state.selectedId;

  const loadMessages = useCallback(async (employeeId: string) => {
    try {
      const { messages } = await api.getMessages(employeeId);
      dispatch({ type: "messages_loaded", employeeId, messages });
    } catch {
      // A missing employee or a transient failure leaves the stored list as-is.
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await api.getState();
      dispatch({ type: "state_loaded", snapshot });
    } catch {
      return;
    }
    const open = selectedRef.current;
    if (open) await loadMessages(open);
  }, [loadMessages]);

  useEffect(() => {
    return openEventSocket({
      onOpen: () => {
        dispatch({ type: "connection", connection: "online" });
        void refresh();
      },
      onClose: () => dispatch({ type: "connection", connection: "offline" }),
      onEvent: (event) => dispatch({ type: "server_event", event }),
    });
  }, [refresh]);

  useEffect(() => {
    if (state.selectedId) void loadMessages(state.selectedId);
  }, [state.selectedId, loadMessages]);

  const actions = useMemo<OfficeActions>(
    () => ({
      select: (employeeId) => dispatch({ type: "select", employeeId }),
      createEmployee: async (input) => {
        const { employee } = await api.createEmployee(input);
        dispatch({ type: "server_event", event: { type: "employee_updated", employee } });
        dispatch({ type: "select", employeeId: employee.id });
      },
      sendMessage: async (employeeId, text) => {
        const { message } = await api.sendMessage(employeeId, text);
        dispatch({ type: "server_event", event: { type: "message_added", message } });
      },
      updateEmployee: async (employeeId, patch) => {
        const { employee } = await api.updateEmployee(employeeId, patch);
        dispatch({ type: "server_event", event: { type: "employee_updated", employee } });
      },
      importSessions: async (sessionIds) => {
        const result = await api.importClaudeSessions(sessionIds);
        for (const employee of result.imported) {
          dispatch({ type: "server_event", event: { type: "employee_updated", employee } });
        }
        return result;
      },
      syncProviders: async () => {
        const summary = await api.syncProviders();
        await refresh();
        return summary;
      },
      stopEmployee: async (employeeId) => {
        const { employee } = await api.stopEmployee(employeeId);
        dispatch({ type: "server_event", event: { type: "employee_updated", employee } });
      },
      resumeBoss: async (bossId) => {
        const { boss } = await api.resumeBoss(bossId);
        dispatch({ type: "server_event", event: { type: "boss_updated", boss } });
      },
      decide: async (approvalId, decision, answers) => {
        try {
          const { approval } = await api.decide(approvalId, decision, answers);
          dispatch({ type: "server_event", event: { type: "approval_updated", approval } });
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) await refresh();
          throw error;
        }
      },
    }),
    [refresh],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>;
}

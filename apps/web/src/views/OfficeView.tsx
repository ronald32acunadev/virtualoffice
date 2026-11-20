import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "../api/client";
import { readSavedMood, saveMood } from "../scene/camera";
import { readSavedChatter, saveChatter } from "../scene/officeQuotes";
import { OfficeScene } from "../scene/OfficeScene";
import type { LightingMood } from "../scene/officeTheme";
import { SceneErrorBoundary } from "../scene/SceneErrorBoundary";
import { useOffice } from "../state/OfficeProvider";
import { buildViewUrl } from "../state/routing";
import { SPECIES_EMOJI } from "../state/species";
import { createOfficeLink, openWindowChannel, type OfficeLink } from "../state/windowChannel";
import { RoleBadge } from "../ui/RoleBadge";

export function OfficeView() {
  const { state, actions } = useOffice();
  const linkRef = useRef<OfficeLink | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [mood, setMood] = useState<LightingMood>(() => readSavedMood());
  const [chatterEnabled, setChatterEnabled] = useState<boolean>(() => readSavedChatter());
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    const channel = openWindowChannel();
    if (!channel) return;
    const link = createOfficeLink(channel);
    linkRef.current = link;
    void link.ping();
    return () => {
      linkRef.current = null;
      link.dispose();
    };
  }, []);

  /** Focuses the employee in an open workspace, or shows the local card when none answers. */
  const focusEmployee = useCallback(
    async (employeeId: string) => {
      actions.select(employeeId);
      setCardId(null);
      const link = linkRef.current;
      const opened = link ? await link.focusEmployee(employeeId) : false;
      if (!opened) setCardId(employeeId);
    },
    [actions],
  );

  const clear = useCallback(() => {
    actions.select(null);
    setCardId(null);
  }, [actions]);

  const toggleMood = useCallback(() => {
    setMood((prev) => {
      const next: LightingMood = prev === "day" ? "evening" : "day";
      saveMood(next);
      return next;
    });
  }, []);

  const toggleChatter = useCallback(() => {
    setChatterEnabled((prev) => {
      const next = !prev;
      saveChatter(next);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setResetToken((n) => n + 1);
  }, []);

  const oldestApproval = useMemo(
    () =>
      [...state.approvals].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))[0],
    [state.approvals],
  );
  const card = cardId ? state.employees.find((e) => e.id === cardId) : undefined;

  const openWorkspace = (employeeId: string) => {
    window.open(buildViewUrl("/workspace", getToken(), { employee: employeeId }), "_blank");
    setCardId(null);
  };

  return (
    <div className="office-view">
      <SceneErrorBoundary>
        <OfficeScene
          onSelectEmployee={(id) => void focusEmployee(id)}
          onClear={clear}
          mood={mood}
          resetToken={resetToken}
          chatterEnabled={chatterEnabled}
        />
      </SceneErrorBoundary>
      <div className="office-hud" role="toolbar" aria-label="Office view controls">
        <button
          type="button"
          className="hud-btn"
          aria-pressed={mood === "evening"}
          onClick={toggleMood}
          title={mood === "day" ? "Switch to cozy evening lighting" : "Switch to daylight"}
        >
          {mood === "day" ? "☀ Day" : "🌙 Evening"}
        </button>
        <button
          type="button"
          className="hud-btn"
          onClick={resetView}
          title="Reset camera to full office overview"
        >
          Reset view
        </button>
        <button
          type="button"
          className="hud-btn"
          aria-pressed={chatterEnabled}
          onClick={toggleChatter}
          title="Toggle random The Office quotes"
        >
          {chatterEnabled ? "💬 Quotes" : "🔇 Muted"}
        </button>
      </div>
      <div className={`connection connection-${state.connection}`}>
        {state.connection === "online"
          ? "Connected"
          : state.connection === "connecting"
            ? "Connecting..."
            : "Reconnecting..."}
      </div>
      {state.approvals.length > 0 && oldestApproval ? (
        <button
          type="button"
          className="approvals-badge"
          onClick={() => void focusEmployee(oldestApproval.employeeId)}
          title="Open the oldest pending approval in the workspace"
        >
          {state.approvals.length} pending {state.approvals.length === 1 ? "approval" : "approvals"}
        </button>
      ) : null}
      {card ? (
        <div className="employee-card" role="dialog" aria-label={`${card.name} details`}>
          <div className="employee-card-head">
            <strong>
              {SPECIES_EMOJI[card.species]} {card.name}
            </strong>
            <button type="button" className="link" onClick={() => setCardId(null)}>
              Close
            </button>
          </div>
          <span className={`status status-${card.status}`}>{card.status.replace("_", " ")}</span>
          <RoleBadge role={card.role} />
          <p className="muted">{card.task}</p>
          <button type="button" onClick={() => openWorkspace(card.id)}>
            Open in workspace
          </button>
        </div>
      ) : null}
    </div>
  );
}

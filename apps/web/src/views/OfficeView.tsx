import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "../api/client";
import { readSavedChatter, saveChatter } from "../scene/officeQuotes";
import { OfficeScene } from "../scene/OfficeScene";
import type { LightingMood } from "../scene/officeTheme";
import { SceneErrorBoundary } from "../scene/SceneErrorBoundary";
import { useOffice } from "../state/OfficeProvider";
import { aggregateAgentActivity, aggregateAgentStatus } from "../state/agentView";
import { useOfficeMood } from "../state/officeMood";
import { useWorldTheme } from "../state/worldTheme";
import { SettingsModal } from "./SettingsModal";
import { TeamModal } from "./TeamModal";
import { buildViewUrl } from "../state/routing";
import { SPECIES_EMOJI } from "../state/species";
import { createOfficeLink, openWindowChannel, type OfficeLink } from "../state/windowChannel";
import { RoleBadge } from "../ui/RoleBadge";
import { truncateMediaTitle } from "../state/media";
import { MediaDrawer } from "./MediaDrawer";

export function OfficeView() {
  const { state, actions } = useOffice();
  const officeViewRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<OfficeLink | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const { mood, setMood, toggleMood } = useOfficeMood();
  const { theme, setTheme } = useWorldTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [chatterEnabled, setChatterEnabled] = useState<boolean>(() => readSavedChatter());
  const [resetToken, setResetToken] = useState(0);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [focusTvToken, setFocusTvToken] = useState(0);

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

  /** Focuses a specific chat in an open workspace, or opens it in a new workspace tab. */
  const focusChat = useCallback(
    async (employeeId: string) => {
      actions.select(employeeId);
      const link = linkRef.current;
      const opened = link ? await link.focusEmployee(employeeId) : false;
      if (!opened) {
        window.open(buildViewUrl("/workspace", getToken(), { employee: employeeId }), "_blank");
      }
      setSelectedAgentId(null);
    },
    [actions],
  );

  const clear = useCallback(() => {
    actions.select(null);
    setSelectedAgentId(null);
  }, [actions]);

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
  const focusTv = useCallback(() => {
    setFocusTvToken((n) => n + 1);
  }, []);
  const openMediaDrawer = useCallback(() => {
    setMediaOpen(true);
  }, []);
  const toggleMediaDrawer = useCallback(() => {
    setMediaOpen((v) => !v);
  }, []);
  const turnOffMedia = useCallback(() => {
    void actions.clearMediaPlayback().catch(() => {});
  }, [actions]);

  const oldestApproval = useMemo(
    () =>
      [...state.approvals].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))[0],
    [state.approvals],
  );
  const selectedAgent = selectedAgentId ? state.agents.find((a) => a.id === selectedAgentId) : undefined;
  const selectedAgentChats = useMemo(
    () =>
      selectedAgent
        ? state.employees
            .filter((e) => e.agentId === selectedAgent.id)
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        : [],
    [selectedAgent, state.employees],
  );
  const selectedAgentBoss = selectedAgent ? state.bosses.find((b) => b.id === selectedAgent.bossId) : undefined;
  const selectedAgentStatus = selectedAgent ? aggregateAgentStatus(selectedAgentChats, selectedAgentBoss) : null;
  const selectedAgentActivity = selectedAgent ? aggregateAgentActivity(selectedAgentChats) : null;

  const openWorkspace = () => {
    window.open(buildViewUrl("/workspace", getToken()), "_blank");
    setSelectedAgentId(null);
  };

  return (
    <div className="office-view" ref={officeViewRef}>
      <SceneErrorBoundary>
        <OfficeScene
          selectedAgentId={selectedAgentId}
          onSelectAgent={(id) => setSelectedAgentId(id)}
          onClear={clear}
          mood={mood}
          theme={theme}
          resetToken={resetToken}
          chatterEnabled={chatterEnabled}
          focusTvToken={focusTvToken}
          onOpenMediaDrawer={openMediaDrawer}
          onFocusTv={focusTv}
          onTurnOffMedia={turnOffMedia}
          tvPortalRef={officeViewRef}
        />
      </SceneErrorBoundary>
      <div className="office-hud" role="toolbar" aria-label="Office view controls">
        <button
          type="button"
          className="hud-btn"
          aria-pressed={teamOpen}
          onClick={() => setTeamOpen(true)}
          title="Create and manage your agent team"
        >
          👥 Team ({state.agents.length})
        </button>
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
        <button
          type="button"
          className="hud-btn hud-btn-media"
          aria-pressed={mediaOpen}
          onClick={toggleMediaDrawer}
          title="Open Office TV & Music selector"
        >
          <span className={state.media ? "hud-media-dot is-live" : "hud-media-dot"} aria-hidden="true" />
          {state.media ? `TV: ${truncateMediaTitle(state.media.title, 22)}` : "TV / Music"}
        </button>
        {state.media ? (
          <button
            type="button"
            className="hud-btn"
            onClick={focusTv}
            title="Focus camera on the Office TV"
          >
            Focus TV
          </button>
        ) : null}
        <button
          type="button"
          className="hud-btn"
          aria-pressed={settingsOpen}
          onClick={() => setSettingsOpen(true)}
          title="Open theme and view settings"
        >
          ⚙ Settings
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
          onClick={() => void focusChat(oldestApproval.employeeId)}
          title="Open the oldest pending approval in the workspace"
        >
          {state.approvals.length} pending {state.approvals.length === 1 ? "approval" : "approvals"}
        </button>
      ) : null}
      {selectedAgent && selectedAgentStatus ? (
        <div className="employee-card" role="dialog" aria-label={`${selectedAgent.name} details`}>
          <div className="employee-card-head">
            <strong>
              {SPECIES_EMOJI[selectedAgent.species]} {selectedAgent.name}
            </strong>
            <button type="button" className="link" onClick={() => setSelectedAgentId(null)}>
              Close
            </button>
          </div>
          <span className={`status status-${selectedAgentStatus}`}>{selectedAgentStatus.replace("_", " ")}</span>
          {selectedAgent.jobTitle ? <span className="job-title-badge">{selectedAgent.jobTitle}</span> : null}
          <RoleBadge role={selectedAgent.role} />
          {selectedAgentActivity ? (
            <p className="muted">
              {selectedAgentActivity.category === "mcp_request"
                ? `📡 MCP: ${selectedAgentActivity.label}`
                : selectedAgentActivity.category === "searching_files"
                  ? `🔍 ${selectedAgentActivity.label}`
                  : `⚙ ${selectedAgentActivity.label}`}
            </p>
          ) : null}
          {selectedAgentChats.length > 0 ? (
            <ul className="agent-card-chats">
              {selectedAgentChats.slice(0, 6).map((chat) => (
                <li key={chat.id}>
                  <button type="button" className="agent-card-chat-btn" onClick={() => void focusChat(chat.id)}>
                    <span className="agent-card-chat-title">{chat.task}</span>
                    <span className={`dot dot-${chat.status}`} aria-label={chat.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No chats assigned to this agent yet.</p>
          )}
          <div className="actions">
            <button type="button" onClick={openWorkspace}>
              Open workspace
            </button>
            {selectedAgentStatus === "on_break" ? (
              <button
                type="button"
                className="break-resume-btn"
                onClick={() => void actions.resumeBoss(selectedAgent.bossId)}
              >
                Resume break
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <TeamModal open={teamOpen} onClose={() => setTeamOpen(false)} />
      <MediaDrawer
        open={mediaOpen}
        media={state.media}
        presets={state.mediaPresets}
        onClose={() => setMediaOpen(false)}
        onFocusTv={focusTv}
        onPlay={actions.setMediaPlayback}
        onTurnOff={actions.clearMediaPlayback}
        onSavePreset={actions.addMediaPreset}
        onDeletePreset={actions.deleteMediaPreset}
      />
      <SettingsModal
        open={settingsOpen}
        theme={theme}
        mood={mood}
        chatterEnabled={chatterEnabled}
        onSelectTheme={setTheme}
        onSelectMood={setMood}
        onToggleChatter={toggleChatter}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

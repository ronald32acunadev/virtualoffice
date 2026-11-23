import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError } from "../api/client";
import type { Species } from "../api/types";
import type { LightingMood } from "../scene/officeTheme";
import { useOffice } from "../state/OfficeProvider";
import { SPECIES_EMOJI, SPECIES_LIST, speciesLabel } from "../state/species";
import { JOB_TITLE_PRESETS, MAX_JOB_TITLE_LENGTH } from "../state/jobTitle";
import { composerKeyAction, isFolderMissing } from "../state/sidebar";
import { buildTimeline } from "../state/timeline";
import { filterCommands, insertCommand, insertSkillAtStart, menuKeyAction, moveIndex, slashQuery } from "../state/slashMenu";
import { formatResetCountdown } from "../state/usage";
import { useCatalog } from "../state/useCatalog";
import { RoleBadge } from "../ui/RoleBadge";
import { UsageRing } from "../ui/UsageRing";
import { ApprovalCard } from "../ui/ApprovalCard";
import { toFormError } from "../ui/errors";
import { OpenExternalMenu } from "./OpenExternalMenu";
import { optionId, SlashMenu } from "./SlashMenu";
import { RichMarkdown, TextBubble, ToolRow } from "./ToolRow";
import { Toolbox } from "./Toolbox";
import { TerminalPanel } from "./TerminalPanel";
import { AppPanel } from "./AppPanel";

const STOPPABLE = new Set(["starting", "working", "waiting_approval"]);
const FOLDER_MISSING_TEXT =
  "This session's project folder no longer exists, so it can't be resumed. You can still read its history.";

function Header({
  employeeId,
  onInsertSkill,
  onOpenTerminal,
  onOpenApp,
}: {
  employeeId: string;
  onInsertSkill: (name: string) => void;
  onOpenTerminal: () => void;
  onOpenApp: () => void;
}) {
  const { state, actions } = useOffice();
  const employee = state.employees.find((e) => e.id === employeeId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleListId = useId();
  if (!employee) return null;

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(toFormError(err).message);
    }
  };
  const saveName = () =>
    run(async () => {
      await actions.updateEmployee(employee.id, { name: draft });
      setEditing(false);
    });
  const saveJobTitle = () =>
    run(async () => {
      const trimmed = titleDraft.trim();
      await actions.updateEmployee(employee.id, { jobTitle: trimmed === "" ? null : trimmed });
      setEditingTitle(false);
    });

  return (
    <header className="conv-head" data-boss={employee.bossId}>
      <div className="conv-title">
        <span className="avatar avatar-lg">{SPECIES_EMOJI[employee.species]}</span>
        {editing ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <input
              type="text"
              autoFocus
              value={draft}
              aria-label="Employee name"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <h1>{employee.name}</h1>
            <button
              type="button"
              className="link"
              onClick={() => {
                setDraft(employee.name);
                setError(null);
                setEditing(true);
              }}
            >
              Rename
            </button>
          </>
        )}
        <RoleBadge role={employee.role} />
        {editingTitle ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault();
              void saveJobTitle();
            }}
          >
            <input
              type="text"
              autoFocus
              list={titleListId}
              maxLength={MAX_JOB_TITLE_LENGTH}
              value={titleDraft}
              aria-label="Job title"
              placeholder="e.g. Architect"
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
            <datalist id={titleListId}>
              {JOB_TITLE_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditingTitle(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="job-title-pill"
            title="Edit job title"
            onClick={() => {
              setTitleDraft(employee.jobTitle ?? "");
              setError(null);
              setEditingTitle(true);
            }}
          >
            {employee.jobTitle ?? "+ Job title"}
          </button>
        )}
        <span className={`status status-${employee.status}`}>{employee.status.replace("_", " ")}</span>
        <select
          aria-label="Species"
          value={employee.species}
          onChange={(e) => void run(() => actions.updateEmployee(employee.id, { species: e.target.value as Species }))}
        >
          {SPECIES_LIST.map((s) => (
            <option key={s} value={s}>
              {speciesLabel(s)}
            </option>
          ))}
        </select>
        <Toolbox employeeId={employee.id} onInsertSkill={onInsertSkill} />
        <OpenExternalMenu
          employeeId={employee.id}
          onError={setError}
          onOpenEmbeddedTerminal={onOpenTerminal}
          onOpenEmbeddedApp={onOpenApp}
        />
        {STOPPABLE.has(employee.status) ? (
          <button type="button" className="danger" onClick={() => void run(() => actions.stopEmployee(employee.id))}>
            Stop
          </button>
        ) : null}
      </div>
      <div className="conv-sub">
        <span className="mono" title={employee.workingDirectory}>
          {employee.workingDirectory}
        </span>
        <span className="muted"> · {employee.task}</span>
      </div>
      {employee.failureReason ? <p className="field-error">{employee.failureReason}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </header>
  );
}

export type PendingInsert = { name: string; nonce: number };

function Composer({ employeeId, pendingInsert }: { employeeId: string; pendingInsert: PendingInsert | null }) {
  const { state, actions } = useOffice();
  const employee = state.employees.find((e) => e.id === employeeId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [missingFolder, setMissingFolder] = useState(false);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const nextCaret = useRef<number | null>(null);
  const lastNonce = useRef<number | null>(null);
  const listId = useId();
  const { entry, load } = useCatalog({ kind: "employee", id: employeeId });

  const query = slashQuery(text, caret);
  const menuOpen = query !== null && !dismissed;
  const catalog = "catalog" in entry ? entry.catalog : undefined;
  const matches = useMemo(() => (catalog && query !== null ? filterCommands(catalog.commands, query) : []), [catalog, query]);
  const safeIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));

  // Typing "/" is the explicit action that loads this employee's catalog (once; retried when the menu reopens).
  useEffect(() => {
    if (menuOpen) load();
  }, [menuOpen, load]);

  useLayoutEffect(() => {
    if (nextCaret.current !== null && areaRef.current) {
      areaRef.current.setSelectionRange(nextCaret.current, nextCaret.current);
      setCaret(nextCaret.current);
      nextCaret.current = null;
    }
  });

  useEffect(() => {
    if (!pendingInsert || lastNonce.current === pendingInsert.nonce) return;
    lastNonce.current = pendingInsert.nonce;
    const result = insertSkillAtStart(text, pendingInsert.name);
    nextCaret.current = result.caret;
    setText(result.text);
    setDismissed(true);
    areaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInsert]);

  if (!employee) return null;
  const boss = state.bosses.find((b) => b.id === employee.bossId);
  const onBreak = Boolean(boss?.onBreak || employee.status === "on_break");
  const terminalActive = state.activeTerminals.includes(employeeId);
  const disabled = missingFolder || isFolderMissing(employee) || onBreak || terminalActive;
  const resetCountdown = formatResetCountdown(boss?.breakUntil);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await actions.sendMessage(employeeId, trimmed);
      setText("");
      if (areaRef.current) areaRef.current.style.height = "auto";
    } catch (err) {
      if (err instanceof ApiError && err.code === "working_directory_missing") setMissingFolder(true);
      else setError(toFormError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const openSlashFromPlus = () => {
    if (disabled) return;
    const nextText = text.startsWith("/") ? text : `/${text}`;
    nextCaret.current = 1;
    setText(nextText);
    setDismissed(false);
    setActiveIndex(0);
    areaRef.current?.focus();
  };

  const resumeBreak = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.resumeBoss(employee.bossId);
    } catch (err) {
      setError(toFormError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (index: number) => {
    const match = matches[index];
    if (!match) return;
    const result = insertCommand(text, match.command.name);
    nextCaret.current = result.caret;
    setText(result.text);
    setDismissed(true);
    areaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const menuAction = menuKeyAction(
      { key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing },
      { open: menuOpen, itemCount: matches.length },
    );
    if (menuAction !== "none") {
      event.preventDefault();
      if (menuAction === "next") setActiveIndex(moveIndex(safeIndex, 1, matches.length));
      else if (menuAction === "prev") setActiveIndex(moveIndex(safeIndex, -1, matches.length));
      else if (menuAction === "select") pick(safeIndex);
      else setDismissed(true);
      return;
    }
    const action = composerKeyAction(
      { key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing },
      text,
    );
    if (action === "send") {
      event.preventDefault();
      void send();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); // Empty text is never sent and never adds a newline.
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="composer-inner">
        {missingFolder || isFolderMissing(employee) ? <p className="field-error">{FOLDER_MISSING_TEXT}</p> : null}
        {terminalActive ? (
          <p className="field-error">The embedded terminal holds this session. End it in the Terminal tab to chat here.</p>
        ) : null}
        {onBreak ? (
          <div className="break-banner" role="status">
            <div className="break-banner-text">
              <strong>☕ {boss?.name ?? employee.bossId} is on break</strong>
              <span>
                {boss?.breakReason ?? employee.failureReason ?? "Usage limit reached."}
                {resetCountdown ? ` · Resets ${resetCountdown}` : ""}
              </span>
            </div>
            <button type="button" className="break-resume-btn" disabled={busy} onClick={() => void resumeBreak()}>
              Resume now
            </button>
          </div>
        ) : null}
        <div className="composer-card">
          <SlashMenu
            open={menuOpen}
            entry={entry}
            matches={matches}
            activeIndex={safeIndex}
            listId={listId}
            onHover={setActiveIndex}
            onPick={pick}
          />
          <div className="composer-input-row">
            <button
              type="button"
              className="composer-plus-btn"
              disabled={disabled}
              title="Insert / command"
              aria-label="Insert slash command"
              onClick={openSlashFromPlus}
            >
              +
            </button>
            <textarea
              ref={areaRef}
              rows={1}
              value={text}
              disabled={disabled}
              role="combobox"
              aria-expanded={menuOpen && matches.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={menuOpen && matches.length > 0 ? optionId(listId, safeIndex) : undefined}
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setDismissed(false);
                setActiveIndex(0);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 180)}px`;
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              placeholder={
                onBreak
                  ? `${boss?.name ?? employee.bossId} is on break — click Resume now to retry`
                  : disabled
                    ? "Messaging is unavailable"
                    : "Type / for commands or write a message..."
              }
            />
            {STOPPABLE.has(employee.status) ? (
              <button
                type="button"
                className="composer-stop-btn"
                title="Stop agent"
                onClick={() => void actions.stopEmployee(employee.id)}
              >
                ■
              </button>
            ) : null}
            <button
              type="submit"
              className="composer-send-btn"
              disabled={disabled || busy || text.trim() === ""}
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
          <div className="composer-footer">
            <div className="composer-meta">
              <span className="composer-boss-pill" data-boss={employee.bossId}>
                <span className="boss-accent-dot" aria-hidden="true" />
                {boss?.name ?? employee.bossId}
              </span>
              {employee.jobTitle ? <span className="composer-meta-sep">{employee.jobTitle}</span> : null}
            </div>
            <div className="composer-status-right">
              <UsageRing
                bossUsage={boss?.usage}
                employeeUsage={employee.usage}
                onBreak={onBreak}
                breakUntil={boss?.breakUntil}
              />
            </div>
          </div>
        </div>
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </form>
  );
}

export function ConversationPane({ employeeId, mood }: { employeeId: string; mood: LightingMood }) {
  const { state, actions } = useOffice();
  const messages = state.messages[employeeId];
  const live = state.liveText[employeeId] ?? "";
  const timeline = useMemo(() => buildTimeline(messages ?? []), [messages]);
  const approvals = state.approvals.filter((a) => a.employeeId === employeeId);
  const employee = state.employees.find((e) => e.id === employeeId);
  const busy = STOPPABLE.has(employee?.status ?? "");
  const endRef = useRef<HTMLDivElement>(null);
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);
  const [view, setView] = useState<"chat" | "terminal" | "app">("chat");

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [timeline.length, live]);

  return (
    <section className="conversation-pane">
      <Header
        employeeId={employeeId}
        onInsertSkill={(name) => setPendingInsert({ name, nonce: Date.now() + Math.random() })}
        onOpenTerminal={() => setView("terminal")}
        onOpenApp={() => setView("app")}
      />
      <div className="conv-tabs" role="tablist" aria-label="Conversation view">
        <button type="button" role="tab" aria-selected={view === "chat"} className={view === "chat" ? "conv-tab active" : "conv-tab"} onClick={() => setView("chat")}>
          Chat
        </button>
        <button type="button" role="tab" aria-selected={view === "terminal"} className={view === "terminal" ? "conv-tab active" : "conv-tab"} onClick={() => setView("terminal")}>
          Terminal
        </button>
        <button type="button" role="tab" aria-selected={view === "app"} className={view === "app" ? "conv-tab active" : "conv-tab"} onClick={() => setView("app")}>
          App
        </button>
      </div>
      <div className="conv-scroll" hidden={view !== "chat"}>
        <div className="conv-column">
          {approvals.length > 0 ? (
            <ul className="approval-list conv-approvals">
              {approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  employee={state.employees.find((e) => e.id === approval.employeeId)}
                  onSelectEmployee={actions.select}
                  onDecide={actions.decide}
                />
              ))}
            </ul>
          ) : null}
          {timeline.length === 0 && !live ? <p className="muted">No messages yet.</p> : null}
          {timeline.map((item) =>
            item.message.kind === "tool_call" || item.message.kind === "tool_result" ? (
              <ToolRow key={item.message.id} item={item} />
            ) : (
              <TextBubble key={item.message.id} item={item} />
            ),
          )}
          {live ? (
            <div className="bubble bubble-agent markdown bubble-live">
              <RichMarkdown content={live} />
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>
      {view === "chat" ? <Composer key={employeeId} employeeId={employeeId} pendingInsert={pendingInsert} /> : null}
      {view === "terminal" ? <TerminalPanel employeeId={employeeId} busy={busy} mood={mood} /> : null}
      {view === "app" && employee ? <AppPanel key={employeeId} employeeId={employeeId} bossId={employee.bossId} /> : null}
    </section>
  );
}

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { ApiError } from "../api/client";
import type { Species } from "../api/types";
import type { LightingMood } from "../scene/officeTheme";
import { useOffice } from "../state/OfficeProvider";
import {
  canSendComposer,
  encodeAttachmentFile,
  formatFileSize,
  isPreviewableImageMime,
  validateFilesToStage,
  type AttachmentUpload,
} from "../state/attachments";
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
import { optionId, SlashMenu } from "./SlashMenu";
import { RichMarkdown, TextBubble, ToolRow } from "./ToolRow";
import { groupTimelineBlocks } from "../state/activityGroups";
import { deriveLiveStatus, isNearBottom, STARTER_PROMPTS } from "../state/chatErgonomics";
import { ActivityGroup } from "./ActivityGroup";
import { Toolbox } from "./Toolbox";
import { TerminalPanel } from "./TerminalPanel";

const STOPPABLE = new Set(["starting", "working", "waiting_approval"]);
const FOLDER_MISSING_TEXT =
  "This session's project folder no longer exists, so it can't be resumed. You can still read its history.";

function Header({
  employeeId,
  onInsertSkill,
  onInsertPrompt,
}: {
  employeeId: string;
  onInsertSkill: (name: string) => void;
  onInsertPrompt: (prompt: string) => void;
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

  const boss = state.bosses.find((b) => b.id === employee.bossId);

  return (
    <header className="conv-header">
      <div className="conv-title-row">
        {editing ? (
          <form
            className="conv-name-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = draft.trim();
              if (!name) return;
              void run(async () => {
                await actions.updateEmployee(employee.id, { name });
                setEditing(false);
              });
            }}
          >
            <input
              type="text"
              value={draft}
              maxLength={40}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setEditing(false)}
            />
          </form>
        ) : (
          <h2
            className="conv-name"
            title="Click to rename"
            onClick={() => {
              setDraft(employee.name);
              setEditing(true);
            }}
          >
            {SPECIES_EMOJI[employee.species]} {employee.name}
          </h2>
        )}
        {editingTitle ? (
          <div className="conv-title-edit-wrap">
            <input
              type="text"
              className="conv-title-input"
              value={titleDraft}
              maxLength={MAX_JOB_TITLE_LENGTH}
              list={titleListId}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const jt = titleDraft.trim();
                  void run(async () => {
                    await actions.updateEmployee(employee.id, { jobTitle: jt ? jt : null });
                    setEditingTitle(false);
                  });
                } else if (e.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
              onBlur={() => {
                const jt = titleDraft.trim();
                void run(async () => {
                  await actions.updateEmployee(employee.id, { jobTitle: jt ? jt : null });
                  setEditingTitle(false);
                });
              }}
              placeholder="Job title..."
            />
            <datalist id={titleListId}>
              {JOB_TITLE_PRESETS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        ) : (
          <button
            type="button"
            className="conv-job-title-btn"
            title="Click to set job title"
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
        <Toolbox
          employeeId={employee.id}
          onInsertSkill={onInsertSkill}
          onInsertPrompt={onInsertPrompt}
        />
        <button
          type="button"
          className="link danger-link"
          title="Delete chat (also removes the synced session from the agent)"
          onClick={() => {
            if (window.confirm(`Delete "${employee.name}"? This also removes the synced chat from its agent.`)) {
              void run(() => actions.deleteEmployee(employee.id));
            }
          }}
        >
          🗑 Delete
        </button>
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

export type PendingInsert = { name?: string; prompt?: string; nonce: number };

type StagedAttachment = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  previewUrl: string | null;
};

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
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [dragging, setDragging] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextCaret = useRef<number | null>(null);
  const lastNonce = useRef<number | null>(null);
  const stagedRef = useRef<StagedAttachment[]>([]);
  stagedRef.current = staged;

  const listId = useId();
  const { entry, load } = useCatalog({ kind: "employee", id: employeeId });

  const query = slashQuery(text, caret);
  const menuOpen = query !== null && !dismissed;
  const catalog = "catalog" in entry ? entry.catalog : undefined;
  const matches = useMemo(() => (catalog && query !== null ? filterCommands(catalog.commands, query) : []), [catalog, query]);
  const safeIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));

  useEffect(() => {
    return () => {
      for (const item of stagedRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

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
    if (pendingInsert.name) {
      const result = insertSkillAtStart(text, pendingInsert.name);
      nextCaret.current = result.caret;
      setText(result.text);
    } else if (pendingInsert.prompt) {
      setText(pendingInsert.prompt);
      nextCaret.current = pendingInsert.prompt.length;
    }
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

  const stageFiles = (files: File[]) => {
    const result = validateFilesToStage(staged.length, files);
    if (result.error) {
      setError(result.error);
    } else if (result.accepted.length > 0) {
      setError(null);
    }
    if (result.accepted.length === 0) return;

    const newStaged: StagedAttachment[] = result.accepted.map((file) => {
      const isImage = isPreviewableImageMime(file.type);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        isImage,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
      };
    });

    setStaged((prev) => [...prev, ...newStaged]);
  };

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const send = async () => {
    if (!canSendComposer(text, staged.length, disabled, busy)) return;
    setBusy(true);
    setError(null);
    try {
      const uploads = await Promise.all(staged.map((s) => encodeAttachmentFile(s.file)));
      await actions.sendMessage(employeeId, text.trim(), uploads);
      for (const item of staged) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setStaged([]);
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
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && staged.length > 0 && text.trim() === "") {
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
        <div
          className={`composer-card${dragging ? " is-dragging" : ""}`}
          onDragOver={(e: DragEvent) => {
            if (disabled) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={(e: DragEvent) => {
            if (disabled) return;
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e: DragEvent) => {
            if (disabled) return;
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) stageFiles(files);
          }}
        >
          <SlashMenu
            open={menuOpen}
            entry={entry}
            matches={matches}
            activeIndex={safeIndex}
            listId={listId}
            onHover={setActiveIndex}
            onPick={pick}
          />
          {staged.length > 0 ? (
            <div className="composer-attachments">
              {staged.map((item) => (
                <div key={item.id} className="composer-attachment-item">
                  {item.previewUrl ? (
                    <div className="composer-attachment-thumb">
                      <img src={item.previewUrl} alt={item.name} />
                    </div>
                  ) : (
                    <div className="composer-attachment-thumb file-icon" aria-hidden="true">
                      📎
                    </div>
                  )}
                  <div className="composer-attachment-meta">
                    <span className="composer-attachment-name" title={item.name}>
                      {item.name}
                    </span>
                    <small>{formatFileSize(item.size)}</small>
                  </div>
                  <button
                    type="button"
                    className="composer-attachment-remove"
                    onClick={() => removeStaged(item.id)}
                    title="Remove attachment"
                    aria-label={`Remove ${item.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
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
            <button
              type="button"
              className="composer-attach-btn"
              disabled={disabled}
              title="Attach files or photos"
              aria-label="Attach files"
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) stageFiles(files);
              }}
            />
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
              onPaste={(e) => {
                if (disabled) return;
                const items = e.clipboardData.items;
                const files: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  const item = items[i];
                  if (item && item.kind === "file") {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                  }
                }
                if (files.length === 0 && e.clipboardData.files.length > 0) {
                  files.push(...Array.from(e.clipboardData.files));
                }
                if (files.length > 0) {
                  e.preventDefault();
                  stageFiles(files);
                }
              }}
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
              disabled={!canSendComposer(text, staged.length, disabled, busy)}
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
  const approvals = state.approvals.filter((a) => a.employeeId === employeeId);
  const employee = state.employees.find((e) => e.id === employeeId);
  const busy = STOPPABLE.has(employee?.status ?? "");
  const messages = state.messages[employeeId];
  const live = state.liveText[employeeId] ?? "";
  const timeline = useMemo(() => buildTimeline(messages ?? []), [messages]);
  const activityBlocks = useMemo(() => groupTimelineBlocks(timeline, busy), [timeline, busy]);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);
  const [view, setView] = useState<"chat" | "terminal">("chat");

  const liveStatus = useMemo(
    () =>
      deriveLiveStatus({
        status: employee?.status,
        timeline,
        liveText: live,
      }),
    [employee?.status, timeline, live]
  );

  useEffect(() => {
    if (pinnedToBottom) {
      endRef.current?.scrollIntoView?.({ block: "end" });
    }
  }, [timeline.length, live, pinnedToBottom]);

  return (
    <section className="conversation-pane">
      <Header
        employeeId={employeeId}
        onInsertSkill={(name) => setPendingInsert({ name, nonce: Date.now() + Math.random() })}
        onInsertPrompt={(prompt) => setPendingInsert({ prompt, nonce: Date.now() + Math.random() })}
      />
      <div className="conv-tabs" role="tablist" aria-label="Conversation view">
        <button type="button" role="tab" aria-selected={view === "chat"} className={view === "chat" ? "conv-tab active" : "conv-tab"} onClick={() => setView("chat")}>
          Chat
        </button>
        <button type="button" role="tab" aria-selected={view === "terminal"} className={view === "terminal" ? "conv-tab active" : "conv-tab"} onClick={() => setView("terminal")}>
          Terminal
        </button>
      </div>
      <div className="conv-scroll-wrap" hidden={view !== "chat"}>
        <div
          ref={scrollRef}
          className="conv-scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            setPinnedToBottom(isNearBottom({ scrollTop: el.scrollTop, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
          }}
        >
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
            {timeline.length === 0 && !live ? (
              <div className="chat-empty-state">
                <p className="muted">No messages yet.</p>
                <div className="starter-chips">
                  {STARTER_PROMPTS.map((sp) => (
                    <button
                      key={sp.label}
                      type="button"
                      className="starter-chip"
                      onClick={() => setPendingInsert({ prompt: sp.prompt, nonce: Date.now() + Math.random() })}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {activityBlocks.map((block) =>
              block.kind === "activity_group" ? (
                <ActivityGroup key={block.id} block={block} />
              ) : block.item.message.kind === "tool_call" || block.item.message.kind === "tool_result" ? (
                <ToolRow key={block.item.message.id} item={block.item} />
              ) : (
                <TextBubble key={block.item.message.id} item={block.item} />
              ),
            )}
            {live ? (
              <div className="bubble bubble-agent markdown bubble-live">
                <RichMarkdown content={live} />
              </div>
            ) : null}
            {liveStatus ? (
              <div className="live-status-bar" role="status" aria-live="polite">
                <span className="live-status-dot" aria-hidden="true" />
                <span>{liveStatus}</span>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        </div>
        {!pinnedToBottom && (timeline.length > 0 || live) ? (
          <button
            type="button"
            className="jump-latest-btn"
            onClick={() => {
              setPinnedToBottom(true);
              endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
            }}
          >
            Jump to latest ↓
          </button>
        ) : null}
      </div>
      {view === "chat" ? <Composer key={employeeId} employeeId={employeeId} pendingInsert={pendingInsert} /> : null}
      {view === "terminal" ? <TerminalPanel employeeId={employeeId} busy={busy} mood={mood} /> : null}
    </section>
  );
}

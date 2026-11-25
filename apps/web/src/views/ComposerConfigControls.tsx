import { useEffect, useRef, useState } from "react";
import type { AgentEffort, AgentMode, BossId, ProviderModelOption } from "../api/types";
import {
  buildModelOptionsForBoss,
  formatEffortLabel,
  getAgentModeOption,
  getEffortsForBoss,
  getModesForBoss,
  resolveModelLabel,
} from "../state/agentConfig";

type PopoverKey = "model" | "mode" | null;

export function ComposerConfigControls({
  bossId,
  model,
  mode,
  effort,
  providerModels,
  onChangeModel,
  onChangeMode,
  onChangeEffort,
  disabled,
}: {
  bossId: BossId;
  model: string | null | undefined;
  mode: AgentMode | null | undefined;
  effort?: AgentEffort | null;
  providerModels: Partial<Record<BossId, ProviderModelOption[]>>;
  onChangeModel: (model: string | null) => void;
  onChangeMode: (mode: AgentMode) => void;
  onChangeEffort?: (effort: AgentEffort | null) => void;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [openPopover, setOpenPopover] = useState<PopoverKey>(null);

  const options = buildModelOptionsForBoss(bossId, providerModels, model);
  const modeOptions = getModesForBoss(bossId);
  const effortOptions = getEffortsForBoss(bossId);
  const activeMode = getAgentModeOption(mode, bossId);
  const modelLabel = resolveModelLabel(model, options);
  const showEffort = effortOptions.length > 0;
  const splitDangerModes = bossId === "claude" || bossId === "codex";
  const effortLabel = formatEffortLabel(effort);

  const primaryModes = splitDangerModes ? modeOptions.filter((m) => !m.dangerous) : modeOptions;
  const dangerModes = splitDangerModes ? modeOptions.filter((m) => m.dangerous) : [];

  const togglePopover = (key: Exclude<PopoverKey, null>) => {
    if (disabled) return;
    setOpenPopover((prev) => (prev === key ? null : key));
  };

  useEffect(() => {
    if (openPopover === null) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openPopover]);

  const renderModeOption = (option: (typeof modeOptions)[number], danger: boolean) => {
    const isActive = option.id === activeMode.id;
    return (
      <button
        key={option.id}
        type="button"
        role="menuitem"
        className={`popover-option popover-mode-option${danger ? " popover-danger-option" : ""}${isActive ? " is-active" : ""}`}
        onClick={() => {
          onChangeMode(option.id);
          setOpenPopover(null);
        }}
      >
        <span className="mode-text">
          <span className="mode-label-row">
            <span className="mode-label">{option.label}</span>
            {option.isDefault ? <span className="popover-default-badge">Default</span> : null}
          </span>
          {!danger && option.description ? <span className="mode-desc">{option.description}</span> : null}
        </span>
        <span className="popover-option-right">
          {danger ? (
            <span className="popover-enable-tag">{isActive ? "Active" : "Enable"}</span>
          ) : (
            <>
              {isActive ? <span className="check">✓</span> : null}
              {option.shortcut ? <span className="popover-shortcut">{option.shortcut}</span> : null}
            </>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="composer-config-controls" ref={wrapRef}>
      <div className="composer-config-item">
        <button
          type="button"
          className="composer-config-btn"
          disabled={disabled}
          onClick={() => togglePopover("model")}
          aria-haspopup="menu"
          aria-expanded={openPopover === "model"}
          title="Select model"
        >
          <span className="composer-config-text">{modelLabel}</span>
          {showEffort ? <span className="composer-config-effort">{effortLabel}</span> : null}
          <span aria-hidden="true">▾</span>
        </button>

        {openPopover === "model" ? (
          <div className="composer-config-popover composer-config-popover-right" role="menu" aria-label="Model">
            <div className="popover-header">Model</div>
            <button
              type="button"
              role="menuitem"
              className={`popover-option${!model ? " is-active" : ""}`}
              onClick={() => {
                onChangeModel(null);
                setOpenPopover(null);
              }}
            >
              <span>Default model</span>
              <span className="popover-option-right">
                {!model ? <span className="check">✓</span> : null}
              </span>
            </button>
            {options.map((option, index) => {
              const isActive = option.id === model;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={`popover-option${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    onChangeModel(option.id);
                    setOpenPopover(null);
                  }}
                >
                  <span>{option.label}</span>
                  <span className="popover-option-right">
                    {isActive ? <span className="check">✓</span> : <span className="popover-shortcut">{index + 1}</span>}
                  </span>
                </button>
              );
            })}
            {showEffort && onChangeEffort ? (
              <>
                <div className="popover-divider" />
                <div className="popover-effort-block">
                  <div className="popover-effort-label">Effort</div>
                  <div className="popover-effort-row" role="group" aria-label="Reasoning effort">
                    {effortOptions.map((opt) => {
                      const active = (effort ?? "medium") === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`effort-pill${active ? " is-active" : ""}`}
                          aria-pressed={active}
                          onClick={() => onChangeEffort(opt.id)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="composer-config-item">
        <button
          type="button"
          className={`composer-config-btn${activeMode.dangerous ? " is-turbo" : ""}`}
          disabled={disabled}
          onClick={() => togglePopover("mode")}
          aria-haspopup="menu"
          aria-expanded={openPopover === "mode"}
          title="Select agent execution mode"
        >
          <span className="composer-config-text">{activeMode.shortLabel}</span>
          <span aria-hidden="true">▾</span>
        </button>

        {openPopover === "mode" ? (
          <div className="composer-config-popover composer-mode-popover composer-config-popover-right" role="menu" aria-label="Agent mode">
            <div className="popover-header">{splitDangerModes ? "Mode" : "This Conversation"}</div>
            {primaryModes.map((option) => renderModeOption(option, false))}
            {splitDangerModes && dangerModes.length > 0 ? (
              <>
                <div className="popover-divider" />
                {dangerModes.map((option) => renderModeOption(option, true))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

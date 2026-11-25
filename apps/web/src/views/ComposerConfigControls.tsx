import { useEffect, useRef, useState } from "react";
import type { AgentMode, BossId, ProviderModelOption } from "../api/types";
import {
  AGENT_MODE_OPTIONS,
  buildModelOptionsForBoss,
  getAgentModeOption,
  resolveModelLabel,
} from "../state/agentConfig";

type PopoverKey = "model" | "mode" | null;

export function ComposerConfigControls({
  bossId,
  model,
  mode,
  providerModels,
  onChangeModel,
  onChangeMode,
  disabled,
}: {
  bossId: BossId;
  model: string | null | undefined;
  mode: AgentMode | null | undefined;
  providerModels: Partial<Record<BossId, ProviderModelOption[]>>;
  onChangeModel: (model: string | null) => void;
  onChangeMode: (mode: AgentMode) => void;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [openPopover, setOpenPopover] = useState<PopoverKey>(null);

  const options = buildModelOptionsForBoss(bossId, providerModels, model);
  const activeMode = getAgentModeOption(mode);
  const modelLabel = resolveModelLabel(model, options);
  const modeLabel = activeMode.id === "turbo" ? "⚡ Turbo" : "👁 Request Review";

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
          <span aria-hidden="true">▾</span>
        </button>

        {openPopover === "model" ? (
          <div className="composer-config-popover" role="menu" aria-label="Model">
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
              {!model ? <span className="check">✓</span> : null}
            </button>
            {options.map((option) => {
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
                  {isActive ? <span className="check">✓</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="composer-config-item">
        <button
          type="button"
          className={`composer-config-btn${activeMode.id === "turbo" ? " is-turbo" : ""}`}
          disabled={disabled}
          onClick={() => togglePopover("mode")}
          aria-haspopup="menu"
          aria-expanded={openPopover === "mode"}
          title="Select agent execution mode"
        >
          <span className="composer-config-text">{modeLabel}</span>
          <span aria-hidden="true">▾</span>
        </button>

        {openPopover === "mode" ? (
          <div className="composer-config-popover composer-mode-popover" role="menu" aria-label="Agent mode">
            <div className="popover-header">This Conversation</div>
            {AGENT_MODE_OPTIONS.map((option) => {
              const isActive = option.id === activeMode.id;
              const icon = option.id === "request_review" ? "👁" : "⚡";
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={`popover-option popover-mode-option${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    onChangeMode(option.id);
                    setOpenPopover(null);
                  }}
                >
                  <span className="mode-icon" aria-hidden="true">{icon}</span>
                  <span className="mode-text">
                    <span className="mode-label">{option.label}</span>
                    <span className="mode-desc">{option.description}</span>
                  </span>
                  {isActive ? <span className="check">✓</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

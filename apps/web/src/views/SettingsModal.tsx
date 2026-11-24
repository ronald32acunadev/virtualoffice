import type { LightingMood } from "../scene/officeTheme";
import { WORLD_THEMES, WORLD_THEME_IDS, type WorldThemeId } from "../scene/themes/registry";
import { Modal } from "./Modal";

export type ThemeOptionViewModel = {
  id: WorldThemeId;
  label: string;
  shortLabel: string;
  description: string;
  swatchColors: [string, string, string];
  selected: boolean;
};

export function buildThemeOptions(activeTheme: WorldThemeId): ThemeOptionViewModel[] {
  return WORLD_THEME_IDS.map((id) => {
    const theme = WORLD_THEMES[id];
    return {
      id,
      label: theme.label,
      shortLabel: theme.shortLabel,
      description: theme.description,
      swatchColors: theme.swatchColors,
      selected: id === activeTheme,
    };
  });
}

export type SettingsModalProps = {
  open: boolean;
  theme: WorldThemeId;
  mood: LightingMood;
  chatterEnabled?: boolean;
  onSelectTheme: (theme: WorldThemeId) => void;
  onSelectMood: (mood: LightingMood) => void;
  onToggleChatter?: () => void;
  onClose: () => void;
};

export function SettingsModal({
  open,
  theme,
  mood,
  chatterEnabled,
  onSelectTheme,
  onSelectMood,
  onToggleChatter,
  onClose,
}: SettingsModalProps) {
  if (!open) {
    return null;
  }

  const themeOptions = buildThemeOptions(theme);

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings-modal-body">
        <section>
          <h3>World Theme</h3>
          <div className="settings-theme-grid">
            {themeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.selected ? "settings-theme-card is-selected" : "settings-theme-card"}
                aria-pressed={option.selected}
                onClick={() => onSelectTheme(option.id)}
              >
                <div className="settings-theme-swatches">
                  {option.swatchColors.map((color) => (
                    <span key={color} className="settings-swatch" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <span className="settings-theme-label">{option.label}</span>
                <span className="settings-theme-desc">{option.description}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Lighting Mood</h3>
          <div className="settings-toggle-row">
            <button
              type="button"
              aria-pressed={mood === "day"}
              onClick={() => onSelectMood("day")}
            >
              ☀ Day
            </button>
            <button
              type="button"
              aria-pressed={mood === "evening"}
              onClick={() => onSelectMood("evening")}
            >
              🌙 Evening
            </button>
          </div>
        </section>
        {onToggleChatter && (
          <section>
            <h3>Speech Bubbles</h3>
            <button
              type="button"
              aria-pressed={Boolean(chatterEnabled)}
              onClick={onToggleChatter}
            >
              {chatterEnabled ? "💬 Quotes enabled" : "🔇 Quotes muted"}
            </button>
          </section>
        )}
      </div>
    </Modal>
  );
}

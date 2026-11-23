import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { MediaPlaybackState, MediaPreset, MediaProvider } from "../api/types";
import { MEDIA_APP_OPTIONS, detectMediaProviderFromUrl, getMediaAppOption, validateMediaFormInput } from "../state/media";
import { ApiError } from "../api/client";

export type MediaDrawerProps = {
  open: boolean;
  media: MediaPlaybackState | null;
  presets: MediaPreset[];
  onClose: () => void;
  onFocusTv: () => void;
  onPlay: (input: { url: string; provider?: MediaProvider; title?: string }) => Promise<MediaPlaybackState>;
  onTurnOff: () => Promise<void>;
  onSavePreset: (input: { url: string; provider?: MediaProvider; title?: string }) => Promise<MediaPreset>;
  onDeletePreset: (id: string) => Promise<void>;
};

export function MediaDrawer({
  open,
  media,
  presets,
  onClose,
  onFocusTv,
  onPlay,
  onTurnOff,
  onSavePreset,
  onDeletePreset,
}: MediaDrawerProps) {
  const [provider, setProvider] = useState<MediaProvider>(media?.provider ?? "youtube_music");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const activeOption = getMediaAppOption(provider);

  const handleUrlChange = (nextUrl: string) => {
    setUrl(nextUrl);
    const detected = detectMediaProviderFromUrl(nextUrl);
    if (detected !== null) {
      setProvider(detected);
    }
    setError(null);
  };

  const handlePlay = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateMediaFormInput(url, provider);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onPlay({ url: url.trim(), provider, ...(title.trim() ? { title: title.trim() } : {}) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to play on TV");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const validationError = validateMediaFormInput(url, provider);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSavePreset({ url: url.trim(), provider, ...(title.trim() ? { title: title.trim() } : {}) });
      setUrl("");
      setTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to save station");
    } finally {
      setBusy(false);
    }
  };

  const handleTurnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      await onTurnOff();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to turn off TV");
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePreset = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await onDeletePreset(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to remove station");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="media-drawer" role="dialog" aria-label="Office Media TV controls">
      <div className="media-drawer-head">
        <h2>Office TV &amp; Music</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {media !== null && (
        <div className="media-now-playing">
          <span
            className="media-provider-badge"
            style={{ "--app-accent": getMediaAppOption(media.provider).accent } as CSSProperties}
          >
            {getMediaAppOption(media.provider).badge}
          </span>
          <span className="media-now-title">{media.title}</span>
          <button type="button" onClick={onFocusTv}>
            Focus TV
          </button>
          <button type="button" onClick={handleTurnOff} disabled={busy}>
            Turn off TV
          </button>
        </div>
      )}

      <div className="media-app-grid" role="radiogroup" aria-label="Choose media app">
        {MEDIA_APP_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={provider === opt.id}
            className={provider === opt.id ? "media-app-tile is-selected" : "media-app-tile"}
            style={{ "--app-accent": opt.accent } as CSSProperties}
            onClick={() => {
              setProvider(opt.id);
              setError(null);
            }}
          >
            <span className="media-app-badge">{opt.badge}</span>
            <span className="media-app-name">{opt.name}</span>
            <span className="media-app-subtitle">{opt.subtitle}</span>
          </button>
        ))}
      </div>

      <form className="media-form" onSubmit={handlePlay}>
        <input
          type="text"
          placeholder={activeOption.placeholder}
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
        />
        <input
          type="text"
          placeholder="Optional label (auto-detected if empty)"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        {activeOption.playbackHint !== null && (
          <p className="media-hint">{activeOption.playbackHint}</p>
        )}
        {error !== null && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="media-form-actions">
          <button type="submit" disabled={busy}>
            Play on TV
          </button>
          <button type="button" onClick={handleSave} disabled={busy}>
            Save station
          </button>
        </div>
      </form>

      <div className="media-presets-section">
        <h3>
          Saved stations <span className="media-preset-count">{presets.length}</span>
        </h3>
        {presets.length === 0 ? (
          <p className="media-presets-empty">No saved stations yet. Paste a link above and click Save station.</p>
        ) : (
          <ul className="media-preset-list">
            {presets.map((preset) => {
              const opt = getMediaAppOption(preset.provider);
              return (
                <li key={preset.id} className="media-preset-row">
                  <span
                    className="media-preset-badge"
                    style={{ "--app-accent": opt.accent } as CSSProperties}
                  >
                    {opt.badge}
                  </span>
                  <span className="media-preset-title">{preset.title}</span>
                  <div className="media-preset-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        setError(null);
                        onPlay({ url: preset.sourceUrl, provider: preset.provider, title: preset.title })
                          .catch((err) => {
                            setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to play station");
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDeletePreset(preset.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

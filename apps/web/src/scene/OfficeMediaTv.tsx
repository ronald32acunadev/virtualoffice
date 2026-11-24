import type { RefObject } from "react";
import { Html } from "@react-three/drei";
import type { MediaPlaybackState } from "../api/types";
import type { LightingMood } from "./officeTheme";
import {
  MEDIA_PROVIDER_VISUALS,
  TV_BEZEL_SIZE,
  TV_HTML_CONFIG,
  TV_MOUNT_POSITION,
  getTvScreenModel,
} from "./mediaTv";
import type { WorldThemeId } from "./themes/registry";
import { getThemeTvFrameStyle } from "./themes/themeProps";

export type OfficeMediaTvProps = {
  media: MediaPlaybackState | null;
  mood: LightingMood;
  theme?: WorldThemeId;
  onOpenDrawer: () => void;
  onFocusTv: () => void;
  onTurnOff: () => void;
  portalRef?: RefObject<HTMLElement | null>;
};

export function OfficeMediaTv({
  media,
  mood,
  theme = "office",
  onOpenDrawer,
  onFocusTv,
  onTurnOff,
  portalRef,
}: OfficeMediaTvProps) {
  const screen = getTvScreenModel(media);
  const visual = screen.mode === "playing" ? MEDIA_PROVIDER_VISUALS[screen.provider] : null;
  const frameStyle = getThemeTvFrameStyle(theme);

  return (
    <group position={TV_MOUNT_POSITION}>
      <mesh position={[0, 0, -0.09]}>
        <boxGeometry args={[1.4, 0.75, 0.08]} />
        <meshStandardMaterial color={frameStyle.mountColor} metalness={0.7} roughness={0.4} />
      </mesh>

      <mesh castShadow receiveShadow>
        <boxGeometry
          args={[TV_BEZEL_SIZE.width, TV_BEZEL_SIZE.height, TV_BEZEL_SIZE.depth]}
        />
        <meshStandardMaterial
          color={frameStyle.bezelColor}
          roughness={0.35}
          metalness={0.5}
        />
      </mesh>

      <mesh position={[0, 0, TV_BEZEL_SIZE.depth / 2 + 0.004]}>
        <planeGeometry
          args={[TV_BEZEL_SIZE.width - 0.18, TV_BEZEL_SIZE.height - 0.18]}
        />
        <meshStandardMaterial
          color="#0b0f17"
          emissive={screen.ledColor}
          emissiveIntensity={
            mood === "evening"
              ? screen.emissiveIntensity * 0.4
              : screen.emissiveIntensity * 0.18
          }
        />
      </mesh>

      <mesh position={[0, -(TV_BEZEL_SIZE.height / 2) - 0.11, 0.02]}>
        <boxGeometry args={[2.3, 0.11, 0.11]} />
        <meshStandardMaterial color={frameStyle.soundbarColor} />
      </mesh>

      <mesh
        position={[
          TV_BEZEL_SIZE.width / 2 - 0.22,
          -(TV_BEZEL_SIZE.height / 2) + 0.06,
          TV_BEZEL_SIZE.depth / 2 + 0.015,
        ]}
      >
        <sphereGeometry args={[0.032, 10, 10]} />
        <meshStandardMaterial
          color={screen.ledColor}
          emissive={screen.ledColor}
          emissiveIntensity={screen.mode === "playing" ? 1.8 : 0.4}
        />
      </mesh>

      {screen.mode === "playing" && (
        <pointLight
          position={[0, 0, 0.6]}
          color={screen.ledColor}
          intensity={mood === "evening" ? 1.1 : 0.35}
          distance={7}
          decay={2}
        />
      )}

      <Html
        transform
        portal={portalRef as RefObject<HTMLElement> | undefined}
        position={[0, 0, TV_BEZEL_SIZE.depth / 2 + 0.02]}
        distanceFactor={TV_HTML_CONFIG.distanceFactor}
        zIndexRange={[8, 0]}
      >
        <div
          className={`tv-screen-shell tv-screen-${screen.mode}`}
          style={{
            width: `${TV_HTML_CONFIG.widthPx}px`,
            height: `${TV_HTML_CONFIG.heightPx}px`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {screen.mode === "standby" ? (
            <div className="tv-standby">
              <div className="tv-standby-header">{frameStyle.standbyTitle}</div>
              <div className="tv-standby-subtitle">
                {frameStyle.standbySubtitle}
              </div>
              <div className="tv-standby-providers">
                <span
                  className="tv-provider-pill"
                  style={{
                    background: MEDIA_PROVIDER_VISUALS.spotify.badgeBg,
                    color: MEDIA_PROVIDER_VISUALS.spotify.badgeText,
                    borderColor: MEDIA_PROVIDER_VISUALS.spotify.accent,
                  }}
                >
                  Spotify
                </span>
                <span
                  className="tv-provider-pill"
                  style={{
                    background: MEDIA_PROVIDER_VISUALS.youtube_music.badgeBg,
                    color: MEDIA_PROVIDER_VISUALS.youtube_music.badgeText,
                    borderColor: MEDIA_PROVIDER_VISUALS.youtube_music.accent,
                  }}
                >
                  YouTube Music / Video
                </span>
                <span
                  className="tv-provider-pill"
                  style={{
                    background: MEDIA_PROVIDER_VISUALS.apple_music.badgeBg,
                    color: MEDIA_PROVIDER_VISUALS.apple_music.badgeText,
                    borderColor: MEDIA_PROVIDER_VISUALS.apple_music.accent,
                  }}
                >
                  Apple Music
                </span>
              </div>
              <button
                type="button"
                className="tv-standby-btn"
                onClick={onOpenDrawer}
              >
                Choose App &amp; Play
              </button>
            </div>
          ) : (
            <>
              <div className="tv-topbar">
                <span
                  className="tv-provider-pill"
                  style={{
                    background: visual!.badgeBg,
                    color: visual!.badgeText,
                    borderColor: visual!.accent,
                  }}
                >
                  {screen.providerLabel}
                </span>
                <span className="tv-title" title={screen.title}>
                  {screen.title}
                </span>
                <div className="tv-topbar-actions">
                  <button
                    type="button"
                    className="tv-ctrl-btn"
                    onClick={onFocusTv}
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    className="tv-ctrl-btn"
                    onClick={onOpenDrawer}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="tv-ctrl-btn tv-ctrl-off"
                    onClick={onTurnOff}
                  >
                    Off
                  </button>
                </div>
              </div>
              <div className="tv-iframe-wrap">
                <iframe
                  key={screen.embedUrl}
                  className="tv-iframe"
                  src={screen.embedUrl}
                  title={screen.title}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </>
          )}
        </div>
      </Html>
    </group>
  );
}

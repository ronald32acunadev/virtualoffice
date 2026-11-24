import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Boss, BossId, EmployeeStatus } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { aggregateAgentActivity, aggregateAgentStatus } from "../state/agentView";
import { BossArea } from "./BossArea";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  TV_FOCUS_CAMERA_POSITION,
  TV_FOCUS_CAMERA_TARGET,
  clampCameraTarget,
} from "./camera";
import { Character } from "./Character";
import { McpAgentStation, type ActiveMcpRequest } from "./McpAgentStation";
import { OfficeMediaTv } from "./OfficeMediaTv";
import { MCP_HUB_POSITION, employeeDeskPosition } from "./layout";
import { pickOfficeQuote, pickSpeaker } from "./officeQuotes";
import { OfficeRoom } from "./OfficeRoom";
import type { LightingMood } from "./officeTheme";
import { getThemePalette, type WorldThemeId } from "./themes/registry";

const FALLBACK_BOSSES: { id: BossId; name: string; available: boolean }[] = [
  { id: "claude", name: "Claude", available: true },
  { id: "codex", name: "Codex", available: false },
  { id: "opencode", name: "OpenCode", available: false },
  { id: "gemini", name: "Gemini", available: false },
];

function CameraRig({ resetToken, focusTvToken }: { resetToken: number; focusTvToken: number }) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const goalRef = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const prevResetTokenRef = useRef(resetToken);
  const prevFocusTvTokenRef = useRef(focusTvToken);
  const defaultPosRef = useRef(new Vector3(...DEFAULT_CAMERA_POSITION));
  const defaultTargetRef = useRef(new Vector3(...DEFAULT_CAMERA_TARGET));
  const tvPosRef = useRef(new Vector3(...TV_FOCUS_CAMERA_POSITION));
  const tvTargetRef = useRef(new Vector3(...TV_FOCUS_CAMERA_TARGET));

  useEffect(() => {
    if (resetToken !== prevResetTokenRef.current) {
      prevResetTokenRef.current = resetToken;
      goalRef.current = { position: defaultPosRef.current, target: defaultTargetRef.current };
    }
  }, [resetToken]);

  useEffect(() => {
    if (focusTvToken !== prevFocusTvTokenRef.current) {
      prevFocusTvTokenRef.current = focusTvToken;
      goalRef.current = { position: tvPosRef.current, target: tvTargetRef.current };
    }
  }, [focusTvToken]);

  useFrame((_, delta) => {
    const goal = goalRef.current;
    if (!goal || !controlsRef.current) return;
    const controls = controlsRef.current;
    const alpha = 1 - Math.exp(-7 * Math.min(delta, 0.1));
    camera.position.lerp(goal.position, alpha);
    controls.target.lerp(goal.target, alpha);
    controls.update();

    if (
      camera.position.distanceTo(goal.position) < 0.05 &&
      controls.target.distanceTo(goal.target) < 0.03
    ) {
      camera.position.copy(goal.position);
      controls.target.copy(goal.target);
      controls.update();
      goalRef.current = null;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning={false}
      minDistance={7}
      maxDistance={38}
      minPolarAngle={Math.PI / 8}
      maxPolarAngle={Math.PI / 2.25}
      target={DEFAULT_CAMERA_TARGET}
      onStart={() => {
        goalRef.current = null;
      }}
      onChange={() => {
        const controls = controlsRef.current;
        if (!controls) return;
        const [cx, cy, cz] = clampCameraTarget(
          controls.target.x,
          controls.target.y,
          controls.target.z,
        );
        if (cx !== controls.target.x || cy !== controls.target.y || cz !== controls.target.z) {
          controls.target.set(cx, cy, cz);
        }
      }}
    />
  );
}

type Speaker = { id: string; status?: EmployeeStatus };

export function OfficeScene({
  selectedAgentId = null,
  onSelectAgent,
  onClear,
  mood = "day",
  resetToken = 0,
  chatterEnabled = true,
  focusTvToken = 0,
  onOpenMediaDrawer = () => {},
  onFocusTv = () => {},
  onTurnOffMedia = () => {},
  tvPortalRef,
  theme = "office",
}: {
  selectedAgentId?: string | null;
  onSelectAgent: (agentId: string) => void;
  onClear: () => void;
  mood?: LightingMood;
  resetToken?: number;
  chatterEnabled?: boolean;
  focusTvToken?: number;
  onOpenMediaDrawer?: () => void;
  onFocusTv?: () => void;
  onTurnOffMedia?: () => void;
  tvPortalRef?: RefObject<HTMLElement | null>;
  theme?: WorldThemeId;
}) {
  const { state } = useOffice();
  const bosses: Boss[] = state.bosses.length > 0 ? state.bosses : FALLBACK_BOSSES;
  const palette = getThemePalette(theme, mood);
  const themeRef = useRef<WorldThemeId>(theme);
  themeRef.current = theme;

  useEffect(() => {
    setActiveSpeech(null);
  }, [theme]);

  const [activeSpeech, setActiveSpeech] = useState<{ speakerId: string; text: string } | null>(null);
  const lastSpeakerIdRef = useRef<string | null>(null);
  const lastQuoteBySpeakerRef = useRef<Map<string, string>>(new Map());

  const placedAgents = useMemo(() => {
    const indexByBoss = new Map<BossId, number>();
    return state.agents.map((agent) => {
      const index = indexByBoss.get(agent.bossId) ?? 0;
      indexByBoss.set(agent.bossId, index + 1);
      const chats = state.employees
        .filter((e) => e.agentId === agent.id)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const boss = bosses.find((b) => b.id === agent.bossId);
      const status = aggregateAgentStatus(chats, boss);
      const activity = aggregateAgentActivity(chats);
      return {
        agent,
        chats,
        status,
        activity,
        latestTask: chats[0]?.task ?? null,
        position: employeeDeskPosition(agent.bossId, index),
      };
    });
  }, [state.agents, state.employees, bosses]);

  const activeMcpRequests = useMemo<ActiveMcpRequest[]>(() => {
    const list: ActiveMcpRequest[] = [];
    for (const item of placedAgents) {
      if (item.status === "working" && item.activity?.category === "mcp_request") {
        list.push({
          agentId: item.agent.id,
          fromPosition: item.position,
          serverName: item.activity.serverName ?? "MCP",
          label: item.activity.label,
        });
      }
    }
    return list;
  }, [placedAgents]);

  const speakers = useMemo<Speaker[]>(() => {
    const list: Speaker[] = placedAgents.map(({ agent, status }) => ({
      id: agent.id,
      status,
    }));
    for (const boss of bosses) {
      if (boss.available) {
        list.push({ id: `boss:${boss.id}`, status: boss.onBreak ? "on_break" : undefined });
      }
    }
    return list;
  }, [placedAgents, bosses]);

  const speakersRef = useRef(speakers);
  speakersRef.current = speakers;
  const hasSpeakers = speakers.length > 0;

  useEffect(() => {
    if (!chatterEnabled || !hasSpeakers) {
      setActiveSpeech(null);
      return;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delayMs: number) => {
      timerId = setTimeout(() => {
        if (cancelled) return;
        const speaker = pickSpeaker(speakersRef.current, lastSpeakerIdRef.current);
        if (!speaker) {
          setActiveSpeech(null);
          return;
        }
        const lastQuote = lastQuoteBySpeakerRef.current.get(speaker.id) ?? null;
        const quote = pickOfficeQuote(speaker.status, lastQuote, Math.random, themeRef.current);
        lastSpeakerIdRef.current = speaker.id;
        lastQuoteBySpeakerRef.current.set(speaker.id, quote);
        setActiveSpeech({ speakerId: speaker.id, text: quote });

        timerId = setTimeout(() => {
          if (cancelled) return;
          setActiveSpeech(null);
          const pauseMs = 4500 + Math.random() * 3000;
          scheduleNext(pauseMs);
        }, 4800);
      }, delayMs);
    };

    scheduleNext(2200);

    return () => {
      cancelled = true;
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    };
  }, [chatterEnabled, hasSpeakers]);

  return (
    <Canvas shadows camera={{ position: DEFAULT_CAMERA_POSITION, fov: 42 }} onPointerMissed={onClear}>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, palette.fogNear, palette.fogFar]} />

      <ambientLight intensity={palette.ambientIntensity} />
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiIntensity]} />
      <directionalLight
        castShadow
        position={palette.sunPosition}
        intensity={palette.sunIntensity}
        color={palette.sunColor}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-12, 10, -10]} intensity={palette.fillIntensity} color={palette.fillColor} />

      <OfficeRoom mood={mood} theme={theme} />
      <OfficeMediaTv
        media={state.media}
        mood={mood}
        theme={theme}
        onOpenDrawer={onOpenMediaDrawer}
        onFocusTv={onFocusTv}
        onTurnOff={onTurnOffMedia}
        portalRef={tvPortalRef}
      />

      <McpAgentStation activeRequests={activeMcpRequests} theme={theme} />

      {bosses.map((boss) => (
        <BossArea
          key={boss.id}
          boss={boss}
          mood={mood}
          theme={theme}
          speechText={activeSpeech?.speakerId === `boss:${boss.id}` ? activeSpeech.text : null}
        />
      ))}
      {placedAgents.map(({ agent, status, activity, chats, latestTask, position }) => (
        <Character
          key={agent.id}
          agent={agent}
          status={status}
          activity={activity}
          chatCount={chats.length}
          latestTask={latestTask}
          position={position}
          selected={selectedAgentId === agent.id}
          onSelect={onSelectAgent}
          lampOn={mood === "evening"}
          theme={theme}
          mcpTargetPosition={MCP_HUB_POSITION}
          speechText={activeSpeech?.speakerId === agent.id ? activeSpeech.text : null}
        />
      ))}
      <CameraRig resetToken={resetToken} focusTvToken={focusTvToken} />
    </Canvas>
  );
}

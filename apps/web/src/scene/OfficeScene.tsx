import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { BossId, EmployeeStatus } from "../api/types";
import { useOffice } from "../state/OfficeProvider";
import { BossArea } from "./BossArea";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  clampCameraTarget,
} from "./camera";
import { Character } from "./Character";
import { employeeDeskPosition } from "./layout";
import { pickOfficeQuote, pickSpeaker } from "./officeQuotes";
import { OfficeRoom } from "./OfficeRoom";
import { MOOD_PALETTES, type LightingMood } from "./officeTheme";

const FALLBACK_BOSSES: { id: BossId; name: string; available: boolean }[] = [
  { id: "claude", name: "Claude", available: true },
  { id: "codex", name: "Codex", available: false },
  { id: "opencode", name: "OpenCode", available: false },
  { id: "gemini", name: "Gemini", available: false },
];

function CameraRig({ resetToken }: { resetToken: number }) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const resettingRef = useRef(false);
  const prevTokenRef = useRef(resetToken);
  const defaultPosRef = useRef(new Vector3(...DEFAULT_CAMERA_POSITION));
  const defaultTargetRef = useRef(new Vector3(...DEFAULT_CAMERA_TARGET));

  useEffect(() => {
    if (resetToken !== prevTokenRef.current) {
      prevTokenRef.current = resetToken;
      resettingRef.current = true;
    }
  }, [resetToken]);

  useFrame((_, delta) => {
    if (!resettingRef.current || !controlsRef.current) return;
    const controls = controlsRef.current;
    const alpha = 1 - Math.exp(-7 * Math.min(delta, 0.1));
    camera.position.lerp(defaultPosRef.current, alpha);
    controls.target.lerp(defaultTargetRef.current, alpha);
    controls.update();

    if (
      camera.position.distanceTo(defaultPosRef.current) < 0.05 &&
      controls.target.distanceTo(defaultTargetRef.current) < 0.03
    ) {
      camera.position.copy(defaultPosRef.current);
      controls.target.copy(defaultTargetRef.current);
      controls.update();
      resettingRef.current = false;
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
        resettingRef.current = false;
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
  onSelectEmployee,
  onClear,
  mood = "day",
  resetToken = 0,
  chatterEnabled = true,
}: {
  onSelectEmployee: (employeeId: string) => void;
  onClear: () => void;
  mood?: LightingMood;
  resetToken?: number;
  chatterEnabled?: boolean;
}) {
  const { state } = useOffice();
  const bosses = state.bosses.length > 0 ? state.bosses : FALLBACK_BOSSES;
  const palette = MOOD_PALETTES[mood];

  const [activeSpeech, setActiveSpeech] = useState<{ speakerId: string; text: string } | null>(null);
  const lastSpeakerIdRef = useRef<string | null>(null);
  const lastQuoteBySpeakerRef = useRef<Map<string, string>>(new Map());

  const speakers = useMemo<Speaker[]>(() => {
    const list: Speaker[] = state.employees.map((employee) => ({
      id: employee.id,
      status: employee.status,
    }));
    for (const boss of bosses) {
      if (boss.available) {
        list.push({ id: `boss:${boss.id}`, status: undefined });
      }
    }
    return list;
  }, [state.employees, bosses]);

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
        const quote = pickOfficeQuote(speaker.status, lastQuote);
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

  const indexByBoss = new Map<BossId, number>();
  const placed = state.employees.map((employee) => {
    const index = indexByBoss.get(employee.bossId) ?? 0;
    indexByBoss.set(employee.bossId, index + 1);
    return { employee, position: employeeDeskPosition(employee.bossId, index) };
  });

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

      <OfficeRoom mood={mood} />

      {bosses.map((boss) => (
        <BossArea
          key={boss.id}
          boss={boss}
          mood={mood}
          speechText={activeSpeech?.speakerId === `boss:${boss.id}` ? activeSpeech.text : null}
        />
      ))}
      {placed.map(({ employee, position }) => (
        <Character
          key={employee.id}
          employee={employee}
          position={position}
          selected={state.selectedId === employee.id}
          onSelect={onSelectEmployee}
          lampOn={mood === "evening"}
          speechText={activeSpeech?.speakerId === employee.id ? activeSpeech.text : null}
        />
      ))}
      <CameraRig resetToken={resetToken} />
    </Canvas>
  );
}

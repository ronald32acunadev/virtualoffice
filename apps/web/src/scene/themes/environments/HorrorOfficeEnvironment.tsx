import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { OFFICE_HALF_SIZE, type LightingMood } from "../../officeTheme";
import { getThemePalette } from "../registry";
import { HORROR_PROPS, type ThemePropPlacement } from "../themeProps";

function CandleCluster({ placement }: { placement: ThemePropPlacement }) {
  const lightRef = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    if (lightRef.current) {
      const t = clock.elapsedTime;
      const flicker = 0.85 + Math.sin(t * 11.3) * 0.08 + Math.sin(t * 23.7) * 0.05;
      lightRef.current.intensity = 1.6 * flicker;
    }
  });

  const candles = [
    { x: -0.18, h: 0.42 },
    { x: 0.0, h: 0.58 },
    { x: 0.18, h: 0.36 },
  ];

  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.36, 0.06, 24]} />
        <meshStandardMaterial color="#1a1512" roughness={0.9} />
      </mesh>
      {candles.map((c, i) => (
        <group key={i} position={[c.x, 0.06, 0]}>
          <mesh position={[0, c.h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.05, c.h, 12]} />
            <meshStandardMaterial color="#d8cfc0" roughness={0.7} />
          </mesh>
          <mesh position={[0, c.h + 0.06, 0]}>
            <coneGeometry args={[0.035, 0.12, 8]} />
            <meshStandardMaterial
              color="#ffb347"
              emissive="#ff8c1a"
              emissiveIntensity={2.2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <pointLight
        ref={lightRef}
        position={[0, 0.7, 0]}
        color="#ff9a3c"
        intensity={1.6}
        distance={6}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}

function Cobweb({ placement }: { placement: ThemePropPlacement }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshStandardMaterial
          color="#cfd4d8"
          transparent
          opacity={0.32}
          side={2}
          roughness={1}
        />
      </mesh>
      <mesh position={[0, 0, 0.01]} rotation={[0, 0, Math.PI / 8]}>
        <planeGeometry args={[1.0, 1.0]} />
        <meshStandardMaterial
          color="#e6eaee"
          transparent
          opacity={0.32}
          side={2}
          roughness={1}
        />
      </mesh>
      <mesh position={[0, -0.1, 0.02]}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshStandardMaterial
          color="#f2f4f6"
          transparent
          opacity={0.32}
          side={2}
          roughness={1}
        />
      </mesh>
    </group>
  );
}

function HauntedFrame({ placement }: { placement: ThemePropPlacement }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <group rotation={[0, 0, -0.06]}>
        <mesh castShadow>
          <boxGeometry args={[0.9, 1.2, 0.06]} />
          <meshStandardMaterial color="#14100f" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={[0.72, 1.02]} />
          <meshStandardMaterial
            color="#3a1020"
            emissive="#5a1030"
            emissiveIntensity={0.5}
            roughness={0.6}
          />
        </mesh>
        <mesh position={[0, 0.12, 0.04]}>
          <circleGeometry args={[0.18, 24]} />
          <meshStandardMaterial
            color="#6a1a3a"
            emissive="#8a2050"
            emissiveIntensity={0.7}
            roughness={0.5}
          />
        </mesh>
      </group>
    </group>
  );
}

function DeadPlant({ placement }: { placement: ThemePropPlacement }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.16, 0.4, 16]} />
        <meshStandardMaterial color="#241c18" roughness={0.95} />
      </mesh>
      <mesh position={[0.05, 0.42, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.015, 0.02, 0.5, 6]} />
        <meshStandardMaterial color="#1a1410" roughness={1} />
      </mesh>
      <mesh position={[-0.06, 0.4, 0.02]} rotation={[0.2, 0, -0.4]}>
        <cylinderGeometry args={[0.012, 0.018, 0.45, 6]} />
        <meshStandardMaterial color="#1a1410" roughness={1} />
      </mesh>
      <mesh position={[0, 0.45, -0.04]} rotation={[-0.3, 0, 0.15]}>
        <cylinderGeometry args={[0.01, 0.016, 0.5, 6]} />
        <meshStandardMaterial color="#1a1410" roughness={1} />
      </mesh>
    </group>
  );
}

function BoardedWindow({
  position,
  rotation,
  glowColor,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  glowColor: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[1.6, 2.2]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={0.9}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.02]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[1.8, 0.18, 0.04]} />
        <meshStandardMaterial color="#1c1410" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[1.8, 0.18, 0.04]} />
        <meshStandardMaterial color="#1c1410" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.04]} rotation={[0, 0, 0.05]}>
        <boxGeometry args={[1.8, 0.18, 0.04]} />
        <meshStandardMaterial color="#1c1410" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function HorrorOfficeEnvironment({ mood }: { mood: LightingMood }) {
  const palette = getThemePalette("horror", mood);
  const isEvening = mood === "evening";
  const floorSize = OFFICE_HALF_SIZE * 2;

  const floorColor = isEvening ? "#1f1a1c" : "#352e2b";

  return (
    <group>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={floorColor} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#0a0808" roughness={1} />
      </mesh>

      <group position={[0, 0, -15.225]}>
        <mesh position={[0, 2.7, 0]} receiveShadow>
          <boxGeometry args={[30, 5.4, 0.15]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.15, 0.08]}>
          <boxGeometry args={[30, 0.3, 0.05]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 5.25, 0.08]}>
          <boxGeometry args={[30, 0.3, 0.05]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.8} />
        </mesh>
        <BoardedWindow
          position={[-6, 2.8, 0.1]}
          rotation={[0, 0, 0]}
          glowColor={isEvening ? "#4a6a8a" : "#3a5a7a"}
        />
        <BoardedWindow
          position={[6, 2.8, 0.1]}
          rotation={[0, 0, 0]}
          glowColor={isEvening ? "#4a6a8a" : "#3a5a7a"}
        />
      </group>

      <group position={[-15.225, 0, 0]}>
        <mesh position={[0, 2.7, 0]} receiveShadow>
          <boxGeometry args={[0.15, 5.4, 30]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.9} />
        </mesh>
        <mesh position={[0.08, 0.15, 0]}>
          <boxGeometry args={[0.05, 0.3, 30]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.8} />
        </mesh>
        <mesh position={[0.08, 5.25, 0]}>
          <boxGeometry args={[0.05, 0.3, 30]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.8} />
        </mesh>
        <BoardedWindow
          position={[0.1, 2.8, -6]}
          rotation={[0, Math.PI / 2, 0]}
          glowColor={isEvening ? "#4a6a8a" : "#3a5a7a"}
        />
        <BoardedWindow
          position={[0.1, 2.8, 6]}
          rotation={[0, Math.PI / 2, 0]}
          glowColor={isEvening ? "#4a6a8a" : "#3a5a7a"}
        />
      </group>

      {HORROR_PROPS.map((placement) => {
        switch (placement.kind) {
          case "candle_cluster":
            return <CandleCluster key={placement.id} placement={placement} />;
          case "cobweb":
            return <Cobweb key={placement.id} placement={placement} />;
          case "haunted_frame":
            return <HauntedFrame key={placement.id} placement={placement} />;
          case "dead_plant":
            return <DeadPlant key={placement.id} placement={placement} />;
          default:
            return null;
        }
      })}
    </group>
  );
}

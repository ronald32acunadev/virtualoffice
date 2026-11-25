import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { OFFICE_HALF_SIZE, type LightingMood } from "../../officeTheme";
import { getThemePalette } from "../registry";
import { METAL_PROPS, type ThemePropPlacement } from "../themeProps";

function SpeakerStack({ placement }: { placement: ThemePropPlacement }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 1, 1]} />
        <meshStandardMaterial color="#111111" metalness={0.2} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 1, 1]} />
        <meshStandardMaterial color="#111111" metalness={0.2} roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 1, 1]} />
        <meshStandardMaterial color="#111111" metalness={0.2} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5, 0.51]}>
        <planeGeometry args={[1, 0.8]} />
        <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.5, 0.51]}>
        <planeGeometry args={[1, 0.8]} />
        <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.5, 0.51]}>
        <planeGeometry args={[1, 0.8]} />
        <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.5, 0.52]}>
        <planeGeometry args={[1.1, 0.05]} />
        <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.5, 0.52]}>
        <planeGeometry args={[1.1, 0.05]} />
        <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 2.5, 0.52]}>
        <planeGeometry args={[1.1, 0.05]} />
        <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function StageLightTower({ placement }: { placement: ThemePropPlacement }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.15, 5, 8]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[0.8, 0.6, 0.8]} />
        <meshStandardMaterial color="#222222" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 5.2, 0.41]}>
        <circleGeometry args={[0.3, 16]} />
        <meshStandardMaterial color="#e11d48" emissive="#e11d48" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0, 5.2, -0.41]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

function PyroPot({ placement, isEvening }: { placement: ThemePropPlacement; isEvening: boolean }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.35, 0.8, 12]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <coneGeometry args={[0.25, 1, 8]} />
        <meshStandardMaterial
          color={isEvening ? "#ff6b35" : "#e11d48"}
          emissive={isEvening ? "#ff6b35" : "#e11d48"}
          emissiveIntensity={isEvening ? 3 : 1.5}
        />
      </mesh>
    </group>
  );
}

function AmpCrate({ placement }: { placement: ThemePropPlacement }) {
  return (
    <group position={placement.position} rotation={[0, placement.rotationY ?? 0, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 1, 0.8]} />
        <meshStandardMaterial color="#333333" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.7, 0.5, 0.41]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.7, 0.5, 0.41]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.7, 0.5, -0.41]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.7, 0.5, -0.41]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
}

function Spotlight({ position, color }: { position: [number, number, number]; color: string }) {
  const lightRef = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) {
      const t = clock.getElapsedTime();
      lightRef.current.intensity = 1.5 + Math.sin(t * 2) * 0.5;
    }
  });
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.2, 0.3, 0.5, 8]} />
        <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.26, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
      </mesh>
      <pointLight ref={lightRef} color={color} intensity={1.5} distance={15} castShadow={false} />
    </group>
  );
}

export function MetalConcertEnvironment({ mood }: { mood: LightingMood }) {
  const palette = getThemePalette("metal", mood);
  const isEvening = mood === "evening";
  const floorSize = OFFICE_HALF_SIZE * 2;

  const deckColor = isEvening ? "#181a24" : "#2a2d38";

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[30, 0.1, 30]} />
        <meshStandardMaterial color={deckColor} metalness={0.35} roughness={0.55} />
      </mesh>

      <mesh position={[0, -0.35, 0]} receiveShadow>
        <boxGeometry args={[70, 0.1, 70]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.2} roughness={0.7} />
      </mesh>

      <mesh position={[0, 0.05, 15.05]}>
        <boxGeometry args={[30, 0.1, 0.1]} />
        <meshStandardMaterial color="#e11d48" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.05, -15.05]}>
        <boxGeometry args={[30, 0.1, 0.1]} />
        <meshStandardMaterial color="#e11d48" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[15.05, 0.05, 0]}>
        <boxGeometry args={[0.1, 0.1, 30]} />
        <meshStandardMaterial color="#7c3aed" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-15.05, 0.05, 0]}>
        <boxGeometry args={[0.1, 0.1, 30]} />
        <meshStandardMaterial color="#7c3aed" metalness={0.7} roughness={0.3} />
      </mesh>

      <mesh position={[-14.6, 3.1, -14.6]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 6.2, 8]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[14.6, 3.1, -14.6]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 6.2, 8]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-14.6, 3.1, 14.6]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 6.2, 8]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>

      <mesh position={[0, 6.2, -14.6]} castShadow>
        <boxGeometry args={[29.2, 0.3, 0.3]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-14.6, 6.2, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 29.2]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[14.6, 6.2, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 29.2]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>

      <Spotlight position={[-7, 6.2, -14.6]} color="#e11d48" />
      <Spotlight position={[0, 6.2, -14.6]} color="#7c3aed" />
      <Spotlight position={[7, 6.2, -14.6]} color="#f59e0b" />
      <Spotlight position={[14, 6.2, -14.6]} color="#e11d48" />

      <mesh position={[0, 2.7, -15.225]} receiveShadow>
        <boxGeometry args={[30, 5.4, 0.15]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.7} />
      </mesh>

      <mesh position={[0, 0.5, 14.85]} castShadow>
        <boxGeometry args={[30, 0.1, 0.1]} />
        <meshStandardMaterial color="#555555" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1, 14.85]} castShadow>
        <boxGeometry args={[30, 0.1, 0.1]} />
        <meshStandardMaterial color="#555555" metalness={0.8} roughness={0.2} />
      </mesh>

      {METAL_PROPS.map((placement) => {
        switch (placement.kind) {
          case "speaker_stack":
            return <SpeakerStack key={placement.id} placement={placement} />;
          case "stage_light_tower":
            return <StageLightTower key={placement.id} placement={placement} />;
          case "pyro_pot":
            return <PyroPot key={placement.id} placement={placement} isEvening={isEvening} />;
          case "amp_crate":
            return <AmpCrate key={placement.id} placement={placement} />;
          default:
            return null;
        }
      })}
    </group>
  );
}

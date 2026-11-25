import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, PointLight } from "three";
import { OFFICE_HALF_SIZE, type LightingMood } from "../../officeTheme";
import { getThemePalette } from "../registry";
import { WESTERN_PROPS, type ThemePropPlacement } from "../themeProps";

const TV_MOUNT_POSITION: [number, number, number] = [0.2, 2.95, -14.95];

function Campfire({ isEvening }: { isEvening: boolean }) {
  const flameRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = 1 + Math.sin(t * 12) * 0.08 + Math.sin(t * 7.3) * 0.05;
    if (flameRef.current) {
      flameRef.current.scale.set(1, flicker, 1);
    }
    if (lightRef.current) {
      const base = isEvening ? 2.4 : 1.2;
      lightRef.current.intensity = base + Math.sin(t * 10) * 0.15;
    }
  });

  const stonePositions: [number, number, number][] = [
    [0.55, 0.08, 0],
    [0.39, 0.08, 0.39],
    [0, 0.08, 0.55],
    [-0.39, 0.08, 0.39],
    [-0.55, 0.08, 0],
    [-0.39, 0.08, -0.39],
    [0, 0.08, -0.55],
    [0.39, 0.08, -0.39],
  ];

  return (
    <group>
      {stonePositions.map((pos, i) => (
        <mesh key={i} position={pos} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial color="#8a8a8a" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
        <meshStandardMaterial color="#5a3a1e" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[0, Math.PI / 2, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
        <meshStandardMaterial color="#4a2e16" roughness={0.85} />
      </mesh>
      <mesh ref={flameRef} position={[0, 0.55, 0]} castShadow>
        <coneGeometry args={[0.28, 0.7, 8]} />
        <meshStandardMaterial
          color="#ff8c2a"
          emissive="#ff6a1a"
          emissiveIntensity={isEvening ? 1.6 : 0.9}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <coneGeometry args={[0.18, 0.45, 8]} />
        <meshStandardMaterial
          color="#ffd24a"
          emissive="#ffb02a"
          emissiveIntensity={isEvening ? 2.0 : 1.2}
          roughness={0.3}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.7, 0]}
        color="#ff9a3a"
        intensity={isEvening ? 2.4 : 1.2}
        distance={6}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}

function Tent() {
  return (
    <group>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.1, 1.5, 4]} />
        <meshStandardMaterial color="#c9a878" roughness={0.9} side={2} />
      </mesh>
      <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#5a3a1e" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.45, 1.02]} castShadow>
        <planeGeometry args={[0.7, 0.9]} />
        <meshStandardMaterial color="#2a1a0e" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Cactus() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.22, 1.8, 12]} />
        <meshStandardMaterial color="#4a7a3a" roughness={0.8} />
      </mesh>
      <mesh position={[0.35, 1.1, 0]} rotation={[0, 0, -Math.PI / 3]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.9, 10]} />
        <meshStandardMaterial color="#4a7a3a" roughness={0.8} />
      </mesh>
      <mesh position={[-0.35, 0.95, 0]} rotation={[0, 0, Math.PI / 3]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.8, 10]} />
        <meshStandardMaterial color="#4a7a3a" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Barrel() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.9, 16]} />
        <meshStandardMaterial color="#6a4426" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.25, 0]} castShadow>
        <torusGeometry args={[0.33, 0.03, 8, 24]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <torusGeometry args={[0.33, 0.03, 8, 24]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

function WagonWheel() {
  const spokeCount = 8;
  const spokes = Array.from({ length: spokeCount }, (_, i) => {
    const angle = (i / spokeCount) * Math.PI * 2;
    return { angle };
  });

  return (
    <group rotation={[0, 0, -0.15]}>
      <mesh position={[0, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.7, 0.08, 8, 32]} />
        <meshStandardMaterial color="#5a3a1e" roughness={0.85} />
      </mesh>
      {spokes.map(({ angle }, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * 0.35, 0.7 + Math.sin(angle) * 0.35, 0]}
          rotation={[0, 0, angle]}
          castShadow
        >
          <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
          <meshStandardMaterial color="#4a2e16" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
        <meshStandardMaterial color="#3a2410" roughness={0.8} />
      </mesh>
    </group>
  );
}

function FencePost({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[0.18, 1.6, 0.18]} />
      <meshStandardMaterial color="#5a3a1e" roughness={0.9} />
    </mesh>
  );
}

function FenceRail({
  start,
  end,
  height,
}: {
  start: [number, number, number];
  end: [number, number, number];
  height: number;
}) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  return (
    <mesh position={[midX, height, midZ]} rotation={[0, -angle, 0]} castShadow>
      <boxGeometry args={[length, 0.1, 0.08]} />
      <meshStandardMaterial color="#4a2e16" roughness={0.9} />
    </mesh>
  );
}

function Lantern({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.15, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.4, 0]} castShadow>
        <boxGeometry args={[0.15, 0.25, 0.15]} />
        <meshStandardMaterial
          color="#ffcc66"
          emissive="#ffaa33"
          emissiveIntensity={1.8}
          roughness={0.3}
        />
      </mesh>
      <pointLight
        position={[0, -0.4, 0]}
        color="#ffbb55"
        intensity={1.5}
        distance={4}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}

function MarqueeArch() {
  const [cx, cy, cz] = TV_MOUNT_POSITION;
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[-2.5, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.25, 3.0, 0.25]} />
        <meshStandardMaterial color="#5a3a1e" roughness={0.9} />
      </mesh>
      <mesh position={[2.5, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.25, 3.0, 0.25]} />
        <meshStandardMaterial color="#5a3a1e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <boxGeometry args={[5.5, 0.3, 0.3]} />
        <meshStandardMaterial color="#4a2e16" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <boxGeometry args={[5.3, 0.15, 0.2]} />
        <meshStandardMaterial color="#6a4426" roughness={0.85} />
      </mesh>
    </group>
  );
}

function MesaSilhouette({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow={false}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function renderProp(placement: ThemePropPlacement, isEvening: boolean) {
  const pos: [number, number, number] = [
    placement.position[0],
    placement.position[1],
    placement.position[2],
  ];

  switch (placement.id) {
    case "campfire":
      return <Campfire key={placement.id} isEvening={isEvening} />;
    case "tent":
      return <Tent key={placement.id} />;
    case "cactus":
      return <Cactus key={placement.id} />;
    case "barrel":
      return <Barrel key={placement.id} />;
    case "wagon_wheel":
      return <WagonWheel key={placement.id} />;
    default:
      return null;
  }
}

export function WesternCampEnvironment({ mood }: { mood: LightingMood }) {
  const palette = getThemePalette("western", mood);
  const isEvening = mood === "evening";

  const groundColor = isEvening ? "#6a4e32" : "#d4a66a";
  const mesaColor = isEvening ? "#5a3a22" : "#b88a5a";
  const canyonColor = isEvening ? "#4a2a18" : "#9a5a3a";

  const fencePostSpacing = 2.5;
  const backFenceStartX = -15;
  const backFenceEndX = -3;
  const leftFenceStartZ = -15;
  const leftFenceEndZ = -3;

  const backPosts: number[] = [];
  for (let x = backFenceStartX; x <= backFenceEndX + 0.01; x += fencePostSpacing) {
    backPosts.push(x);
  }

  const leftPosts: number[] = [];
  for (let z = leftFenceStartZ; z <= leftFenceEndZ + 0.01; z += fencePostSpacing) {
    leftPosts.push(z);
  }

  const lanternPositions: [number, number, number][] = [];
  if (isEvening) {
    lanternPositions.push([backFenceStartX, 1.6, -15]);
    lanternPositions.push([-15, 1.6, leftFenceStartZ]);
  }

  return (
    <group>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OFFICE_HALF_SIZE * 2, OFFICE_HALF_SIZE * 2]} />
        <meshStandardMaterial color={groundColor} roughness={0.95} />
      </mesh>

      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color={mesaColor} roughness={1} />
      </mesh>

      <MesaSilhouette
        position={[-5, 3, -20]}
        size={[8, 6, 2]}
        color={canyonColor}
      />
      <MesaSilhouette
        position={[3, 4, -21]}
        size={[6, 8, 2]}
        color={canyonColor}
      />
      <MesaSilhouette
        position={[-12, 2.5, -19.5]}
        size={[5, 5, 1.5]}
        color={canyonColor}
      />
      <MesaSilhouette
        position={[-20, 3.5, -5]}
        size={[2, 7, 8]}
        color={canyonColor}
      />
      <MesaSilhouette
        position={[-21, 2.5, 3]}
        size={[1.5, 5, 6]}
        color={canyonColor}
      />
      <MesaSilhouette
        position={[-19.5, 4, -12]}
        size={[2, 8, 5]}
        color={canyonColor}
      />

      {backPosts.map((x) => (
        <FencePost key={`bp-${x}`} position={[x, 0.8, -15]} />
      ))}
      {leftPosts.map((z) => (
        <FencePost key={`lp-${z}`} position={[-15, 0.8, z]} />
      ))}

      <FenceRail
        start={[backFenceStartX, 0.5, -15]}
        end={[backFenceEndX, 0.5, -15]}
        height={0.5}
      />
      <FenceRail
        start={[backFenceStartX, 1.1, -15]}
        end={[backFenceEndX, 1.1, -15]}
        height={1.1}
      />
      <FenceRail
        start={[-15, 0.5, leftFenceStartZ]}
        end={[-15, 0.5, leftFenceEndZ]}
        height={0.5}
      />
      <FenceRail
        start={[-15, 1.1, leftFenceStartZ]}
        end={[-15, 1.1, leftFenceEndZ]}
        height={1.1}
      />

      <MarqueeArch />

      {WESTERN_PROPS.map((placement) =>
        renderProp(placement, isEvening)
      )}

      {lanternPositions.map((pos, i) => (
        <Lantern key={`lantern-${i}`} position={pos} />
      ))}
    </group>
  );
}

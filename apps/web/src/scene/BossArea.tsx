import { useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import type { Boss, EmployeeStatus } from "../api/types";
import { AREA_CENTERS, AREA_COLORS, AREA_SIZE, bossDeskPosition } from "./layout";
import { MONITOR_VISUALS, type LightingMood } from "./officeTheme";
import { createRugTexture, createScreenTexture } from "./textures";
import { formatResetCountdown } from "../state/usage";

export type DeskProps = {
  position: [number, number, number];
  color: string;
  width?: number;
  status?: EmployeeStatus;
  lampOn?: boolean;
  isBoss?: boolean;
  dim?: boolean;
  accentColor?: string;
};

export function Desk({
  position,
  color,
  width = 1.8,
  status,
  lampOn = false,
  isBoss = false,
  dim = false,
  accentColor,
}: DeskProps) {
  const screenTexture = useMemo(() => {
    if (dim) return createScreenTexture("stopped");
    return createScreenTexture(status ?? "working");
  }, [dim, status]);

  useEffect(() => () => screenTexture?.dispose(), [screenTexture]);

  const monitorVisual = status
    ? MONITOR_VISUALS[status]
    : dim
      ? MONITOR_VISUALS.stopped
      : {
          screen: "#152533",
          emissive: accentColor ?? color,
          emissiveIntensity: 0.68,
          accent: accentColor ?? "#ffffff",
        };

  const monitorWidth = isBoss ? 1.12 : 0.84;
  const monitorHeight = isBoss ? 0.6 : 0.48;
  const halfW = width / 2;
  const chairBackHeight = isBoss ? 0.68 : 0.52;
  const chairBackY = isBoss ? 0.88 : 0.8;
  const chairAccent = dim ? "#5d626c" : isBoss ? accentColor ?? color : "#454c59";

  return (
    <group position={position}>
      {/* Wood-grain desktop */}
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.08, 0.92]} />
        <meshStandardMaterial color={dim ? "#7d7974" : color} roughness={0.62} />
      </mesh>
      {/* Subtle front edge trim */}
      <mesh position={[0, 0.72, 0]} receiveShadow>
        <boxGeometry args={[width - 0.04, 0.03, 0.86]} />
        <meshStandardMaterial color="#3c3733" roughness={0.7} />
      </mesh>

      {/* Four metal desk legs + side frame */}
      {([-1, 1] as const).map((sideX) => (
        <group key={sideX} position={[sideX * (halfW - 0.12), 0, 0]}>
          {([-0.36, 0.36] as const).map((legZ) => (
            <mesh key={legZ} position={[0, 0.36, legZ]} castShadow receiveShadow>
              <boxGeometry args={[0.07, 0.72, 0.07]} />
              <meshStandardMaterial color="#3a3f47" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[0.05, 0.05, 0.72]} />
            <meshStandardMaterial color="#3a3f47" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Modesty panel */}
      <mesh position={[0, 0.48, -0.34]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.32, 0.42, 0.04]} />
        <meshStandardMaterial color={dim ? "#656468" : "#7c5e42"} roughness={0.78} />
      </mesh>

      {/* Monitor stand + bezel + status-lit screen */}
      <group position={[0, 0.8, -0.24]}>
        <mesh position={[0, 0.015, 0]} castShadow>
          <boxGeometry args={[0.34, 0.03, 0.2]} />
          <meshStandardMaterial color="#2f353d" metalness={0.45} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.14, -0.04]} castShadow>
          <boxGeometry args={[0.08, 0.24, 0.06]} />
          <meshStandardMaterial color="#2f353d" metalness={0.45} roughness={0.45} />
        </mesh>
        <group position={[0, 0.34, 0]} rotation={[-0.06, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[monitorWidth, monitorHeight, 0.05]} />
            <meshStandardMaterial color="#222730" roughness={0.4} metalness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.027]}>
            <planeGeometry args={[monitorWidth - 0.07, monitorHeight - 0.07]} />
            <meshStandardMaterial
              map={screenTexture ?? undefined}
              color={screenTexture ? "#ffffff" : monitorVisual.screen}
              emissive={monitorVisual.emissive}
              emissiveMap={screenTexture ?? undefined}
              emissiveIntensity={dim ? 0.02 : monitorVisual.emissiveIntensity}
              roughness={0.25}
            />
          </mesh>
        </group>
      </group>

      {/* Desk mat, keyboard & mouse */}
      <mesh position={[0.04, 0.806, 0.15]} receiveShadow>
        <boxGeometry args={[0.84, 0.012, 0.34]} />
        <meshStandardMaterial color="#343b46" roughness={0.85} />
      </mesh>
      <mesh position={[-0.08, 0.818, 0.14]} castShadow>
        <boxGeometry args={[0.46, 0.02, 0.16]} />
        <meshStandardMaterial color="#22262e" roughness={0.5} />
      </mesh>
      <mesh position={[-0.08, 0.83, 0.14]}>
        <boxGeometry args={[0.42, 0.008, 0.12]} />
        <meshStandardMaterial color="#464e5c" roughness={0.5} />
      </mesh>
      <mesh position={[0.31, 0.82, 0.16]} castShadow>
        <boxGeometry args={[0.08, 0.024, 0.12]} />
        <meshStandardMaterial color="#252932" roughness={0.45} />
      </mesh>

      {/* Desk lamp */}
      <group position={[-(halfW - 0.24), 0.8, -0.22]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 0.04, 12]} />
          <meshStandardMaterial color="#3f4550" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.18, 0]} rotation={[0.2, 0, -0.15]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.32, 8]} />
          <meshStandardMaterial color="#4e5562" metalness={0.5} />
        </mesh>
        <mesh position={[0.06, 0.33, 0.06]} rotation={[0.45, 0, -0.35]} castShadow>
          <coneGeometry args={[0.1, 0.12, 12]} />
          <meshStandardMaterial color={dim ? "#6a6e75" : "#d9824c"} roughness={0.45} />
        </mesh>
        <mesh position={[0.07, 0.28, 0.08]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial
            color="#ffe5b4"
            emissive="#ffbe6b"
            emissiveIntensity={dim ? 0 : lampOn ? 1.85 : 0.25}
          />
        </mesh>
      </group>

      {/* Personal ceramic coffee mug */}
      <group position={[halfW - 0.28, 0.8, 0.16]}>
        <mesh position={[0, 0.055, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.046, 0.11, 12]} />
          <meshStandardMaterial color={dim ? "#85888e" : "#f5efe6"} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.105, 0]}>
          <cylinderGeometry args={[0.043, 0.043, 0.01, 10]} />
          <meshStandardMaterial color="#4a3122" roughness={0.25} />
        </mesh>
        <mesh position={[0.052, 0.055, 0]}>
          <boxGeometry args={[0.032, 0.055, 0.018]} />
          <meshStandardMaterial color={dim ? "#85888e" : "#f5efe6"} roughness={0.4} />
        </mesh>
      </group>

      {/* Ergonomic swivel chair behind the desk */}
      <group position={[0, 0, 0.92]}>
        {/* 5-star caster base */}
        {[0, 1, 2, 3, 4].map((spoke) => (
          <mesh
            key={spoke}
            position={[0, 0.04, 0]}
            rotation={[0, (spoke * Math.PI * 2) / 5, 0]}
            castShadow
          >
            <boxGeometry args={[0.05, 0.035, 0.56]} />
            <meshStandardMaterial color="#2e323a" metalness={0.45} roughness={0.45} />
          </mesh>
        ))}
        {/* Pneumatic cylinder */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.4, 10]} />
          <meshStandardMaterial color="#2e323a" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Seat cushion */}
        <mesh position={[0, 0.47, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.56, 0.08, 0.52]} />
          <meshStandardMaterial color={chairAccent} roughness={0.75} />
        </mesh>
        {/* Backrest spine + cushion */}
        <mesh position={[0, 0.62, 0.28]} castShadow>
          <boxGeometry args={[0.08, 0.34, 0.05]} />
          <meshStandardMaterial color="#2e323a" metalness={0.4} />
        </mesh>
        <mesh position={[0, chairBackY, 0.3]} castShadow receiveShadow>
          <boxGeometry args={[0.52, chairBackHeight, 0.07]} />
          <meshStandardMaterial color={chairAccent} roughness={0.75} />
        </mesh>
        {/* Armrests */}
        {([-0.3, 0.3] as const).map((ax) => (
          <group key={ax} position={[ax, 0.57, 0.02]}>
            <mesh position={[0, 0, 0]} castShadow>
              <boxGeometry args={[0.04, 0.16, 0.06]} />
              <meshStandardMaterial color="#2e323a" />
            </mesh>
            <mesh position={[0, 0.09, -0.02]} castShadow>
              <boxGeometry args={[0.07, 0.03, 0.28]} />
              <meshStandardMaterial color="#343942" roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function BossCharacter({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  const groupRef = useRef<Group>(null);
  const armLRef = useRef<Mesh>(null);
  const armRRef = useRef<Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 2.1) * 0.018;
    }
    if (armLRef.current) {
      armLRef.current.rotation.x = -0.85 + Math.sin(t * 3.5) * 0.08;
    }
    if (armRRef.current) {
      armRRef.current.rotation.x = -0.85 + Math.cos(t * 3.5) * 0.08;
    }
  });

  return (
    <group position={position}>
      <group ref={groupRef}>
        {/* Seated trousers / legs */}
        <mesh position={[0, 0.55, -0.1]} castShadow>
          <boxGeometry args={[0.42, 0.16, 0.36]} />
          <meshStandardMaterial color="#2f3542" roughness={0.8} />
        </mesh>
        {/* Tailored suit jacket torso */}
        <mesh position={[0, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.25, 0.42, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.65} />
        </mesh>
        {/* Crisp white shirt front / collar */}
        <mesh position={[0, 0.96, -0.21]}>
          <boxGeometry args={[0.16, 0.28, 0.07]} />
          <meshStandardMaterial color="#f5f7fa" roughness={0.5} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.44, -0.02]} castShadow>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#f0cdb0" roughness={0.7} />
        </mesh>
        {/* Styled executive hair cap */}
        <mesh position={[0, 1.54, 0.01]} castShadow>
          <sphereGeometry args={[0.215, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
          <meshStandardMaterial color="#3b322c" roughness={0.85} />
        </mesh>
        {/* Friendly eyes & subtle executive glasses */}
        {([-0.075, 0.075] as const).map((ex) => (
          <group key={ex} position={[ex, 1.45, -0.21]}>
            <mesh>
              <sphereGeometry args={[0.024, 8, 8]} />
              <meshStandardMaterial color="#20242c" />
            </mesh>
            <mesh position={[0, 0, -0.012]}>
              <boxGeometry args={[0.09, 0.065, 0.01]} />
              <meshStandardMaterial color="#2f3640" wireframe />
            </mesh>
          </group>
        ))}
        {/* Nose bridge for glasses */}
        <mesh position={[0, 1.46, -0.22]}>
          <boxGeometry args={[0.04, 0.014, 0.01]} />
          <meshStandardMaterial color="#2f3640" />
        </mesh>
        {/* Articulated arms */}
        <mesh ref={armLRef} position={[-0.31, 0.96, -0.14]} castShadow>
          <boxGeometry args={[0.11, 0.42, 0.11]} />
          <meshStandardMaterial color={color} roughness={0.65} />
        </mesh>
        <mesh ref={armRRef} position={[0.31, 0.96, -0.14]} castShadow>
          <boxGeometry args={[0.11, 0.42, 0.11]} />
          <meshStandardMaterial color={color} roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}

export function BossArea({
  boss,
  mood = "day",
  speechText = null,
}: {
  boss: Boss;
  mood?: LightingMood;
  speechText?: string | null;
}) {
  const [cx, cz] = AREA_CENTERS[boss.id];
  const color = AREA_COLORS[boss.id];
  const dim = !boss.available;
  const desk = bossDeskPosition(boss.id);
  const rugColor = dim ? "#7b808a" : color;
  const rugSize = AREA_SIZE - 0.5;

  const rugTexture = useMemo(() => createRugTexture(rugColor), [rugColor]);
  useEffect(() => () => rugTexture?.dispose(), [rugTexture]);

  const innerRailX = cx + (cx < 0 ? AREA_SIZE / 2 - 0.25 : -(AREA_SIZE / 2 - 0.25));

  return (
    <group>
      {/* Woven department floor rug */}
      <mesh position={[cx, 0.01, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[rugSize, rugSize]} />
        <meshStandardMaterial
          map={rugTexture ?? undefined}
          color={rugTexture ? "#ffffff" : rugColor}
          transparent={dim}
          opacity={dim ? 0.68 : 0.95}
          roughness={0.9}
        />
      </mesh>

      {/* Low modern glass-and-wood partition rail framing the executive corner */}
      <group position={[innerRailX, 0, cz - 3.9]}>
        {([-1.4, 1.4] as const).map((pz) => (
          <mesh key={pz} position={[0, 0.42, pz]} castShadow receiveShadow>
            <boxGeometry args={[0.09, 0.84, 0.09]} />
            <meshStandardMaterial color={dim ? "#6e727a" : "#b88e60"} roughness={0.65} />
          </mesh>
        ))}
        <mesh position={[0, 0.82, 0]} castShadow>
          <boxGeometry args={[0.1, 0.06, 2.9]} />
          <meshStandardMaterial color={dim ? "#6e727a" : "#b88e60"} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[0.04, 0.68, 2.72]} />
          <meshStandardMaterial
            color={dim ? "#cbd5e1" : "#e6f2fa"}
            transparent
            opacity={dim ? 0.36 : 0.24}
            roughness={dim ? 0.6 : 0.15}
          />
        </mesh>
      </group>

      {/* Executive desk & chair */}
      <Desk
        position={desk}
        color={dim ? "#7d8087" : "#b98a5a"}
        width={2.6}
        isBoss
        status={boss.onBreak && !dim ? "on_break" : undefined}
        dim={dim}
        accentColor={color}
        lampOn={mood === "evening" && !dim}
      />

      {/* Seated stylized boss character for active departments; tidy empty suite for reserved ones */}
      {!dim ? <BossCharacter position={[desk[0], 0, desk[2] + 0.9]} color={color} /> : null}

      {/* Readable department nameplate */}
      <Html position={[desk[0], 2.55, desk[2]]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div className={`boss-label${dim ? " boss-label-dim" : boss.onBreak ? " boss-label-break" : ""}`}>
          <strong>{boss.name}</strong>
          {dim ? (
            <span>Not installed</span>
          ) : boss.onBreak ? (
            <span>
              ☕ On break
              {formatResetCountdown(boss.breakUntil) ? ` · ${formatResetCountdown(boss.breakUntil)}` : ""}
            </span>
          ) : null}
        </div>
      </Html>
      {speechText && !dim ? (
        <Html position={[desk[0], 3.15, desk[2]]} center distanceFactor={14} zIndexRange={[15, 0]}>
          <div className="speech-bubble" role="status">
            {speechText}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { MCP_HUB_POSITION, type Vec3 } from "./layout";
import type { WorldThemeId } from "./themes/registry";

export type ActiveMcpRequest = {
  agentId: string;
  fromPosition: Vec3;
  serverName: string;
  label: string;
};

const PACKET_STEPS = [0, 0.25, 0.5, 0.75] as const;

function RequestArc({ from, to }: { from: Vec3; to: Vec3 }) {
  const orbRefs = useRef<Array<Mesh | null>>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const startX = from[0];
    const startY = 1.45;
    const startZ = from[2] + 0.65;
    const endX = to[0];
    const endY = 1.55;
    const endZ = to[2];

    for (let i = 0; i < PACKET_STEPS.length; i += 1) {
      const orb = orbRefs.current[i];
      if (!orb) continue;
      // Alternating outbound and inbound packets along a smooth parabolic arc
      const progress = (t * 0.85 + PACKET_STEPS[i]!) % 1;
      const u = i % 2 === 0 ? progress : 1 - progress;
      const x = startX + (endX - startX) * u;
      const z = startZ + (endZ - startZ) * u;
      const arch = Math.sin(u * Math.PI) * 1.15;
      const y = startY + (endY - startY) * u + arch;
      orb.position.set(x, y, z);
      const scale = 0.75 + Math.sin(t * 6 + i) * 0.25;
      orb.scale.setScalar(scale);
    }
  });

  return (
    <group>
      {PACKET_STEPS.map((step, i) => (
        <mesh
          key={step}
          ref={(el) => {
            orbRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.11, 12, 12]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#c084fc" : "#38bdf8"}
            emissive={i % 2 === 0 ? "#a855f7" : "#0ea5e9"}
            emissiveIntensity={1.4}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Shared MCP Liaison Agent & Hub stationed in the center of the office.
 * Animates calmly on standby and switches to active data-fetching with request arcs
 * whenever any team agent invokes an MCP tool.
 */
export function McpAgentStation({
  activeRequests,
  theme = "office",
}: {
  activeRequests: ActiveMcpRequest[];
  theme?: WorldThemeId;
}) {
  const agentBodyRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const armLRef = useRef<Group>(null);
  const armRRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);

  const active = activeRequests.length > 0;
  const primary = activeRequests[0] ?? null;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * (active ? 2.4 : 0.45);
    }
    if (agentBodyRef.current) {
      agentBodyRef.current.position.y = active ? Math.sin(t * 5.2) * 0.045 : Math.sin(t * 1.4) * 0.015;
      if (primary) {
        const dx = primary.fromPosition[0] - MCP_HUB_POSITION[0];
        const dz = primary.fromPosition[2] - MCP_HUB_POSITION[2];
        const targetYaw = Math.atan2(dx, dz);
        agentBodyRef.current.rotation.y += (targetYaw - agentBodyRef.current.rotation.y) * 0.12;
      } else {
        agentBodyRef.current.rotation.y += (0 - agentBodyRef.current.rotation.y) * 0.08;
      }
    }
    if (headRef.current) {
      headRef.current.rotation.y = active ? Math.sin(t * 4.2) * 0.25 : Math.sin(t * 0.9) * 0.1;
      headRef.current.rotation.x = active ? -0.06 + Math.sin(t * 6) * 0.05 : 0;
    }
    if (armLRef.current && armRRef.current) {
      if (active) {
        armLRef.current.rotation.x = -1.05 + Math.sin(t * 10) * 0.26;
        armRRef.current.rotation.x = -1.05 + Math.cos(t * 10) * 0.26;
      } else {
        armLRef.current.rotation.x = -0.35 + Math.sin(t * 1.3) * 0.04;
        armRRef.current.rotation.x = -0.35 - Math.sin(t * 1.3) * 0.04;
      }
    }
  });

  const baseColor =
    theme === "western"
      ? "#7c5a3c"
      : theme === "horror"
        ? "#3b3545"
        : theme === "metal"
          ? "#2c2f3a"
          : "#334155";
  const accentColor = active ? "#c084fc" : "#64748b";

  return (
    <group>
      {activeRequests.map((req) => (
        <RequestArc key={`${req.agentId}-${req.label}`} from={req.fromPosition} to={MCP_HUB_POSITION} />
      ))}

      <group position={MCP_HUB_POSITION}>
        {/* Circular MCP Hub floor pad */}
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.15, 32]} />
          <meshStandardMaterial
            color={active ? "#4c1d95" : "#272e3f"}
            emissive={active ? "#7e22ce" : "#000000"}
            emissiveIntensity={active ? 0.45 : 0}
            roughness={0.75}
          />
        </mesh>

        {/* Rotating status halo ring */}
        <mesh ref={ringRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.92, 1.04, 32]} />
          <meshStandardMaterial
            color={accentColor}
            emissive={active ? "#c084fc" : "#38bdf8"}
            emissiveIntensity={active ? 1.15 : 0.2}
            roughness={0.3}
          />
        </mesh>

        {/* Compact round kiosk pedestal */}
        <mesh position={[0, 0.36, -0.45]} castShadow receiveShadow>
          <cylinderGeometry args={[0.42, 0.48, 0.72, 16]} />
          <meshStandardMaterial color={baseColor} roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.74, -0.45]} castShadow>
          <cylinderGeometry args={[0.52, 0.52, 0.06, 16]} />
          <meshStandardMaterial
            color={active ? "#7e22ce" : "#475569"}
            emissive={active ? "#a855f7" : "#000000"}
            emissiveIntensity={active ? 0.55 : 0}
            roughness={0.4}
          />
        </mesh>

        {/* MCP Liaison Agent character */}
        <group ref={agentBodyRef} position={[0, 0, 0.2]}>
          {/* Legs */}
          {([-0.11, 0.11] as const).map((lx) => (
            <mesh key={lx} position={[lx, 0.32, 0]} castShadow>
              <capsuleGeometry args={[0.06, 0.38, 4, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.75} />
            </mesh>
          ))}
          {/* Torso */}
          <mesh position={[0, 0.86, 0]} castShadow>
            <capsuleGeometry args={[0.2, 0.3, 6, 12]} />
            <meshStandardMaterial
              color={active ? "#7c3aed" : "#475569"}
              emissive={active ? "#a855f7" : "#000000"}
              emissiveIntensity={active ? 0.35 : 0}
              roughness={0.55}
            />
          </mesh>
          {/* Glowing chest core */}
          <mesh position={[0, 0.9, 0.18]}>
            <sphereGeometry args={[0.065, 10, 10]} />
            <meshStandardMaterial
              color={active ? "#e879f9" : "#38bdf8"}
              emissive={active ? "#e879f9" : "#38bdf8"}
              emissiveIntensity={active ? 1.5 : 0.45}
            />
          </mesh>

          {/* Arms */}
          <group ref={armLRef} position={[-0.25, 0.96, 0]}>
            <mesh position={[0, -0.14, 0.05]} castShadow>
              <capsuleGeometry args={[0.05, 0.24, 4, 8]} />
              <meshStandardMaterial color={active ? "#7c3aed" : "#475569"} roughness={0.6} />
            </mesh>
          </group>
          <group ref={armRRef} position={[0.25, 0.96, 0]}>
            <mesh position={[0, -0.14, 0.05]} castShadow>
              <capsuleGeometry args={[0.05, 0.24, 4, 8]} />
              <meshStandardMaterial color={active ? "#7c3aed" : "#475569"} roughness={0.6} />
            </mesh>
          </group>

          {/* Head + visor + antenna */}
          <group ref={headRef} position={[0, 1.26, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.21, 16, 16]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
            </mesh>
            {/* Glowing visor */}
            <mesh position={[0, 0.02, 0.17]}>
              <boxGeometry args={[0.26, 0.085, 0.06]} />
              <meshStandardMaterial
                color={active ? "#f0abfc" : "#38bdf8"}
                emissive={active ? "#d946ef" : "#0ea5e9"}
                emissiveIntensity={active ? 1.3 : 0.55}
                roughness={0.2}
              />
            </mesh>
            {/* Antenna */}
            <mesh position={[0, 0.27, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 0.16, 8]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.37, 0]}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshStandardMaterial
                color={active ? "#f0abfc" : "#38bdf8"}
                emissive={active ? "#e879f9" : "#38bdf8"}
                emissiveIntensity={active ? 1.6 : 0.4}
              />
            </mesh>
          </group>
        </group>

        {/* Floating MCP Hub label */}
        <Html position={[0, 2.25, 0]} center zIndexRange={[12, 0]}>
          <div className={`mcp-hub-label${active ? " is-active" : ""}`}>
            <strong>{primary ? `📡 MCP · ${primary.serverName}` : "📡 MCP Agent"}</strong>
            <span>{primary ? primary.label : "Standby"}</span>
          </div>
        </Html>
      </group>
    </group>
  );
}

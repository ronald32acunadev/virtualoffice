import { useMemo } from "react";
import * as THREE from "three";
import type { WorldThemeId } from "./registry";

export function CharacterThemeAccessory({ theme, muted = false }: { theme: WorldThemeId; muted?: boolean }) {
  if (theme === "office") {
    return null;
  }

  if (theme === "western") {
    const hatColor = muted ? "#5d5a58" : "#7c4a26";
    const bandColor = muted ? "#4a4846" : "#3a2414";
    return (
      <group position={[0, 0.22, 0]}>
        <mesh>
          <cylinderGeometry args={[0.36, 0.38, 0.03, 18]} />
          <meshStandardMaterial color={hatColor} roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.14, 0.2, 0.16, 14]} />
          <meshStandardMaterial color={hatColor} roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.205, 0.205, 0.025, 14]} />
          <meshStandardMaterial color={bandColor} roughness={0.7} metalness={0.15} />
        </mesh>
      </group>
    );
  }

  if (theme === "horror") {
    const hatColor = muted ? "#4c4850" : "#241b2b";
    const bandColor = muted ? "#5a4a4e" : "#a82c3a";
    return (
      <group position={[0, 0.22, 0]}>
        <mesh>
          <cylinderGeometry args={[0.34, 0.34, 0.025, 16]} />
          <meshStandardMaterial color={hatColor} roughness={0.9} metalness={0.05} />
        </mesh>
        <mesh position={[0.04, 0.17, 0]} rotation={[0, 0, -0.18]}>
          <coneGeometry args={[0.17, 0.34, 14]} />
          <meshStandardMaterial color={hatColor} roughness={0.9} metalness={0.05} />
        </mesh>
        <mesh position={[0.01, 0.035, 0]}>
          <cylinderGeometry args={[0.175, 0.175, 0.03, 14]} />
          <meshStandardMaterial color={bandColor} roughness={0.6} metalness={0.1} />
        </mesh>
      </group>
    );
  }

  if (theme === "metal") {
    const bandColor = muted ? "#6b5256" : "#dc2626";
    const studColor = muted ? "#8a8a8a" : "#c0c0c0";
    const studs = useMemo(() => {
      const positions: [number, number, number][] = [
        [-0.08, 0.1, -0.245],
        [0, 0.1, -0.245],
        [0.08, 0.1, -0.245],
      ];
      return positions;
    }, []);
    return (
      <group>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.248, 0.248, 0.075, 18]} />
          <meshStandardMaterial color={bandColor} roughness={0.75} metalness={0.05} />
        </mesh>
        {studs.map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color={studColor} roughness={0.2} metalness={0.9} />
          </mesh>
        ))}
        <mesh position={[-0.06, 0.02, 0.24]} rotation={[0.35, 0, 0.15]}>
          <boxGeometry args={[0.05, 0.12, 0.015]} />
          <meshStandardMaterial color={bandColor} roughness={0.75} metalness={0.05} />
        </mesh>
        <mesh position={[0.06, 0.02, 0.24]} rotation={[0.35, 0, -0.15]}>
          <boxGeometry args={[0.05, 0.12, 0.015]} />
          <meshStandardMaterial color={bandColor} roughness={0.75} metalness={0.05} />
        </mesh>
      </group>
    );
  }

  return null;
}

export function StationThemeAccent({ theme, width, statusColor, lampOn = false }: { theme: WorldThemeId; width: number; statusColor: string; lampOn?: boolean }) {
  if (theme === "office") {
    return null;
  }

  if (theme === "western") {
    const ironColor = "#2a2a2e";
    const brassColor = "#b8860b";
    const glassColor = lampOn ? statusColor : "#3a3a3e";
    return (
      <group position={[width / 2 - 0.24, 0.8, 0.12]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.04, 12]} />
          <meshStandardMaterial color={ironColor} roughness={0.6} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.12, 12]} />
          <meshStandardMaterial
            color={glassColor}
            emissive={statusColor}
            emissiveIntensity={lampOn ? 1.5 : 0.75}
            roughness={0.3}
            metalness={0.1}
            transparent
            opacity={0.85}
          />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.045, 0.03, 12]} />
          <meshStandardMaterial color={brassColor} roughness={0.3} metalness={0.85} />
        </mesh>
      </group>
    );
  }

  if (theme === "horror") {
    const plateColor = "#1a1a1e";
    const waxColor = "#e8e0d0";
    const flameColor = lampOn ? statusColor : "#ff9248";
    return (
      <group position={[width / 2 - 0.24, 0.8, 0.12]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.08, 0.09, 0.02, 12]} />
          <meshStandardMaterial color={plateColor} roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[-0.03, 0.06, 0]}>
          <cylinderGeometry args={[0.015, 0.018, 0.08, 8]} />
          <meshStandardMaterial color={waxColor} roughness={0.8} metalness={0.0} />
        </mesh>
        <mesh position={[-0.03, 0.115, 0]}>
          <coneGeometry args={[0.012, 0.03, 8]} />
          <meshStandardMaterial
            color={flameColor}
            emissive={flameColor}
            emissiveIntensity={lampOn ? 1.5 : 0.75}
            roughness={0.4}
            metalness={0.0}
          />
        </mesh>
        <mesh position={[0.03, 0.06, 0]}>
          <cylinderGeometry args={[0.015, 0.018, 0.08, 8]} />
          <meshStandardMaterial color={waxColor} roughness={0.8} metalness={0.0} />
        </mesh>
        <mesh position={[0.03, 0.115, 0]}>
          <coneGeometry args={[0.012, 0.03, 8]} />
          <meshStandardMaterial
            color={flameColor}
            emissive={flameColor}
            emissiveIntensity={lampOn ? 1.5 : 0.75}
            roughness={0.4}
            metalness={0.0}
          />
        </mesh>
      </group>
    );
  }

  if (theme === "metal") {
    const cabColor = "#1c1e28";
    const grilleColor = "#3a3c48";
    const ledColor = statusColor;
    return (
      <group position={[width / 2 - 0.26, 0.8, 0.1]}>
        <mesh position={[0, 0.04, 0]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[0.12, 0.08, 0.06]} />
          <meshStandardMaterial color={cabColor} roughness={0.85} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.04, -0.031]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[0.1, 0.06, 0.002]} />
          <meshStandardMaterial color={grilleColor} roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.01, -0.031]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[0.1, 0.008, 0.002]} />
          <meshStandardMaterial
            color={ledColor}
            emissive={ledColor}
            emissiveIntensity={lampOn ? 1.6 : 0.9}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>
      </group>
    );
  }

  return null;
}

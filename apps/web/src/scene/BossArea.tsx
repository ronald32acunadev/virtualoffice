import { Html } from "@react-three/drei";
import type { Boss } from "../api/types";
import { AREA_CENTERS, AREA_COLORS, AREA_SIZE, bossDeskPosition } from "./layout";

export function Desk({ position, color, width = 1.8 }: { position: [number, number, number]; color: string; width?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[width, 0.12, 0.9]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.1), 0.37, 0]}>
          <boxGeometry args={[0.1, 0.74, 0.8]} />
          <meshStandardMaterial color="#5a4a3a" />
        </mesh>
      ))}
      <mesh position={[0, 1.1, -0.25]}>
        <boxGeometry args={[0.7, 0.45, 0.05]} />
        <meshStandardMaterial color="#222831" />
      </mesh>
    </group>
  );
}

export function BossArea({ boss }: { boss: Boss }) {
  const [cx, cz] = AREA_CENTERS[boss.id];
  const color = AREA_COLORS[boss.id];
  const dim = !boss.available;
  const desk = bossDeskPosition(boss.id);
  return (
    <group>
      <mesh position={[cx, 0.01, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[AREA_SIZE - 0.6, AREA_SIZE - 0.6]} />
        <meshStandardMaterial color={dim ? "#3a3a40" : color} transparent opacity={dim ? 0.5 : 0.28} />
      </mesh>
      <Desk position={desk} color={dim ? "#6b6b70" : color} width={2.6} />
      <mesh position={[desk[0], 1.0, desk[2] + 0.9]}>
        <capsuleGeometry args={[0.28, 0.6, 4, 12]} />
        <meshStandardMaterial color={dim ? "#777" : color} transparent opacity={dim ? 0.55 : 1} />
      </mesh>
      <Html position={[desk[0], 2.6, desk[2]]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div className={`boss-label${dim ? " boss-label-dim" : ""}`}>
          <strong>{boss.name}</strong>
          {dim ? <span>Coming soon</span> : null}
        </div>
      </Html>
    </group>
  );
}

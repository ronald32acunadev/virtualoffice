import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useOffice } from "../state/OfficeProvider";
import { BossArea } from "./BossArea";
import { Character } from "./Character";
import { employeeDeskPosition } from "./layout";
import type { BossId } from "../api/types";

const FALLBACK_BOSSES: { id: BossId; name: string; available: boolean }[] = [
  { id: "claude", name: "Claude", available: true },
  { id: "codex", name: "Codex", available: false },
  { id: "opencode", name: "OpenCode", available: false },
  { id: "gemini", name: "Gemini", available: false },
];

export function OfficeScene() {
  const { state, actions } = useOffice();
  const bosses = state.bosses.length > 0 ? state.bosses : FALLBACK_BOSSES;

  const indexByBoss = new Map<BossId, number>();
  const placed = state.employees.map((employee) => {
    const index = indexByBoss.get(employee.bossId) ?? 0;
    indexByBoss.set(employee.bossId, index + 1);
    return { employee, position: employeeDeskPosition(employee.bossId, index) };
  });

  return (
    <Canvas camera={{ position: [0, 17, 21], fov: 45 }} onPointerMissed={() => actions.select(null)}>
      <color attach="background" args={["#1a1d24"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color="#2b2f3a" />
      </mesh>
      {bosses.map((boss) => (
        <BossArea key={boss.id} boss={boss} />
      ))}
      {placed.map(({ employee, position }) => (
        <Character
          key={employee.id}
          employee={employee}
          position={position}
          selected={state.selectedId === employee.id}
          onSelect={actions.select}
        />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={36}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

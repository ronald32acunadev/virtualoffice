import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useOffice } from "../state/OfficeProvider";
import { BossArea } from "./BossArea";
import { Character } from "./Character";
import { OfficeRoom } from "./OfficeRoom";
import { employeeDeskPosition } from "./layout";
import { MOOD_PALETTES, type LightingMood } from "./officeTheme";
import type { BossId } from "../api/types";

const FALLBACK_BOSSES: { id: BossId; name: string; available: boolean }[] = [
  { id: "claude", name: "Claude", available: true },
  { id: "codex", name: "Codex", available: false },
  { id: "opencode", name: "OpenCode", available: false },
  { id: "gemini", name: "Gemini", available: false },
];

export function OfficeScene({
  onSelectEmployee,
  onClear,
  mood = "day",
}: {
  onSelectEmployee: (employeeId: string) => void;
  onClear: () => void;
  mood?: LightingMood;
}) {
  const { state } = useOffice();
  const bosses = state.bosses.length > 0 ? state.bosses : FALLBACK_BOSSES;
  const palette = MOOD_PALETTES[mood];

  const indexByBoss = new Map<BossId, number>();
  const placed = state.employees.map((employee) => {
    const index = indexByBoss.get(employee.bossId) ?? 0;
    indexByBoss.set(employee.bossId, index + 1);
    return { employee, position: employeeDeskPosition(employee.bossId, index) };
  });

  return (
    <Canvas shadows camera={{ position: [0, 17, 21], fov: 42 }} onPointerMissed={onClear}>
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
        <BossArea key={boss.id} boss={boss} mood={mood} />
      ))}
      {placed.map(({ employee, position }) => (
        <Character
          key={employee.id}
          employee={employee}
          position={position}
          selected={state.selectedId === employee.id}
          onSelect={onSelectEmployee}
          lampOn={mood === "evening"}
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

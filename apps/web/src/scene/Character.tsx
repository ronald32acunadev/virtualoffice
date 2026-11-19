import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import type { Employee } from "../api/types";
import { employeeLabel } from "../state/role";
import { Desk } from "./BossArea";
import { CHARACTER_POSES, hasSpecialistAccessory } from "./characterVisuals";
import { STATUS_COLORS, type Vec3 } from "./layout";
import { SPECIES_COLORS, SpecialistHeadset, SpeciesParts, SpeciesTail } from "./SpeciesParts";

type Props = {
  employee: Employee;
  position: Vec3;
  selected: boolean;
  onSelect: (id: string) => void;
  lampOn?: boolean;
};

const MUTED_SHIRT = "#6e7480";
const MUTED_HEAD = "#969ba3";
const BASE_TORSO_Y = 0.6;

export function Character({ employee, position, selected, onSelect, lampOn = false }: Props) {
  const rootRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const bodyMatRef = useRef<MeshStandardMaterial>(null);
  const armLRef = useRef<Group>(null);
  const armRRef = useRef<Group>(null);
  const haloMatRef = useRef<MeshStandardMaterial>(null);

  const [hovered, setHovered] = useState(false);
  const { status } = employee;
  const pose = CHARACTER_POSES[status];
  const shirtColor = pose.muted ? MUTED_SHIRT : STATUS_COLORS[status];
  const headColor = pose.muted ? MUTED_HEAD : SPECIES_COLORS[employee.species];
  const pantsColor = pose.muted ? "#484d56" : "#2f3644";
  const shoeColor = pose.muted ? "#3a3e45" : "#22262e";
  const specialist = hasSpecialistAccessory(employee.role);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const root = rootRef.current;
    const torso = torsoRef.current;
    const head = headRef.current;
    const armL = armLRef.current;
    const armR = armRRef.current;
    const bodyMat = bodyMatRef.current;

    if (root) {
      if (status === "starting") {
        root.scale.setScalar(1 + Math.sin(t * 4) * 0.045);
      } else {
        root.scale.setScalar(1);
      }
    }

    if (bodyMat) {
      bodyMat.opacity = status === "starting" ? 0.62 + Math.sin(t * 4) * 0.22 : 1;
      if (pose.accentGlow) {
        bodyMat.emissive.set(pose.accentGlow);
        bodyMat.emissiveIntensity =
          status === "waiting_approval"
            ? 0.35 + Math.sin(t * 4.5) * 0.22
            : status === "starting"
              ? 0.2 + Math.sin(t * 4) * 0.12
              : 0.18;
      } else {
        bodyMat.emissive.set("#000000");
        bodyMat.emissiveIntensity = 0;
      }
    }

    if (torso) {
      torso.position.y = BASE_TORSO_Y + Math.sin(t * pose.breathingSpeed) * 0.013;
      torso.rotation.x =
        pose.leanX + (pose.typing ? Math.sin(t * 6) * 0.018 : Math.sin(t * 1.6) * 0.008);
    }

    if (head) {
      if (status === "working") {
        head.rotation.x = pose.headTiltX + Math.sin(t * 4.5) * 0.032;
        head.rotation.y = Math.sin(t * 1.4) * 0.05;
      } else if (status === "waiting_approval") {
        head.rotation.x = pose.headTiltX + Math.sin(t * 3) * 0.04;
        head.rotation.y = Math.sin(t * 2.1) * 0.12;
      } else if (status === "idle") {
        head.rotation.x = pose.headTiltX + Math.sin(t * 0.9) * 0.03;
        head.rotation.y = Math.sin(t * 0.75) * 0.2;
      } else if (status === "failed") {
        head.rotation.x = pose.headTiltX + Math.sin(t * 1.4) * 0.025;
        head.rotation.y = Math.sin(t * 2.4) * 0.07;
      } else {
        head.rotation.x = pose.headTiltX;
        head.rotation.y = 0;
      }
    }

    if (armL && armR) {
      if (pose.typing) {
        armL.rotation.x = -0.82 + Math.sin(t * 14) * 0.22;
        armR.rotation.x = -0.82 + Math.cos(t * 14) * 0.22;
        armR.rotation.z = 0;
      } else if (pose.waving) {
        armL.rotation.x = -0.35;
        armR.rotation.x = -2.42;
        armR.rotation.z = -0.34 + Math.sin(t * 7.5) * 0.28;
      } else if (status === "stopped") {
        armL.rotation.x = -0.15;
        armR.rotation.x = -0.15;
        armR.rotation.z = 0;
      } else if (status === "failed") {
        armL.rotation.x = -0.26;
        armR.rotation.x = -0.26;
        armR.rotation.z = 0;
      } else {
        armL.rotation.x = -0.45 + Math.sin(t * 1.4) * 0.03;
        armR.rotation.x = -0.45 - Math.sin(t * 1.4) * 0.03;
        armR.rotation.z = 0;
      }
    }

    if (haloMatRef.current) {
      haloMatRef.current.opacity = 0.65 + Math.sin(t * 3.5) * 0.25;
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(employee.id);
  };

  const marker =
    status === "waiting_approval" ? (
      <div className="marker marker-approval">!</div>
    ) : status === "failed" ? (
      <div className="marker marker-failed">x</div>
    ) : null;

  return (
    <group position={position}>
      <Desk position={[0, 0, 0]} color="#c49a6c" status={status} lampOn={lampOn} />

      <group
        ref={rootRef}
        position={[0, 0, 0.86]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        {/* Seated hips & legs resting cleanly on the chair seat */}
        <group>
          <mesh position={[0, 0.55, 0.02]} castShadow>
            <boxGeometry args={[0.38, 0.12, 0.24]} />
            <meshStandardMaterial color={pantsColor} roughness={0.8} />
          </mesh>
          {([-0.11, 0.11] as const).map((lx) => (
            <group key={lx}>
              {/* Thigh */}
              <mesh position={[lx, 0.545, -0.17]} castShadow>
                <boxGeometry args={[0.14, 0.12, 0.32]} />
                <meshStandardMaterial color={pantsColor} roughness={0.8} />
              </mesh>
              {/* Calf */}
              <mesh position={[lx, 0.33, -0.3]} castShadow>
                <boxGeometry args={[0.12, 0.34, 0.12]} />
                <meshStandardMaterial color={pantsColor} roughness={0.8} />
              </mesh>
              {/* Shoe */}
              <mesh position={[lx, 0.13, -0.33]} castShadow>
                <boxGeometry args={[0.13, 0.09, 0.19]} />
                <meshStandardMaterial color={shoeColor} roughness={0.65} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Animated species tail */}
        <SpeciesTail species={employee.species} status={status} muted={pose.muted} />

        {/* Articulated upper body (shirt/hoodie, arms, head) */}
        <group ref={torsoRef} position={[0, BASE_TORSO_Y, 0.02]}>
          {/* Tailored hoodie / shirt torso */}
          <mesh position={[0, 0.24, 0]} scale={[1.05, 1, 0.86]} castShadow>
            <capsuleGeometry args={[0.21, 0.24, 6, 12]} />
            <meshStandardMaterial ref={bodyMatRef} color={shirtColor} transparent roughness={0.68} />
          </mesh>
          {/* Hoodie collar accent */}
          <mesh position={[0, 0.43, -0.02]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
            <torusGeometry args={[0.145, 0.035, 8, 16]} />
            <meshStandardMaterial color={pose.muted ? "#7f8590" : "#f4f6fa"} roughness={0.6} />
          </mesh>
          {/* Chest badge / pocket stripe */}
          <mesh position={[0.09, 0.31, -0.175]}>
            <boxGeometry args={[0.075, 0.055, 0.02]} />
            <meshStandardMaterial
              color={specialist ? (pose.muted ? "#8b8f99" : "#9d6bff") : "#ffffff"}
              roughness={0.5}
            />
          </mesh>

          {/* Left articulated arm */}
          <group ref={armLRef} position={[-0.255, 0.38, -0.02]}>
            <mesh position={[0, -0.11, -0.02]} castShadow>
              <capsuleGeometry args={[0.055, 0.15, 4, 8]} />
              <meshStandardMaterial color={shirtColor} roughness={0.68} />
            </mesh>
            <mesh position={[0, -0.21, -0.12]} rotation={[Math.PI / 2 - 0.2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.048, 0.14, 4, 8]} />
              <meshStandardMaterial color={shirtColor} roughness={0.68} />
            </mesh>
            <mesh position={[0, -0.22, -0.23]} castShadow>
              <sphereGeometry args={[0.055, 10, 10]} />
              <meshStandardMaterial color={headColor} roughness={0.75} />
            </mesh>
          </group>

          {/* Right articulated arm */}
          <group ref={armRRef} position={[0.255, 0.38, -0.02]}>
            <mesh position={[0, -0.11, -0.02]} castShadow>
              <capsuleGeometry args={[0.055, 0.15, 4, 8]} />
              <meshStandardMaterial color={shirtColor} roughness={0.68} />
            </mesh>
            <mesh position={[0, -0.21, -0.12]} rotation={[Math.PI / 2 - 0.2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.048, 0.14, 4, 8]} />
              <meshStandardMaterial color={shirtColor} roughness={0.68} />
            </mesh>
            <mesh position={[0, -0.22, -0.23]} castShadow>
              <sphereGeometry args={[0.055, 10, 10]} />
              <meshStandardMaterial color={headColor} roughness={0.75} />
            </mesh>
          </group>

          {/* Articulated head */}
          <group ref={headRef} position={[0, 0.5, -0.02]}>
            <group position={[0, 0.18, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.24, 18, 18]} />
                <meshStandardMaterial color={headColor} roughness={0.72} />
              </mesh>

              {/* Crisp eyes facing -z toward monitor */}
              {([-0.085, 0.085] as const).map((ex) => (
                <group key={ex} position={[ex, 0.02, -0.215]}>
                  <mesh scale={[1, 1.12, 0.55]}>
                    <sphereGeometry args={[0.043, 10, 10]} />
                    <meshStandardMaterial color="#ffffff" roughness={0.35} />
                  </mesh>
                  <mesh position={[0, 0, -0.022]}>
                    <sphereGeometry args={[0.025, 8, 8]} />
                    <meshStandardMaterial color="#181c24" roughness={0.25} />
                  </mesh>
                  <mesh position={[0.01, 0.012, -0.04]}>
                    <sphereGeometry args={[0.0085, 6, 6]} />
                    <meshBasicMaterial color="#ffffff" />
                  </mesh>
                </group>
              ))}

              <SpeciesParts
                species={employee.species}
                tint={pose.muted ? MUTED_HEAD : undefined}
              />
              {specialist ? <SpecialistHeadset muted={pose.muted} /> : null}
            </group>
          </group>
        </group>

        {/* Game-style floor selection halo */}
        {selected ? (
          <group position={[0, 0.022, 0.04]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.58, 0.72, 36]} />
              <meshStandardMaterial
                ref={haloMatRef}
                color="#7dd3fc"
                emissive="#38bdf8"
                emissiveIntensity={0.95}
                transparent
                opacity={0.85}
              />
            </mesh>
            <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.74, 0.8, 36]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
            </mesh>
          </group>
        ) : null}

        {marker ? (
          <Html position={[0, 2.38, 0]} center zIndexRange={[10, 0]}>
            {marker}
          </Html>
        ) : null}
        <Html position={[0, 1.9, 0]} center zIndexRange={[5, 0]}>
          <div className="name-label">{employeeLabel(employee)}</div>
        </Html>
        {hovered ? (
          <Html position={[0, 2.85, 0]} center zIndexRange={[20, 0]}>
            <div className="tooltip">
              <strong>{employee.task.length > 80 ? `${employee.task.slice(0, 80)}...` : employee.task}</strong>
              <span>{employee.status.replace("_", " ")}</span>
            </div>
          </Html>
        ) : null}
      </group>
    </group>
  );
}

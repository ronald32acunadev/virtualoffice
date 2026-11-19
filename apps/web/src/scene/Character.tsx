import { useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { Employee } from "../api/types";
import { Desk } from "./BossArea";
import { STATUS_COLORS, type Vec3 } from "./layout";

type Props = {
  employee: Employee;
  position: Vec3;
  selected: boolean;
  onSelect: (id: string) => void;
};

export function Character({ employee, position, selected, onSelect }: Props) {
  const group = useRef<Group>(null);
  const body = useRef<MeshStandardMaterial>(null);
  const armL = useRef<Mesh>(null);
  const armR = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { status } = employee;
  const color = STATUS_COLORS[status];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    g.position.y = status === "working" ? Math.sin(t * 8) * 0.04 : 0;
    g.scale.setScalar(status === "starting" ? 1 + Math.sin(t * 4) * 0.05 : 1);
    if (body.current) {
      body.current.opacity = status === "starting" ? 0.55 + Math.sin(t * 4) * 0.25 : 1;
    }
    const typing = status === "working";
    if (armL.current) armL.current.rotation.x = typing ? -1 + Math.sin(t * 14) * 0.3 : -0.4;
    if (armR.current) armR.current.rotation.x = typing ? -1 + Math.cos(t * 14) * 0.3 : -0.4;
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
      <Desk position={[0, 0, 0]} color="#8a6d4b" />
      <group
        ref={group}
        position={[0, 0, 0.9]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh position={[0, 0.85, 0]}>
          <capsuleGeometry args={[0.3, 0.6, 4, 12]} />
          <meshStandardMaterial
            ref={body}
            color={color}
            transparent
            emissive={status === "waiting_approval" ? "#ffb02e" : "#000000"}
            emissiveIntensity={status === "waiting_approval" ? 0.6 : 0}
          />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshStandardMaterial color={status === "stopped" ? "#9a9a9a" : "#f1d3b3"} />
        </mesh>
        <mesh ref={armL} position={[-0.38, 1.05, -0.1]}>
          <boxGeometry args={[0.12, 0.5, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh ref={armR} position={[0.38, 1.05, -0.1]}>
          <boxGeometry args={[0.12, 0.5, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {selected ? (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.6, 0.75, 32]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ) : null}
        {marker ? (
          <Html position={[0, 2.3, 0]} center zIndexRange={[10, 0]}>
            {marker}
          </Html>
        ) : null}
        {hovered ? (
          <Html position={[0, 2.9, 0]} center zIndexRange={[20, 0]}>
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

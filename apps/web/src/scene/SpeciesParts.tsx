import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { EmployeeStatus, Species } from "../api/types";

/** Fur color per species; humans keep a skin tone. */
export const SPECIES_COLORS: Record<Species, string> = {
  wolf: "#8d949e",
  dog: "#b98a56",
  fox: "#e07a2f",
  cat: "#d9c7a3",
  bear: "#6b4a32",
  human: "#f1d3b3",
};

const MUTED_FUR = "#8e939c";
const INNER_EAR_COLORS: Record<Exclude<Species, "human">, string> = {
  wolf: "#cfd5dd",
  dog: "#8f653c",
  fox: "#ffefd9",
  cat: "#f2a7b8",
  bear: "#a97f5c",
};

const MUZZLE_COLORS: Record<Exclude<Species, "human">, string> = {
  wolf: "#c6ccd4",
  dog: "#dfc29d",
  fox: "#f7ead7",
  cat: "#efe4d2",
  bear: "#cfa982",
};

/**
 * Head ears, hair, and facial cues relative to the head sphere center `[0, 0, 0]` (radius 0.24, facing `-z`).
 */
export function SpeciesParts({ species, tint }: { species: Species; tint?: string }) {
  const color = tint ?? SPECIES_COLORS[species];
  const muted = Boolean(tint);

  if (species === "human") {
    const hairColor = muted ? "#6b7078" : "#3d2f28";
    return (
      <group>
        {/* Hair cap */}
        <mesh position={[0, 0.045, 0.015]} castShadow>
          <sphereGeometry args={[0.248, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
          <meshStandardMaterial color={hairColor} roughness={0.85} />
        </mesh>
        {/* Front hair tuft */}
        <mesh position={[0.04, 0.205, -0.155]} rotation={[0.45, 0.2, -0.3]} castShadow>
          <capsuleGeometry args={[0.055, 0.11, 4, 8]} />
          <meshStandardMaterial color={hairColor} roughness={0.85} />
        </mesh>
        {/* Subtle ears */}
        {([-1, 1] as const).map((side) => (
          <mesh key={side} position={[side * 0.235, -0.01, 0.01]}>
            <sphereGeometry args={[0.042, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        ))}
      </group>
    );
  }

  const innerColor = muted ? "#a3a8b0" : INNER_EAR_COLORS[species];
  const muzzleColor = muted ? "#adb2ba" : MUZZLE_COLORS[species];
  const noseColor = species === "cat" && !muted ? "#e27d92" : "#1c2026";

  return (
    <group>
      {/* Ears */}
      {([-1, 1] as const).map((side) => {
        if (species === "dog") {
          return (
            <mesh
              key={side}
              position={[side * 0.225, 0.04, 0.015]}
              rotation={[0.08, 0, side * -0.42]}
              castShadow
            >
              <capsuleGeometry args={[0.055, 0.15, 4, 8]} />
              <meshStandardMaterial color={innerColor} roughness={0.75} />
            </mesh>
          );
        }
        if (species === "bear") {
          return (
            <group key={side} position={[side * 0.18, 0.19, 0.01]}>
              <mesh castShadow>
                <sphereGeometry args={[0.088, 10, 10]} />
                <meshStandardMaterial color={color} roughness={0.75} />
              </mesh>
              <mesh position={[0, -0.005, -0.048]}>
                <sphereGeometry args={[0.048, 8, 8]} />
                <meshStandardMaterial color={innerColor} roughness={0.75} />
              </mesh>
            </group>
          );
        }
        const height = species === "fox" ? 0.26 : species === "wolf" ? 0.22 : 0.17;
        return (
          <group
            key={side}
            position={[side * 0.14, 0.215, 0.01]}
            rotation={[0.08, 0, side * -0.2]}
          >
            <mesh castShadow>
              <coneGeometry args={[0.085, height, 8]} />
              <meshStandardMaterial color={color} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.015, -0.03]}>
              <coneGeometry args={[0.045, height * 0.62, 6]} />
              <meshStandardMaterial color={innerColor} roughness={0.75} />
            </mesh>
          </group>
        );
      })}

      {/* Snout / muzzle */}
      <mesh
        position={[0, -0.052, -0.215]}
        scale={species === "fox" ? [0.85, 0.72, 1.25] : species === "cat" ? [0.88, 0.7, 0.8] : [1.0, 0.78, 1.05]}
      >
        <sphereGeometry args={[0.082, 10, 10]} />
        <meshStandardMaterial color={muzzleColor} roughness={0.75} />
      </mesh>

      {/* Nose tip */}
      <mesh position={[0, -0.03, species === "fox" ? -0.31 : species === "cat" ? -0.275 : -0.29]}>
        <sphereGeometry args={[0.026, 8, 8]} />
        <meshStandardMaterial color={noseColor} roughness={0.4} />
      </mesh>

      {/* Cat whiskers */}
      {species === "cat"
        ? ([-1, 1] as const).map((side) => (
            <group key={side} position={[side * 0.11, -0.05, -0.22]}>
              <mesh rotation={[0, side * 0.25, side * 0.1]}>
                <boxGeometry args={[0.09, 0.008, 0.008]} />
                <meshStandardMaterial color={muted ? "#757980" : "#5e5347"} />
              </mesh>
              <mesh position={[0, -0.022, 0]} rotation={[0, side * 0.25, side * -0.08]}>
                <boxGeometry args={[0.085, 0.008, 0.008]} />
                <meshStandardMaterial color={muted ? "#757980" : "#5e5347"} />
              </mesh>
            </group>
          ))
        : null}
    </group>
  );
}

/** Animated tail mounted at the character's lower back, angled neatly past the chair side. */
export function SpeciesTail({
  species,
  status,
  muted = false,
}: {
  species: Species;
  status: EmployeeStatus;
  muted?: boolean;
}) {
  const tailRef = useRef<Group>(null);
  const color = muted ? MUTED_FUR : SPECIES_COLORS[species];

  useFrame((state) => {
    const tail = tailRef.current;
    if (!tail) return;
    const t = state.clock.elapsedTime;
    const speed =
      status === "working" || status === "waiting_approval"
        ? 5.2
        : status === "starting"
          ? 3.4
          : status === "idle"
            ? 2.0
            : 0.7;
    const amp = status === "stopped" || status === "failed" ? 0.03 : 0.18;
    tail.rotation.y = 0.58 + Math.sin(t * speed) * amp;
    tail.rotation.z = -0.28 + Math.cos(t * speed * 0.5) * (amp * 0.45);
  });

  if (species === "human") return null;

  return (
    <group ref={tailRef} position={[0.08, 0.55, 0.17]} rotation={[0.42, 0.58, -0.28]}>
      {species === "fox" ? (
        <group rotation={[0.75, 0, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.34, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.41, 0]}>
            <sphereGeometry args={[0.092, 8, 8]} />
            <meshStandardMaterial color={muted ? "#c4c8cf" : "#ffffff"} roughness={0.8} />
          </mesh>
        </group>
      ) : species === "bear" ? (
        <mesh position={[0, 0.04, 0.08]} castShadow>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ) : (
        <mesh
          position={[0, species === "cat" ? 0.24 : 0.18, 0.06]}
          rotation={[species === "dog" ? 0.7 : 0.45, 0, 0]}
          castShadow
        >
          <capsuleGeometry
            args={[
              species === "cat" ? 0.036 : 0.062,
              species === "cat" ? 0.46 : species === "wolf" ? 0.38 : 0.28,
              4,
              8,
            ]}
          />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

/** Sleek purple/gold accented specialist headset centered around the head `[0, 0, 0]`. */
export function SpecialistHeadset({ muted = false }: { muted?: boolean }) {
  const bandColor = muted ? "#5a606a" : "#262b36";
  const accentColor = muted ? "#8b8f99" : "#9d6bff";
  const goldAccent = muted ? "#a3a6ad" : "#f5c451";

  return (
    <group>
      {/* Headband arc over the top of the head */}
      <mesh position={[0, 0.03, 0.01]} rotation={[0, 0, 0]} castShadow>
        <torusGeometry args={[0.258, 0.017, 8, 22, Math.PI]} />
        <meshStandardMaterial color={bandColor} roughness={0.4} metalness={0.45} />
      </mesh>
      {/* Ear cups */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * 0.252, 0.01, 0.01]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.072, 0.072, 0.042, 12]} />
            <meshStandardMaterial color={bandColor} roughness={0.45} metalness={0.4} />
          </mesh>
          <mesh position={[0, side * -0.022, 0]}>
            <cylinderGeometry args={[0.048, 0.048, 0.012, 12]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={muted ? 0.05 : 0.45}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}
      {/* Mic boom extending from left ear cup */}
      <mesh position={[-0.225, -0.06, -0.095]} rotation={[0.95, 0.35, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.2, 6]} />
        <meshStandardMaterial color={bandColor} metalness={0.5} />
      </mesh>
      <mesh position={[-0.17, -0.105, -0.175]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial
          color={goldAccent}
          emissive={goldAccent}
          emissiveIntensity={muted ? 0.05 : 0.35}
        />
      </mesh>
    </group>
  );
}

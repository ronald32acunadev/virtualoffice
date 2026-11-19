import type { Species } from "../api/types";

/** Fur color per species; humans keep a skin tone. */
export const SPECIES_COLORS: Record<Species, string> = {
  wolf: "#8d949e",
  dog: "#b98a56",
  fox: "#e07a2f",
  cat: "#d9c7a3",
  bear: "#6b4a32",
  human: "#f1d3b3",
};

type Ear = { x: number; y: number; z: number; kind: "cone" | "sphere" | "flop"; size: number };

const EARS: Record<Species, { kind: Ear["kind"]; size: number; spread: number } | null> = {
  wolf: { kind: "cone", size: 0.2, spread: 0.15 },
  fox: { kind: "cone", size: 0.26, spread: 0.16 },
  cat: { kind: "cone", size: 0.15, spread: 0.17 },
  dog: { kind: "flop", size: 0.16, spread: 0.24 },
  bear: { kind: "sphere", size: 0.09, spread: 0.19 },
  human: null,
};

/** Head ears and tail drawn from primitives; positions are relative to the character group. */
export function SpeciesParts({ species, tint }: { species: Species; tint?: string }) {
  const color = tint ?? SPECIES_COLORS[species];
  const ear = EARS[species];
  return (
    <>
      {ear
        ? ([-1, 1] as const).map((side) => (
            <mesh
              key={side}
              position={[side * ear.spread, ear.kind === "flop" ? 1.62 : 1.76, 0]}
              rotation={ear.kind === "flop" ? [0, 0, side * -0.9] : [0, 0, 0]}
            >
              {ear.kind === "cone" ? (
                <coneGeometry args={[0.09, ear.size * 1.6, 8]} />
              ) : ear.kind === "sphere" ? (
                <sphereGeometry args={[ear.size, 10, 10]} />
              ) : (
                <boxGeometry args={[0.08, ear.size * 1.6, 0.08]} />
              )}
              <meshStandardMaterial color={color} />
            </mesh>
          ))
        : null}
      {species === "human" ? null : <Tail species={species} color={color} />}
    </>
  );
}

function Tail({ species, color }: { species: Species; color: string }) {
  if (species === "fox") {
    return (
      <group position={[0, 0.6, 0.38]} rotation={[0.9, 0, 0]}>
        <mesh>
          <capsuleGeometry args={[0.11, 0.5, 4, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    );
  }
  if (species === "bear") {
    return (
      <mesh position={[0, 0.55, 0.32]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  const long = species === "cat" ? 0.7 : species === "wolf" ? 0.55 : 0.4;
  return (
    <mesh position={[0, 0.55, 0.36]} rotation={[species === "dog" ? 0.6 : 0.35, 0, 0]}>
      <capsuleGeometry args={[species === "cat" ? 0.04 : 0.07, long, 4, 8]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

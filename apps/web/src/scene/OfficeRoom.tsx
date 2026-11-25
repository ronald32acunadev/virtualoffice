import { useEffect, useMemo } from "react";
import {
  MOOD_PALETTES,
  OFFICE_HALF_SIZE,
  PROP_PLACEMENTS,
  type LightingMood,
  type PropPlacement,
} from "./officeTheme";
import { createRugTexture, createWoodFloorTexture } from "./textures";
import type { WorldThemeId } from "./themes/registry";
import { WesternCampEnvironment } from "./themes/environments/WesternCampEnvironment";
import { HorrorOfficeEnvironment } from "./themes/environments/HorrorOfficeEnvironment";
import { MetalConcertEnvironment } from "./themes/environments/MetalConcertEnvironment";

const WALL_HEIGHT = 5.4;
const WALL_THICKNESS = 0.45;
const SILL_HEIGHT = 1.2;
const WINDOW_TOP = 4.3;

type WindowSegment = {
  center: number;
  width: number;
};

function WindowAssembly({
  position,
  rotationY = 0,
  width,
  trimColor,
  windowGlow,
}: {
  position: [number, number, number];
  rotationY?: number;
  width: number;
  trimColor: string;
  windowGlow: string;
}) {
  const height = WINDOW_TOP - SILL_HEIGHT;
  const centerY = SILL_HEIGHT + height / 2;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Sill wall */}
      <mesh position={[0, SILL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, SILL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color="#e8dfd3" roughness={0.85} />
      </mesh>
      {/* Header wall */}
      <mesh
        position={[0, WINDOW_TOP + (WALL_HEIGHT - WINDOW_TOP) / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, WALL_HEIGHT - WINDOW_TOP, WALL_THICKNESS]} />
        <meshStandardMaterial color="#ede5d8" roughness={0.85} />
      </mesh>
      {/* Window wooden sill ledge */}
      <mesh position={[0, SILL_HEIGHT + 0.04, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.12, 0.08, WALL_THICKNESS + 0.16]} />
        <meshStandardMaterial color={trimColor} roughness={0.6} />
      </mesh>
      {/* Outer frame bars */}
      <mesh position={[0, WINDOW_TOP - 0.04, 0]}>
        <boxGeometry args={[width, 0.08, WALL_THICKNESS * 0.6]} />
        <meshStandardMaterial color="#4a433c" roughness={0.5} />
      </mesh>
      <mesh position={[-(width / 2 - 0.04), centerY, 0]}>
        <boxGeometry args={[0.08, height, WALL_THICKNESS * 0.6]} />
        <meshStandardMaterial color="#4a433c" roughness={0.5} />
      </mesh>
      <mesh position={[width / 2 - 0.04, centerY, 0]}>
        <boxGeometry args={[0.08, height, WALL_THICKNESS * 0.6]} />
        <meshStandardMaterial color="#4a433c" roughness={0.5} />
      </mesh>
      {/* Center mullion */}
      <mesh position={[0, centerY, 0]}>
        <boxGeometry args={[0.08, height, WALL_THICKNESS * 0.5]} />
        <meshStandardMaterial color="#4a433c" roughness={0.5} />
      </mesh>
      {/* Glass pane */}
      <mesh position={[0, centerY, 0]}>
        <boxGeometry args={[width - 0.12, height - 0.12, 0.05]} />
        <meshStandardMaterial
          color={windowGlow}
          emissive={windowGlow}
          emissiveIntensity={0.18}
          transparent
          opacity={0.28}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

function ExteriorTree({
  position,
  scale = 1,
  foliageColor,
}: {
  position: [number, number, number];
  scale?: number;
  foliageColor: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 2.0, 8]} />
        <meshStandardMaterial color="#7a5638" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[1.25, 2.2, 9]} />
        <meshStandardMaterial color={foliageColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, 3.6, 0]} castShadow>
        <coneGeometry args={[0.92, 1.7, 9]} />
        <meshStandardMaterial color={foliageColor} roughness={0.85} />
      </mesh>
    </group>
  );
}

function PottedPlant({ variant = 0 }: { variant?: number }) {
  const leafColors = ["#4d9658", "#5ca864", "#3d824b"];
  const mainLeaf = leafColors[variant % leafColors.length];
  return (
    <group>
      {/* Terracotta pot */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.24, 0.56, 12]} />
        <meshStandardMaterial color="#c46d49" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.54, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.34, 0.08, 12]} />
        <meshStandardMaterial color="#b35d3b" roughness={0.78} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.29, 0.29, 0.04, 12]} />
        <meshStandardMaterial color="#4b382a" roughness={0.95} />
      </mesh>
      {/* Layered low-poly foliage */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <sphereGeometry args={[0.36, 10, 10]} />
        <meshStandardMaterial color={mainLeaf} roughness={0.8} />
      </mesh>
      <mesh position={[-0.22, 0.82, 0.14]} castShadow>
        <sphereGeometry args={[0.24, 9, 9]} />
        <meshStandardMaterial color="#67b36b" roughness={0.8} />
      </mesh>
      <mesh position={[0.22, 0.86, -0.12]} castShadow>
        <sphereGeometry args={[0.26, 9, 9]} />
        <meshStandardMaterial color="#458a50" roughness={0.8} />
      </mesh>
      <mesh position={[0.04, 1.24, 0.06]} castShadow>
        <coneGeometry args={[0.22, 0.52, 8]} />
        <meshStandardMaterial color="#6ec072" roughness={0.78} />
      </mesh>
    </group>
  );
}

function Bookshelf({ variant = 0 }: { variant?: number }) {
  const bookPalettes = [
    ["#d9774a", "#4aa3d9", "#e2b659", "#5bbf7a", "#9a7ad9"],
    ["#4aa3d9", "#9a7ad9", "#d9774a", "#e6c367", "#52a874"],
  ] as const;
  const palette = bookPalettes[variant % bookPalettes.length] ?? bookPalettes[0];
  return (
    <group>
      {/* Frame back & sides */}
      <mesh position={[0, 1.1, -0.18]} castShadow receiveShadow>
        <boxGeometry args={[1.56, 2.2, 0.06]} />
        <meshStandardMaterial color="#a87e52" roughness={0.72} />
      </mesh>
      {([-0.75, 0.75] as const).map((x) => (
        <mesh key={x} position={[x, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 2.2, 0.42]} />
          <meshStandardMaterial color="#b98e5e" roughness={0.7} />
        </mesh>
      ))}
      {/* Shelves */}
      {[0.06, 0.72, 1.42, 2.17].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.56, 0.06, 0.42]} />
          <meshStandardMaterial color="#c49a6c" roughness={0.68} />
        </mesh>
      ))}
      {/* Colorful books on shelves */}
      {[0.25, 0.92, 1.62].map((shelfY, rowIdx) =>
        palette.map((color, idx) => (
          <mesh
            key={`${rowIdx}-${idx}`}
            position={[-0.52 + idx * 0.24, shelfY, 0.03]}
            rotation={[0, 0, idx === 4 && rowIdx === 1 ? 0.14 : 0]}
            castShadow
          >
            <boxGeometry args={[0.16, 0.34 + ((idx + rowIdx) % 3) * 0.05, 0.24]} />
            <meshStandardMaterial color={color} roughness={0.65} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Whiteboard() {
  return (
    <group position={[0, 2.6, 0]}>
      {/* Frame */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.6, 1.8, 0.08]} />
        <meshStandardMaterial color="#707885" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* White dry-erase surface */}
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[3.4, 1.6, 0.02]} />
        <meshStandardMaterial color="#f9fafc" roughness={0.35} />
      </mesh>
      {/* Diagram nodes & connector bars */}
      <mesh position={[-0.95, 0.28, 0.06]}>
        <boxGeometry args={[0.62, 0.26, 0.01]} />
        <meshStandardMaterial color="#4aa3d9" />
      </mesh>
      <mesh position={[0.05, 0.28, 0.06]}>
        <boxGeometry args={[0.62, 0.26, 0.01]} />
        <meshStandardMaterial color="#5bbf7a" />
      </mesh>
      <mesh position={[0.98, 0.28, 0.06]}>
        <boxGeometry args={[0.56, 0.26, 0.01]} />
        <meshStandardMaterial color="#9a7ad9" />
      </mesh>
      <mesh position={[-0.45, 0.28, 0.058]}>
        <boxGeometry args={[0.42, 0.03, 0.01]} />
        <meshStandardMaterial color="#526070" />
      </mesh>
      <mesh position={[0.52, 0.28, 0.058]}>
        <boxGeometry args={[0.42, 0.03, 0.01]} />
        <meshStandardMaterial color="#526070" />
      </mesh>
      {/* Sticky notes */}
      {[
        { x: -1.15, y: -0.35, color: "#ffd55a" },
        { x: -0.78, y: -0.32, color: "#ff8c70" },
        { x: -0.4, y: -0.36, color: "#76d79d" },
        { x: 0.45, y: -0.34, color: "#7ec8f2" },
        { x: 0.85, y: -0.32, color: "#ffd55a" },
      ].map((note, idx) => (
        <mesh key={idx} position={[note.x, note.y, 0.06]} rotation={[0, 0, (idx - 2) * 0.05]}>
          <boxGeometry args={[0.22, 0.22, 0.01]} />
          <meshStandardMaterial color={note.color} roughness={0.6} />
        </mesh>
      ))}
      {/* Marker tray */}
      <mesh position={[0, -0.88, 0.1]} castShadow>
        <boxGeometry args={[1.4, 0.06, 0.12]} />
        <meshStandardMaterial color="#555d68" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

function CoffeeBar() {
  return (
    <group>
      {/* Wood cabinet base */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.9, 0.72]} />
        <meshStandardMaterial color="#b38456" roughness={0.7} />
      </mesh>
      {/* Stone countertop */}
      <mesh position={[0, 0.93, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.88, 0.07, 0.78]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.4} />
      </mesh>
      {/* Espresso machine */}
      <mesh position={[-0.4, 1.22, -0.05]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.38]} />
        <meshStandardMaterial color="#3c434d" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[-0.4, 1.38, 0.15]}>
        <boxGeometry args={[0.36, 0.08, 0.04]} />
        <meshStandardMaterial color="#d8a25e" emissive="#ffb85c" emissiveIntensity={0.4} />
      </mesh>
      {/* Ceramic mugs */}
      {[-0.02, 0.18, 0.38].map((mx, idx) => (
        <mesh key={idx} position={[mx, 1.04, 0.12]} castShadow>
          <cylinderGeometry args={[0.06, 0.055, 0.14, 10]} />
          <meshStandardMaterial color={["#f5efe6", "#d9774a", "#4aa3d9"][idx]} roughness={0.4} />
        </mesh>
      ))}
      {/* Cookie jar */}
      <mesh position={[0.64, 1.09, -0.08]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.24, 12]} />
        <meshStandardMaterial color="#f2c48d" roughness={0.5} />
      </mesh>
    </group>
  );
}

function WaterCooler() {
  return (
    <group>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 1.04, 0.46]} />
        <meshStandardMaterial color="#f0f2f5" roughness={0.45} />
      </mesh>
      {/* Water jug */}
      <mesh position={[0, 1.28, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.46, 14]} />
        <meshStandardMaterial color="#7ac6f5" transparent opacity={0.72} roughness={0.15} />
      </mesh>
      {/* Taps */}
      <mesh position={[-0.08, 0.85, 0.25]}>
        <boxGeometry args={[0.05, 0.06, 0.06]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0.08, 0.85, 0.25]}>
        <boxGeometry args={[0.05, 0.06, 0.06]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
    </group>
  );
}

function WallArt({ variant = 0 }: { variant?: number }) {
  const accent = variant === 0 ? "#d9774a" : "#4aa3d9";
  const secondary = variant === 0 ? "#e7b96a" : "#5bbf7a";
  return (
    <group position={[0, 2.65, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.45, 1.05, 0.06]} />
        <meshStandardMaterial color="#b98e5e" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <boxGeometry args={[1.28, 0.88, 0.02]} />
        <meshStandardMaterial color="#f7f2ea" roughness={0.7} />
      </mesh>
      <mesh position={[-0.22, 0.05, 0.05]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      <mesh position={[0.24, -0.08, 0.05]}>
        <boxGeometry args={[0.42, 0.42, 0.02]} />
        <meshStandardMaterial color={secondary} roughness={0.6} />
      </mesh>
    </group>
  );
}

function LoungeRug() {
  const rugTexture = useMemo(() => createRugTexture("#c49a6c"), []);
  useEffect(() => () => rugTexture?.dispose(), [rugTexture]);

  return (
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[2.7, 2.7]} />
      <meshStandardMaterial
        map={rugTexture ?? undefined}
        color={rugTexture ? "#ffffff" : "#ddd0bf"}
        roughness={0.92}
      />
    </mesh>
  );
}

function RoomProp({ placement }: { placement: PropPlacement }) {
  const { kind, position, rotationY = 0, variant } = placement;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {kind === "plant" ? <PottedPlant variant={variant} /> : null}
      {kind === "bookshelf" ? <Bookshelf variant={variant} /> : null}
      {kind === "whiteboard" ? <Whiteboard /> : null}
      {kind === "coffee_bar" ? <CoffeeBar /> : null}
      {kind === "water_cooler" ? <WaterCooler /> : null}
      {kind === "wall_art" ? <WallArt variant={variant} /> : null}
      {kind === "lounge_rug" ? <LoungeRug /> : null}
    </group>
  );
}

function DefaultOfficeEnvironment({ mood }: { mood: LightingMood }) {
  const palette = MOOD_PALETTES[mood];
  const woodFloorTexture = useMemo(() => createWoodFloorTexture(), []);

  useEffect(() => () => woodFloorTexture?.dispose(), [woodFloorTexture]);

  const floorSize = OFFICE_HALF_SIZE * 2;
  const backWindows: WindowSegment[] = [
    { center: -6.9, width: 5.8 },
    { center: 8.5, width: 6.6 },
  ];
  const leftWindows: WindowSegment[] = [
    { center: -11.85, width: 3.3 },
    { center: 3.5, width: 3.4 },
  ];
  const treeColor = mood === "day" ? "#5ea155" : "#2e5438";

  return (
    <group>
      {/* Exterior courtyard ground plane */}
      <mesh position={[0, -1.25, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color={palette.exteriorSky} roughness={0.95} />
      </mesh>

      {/* Stylized exterior trees visible outside the cutaway windows */}
      {(
        [
          [-8, -1.25, -20.5, 1.15],
          [-1.5, -1.25, -22.5, 0.95],
          [7.5, -1.25, -20.0, 1.2],
          [15.5, -1.25, -19.0, 0.9],
          [-20.5, -1.25, -12.0, 1.15],
          [-21.5, -1.25, 3.0, 1.05],
          [-19.5, -1.25, 13.0, 0.9],
        ] as const
      ).map(([x, y, z, scale], idx) => (
        <ExteriorTree key={idx} position={[x, y, z]} scale={scale} foliageColor={treeColor} />
      ))}

      {/* Diorama plinth & thick architectural slab */}
      <mesh position={[0, -0.46, 0]} receiveShadow castShadow>
        <boxGeometry args={[floorSize + 0.9, 0.9, floorSize + 0.9]} />
        <meshStandardMaterial color="#d8cfc2" roughness={0.85} />
      </mesh>
      <mesh position={[0, -1.06, 0]} receiveShadow>
        <boxGeometry args={[floorSize + 1.8, 0.34, floorSize + 1.8]} />
        <meshStandardMaterial color={palette.trimColor} roughness={0.8} />
      </mesh>

      {/* Main wood-plank office floor (top surface at y = 0) */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial
          map={woodFloorTexture ?? undefined}
          color={woodFloorTexture ? "#ffffff" : "#d4ae80"}
          roughness={0.78}
          metalness={0.04}
        />
      </mesh>

      {/* Back wall (z = -15.225) with solid piers and panoramic sunlit windows */}
      <group position={[0, 0, -OFFICE_HALF_SIZE - WALL_THICKNESS / 2]}>
        {/* Pier 1: [-15.45, -9.8] */}
        <mesh position={[-12.625, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[5.65, WALL_HEIGHT, WALL_THICKNESS]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.85} />
        </mesh>
        {/* Pier 2: [-4.0, 5.2] */}
        <mesh position={[0.6, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[9.2, WALL_HEIGHT, WALL_THICKNESS]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.85} />
        </mesh>
        {/* Pier 3: [11.8, 15.0] */}
        <mesh position={[13.4, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, WALL_HEIGHT, WALL_THICKNESS]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.85} />
        </mesh>
        {backWindows.map((win) => (
          <WindowAssembly
            key={win.center}
            position={[win.center, 0, 0]}
            width={win.width}
            trimColor={palette.trimColor}
            windowGlow={palette.windowGlow}
          />
        ))}
        {/* Oak baseboard & top architectural cap */}
        <mesh position={[-0.225, 0.12, WALL_THICKNESS / 2 + 0.025]} receiveShadow>
          <boxGeometry args={[floorSize + 0.45, 0.24, 0.05]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.7} />
        </mesh>
        <mesh position={[-0.225, WALL_HEIGHT + 0.08, 0]} castShadow>
          <boxGeometry args={[floorSize + 0.55, 0.16, WALL_THICKNESS + 0.1]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.7} />
        </mesh>
      </group>

      {/* Left wall (x = -15.225) with solid piers and sunlit windows */}
      <group position={[-OFFICE_HALF_SIZE - WALL_THICKNESS / 2, 0, 0]}>
        {/* Pier 1: [-15.0, -13.5] */}
        <mesh position={[0, WALL_HEIGHT / 2, -14.25]} castShadow receiveShadow>
          <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, 1.5]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.85} />
        </mesh>
        {/* Pier 2: [-10.2, 1.8] */}
        <mesh position={[0, WALL_HEIGHT / 2, -4.2]} castShadow receiveShadow>
          <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, 12.0]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.85} />
        </mesh>
        {/* Pier 3: [5.2, 15.0] */}
        <mesh position={[0, WALL_HEIGHT / 2, 10.1]} castShadow receiveShadow>
          <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, 9.8]} />
          <meshStandardMaterial color={palette.wallColor} roughness={0.85} />
        </mesh>
        {leftWindows.map((win) => (
          <WindowAssembly
            key={win.center}
            position={[0, 0, win.center]}
            rotationY={Math.PI / 2}
            width={win.width}
            trimColor={palette.trimColor}
            windowGlow={palette.windowGlow}
          />
        ))}
        {/* Oak baseboard & top architectural cap */}
        <mesh position={[WALL_THICKNESS / 2 + 0.025, 0.12, 0]} receiveShadow>
          <boxGeometry args={[0.05, 0.24, floorSize]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, WALL_HEIGHT + 0.08, 0]} castShadow>
          <boxGeometry args={[WALL_THICKNESS + 0.1, 0.16, floorSize + 0.1]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.7} />
        </mesh>
      </group>

      {/* Subtle architectural wood ceiling rafters & warm pendant lights along back/left edge */}
      {[-9, 0, 9].map((bx) => (
        <mesh key={bx} position={[bx, WALL_HEIGHT - 0.12, -13.7]} castShadow>
          <boxGeometry args={[0.24, 0.22, 2.6]} />
          <meshStandardMaterial color={palette.trimColor} roughness={0.7} />
        </mesh>
      ))}
      {(
        [
          [-7, -13.3],
          [7, -13.3],
          [-13.3, -7],
          [-13.3, 7],
        ] as const
      ).map(([lx, lz], idx) => (
        <group key={idx} position={[lx, WALL_HEIGHT - 0.25, lz]}>
          <mesh position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
            <meshStandardMaterial color="#3c4048" />
          </mesh>
          <mesh position={[0, -0.75, 0]}>
            <coneGeometry args={[0.32, 0.22, 12]} />
            <meshStandardMaterial color="#49505c" roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.84, 0]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial
              color={palette.lampEmissive}
              emissive={palette.lampEmissive}
              emissiveIntensity={mood === "evening" ? 1.8 : 0.35}
            />
          </mesh>
          <pointLight
            position={[0, -1.1, 0]}
            color={palette.lampEmissive}
            intensity={palette.lampIntensity * 2.4}
            distance={14}
            decay={1.8}
          />
        </group>
      ))}

      {/* Decorative room props */}
      {PROP_PLACEMENTS.map((placement) => (
        <RoomProp key={placement.id} placement={placement} />
      ))}
    </group>
  );
}

export function OfficeRoom({ mood, theme = "office" }: { mood: LightingMood; theme?: WorldThemeId }) {
  if (theme === "western") return <WesternCampEnvironment mood={mood} />;
  if (theme === "horror") return <HorrorOfficeEnvironment mood={mood} />;
  if (theme === "metal") return <MetalConcertEnvironment mood={mood} />;
  return <DefaultOfficeEnvironment mood={mood} />;
}

# World Themes & Settings Design

**Date:** 2026-11-24
**Status:** Draft (pending builder check & user approval)

## Intent & Why

Virtual Office currently renders a single 3D office environment with a `day` / `evening` lighting toggle and no Settings UI. The user wants a Settings experience where they can switch between distinct, full-world themes:

1. **Office** (`office`) — the existing cozy virtual office (default).
2. **Western Camp** (`western`) — an outdoor frontier camp with tents, campfires, wooden trails, and desert/canyon atmosphere.
3. **Horror Office** (`horror`) — a haunted, eerie office with flickering candles, cobwebs, broken/boarded windows, and spooky atmosphere.
4. **Metal Concert** (`metal`) — a live heavy-metal concert stage with trusses, stage lights, speakers/amps, instruments, and arena atmosphere.

Every theme must feel like a complete world transformation rather than a shallow color swap, while keeping both **Day** and **Evening** lighting moods working across all four themes (8 distinct atmospheres total).

## Goals

- **Settings UI:** Provide a dedicated Settings modal accessible from both the 3D `OfficeView` HUD and the `WorkspaceView` Sidebar, allowing users to pick the active world theme (with visual swatches/descriptions) and adjust view preferences (`day`/`evening` lighting mood and chatter quotes toggle).
- **Cross-Window Sync & Persistence:** Persist the selected theme in `localStorage` and synchronize it live across open `OfficeView` and `WorkspaceView` tabs/windows using the existing `BroadcastChannel` + `storage` event pattern (`apps/web/src/state/officeMood.ts` and `apps/web/src/state/windowChannel.ts`).
- **Full 3D World Transformation:**
  - **Environment:** Dedicated procedural 3D environment per theme (floor/terrain, walls or outdoor perimeter, sky/fog/lighting palette for both `day` and `evening`, themed props, and themed Media TV housing/standby screen).
  - **Workstations:** Theme-specific boss and employee station geometry (e.g., office desks, rustic wooden western tables/crates with lanterns, haunted desks with candles/gothic monitors, metal stage amp stacks/instrument rigs with stage monitors) while preserving clear visual status feedback (`working`, `waiting_approval`, `idle`, `on_break`, `starting`, `stopped`, `failed`).
  - **Character Accessories:** Theme-specific procedural accessories on bosses and employees (e.g., western cowboy hats/bandanas, horror spooky accents, metal bandanas/spiked accents/instruments) layered cleanly onto existing `SpeciesParts` and specialist headsets without obscuring species or status colors.
  - **Themed Chatter Quotes:** Per-theme quote pools in `officeQuotes.ts` (retaining existing The Office quotes for `office` and adding themed pools for `western`, `horror`, and `metal`).
- **Full 2D UI & Terminal Theming:**
  - Apply `data-office-theme="<themeId>"` alongside `data-office-mood="day|evening"` on `document.documentElement`.
  - Provide theme + mood CSS custom property palettes in `apps/web/src/styles.css` and update `getTerminalTheme(mood, theme)` so `TerminalPanel` matches all 8 combinations with readable contrast.

## Non-Goals

- Loading external 3D asset files (`.glb`/`.gltf`), external image textures, or external audio files; all geometry and canvas textures remain procedural.
- Changing boss/employee quadrant positions (`apps/web/src/scene/layout.ts`) or camera orbit/TV-focus mechanics (`apps/web/src/scene/camera.ts`) per theme.
- Server-side or per-workspace persistence of the selected theme (remains client-side `localStorage` + `BroadcastChannel`, matching `mood` and `chatter`).
- Per-boss or per-employee mixed themes; one global theme applies to the entire 3D scene and 2D workspace.
- Synthesized ambient sound effects per theme (Media TV remains the only audio/video playback feature).

## Anti-Goals

- **Obscuring agent status:** Visual flair (fog, dim lighting, props, accessories) must never make it hard to distinguish `working`, `waiting_approval`, `failed`, `on_break`, or `stopped` states.
- **Regressing the default Office theme:** `office` + `day` and `office` + `evening` must preserve their existing appearance and tests.
- **Monolithic scene conditionals:** `OfficeRoom.tsx` and `BossArea.tsx` must not turn into giant `switch`/`if` blocks mixing all 4 worlds' geometry.
- **Breaking Media TV interaction:** The 3D `OfficeMediaTv` HTML overlay, portal ref, and `Focus TV` camera preset must remain unobstructed and functional in every theme.

## Constraints

- **Stack:** React, TypeScript, Three.js via `@react-three/fiber` and `@react-three/drei`, CSS custom properties (`apps/web/src/styles.css`), Vitest unit tests.
- **Shared Spatial Contract:** All themes mount onto the existing `OFFICE_HALF_SIZE` (15) arena and `layout.ts` quadrant coordinates (`AREA_CENTERS`, `bossDeskPosition`, `employeeDeskPosition`). All themed props must pass `overlapsAnyDesk` collision checks.
- **Media TV Anchor:** `OfficeMediaTv` stays anchored at `TV_MOUNT_POSITION` so `TV_FOCUS_CAMERA_POSITION` / `TV_FOCUS_CAMERA_TARGET` remain accurate across all themes.
- **Performance:** Procedural meshes and dynamic lights (e.g., campfire/candle/stage lights) must stay lightweight enough for smooth interaction with 4 bosses and up to 9 employees per boss (avoid dozens of shadow-casting point lights; keep shadows on the main directional light).
- **Accessibility & Readability:** All 8 UI theme × mood combinations must preserve legible text, badge, input, and terminal contrast.

## Approaches Considered

### Approach A — Modular Theme Registry + Per-Theme 3D Environments on Shared Layout (Selected)

- Introduce a `WorldThemeId = "office" | "western" | "horror" | "metal"` and a central theme registry (`apps/web/src/scene/themes/`) exporting per-theme 3D palettes (`day` & `evening`), prop layouts, quote pools, TV housing metadata, UI/terminal palettes, and environment/station/accessory renderers.
- Refactor `OfficeRoom.tsx` into a dispatcher (or thin wrapper) delegating to dedicated environment components (`OfficeEnvironment`, `WesternCampEnvironment`, `HorrorOfficeEnvironment`, `MetalConcertEnvironment`).
- Refactor `Desk` (`BossArea.tsx`) and `Character.tsx` to render theme-appropriate station props/geometry and character accessories while sharing the core animation, status glow, and click/hover logic.
- **Tradeoffs:** Requires a clean initial refactor of `OfficeRoom`, `Desk`, and `officeMood`, but keeps each theme isolated, testable, and easy to extend with future themes.

### Approach B — Parametric Reskin on Existing Geometry

- Keep a single room and desk mesh structure, swapping only material colors, textures, lighting, a few props, and one accessory per theme.
- **Tradeoffs:** Faster initially, but fails the user's goal of distinct worlds (an outdoor western camp or metal concert inside the same windowed office walls feels like a reskin, not a theme).

### Approach C — Fully Independent 3D Scenes & Layouts per Theme

- Each theme defines its own quadrant/stage layout, camera presets, and scene tree from scratch.
- **Tradeoffs:** Maximum artistic freedom, but multiplies maintenance across `layout.ts`, `camera.ts`, `overlapsAnyDesk`, TV focus, and tests for up to 36 employees.

**Selection:** The user chose **Approach A** because it delivers genuinely distinct 3D worlds and full UI theming while keeping layout, camera, TV, and interactions rock-solid.

## Architecture & Decisions

### Decided by the User

- **4 Themes:** Office (`office`), Western Camp (`western`), Horror Office (`horror`), Metal Concert (`metal`).
- **Full Scope:** Each theme transforms the 3D environment, boss/employee workstations, character accessories, chatter quotes, and 2D UI + terminal colors.
- **Day & Evening in All Themes:** Both `day` and `evening` lighting moods remain available and meaningful in every theme:
  - `office`: bright daylight office / cozy warm evening office (existing).
  - `western`: sun-baked desert noon / warm sunset & campfire night under stars.
  - `horror`: overcast gloomy storm day / eerie midnight with candlelight & moonlight.
  - `metal`: outdoor daylight metal festival / dark indoor/night arena with dramatic neon/stage lighting.
- **Architecture:** Approach A (Modular Theme Registry + per-theme environments over shared `layout.ts`).

### Architect Calls (Proposed Defaults — User May Override)

1. **Theme IDs & Default:** `WorldThemeId = "office" | "western" | "horror" | "metal"`, defaulting to `"office"` when unset or invalid in storage.
2. **State & Sync Pattern:** Add `apps/web/src/state/worldTheme.ts` (or extend `officeMood.ts` into a cohesive theme/mood state module) using `localStorage` key `virtual-office:theme`, `document.documentElement.dataset.officeTheme`, and `WindowMessage` variant `{ type: "theme_changed"; theme: WorldThemeId }` in `windowChannel.ts`. Keep `useOfficeMood` backwards-compatible.
3. **Settings Entry Points & Modal:**
   - Reuse `apps/web/src/views/Modal.tsx` to build `SettingsModal.tsx`.
   - Open it via a `⚙ Settings` button in the `OfficeView` HUD toolbar and a `Settings` button in `Sidebar`.
   - Keep existing 1-click HUD quick toggles (`Day/Evening`, `Quotes`) in `OfficeView` and keep them synchronized with the Settings modal.
4. **Media TV Adaptation:** Keep `OfficeMediaTv.tsx` at `TV_MOUNT_POSITION` and preserve the HTML playback overlay, while styling its 3D frame and standby header/subtitle per theme (modern TV for Office, rustic wooden trail marquee for Western, weathered gothic CRT/frame for Horror, truss-mounted concert jumbotron for Metal).
5. **Boss & Employee Status Clarity:** Keep `MONITOR_VISUALS` / status glow indicators and floating name/role/status badges consistent in position and color semantics across all themes (e.g., in Western a lantern/badge/dispatch board glows with status color; in Metal a stage monitor/amp LED glows with status color).
6. **Procedural Assets Only:** All new geometry, particles/lights, and canvas textures (sand/dirt ground, wooden planks, dark cracked floorboards, metallic stage grating) are generated procedurally in `textures.ts` / theme modules with proper `.dispose()` cleanup on unmount.

## What's Left to the Builder

- Exact Three.js primitive compositions, vertex coordinates, and subtle animations (campfire flicker, candle flicker, stage spotlight sweeps) for each of the 3 new environments, stations, and character accessories.
- Exact copy for the Western, Horror, and Metal quote banks in `officeQuotes.ts` (matching the existing `status`-aware + general quote structure).
- Exact hex values for the 6 new UI + terminal CSS palettes (`western`, `horror`, `metal` × `day`, `evening`) in `styles.css` and `officeMood.ts`, verified for readable contrast.
- Exact file organization under `apps/web/src/scene/themes/` and unit tests covering theme parsing/storage/sync, prop collision safety (`overlapsAnyDesk`), palette completeness (all 4 × 2 combinations), quote selection, and Settings UI state.

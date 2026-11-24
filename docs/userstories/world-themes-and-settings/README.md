# World Themes & Settings — User Stories

Design spec: [2026-11-24-world-themes-settings-design.md](../../superpowers/specs/2026-11-24-world-themes-settings-design.md)
Builds on: [Office Media TV](../office-media-tv/README.md) and [3D Virtual Office Redesign](../office-3d-redesign/README.md).
Branch: `feature/world-themes-and-settings`, created from `feature/office-media-tv` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-24).
Implementer route: local-first (`pumbastudio` → `pumbalama` → lightweight hosted fallback); planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Theme registry, persistence, cross-window sync, and 2D UI / terminal palettes | — | complete |
| US-02 | Settings modal in Office HUD and Workspace Sidebar | US-01 | complete |
| US-03 | Modular 3D environments and themed Media TV housing for Office, Western Camp, Horror Office, and Metal Concert | US-01 | complete |
| US-04 | Theme-specific boss/employee workstations and character accessories | US-01, US-03 | pending |
| US-05 | Theme-specific chatter quotes, full scene wiring, and end-to-end verification | US-01, US-02, US-03, US-04 | pending |

## Confirmed facts, decisions & scope boundaries

- **Confirmed facts (verified in codebase on 2026-11-24)**:
  - `apps/web` uses React `19.3.1`, TypeScript `7.0.2`, Vite `8.3.8`, Vitest `5.1.1`, Three.js `0.187.0`, `@react-three/fiber` `9.8.2`, `@react-three/drei` `10.7.9`, and `@xterm/xterm` `6.0.0`.
  - Lighting mood (`"day" | "evening"`) is persisted in `localStorage`, synced across `/office` and `/workspace` via `BroadcastChannel("virtual-office")` (`apps/web/src/state/windowChannel.ts`) + `storage` events (`apps/web/src/state/officeMood.ts`), and applied to CSS via `document.documentElement.dataset.officeMood`.
  - `apps/web/src/styles.css` defines UI tokens under `:root[data-office-mood="day"]` and `:root[data-office-mood="evening"]`.
  - The 3D scene (`OfficeScene.tsx` → `OfficeRoom.tsx`, `OfficeMediaTv.tsx`, `BossArea.tsx`, `Character.tsx`) is 100% procedural Three.js geometry anchored on `layout.ts` quadrant coordinates and `OFFICE_HALF_SIZE = 15`.
  - `apps/web/src/views/Modal.tsx` provides a reusable accessible modal dialog with `Escape` key and backdrop close.
- **Approved product decisions**:
  - 4 selectable world themes: **Office** (`office`, default), **Western Camp** (`western`), **Horror Office** (`horror`), and **Metal Concert** (`metal`).
  - Both **Day** and **Evening** lighting moods remain active across all 4 themes (8 atmospheres total).
  - Full-world transformation: 3D environment, boss/employee stations, character accessories, Media TV housing/standby copy, chatter quotes, and 2D UI + terminal palettes.
  - Architecture: Approach A (modular theme registry + dedicated per-theme environment components sharing `layout.ts` and `camera.ts`).
- **Scope boundaries & exclusions**:
  - **Client-side only**: theme preference is stored in `localStorage` (`virtualoffice:theme`) and synced via `BroadcastChannel`; no backend API or SQLite changes.
  - **Procedural assets only**: no external `.glb`/`.gltf` models, image downloads, or new npm dependencies.
  - **Layout & camera preserved**: `layout.ts` quadrant positions and `camera.ts` default/TV-focus presets stay unchanged across themes.
  - **No ambient audio synthesis**: Media TV remains the only audio/video playback mechanism.

Verification levels: Vitest unit tests in `apps/web`, `npm run typecheck`, `npm test`, and `npm run build`, plus manual visual verification in `/office` and `/workspace` across all 4 themes in both Day and Evening moods.

---

## US-01 — Theme registry, persistence, cross-window sync, and 2D UI / terminal palettes

As the owner, I want a modular world-theme registry with persistent storage, cross-tab synchronization, and matching 2D UI and terminal palettes for all 4 themes in both Day and Evening moods, so that switching themes updates both `/office` and `/workspace` consistently and survives reloads.

- `US-01 / AC-01`: Given `WORLD_THEMES` and `WORLD_THEME_IDS` (`["office", "western", "horror", "metal"]`), every theme entry provides complete metadata (`id`, `label`, `description`, `swatchColors`, `tvStandbyTitle`, `tvStandbySubtitle`), complete 3D `MoodPalette` objects for both `"day"` and `"evening"`, and complete 2D UI + terminal palettes for both `"day"` and `"evening"`, with `"office"` matching the existing `MOOD_PALETTES`, `OFFICE_UI_PALETTES`, and `getTerminalTheme` values.
- `US-01 / AC-02`: Given `parseWorldTheme(raw)` and `readSavedWorldTheme(storage)`, valid theme IDs return the matching `WorldThemeId`, while `null`, empty strings, unknown strings, or unavailable/throwing `Storage` fall back safely to `"office"` without throwing.
- `US-01 / AC-03`: Given `createWorldThemeSync` / `useWorldTheme`, changing the theme persists to `localStorage` under `"virtualoffice:theme"`, sets `document.documentElement.dataset.officeTheme = theme`, and broadcasts `{ type: "theme_changed", theme }` over `windowChannel.ts`; receiving a valid `theme_changed` message or `storage` event updates the active theme and `data-office-theme` attribute in open tabs, while invalid messages are ignored without mutating state.
- `US-01 / AC-04`: Given `apps/web/src/styles.css` and `getTerminalTheme(mood, theme)`, all 8 combinations (`office`, `western`, `horror`, `metal` × `day`, `evening`) define coherent CSS custom properties (`--bg`, `--panel`, `--card`, `--border`, `--text`, `--muted`, `--accent`, etc.) under `[data-office-theme="..."][data-office-mood="..."]` and return distinct, readable terminal palettes while preserving existing `:root[data-office-mood="day"|"evening"]` defaults when `data-office-theme` is `"office"` or unset.

### Verification mapping (US-01)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`, `US-01 / AC-02`, `US-01 / AC-03` | `apps/web/src/state/worldTheme.test.ts` (all 4×2 registry entries complete, `"office"` matches baseline palettes, `parseWorldTheme` fallback on invalid/throwing storage, `createWorldThemeSync` persists/applies `dataset.officeTheme`/broadcasts and receives `theme_changed` & `storage` events) | Passed (`25/25` tests in `worldTheme.test.ts`) |
| `US-01 / AC-03` + `windowChannel` regression | `apps/web/src/state/worldTheme.test.ts` + `apps/web/src/state/windowChannel.test.ts` (`parseWindowMessage` parses valid `theme_changed`, rejects unknown theme IDs, preserves existing `focus_employee`/`ping`/`pong`/`mood_changed` behavior) | Passed (`4/4` in `windowChannel.test.ts`, `25/25` in `worldTheme.test.ts`) |
| `US-01 / AC-04` + `officeMood` / terminal regression | `apps/web/src/state/worldTheme.test.ts` + `apps/web/src/state/officeMood.test.ts` (`getTerminalTheme(mood, theme)` backwards-compatible default for `"office"`, distinct readable palettes for all 4×2 combinations, all 6 CSS selectors present, no `#212121`/`#171717`) | Passed (`7/7` in `officeMood.test.ts`; `npm run typecheck -w apps/web` clean) |

---

## US-02 — Settings modal in Office HUD and Workspace Sidebar

As the owner, I want a Settings modal accessible from both the 3D Office HUD and the Workspace Sidebar where I can preview and select any of the 4 world themes (as well as toggle Day/Evening lighting and Chatter quotes), so that I can customize the app from whichever view I am using.

- `US-02 / AC-01`: Given `SettingsModal.tsx` (built on `Modal.tsx`), when opened it displays all 4 themes (`Office`, `Western Camp`, `Horror Office`, `Metal Concert`) with their descriptions and color swatches, marks the active theme with `aria-pressed="true"` (or `aria-checked="true"`), and clicking another theme immediately invokes `onSelectTheme(themeId)` and updates the active state.
- `US-02 / AC-02`: Given `SettingsModal.tsx`, it also exposes Lighting Mood (`Day` / `Evening`) and Chatter Quotes (`On` / `Off`) controls that stay synchronized with the active state, and closes cleanly via the Close button, backdrop click, or `Escape` key.
- `US-02 / AC-03`: Given `OfficeView.tsx`, a `Settings` button in the `.office-hud` toolbar opens `SettingsModal`; existing quick-toggle HUD buttons (`Day/Evening`, `Quotes`, `Reset view`, `TV / Music`, `Focus TV`) remain present and stay synchronized with changes made inside the Settings modal.
- `US-02 / AC-04`: Given `WorkspaceView.tsx` and `Sidebar.tsx`, a `Settings` button in the sidebar opens `SettingsModal`, and changing the theme or mood updates `WorkspaceView` (including `ConversationPane` / `TerminalPanel`) and broadcasts to `/office` immediately.

### Verification mapping (US-02)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-02 / AC-01`, `US-02 / AC-02` | `apps/web/src/views/settingsModal.test.ts` (theme option model ordering/metadata, active selection state, callback invocation for theme/mood/chatter controls) | Passed (`3/3` tests in `settingsModal.test.ts`) |
| `US-02 / AC-03`, `US-02 / AC-04` + HUD/Sidebar regression | `npm run typecheck`, `npm test`, `npm run build` + manual check opening Settings from both `/office` HUD and `/workspace` Sidebar and verifying live sync across open tabs | Automated: passed (`28/28` test files, `194/194` tests, `tsc --noEmit` clean, `vite build` clean); manual browser check pending final visual pass |

---

## US-03 — Modular 3D environments and themed Media TV housing for Office, Western Camp, Horror Office, and Metal Concert

As the owner, I want each of the 4 themes to render its own distinct procedural 3D environment and themed Media TV housing in both Day and Evening moods while keeping the layout and camera controls intact, so that switching themes genuinely transforms the 3D world.

- `US-03 / AC-01`: Given `OfficeRoom.tsx` refactored into a theme dispatcher delegating to `apps/web/src/scene/themes/environments/`:
  - `office` renders `OfficeEnvironment` identically to the existing office (wood floor, cutaway walls, windows, exterior trees, ceiling lamps, and existing `PROP_PLACEMENTS`).
  - `western` renders `WesternCampEnvironment` (procedural desert/dirt ground, wooden perimeter/canyon backdrop, canvas tents, crackling campfire with subtle flicker, cacti, barrels/wagon props, and sun/starry night lighting).
  - `horror` renders `HorrorOfficeEnvironment` (aged dark floorboards, weathered walls with boarded/cracked windows, cobwebs, flickering candles, eerie wall frames, and gloomy day / candlelit midnight lighting).
  - `metal` renders `MetalConcertEnvironment` (dark metallic stage deck, overhead lighting truss with colored stage beams/spotlights, speaker stacks, crowd barrier/pyro accents, and daylight festival / dark neon arena lighting).
- `US-03 / AC-02`: Given prop placement definitions for every theme (`office`, `western`, `horror`, `metal`), every prop has a unique ID, lies strictly within `OFFICE_HALF_SIZE` (`15`), and returns `false` for `overlapsAnyDesk(x, z, radius)` across all 4 bosses and 9 employee slots per boss.
- `US-03 / AC-03`: Given `OfficeMediaTv.tsx` receiving `theme: WorldThemeId`, the Media TV remains anchored at `TV_MOUNT_POSITION` with its `<Html transform portal={portalRef}>` playback overlay and `Focus TV` camera target intact, while adapting its 3D bezel/housing frame and standby header/subtitle to match the active theme.
- `US-03 / AC-04`: Given procedural Three.js textures created for any theme (`textures.ts`), switching themes disposes previous `CanvasTexture` instances cleanly on unmount/change without leaking GPU resources.

### Verification mapping (US-03)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-03 / AC-02` + layout collision regression | `apps/web/src/scene/officeTheme.test.ts` (expanded to validate prop bounds, unique IDs, and zero `overlapsAnyDesk` collisions for all 4 themes, plus all 4×2 mood palettes) | Passed (`7/7` tests in `officeTheme.test.ts`) |
| `US-03 / AC-03` + Media TV regression | `apps/web/src/scene/officeTheme.test.ts` + `apps/web/src/scene/mediaTv.test.ts` (themed TV standby title/subtitle and frame style descriptors for all 4 themes while preserving strict embed URL allowlist and `TV_MOUNT_POSITION`) | Passed (`7/7` in `mediaTv.test.ts`, `7/7` in `officeTheme.test.ts`) |
| `US-03 / AC-01`, `US-03 / AC-04` | `npm run typecheck`, `npm test`, `npm run build` + manual visual verification in `/office` switching through all 4 themes in Day & Evening and checking `Focus TV` | Automated: passed (`28/28` test files, `196/196` tests, `tsc --noEmit` clean, `vite build` clean); manual visual check pending final pass |

---

## US-04 — Theme-specific boss/employee workstations and character accessories

As the owner, I want boss and employee workstations and character accessories to adapt to the active theme while keeping agent status colors and species clear, so that characters feel native to the Western camp, Horror office, or Metal concert.

- `US-04 / AC-01`: Given `Desk` / `BossArea.tsx` receiving `theme: WorldThemeId`, each theme renders distinct procedural station geometry and quadrant floor/rug styling (`office` wood desks + monitors; `western` rustic timber tables/crates + status-lit lanterns/dispatch boards; `horror` weathered gothic desks + flickering candles + eerie monitors; `metal` amp stacks/instrument rigs + status-lit stage monitors) while preserving boss area click/status/usage HUD and break visuals.
- `US-04 / AC-02`: Given `Character.tsx` and `BossArea.tsx` receiving `theme: WorldThemeId`, each theme attaches distinct procedural character accessories (`office`: none beyond existing specialist headset; `western`: cowboy hat + bandana; `horror`: gothic/spooky headgear/accent; `metal`: studded/rock bandana + mini guitar/stage accent) without obscuring `SpeciesParts`, specialist headsets, or selection halos.
- `US-04 / AC-03`: Given all 7 `EmployeeStatus` states (`working`, `waiting_approval`, `idle`, `on_break`, `starting`, `stopped`, `failed`), every themed workstation displays the status color (`MONITOR_VISUALS[status]`) and every character preserves `CHARACTER_POSES[status]` and `STATUS_COLORS[status]` readability.

### Verification mapping (US-04)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-04 / AC-01`, `US-04 / AC-02`, `US-04 / AC-03` | `apps/web/src/scene/characterVisuals.test.ts` (expanded with pure theme station/accessory descriptor tests verifying all 4 themes define station & accessory configs and preserve all 7 `CHARACTER_POSES` and `MONITOR_VISUALS`) | Pending |
| Build & scene integration regression | `npm run typecheck`, `npm test`, `npm run build` + manual visual inspection of bosses and employees (active, idle, on break, waiting approval) across all 4 themes | Pending |

---

## US-05 — Theme-specific chatter quotes, full scene wiring, and end-to-end verification

As the owner, I want character speech bubbles to use quotes matching the active theme and the entire app wired end-to-end with passing tests and build checks, so that the whole experience feels cohesive and reliable.

- `US-05 / AC-01`: Given `pickOfficeQuote(status, lastQuote, rng, theme)` in `apps/web/src/scene/officeQuotes.ts`, calling it with `theme = "office"` (or omitted) returns quotes exclusively from the existing The Office pools; calling it with `"western"`, `"horror"`, or `"metal"` returns non-empty, status-aware quotes from that theme's curated pool and avoids repeating `lastQuote` back-to-back.
- `US-05 / AC-02`: Given `OfficeScene.tsx` wired with `theme: WorldThemeId`, changing the theme updates `Canvas` background/fog/lights, `OfficeRoom`, `OfficeMediaTv`, `BossArea`, `Character`, and speech bubble quote selection immediately without resetting camera position or dropping WebSocket state.
- `US-05 / AC-03`: Given the complete implementation, `npm run typecheck`, `npm test`, and `npm run build` all pass with zero errors, and a manual verification checklist across all 4 themes × 2 moods in `/office` and `/workspace` is recorded in this file.

### Verification mapping (US-05)

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-05 / AC-01` + quotes regression | `apps/web/src/scene/officeQuotes.test.ts` (expanded to verify all 4 themes have non-empty general & status pools, `theme` defaults to `"office"`, no back-to-back repeats for any theme) | Pending |
| `US-05 / AC-02`, `US-05 / AC-03` | Full `npm run typecheck && npm test && npm run build` + manual verification matrix (4 themes × Day/Evening in `/office` & `/workspace`) | Pending |

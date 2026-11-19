# 3D Office Visual Redesign — User Stories

Builds on: [Skills menu and specialist employees](../skills-and-specialists/README.md).
Branch: `feature/office-3d-redesign`, created from `feature/skills-and-specialists` after backlog approval.
Execution mode: all stories (approved by the owner on 2026-11-19).
Implementer route: no local model available (LM Studio unreachable, Ollama has no models); lightweight hosted subagent (`flash`) writes code and tests; planner reviews and verifies.

## Story status

| Story | Title | Depends on | Status |
| --- | --- | --- | --- |
| US-01 | Cozy architectural office environment and natural lighting | — | pending |
| US-02 | Detailed workstations, boss suites, and office props | US-01 | pending |
| US-03 | Expressive game-style characters and status animations | US-02 | pending |
| US-04 | Game-like camera controls, lighting mood toggle, and HUD polish | US-01, US-03 | pending |

Constraints (confirmed):
- 100% local / offline rendering: no external CDN textures, fonts, or HDRI downloads (all materials, floor grain, monitor screens, and signage use procedural Three.js geometry/materials or `CanvasTexture`, and text labels continue using `@react-three/drei` `Html`).
- Preserve existing `OfficeView` behaviors: clicking a character focuses it in `/workspace` via `BroadcastChannel` (or opens the fallback card), clicking the empty floor clears selection, pending-approvals badge focuses the oldest approval, and `SceneErrorBoundary` remains intact when WebGL is unavailable.

Verification levels: Vitest for pure scene helper modules (procedural layout bounds, camera clamp/presets, lighting mood state, screen/status visual mappings); `npm run build` and `npm run typecheck`; interactive WebGL browser verification with visual screenshot inspection, zero console/network errors, and regression checks on click/selection/labels.

---

## US-01 — Cozy architectural office environment and natural lighting

As the owner, I want the 3D office to look like a sunlit, enclosed game-style studio instead of a grey plane in a black void, so that watching my agents feels like a living video game.

- `US-01 / AC-01`: Given `/office` loads in a WebGL browser, then the scene replaces the `#1a1d24` void with a bright daylight sky backdrop and soft atmospheric depth fog, with real-time shadows enabled (`<Canvas shadows>`).
- `US-01 / AC-02`: Given the office room renders, then it includes a procedurally textured warm wood-plank floor (built locally via `CanvasTexture` with zero network requests), architectural cutaway back and left walls with baseboards, and sunlit glass windows framing a stylized exterior backdrop (sky/horizon silhouettes) without obstructing the default camera view.
- `US-01 / AC-03`: Given the four boss quadrants (`claude`, `codex`, `opencode`, `gemini`), then each zone is grounded with a distinct woven-style floor rug/accent trim and soft overhead lighting, with shadow-casting directional sunlight and warm hemisphere fill light.
- `US-01 / AC-04` (regression): Given WebGL is unavailable or throws, then `SceneErrorBoundary` still renders the fallback cleanly; and all assets load with zero external network requests.

## US-02 — Detailed workstations, boss suites, and office props

As the owner, I want rich desks, chairs, glowing monitors, boss offices, and cozy room props, so that the office feels furnished and believable rather than made of bare boxes.

- `US-02 / AC-01`: Given an employee desk renders, then it includes a wood-grain tabletop with legs, an ergonomic chair positioned behind it, a monitor on a stand with a status-lit screen surface, a keyboard/mouse pad, a desk lamp, and a small personal prop (such as a mug), all casting/receiving shadows.
- `US-02 / AC-02`: Given a boss area renders, then it features an executive desk, high-back chair, a stylized boss character (not a single bare capsule), and a readable department nameplate; unavailable (`Coming soon`) departments appear as reserved/glassed-off suites with muted lighting rather than flat grey blocks.
- `US-02 / AC-03`: Given the office room renders, then decorative props (potted plants, bookshelves, whiteboard on the back wall, coffee/break corner, framed art) are placed along walls and common walkways without colliding with any boss desk or the first 9 employee desk positions per quadrant.
- `US-02 / AC-04`: Given an employee's status changes (`working`, `waiting_approval`, `idle`, `stopped`, `failed`), then its monitor screen glow/color reflects that state (active code glow when working, amber alert when waiting for approval, red on failure, dim/off when stopped).

## US-03 — Expressive game-style characters and status animations

As the owner, I want my employees to look like charming, expressive game characters seated at their desks with clear animations for each state, so that I can tell who is doing what at a glance.

- `US-03 / AC-01`: Given an employee renders, then the character has distinct seated proportions (legs/torso/shirt, articulated arms reaching the desk, head with eyes and species-specific facial/ear/tail features for `wolf`, `dog`, `fox`, `cat`, `bear`, and `human`) and a subtle specialist accessory (such as a headset or badge) when `employee.role` is set.
- `US-03 / AC-02`: Given each `EmployeeStatus`, then the character displays a distinct animation/pose:
  - `working`: active typing motion with subtle head/body movement.
  - `waiting_approval`: raised/waving hand with pulsing amber attention indicator.
  - `idle`: calm breathing and gentle look-around/tail sway.
  - `starting`: gentle spawn/pulse feedback.
  - `stopped`: leaned-back resting pose with muted tones.
  - `failed`: slumped pose with red error marker.
- `US-03 / AC-03` (regression): Given an employee character in `/office`, then its label still displays `Name` (or `Name · role` for specialists), hovering shows the task/status tooltip, clicking selects and focuses the employee in `/workspace` (or opens the local card), and the selected employee displays a clear ground highlight ring.

## US-04 — Game-like camera controls, lighting mood toggle, and HUD polish

As the owner, I want smooth camera navigation, a quick day/cozy-evening lighting toggle, and HUD overlays that match the bright game aesthetic, so that exploring the office on a second monitor feels effortless and polished.

- `US-04 / AC-01`: Given `/office` is open, then `OrbitControls` uses smooth damping, allows panning clamped within the office floor bounds so the room cannot be lost off-screen, and supports zooming between close-up desk view and full-office overview.
- `US-04 / AC-02`: Given the office HUD toolbar, when the owner clicks **Reset view**, then the camera smoothly returns to the default overview framing; when the owner toggles **Day / Evening**, then the sky, directional sun/moon light, ambient fill, and interior desk/ceiling lamps switch between bright daylight and warm cozy evening lighting, and the choice persists in `localStorage`.
- `US-04 / AC-03`: Given the brighter 3D backdrop, then the floating HUD elements (connection indicator, pending-approvals badge, employee details card, department labels, and character nameplates) remain legible with clean contrast and game-like styling.
- `US-04 / AC-04` (regression): Given pending approvals exist or an employee is clicked without `/workspace` open, then the pending-approvals badge and fallback employee card still work exactly as before.

---

## Verification mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01`–`AC-04` | Pure tests for floor/room geometry bounds & mood palette; manual WebGL check of `/office` (screenshot + zero external network requests) | Pending |
| `US-02 / AC-01`–`AC-04` | Pure tests verifying prop placements do not overlap boss desks or employee desk grid (`0..8`); manual WebGL check of desks, boss suites, and monitor glow states | Pending |
| `US-03 / AC-01`–`AC-03` | Pure tests for character visual/pose state mapping and `employeeLabel`; manual WebGL check of species, specialist cue, animations, hover tooltip, and click-to-select | Pending |
| `US-04 / AC-01`–`AC-04` | Pure tests for camera target clamping and lighting mood persistence; manual WebGL check of pan/zoom/reset, Day/Evening toggle across reload, and HUD contrast | Pending |
| Risk: existing `/office` ↔ `/workspace` link and tests | Full `apps/server` and `apps/web` test suites + `npm run build` + `npm run typecheck` | Pending |

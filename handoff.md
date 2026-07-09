# Session Handoff Log

> **Protocol for Replit agents**: At the start of every session, read this file top-to-bottom before doing anything else. At the end of every session (or after any significant chunk of work), append a new dated entry under `## Sessions` following the exact format below. Commit the file with the rest of your changes.

---

## Format

```
### YYYY-MM-DD — <one-line summary of session goal>

**Done**
- Bullet list of completed work (be specific: file paths, decisions made, commands run)

**Decisions & gotchas**
- Non-obvious choices a future agent needs to know (why something was done a certain way)

**Left off / next steps**
- Where work stopped, what the user asked for but wasn't finished, or what the obvious next move is

**State to restore**
- Any temporary code changes that need reverting, flags to flip, env vars to set, etc.
```

---

## Sessions

### 2026-07-09 — Project import, environment setup, collision map rewrite

**Done**
- Ran `pnpm install` to install all dependencies (node_modules were missing on import)
- Configured and started three workflows:
  - `artifacts/telegram-game: web` → `pnpm --filter @workspace/telegram-game run dev`
  - `artifacts/api-server: API Server` → `pnpm --filter @workspace/api-server run dev`
  - `artifacts/mockup-sandbox: Component Preview Server` → `pnpm --filter @workspace/mockup-sandbox run dev`
- Completely rewrote `artifacts/telegram-game/src/game/collisionMap.ts` based on a reference image (`attached_assets/IMG_2907_1783590932507.jpeg`) showing the correct red-line collision boundaries
  - Old map had wrong zone boundaries and incorrect obstacle positions
  - New map: 16 walkable zones carved from a fully-blocked 52×29 grid, then obstacles re-blocked inside each zone
  - Key zones: NW Garage, Industrial/Boiler, Pipe Corridor, Main Lobby, NE Tech Room, NE Connector, Far-Right Strip, East Office, Gas Station, Outdoor Park, South Junction, SE Vehicle Garage, SE Corridor, Electrical Room, Far-SE Strip
- Placed the game map as a live iframe on the canvas with the collision overlay enabled for review

**Decisions & gotchas**
- The collision grid is 52 cols × 29 rows, CELL = 20px, map = 1040×580px — keep these constants in sync if the map image ever changes size
- `buildCollisionGrid()` caches its result in `_cached`; if you change the fill calls, set `_cached = null` or restart the dev server to see changes
- `DATABASE_URL` (Postgres) is **not configured** — the API server starts fine but any route that touches the DB will fail. A Replit PostgreSQL database needs to be provisioned
- CORS on the API server is wide open (`*`) — acceptable for dev, must be tightened before production

**Left off / next steps**
- Database is not connected — next logical step is provisioning a Replit PostgreSQL DB and setting `DATABASE_URL`
- Collision overlay was turned ON by default (`useState(true)`) for canvas review — see "State to restore" below
- No game logic / player movement has been built yet; the map + collision system is the foundation

**State to restore**
- `artifacts/telegram-game/src/pages/GameMap.tsx` line with `useState(true)` for `showCollision` should be reverted to `useState(false)` — it was set to `true` temporarily so the canvas iframe showed the overlay on load

### 2026-07-09 — Pixel-accurate collision map (supersedes previous session's hand-drawn version)

**Done**
- Replaced the hand-drawn rectangle collision map with one generated directly from the red-line reference image (`attached_assets/IMG_2907_1783593845208.jpeg`) via a new analysis script, `scripts/src/analyzeCollisionMap.ts` (run with `pnpm --filter @workspace/scripts exec tsx src/analyzeCollisionMap.ts` to regenerate if the reference image changes).
- Algorithm: detect red boundary pixels → dilate 2px → flood-fill "outside" from the image border → connected-component-label the remainder → components under a size threshold (~7000px) are classified as blocked obstacles, larger ones as walkable room floors → downsampled to a logical grid via majority vote (35% threshold biased toward blocked, so thin walls survive downsampling).
- Grid resolution changed from the old 52×29 (`CELL=20`) to 104×58 (`CELL=10`) so it divides evenly into `MAP_W=1040`/`MAP_H=580` with finer accuracy.
- Output is RLE-encoded into `artifacts/telegram-game/src/game/collisionData.ts` (generated file — regenerate via the script above, don't hand-edit).
- `artifacts/telegram-game/src/game/collisionMap.ts` now decodes `collisionData.ts` via `decodeRuns()` instead of hand-coded `fill()` rectangle calls; added a runtime assertion that decoded length matches `COLS*ROWS`, throwing a clear error pointing at the regen script if it's ever out of sync.
- Re-eyeballed and updated the coarse `ZONES` boxes (debug-overlay hover labels only, not used by collision logic) to roughly match the new finer grid — still approximate, see code comment.
- Verified visually: collision overlay aligns with the reference image's red lines; `tsc --noEmit` passes.
- Cleaned up: removed the throwaway `scripts/src/debugMask.ts` visualization script used only for iterating on the detection algorithm.

**Decisions & gotchas**
- `sharp` was added as a devDependency to `@workspace/scripts` — kept intentionally, it's needed to re-run the analysis script if the reference image ever changes.
- The old handoff entry's zone/grid description (52×29, hand-authored zones) is now obsolete — this entry supersedes it. `_cached` caching behavior in `buildCollisionGrid()` and the "must restart dev server after changing fill calls" note no longer apply since there are no more fill calls; the grid comes from the generated data file.
- ZONES are cosmetic only (debug overlay labels/outlines) and intentionally coarse — don't rely on them for gameplay logic; collision/movement always uses the pixel-derived grid.

**Left off / next steps**
- No player/movement system exists yet — the map + pixel-accurate collision grid is the foundation for that.
- Database still not connected (`DATABASE_URL` unset) — unchanged from previous session, still needs a Replit PostgreSQL DB provisioned if/when the API server needs persistence.
- `artifacts/mockup-sandbox: Component Preview Server` and `artifacts/api-server: API Server` workflows are running (auto-started with the environment); user asked to leave them as-is rather than actively use them this session.

**State to restore**
- None — `showCollision` in `GameMap.tsx` is confirmed `false` (default, non-overlay) after this session's edits.

### 2026-07-09 — Re-import setup: dependencies, DB, and artifact/workflow repair

**Done**
- Ran `pnpm install` (fresh node_modules on this import).
- Confirmed the Replit Postgres DB is provisioned and `DATABASE_URL` is set; no schema exists yet (`lib/db/src/schema/index.ts` is still the empty template), so nothing to push.
- Found `listArtifacts()` returned empty and no workflows were configured despite all three `artifacts/*/.replit-artifact/artifact.toml` files being present and valid — the import dropped artifact registration metadata (not the code).
- Fixed by copying each artifact's own `artifact.toml` to a sibling `artifact.edit.toml` and calling `verifyAndReplaceArtifactToml()` on it (no content changes) for `api-server`, `telegram-game`, and `mockup-sandbox`. This re-registered all three artifacts and recreated their managed workflows with no code changes.
- Started and verified all three workflows: `artifacts/api-server: API Server`, `artifacts/telegram-game: web`, `artifacts/mockup-sandbox: Component Preview Server`. Screenshotted the game map — renders correctly, matches the pixel-accurate collision map from the previous session.

**Decisions & gotchas**
- See the new "Gotchas" entry in `replit.md` — the `verifyAndReplaceArtifactToml` re-registration trick is the fix observed for this "artifact files exist but not registered" import failure mode.
- `.replit` picked up a `postgresql-16` nix module (and nix channel bump) automatically when the pre-provisioned DB was confirmed reachable this session — not a manual edit, just noting it for reproducibility.

**Left off / next steps**
- Still no player/movement system or DB schema — unchanged from previous session.
- User asked to provision the DB as part of this session; it was already provisioned by the environment, so no action was needed beyond confirming reachability.

**State to restore**
- None.

### 2026-07-09 — Upscaled map image + proportional collision/player scaling

**Done**
- Replaced map background from the blurry original JPEG (`IMG_2898_1783586696260.jpeg`, 1040×580 reference) with the user-supplied high-res PNG (`1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png`, 1652×952 native).
- Updated `MAP_W=1652, MAP_H=952` in `collisionMap.ts`; derived `CELL_X = MAP_W/COLS ≈ 15.885` and `CELL_Y = MAP_H/ROWS ≈ 16.414` since the new aspect ratio differs slightly from the old one (COLS×ROWS grid is unchanged).
- Updated `isBlocked()` to convert pixel coords using separate `CELL_X`/`CELL_Y`; updated `canMoveTo()` sample count to use `min(CELL_X, CELL_Y)` for conservative arc spacing.
- Scaled all ZONE pixel bounds from 1040×580 → 1652×952 via per-axis scale helpers in `collisionMap.ts`.
- Scaled player constants in `player.ts` by geometric mean scale factor (≈1.615×): `PLAYER_RADIUS 9→14`, `PLAYER_SPEED 130→210`, `PLAYER_SPAWN (350,150)→(556,246)`.
- Updated overlay drawing in `GameMap.tsx` to use `CELL_X`/`CELL_Y` for cell rect fills and grid lines.
- Verified in preview: map renders crisply at 1652×952, teal character spawns in lobby, WASD movement works.

**Decisions & gotchas**
- The new image has a different aspect ratio than the old one (1652/1040 ≠ 952/580), so cells are now slightly non-square — CELL_X and CELL_Y diverge by ~3%. Collision logic handles this cleanly; zone outlines are display-only and tolerate small inaccuracy.
- Collision grid data (RLE in `collisionData.ts`) was NOT regenerated — it was built from the separate red-line reference image (IMG_2907...) at 104×58 cells × 10px, which maps proportionally to the new canvas. If the map layout ever changes significantly, re-run `scripts/src/analyzeCollisionMap.ts` with an updated reference image.
- `@assets` alias in `vite.config.ts` points to `../../attached_assets` — drop new asset files there and reference by filename with the alias.

**Left off / next steps**
- The PLAYER_SPAWN point (556, 246) should be re-verified walkable on the new canvas via the collision overlay. Eyeball suggests it lands inside the lobby corridor, which looks correct.
- No camera-follow — the 1652×952 map overflows a typical 1280×720 viewport; panning/camera-follow will be needed for smaller screens.

**State to restore**
- None.

### 2026-07-09 — Project re-import: artifact re-registration and dependency install

**Done**
- Re-registered all three artifacts (api-server, telegram-game, mockup-sandbox) via `verifyAndReplaceArtifactToml` after import dropped registration metadata.
- Ran `pnpm install` (478 packages, lockfile up to date) — node_modules were absent after import.
- Restarted `artifacts/telegram-game: web` and `artifacts/api-server: API Server` workflows; both came up cleanly.
- Verified game renders correctly in preview (map visible, teal character in lobby, WASD controls functional).
- Code review passed: no severe issues; collision system, player movement, and GameMap wiring all intact.

**Decisions & gotchas**
- After a GitHub import, artifact registration is always dropped — always re-run `verifyAndReplaceArtifactToml` on each `artifact.toml` before starting workflows.
- `node_modules` are not committed, so `pnpm install` must be run after every fresh import before any workflow can start.
- `GameMap` lives at `src/pages/GameMap.tsx`, not `src/game/GameMap.tsx` — align docs/references accordingly.

**Left off / next steps**
- DB still not connected (schema is empty, no routes implemented).
- Only teal color + idle/walk poses wired; 6 other colors and remaining poses available for NPCs.

**State to restore**
- None.

### 2026-07-09 — Character sprite sheet + movable test player

**Done**
- Generated a pixel-art character sprite sheet (`generateImage`, transparent PNG) matching a user-provided reference: 7 columns (colors: teal, maroon, navy, purple, brown, dark-gray, magenta) × 8 rows (poses: idle, walk-1, walk-2, run-lean, ghost, mask, hold-item, sit-hug-knees). Saved at `artifacts/telegram-game/public/sprites/characters.png` (1024×1024).
- Added `artifacts/telegram-game/src/game/characterSprites.ts` — sheet layout constants + `getCharacterFrameRect(color, pose)` helper for slicing frames.
- Added `artifacts/telegram-game/src/game/player.ts` — pure movement/animation logic (`stepPlayer`, `createInitialPlayerState`, `isSpawnWalkable`), kept separate from rendering to mirror the `collisionMap.ts` pattern. Spawn point `(350, 150)` verified walkable inside the main lobby.
- Wired a movable teal test character into `GameMap.tsx`: WASD/arrow-key input (tracked in a ref, cleared on `blur`/`visibilitychange` to avoid stuck movement if keyup is missed), a `requestAnimationFrame` loop that steps the player against the real collision grid and draws the correct sprite frame (flipped via `ctx.scale(-1,1)` when facing left) onto a dedicated player canvas layer above the map/overlay.
- Fixed a real collision gap found via code review: `canMoveTo` in `collisionMap.ts` previously only sampled 4 cardinal edge points, which could let a circular entity clip through cell corners on diagonal movement. Replaced with center + circumference sampling (sample count scales with radius so arc spacing stays under half a cell).
- Verified via a standalone `tsc`-compiled simulation (no browser automation available in this sandbox) that movement stays finite, respects walls, and normalizes diagonal speed; visually confirmed in the preview.

**Decisions & gotchas**
- The sprite sheet's cell size is not integer (1024/7 ≈ 146.29px, 1024/8 = 128px) — `characterSprites.ts` documents this; slicing uses fractional source rects rather than assuming a clean pixel grid.
- Static assets in `public/` must be referenced via `${import.meta.env.BASE_URL}...` (not a hardcoded `/...` path) so they resolve correctly under the artifact's routed base path.
- Browser automation (Playwright/Puppeteer) is not available in this environment's CodeExecution sandbox — validate movement/collision logic by compiling the relevant `.ts` files with `tsc` to a temp dir and running a Node simulation instead.

**Left off / next steps**
- Only one color (teal) and 3 poses (idle/walk-1/walk-2) are wired into gameplay; the other 6 colors and remaining poses (ghost, mask, hold-item, sit-hug-knees) exist in the sheet but aren't used yet — available for NPCs/other players/animations later.
- No camera-follow — the whole 1040×580 map fits on screen, so panning hasn't been needed yet. Revisit if the map grows.
- Database still not connected — unchanged from previous sessions.

**State to restore**
- None.

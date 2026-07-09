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

### 2026-07-09 — Attempted AI-detail map regen (chunked, image-edit): blocked on billing, reverted

**Context:** after the DPR-cap fix (below), user wanted the map's actual detail ceiling raised, not just the upsampling blur removed. Discussed and rejected plain tiling/viewport-culling (solves a perf problem, not a detail problem) and settled on: split the map into overlapping tiles, regenerate each via an image-to-image *edit* call (not blind text-to-image) with a "preserve exact layout, only add detail" prompt, re-theme to a modern-Russia setting (Bukhanka van, Lenin bust, Cyrillic-only/no text), stitch back into the same 6608×3808 canvas so collision-map coordinates stay valid.

**What was built (then removed — see Outcome):** `scripts/src/mapRegen/config.ts` (5×3 tile grid over the existing `map-hires.webp`, 100px overlap per tile for cross-tile context, zone-aware prompt builder reusing `collisionMap.ts`'s `ZONES` table) and `scripts/src/mapRegen/generateTile.ts` (crops a tile with sharp, calls OpenAI `images.edit` with `gpt-image-1`, force-resizes the result back to the exact crop dimensions so the stitch math holds). Typechecked clean; never got to the stitch/QA-overlay step.

**Outcome:** Replit's own OpenAI AI Integration required an account upgrade the user declined, so this fell back to a user-supplied `OPENAI_API_KEY` secret. Four different keys (four different OpenAI org IDs, confirmed via response headers) all failed identically and immediately with `billing_hard_limit_reached` on `images.edit` — no image ever generated, no charge incurred. This is an OpenAI-account-side block (org has no payment method / a $0 usage limit under platform.openai.com → Settings → Billing → Limits), not something fixable from this environment. User chose to drop the plan rather than keep supplying keys blind. **Reverted**: `scripts/src/mapRegen/` deleted, `openai` dependency removed from `scripts/package.json`, `pnpm remove` run, typecheck reconfirmed clean. `map-hires.webp` was never touched.

**Loose end:** an `OPENAI_API_KEY` Replit Secret still exists in this repl from the 4 attempts — orphaned/unused now that the plan was dropped. Not deleted (no secret-delete callback available from this session); harmless to leave, but worth knowing it's there if it resurfaces in an env-var audit.

**If revisited:** don't reattempt with a blind new key — first have the user confirm in the OpenAI dashboard that the org's hard spending limit is raised above $0 (that specific error code means the request never even ran against actual usage). The tile-grid/prompt design above is otherwise ready to reuse as-is once a working key exists.

### 2026-07-09 — Map crispness fix: cap DPR to stop upsampling blur

**Done**
- Root-caused why the user (viewing via the iOS Replit app, likely dpr≈3) saw the map as blurry even though it looked crisp on desktop screenshots: `GameMap.tsx`'s per-frame draw stretches the native `map-hires.webp` asset by `scale = ZOOM * dpr` (ZOOM=0.6 fixed camera calibration). At dpr=3 that's `scale=1.8` — upsampling native image pixels by 80%, which reads as visible blur; at dpr=1 (desktop) `scale=0.6` (downsample, looks fine) — explaining why prior desktop screenshots never caught this.
- Fix (`artifacts/telegram-game/src/pages/GameMap.tsx`): added `MAX_RENDER_DPR = 1 / ZOOM` and a shared `getRenderDpr()` helper that clamps `window.devicePixelRatio` to that cap; replaced both raw `window.devicePixelRatio` reads (canvas buffer sizing in `sizeCanvas`, and the per-frame `scale`/font-size calc) with it. Guarantees the map draw never exceeds a 1:1 stretch (no upsampling) on any device, while still using a denser-than-1x buffer on retina screens for UI/text.
- Chose this over regenerating the map at a higher resolution: the source art's native detail (1652×952) is a separate, harder ceiling; a further resolution bump would need ~2x more pixels (13,216×7,616 ≈ 100 MP, ~400 MB decoded RGBA) which risks crashing mobile/Telegram in-app WebViews — the DPR cap fixes the actual reported blur mechanism with zero asset changes and zero added memory risk.
- Verified: typecheck passes, workflow restarted cleanly, screenshot at a 402×874 mobile viewport confirms map/character/HUD render correctly. Code review (architect subagent) passed — DPR usage consistent across buffer sizing, frame scale, and font size; no regression to collision overlay, sprite alignment, or joystick/HUD (those are CSS-pixel DOM elements, unaffected by canvas DPR).
- Logged the general technique in `.agents/memory/image-upscaling.md` (cap DPR via a zoom-derived constant, rather than chasing more source pixels, whenever a fixed camera-zoom constant multiplies dpr into a canvas draw scale).

**Decisions & gotchas**
- `MAX_RENDER_DPR` is derived from `ZOOM` (`1 / ZOOM`), not a magic number — if `ZOOM` is ever recalibrated, the cap tracks it automatically.
- This screenshot tool renders at dpr=1 by default, so it cannot visually reproduce the retina blur being fixed here — the fix was verified by math/code review, not a before/after screenshot diff.

**Left off / next steps**
- If the user still wants MORE real detail (not just removing upsampling blur), the actual next step is regenerating the source map art at higher genuine resolution or with an AI super-resolution pass (not available in this environment currently) — flag this tradeoff if they ask for further crispness.
- DB still not connected, no Telegram WebApp SDK integration, no multiplayer — unchanged.

**State to restore**
- None.

### 2026-07-09 — Post-import setup (artifact re-registration, again)

**Done**
- Same recurring gotcha: fresh import dropped all three artifact registrations (`listArtifacts()` returned empty, no workflows configured).
- Repaired via standard sequence: copied each `artifact.toml` → `artifact.edit.toml`, called `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` (absolute paths) for `api-server`, `mockup-sandbox`, `telegram-game` — all succeeded.
- Ran `pnpm install` (lockfile already up to date).
- Restarted `artifacts/telegram-game: web` and `artifacts/api-server: API Server`; both running cleanly. Left `mockup-sandbox` workflow stopped (not needed unless doing design work).
- Verified via screenshot: map and teal character render correctly, matches expected state from prior sessions.

**Decisions & gotchas**
- No code changes needed — this was pure re-registration, consistent with the documented import gotcha in replit.md.

**Left off / next steps**
- Unchanged from prior session: DB not connected, no Telegram WebApp SDK integration, no multiplayer/networking.

**State to restore**
- None.

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

### 2026-07-09 — Camera-follow with Among Us-style zoom

**Done**
- Added camera-follow to `GameMap.tsx`: a `cameraRef` div wraps all three canvas layers with `transformOrigin: '0 0'` and `willChange: 'transform'`.
- Camera transform (`translate(vw/2 - x·ZOOM, vh/2 - y·ZOOM) scale(ZOOM)`) is applied directly to the div's style each rAF frame — no React state update, no re-renders.
- `ZOOM = 2.5` chosen to match Among Us-style close zoom (shows ~512px of the 1652px map width at a 1280px viewport).
- Outer wrapper changed to `position: fixed; inset: 0; overflow: hidden` to clip the transformed canvas.
- `handleMouseMove` updated to invert the camera transform (screen → map coords) so collision zone hover still works.
- Increased `PLAYER_DISPLAY_HEIGHT` from 30 → 36 px for better visibility at zoom.
- HUD elements (WASD hint, collision toggle) kept `position: fixed; zIndex: 20` so they stay anchored to the viewport regardless of camera.

**Decisions & gotchas**
- Camera transform uses `transform-origin: 0 0` so the math is: `tx = vw/2 - x·ZOOM`, `ty = vh/2 - y·ZOOM`. Using `50% 50%` origin would complicate the formula.
- Direct style mutation (not React state) is intentional — avoids a React re-render every rAF tick, which would be catastrophic for performance.
- Initial camera position is set synchronously before the first rAF tick to prevent a one-frame flash at position 0,0.
- `willChange: transform` on the camera div hints to the browser to promote it to a compositor layer for smooth panning.

**Left off / next steps**
- No camera smoothing / lerp — camera snaps instantly. Could add exponential decay for polish.
- Map edges are now reachable (player can walk off-screen to the far edges of the 1652×952 map). Edge clamping may be desirable.

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

### 2026-07-09 — Re-import repair (again) + 1.5x map canvas upscale

**Done**
- Re-import once more dropped artifact registration and `node_modules`; repaired via `verifyAndReplaceArtifactToml` on all three `artifact.toml` files (same fix as prior sessions) and re-ran `pnpm install`. All three workflows (api-server, telegram-game, mockup-sandbox) restarted cleanly.
- Upscaled the game map canvas 1.5x further: added `_UPSCALE = 1.5` in `collisionMap.ts` so `MAP_W`/`MAP_H` are now derived as `Math.round(1652 * 1.5)` / `Math.round(952 * 1.5)` = 2478×1428 (same source image, just drawn larger).
- Because `ZONES`, player constants (`PLAYER_RADIUS`, `PLAYER_SPEED_PX_PER_SEC`, `PLAYER_SPAWN`), and the on-map sprite display size were already expressed as ratios against the base 1040×580 (or `MAP_W`/`MAP_H`), only `player.ts` needed a code change: switched its `_SCALE`/`PLAYER_SPAWN` formulas from hardcoded `1652/952` literals to `MAP_W`/`MAP_H` imports so they track any future `_UPSCALE` change automatically.
- Also scaled `PLAYER_DISPLAY_HEIGHT` in `GameMap.tsx` by `MAP_W / 1652` so the sprite stays visually proportional to the map at the new size.
- Verified `tsc --noEmit` passes and the workflow serves correctly.

**Decisions & gotchas**
- To upscale the map further in the future, just change the single `_UPSCALE` constant in `collisionMap.ts` — everything else (zones, player scale, spawn, sprite size) derives from `MAP_W`/`MAP_H` and will follow automatically. Do not hardcode `1652`/`952` literals in new code; import `MAP_W`/`MAP_H` instead.
- `ZOOM = 2.5` (camera zoom level) in `GameMap.tsx` was left unchanged — it's a screen-pixels-per-map-pixel ratio, not tied to map resolution, so it doesn't need to scale with the canvas.
- Reconfirmed the "import drops artifact registration + node_modules" failure mode is now recurring across sessions — always check `listArtifacts()` / try a workflow restart first thing each session and re-run the `verifyAndReplaceArtifactToml` + `pnpm install` fix proactively if it's empty.

**Left off / next steps**
- Collision grid (`collisionData.ts`) is still resolution-independent (fractional CELL_X/CELL_Y), so no regeneration was needed for this upscale — confirmed working.
- No player/movement or DB schema changes this session — unchanged from previous sessions.

**State to restore**
- None.

### 2026-07-09 — Real image upscale (sharp lanczos3) + camera zoom-out 30%

**Done**
- User reported the previous session's 1.5x canvas upscale was still blurry — correctly diagnosed: stretching a 1652×952 source at runtime via `ctx.drawImage(img, 0, 0, MAP_W, MAP_H)` can't add real detail, it's just bilinear/bicubic interpolation of the same pixels.
- Real fix: pre-generated a genuinely higher-resolution static asset using `sharp` (`kernel: lanczos3` + a light `sharpen`) at 3x the original size (4956×2856), saved to `artifacts/telegram-game/public/map-hires.png`. The one-off script lived at `/tmp/upscale_script/upscale.cjs` (not committed — rerun a similar script from `artifacts/telegram-game/public/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png`-equivalent source if you need to regenerate at a different resolution).
- `collisionMap.ts`: `MAP_W`/`MAP_H` are now hardcoded to `4956`/`2856` (matching the static asset's native size exactly) instead of derived from an `_UPSCALE` multiplier — comment explains they must stay in sync with `map-hires.png`.
- `GameMap.tsx`: image `src` changed from the small `@assets/...` original (via `new URL(...)`) to the pre-upscaled static asset served from `public/`: `` `${import.meta.env.BASE_URL}map-hires.png` ``.
- `GameMap.tsx`: `ZOOM` reduced 30% per user request, from `2.5` to `2.5 * 0.7` (=1.75) — shows more of the map around the player.
- `player.ts` and `PLAYER_DISPLAY_HEIGHT` needed no changes — both already derive from `MAP_W`/`MAP_H` ratios, so they scaled automatically to the new resolution.
- Verified visually via screenshot: map is now crisp/sharp at the new resolution, character renders proportionally, more map is visible around the player after the zoom-out.

**Decisions & gotchas**
- **Key lesson: canvas-time upscaling (`drawImage` with a larger destination rect) never increases real detail — it just interpolates existing pixels and looks blurry past ~1.2-1.5x.** To make a low-res source image look crisper, you must pre-process it (e.g. `sharp` with `lanczos3` kernel + sharpen) into a genuinely higher-pixel-count static file, then keep `MAP_W`/`MAP_H` in exact sync with that file's native dimensions so the canvas draws ~1:1 with no further stretching.
- If the map needs to go even higher-res later, regenerate `public/map-hires.png` at the new target resolution with the same sharp recipe, then update the hardcoded `MAP_W`/`MAP_H` in `collisionMap.ts` to match exactly.
- The original small map source is still referenced in `collisionMap.ts` comments and `player.ts`'s scale-ratio math (`MAP_W / 1040`, etc.) — those ratios are still correct since they're relative, just note the "1040×580 base" is now two generations removed from the live asset.

**Left off / next steps**
- The one-off upscale script isn't committed anywhere reusable — if the map artwork changes again, a fresh sharp upscale script will need to be written (quick, ~10 lines, pattern is in this entry).
- No further map/character work requested this session beyond the crispness fix and zoom-out.

**State to restore**
- None.

### 2026-07-09 — Swapped in user-supplied higher-res character sprite sheet

**Done**
- User provided a new, higher-resolution 7-color × 8-pose character sprite sheet (`attached_assets/BAF1186A-CC7C-4076-B23F-03C55C906007_1783604564967.png`, 1123×1401, opaque tan background) with the same grid layout/order as the original.
- Removed the tan background via the background-removal tool, saved directly over `artifacts/telegram-game/public/sprites/characters.png` (transparent PNG, same filename/path so no other code needed to change).
- Updated `characterSprites.ts` sheet-size constants (`CHARACTER_SHEET_WIDTH/HEIGHT`) from `1024×1024` to the new sheet's native `1123×1401` — grid is still 7 cols × 8 rows, cell slicing stays fractional (same pattern as before, no resizing/distortion applied to keep it pixel-perfect to the source art).
- Verified visually via screenshot: teal idle pose renders correctly, matches the new sheet's art style, no bleed from adjacent cells.

**Decisions & gotchas**
- Only `CHARACTER_SHEET_WIDTH`/`CHARACTER_SHEET_HEIGHT` needed to change — `CHARACTER_CELL_WIDTH/HEIGHT` and `getCharacterFrameRect()` are already derived from those constants, so no other code touched.
- Kept the sheet at its native resolution (no upscale/downscale) to stay pixel-perfect to the user-supplied art, per the `recreate-screenshot` skill's pixel-perfect-accuracy principle.
- Only teal (idle/walk-1/walk-2) is wired into gameplay; the other 6 colors and remaining poses (run-lean, ghost, mask, hold-item, sit-hug-knees) are available in the new sheet at the same grid coordinates as before — unaffected by this swap.

**Left off / next steps**
- No further sprite work requested this session.

**State to restore**
- None.

### 2026-07-09 — Corrected camera zoom to match real Among Us framing

**Done**
- User flagged the previous zoom-out (30% off `2.5`, i.e. `1.75`) as still far too close compared to reference Among Us screenshots — character should be a small figure with most of the screen showing surrounding map, not filling a large portion of the viewport.
- Set `ZOOM` in `GameMap.tsx` to a hardcoded `0.6` (was `2.5 * 0.7`), calibrated against the reference screenshots and the current `PLAYER_DISPLAY_HEIGHT` (~108px in map-space after the earlier 3x map upscale) so the on-screen character height lands in the same small proportion of viewport height seen in the references.
- Fixed a stale-process port conflict that had left `api-server` (8080) and `telegram-game` (18297) workflows failing with `EADDRINUSE`/`port already in use` — killed the orphaned `vite`/`node dist/index.mjs` processes and restarted both workflows cleanly.
- Verified visually via screenshot: framing now matches the reference images closely — small character, wide view of rooms/corridors around it.

**Decisions & gotchas**
- `ZOOM` is not derived from `MAP_W`/`PLAYER_DISPLAY_HEIGHT` by formula — it's a hand-tuned constant recalibrated by eye against reference screenshots. If `PLAYER_DISPLAY_HEIGHT` or `MAP_W`/`MAP_H` change again (e.g. another map resolution bump), re-check `ZOOM` visually rather than assuming it'll auto-scale correctly.
- If workflows ever fail with `EADDRINUSE`/`port already in use` after a restart, check for orphaned processes from a previous session (`pkill -f "vite --config vite.config.ts"`, `pkill -f "node ./dist/index.mjs"`) before troubleshooting further — the workflow config itself was fine.

**Left off / next steps**
- Camera zoom is now a fixed constant; no smoothing/lerp on camera movement (noted in an earlier session, still unaddressed).

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

### 2026-07-09 — Map crispness: 4× image upscale to WebP

**Done**
- Upscaled map from 4956×2856 PNG (3× original) → 6608×3808 WebP using sharp lanczos3 + light sharpen (sigma=0.6). File: `artifacts/telegram-game/public/map-hires.webp` (1.1 MB vs 17 MB PNG — 94% smaller).
- Updated `MAP_W=6608, MAP_H=3808` in `artifacts/telegram-game/src/game/collisionMap.ts`. All derived constants (CELL_X, CELL_Y, zone scale, player spawn) auto-adapt via ratios.
- Updated `GameMap.tsx` img.src to use `.webp`; added `imageSmoothingEnabled = true, imageSmoothingQuality = 'high'` on the map canvas context.

**Decisions & gotchas**
- DPR canvas buffer scaling was attempted but reverted: at 6608×3808 even DPR=2 gives a ~400 MB RGBA buffer per canvas layer. With 3 layers this crashes mobile browsers. Effective safe DPR for this map is 1 — do not attempt buffer×DPR here. See memory `image-upscaling.md`.
- WebP at quality=90 gives no perceptible quality loss for this illustrated map vs lossless PNG.

**Left off / next steps**
- DB still not connected.
- No Telegram WebApp SDK integration.

**State to restore**
- None.

### 2026-07-09 — Fixed animation ghost / double-character bug

**Done**
- Added `ctx.clearRect(0, 0, cw, ch)` at the start of the rAF frame in `GameMap.tsx`. Root cause: the single merged canvas was not being explicitly cleared each frame; transparent sprite pixels let the previous frame show through even though the opaque map drawImage covered the background.
- Floored sprite source rect coordinates: `sx = floor(rect.x)`, `sy = floor(rect.y)`, `sw = floor(rect.x + rect.width) - sx`, `sh = floor(rect.y + rect.height) - sy`. Prevents 1px sub-pixel bleed from adjacent animation rows when `imageSmoothingEnabled=false` is active (fractional cell dimensions 160.43×175.125 on the sprite sheet).

**Decisions & gotchas**
- In the old three-canvas layout the player canvas called `clearRect` explicitly each frame; the merged-canvas refactor dropped it. Always `clearRect` a merged canvas at frame start — never rely on an opaque drawImage to serve as the clear.
- Sprite sheet cells are NOT integer-sized (1123/7 × 1401/8). Always floor the source origin and derive end from `floor(start + size)` to get integer rects; never round the dimensions directly.

**State to restore**
- None.

### 2026-07-09 — Viewport-clipped rendering (crisp map on mobile)

**Done**
- Rewrote `artifacts/telegram-game/src/pages/GameMap.tsx` to use viewport-clipped rendering: instead of three full-map canvases (6608×3808) scaled down via CSS `transform: scale(ZOOM)`, there is now a single screen-sized canvas sized to `window.innerWidth × DPR` by `window.innerHeight × DPR`.
- Each rAF, the visible slice of the map is drawn using `ctx.drawImage(mapImg, srcX, srcY, srcW, srcH, 0, 0, cw, ch)` — canvas buffer pixels map 1:1 to physical screen pixels, so no CSS-transform downscaling blur.
- Camera math: `srcW = vw / ZOOM`, `srcH = vh / ZOOM`; `srcX/srcY` clamped to map bounds. Player always appears near screen center; player canvas coords = `(px - srcX) * ZOOM * DPR`.
- Collision overlay moved from a separate once-per-toggle `useEffect` into the rAF loop, drawing only visible cells (O(viewport) not O(MAP_W×MAP_H)).
- `showCollisionRef` mirrors React state into a ref so the rAF closure reads it without stale values.
- `sizeCanvas` callback resizes buffer on window resize.
- Removed the old `cameraRef` div and all CSS transform logic.
- `tsc --noEmit` passes clean.

**Decisions & gotchas**
- DPR buffer scaling is now safe because the canvas is viewport-sized, not map-sized. At DPR=3 (iPhone), buffer is ~1242×2688 — ~13 MB RGBA, perfectly fine vs the old approach which would need 400 MB at map scale.
- `imageSmoothingEnabled = true, quality = 'high'` on the map draw; `false` on the sprite draw (pixel art should stay crisp).
- The three-canvas → one-canvas consolidation was done because all layers must now redraw every frame (viewport shifts every frame), so the old "draw map once, overlay on toggle" optimization no longer applies.

**Left off / next steps**
- DB, multiplayer, Telegram SDK still pending.

**State to restore**
- None.

### 2026-07-09 — Added virtual joystick for mobile testing

**Done**
- Created `artifacts/telegram-game/src/components/Joystick.tsx` — fixed bottom-left joystick (52px base, 22px knob) that writes 'w'/'a'/'s'/'d' into `keysRef` on touch drag, so no changes to `player.ts` or collision logic were needed.
- Joystick uses `touchstart`/`touchmove`/`touchend` on `window` (passive: false) to track the active touch identifier; clamps knob to base radius; 18% dead zone; diagonal threshold 0.4.
- Imported and rendered `<Joystick keysRef={keysRef} />` in `GameMap.tsx` after the canvas layers.
- WASD hint auto-hides on touch-primary devices via `window.matchMedia('(pointer: coarse)')`.

**Decisions & gotchas**
- Joystick injects directly into `keysRef` (the same Set that keyboard events use) — no new movement path, collision and player logic unchanged.
- `transition: transform 0.04s ease-out` on the knob gives a tiny snap-back feel on release without adding latency during drag.
- The `touchmove`/`touchend` listeners are on `window` (not the base div) so dragging outside the joystick ring doesn't break tracking.

**Left off / next steps**
- Joystick is fixed-position (bottom-left). A floating/dynamic joystick that spawns where the user first taps is a common mobile game UX improvement if desired.
- DB, multiplayer, and Telegram SDK still pending.

**State to restore**
- None.

### 2026-07-09 — Post-import setup (artifact re-registration, dependency install, workflow start)

**Done**
- Ran `pnpm install` (node_modules absent after import; completed in ~14s, lockfile up to date).
- Re-registered all three artifacts after import dropped Replit metadata — `verifyAndReplaceArtifactToml` API signature has changed to `{ tempFilePath, artifactTomlPath }` (both absolute paths required); updated call pattern accordingly.
- Started `artifacts/telegram-game: web` and `artifacts/api-server: API Server` workflows; both running cleanly.
- Verified via screenshot: map crisp, teal character in lobby corridor, WASD hint and collision toggle visible — matches expected state from prior sessions.
- Code review passed: no severe issues.

**Decisions & gotchas**
- `verifyAndReplaceArtifactToml` now requires `{ tempFilePath: string (absolute), artifactTomlPath: string (absolute) }` — the old `{ filePath }` single-arg form throws a validation error. Always use absolute paths (`/home/runner/workspace/...`).
- Standard import repair sequence: (1) copy each `artifact.toml` → `artifact.edit.toml`, (2) call `verifyAndReplaceArtifactToml` with absolute paths for all three artifacts, (3) `pnpm install`, (4) restart workflows.

**Left off / next steps**
- DB still not connected (schema empty, no routes implemented).
- No Telegram WebApp SDK integration.
- No multiplayer/networking.
- Proposed follow-up tasks: DB connection, multiplayer movement, Telegram SDK integration.

**State to restore**
- None.

### 2026-07-09 — Sprite outline removal + drop shadow

**Done**
- Removed the thin tan/gold outline halo around every character sprite (all 63 color×pose cells) in `artifacts/telegram-game/public/sprites/characters.png` via a scripted sharp pipeline: color-threshold pass to zero fully-opaque halo pixels, then a 1px alpha erosion to clean up the remaining anti-aliased fringe without eating into the intended black outline.
- Added a soft drop shadow under each character's feet, matching the style the user referenced. Shadow placement uses largest-connected-component bounding box per cell (not the naive full-cell bbox) so a pre-existing disconnected art artifact in the "hold-item" pose (a stray floating eye pair, unrelated to this task) doesn't skew shadow position.
- Verified visually in-game via screenshot at multiple zoom levels.

**Decisions & gotchas**
- The in-game sprite is rendered very small (~50-90px tall after camera zoom + nearest-neighbor downscale from a ~156px source cell), so a shadow with realistic soft/low-opacity falloff (like a typical drop shadow) becomes nearly invisible after downscaling. Had to use a much higher-contrast, higher-opacity, larger-radius ellipse than would look "correct" at full source resolution — always test additions to this sprite sheet at actual in-game render size (via screenshot), not just at full-res crops, or subtle effects will silently disappear.
- The maroon "hold-item" pose cell has a pre-existing disconnected floating-eyes artifact separate from the main body — a latent art defect, not something introduced by this change. Left as-is since it wasn't in scope.

**Left off / next steps**
- Same open items as before: DB not connected, no Telegram SDK integration, no multiplayer.

**State to restore**
- None.

### 2026-07-09 — Shadow crop + uniform-color follow-up fix

**Done**
- Fixed two bugs in the drop shadow added earlier this session: (1) shadow got cropped when the character moved/changed pose, (2) shadow needed to be one uniform grey shade instead of a radial gradient.
- Root cause of the crop: the shadow's vertical position/radius was derived only from the body's bounding box, and for most standing/walking poses the character's feet sit right at (or 1-2px from) the bottom edge of the sprite cell — leaving no room for a shadow below. The old shadow position spilled past the cell height, and the game's per-frame source-rect crop (`getCharacterFrameRect` + `Math.floor` sizing in `GameMap.tsx`) silently sliced it off.
- Fix: replaced the shadow entirely — stripped the old gradient shadow pixels (dilation-mask approach: any translucent pixel more than ~2px from an opaque body pixel is shadow, not legit AA fringe, so zero it), then redrew a flat solid ellipse (`fill rgb(60,60,60)`, constant `fill-opacity 0.55`, no gradient stops) per cell, with `shadowY + shadowRY` clamped to never exceed the cell height.
- Verified via pixel math across all 9 poses that the new shadow fits fully inside its cell, and visually across the full 7×9 sheet.

**Gotcha for next time**
- When placing anything near a sprite's feet, remember the character's feet are often flush with the bottom pixel row of its cell — there is very little/no margin below. Any addition anchored below the feet must be clamped to the cell bounds, not just derived from the body bbox, or it will get cropped by the fixed source-rect draw.

**Left off / next steps**
- Same open items as before: DB not connected, no Telegram SDK integration, no multiplayer.

**State to restore**
- None.

### 2026-07-09 — Shadow moved from sprite sheet to procedural canvas draw (final fix)

**Done**
- The baked-in sprite-sheet shadow (from the two prior entries above) turned out to be fundamentally unfixable in the atlas: most character poses have their feet flush with the very last pixel row of their sprite cell, so there is no free space in the atlas below the feet at all. Any shadow drawn there was almost entirely hidden behind the opaque body, and the sliver that peeked out (mostly through the leg-gap notch) read as broken/speckled stripes once scaled to gameplay size — not a rendering bug, just no room to draw it.
- Final fix: removed the shadow from `characters.png` entirely (reverted to a clean, shadow-free sprite) and instead draw the shadow procedurally in `GameMap.tsx`'s render loop — a flat single-color ellipse (`rgba(40,40,40,0.4)`) positioned relative to the player's screen coordinates and sized proportional to `spriteW/spriteH`, drawn immediately before the sprite each frame (so it's always underneath, always uncropped, and pose-independent).

**Why this approach**
- Baking effects into a tightly-packed sprite atlas only works if there's literal pixel space in the cell for them. When there isn't (as here), draw the effect in world/screen space in the render loop instead of fighting the atlas layout.

**Left off / next steps**
- Same open items as before: DB not connected, no Telegram SDK integration, no multiplayer.

**State to restore**
- None.

### 2026-07-09 — Post-import setup (repeat repair, evening session)

**Done**
- Fresh re-import again dropped artifact registration metadata (same recurring gotcha). Repaired via the documented sequence: copied each `artifact.toml` → `artifact.edit.toml`, called `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` (absolute paths) for all three artifacts — all succeeded.
- `pnpm install` (lockfile already up to date).
- Restarted `artifacts/api-server: API Server` and `artifacts/telegram-game: web` workflows; both running cleanly. Left `mockup-sandbox` stopped (not needed unless doing UI prototyping).
- Verified via screenshot: map renders crisply, teal character visible, WASD hint shown — matches expected state.

**Decisions & gotchas**
- No new gotchas; this confirms the standard repair sequence in `handoff-protocol`/memory is reliable across repeated imports.

**Left off / next steps**
- Same as before: DB not connected, no Telegram SDK integration, no multiplayer. These remain open follow-ups.

**State to restore**
- None.

### 2026-07-09 — Post-import setup (artifact re-registration) [SUPERSEDED by entry above]

**Done**
- Re-registered all three artifacts after GitHub import dropped their Replit metadata: `telegram-game` (web, `/`), `api-server` (api, `/api`), `mockup-sandbox` (design, `/__mockup`) — used `verifyAndReplaceArtifactToml` on each existing `artifact.toml` without touching source code.
- Ran `pnpm install` (was already up to date, lockfile committed).
- Started `artifacts/telegram-game: web` and `artifacts/api-server: API Server` workflows; both running cleanly.
- Game client visible in preview with teal character on map and WASD controls working.

**Decisions & gotchas**
- Same import gotcha as before: artifact registrations always drop on GitHub import; always re-run `verifyAndReplaceArtifactToml` per artifact before starting workflows.
- `verifyAndReplaceArtifactToml` requires a pre-written sibling temp file (e.g. `artifact.edit.toml`) — it does not accept an in-memory TOML string.

**Left off / next steps**
- DB still not connected (`DATABASE_URL` not set, schema not pushed).
- Mockup sandbox workflow not started (not needed for game preview).
- No Telegram WebApp SDK integration yet.

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

### 2026-07-09 — Post-import setup (artifact re-registration, again)

**Done**
- Same recurring import gotcha: fresh import dropped all three artifact registrations (`listArtifacts()` returned empty, no workflows configured).
- Repaired via standard sequence: copied each `artifact.toml` → `artifact.edit.toml`, called `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` (absolute paths) for `api-server`, `mockup-sandbox`, `telegram-game` — all succeeded.
- Ran `pnpm install` (lockfile already up to date, completed in ~14s).
- Restarted `artifacts/telegram-game: web` and `artifacts/api-server: API Server`; both running cleanly. Left `mockup-sandbox` workflow stopped (not needed unless doing design work).
- Verified via screenshot at 402×874 mobile viewport: map and teal character render correctly, joystick HUD visible — matches expected state from prior sessions.

**Decisions & gotchas**
- No code changes needed — pure re-registration, consistent with the documented import gotcha in replit.md.

**Left off / next steps**
- Awaiting user direction on what to work on this session.
- DB still not connected, no Telegram WebApp SDK integration, no multiplayer — unchanged from prior sessions.

**State to restore**
- None.

### 2026-07-09 — Fix Moiré stripes on character outline shadow

**Done**
- Root-caused horizontal stripe artifact visible on the character's dark outline on mobile (user photo: `attached_assets/IMG_2952_1783623605477.jpeg`).
- Cause: `imageSmoothingEnabled = false` (nearest-neighbor) on the sprite drawImage. At ~0.55–0.93× scale (the range across dpr values), the 2px black outline alternates between hitting and missing output pixel rows — classic Moiré. Nearest-neighbor amplifies this into visible stripes; bilinear blends it away.
- Fix (`artifacts/telegram-game/src/pages/GameMap.tsx`, sprite draw block): changed `imageSmoothingEnabled = false` → `true` + `imageSmoothingQuality = 'high'`. The source rect is already hard-clamped (ceil start, floor end) and the OffscreenCanvas has 5px clearRects at every row boundary — so bilinear cannot bleed across atlas rows.
- Code review (architect): pass. No security issues, no state-leak (save/restore scope), typecheck clean.

**Decisions & gotchas**
- The screenshot tool renders at dpr=1 (scale=0.6) — stripes are faintest at that scale; the fix is most visible on mobile (dpr≈1.67, scale≈1.0) where the artifact was reported. Cannot visually verify fix via screenshot tool; verified by math + code review.
- clearRect guard bands + source rect clamping make bilinear safe — no new ghost artifact expected.

**Left off / next steps**
- User to verify on iOS device.
- DB, Telegram SDK, multiplayer still not started.

**State to restore**
- None.

### 2026-07-09 — Fix tile-line stripes in floor shadow ellipse

**Done**
- Root-caused horizontal stripes in the shadow ellipse under the character's feet: the flat `rgba(40,40,40,0.4)` fill was 60% transparent, letting map tile grout lines show clearly through.
- Fix: replaced flat fill with a radial gradient (`rgba(0,0,0,0.72)` at centre → `rgba(0,0,0,0.45)` at 60% → transparent at edge), drawn by squashing a circle (ctx.scale trick) to match the ellipse aspect ratio. Dark centre masks tile lines; natural fade at edges removes the hard perimeter.
- Also kept the previous bilinear smoothing fix for the character sprite outline (Moiré from nearest-neighbour at sub-1× scale).

**Decisions & gotchas**
- `ctx.scale(1, sRY/sRX)` squashes the circle into the ellipse shape — the gradient coordinates are in pre-scale space so they stay circular and map correctly.
- Desktop screenshot (dpr=1, scale=0.6) shows the shadow; mobile at higher DPR will show it more prominently — gradient approach is DPR-independent.

**Left off / next steps**
- User to verify on iOS.
- DB, Telegram SDK, multiplayer still not started.

**State to restore**
- None.

### 2026-07-09 — Shadow ellipse stripe fix (3rd attempt, correct)

**Done**
- Root cause confirmed: tile grout lines show through any semi-transparent fill over the map canvas because the map is already painted and the shadow composites over it. No opacity or gradient tweak can fully hide them while the shadow remains transparent.
- Fix: replaced gradient fill with `ctx.filter = 'blur(Xpx)'` on a solid `rgba(0,0,0,0.82)` ellipse. The blur filter is applied to the drawn shape BEFORE it composites over the map — this averages out tile-line contrast in the blur spread, eliminating stripes completely. Shadow size slightly undersized; blur spreads it to the right visual size.
- blurPx = `Math.max(2, Math.round(spriteH * 0.06))` — scales with DPR/zoom so it looks consistent at all render scales.

**Decisions & gotchas**
- Previous approaches (higher opacity gradient, gradient in wrong coordinate space) still let tile lines through because any non-zero transparency lets proportional contrast pass.
- `ctx.filter` must be reset in the save/restore block (it is — the save/restore handles it).
- Desktop screenshot (dpr=1) confirms clean soft oval, no tile-line stripes visible.

**Left off / next steps**
- User to verify on iOS device.

### 2026-07-09 — Shadow reworked + sprite switched to nearest-neighbour

**Done**
- Shadow was still too large (X radius = 0.26 spriteW spread way beyond character feet) and positioned too high (centre at +0.44 spriteH → mostly hidden under the body, with the smear extending asymmetrically below).
- Fixed: shadow centre moved to +0.50 spriteH (exactly at the bottom edge of the sprite cell, i.e. ground level). X radius reduced to 0.18 spriteW, Y radius to 0.04 spriteH, opacity to 0.40, blurPx to max(1, round(sH*0.015)). Blur keeps the ellipse edges from aliasing against tile grout, without spreading into a blob.
- Character body stripes (horizontal tile-grout bleed through body): root cause was bilinear interpolation between binarized alpha=255 body pixels and alpha=0 transparent pixels. Bilinear sampling creates semi-transparent OUTPUT pixels at every body edge → tile lines bleed through. Fix: switched sprite draw to `imageSmoothingEnabled = false` (nearest-neighbour). This is now safe because the source alpha was already binarized (all pixels are exactly 0 or 255) — hard source edges produce hard output edges with zero bleed. The original Moiré concern (2px outline alternating at sub-1× scale) was caused by the OLD semi-transparent outline pixels, not the binarized ones.
- Also: round playerCX/playerCY and spriteW/spriteH to integers before drawing to eliminate sub-pixel jitter.
- Typecheck clean. Screenshot (dpr=1) confirms clean shadow under feet, character looks crisp.
- Port 18297/8080 EADDRINUSE cleared via `fuser -k`.

**Decisions & gotchas**
- Shadow at +0.50 spriteH puts it exactly at the sprite cell bottom. If the character art ever gains more empty space below the feet in the cell, reduce to 0.47–0.48.
- NN is safe ONLY because source alpha is binarized. If the sprite sheet is ever replaced with a new one that has anti-aliased edges (non-binarized alpha), switch back to bilinear and re-examine the bleed issue.
- `fuser -k <port>/tcp` reliably clears EADDRINUSE; `pkill -f` pattern failed previously due to signal handling.

**Left off / next steps**
- User to verify on iOS.
- DB, Telegram SDK, multiplayer still pending.

**State to restore**
- None.

### 2026-07-09 — Shadow tuned: reduced blur radius + opacity to prevent blob spread

**Done**
- First blur pass (previous entry) used `spriteH * 0.06` blur and `rgba(0,0,0,0.82)` — at mobile dpr≈1.667 spriteH≈144px → blurPx≈9, which spread the shadow into a large dark blob.
- Reduced to `blurPx = max(2, round(spriteH * 0.025))` (≈4px on mobile) and `rgba(0,0,0,0.50)`. Just enough blur to soften path anti-aliasing and kill tile-line stripes, without spreading the shadow into a blob.
- Killed orphaned vite/node processes (EADDRINUSE on ports 18297 and 8080); restarted both workflows cleanly.

**Decisions & gotchas**
- Blur radius sweet spot: small enough to not spread visually (~2-4px on mobile), large enough to average out the 1-2px anti-aliased edge pixels where tile lines bleed through. If stripes return, increase blurPx slightly; if blob returns, decrease it.
- If you ever increase DPR cap or change ZOOM, re-verify shadow appearance on device — blurPx scales with spriteH which scales with dpr.

**Left off / next steps**
- User to verify on iOS.
- DB, Telegram SDK, multiplayer still pending.

**State to restore**
- None.

### 2026-07-09 — Restored blur shadow (reverted solid fill that re-introduced stripes)

**Done**
- Fresh import repair: re-registered all three artifacts via `verifyAndReplaceArtifactToml`, ran `pnpm install`, restarted `telegram-game` and `api-server` workflows.
- Root cause of continuing ground shadow stripes: the solid `rgb(38,50,56)` fill (from the "Fix character outline stripes" session) reverted the blur-filter approach that was confirmed working. Canvas path anti-aliasing always creates ~1-2px of semi-transparent sub-pixels at the ellipse boundary; horizontal tile grout lines that intersect those pixels bleed through and read as stripes on mobile.
- Fix: restored `ctx.filter = 'blur(Xpx)'` on a `rgba(0,0,0,0.82)` solid ellipse (the approach confirmed working in "Shadow ellipse stripe fix, 3rd attempt"). The blur is applied to the shape BEFORE compositing, averaging out tile-line contrast in the spread region. `ctx.filter` is reset within the existing `ctx.save()/ctx.restore()` block, so it cannot leak into the sprite draw.
- `blurPx = Math.max(3, Math.round(spriteH * 0.06))` scales with DPR/ZOOM via `spriteH`.
- Typecheck clean. Code review (architect) passed: correct save/restore scoping, no state leak, scaling formula sound.

**Decisions & gotchas**
- Do NOT revert to a plain solid fill again — canvas path fills always produce anti-aliased edges that let tile lines through at mobile DPR. The blur approach is the correct permanent solution.
- The screenshot tool renders at dpr=1 (shadow cleanest there); the fix matters most at mobile dpr≈1.67. Verify on iOS device.

**Left off / next steps**
- User to verify shadow is clean on iOS.
- DB, Telegram SDK, multiplayer still pending.

**State to restore**
- None.

### 2026-07-09 — Fix character outline stripes (root cause: alpha bleed)

**Done**
- Confirmed root cause of horizontal stripes in character outline: the sprite PNG's outline pixels are semi-transparent at edges (anti-aliased from AI generation). Map tile grout lines bleed through those semi-transparent pixels when composited over the map — same mechanism as the shadow ellipse stripes, just in the sprite itself.
- Fix: after drawing sprite to OffscreenCanvas and clearing row boundaries, binarize alpha channel across the entire sprite sheet. Any pixel with alpha > 20 → 255 (fully opaque), otherwise → 0. This eliminates all semi-transparent edge pixels so tile lines cannot bleed through.
- This is done once at sprite load time (not per frame) so zero runtime cost.
- Bilinear smoothing (previous fix) still provides clean scaling; binarized-alpha + bilinear = sharp outline at all scales with no transparency bleed.
- Shadow ellipse also fixed (previous session): plain solid rgb(38,50,56) ellipse, no transparency, no stripes possible.

**Decisions & gotchas**
- Alpha threshold = 20 (not 128): even low-alpha pixels (e.g. alpha=30) let visible tile contrast through, so threshold must be low to catch all edge anti-aliasing from the PNG.
- Binarization removes sub-pixel anti-aliasing from the source PNG, but bilinear scaling at render time re-introduces natural anti-aliasing at the game scale — net result is clean crisp edges.
- Desktop screenshot (dpr=1, scale=0.6) shows clean outline. Mobile at dpr=1.667 (scale=1.0) should be even cleaner.

**Left off / next steps**
- User to verify on iOS.
- DB, Telegram SDK, multiplayer still not started.

**State to restore**
- None.

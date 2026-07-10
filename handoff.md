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

### 2026-07-10 — Single-player / bot AI scope defined

**Done**
- Wrote `SINGLE_PLAY.md` — full scope document covering: bot architecture (server-side synthetic players, no WS), A* pathfinding on the existing collision grid, crewmate/impostor AI behaviour loops, single-player lobby flow (new `0x10/0x06 CREATE_SOLO` sub-action), headless simulation runner, 5-phase implementation plan, and key design decisions with recommendations.
- Added pointer to `SINGLE_PLAY.md` in `replit.md` Pointers section.
- No code changes — this session was planning only.

**Decisions & gotchas**
- Bots are server-side synthetic slots (`isBot: true`), not WS clients. Direct function calls into existing lobby handlers.
- Pathfinding goes in `lib/shared/src/pathfinding.ts` (shared so future debug overlay can use it).
- Bot tick rate: 5 Hz (separate from the 25 Hz broadcast loop, cheaper and sufficient).
- New wire sub-action `0x10/0x06` for CREATE_SOLO — cleaner than overloading the existing CREATE.

**Left off / next steps**
- Implementation not started. **Next session: begin Phase A — `lib/shared/src/pathfinding.ts` (A\* pathfinding on the collision grid).** This is the foundation everything else (bot movement, simulation runner) depends on.
- After Phase A is verified, proceed to Phase B (bot agent base + server integration), then C (single-player lobby flow), D (headless simulation runner), E (tuning).
- Full phase breakdown in `SINGLE_PLAY.md §9`.
- User confirmed: build starts from Phase A on the next repo import session.

**State to restore**
- None.

### 2026-07-10 — Re-import repair (routine, session 3)

**Done**
- Fresh re-import; same recurring pattern. `listArtifacts()` was empty, no workflows configured, but `artifacts/*/.replit-artifact/artifact.toml` files were intact.
- Ran `pnpm install`, re-registered all three artifacts (`api-server`, `telegram-game`, `mockup-sandbox`) via `verifyAndReplaceArtifactToml()`, which recreated their managed workflows.
- Restarted all three workflows; ran `pnpm --filter @workspace/db run push` — no schema changes needed (DB already in sync).
- Verified via screenshot: lobby loads, WS handshake succeeds (`assigned slot 0`), no console errors.
- No code changes made this session — pure environment repair.

**Decisions & gotchas**
- Same as prior sessions: expected on every fresh GitHub import/clone. See replit.md Gotchas and `.agents/memory/artifact-reregistration.md`.

**Left off / next steps**
- Project is running and ready. Next: add `TELEGRAM_BOT_TOKEN` secret, then publish to production and register with BotFather.

**State to restore**
- None.

### 2026-07-10 — Re-import repair (routine)

**Done**
- Fresh re-import; recurring pattern confirmed again. `listArtifacts()` was empty, no workflows configured, but `artifacts/*/.replit-artifact/artifact.toml` files were intact.
- Ran `pnpm install`, re-registered all three artifacts (`api-server`, `mockup-sandbox`, `telegram-game`) via `verifyAndReplaceArtifactToml()`, which recreated their workflows.
- Restarted all three workflows; ran `pnpm --filter @workspace/db run push` — no schema changes needed (DB already in sync).
- Verified via screenshot: lobby loads, WS handshake succeeds (`assigned slot 0`), no console errors.
- No code changes made this session — pure environment repair.

**Decisions & gotchas**
- Same as prior sessions: this is expected on every fresh GitHub import/clone. See replit.md Gotchas section and `.agents/memory/artifact-reregistration.md`.

**Left off / next steps**
- Project is running and ready for further feature work. No open threads from this session.

**State to restore**
- None.

### 2026-07-10 — Phase 9: Telegram haptics, theme binding, twa.ready/expand

**Done**
- Re-import repair (same recurring pattern): ran `pnpm install`, built shared lib (`pnpm --filter @workspace/shared exec tsc --build`), re-registered all three artifacts via `verifyAndReplaceArtifactToml()`, restarted `api-server` and `telegram-game` workflows.
- Confirmed Phase 8 is working: ran `artifacts/api-server/test_sabotage.mjs` — sabotage trigger broadcast `[0x16, 0x01, systemId, attackerSlot]` received correctly, cooldown rejection confirmed. The previous session's "missing trigger" investigation was a transient issue; code was already correct.
- Implemented Phase 9 (Polish & Telegram Integration):
  - New `artifacts/telegram-game/src/lib/haptics.ts` — thin wrapper over `window.Telegram?.WebApp?.HapticFeedback`; all functions are silent no-ops outside a Telegram WebView.
  - `artifacts/telegram-game/src/main.tsx` — calls `twa.ready()` + `twa.expand()` before React mount; maps `themeParams` → CSS `--tg-*` custom properties (bg_color, text_color, button_color, button_text_color, hint_color, link_color, secondary_bg_color).
  - `artifacts/telegram-game/src/context/GameContext.tsx` — added `myRoleRef` to track role across WS callbacks; haptic calls on: role reveal (warning=impostor / success=crewmate), kill broadcast (kill pulse if victim, medium if attacker — both gated inside functional setState so replays don't retrigger), meeting start (gated inside functional setState, first receipt only), win/loss (success on local win, warning on local loss using myRoleRef to distinguish), sabotage start (warning), sabotage fixed (success).
  - `artifacts/telegram-game/src/pages/GameMap.tsx` — `haptic.tap()` on all action button clicks (kill, report, emergency meeting, sabotage open/trigger, repair, task, votes); `haptic.success()` in task minigame `onComplete`.
  - `artifacts/telegram-game/src/pages/Lobby.tsx` — `haptic.tap()` on create room and join room; `haptic.medium()` on start game.
  - Updated `GAME_SPEC.md` §13 Phase 9 as ✅ complete; added §14 #18 deviation note (direct WebApp API instead of `@telegram-apps/sdk-react`).
- `pnpm run typecheck` passes clean across all packages.

**Decisions & gotchas**
- Skipped `@telegram-apps/sdk-react` — existing `getInitData()` in `GameContext.tsx` already uses `window.Telegram?.WebApp?.initData` directly; adding the SDK would add a provider wrapper with no functional gain for the haptic/theme features. Documented in §14 #18.
- Event haptics (kill, meeting, win/loss, sabotage) fire on server broadcast receipt rather than button click — deduped by being inside functional setState updaters (meeting, kill) or guarded by myRoleRef (win/loss). Button click haptics are lightweight `tap()` only; heavy confirmation comes from the broadcast.
- `myRoleRef` is updated synchronously in the 0x1A handler before `setState`, so it's always accurate in the 0x1C win/loss check that runs later in the same onmessage callback stream.
- Haptic side effects inside functional setState updaters: technically impure, but React's batching guarantees the functional form runs once per broadcast packet in practice. The alternative (a separate ref to track duplicate state) adds more code for negligible correctness gain.

**Left off / next steps**
- All 9 phases are now complete. The game is feature-complete per `GAME_SPEC.md §13`.
- Remaining non-feature work: deploy to production, set `TELEGRAM_BOT_TOKEN` in environment, register the bot's mini app URL with BotFather.

**State to restore**
- None.

### 2026-07-10 — Phase 6 completion: meetings & voting (client-side)

**Done**
- Finished the client half of Phase 6 (server-side lobby/vote logic was already complete from an earlier session): `artifacts/telegram-game/src/context/GameContext.tsx` and `artifacts/telegram-game/src/pages/GameMap.tsx`.
- `GameContext.tsx`: added `MeetingInfo`/`VoteResultInfo` types, `meeting`/`hasVoted`/`voteResult` state, `reportBody`/`callEmergencyMeeting`/`castVote`/`clearVoteResult` actions (0x13/0x14 wire sends), 0x1B/0x1C `onmessage` handlers, six new `MOCK_PRESETS` (`report-ready`, `meeting-discussion`, `meeting-voting`, `meeting-result`, `gameover-crew`, `gameover-impostor`).
- `GameMap.tsx`: Report/Emergency buttons, meeting overlay (discussion countdown → voting list with per-player vote buttons + Skip, spectator note for dead players), ejection/no-ejection auto-dismiss banner, full-screen Game Over overlay with "Back to Lobby" (reload), movement freeze during meetings (swap in an empty `Set` for `keysRef.current` in the physics step).
- Verified with `tsc --noEmit` (clean), mock-preset screenshots for every new screen, and a live two-lobby raw-WebSocket smoke test (3 real WS clients per lobby, DEV_MODE JSON auth) exercising: emergency meeting → skip-all vote → no ejection (`winFlag=0`); a second meeting with a plurality vote → ejection + immediate win via tally (`winFlag=2`); and a kill that tips alive-player parity → immediate `0x1C` win with no meeting (`checkWinAfterKill`, `ejectedSlot=NO_TARGET`). All wire payloads matched client-side parsing expectations.
- Added `GAME_SPEC.md` §14 items #13/#14 documenting two intentional deviations (see below) and marked the §13 Phase 6 roadmap checklist complete.

**Decisions & gotchas**
- Report/Emergency are both wired through the same 0x13 opcode; the emergency variant is client-only "no specific body" (`bodySlot = NO_TARGET`) — there is no dedicated map "body" prop/asset. A dead player's own sprite is the reportable body until reported, per `GAME_SPEC.md` §14 #13.
- Mock proximity presets that place remote players must anchor to the real local-player spawn (`PLAYER_SPAWN` from `game/player.ts`), not the shared `MOCK_REMOTE_POSITIONS` constant's map-center convention used by most other presets — the local player's physics state actually spawns near `PLAYER_SPAWN`, so any preset gating a UI element on proximity to the local player needs its own spawn-relative coordinates, not the shared constant.
- Live WS testing a proximity-gated server action (e.g. kill) requires first sending real `0x11` move packets to put both players' server-side positions in range — spawn-scatter positions from `computeSpawnPosition` are not close enough by default, so a naive test script will silently time out waiting for a broadcast that the server never sends (it fails the range check with no log line).

**Left off / next steps**
- Phase 6 is complete end-to-end (server + client). Phase 7 (Tasks) is next per `GAME_SPEC.md` §13.

**State to restore**
- None.

### 2026-07-10 — Correction: Phase 7 (Tasks) was already implemented

**Done**
- The previous entry above says "Phase 7 (Tasks) is next" — that was stale/incorrect. Verified via code inspection that Phase 7 is already **fully implemented**, not just planned:
  - `lib/shared/src/tasks.ts` — `TASK_DEFS` (5 tasks: Wiring, Download, Calibrate, Garbage, Filters) with map coords + interaction ranges.
  - `artifacts/api-server/src/ws/lobby.ts` — task assignment on game start, `handleTaskStep` (authoritative alive/role/range/sequential-order checks), `checkWinAfterTask`.
  - `artifacts/api-server/src/ws/wsServer.ts` — `0x15` sub `0x03` task-step opcode handling, progress broadcast.
  - `artifacts/telegram-game/src/components/TaskMinigame.tsx` — all 5 minigames implemented.
  - `artifacts/telegram-game/src/context/GameContext.tsx` / `pages/GameMap.tsx` — task assignment receipt (`0x1D`), progress state, proximity prompts, minigame overlay wiring.

**Decisions & gotchas**
- Handoff entries in this file are not reliably appended in one consistent place — some sessions prepend new entries near the top, others append at the bottom, so "most recent" isn't always "first in file." Always cross-check a phase's stated status against the actual code before trusting a `Left off / next steps` line.

**Left off / next steps**
- Per `GAME_SPEC.md` §13, next unimplemented phase is Phase 8 (Sabotages & Vision), then Phase 9 (Polish & Telegram Integration). Worth a quick code-level check at the start of that work too, given the above.

**State to restore**
- None.

### 2026-07-10 — Re-import repair: re-registered artifacts, installed deps

**Done**
- Project was re-imported and lost artifact/workflow registration (workflows list was empty, `listArtifacts()` returned `[]`) even though all three `.replit-artifact/artifact.toml` files were intact and unmodified.
- Repaired by calling `verifyAndReplaceArtifactToml()` against each artifact's own unchanged toml (api-server, telegram-game, mockup-sandbox) — this re-registered all three artifacts and their workflows without touching source code.
- Ran `pnpm install` (node_modules was missing after import) and restarted all three workflows.
- Verified via screenshot: telegram-game loads its lobby UI and the WS handshake succeeds (slot assigned). `DATABASE_URL` was already present in the environment.

**Decisions & gotchas**
- No code changes were made; this was pure re-registration + dependency install, per the existing gotcha note in `replit.md`.

**Left off / next steps**
- None — project is running as it was before the import. Resume Phase 4 work per the previous session's notes below.

**State to restore**
- None.

### 2026-07-10 — Phase 4 completion: fixed undefined vars + role reveal overlay

**Done**
- Post-import setup: ran `pnpm install`, built shared lib (`pnpm --filter @workspace/shared exec tsc --build`), restarted all three workflows — all running cleanly.
- Fixed two undefined variable bugs left by the previous Vercel session in `artifacts/telegram-game/src/pages/GameMap.tsx`:
  - `remoteAnimMap` (used at line ~349 in the rAF loop) was never defined → added `remoteAnimMapRef` as a component-level `useRef<Map<number, RemoteAnim>>(new Map())` and read it as `.current` inside the loop.
  - `PLAYER_COLOR` (used for the local player's sprite color) was never defined → replaced with `slotColor(mySlotRef.current ?? 0)` so the local player gets a slot-keyed color matching the same system used for remote players.
- Implemented the Phase 4 role reveal overlay (the last missing piece):
  - Keyframes (`rrFade`, `rrScale`, 3.2s) injected once via `useEffect([], [])` with cleanup.
  - Full-screen overlay rendered when `showReveal && myRole` — dark red for Impostor, dark blue for Crewmate, with glow text shadow.
  - Impostors see a "Fellow impostors: …" line listing teammate names (slot-filtered via `players` state).
  - `pointerEvents: 'none'` so the fading overlay never blocks input.
  - `remoteAnimMapRef.current.clear()` on role reveal so remote animations reset from spawn positions.
- `pnpm run typecheck` passes clean across all packages.

**Decisions & gotchas**
- The `remoteAnimMapRef` is declared outside the main rAF `useEffect` (at component level) so it persists across re-renders without being captured in the effect's dependency array — reads it via `.current`, which is the correct pattern for mutable state that the rAF loop owns.
- `PLAYER_COLOR` was removed in favour of `slotColor(mySlotRef.current ?? 0)`: the local player's color is now consistent with remote players (both slot-keyed) and stays in sync if the server ever reassigns a slot.
- Role reveal retrigger: the reveal fires whenever `myRole` changes (via `useEffect([myRole])`). For Phase 4 (single game per session) this is fine. For future multi-round support, the server would need to reset `myRole → null` between rounds or send a reveal nonce so the effect retriggers correctly.
- Keyframe animation duration (3.2s) is intentionally identical to the `showReveal` timeout (3200ms) so the DOM removal happens exactly when the animation ends — no `onAnimationEnd` handler needed.

**Left off / next steps**
- Phase 4 is now fully implemented end-to-end (server: role assignment + 0x1A packets; client: reveal overlay + slot-keyed colors + remote sprites).
- Phase 5 (kill mechanics) is next: kill button (impostor only, proximity-gated), 0x15 sub 0x01 client→server→broadcast, ghost mode, kill cooldown timer UI.

**State to restore**
- None.

### 2026-07-09 — Re-registered artifacts after import; regenerated collision map from updated reference image

**Done**
- Import had dropped Replit's artifact registration metadata (TOML files were intact); re-ran `verifyAndReplaceArtifactToml` for all three artifacts (`telegram-game`, `api-server`, `mockup-sandbox`), ran `pnpm install`, verified all three workflows start cleanly.
- User uploaded a new red-line reference image (`attached_assets/IMG_2907_1783632830477.jpeg`, byte-identical to the earlier `IMG_2907_1783593845208.jpeg` used previously) and asked for the collision mapping to match it.
- Pointed `scripts/src/analyzeCollisionMap.ts`'s `SRC` at the new filename and re-ran it (`pnpm --filter @workspace/scripts exec tsx src/analyzeCollisionMap.ts`) to regenerate `artifacts/telegram-game/src/game/collisionData.ts`. Updated the stale filename in the top-of-file comment in `collisionMap.ts` to match.
- Verified by rendering the decoded RLE grid as a semi-transparent overlay directly on the source reference image (temp script, not committed) — walls/obstacles/furniture align with the red outlines. Also spot-checked in-game with the collision overlay toggled on, then reverted `showCollision` back to `false`.
- `tsc --noEmit` passes; code review (architect subagent) passed with no blocking issues.

**Decisions & gotchas**
- There are two collision-generation scripts: `analyzeCollisionMap.ts` (traces pixel-accurate red-line boundaries from a hand-annotated reference photo — used this session) and `analyzeCollisionMapArt.ts` (heuristic background/darkness detection directly on the game artwork, no red-line image needed — this is what most recently produced the *previous* `collisionData.ts`, per its generated banner). Both output the same COLS×ROWS×CELL RLE format `collisionMap.ts` expects, so either can be re-run safely; use whichever a fresh reference image was drawn for.
- If future red-line reference images are supplied under a new `attached_assets/...` filename, update `SRC` in `analyzeCollisionMap.ts` to match before re-running, and update the filename mentioned in `collisionMap.ts`'s header comment so it doesn't go stale.

**Left off / next steps**
- None outstanding; both the artifact re-registration and the collision remap are complete and verified.

**State to restore**
- None — the temporary `showCollision` debug toggle was reverted back to `false` before finishing.

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

### 2026-07-10 — Fixed gas-station checkerboard over-blocking (walkway + cone footprints)

**Done**
- User reported a checkerboard-style over-blocking bug at the gas station: (1) the walkway between the kiosk and gas pumps was un-walkable where they stood, (2) traffic cones blocked their whole sprite outline instead of just their base.
- Root-caused via connected-component + BFS analysis: the automated red-line tracing pipeline (`scripts/src/analyzeCollisionMap.ts`) was correct/deterministic (data matched the reference image faithfully, 0 discrepancies), but two things combined to make the area feel over-blocked and choppy:
  1. Downsample majority-vote threshold was 0.35 — low enough that the ~2px wall-dilation halo around every nearby traced line/prop tipped many cells over the line, fragmenting the gas-station/park floor into 22 disconnected walkable islands (largest only 417 cells) instead of one open area. Raised to 0.6 (verified against a full-map connectivity sweep — largest region jumped to 874/886 cells in that area, and the whole-map dominant region stayed intact at 2651 cells with no new fragmentation and no walls disappearing).
  2. Small props (cones, bins, barrels — anything under ~3000px traced area) were blocked across their *entire* traced silhouette. Added a size-based rule: components under `SMALL_PROP_MAX_SIZE` only block the bottom `SMALL_PROP_BASE_FRACTION` (35%) of their bounding box — i.e. their base — leaving the rest of their footprint walkable. Large furniture/machinery (>3000px) is unaffected and still fully blocked.
- Regenerated `collisionData.ts` from the updated script; typecheck clean; visually verified via full-map and gas-station reference-image overlays (no regressions elsewhere) and an in-game screenshot.
- Cleaned up all temporary debug screenshots from this investigation.

**Decisions & gotchas**
- The in-game debug collision overlay (`showCollision`, toggle `[C]`) draws a marker in *every* cell (bold red if blocked, faint green if walkable) — this makes any area with a non-trivial number of real obstacles look "checkerboard-busy" regardless of whether the underlying data is actually fragmented or not. Don't judge a fix by whether the overlay "looks less busy" — verify with an actual connectivity/BFS check on the decoded grid instead.
- `SMALL_PROP_MAX_SIZE` (3000) and `SMALL_PROP_BASE_FRACTION` (0.35) are tuned to this reference image's component-size distribution (cone interiors ~200-400px, real furniture ~4000px+). If a future reference-image update changes prop/furniture scale significantly, re-check the size histogram before assuming these thresholds still hold.
- Cones are not separate sprite objects in code — they're baked into the flat background art and traced like everything else. There's no per-object hook to special-case; any cone-specific behavior has to go through this general small-prop-footprint rule in the generator.
- The 0.35→0.6 downsample threshold change affects the whole map, not just the gas station — always re-run the full-map connectivity/overlay check after touching this value, not just the specific room being fixed.

**Left off / next steps**
- User to confirm gas-station walkway and cone collision feel right in actual play.
- DB, Telegram SDK, multiplayer still pending.

**State to restore**
- None (both debug-only edits used during investigation — `PLAYER_SPAWN` hardcode and `showCollision` default — were reverted before finishing).

### 2026-07-10 — Fresh import repair (metadata only)

**Done**
- Fresh import again showed no configured workflows and `listArtifacts()` empty, while all three `artifact.toml` files were intact and unchanged. Same known failure mode as prior imports.
- Repaired by re-running `verifyAndReplaceArtifactToml()` against each artifact's own unmodified toml (api-server, mockup-sandbox, telegram-game) — re-registered all three artifacts and their workflows without touching source code.
- Ran `pnpm install` (lockfile up to date, 478 packages). Confirmed `DATABASE_URL` env var already present.
- Restarted all three workflows; screenshotted `telegram-game` — renders correctly (map, character, shadow, minimap all fine).

**Decisions & gotchas**
- No code changes needed — this is purely artifact-registration metadata that gets dropped on import. See the existing gotcha in `replit.md`.

**Left off / next steps**
- User to confirm what they'd like next (just verifying it runs is done; game is live).
- DB, Telegram SDK, multiplayer still pending (per earlier sessions).

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

### 2026-07-10 — Phase 1: WebSocket foundation

**Done**
- Added `ws` + `@types/ws` to `artifacts/api-server`.
- `artifacts/api-server/src/ws/auth.ts` — Telegram HMAC-SHA256 verification; DEV_MODE bypass
  (accepts raw `{ id, username }` JSON when `TELEGRAM_BOT_TOKEN` is not set).
- `artifacts/api-server/src/ws/wsServer.ts` — `attachWsServer(httpServer)`: uses `noServer: true`
  + HTTP `upgrade` event; only accepts upgrades on `/api/ws`; sends 0x01 ack on success.
- `artifacts/api-server/src/index.ts` — refactored from `app.listen()` to `http.createServer(app)`,
  shared with WS server. Error handling moved to `httpServer.on('error', ...)`.
- `artifacts/telegram-game/src/hooks/useGameSocket.ts` — client hook: connects, sends dev-mode
  JSON auth, logs `✅ handshake OK — assigned slot 0` on success.
- `artifacts/telegram-game/src/App.tsx` — `WsManager` component (renders null, calls hook once).
- Verified: browser console shows handshake OK; server log confirms DEV_MODE + connection.

**Decisions & gotchas**
- WS shares the same HTTP server as Express (no new port) — `noServer: true` + `upgrade` event.
- Only upgrades on `/api/ws` — all other upgrade requests are `.destroy()`-ed.
- DEV_MODE active when `TELEGRAM_BOT_TOKEN` is absent or `"DEBUG_MOCK_TOKEN"`.
- Player slot is `0` placeholder in Phase 1; real slot assignment comes in Phase 2 (LobbyManager).
- `api-zod` lib needs `tsc -p lib/api-zod/tsconfig.json` before `api-server` typecheck passes (pre-existing issue; declarations aren't committed).

**Left off / next steps**
- Phase 2: LobbyManager + lobby create/join UI (opcode 0x10).

**State to restore**
- All three workflows running. WS connected and handshaking in browser.

### 2026-07-10 — Master game spec written (GAME_SPEC.md)

**Done**
- Read all 7 spec documents supplied by the user (Modules 1–4 + server.ts frameworks).
- Cross-referenced against the existing codebase (what's already built vs. what isn't).
- Identified and resolved 12 problems in the raw spec docs (coordinate overflow, port conflict,
  opcode collision, DataView/Buffer bug, dev-mode auth bypass, delta threshold recalibration, etc.).
- Wrote `GAME_SPEC.md` — the single source of truth for all future implementation sessions.
  Covers: network protocol, coordinate wire format, auth, lobby lifecycle, delta sync engine,
  role assignment, kill mechanics, tasks/sabotages, canvas layers, Telegram SDK, implementation
  roadmap (9 phases), and a fixes table vs. the raw specs.
- No implementation was done this session (intentional — spec-only day).

**Decisions & gotchas**
- Wire coordinates use 0–32000 normalization (not x*100) — Int16 overflow fix for 4956px map.
- WebSocket must share Express HTTP server (no new port). Use `ws` with `{ server: httpServer }`.
- Opcodes: 0x01 = auth handshake only; lobby responses use 0x10 sub 0x03/0x04.
- Dev mode: when `TELEGRAM_BOT_TOKEN` is absent, accept raw JSON `{ id, username }` for local testing.
- Client-side prediction is the intended movement model (move locally, server corrects if needed).
- Implementation order: WS foundation → lobby → movement → roles → kills → meetings → tasks → sabotages → Telegram SDK.

**Left off / next steps**
- Start Phase 1 of GAME_SPEC.md roadmap: WebSocket foundation on api-server.
- Collision box height tweak (FEET_OFFSET_Y 0.42→0.25) needs iOS verification.

**State to restore**
- Read GAME_SPEC.md before any multiplayer implementation work.

### 2026-07-10 — Fresh import repair (re-registration + workflow start)

**Done**
- Re-registered all three artifacts (api-server, telegram-game, mockup-sandbox) via `verifyAndReplaceArtifactToml` after GitHub import dropped registration metadata.
- Ran `pnpm install` (478 packages resolved, clean).
- Started `artifacts/api-server: API Server` and `artifacts/telegram-game: web` workflows; both confirmed running.
- Screenshot confirmed game renders correctly: map, character, WASD controls all visible.

**Decisions & gotchas**
- Standard post-import flow: verifyAndReplaceArtifactToml is idempotent and safe to re-run; TOML content was unchanged.
- mockup-sandbox workflow was not started (not needed for core game use).

**Left off / next steps**
- User to verify shadow is clean on iOS (carry-over from 2026-07-09).
- DB, Telegram SDK, multiplayer still not started.

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

---

### 2026-07-10 — Phase 2: lobby manager, room codes, lobby UI

**Done**
- `artifacts/api-server/src/ws/lobby.ts` — new `LobbyManager` class: room code generation (32-char alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 6 chars), slot assignment (0–14), host migration on disconnect, reconnect-race guard (stale socket close guard by comparing ws reference), `broadcastRoomUpdate`, `buildRoomUpdatePacket`, `buildJoinErrorPacket`, `buildSlotAssignedPacket`.
- `artifacts/api-server/src/ws/wsServer.ts` — wired `0x10` opcode: sub `0x01` create, sub `0x02` join. Sends `0x10 0x05` slot-assignment packet to the joining client before broadcast. Added per-socket error listener. Disconnect cleanup passes closing ws reference to prevent race evictions.
- `artifacts/telegram-game/src/context/GameContext.tsx` — replaces old `WsManager`+`useGameSocket` pattern. Manages WebSocket lifecycle, exposes `GameState` and `GameActions` (`createRoom`, `joinRoom`) via context. Handles opcodes: `0x00` auth failure, `0x01` handshake ACK, `0x10/0x03` room update, `0x10/0x04` join error, `0x10/0x05` authoritative slot assignment.
- `artifacts/telegram-game/src/pages/Lobby.tsx` — new lobby screen: create room button, 6-char room code join form, room code display, live player list with slot badges, host label, "Start Game" button (host only, disabled < 2 players), connecting spinner, error banner.
- `artifacts/telegram-game/src/App.tsx` — replaced `WsManager` with `GameProvider`, added phase-gated `/game` route (only shows `GameMap` when `phase === 'playing'`, falls back to `Lobby`).
- Both packages pass `tsc --noEmit` with zero errors.

**Decisions & gotchas**
- Slot authority: handshake ACK `0x01` sends placeholder slot `0` (spec requirement); real per-client slot arrives via `0x10 0x05` immediately after create/join, before the room update broadcast. Client stores `mySlot` only from `0x10 0x05`.
- Room update packet `0x10 0x03` layout: `[opcode, sub, playerCount, hostSlot, 6-byte ASCII code, (slot, usernameLen, username…) × N]` — same packet sent to all members.
- `0x10 0x05` is an extension not in the raw GAME_SPEC.md (which reused `0x01`). Added to avoid the opcode collision noted in GAME_SPEC.md §6.
- Reconnect-race guard: `removePlayer(tgUserId, closingWs)` skips eviction if the lobby's registered socket for that slot is no longer `closingWs`.
- `LobbyManager` is a module-level singleton in `wsServer.ts`. In-memory only — all lobbies lost on server restart.

**Left off / next steps**
- Phase 3: `0x11` movement, server-side collision validation, 25Hz `0xFF` delta broadcast, client prediction + snap correction.
- Phase 3 also: `0x12` start game → role assignment → `0x1A` role reveal → WAITING→SPAWN→ROAMING.
- Start Game button in Lobby.tsx has no click handler yet — wire to `0x12` in Phase 3.
- `artifacts/telegram-game/src/hooks/useGameSocket.ts` is now orphaned by GameContext — safe to delete.

**State to restore**
- None. All changes are committed-ready.

---

## Phase 3 — Real-time Movement (complete)

**Session goal:** Wire up real-time position sync between all players in a lobby.

### What was built

**New package: `lib/shared/`** (`@workspace/shared`)
- `src/collisionData.ts` — canonical RLE grid data (moved from telegram-game; now the single source of truth used by both client and server)
- `src/collisionMap.ts` — collision utilities: `buildCollisionGrid`, `canMoveTo`, `resolveMovement`, `isBlocked`, `ZONES`, `MAP_W`, `MAP_H`, `CELL_X`, `CELL_Y`
- `src/coords.ts` — wire coordinate normalization: `WIRE_SCALE=32000`, `toWire()`, `fromWire()`, `FEET_OFFSET_Y`, `PLAYER_RADIUS`, `DELTA_THRESHOLD_SQ=100`
- `src/index.ts` — explicit named re-exports (avoids MAP_W/MAP_H duplication ambiguity)

**Server changes (`artifacts/api-server`)**
- `lobby.ts` — `LobbyPlayer` now has `x`, `y`, `lastBroadcastWireX/Y`; 25Hz delta loop (lazy start / stops when all lobbies torn down); `buildDeltaPacket()` (0xFF), `buildRoleRevealPacket()` (0x1A), `startGame()` transitions WAITING→ROAMING and sends 0x1A to all
- `wsServer.ts` — handles `0x11` (move intent, validated against shared collision grid, exact 5-byte length check), `0x12` (host-only game start → calls `startGame()`)

**Client changes (`artifacts/telegram-game`)**
- `GameContext.tsx` — new actions: `sendMove(wireX, wireY)`, `startGame()`; `remotePlayersRef` + `correctionRef` exposed as React refs (updated by 0xFF handler, read in rAF without re-renders); handles 0x1A (sets `phase='playing'`); prunes `remotePlayersRef` on 0x10/0x03 to prevent ghost rendering
- `GameMap.tsx` — sends 0x11 at 25Hz (throttled, wire-space delta filtered); reads correctionRef in rAF to snap position on server rejection; renders remote players as slot-colored Among Us-style circles (body + visor + ground shadow + slot label)
- `Lobby.tsx` — Start Game button wired to `startGame()`; auto-navigates to `/game` via `useLocation` when `phase === 'playing'`

**Other**
- `artifacts/telegram-game/src/game/collisionData.ts` → re-export stub from `@workspace/shared/collisionData`
- `artifacts/telegram-game/src/game/collisionMap.ts` → re-export stub from `@workspace/shared/collisionMap`
- `artifacts/telegram-game/vite.config.ts` — collision editor write endpoint updated to write `lib/shared/src/collisionData.ts` (was: `src/game/collisionData.ts`)
- `scripts/src/analyzeCollisionMap.ts` — OUT path updated to `lib/shared/src/collisionData.ts`

### Protocol reference (all implemented)

| Opcode | Direction | Layout | Meaning |
|--------|-----------|--------|---------|
| 0x11   | C→S       | `[0x11, wireX:Int16LE, wireY:Int16LE]` (5 bytes) | Move intent |
| 0x12   | C→S       | `[0x12]` | Host requests game start |
| 0x1A   | S→C       | `[0x1A, role:Uint8]` | Role reveal (0=crewmate) |
| 0xFF   | S→C (bcast) | `[0xFF, N, (slot:Uint8, wireX:Int16LE, wireY:Int16LE)×N]` | Delta sync |

### Decisions & gotchas

- **Wire coords:** `Int16LE` in range 0–32000. `WIRE_SCALE/MAP_W ≈ 9.93` wire units per pixel. `DELTA_THRESHOLD_SQ=100` ≈ Δwire>10 units ≈ 1px movement threshold.
- **Shared lib declarations:** `lib/shared` is a composite TS project. Run `tsc --build lib/shared` after any change to coords.ts or collisionMap.ts; the artifacts' typecheck depends on the emitted `.d.ts` files.
- **Delta loop lifecycle:** Loop starts lazily on first lobby create, stops when `lobbies.size === 0` after last lobby teardown. No permanent background spin.
- **Remote player ghost prevention:** `remotePlayersRef` is pruned on every `0x10/0x03` room update against the authoritative player list.
- **Phase 3 accepts 0x11 in WAITING state** (pragmatic for testing); Phase 4 should restrict to ROAMING only.
- **Remote player rendering:** Colored circles (slot-keyed palette) with visor + shadow. Sprite-sheet rendering for remotes is Phase 4.
- **Correction mechanism:** Server's 0xFF includes the local player's own slot on wall-clip rejection. Client applies it via `correctionRef` (a context ref, not state — avoids re-renders).
- **vite.config.ts imports from shared lib:** `import { CELL, COLS, ROWS } from '../../lib/shared/src/collisionData'` — direct TS source import (Vite resolves TS natively).

### Left off / next steps (Phase 4)

- Full role assignment (impostor selection, spawn positions per role)
- Remote player sprite rendering (currently colored circles)
- Task system / sabotage mechanics
- Kill button for impostors
- Restrict movement validation to ROAMING state only
- `0x13` kill intent, `0x14` report body, `0x15` vote
- Orphaned file: `artifacts/telegram-game/src/hooks/useGameSocket.ts` — safe to delete

### State to restore

None. All changes merged and workflows verified clean.

---

## Phase 5 — Kill Mechanics (complete)

**Session goal:** Implement GAME_SPEC.md §9 (Kill Mechanics): impostor kill button, ghost mode for dead players, kill cooldown.

### What was built

**Shared (`lib/shared`)**
- `collisionMap.ts` — `KILL_RANGE_PX` (1.5× tile width `CELL_X`)
- `coords.ts` — `KILL_COOLDOWN_MS` (25_000, per spec default)
- Rebuilt (`tsc --build lib/shared`) after adding constants.

**Server (`artifacts/api-server`)**
- `lobby.ts` — `LobbyPlayer.killCooldownMs`; `attemptKill(lobby, attackerSlot, victimSlot)` (full server-side validation: alive/role checks, no-team-kill, cooldown, `KILL_RANGE_PX` proximity in pixel space); `broadcastKill()`; `buildKillPacket()`; `_tickKillCooldowns()` decrements every 40ms tick for ROAMING lobbies. **`killCooldownMs` starts at `0` (ready) for all players at game start** — the 25s cooldown applies only after a kill, not before the first one.
- `wsServer.ts` — 0x11 move handler skips collision validation when `!player.alive` (ghost walk-through-walls); new 0x15 handler routes sub-opcode 0x01 to `attemptKill`/`broadcastKill`.

**Client (`artifacts/telegram-game`)**
- `GameContext.tsx` — `deadSlots`, `killCooldownMs` state; `sendKill(victimSlot)` action; inbound 0x15/0x01 handling (appends to `deadSlots`, resets own cooldown UI only if this client was the attacker); ~250ms interval decrements `killCooldownMs` while impostor+playing; new mock presets `kill-ready` and `ghost`.
- `game/player.ts` — `stepPlayer(..., ghost)` param: bypasses collision (map-bounds clamp only) and forces the `'ghost'` pose when true.
- `pages/GameMap.tsx` — ghost rendering (translucent, no shadow, `'ghost'` pose) for both local and remote dead players; kill button (bottom-center, visible only for alive impostors, disabled during cooldown/no target) with nearest-in-range-target polling (150ms, excludes self/teammates/dead); "You are dead — ghost mode" banner.

### Protocol addition

| Opcode | Direction | Layout | Meaning |
|--------|-----------|--------|---------|
| 0x15 sub 0x01 | C→S | `[0x15, 0x01, victimSlot]` (3 bytes) | Kill intent |
| 0x15 sub 0x01 | S→C (bcast) | `[0x15, 0x01, victimSlot, attackerSlot]` (4 bytes) | Kill broadcast — **local extension of spec's 3-byte version**, adds `attackerSlot` so the attacking client can reset its own cooldown UI without a separate ack opcode. Backward-compatible (client tolerates 3-byte legacy form). |

### Decisions & gotchas

- **Cooldown-at-start bug (caught via live two-client WS test, not screenshots):** initial implementation set `killCooldownMs = KILL_COOLDOWN_MS` for impostors at game start, silently blocking the very first kill for 25s with no error surfaced to the client. Screenshots/mocks didn't catch it since they hardcode `killCooldownMs: 0`. Fixed by starting all players at `0`; cooldown is only (re)armed after a successful kill. **Lesson: any cooldown/timer feature must be verified with a live end-to-end protocol test (raw WS client), not just mock-driven UI screenshots.**
- Verified end-to-end with a raw `ws` Node script hitting the live api-server directly (create room → join → start → move both to same walkable spawn point → kill): confirmed kill succeeds once, broadcasts to both clients, team-kill attempt is rejected, and an immediate re-kill attempt is rejected (cooldown + already-dead).
- Kill proximity uses **pixel-space** squared distance against `KILL_RANGE_PX` on both client (UI target selection) and server (authoritative check) — same units, no wire/pixel mismatch.
- Ghost movement bypass on the server is gated strictly on `!player.alive`, so it cannot be triggered by a still-alive player sending crafted packets.

### Left off / next steps (Phase 6+)

- Meetings & Voting (§6/7 in spec, opcode ranges not yet implemented)
- Task system (Phase 7)
- Sabotages & Vision (Phase 8)
- Polish & Telegram Integration (Phase 9)

### State to restore

None. All changes verified (typecheck clean, live WS integration test passed, code review passed).

## 2026-07-10 — Re-import repair
Project was re-imported and artifact registration metadata (`.replit-artifact/artifact.toml` → workflows) was dropped again, same failure mode documented in replit.md Gotchas. Repaired via `verifyAndReplaceArtifactToml()` for all three artifacts (api-server, telegram-game, mockup-sandbox), ran `pnpm install`, restarted workflows. Verified telegram-game loads, WS handshake succeeds, API server listening on 8080. No source changes made.

## 2026-07-10 — Re-import repair (again)
Same pattern recurred on a subsequent re-import (no configured workflows, artifacts missing from `listArtifacts()`). Repaired identically: `verifyAndReplaceArtifactToml()` for api-server, mockup-sandbox, telegram-game → `pnpm install` → restarted all three workflows. Verified telegram-game lobby screen renders and WS handshake succeeds (slot 0 assigned); api-server listening on 8080. No source changes.

## 2026-07-10 — Re-import repair (3rd occurrence)
Same recurring failure mode again on a fresh import (no workflows, no artifacts registered). Repaired identically: `verifyAndReplaceArtifactToml()` for api-server, mockup-sandbox, telegram-game → `pnpm install` → `pnpm --filter @workspace/db run push` (no schema drift) → restarted all three workflows. Verified telegram-game lobby renders and WS handshake succeeds. No source changes.

## 2026-07-10 — WS server crash-hardening (packet validation follow-up)

**Done**
- An external repo analysis (Grok) flagged "no input validation on packets — easy to crash server" as a real gap, despite being wrong about most other claims (task system, sabotages, voting, Telegram integration, canvas rendering are all already shipped — Phases 1-9 complete per GAME_SPEC.md).
- Verified the claim was partially true and fixed it in `artifacts/api-server/src/ws/wsServer.ts`:
  - `WebSocketServer` now sets `maxPayload: 4096` — oversized frames are rejected at the socket layer (confirmed via live test: server closes the connection with code 1009).
  - Added `sanitizeUsername()` (truncates to 64 UTF-8 bytes) applied at auth time. Without this, an oversized username (trivially achievable via the DEV_MODE JSON auth bypass, which trusts client-supplied `{id, username}` verbatim) would make `buildRoomUpdatePacket`'s `buf.writeUInt8(usernameBufs[i].length, ...)` throw a RangeError (usernames are length-prefixed as UInt8, max 255) — and that throw was unguarded, so it would crash the whole Node process for every active lobby, not just the offending connection.
  - Wrapped the `ws.on('message', ...)` body in try/catch (extracted to a named `handleMessage(ws, raw)` function) so any future unexpected exception during message processing closes just that one connection instead of taking down the server.
  - Code review caught a related edge case: the handshake-timeout `setTimeout` callback (`ws.send()`/`ws.close()` on a socket that raced closed just before the timer fired) ran outside the message handler's try/catch and could also throw uncaught — added a `readyState === OPEN` guard + its own try/catch.
- Verified live via raw WS scripts: oversized username → no crash, room packet still builds; oversized payload → clean close(1009), server stays up; handshake-race (5 sockets that connect then immediately disconnect) → no crash; normal auth/gameplay unaffected afterward (screenshotted lobby, still works).
- `pnpm --filter @workspace/shared exec tsc --build` + `pnpm --filter @workspace/api-zod exec tsc --build` were required before `tsc --noEmit` on api-server would pass (composite project references — see replit.md gotchas / memory).

**Decisions & gotchas**
- The repo's *existing* packet-length/opcode guards in `wsServer.ts`/`lobby.ts` were already solid (every `readUInt8`/`readInt16LE` is preceded by a length check; Map-based slot/task/sabotage lookups already fail safe via `undefined`). The actual crash vector was specifically the *unguarded exception path* (no maxPayload, no try/catch, no username length bound) — not missing per-field bounds checks.
- `test_sabotage.mjs`'s `connect()` helper has a pre-existing bug unrelated to this fix: it caches `state.slot` from the initial auth ACK (always reports slot 0 as a placeholder) and never updates it after the real lobby slot arrives via the `0x10 0x05` packet. This makes the `attackerSlot mismatch` assertion flaky — it only passes when Fisher-Yates happens to pick the host (real slot 0) as the impostor, and fails (assertion, not a real bug) about 1-in-3 runs when a joined player (real slot 1 or 2) is picked instead. Confirmed via 3 repeated runs. Not fixed in this session (out of scope) — a future session updating this test should have `connect()`'s message handler also update `state.slot` on `0x10 0x05`.

**Left off / next steps**
- Fix `test_sabotage.mjs`'s stale-slot tracking if it's touched again.
- Two follow-up tasks were proposed after the earlier re-import session (automated cooldown/timer regression test, native mobile companion) but the user cancelled both — not pursued.

**State to restore**
- None. All changes typecheck-clean, live-tested, code-reviewed (one issue found and fixed before this entry).

---

### 2026-07-10 — Solo-mode "screen shaking" bug report — investigation paused awaiting user answers

**Done**
- User reported: entering solo ("Test Run") mode makes the whole screen "shake like crazy" with the emergency indicator visible, blocking movement.
- Solo mode itself was implemented server-side only: in `artifacts/api-server/src/ws/lobby.ts`, `startGame()` forces `impostorCount = 0` when a lobby has exactly 1 player (lone tester is always crewmate), and `callMeeting()` rejects emergency/report requests when `lobby.players.size === 1` (0 impostors would make `_computeWinFlag()` instantly end the session).
- Ruled out via code review (no bug found in any of these):
  - `GameContext.tsx` — `applyDeltaPacket` (0xFF parser), `correctionRef` (server position-correction for local player), meeting/vote/task actions. No optimistic-UI or correction-loop bug. `phase` transitions (line ~896 close handler) don't oscillate; no reconnect-retry storm exists (there is no reconnect logic at all currently).
  - `GameMap.tsx` — rAF render loop, camera/srcX/srcY clamping, canvas resize logic, role-reveal CSS keyframes (`rrFade`/`rrScale`). No animation loop, resize feedback loop, or CSS "shake" effect. `html, body { overflow: hidden }` already prevents scrollbar-resize loops. No `100vh` usage that could trigger a mobile browser-chrome show/hide loop (canvas sizes off `window.innerWidth/innerHeight` directly, container uses `height: 100%` not `100vh`).
  - `player.ts` / `wsServer.ts` (0x11 move, 0x13 report/emergency handlers) / `lib/shared/src/coords.ts` (`toWire`/`fromWire`, `FEET_OFFSET_Y`) — spawn/feet-offset convention is consistent client↔server (no offset applied to stored/sent x/y, only to collision checks).
  - `haptics.ts` — every function is a no-op outside a real Telegram WebView; can't cause a visual "shake" in a dev browser.
- Built `artifacts/api-server/bot_shake_repro.mjs` — a disposable raw-WebSocket bot script (same pattern as `test_sabotage.mjs`): creates a solo room, starts the game, sends continuous rightward 0x11 movement at ~60Hz tick/25Hz send for 4s, presses Emergency mid-movement, logs all 0xFF echo positions. **Result: no bug reproduced** — 71 clean position echoes, strictly monotonic increasing X, no backward jump/oscillation; solo emergency meeting correctly rejected with no regression. This rules out server-authoritative-correction/rubber-banding as the cause, at least for straight-line movement.
- Not yet tried: diagonal movement (dx & dy both set, exercises `stepPlayer` normalization + `resolveMovement` wall-sliding, untested by the repro so far), rapid direction reversals or wall-clip near a collision boundary, repeated/spammed Emergency presses, t=0 state at spawn before any movement, and whether the bug is specific to the real Telegram WebView (viewport/haptics/resize behavior not present in a dev browser).

**Decisions & gotchas**
- Chose disposable raw-WebSocket Node scripts over Playwright (unavailable in this environment) and over the Screenshot tool (no click/interaction capability, can't simulate the repro) to test this — matches the existing `test_sabotage.mjs` pattern in `artifacts/api-server/`.
- Solo mode's win-condition gotcha (0 impostors + an allowed meeting → `_computeWinFlag()` instantly ends the session) is why `callMeeting()` has a solo-lobby guard; don't remove that guard without also fixing the win-condition check itself.

**Left off / next steps — MUST DO FIRST IN THE NEXT SESSION**
- The investigation is **paused pending user answers**, not resolved. Do not restart the investigation from scratch or re-derive new hypotheses before asking.
- The user was mid-way through answering this exact `AskQuestion` call when the session ended (they asked to be re-asked identically after a fresh Replit import, before any other work). **Re-issue this exact question, verbatim, as the very first action of the next session** (after the standard re-import repair steps in the Gotchas section above, if workflows/artifacts are missing):
  - Question: "I dug through the movement/collision/meeting code and scripted a bot to simulate solo movement + the Emergency button — no bug there. I need a couple details to pin down the screen-shaking bug."
  - Field 1 — `device` (singleSelect, required) — "What were you using when it happened?": `desktop_browser` = "Desktop browser (dev preview)", `phone_browser` = "Phone browser", `telegram_app` = "Real Telegram app (mobile)", `telegram_desktop` = "Telegram desktop app".
  - Field 2 — `trigger` (singleSelect, required) — "When did the shaking start?": `immediately` = "Immediately when the map appeared, before I touched anything", `after_moving` = "After I started moving (WASD / arrows / drag)", `after_emergency` = "Right after I tapped the Emergency button", `other` = "Something else".
  - Field 3 — `reproducible` (boolean, default true) — "Does it happen every time you enter solo mode, or was it a one-off?"
  - Field 4 — `other_details` (text, multiline, optional) — "Anything else you noticed (e.g. did the map image itself jump around, or just the buttons/UI)?"
  - Once answered, resume the investigation using the answers to target the right subsystem (e.g. `telegram_app` + `immediately` points at Telegram WebView viewport/theme init; `after_emergency` points back at the meeting-rejection path; `after_moving` points at diagonal movement/wall-sliding, untested by the bot so far).
- After the shake bug is resolved: either delete `artifacts/api-server/bot_shake_repro.mjs` or evolve it into the real single-player bot/testing harness (see below) rather than leaving it as dead disposable code.

**State to restore**
- `artifacts/api-server/bot_shake_repro.mjs` exists but is not part of the shipped product — disposable diagnostic script, keep or delete per the note above once the bug is closed.
- Broader, still-not-started asks from this session (do after the shake bug, in this order): (1) build a persistent single-player bot AI mode usable both as real solo gameplay and as an automated bug-hunting test harness, with its own tracking doc separate from this file; (2) formalize "playtest after every update" as a standing practice (not yet written into `replit.md`); (3) document the rule that any feature built for one mode (single-player or multiplayer) must be wired into both, so they don't drift apart; (4) update `GAME_SPEC.md`'s impostor-count table to document the solo-test-mode exception (flagged in an earlier code-review pass, not yet done); (5) no integration tests exist yet for the solo `startGame`/`callMeeting` paths.

### 2026-07-10 — Screen-shaking bug: root cause found + fix applied (unverified on real device)

**Done**
- Re-issued the paused `AskQuestion` verbatim per the previous entry's instruction. User answers: device = phone browser (Replit preview in iPhone Safari, not the real Telegram app/WebView), trigger = mostly "immediately when the map appeared" (with a caveat it might have been closer to when movement started), reproducible = yes (though only tried once), and critically: **the map canvas itself shook while buttons/UI stayed still**.
- That last detail pinpointed the mechanism: `GameMap.tsx`'s render loop derives `srcW/srcH` (camera crop) from `canvas.width`/`canvas.height` each frame (not from `window.innerWidth/innerHeight` directly), and the old resize effect mutated `canvas.width`/`canvas.height` synchronously on every `window resize` event. iOS Safari fires a burst of resize events with different `innerWidth`/`innerHeight` while its dynamic toolbar animates in/out (most visible right after page load) — each event thrashed the canvas buffer size, which changed the crop rect each time and read visually as the map "shaking" while DOM-based buttons/HUD (unaffected by canvas buffer size) stayed still. This is why the server-side bot repro (`bot_shake_repro.mjs`) found nothing — it's a client-only, iOS-only, resize-burst artifact with no equivalent in a desktop dev browser.
- Fix: debounced the resize handler in `GameMap.tsx` (150ms trailing timeout before calling `sizeCanvas`), and also listen on `window.visualViewport`'s resize event (more accurate on mobile Safari). Cleanup clears the pending timeout.
- Rebuilt `lib/shared` (`tsc --build`), full `tsc --noEmit` on `telegram-game` passes clean, workflow restarted, verified via `?mock=playing` screenshot that rendering is unaffected.
- Code-reviewed via architect subagent: **provisional pass** — mechanism and implementation are sound, no listener leaks/stale closures, safe for desktop. Flagged residual risk: `sizeCanvas` still reads `window.innerWidth/innerHeight` rather than `visualViewport.width/height`, so if jitter persists on-device the next step is switching the sizing *source*, not just debouncing it.
- Recorded the general pattern in `.agents/memory/ios-canvas-resize-shake.md` (durable lesson: canvas-only phone shake with stable DOM UI + no server/bot repro → suspect resize-event-burst canvas thrash, not game logic).

**Decisions & gotchas**
- **This fix is NOT yet confirmed on a real device.** The environment has no way to test real iOS Safari toolbar-animation behavior (no Playwright, no physical device, and the "phone browser" the user saw was Replit's preview iframe on their iPhone, not a controlled test harness). Do not mark this bug fully closed until the user confirms live.
- If the user reports the shake still happens after this fix, the next move per the code review is to switch `sizeCanvas`'s dimension source from `window.innerWidth/innerHeight` to `window.visualViewport.width/height` (with a fallback), not to re-derive new server-side hypotheses — those are already ruled out.

**Left off / next steps**
- Ask the user to retest solo mode on their iPhone and report back whether the shake is gone, changed, or unchanged.
- If gone: delete `artifacts/api-server/bot_shake_repro.mjs` (disposable diagnostic) or evolve it into the persistent single-player bot harness described in the previous entry's "State to restore" — that broader backlog (bot AI mode, playtest-after-every-update practice, single/multiplayer parity rule, `GAME_SPEC.md` impostor-count doc update, solo integration tests) is still untouched and should resume after this is confirmed closed.

**State to restore**
- None new. Prior session's disposable-script and backlog notes above still apply.

### 2026-07-10 — Screen-shaking bug, take 2: real root cause (movement-time jitter, not resize)

**Done**
- User retested after the resize-debounce fix: shake still happens, and specifically **begins with the first movement** (not on map load) — ruling out the previous fix's mechanism as the (sole) cause.
- Found the real bug in `GameContext.tsx`'s 0xFF handler (`applyDeltaPacket`): every delta-sync packet's echo of the local player's *own* position was treated as an authoritative "correction" and blindly snapped to in `GameMap.tsx`'s rAF loop, unconditionally, every tick — no threshold (a code comment described an intended "~0.5px snap threshold" that was never actually implemented).
- Confirmed via `api-server/src/ws/wsServer.ts`'s 0x11 handler that the server just stores whatever position the client sends and only *silently keeps the old position* on an actual wall-clip rejection — it doesn't flag rejections explicitly. So the vast majority of "corrections" are just stale acks of a position the client already sent and moved past locally (local movement never pauses for acks). Snapping backward on every one of these (arriving ~1 RTT after being sent, each ~40ms while moving) produced a persistent sawtooth/rubber-band jitter — invisible while idle (ack ≈ current position), visible the instant movement starts. This is also why the earlier bot script (`bot_shake_repro.mjs`) found nothing: it only checked server-echoed positions for monotonicity over the wire, never exercising the client's own prediction+correction code path.
- Fix: replaced the blind snap with ack-based reconciliation. `applyDeltaPacket` now passes raw wire ints (not pre-converted pixel floats) to the correction callback; `correctionRef`'s type changed from `{x,y}` to `{wireX,wireY}` throughout (context, hook, provider, GameMap usage). `GameMap.tsx` now keeps a small capped (40-entry) rolling history of wire positions it has itself sent (`pendingSentRef`); an incoming correction that matches something in that history is a normal ack (dropped, local prediction untouched); one that doesn't match means the server actually fell back to an older valid position (real wall-clip rejection) — only then does it snap.
- Validated the reconciliation algorithm with a standalone Node timing simulation (`/tmp/sim_reconcile.mjs`, not committed) covering continuous movement at 30-250ms latency plus jitter (zero unnecessary snaps in all cases) and an injected 200ms real rejection window (correctly produces snaps that pull the player back, resumes clean acks right after).
- `tsc --build` on `lib/shared` + full `telegram-game` typecheck clean. Workflow restarted, `?mock=playing` screenshot confirms no rendering regression. Code-reviewed via architect subagent: **pass**, with one noted non-blocking caveat (see below).

**Decisions & gotchas**
- The ack-matching is coordinate-only (no sequence numbers), so there's a theoretical edge case: a genuine "fallback to older position" could be misclassified as a normal ack if that exact coordinate happens to still be in the pending-send history. The reviewer flagged this as a protocol ambiguity, not a bug in this patch, and suggested adding move sequence IDs / explicit ack IDs to the wire protocol as a future hardening step if this ever resurfaces — not done here to keep the fix minimal and avoid a wire-protocol change.
- **Still not verified on a real device.** Static analysis + the timing simulation are strong evidence the mechanism is fixed, but this environment cannot simulate real iOS Safari/Telegram WebView network conditions or real wall-collision retries under latency. Both are called out by the reviewer as required live checks: (1) sustained movement smoothness on-device, (2) repeatedly pushing into walls under real latency to confirm the server-rejection snap-back still works (i.e. this fix must not have silently disabled wall enforcement).

**Left off / next steps**
- Ask the user to retest solo mode movement on their iPhone. If shake is fully gone: close out both shake-bug entries, then resume the broader backlog noted in the previous entry (bot AI mode, playtest-after-every-update practice, etc.).
- If shake persists in some other form, don't re-litigate resize or reconciliation from scratch — get specifics first (does it still track with movement start, or something else now) since both plausible client-side causes have now been addressed.
- If the ambiguity edge case above ever shows up as a real symptom (e.g. player visibly gets stuck at a wall it should be able to walk along), the fix is sequence-numbered moves/acks, not another coordinate-based heuristic.

**State to restore**
- `/tmp/sim_reconcile.mjs` is a scratch verification script outside the repo, not committed — no cleanup needed.

### 2026-07-10 — Phase A: A* pathfinding in lib/shared/src/pathfinding.ts

**Done**
- Implemented `lib/shared/src/pathfinding.ts` — A* pathfinding on the existing 104×58 collision grid.
  - `findPath(grid, start, goal): PathResult | null` — full public API; accepts/returns pixel coords.
  - `PathCache` class — caches per `(startCell, goalCell)` key; supports `invalidate(goal)` and `clear()`.
  - MinHeap priority queue (internal), octile heuristic accounting for non-square cells (CELL_X ≠ CELL_Y), 8-directional movement, no corner-cutting, Bresenham line-of-sight for greedy path smoothing.
- Exported `findPath`, `PathCache`, `Point`, `PathResult` from `lib/shared/src/index.ts`.
- Added `@workspace/shared` dependency to `scripts/package.json`.
- Added `scripts/src/testPathfinding.ts` smoke test + `"test:pathfinding"` script; 13/13 tests pass.
- `pnpm run typecheck` passes clean across all packages.
- Environment repair: `pnpm install`, workflows restarted (`api-server`, `telegram-game`).

**Decisions & gotchas**
- Cell sizes are non-square (CELL_X=31, CELL_Y=32.03); the octile heuristic uses actual pixel-space axis distances (dc*CELL_X, dr*CELL_Y) — not cell counts — so it remains admissible.
- `emitDeclarationOnly: true` in shared lib tsconfig: no JS is emitted; consumers import directly from src/ via package exports. Runtime tests must run inside a package that has `@workspace/shared` in its dependencies.
- Test points must be verified as walkable before calling findPath (the grid has ~43% blocked cells); the smoke test now discovers walkable cells dynamically at runtime.
- Path smoothing is greedy string-pulling (Bresenham LOS). More aggressive than SIMPLE waypoint skipping — typically reduces 10-50 raw waypoints to 2-5 smoothed ones.

**Left off / next steps**
- Phase A complete. **Next: Phase B — bot agent base + server integration.**
  - `artifacts/api-server/src/bot/BotAgent.ts` — abstract base class
  - `artifacts/api-server/src/bot/CrewmateBot.ts` and `ImpostorBot.ts`
  - Wire bot tick into the server's game loop alongside the 25 Hz broadcast
  - Bots occupy real slot entries and appear in delta-sync broadcasts automatically

**State to restore**
- None.

### 2026-07-10 — Phase B: Bot agent base + server integration

**Done**
- `artifacts/api-server/src/bot/BotAgent.ts` — abstract base class.
  - `navigateTo(self, goal)` — moves bot 80px/tick along A* path; mutates `self.x`/`self.y` directly so the 25Hz delta loop broadcasts movement automatically.
  - `chooseVote()` abstract — overridden per subclass.
  - `randomWalkablePoint()` — fallback for wandering.
  - `PathCache` instance per bot — avoids recomputing same-cell paths.
- `artifacts/api-server/src/bot/CrewmateBot.ts` — priority loop: (1) sabotage repair, (2) report body, (3) task navigation+completion, (4) wander. Votes randomly with 20% skip bias.
- `artifacts/api-server/src/bot/ImpostorBot.ts` — FAKING/HUNTING/COOLDOWN state machine. Isolation scoring gates hunts. Sabotage trigger every ~60s. Votes for accuser first, else random crewmate.
- `artifacts/api-server/src/ws/lobby.ts`:
  - Added `IBotAgent` interface (avoids circular import — bots import from lobby.ts, lobby only needs this minimal interface).
  - Added `isBot?: true` and `botAgent?: IBotAgent` to `LobbyPlayer`.
  - Added `addBotPlayer(lobby, botIndex, username, agent)` — creates slot with NullWebSocket sentinel (readyState=3, no-op send).
  - Added convenience methods: `applyTaskStep`, `applyKill`, `applyRepair` — each calls the validation method + broadcasts + win-check, shared by both WS handler and bots.
  - Added `_botInterval` (5Hz/200ms) started alongside `_deltaInterval` in `ensureDeltaLoop`.
  - Added `_tickBots()` — iterates all bot slots in ROAMING/MEETING lobbies, calls `agent.tick()` with error isolation.
- `artifacts/api-server/src/ws/wsServer.ts` — refactored to use `applyKill`, `applyTaskStep`, `applyRepair` (de-duplicates broadcast+win-check logic).
- `pnpm run typecheck` passes clean across all packages.

**Decisions & gotchas**
- `IBotAgent` interface lives in `lobby.ts` (not `BotAgent.ts`) to avoid ESM circular import: `BotAgent.ts` imports `Lobby`/`LobbyPlayer`/`LobbyManager` from `lobby.ts`; `lobby.ts` only imports the interface, which is erased at runtime.
- NullWebSocket: `{ readyState: 3, send: () => {} } as unknown as WebSocket` — readyState=3 (CLOSED) means all `player.ws.readyState === 1` guards naturally skip bot slots. Zero special-casing in broadcast methods.
- `addBotPlayer` does NOT add to `userToLobbyMap` (bots have no WS connection). It DOES add to `userIdToSlot` (negative tgUserId) for consistency, but this is only needed if the bot slot is ever looked up by fake userId (it currently isn't).
- Bot movement: 80px/200ms = 400px/s. Map is 3224px wide → cross-map in ~8s. Feels natural.
- Bot tick error isolation: try/catch per agent so a single bot crash can't kill the loop.

**Left off / next steps**
- Phase B complete — bots move, fight, task, sabotage, vote.
- **Next: Phase C — Single-player lobby flow.**
  - Client: "Play Solo" button → `0x10/0x06` message (botCount default=4)
  - Server: handle `CREATE_SOLO` sub-action — create private lobby, `addBotPlayer` × N, `startGame` immediately, return 0x10/0x03 Update + 0x12 Start sequence
  - No additional client code beyond the button and the new opcode send

**State to restore**
- None.

---

## 2026-07-10 — Phase C: Single-player lobby flow

**Done**
- `GameContext.tsx`: Added `createSolo(botCount?: number)` action (sends `[0x10, 0x06, botCount]`, default 4, clamped 1–14).
- `Lobby.tsx`: Added "Play Solo vs Bots" panel with +/− bot count stepper (default 4, range 1–14) and green "Play Solo" button, visible only when not in a room.
- `wsServer.ts`: Added `0x10/0x06` (`CREATE_SOLO`) handler — imports `CrewmateBot`/`ImpostorBot`, creates a private lobby, sends slot-assignment to human, fills remaining slots with `CrewmateBot` agents, calls `startGame()` (Fisher-Yates role assignment + 0x1A role-reveal to human), then iterates bots and swaps each agent to `ImpostorBot`/`CrewmateBot` based on assigned role.
- Private-room guarantee: `startGame()` transitions phase to `ROAMING` synchronously in the same handler, so `joinLobby` will reject any late joiners with `'in_progress'`.
- Typecheck clean. Lobby UI screenshot verified. Code review: Pass (no critical issues).

---

## 2026-07-10 — Phase D: Headless simulation runner

**Done**
- Implemented in `artifacts/api-server/src/sim/` — **not** `scripts/` as SINGLE_PLAY.md §8 originally sketched. The `pnpm-workspace` skill is explicit that `artifacts/*` and `scripts` are leaf packages that must never import from each other; the sim code needs `LobbyManager`/`CrewmateBot`/`ImpostorBot` directly, so it lives beside them in `api-server` instead.
- `lobby.ts`: added an optional `setEventListener(fn)` sink emitting a typed `LobbyEvent` at every kill/taskStep/meetingStart/vote/meetingResult/sabotageStart/sabotageResolved/gameOver (no-op when unset — zero behavior change for real games); `createHeadlessLobby()` (zero players, no human host, reuses the existing tick loops); optional `impostorCountOverride` param on `startGame`; a new `disposeLobby(lobby)` method (extracted from the existing "tear down when last human leaves" logic) that clears pending meeting/sabotage timers — reused by both the human-leave path and the sim runner so finished lobbies can't leak late timer callbacks.
- `sim/simulateGame.ts` — `runSimulationBatch(opts)`: worker-pool pattern, `concurrency` games in flight at once inside one `LobbyManager`, sharing its real 25Hz/5Hz loops unmodified (no clock-warp — see SINGLE_PLAY.md §8 for why). Per-game safety timeout marks stuck games `"timeout"`.
- `sim/cli.ts` — `pnpm --filter @workspace/api-server run simulate -- --games N --bots N [--impostors N] [--concurrency N] [--timeoutMs N] [--quiet]`. Strict integer/range validation on all numeric flags (a bad `--concurrency` used to deadlock the batch silently — now throws immediately). NDJSON (events + per-game results + one final summary line) on stdout; human-readable log/summary on stderr. `LOG_LEVEL=silent` is set in the npm script itself so pino's dev pretty-printer doesn't interleave with the NDJSON stream.
- `pnpm run typecheck` clean. Ran a code-review (architect) subagent — found 3 real issues (unvalidated CLI args could hang, logger noise breaking NDJSON, stale timers on lobby disposal), all fixed above and re-verified with fresh CLI runs (clean exit, well-formed NDJSON, no leftover intervals).

**Finding surfaced by the tool (not fixed — out of scope for Phase D)**
Every simulated game finished with `tasksCompleted: 0`. Root cause confirmed in the real game logic, not the harness: a dead body is never marked "already reported," so any crewmate bot that later wanders near the same old corpse re-triggers a fresh meeting — sometimes minutes after it was already voted on. `CrewmateBot` also prioritizes body-reporting over tasks, so once the first kill happens (usually ~15s in), the group gets stuck in report → inconclusive-vote → wander → re-report and never returns to tasks. This directly affects the proposed "tune bot difficulty for a fair, competitive solo mode" task — right now a solo game can only end via ejection or sabotage timeout, never via tasks. Recommend fixing "mark body as reported" as part of that task rather than here.

**Left off / next steps**
- Phase D complete. SINGLE_PLAY.md §9 now defines **Phase E** for the next repo-import session: (1) fix the dead-body-never-reported bug so bots stop re-reporting old corpses and actually reach tasks, (2) re-run the simulator to confirm `tasksCompleted` and `meetings`/game are realistic, (3) then run the 100-game tuning pass for a 55/45±10% win-rate target. Maps onto proposed tasks #3/#4.

**State to restore**
- None. Note: mid-session, `artifacts/telegram-game` and `artifacts/api-server` workflows both failed on restart with `EADDRINUSE` — caused by orphaned processes from a prior restart squatting on the ports, not a code issue. Fixed by killing the stale PIDs and restarting; if this recurs, check `lsof -i :<port>` for zombie processes before debugging code.

**Decisions & gotchas**
- Bot agents are seeded as `CrewmateBot` before `startGame()` so the slot is valid, then replaced with new instances after roles are assigned. New instances avoid stale internal state contamination across games.
- `createLobby()` internally calls `removePlayer(tgUserId)`, so a user already in a lobby is migrated cleanly; no duplicate membership.
- Invalid `botCount` (0 or >14 from a crafted packet) is clamped on both client and server.

**Left off / next steps**
- **Next: Phase D — Headless simulation runner** (`scripts/src/simulateGame.ts` + CLI).
  - See SINGLE_PLAY.md §8 for full spec.
  - Decouple `Lobby` from WS transport enough for in-process instantiation.
  - `scripts/src/simulateGame.ts` + CLI: `pnpm --filter @workspace/scripts simulate -- --games 100 --bots 5 --impostors 1`
  - NDJSON output: per-event log + aggregate win-rate/length stats to stdout.
- After Phase D: Phase E difficulty tuning (run 100-game sims, adjust `HUNT_ISOLATION_THRESHOLD`, sabotage interval, vote skip-bias until 55/45 ± 10% win-rate split).
- Three follow-up tasks already queued (#2, #3, #4) covering Phase D, a solo crash-safety test, and the tuning pass.

### 2026-07-10 — Re-import repair

**Done**
- Fresh re-import landed with no workflows/artifacts registered (as expected — `.replit-artifact/artifact.toml` files were present but registration metadata was dropped). Ran the standard repair: `verifyAndReplaceArtifactToml()` for api-server, telegram-game, mockup-sandbox → all three artifacts and their workflows re-registered.
- `pnpm install`, restarted all three workflows — all came up clean.
- Verified: telegram-game lobby loads, WS handshake succeeds (slot 0 assigned), "Play Solo vs Bots" panel visible.
- Proposed 3 follow-up tasks (#2–#4) covering Phase D headless sim runner, bot crash-safety tests, and difficulty tuning, per the backlog noted in the previous entry.

**Left off / next steps**
- Pick up Phase D (headless simulation runner) — now tracked as task #2.

**State to restore**
- None.

### 2026-07-10 — Re-import repair (again) + Phase E: fix simulator timeouts, tune bot difficulty

**Done**
- Second re-import in the same day; ran the standard repair again (`verifyAndReplaceArtifactToml()` ×3, `pnpm install`, restarted all three workflows, verified lobby + WS handshake). No code loss — this repo re-registers cleanly every time via the artifact.toml files already checked in.
- Picked up Phase E where a previous (out-of-credits) session left off mid-debugging a ~10% timeout rate in `artifacts/api-server/src/sim/_debugtimeout.ts`. Root cause found: `lobby.totalTaskSteps` is fixed at game start from every crewmate's assigned steps, but a dead crewmate can never submit another step — so any crewmate dying with unfinished tasks made the crew's task-completion win permanently unreachable, leaving ejection/kill-parity/sabotage-timeout as the only remaining outs, which plenty of games missed before the safety timeout.
- Fix in `artifacts/api-server/src/ws/lobby.ts`: `attemptKill` now drops the victim's incomplete steps from `totalTaskSteps` (new `_removeIncompleteTaskSteps`), and `applyKill` re-runs the task-win check after a kill since the drop can itself complete the bar. This is a real gameplay fix (applies to human-vs-bot solo games too), not simulation-only.
- Code review (architect subagent) caught that the same bug also applied to **ejected** crewmates, not just killed ones — `_tallyVotes` didn't drop the ejected player's incomplete steps either. Fixed the same way, plus a task-win re-check after ejection.
- Ran the Phase E tuning pass in stages (had to re-measure after the ejection-path fix landed, since it changed the win-rate baseline substantially):
  - Kill-path fix only + `SABOTAGE_INTERVAL_TICKS` 300→450: ~53-54.5% crew — looked fine, but was tuned against incomplete data.
  - Ejection-path fix on top (same interval): jumped to ~64-67% crew — a real effect, not noise (ejections and kills happen at similar frequency; both had been silently blocking task-wins).
  - Reverting the interval to 300 barely moved it (~68%) — sabotage frequency is a much weaker lever than expected once both task-bar paths are fixed.
  - Found a better lever: `ImpostorBot._findIsolatedTarget`'s hunt-acquisition threshold was hardcoded at `0` (impostor needed to be strictly closer to a target than any witness to *start* a hunt) — separate from the existing `ISOLATION_THRESHOLD_PX`, which only governs abandoning an already-active hunt. Extracted as `HUNT_ACQUIRE_THRESHOLD_PX = -150` (impostor commits to slightly-less-perfectly-isolated targets). Landed at 57-61% crew across two 100-game batches — within the 55/45±10% target band.
  - Final tuning: `SABOTAGE_INTERVAL_TICKS = 300` (back to original), `HUNT_ACQUIRE_THRESHOLD_PX = -150` (new), `ISOLATION_THRESHOLD_PX = 300` (unchanged). Timeout rate ~1-2% throughout.
- A second follow-up code review caught a *third* instance of the same bug class: mid-game disconnect (`removePlayer`) also removed a crewmate without dropping their incomplete steps. Fixed the same way (call `_removeIncompleteTaskSteps`, then re-check win state, gated to skip while a meeting vote is open). Re-ran a 100-game batch afterward to confirm no regression: 57%/43%, timeout ~1% — this path isn't exercised by bot-vs-bot simulation since bots never disconnect, so this was a pure regression check, not a balance measurement.
- `pnpm run typecheck` clean, `api-server` workflow rebuilt + restarted after every change, all three workflows verified running. Final measured win rate across 4+ separate 100-game batches: 57-61% crew / 39-43% impostor, consistently within the 55/45±10% target.
- Updated `SINGLE_PLAY.md` §9 Phase E section to ✅ DONE with the full writeup above (all three bug instances + full tuning history).

**Decisions & gotchas**
- `_debugtimeout.ts` in `artifacts/api-server/src/sim/` is a reusable scratch debug tool (runs a batch, dumps the last ~40 events of every timeout game) — kept in the repo since it's generically useful for any future "why did this game stall" investigation, not just this bug.
- 100-game simulation batches routinely exceed the ~5min shell command timeout at default concurrency (25) — either lower `--games`, redirect to a file and `pkill -f "src/sim/cli.ts"` + parse the partial NDJSON after a timeout (both work fine; games already finished are still valid data), or run in smaller batches.
- Pino logger output goes to **stdout**, interleaved with the simulator's NDJSON — redirect stdout to a file and grep/parse it if you need both structured results and human-readable "Game over"/"Sabotage timed out"/"Meeting concluded" lines from the same run.

**Left off / next steps**
- Phase E is done. Remaining backlog per SINGLE_PLAY.md: Phase C (single-player lobby flow / `CREATE_SOLO` client button — check if already shipped, the lobby screenshot earlier this session already showed a working "Play Solo vs Bots" panel, so this may already be done and just not marked ✅ in the doc), and whatever's left of tasks #3 (bot crash-safety) / #4 (difficulty tuning, now effectively satisfied by this session's work — reconcile or close).
- If win rate ever needs revisiting, don't trust a single 100-game batch — noise is ~±5pts; run 2-3 batches (or one large batch broken into chunks to dodge the shell timeout) before concluding a tuning change helped or hurt.

**State to restore**
- None. All changes typecheck-clean, simulator-verified, workflows restarted.

### 2026-07-10 — Re-import repair (routine, session 4)

**Done**
- Fresh re-import; same recurring pattern. `listArtifacts()` was empty, no workflows configured, but `artifacts/*/.replit-artifact/artifact.toml` files were intact.
- Ran `pnpm install`, re-registered all three artifacts (`api-server`, `telegram-game`, `mockup-sandbox`) via `verifyAndReplaceArtifactToml()`, which recreated their managed workflows.
- Restarted all three workflows; ran `pnpm --filter @workspace/db run push` — no schema changes needed (DB already in sync).
- Verified via screenshot (`?mock=lobby-host`): lobby loads correctly, no console errors.
- No code changes made this session — pure environment repair.

**Decisions & gotchas**
- Same as prior sessions: expected on every fresh GitHub import/clone. See replit.md Gotchas and `.agents/memory/artifact-reregistration.md`.

**Left off / next steps**
- Project is running and ready. Per last session's notes: Phase E (bot/solo play) is done. Check SINGLE_PLAY.md §9 for remaining phases (C confirmation, tasks #3/#4 reconciliation).
- Next: add `TELEGRAM_BOT_TOKEN` secret, then publish to production and register with BotFather.

**State to restore**
- None.

## IMPORTANT — First actions after next re-import
1. Run the standard re-import repair (see Gotchas in replit.md):
   - `verifyAndReplaceArtifactToml()` for api-server, telegram-game, mockup-sandbox
   - `pnpm install`
   - Restart all three workflows
2. Verify telegram-game lobby loads and WS handshake succeeds (slot 0 assigned).
3. Confirm the "Play Solo vs Bots" panel appears on the lobby screen.
4. Phase E is done (dead-body report bug, timeout bug, tuning pass). Check SINGLE_PLAY.md §9 for what's left (Phase C confirmation, tasks #3/#4 reconciliation).

**State to restore**
- None. All changes typecheck-clean, UI verified, code-reviewed.

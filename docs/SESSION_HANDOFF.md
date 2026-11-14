# Among Gas — Active Session Handoff

> Read this file at the start of each engineering session. Keep it concise and append dated entries under **Session updates** after meaningful work. Historical detail is preserved in [the archived handoff log](archive/handoff-2026-07-to-2026-11.md).

Updated: 2026-11-10

## Repository and architecture

- Repository: `2f22vtd4kr-cloud/Among-Gas`; integration target is `main`.
- Telegram Mini App: React + Canvas in `artifacts/telegram-game`.
- API: Express and WebSocket on one HTTP server in `artifacts/api-server`; Telegram HMAC auth, in-memory authoritative lobbies, movement and match state.
- Shared contracts and gameplay geometry live under `lib/shared`.
- Bots run server-side; seeded simulations are the balance regression gate.
- Map rendering uses an overview plus lazy-loaded 2× WebP tiles (`TiledMap.ts`); live gameplay collision still uses the reviewed raster path, not the unapproved vector candidate.

## Non-negotiable execution constraints

- Follow [recovery issue #90](https://github.com/2f22vtd4kr-cloud/Among-Gas/issues/90): work in GitHub, validate on exact commit heads, and do not access Replit/Vercel or publish/deploy during recovery.
- Use focused branches and PRs; do not merge unverified changes.
- Preserve the owner's existing map, characters, game identity, and gameplay. No broad rewrite.
- A green build or candidate geometry is not proof of real-device playability.
- Do not cut over collision/vision/bot navigation to vector geometry until all zones are traced, visually reviewed, route-tested, and accepted against the frozen baseline.

## Plan 2 status — 2026-11-10

Estimated weighted implementation progress: **approximately 45%** across the plan's S0–S16 workstream allocations. This is an engineering estimate, not release readiness.

- Merged: 11 separate task minigames with a registry, extracted camera and keyboard/joystick input modules, tiled map renderer and QA pipeline, extensive map/gameplay/server CI.
- Partial: map-art refinement tooling (no accepted SR/refined artwork), vector editor and candidate geometry, sprites/golden matrix, HUD polish, bot strategy, visual QA and GameMap decomposition.
- Blocking: independently reviewed collision/vision tracing for all five zones; production vector cut-over; statue planter/pedestal outline and parking-line disposition; complete canvas render split; asset provenance clearance; real-device and two-client acceptance.

## Engineering map

- `artifacts/telegram-game/src/pages/GameMap.tsx` remains the large integration page. Camera math is in `game/mapCamera.ts`; shared keyboard/joystick ownership is in `game/gameInput.ts`; persistent action controls are in `components/GameActionBar.tsx`; the eleven task games are in `components/minigames/`.
- Character source/palette/frame geometry: `game/characterSprites.ts`; atlas loading: `game/characterAtlas.ts`.
- Runtime map renderer: `game/TiledMap.ts`; generation and map QA are in `scripts/map-tiles/`.
- The vector collision engine/editor are a review tool and candidate pipeline. `scripts/src/buildCollisionDocument.ts` is deliberately a non-production preview generator; `test:vector-runtime-isolation` must continue proving that preview output is not silently consumed by gameplay.
- Server authority: `artifacts/api-server/src/ws/`; bot decisions/navigation: `artifacts/api-server/src/bot/`; shared coordinates and collision contracts: `lib/shared/src/`.

## Next priorities

1. Continue Phase 0 with behavior-neutral extraction of the remaining GameMap canvas scene/rendering responsibilities and regression coverage.
2. Archive no geometry assumptions as truth: finish independent source tracing and review of zones A–E, including full-footprint route probes, doors, task/vent/button reachability, vision and shadows.
3. Complete the collision editor's reviewed workflow; only then perform the staged vision → client → server → bots cut-over in separate PRs.
4. Produce genuine Stage-1 map SR and optional gated Stage-2 tile candidates; sharpened/baseline tiles alone are not regenerated artwork.
5. Complete sprite side-by-side/anchor evaluation, minigame interaction/target-size acceptance, bot observation/chat evidence, asset clearance, and release/device evidence.

## Session updates

Append entries using this compact format:

### YYYY-MM-DD — concise goal

**Done**
- Concrete paths and implementation delivered.

**Verification**
- Commands or exact-head CI evidence, including failures.

**Next**
- Remaining work and blockers.
### 2026-11-14 — continue Plan 2 implementation from supplied v2 package

**Done**
- Merged audit reconciliation PR #155 at `7726cd52b3d8c06163583d649fa39bb9db4d6c82`.
- PR #138: corrected editor shape metadata instrumentation (unsupported `kind` removed) and foregrounded the camera browser fixture while it waits for render-loop tile readiness. Current candidate head: `23b4e0d97cb7bf554e3023a8ba346a876118f1f3`; PR remains draft.
- PR #156 opened for the missing ready-target Kill pulse, with reduced-motion handling and an exact browser assertion. Current head: `2e057d89c6f26a43cd763f18fcc3b8797545a142`.
- Reconstructed both tile sets from the newly supplied Plan 2 package and ran its `tile_qa.py`: sharpened candidate passes against the faithful baseline (Lab MAD 0.4725, quarter-scale chamfer 0.145, edge F1 0.9879, worst tile colour drift 0.6686, seam step 0.0; sharpness ratio 2.648). This confirms a sharpening change, not generated new detail.

**Verification**
- PR #138 exact-head run `43556715413`: build and vector/map checks passed, but browser smoke timed out waiting for tile readiness; balance cohorts were skipped. Its 20-minute soak was cancelled when the failed verify job terminated the run.
- Corrected PR #138 exact-head run `43558056731` is in progress. Its map tile and renderer lifecycle tests have passed; later gameplay, browser, balance and soak gates are not yet complete.
- HUD PR #156 exact-head run `43558094694` is in progress; no pass or merge is claimed.

**Next**
- Finish both exact-head workflows; fix any remaining failures without weakening assertions or the three unchanged 100-game cohorts.
- Keep #138 draft until source-backed 12-zone tracing, independent review, disconnected-region and anchor dispositions, full-footprint route clearance, and separate sight/shadow authoring are complete.
- Continue the remaining Plan 2 workstreams: behavior-neutral GameMap decomposition, accepted map-art generation/gallery, sprite golden review, minigame functional acceptance, bot observation/chat evidence, provenance clearance, and owner-authorized physical-device/two-client release acceptance. Issue #90 restrictions remain controlling; no Replit/Vercel workspace operation, publishing, deployment or production mutation.

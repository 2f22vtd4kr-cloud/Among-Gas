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

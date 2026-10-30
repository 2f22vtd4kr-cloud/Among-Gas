# Among Gas — 2026-10-30 Gameplay Regression Fix Audit

**Baseline:** `8ee4ad9cf9eb8e685efbc2d45b5c59ad1b0c588d` on `main`  
**Fix branch:** `fix/live-movement-spawn-and-vector-collision-2026-10-30`  
**Status:** Implementation patch; CI/runtime result must be added before merge.

## Reported failures
- Characters appear on wall/prop seams.
- Local player shakes or moves backwards while walking.
- Emergency action too small on mobile.
- Square collision and illumination/shadow edges remain.

## Replit audit evidence
The Replit report is analysis, not a patch. Its first mocked movement run bypassed production readiness because `VITE_ENABLE_GAME_MOCKS=true` suppresses the `0x23/0x24` handshake. It is not server-authoritative evidence.

The later corrected unmocked test completed readiness and recorded accepted movement deltas with no `0x22` corrections during a short open-floor path, a held wall-contact path and a short mobile-emulated joystick drag. Those samples did **not** reproduce the violent shake. This does not disprove the user's report; real-device diagonal movement, long paths and intermittent timing still need testing.

The old Emergency button measured approximately **89×53 CSS px** at 390×844. The correctly decoded five-player spawns were `(1395,423)`, `(1486,463)`, `(1451,528)`, `(1382,553)`, `(1212,445)`; old sprite-vs-grid checks passed although some were close to visible seams/props.

## Confirmed code findings and fixes

### 1. Fountain outline was rasterized into square cells
The `central-fountain-base` polygon was converted into whole 31×32px cells whenever a cell intersected it. The visibility raycaster inherited the same coarse grid.

**Fix:** keep the RLE base mask unchanged and test the manual polygon as exact point/circle/rectangle/ray/segment geometry. It remains blocked for movement without injecting filled cells into the grid or shadow mask.

### 2. Ordinary 0xFF echoes could cause local rollback
GameMap treated an unknown ordinary `0xFF` snapshot as a correction even though the protocol has explicit `0x22` movement correction packets.

**Fix:** first own-player delta initializes authoritative spawn; matching regular snapshots acknowledge sent movement; stale/unknown regular snapshots are ignored; only explicit `0x22` may snap after initialization. This unsafe code path is confirmed by inspection, but is not proof it caused the user's exact shake.

### 3. Spawn clearance was too permissive
Prior predicate checked the sprite rectangle with no spacing outside it.

**Fix:** 12px spawn-only margin around the full rendered sprite, unchanged live feet collider, same fallback for solo/multiplayer, and five-player separation checks.

### 4. Emergency control had no minimum size
**Fix:** min 132×58 CSS px; larger text/icon; safe-area reservation; browser dimension assertion and screenshot.

## Iterative fix log

### Cycle 1 — Vector obstacle
- [x] Remove manual polygon-to-cell rasterization.
- [x] Keep base RLE mask unchanged.
- [x] Exact polygon collision for player footprint.
- [x] Exact ray/segment occlusion.
- [x] Regression tests for formerly added-only cell, player collision, and sight ray.
- [ ] CI run and overlay inspection.

### Cycle 2 — Spawn safety
- [x] 12px margin around visible sprite, spawn only.
- [x] Margin-aware solo/multiplayer fallback.
- [x] Extended fallback scan to radius 600 after the 15-player server invariant exposed that 360px was too short with the new clearance margin.
- [x] Geometry verifier now mirrors the maximum 15-player formation and separation test.
- [ ] CI geometry check and live spawn screenshot.

### Cycle 3 — Movement
- [x] Classify initial spawn, acknowledgement, stale echo and explicit correction.
- [x] Stale ordinary echoes cannot snap player/camera backwards.
- [x] Preserve 0x22 correction behavior.
- [x] Unit regression tests.
- [ ] Live WebSocket/real touch test with diagonal/wall/corner and per-frame logs.

### Cycle 4 — Emergency
- [x] 132×58 minimum target, bigger text/icon, responsive safe bounds.
- [x] Browser size assertion and screenshot capture.
- [ ] CI portrait/compact/landscape screenshot audit.

## Explicitly not changed
- Legacy RLE mask was not regenerated or broadly widened.
- Feet collider remains radius=4, half-width=10; no speculative sprite-sized movement collider.
- Camera smoothing, speed, character art, walk/kill animations, audio, tasks and roles were not broadly refactored.
- No collision/occlusion-off workaround.

## Limitation
The hand-traced fountain addition is vector-based. The legacy RLE remains a 104×58 discretization and can still have square cell boundaries. This patch does not claim to convert every legacy grid edge to high-resolution contours. Replacing the entire mask requires native-resolution source tracing, corridor/reachability validation and full-map screenshot comparison.

## Release gates
1. CI passes map mechanics, movement, visibility, gameplay invariants, auth, build, browser smoke and simulations.
2. Collision overlay shows the fountain as vector outline and unrelated RLE areas unchanged.
3. Real Replit/TMA session shows server-generated spawn sprites/feet on floor art with margin.
4. Mobile test covers all diagonals, thin walls, corners, edges, pointer-cancel/lost-capture and server corrections; record world/camera traces and packet counts.
5. Emergency target fits 390×844 and 320×568 without overlap/clipping in landscape.
6. Update this file with exact CI results, screenshot evidence, remaining issues and merge SHA before claiming ready.

## Evidence
- User iPhone screenshot: mobile Safari portrait, live match, supplied in chat.
- Replit agent report: user-provided analysis; mock-only test superseded by its corrected unmocked run.
- CI screenshot bundle: `among-gas-visual-qa` after branch workflows run.

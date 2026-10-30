# Among Gas — Independent Gameplay Repair Audit

**Audit date:** 2026-10-30  
**Repository:** `2f22vtd4kr-cloud/Among-Gas`  
**Inspected baseline:** `main` at `dbbe1d3f6558a2fb68a000e3535fa2cd028d2aa4`  
**Patch PR:** [#33 — Fix map raster alignment and preserve balaclava sprite crops](https://github.com/2f22vtd4kr-cloud/Among-Gas/pull/33)  
**Patch branch:** `fix/map-sampling-and-sprite-scale-2026-10-30`  
**Runtime patch commit:** `0728a959a38d26d6d503f6e16eeb23a71fb75381`  
**Status:** Camera/raster registration fix and associated regressions pass full CI. Collision/visibility contour replacement remains an open engineering task. PR #33 is open; `main` is unchanged. This is not a full Replit/iPhone release sign-off.

## 1. User evidence and requested scope

The supplied gameplay screenshot showed the player apparently standing over wall/structure art, a large angular light/visibility boundary, and a character that looked unusually small or cropped. The accompanying reference showed the intended balaclava model and the cut-body with exposed bone.

The requested audit covers player spawn and collision alignment, map/camera registration, sprite crops during gameplay and kill scenes, visibility/shadow silhouettes, and further bug hunting. The repository's own map artwork, collision reference and balaclava atlas are the source of truth. No external clone code or replacement character assets were imported.

## 2. Repository baseline and earlier audit claims

- The live public `main` branch was independently checked at `dbbe1d3f6558a2fb68a000e3535fa2cd028d2aa4`. It had no open PRs at the beginning of this audit.
- The previous Replit handoff text claimed that `mapWorldRectToImagePixels()` had already been implemented and browser-verified. That helper and its call site were absent from the checked `main` source. The reported fix was therefore not in the repository.
- The project contains a canonical 3224×1858 PNG, a 6608×3808 WebP used preferentially by gameplay, a 1123×1401 seven-column/nine-pose balaclava atlas, and the original red-line collision reference.
- The previous audit's own release gates were incomplete. In particular, it called out that the 104×58 collision raster and visibility grid still produce square/stair-step outlines.

## 3. Confirmed defect and repair

### 3.1 Camera sampled the higher-resolution WebP using world-space pixels

In the baseline `GameMap.tsx`, camera crop values `srcX/srcY/srcW/srcH` were calculated in canonical world coordinates (3224×1858) and passed directly as the source rectangle to `drawImage()`. The asset loader prefers `map-hires.webp` (6608×3808). The WebP's native source pixels therefore did not correspond to the world-space coordinates used by the player, collision and visibility systems. The PNG fallback happened to be identity-scaled, which concealed this problem when only the PNG was used.

This is a confirmed render/world coordinate mismatch and explains why the player, walls and visibility reveal appeared misregistered in gameplay.

### 3.2 Implemented correction

- Added `lib/shared/src/mapImageTransform.ts`, which converts a world-space rectangle to the loaded image's native pixels using independent X and Y scale ratios.
- Updated `GameMap.tsx` to use `mapImg.naturalWidth/naturalHeight` and pass the transformed crop to `drawImage()`.
- Added camera diagnostics containing both the canonical world rectangle and the native image source rectangle.
- The PNG remains identity-scaled; the WebP crop is now sampled using its actual native dimensions. Collision geometry, map art and spawn coordinates were not rewritten as part of this fix.

### 3.3 Character atlas findings — preserve the existing crop contract

The atlas has measured source windows and a separate `displayHeight` metadata field. Inspection of the existing browser test showed that role-reveal sprites are intentionally not vertically stretched (`transform: none`); a pose-specific clip path masks detached strokes while preserving the visible feet.

The earlier hypothesis that `displayHeight` should be used to stretch the destination was wrong and has been reverted. Current runtime rendering retains the original measured crops: idle height 136px and cut-body/exposed-bone height 93px. The shared feet offset and sprite half-height remain at their original 136px-crop-derived values. No sprite scale or movement footprint change remains in the patch.

A new regression test now checks all seven colors, all nine bounded pose windows, the idle crop and diagnostic height, the corpse crop and diagnostic height, and the shared feet anchor. The browser suite also checks the actual rendered role-reveal aspect ratio against the measured crop.

### 3.4 Player spawning

No production spawn coordinate, hitbox, spacing constant or lobby spawn-selection algorithm was changed in the final patch. An intermediate attempt to stretch sprites caused the 15-player geometry verifier to fail; that stretch and an associated spawn-search experiment were both reverted. The final full CI run passed the original 15-slot spawn/reachability check with the original sprite footprint.

## 4. Collision and visibility audit — still unresolved

### 4.1 Current production mask

The live movement grid remains 104×58 cells across a 3224×1858 world, approximately 31×32 world pixels per cell. The central fountain has a manually authored polygon override, but most walls and object boundaries are still raster-cell based. Visibility ray casting also steps through this coarse grid. Smoothing the final ray distances cannot recover outline detail that is absent from the source mask.

The CI collision QA overlay was generated and visually inspected alongside the original red-line reference. It confirms that many current collision boundaries are blocky cell silhouettes, while the reference contains substantially finer traced outlines. The corresponding angular visibility/fog boundaries remain visible in the post-fix screenshots. The camera transform repair does not fix either of these geometry defects.

### 4.2 Native-resolution exploratory mask

A separate, non-production experiment was run against the original 1359×784 red-line reference. It reused the existing analyzer's red-pixel threshold, two-pixel dilation, border flood-fill, connected-component size classes and small-prop base-footprint rule, but retained the reference resolution rather than downsampling to 104×58.

Exploratory result:
- Candidate resolution: 1359×784 (about 2.37×2.37 world pixels per cell).
- Candidate blocked pixels: 618,682 of 1,065,456 (58.1%).
- Row-major binary RLE transitions: 14,925.
- An 8-world-pixel lattice scan found 614 safe sprite-clear spawn anchors within the existing rectangular lobby spawn bounds.
- A greedy farthest-point sample placed 15 candidate anchors with a minimum pair separation of about 102 world pixels.

This is diagnostic evidence only. The prototype was not connected to client/server runtime, the existing radial spawn-selection policy was not replaced, and performance under 720-ray visibility casting was not benchmarked. A native-resolution grid must not be promoted until every doorway, narrow passage, prop base, manual override, task route, spawn position and client/server movement rule has been reviewed against the reference and measured in browser/mobile performance. The current production grid remains unchanged.

### 4.3 Next collision work

The next safe implementation path is to formalize the native-resolution candidate as a reproducible preview, compare its edges to the user's red-line reference, and benchmark it. Then decide whether to use high-resolution raster data or simplified vector contours for movement and visibility. Low/tall objects must be classified separately for movement blocking and shadow casting. Do not blanket-dilate the current grid or turn off fog to hide the silhouette problem.

## 5. Verification results

Runtime code at commit `0728a959a38d26d6d503f6e16eeb23a71fb75381` passed the full GitHub Actions workflow. Runs `41097773196` and `41097784231` both completed with `success`.

| Check | Result |
|---|---|
| Current `main` baseline | Verified at `dbbe1d3f6558a2fb68a000e3535fa2cd028d2aa4`; unchanged by this PR |
| Confirmed world-to-WebP crop mismatch | Fixed in PR branch |
| PNG/WebP source rectangle regression | Passed using actual 3224×1858 PNG and 6608×3808 WebP metadata |
| Browser camera source-rectangle assertion | Passed: actual WebP dimensions and independent X/Y mapping checked |
| Character atlas geometry test | Passed: seven colors, nine pose crops, idle foot anchor and cut-body crop |
| Browser role-reveal crop geometry | Passed: actual rendered aspect ratio matches the measured source crop; no vertical stretching |
| Typecheck and API/frontend build | Passed |
| Map spawn-clearance and reachability verifier | Passed, including 15-player placement with existing production geometry |
| Visibility and client/server movement tests | Passed |
| API gameplay invariants, Telegram HMAC and live WebSocket role/sabotage tests | Passed |
| Replit single-origin production serving and dev/WebSocket proxy checks | Passed in CI |
| Mobile/desktop Playwright smoke suite | Passed |
| Browser visual evidence | Captured and inspected for gameplay HUD, role reveal, camera movement, kill animation, corpse and all seven corpse colors |
| Collision QA overlay | Generated and inspected; confirms coarse 104×58 cell boundaries remain |
| 100-game headless multiplayer simulation | Passed: 100 games, 0 timeouts, 70 crew wins, 30 impostor wins, average 45.261s, 14.1 tasks, 1.2 kills and 0.5 meetings per game |
| Physical iPhone/Android Telegram WebView | Not tested in this environment |
| Interactive Replit workspace session | Not available; CI serving and WebSocket checks passed, but this is not the user's live Replit deployment |
| Direct Vercel preview inspection | GitHub Vercel status checks report success, but direct deployment inspection returned a team-scope 403; no visual review of the Vercel-hosted preview is claimed |

### 5.1 Visual evidence inspected

The CI visual artifact `among-gas-visual-qa` from run `41097773196` includes:
- `gameplay-hud.png` — map art and character registration after the transform correction.
- `camera-stability-after-move.png` and `camera-stability-diagnostic.png` — player remains screen-stable during camera follow.
- `role-reveal-sprite-crop.png` — balaclava sprite with complete feet and intended crop proportions.
- `kill-screen-victim.png`, `kill-animation-attacker.png`, and `corpse-all-seven-colors-mobile.png` — single cut-body/exposed-bone corpse crop and color coverage.
- `collision-qa-overlay.png` and `collision-reference-overlay.png` — production 104×58 grid versus original red-line reference.

These are CI browser captures and fixture-based visual checks, not a physical iPhone session or an interactive Replit deployment.

## 6. Remaining release blockers

1. Square/stair-step movement collision and visibility boundaries need native-resolution contour review and implementation.
2. The shadow/visibility system still uses the coarse movement grid for most occlusion; furniture, lamps, walls and low props need a deliberate height/outline classification.
3. The native-resolution candidate requires a reproducible committed analyzer and performance/reachability testing before runtime use.
4. The actual live Replit preview still needs to be opened and visually inspected by the project owner; this session could only verify the Replit serving/development workflows in CI.
5. Physical Telegram WebView QA is still needed for viewport changes, safe areas, touch-cancel/lost-pointer handling, pause/resume and long-running sessions.

## 7. Chronological investigation notes

- **Baseline review:** Verified that the claimed map transform fix was not in `main`; traced the mismatch to world-space camera crops sampled directly from the larger WebP.
- **First patch:** Added the image transform and a metadata-based PNG/WebP regression. The transform test passed in CI.
- **Test harness correction:** The first character test command ran `tsx` from the wrong workspace. It was moved to the scripts workspace and then executed successfully.
- **Sprite-height hypothesis:** A proposed vertical expansion based on `displayHeight` was rejected after reviewing the existing no-stretch browser contract. The implementation, shared foot geometry, and spawn experiments were reverted. This prevents a false sprite fix from altering collisions.
- **Spawn verifier correction:** The verifier was updated to read the shared numeric idle-crop constant rather than duplicating an obsolete hardcoded assumption. The final check passes with the original 136px crop.
- **Browser assertions strengthened:** Added actual camera world/source rectangle assertions and a measured role-sprite aspect-ratio assertion. Both pass in the latest CI run.
- **Final automated verification:** Two complete CI runs for the crop-preserving runtime patch passed, including the 100-game simulation. The PR remains open and the `main` branch remains unchanged while collision/visibility work is outstanding.

## 8. Immediate next steps

1. Commit the native-resolution analyzer as a non-production preview tool so another engineer can reproduce the candidate and its metrics.
2. Inspect the candidate overlay against every room boundary, door, bed, bench, lamp, planter/fountain, task point and vent.
3. Benchmark collision queries and the 720-ray visibility loop at the candidate resolution on mobile-class hardware.
4. Design and test spawn selection against the candidate geometry without reducing the existing 72px minimum separation or weakening sprite clearance.
5. Only after those checks pass, connect the new geometry to both client and server and rerun pathfinding, spawn, movement, visibility, task, kill, report, vent, sabotage and 100-game tests.
6. Keep PR #33 unmerged until collision/visibility review and an actual Replit preview inspection are complete.

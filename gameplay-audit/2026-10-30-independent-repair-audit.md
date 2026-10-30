# Among Gas — Independent Gameplay Repair Audit

**Date:** 2026-10-30  
**Repository:** `2f22vtd4kr-cloud/Among-Gas`  
**Baseline:** `main` at `dbbe1d3f6558a2fb68a000e3535fa2cd028d2aa4`  
**Patch branch:** `fix/map-sampling-and-sprite-scale-2026-10-30`  
**Status:** Source corrections authored; automated CI and live-device verification pending. This is not a release sign-off.

## 1. User evidence and scope

The supplied gameplay screenshot shows a player apparently misregistered against floor/wall art, an abrupt angular visibility reveal, and a small-looking character body near raised map geometry. The separate supplied image shows the intended balaclava character identity and authored cut-body/exposed-bone art.

Scope: spawn and collision registration, map/camera alignment, full character proportions in gameplay and kill scenes, visibility/shadow shape quality, and continued bug hunting. Preserve the repository's map illustration, balaclava atlas and manually authored gameplay geometry. Do not import third-party clone code or character art.

## 2. Repository state verified before editing

- GitHub reported `main` at `dbbe1d3f6558a2fb68a000e3535fa2cd028d2aa4` and zero open pull requests at inspection time.
- The earlier audit file was not a completed release audit: its release gates remained unchecked. It also acknowledged that the 104×58 RLE map still produces square collision/visibility boundaries.
- The repo contains a 3224×1858 canonical PNG, a separate higher-resolution WebP and a 1123×1401 seven-column/nine-pose balaclava atlas.
- The supplied prior run narrative claimed `mapWorldRectToImagePixels()` had been implemented and verified. That function and its usage were absent from the checked `main` source.

## 3. Confirmed source defects

### 3.1 Camera sampled the WebP with world-space source coordinates

`GameMap.tsx` calculates `srcX/srcY/srcW/srcH` in canonical 3224×1858 world pixels, then passed them directly to `drawImage()`. The loader prefers `map-hires.webp` and falls back to the canonical-sized PNG. Using world coordinates directly as WebP source pixels samples a different scale than player positions, collision and visibility. This is a confirmed defect and a plausible primary cause of the apparent player-on-wall/camera registration failure.

### 3.2 Sprite atlas crop contract — not a confirmed defect

The atlas supplies both a measured source crop and a separate diagnostic `displayHeight`. The existing browser suite explicitly requires role-reveal sprites to remain un-stretched (`transform: none`) while a clip path masks detached strokes below the feet. The prior hypothesis that `displayHeight` should scale the destination was incorrect and has been rolled back. The idle crop remains 136px; the cut-body/exposed-bone crop remains 93px. Whether the user's reported visible-leg clipping comes from an incorrect crop window, clip path, or the old map/background scale must be judged from post-transform screenshots. It is not marked fixed yet.

### 3.3 Shared foot geometry

The feet anchor and spawn bounds remain tied to the measured 136px idle crop (half-height 31px). They were intentionally restored after the above hypothesis was rejected; no expansion of the sprite footprint is retained.

### 3.4 Square collision and visibility remain a separate known limitation

The base collision and ray visibility data still use 104×58 cells (about 31×32 world pixels). The fountain is exact vector geometry, but most map contours are still raster-cell based. Smoothing the resulting ray distances cannot replace accurate source contours. This patch does not claim to fix every square collision edge or shadow.

## 4. Patch authored

- Add a pure world-rectangle → native-image-pixel transform using independent ratios from the actual loaded image dimensions.
- Apply that transform before gameplay map `drawImage()`; extend opt-in camera diagnostics with image size and transformed source rect.
- Add a regression that reads actual PNG/WebP metadata and verifies identity PNG scaling plus full-map and interior crop mapping for both assets.
- Preserve the atlas's existing measured per-pose crop windows and no-vertical-stretch rendering contract, including the diagnostic `displayHeight` metadata. Add regression coverage for the seven colors, nine bounded pose crops, idle feet anchor and cut-body/exposed-bone source frame.
- Add a pose-window / feet-anchor regression and wire both new checks into CI.
- Preserve map art, atlas pixels, RLE base collision and the existing vector fountain.

## 5. Verification status

| Check | Result at time of patch |
|---|---|
| Main SHA and open PR inventory | Verified: `dbbe1d3f6558a2fb68a000e3535fa2cd028d2aa4`; zero open PRs |
| Source review of map loader and draw path | Confirmed defect |
| Source review of per-pose sprite sizing | Confirmed defect |
| PNG/WebP transform regression | Added; CI pending |
| Character atlas / shared feet-anchor regression | First CI attempt did not execute: `tsx` was invoked from a package that does not install it; test runner corrected in follow-up commit |
| Workspace typecheck/build | Pending CI |
| Spawn-clearance and reachability suite after foot geometry change | Pending CI |
| Browser screenshots and transient kill-scene framing | Pending |
| Full collision QA overlay / outline review | Pending |
| 100-game simulation | Pending |
| Physical iPhone/Telegram WebView | Not available in this session |
| Vercel deployment | No Among Gas project appeared in the connected Vercel project context; no live Vercel run is claimed |

## 6. Outstanding defects that must not be marked fixed

1. Legacy 104×58 RLE walls remain coarse. A real fix needs native-resolution contours derived from the map and the original collision reference, validated against corridors, doorway widths, spawn clearance, reachability and full-map overlays. Blanket dilation is unacceptable because it can seal corridors.
2. Visibility/fog boundaries still derive primarily from the coarse grid. Audit tall/low props and authored outlines rather than disabling occlusion or treating component-size heuristics as final geometry.
3. Post-patch screenshots from an actual browser are still required. A successful typecheck/build is not visual proof.
4. No physical iPhone/Android Telegram WebView was available. Test dynamic viewport changes, touch-cancel/lost pointer capture and long sessions on device.
5. Do not merge or call the game Replit-ready until all CI release gates pass and the Replit preview is visually inspected.

## 7. Next actions

- Run the PR checks; fix any spawn/collision regressions caused by the corrected idle foot anchor.
- Inspect CI collision overlays against the original map reference, focusing on every doorway, planter/fountain and furniture edge.
- Capture mobile portrait, compact landscape and desktop screenshots for idle, walking, ghost, dropped corpse and transient kill scenes. Verify feet, bone, proportions and camera registration.
- Continue category-by-category map and gameplay bug hunting after registration is corrected. Record each reproduction, diagnosis, fix and evidence here before advancing.
- Keep release status pending until the evidence exists.


## 2026-10-30 — CI harness correction

- First PR check: the PNG/WebP transform regression passed against the actual assets (PNG 3224×1858, WebP 6608×3808).
- The character geometry test did not execute: the workflow invoked `tsx` from the `@workspace/telegram-game` package, which does not declare/install that runner. The failure was before test module evaluation, not a failed sprite/collision assertion.
- Corrected the command to use the already-installed `tsx` from `@workspace/scripts` and added a package script for that invocation. Full CI must rerun; no subsequent gameplay checks have yet run.


## 2026-10-30 — Spawn-geometry verifier corrected

- The second CI attempt passed both new regression tests, then stopped in `scripts/verify-map-mechanics.mjs` before map reachability was evaluated. Its old expectation hardcoded the former 136px cropped idle height and rejected the new authored 153px display height.
- Updated the verifier to read the shared numeric `IDLE_SPRITE_VISIBLE_HEIGHT`, rather than duplicating the previous value. Kept `PLAYER_SPRITE_HALF_HEIGHT_PX` as a numeric literal for the existing source parser; the atlas test asserts that it remains the calculated ceiling (35px).
- CI must rerun to determine whether any solo/multiplayer spawn candidate needs adjustment under the corrected feet position and sprite bounds.


## 2026-10-30 — Full-match spawn capacity investigation

- Latest CI run passed both new asset/sprite regressions but failed the exhaustive 15-player placement check at slot 12. The previous radial fallback sampled only 48 angles at 12px radius increments, which can miss small safe positions and makes sequential placement order-dependent.
- Replaced that fallback in both the authoritative API lobby and the independent map verifier with a deterministic 8px lattice search inside the existing 600px spawn ellipse and existing shared spawn-area bounds. The chosen point maximizes nearest-player clearance with a mild preference for staying near the intended lobby spawn radius. The normal preferred ring placement remains unchanged when it succeeds.
- No collision cells, foot hitbox, spawn zone boundaries, or minimum 72px inter-player separation were weakened. CI must confirm 15 valid positions, spawn-region safety and the remaining gameplay suites.


## 2026-10-30 — Rejected sprite-height hypothesis and spawn rollback

- Reviewing `scripts/browser-smoke.mjs` revealed an explicit existing contract: role-reveal character sprites must use `transform: none`, with the polygon clip path removing detached lower-atlas strokes while retaining the feet. The `displayHeight` field is diagnostic baseline metadata, not a destination scaling instruction.
- Reverted the proposed vertical stretch in DOM, local, remote and corpse sprite rendering; restored the original 136px idle source crop and 31px vertical half-extent/feet anchor. The updated atlas regression now protects the actual crop dimensions, seven-color/nine-pose atlas bounds, idle baseline metadata and corpse exposed-bone crop.
- The 15-player check failure was caused by this incorrect height expansion, not proof that the existing spawn search needed redesign. Reverted the 8px lattice fallback in both the API and verifier, and restored the previously validated radial candidate search. The test will rerun against the correct sprite geometry.
- The map raster transform remains the independently confirmed defect and stays in the patch. Visible sprite-leg crop remains open pending post-transform browser screenshots and inspection of the actual role/kill render.

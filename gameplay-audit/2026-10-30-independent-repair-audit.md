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

### 3.2 Isolated pose crops were also used as destination heights

The atlas stores measured source windows and a separate `displayHeight` for each pose. Gameplay, remote players, corpse rendering and DOM role/kill sprites sized the destination from `frame.height` rather than authored `displayHeight`. The discrepancy is largest for the cut-body pose (93 source pixels vs 118 display pixels) and idle (136 vs 153). This shrinks several character poses despite the atlas crop being bounded.

### 3.3 Shared feet geometry must follow rendered idle height

The shared `FEET_OFFSET_Y` and vertical spawn extent were derived from the 136px cropped idle window. Once rendering uses the measured 153px idle display height, those shared constants must change together or the visual feet and authoritative collision anchor diverge.

### 3.4 Square collision and visibility remain a separate known limitation

The base collision and ray visibility data still use 104×58 cells (about 31×32 world pixels). The fountain is exact vector geometry, but most map contours are still raster-cell based. Smoothing the resulting ray distances cannot replace accurate source contours. This patch does not claim to fix every square collision edge or shadow.

## 4. Patch authored

- Add a pure world-rectangle → native-image-pixel transform using independent ratios from the actual loaded image dimensions.
- Apply that transform before gameplay map `drawImage()`; extend opt-in camera diagnostics with image size and transformed source rect.
- Add a regression that reads actual PNG/WebP metadata and verifies identity PNG scaling plus full-map and interior crop mapping for both assets.
- Render isolated atlas frames at their authored per-pose display height, keeping source crop windows intact; apply the scale to local, remote, corpse and DOM role/kill rendering.
- Update shared idle foot offset and full-sprite vertical spawn bounds together, so client and server keep the same visible foot anchor.
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

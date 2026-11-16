# Map geometry source manifest

Status: **baseline inventory, reviewed against `main` at `aef0f099e8924ec1d58359521ce8d235b762c38d` on 2026-11-01**.

This document records the files and transforms that currently participate in the map rendering and spatial-geometry pipeline. It is an inventory, not approval of every collision boundary. A matching filename or matching aspect ratio is not proof that two images are the same source or that a mask is visually correct.

## 1. Canonical world coordinate contract

| Property | Current value | Source |
|---|---:|---|
| World width | 3224 px | `lib/shared/src/collisionMap.ts` and duplicate guard in `lib/shared/src/coords.ts` |
| World height | 1858 px | same |
| Compact navigation mask | 104 × 58 cells | `lib/shared/src/collisionData.ts` |
| Compact cell size | 31 × 32.03 world px (independent X/Y scales) | `collisionMap.ts` |
| Authoritative fine mask | 680 × 392 cells | `lib/shared/src/collisionDataFine.ts` |
| Fine cell size | 4.7412 × 4.7398 world px | `collisionMap.ts` |
| Player feet-circle radius | 4 px | `lib/shared/src/coords.ts` |
| Horizontal feet half-width | 10 px | same |
| Sprite-centre to feet baseline | 31 px | same |

**Important duplication:** `MAP_W`/`MAP_H` are declared separately in `collisionMap.ts` and `coords.ts`. Both files state that they must remain synchronized. New gameplay geometry should import the shared constants, not introduce fresh literals or silently use an older 1040×580 or 1652×952 frame.

The compact grid is retained for navigation/pathfinding and editor compatibility. Live authoritative player movement and client prediction use the fine-grid footprint/path helpers in `lib/shared/src/collisionMap.ts`.

## 2. Rendered map image assets

| Asset | Current repository evidence | Runtime role |
|---|---|---|
| `artifacts/telegram-game/public/map-hires.png` | Git blob `11cd7946e792d1dd1ec737c10d371e3bb69f87c5`; 9,734,170 bytes; SHA-256 `82e3d03f5f580bc2a32024ecddadb3df6929689a753d8c69016bbfaf003b96ce`; 3224×1858. | Canonical PNG fallback / direct DOM map image; dimensions are asserted equal to world dimensions. |
| `artifacts/telegram-game/public/map-hires.webp` | Git blob `e5fbfe6d0ef42aca9f03cd2f480d9095325cba71`; 1,124,562 bytes; SHA-256 `f8153c33f608da0a713a4a71b61aaa865fb3ef869136889b7b000e48ceefa800`; 6608×3808. | Preferred high-resolution source in the gameplay canvas loader, with PNG fallback. |
| `attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png` | Git blob `05cb87a17f5d99f6625f703982f598cf87cf9417`; 1,912,558 bytes; SHA-256 `c840fdafe3a1667616a44f6c64bb79fb5ba23c2ad54ba70461416dae153d1a80`; 1652×952. | Recovered original map artwork; now cross-checked against all five collision-island boundary pairs. |

### Rendering transform

`lib/shared/src/mapImageTransform.ts` defines `mapWorldRectToImagePixels()`. It computes independent X and Y scales from world dimensions to the selected image's native dimensions. `GameMap.tsx` uses it for canvas source rectangles, so world-space player/collision coordinates are not passed unscaled into the larger WebP.

`scripts/src/testMapImageTransform.ts` checks:
- PNG native dimensions equal `MAP_W × MAP_H`;
- full-world crops map to the full native image for both PNG and WebP;
- an interior crop maps with the exact independent X/Y scale;
- invalid image dimensions are rejected.

### Recovered source and reproducible derivative

The original 1652×952 PNG is present at the path above. The historical one-off `/tmp` script itself was not recovered, but a deterministic, non-destructive replacement is committed at `scripts/src/rebuildMapHiRes.ts`. It writes verification outputs under `artifacts/map-source-rebuild/`; it never overwrites either runtime asset.

The generator verifies these exact inputs and outputs:

| Derivative | Source transform | Runtime target SHA-256 | Rebuilt verification SHA-256 | Full decoded-pixel MAE |
|---|---|---|---|---:|
| PNG 3224×1858 | Sharp resize, `fit: 'fill'`, Lanczos3, alpha preserved if present; scale X 1.9515738499, Y 1.9516806723 | `82e3d03f5f580bc2a32024ecddadb3df6929689a753d8c69016bbfaf003b96ce` | `4d84f432aca5ae5d8a6520b4378dfb345a318737854fd630bee5bae8a159c3aa` | 5.9273 |
| WebP 6608×3808 | Direct from original source at exactly 4×, Lanczos3, WebP quality 90, effort 6 | `f8153c33f608da0a713a4a71b61aaa865fb3ef869136889b7b000e48ceefa800` | `1117c2c0980492e84dbcbcceb4d2d0b44c6e1286f2b3939b09825c88c5041335` | 2.2193 |

The source SHA-256 is `c840fdafe3a1667616a44f6c64bb79fb5ba23c2ad54ba70461416dae153d1a80`. The PNG and WebP recipes are independently verified against their committed targets; the generator enforces MAE below 8 for PNG and below 4 for WebP. These tolerances are explicit because the historical one-off sharpening/encoding step is not available, so byte-for-byte reproduction is not claimed.

`scripts/src/findMapSourceAsset.ts` also scans dimension/aspect-ratio candidates and verifies the source-to-PNG similarity. The CI workflow archives the original source, both runtime targets and both rebuilt verification outputs. **No runtime PNG/WebP asset is replaced.**

## 3. Red-line geometry reference and generated masks

### Reference image

`attached_assets/IMG_2907_1783632830477.jpeg` is the red-line collision reference used by the current compact and fine-grid generator code.

- Git blob: `4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2`
- Size: 249,182 bytes
- Dimensions: 1359×784 pixels
- The repository also contains earlier timestamped copies with the same Git blob SHA; they are duplicate bytes, not distinct map revisions.

The reference image is separate from the rendered `map-hires.png/.webp` runtime assets. The collision pipeline aligns the red-line reference to the canonical world using the 1359×784 to 3224×1858 scale. Keep that distinction explicit when inspecting any overlay.

### Fine authoritative mask

- Production data: `lib/shared/src/collisionDataFine.ts`
- Generator: `scripts/src/generateFineCollisionData.ts`
- Dimensions: 680×392
- Encoding: alternating walkable/blocked runs, unsigned LEB128 varints, Base64 payload
- Source: `IMG_2907_1783632830477.jpeg`

The generator currently:
1. Reads the 1359×784 source image and classifies red-line pixels using an RGB threshold.
2. Dilates the red mask by two source pixels to close narrow JPEG-compression gaps.
3. Flood-fills non-wall pixels from the image border as outside/background.
4. Labels remaining interior components and classifies obstacles using component-size, aspect-ratio and base-only heuristics.
5. Applies an explicit exception for the decorative central garden perimeter and a separate statue-base footprint.
6. Conservatively reduces source pixels in 2×2 blocks to 680×392 cells and RLE-encodes the result.

The generator writes a separate preview by default. Its explicit `--write` option rewrites the production fine payload; that promotion requires review of the visual overlays and movement tests. Do not run `--write` as a casual diagnostic.

### Compact navigation mask

- Production data: `lib/shared/src/collisionData.ts`
- Dimensions: 104×58
- Encoding: alternating numeric RLE runs
- Header comment says it originated from `scripts/src/analyzeCollisionMap.ts` over the red-line reference and is now maintained via the in-app Collision Editor (`/collision-editor`).
- The analyzer writes a non-production preview. Its header explicitly warns that rerunning it overwrites manual edits only if the preview is promoted; review before replacing canonical data.

The compact and fine masks are two different rasters derived from the same reference. Do not assume they have identical topology or sufficient clearance for the live player.

## 4. Manual geometry overrides

The **current main** production overrides are defined in `lib/shared/src/collisionOverrides.ts` in 3224×1858 world coordinates:

| ID | Bounds | Current purpose |
|---|---|---|
| `green-service-van-bay` | [1985,1055,2260,1260] | Walkable replacement region around the service van; its surrounding source-art room walls remain governed by the fine raster. |
| `east-generator-approach-aisle` | [2780,850,3100,950] | Restore the measured, visually open central aisle in the east generator room while leaving perimeter equipment and the lower generator bank outside the replacement zone. |
| `green-service-van-silhouette` | [2026,1100,2233,1240] | The single explicit manual blocked polygon inside the green service-van replacement region, following the van body/wheel footprint. |

The current main `MANUAL_BLOCKED_POLYGONS` array contains only the green service-van silhouette. The current main `MANUAL_WALKABLE_REPLACEMENT_ZONES` array contains only the two zones above.

The following source-art interpretations are **candidate-only** and are not present in current main's production overrides:

| Candidate | World bounds | Candidate interpretation | Design status |
|---|---|---|---|
| C0 / north cafeteria upper furniture strip | [1337,19,2138,270] | Irregular furniture/partition contour | Owner sign-off pending |
| C20 / northwest tank machinery enclosure | [597,507,929,801] | Irregular tank/pipe machinery contour | Owner sign-off pending |
| C27 / south-central playground/service fixtures | [597,673,1645,1531] | Irregular equipment/fixture contour | Owner sign-off pending |
| C38 / east office vehicle-service bay | [1821,801,2589,1327] | Continuous perimeter with internally visible floor and van clearance; no doorway visible in the source references | Owner sign-off pending |
| C56 / southwest shelving interior | [147,1209,427,1555] | Diagonal shelving/display boundary | Owner sign-off pending |

These five candidates are diagnostic source-art regions, not runtime identifiers or approved accessibility decisions. Do not copy their recovery-branch geometry into main or describe them as production collision. The four prop/furniture contours and the C38 interpretation require source-backed tracing, independent review and explicit design-owner decisions before any production change.

## 5. Gameplay anchors are separate sources

The map's interactive anchors are defined outside the collision rasters:

- Tasks: `lib/shared/src/tasks.ts`
- Vents and vent graph: `lib/shared/src/vents.ts`
- Admin console: `lib/shared/src/adminTable.ts`
- Sabotage pads and vision radii: `lib/shared/src/sabotage.ts`
- Shared player feet footprint and spawn: `lib/shared/src/coords.ts`

These anchor files currently do not refer to a common per-object vector-geometry manifest. Their approachability must be validated against the same shared player footprint, movement path sweep and line-of-sight logic used at runtime.

## 6. Runtime consumers

| Consumer | Geometry/image responsibility |
|---|---|
| `artifacts/telegram-game/src/pages/GameMap.tsx` | Loads WebP/PNG map images; applies world-to-native-image crop transform; draws players, task/vent markers and live visibility. |
| `artifacts/telegram-game/src/pages/CollisionEditor.tsx` | Loads the PNG world-sized asset and edits compact collision data. |
| `lib/shared/src/collisionMap.ts` | Decodes compact/fine RLE, applies walkable replacement zones and manual blocker polygons, exposes footprint/path/movement/LOS functions. |
| `artifacts/api-server/src/ws/movement.ts` | Authoritative movement validation through the shared footprint/path functions. |
| `artifacts/telegram-game/src/game/visibility.ts` | Derives raster shadow grids and narrow/outline occluders; traces vision against grids, circles, segments and manual outlines. |
| `scripts/src/renderCollisionQa.ts` / `scripts/renderCollisionQa.ts` | Renders production/reference collision, shadow and vision overlays. |

## 7. Current audit decision and open questions

As of the current-main verification on 2026-11-16:

1. World/image coordinates remain test-covered for PNG and WebP. The original 1652×952 source is recovered, and a deterministic PNG/WebP verification generator records hashes, transform parameters and explicit pixel-error tolerances. Runtime image assets remain unchanged.
2. Fine movement and client/server paths use the same shared helpers. The mainline 24-anchor CI regression now exercises full-footprint approaches, spawn-connected bot routes, interaction LOS and reverse returns; that automated result does not replace human anchor review.
3. The five detached source-art components have visual classifications against the red-line reference and recovered artwork, but their design intent remains unresolved. The candidate-only C0/C20/C27/C38/C56 contours are not current-main production geometry and still require explicit owner decisions.
4. Current main retains raster-derived collision as the base, with two walkable replacement zones and the single manual green-service-van silhouette described in Section 4. This is not a complete hand-authored per-object map.
5. Collision, vision and shadow do not yet share one complete canonical per-object geometry source. Movement, interaction sight and presentation shadow must remain independently authored and tested.

**Promotion rule:** any future map-image, mask or outline replacement must state the exact source asset/hash, coordinate transform, generator version/parameters, output dimensions, before/after overlay evidence, full player-footprint path coverage, task/vent/admin/sabotage anchor checks, five-sector routes, and client/server parity. If any one of these is unknown, leave the production data unchanged and keep the release gate open.


## 8. Historical mainline delta — 2026-11-13

This section records the 2026-11-13 snapshot only; Section 9 is the current-main reconciliation. This historical inventory was originally checked against main at `aef0f099e8924ec1d58359521ce8d235b762c38d`. The following delta prevents its earlier runtime descriptions from being mistaken for the current state.

### Current verified main baseline

- Main SHA: `925a465458e8462cef8b6112daff90a0edc239b3`.
- The logical world remains 3224×1858. The runtime map presentation now uses a 1612×929 overview with a 7×4 set of 28 viewport-detail WebP tiles; the old full-resolution map remains a source/QA input, not the default presentation path.
- The tile manifest and renderer tests validate the tile grid, source/world transform, visible-tile loading, failure fallback, retry/disposal and edge-seam behaviour. CI also captures mobile baseline, mobile 3× baseline and desktop sharpened variants. The sharpened variant is an acutance treatment, not evidence of model-generated new detail.
- The 11 task minigames are now separate components under `artifacts/telegram-game/src/components/minigames/`, registered through `index.ts` and checked by the minigame registry test. The old statement that all five/eleven games remain in a single monolith is stale.
- GameMap has had incremental extraction of camera, input, marker, HUD, sprite and map-layer responsibilities. It remains a large page module; extraction is partial, not a completed scene/render decomposition.
- Main CI run `43358830692` passed all 45 verify steps, including production build, server invariants, Telegram HMAC, live WebSocket lobby/sabotage, mobile browser smoke, collision/shadow/vision QA and three seeded 100-game cohorts. The recorded main balance cohorts were 58%, 66% and 58% crew wins with zero timeouts; seed 17002 is at the effective 66% ceiling.
- Current main's production movement remains on the established fine-grid footprint. The separate PR #138 candidate proposes a vector movement runtime; it is not part of this main baseline and is not approved for cut-over.

### Candidate vector geometry is a separate, provisional branch

PR #138 (`work/redline-vector-collision-runtime-mainline`) is closed and unmerged; its candidate branch is historical review material, not the main production source. Its generated red-line document currently has 370 movement-only shapes (14 closed, 356 open), all `blocksMove:true`, with zero `blocksSight:true` and zero `castsShadow:true`. Its 370 movement-only shapes now carry centroid-assigned Z01–Z12 ownership metadata (26, 32, 22, 16, 22, 72, 40, 30, 14, 36, 44, 16 shapes respectively). This is not author tracing or independent review; all 12 zone evidence and sign-off records remain open.

Do not infer sight or shadow boundaries from these movement shapes. The five detached-region dispositions C0/C20/C27/C38/C56 remain provisional and require explicit design-owner approval. The 12-zone source tracing/review, full named route matrix, parking-marking classification, and independent sight/shadow contour authoring are not complete.

### Provenance and promotion rule

The original map and red-line reference hashes and historical transform recipes above remain the recorded source evidence. The tiled runtime adds a derivative layer; any regenerated overview or detail tile must record the exact source hash, tile manifest, generator version/parameters and pixel-fidelity report. Do not replace source art, collision masks or production runtime geometry from a screenshot-only inference.

This manifest is a provenance record, not an approval of any collision/vision/shadow contour. Promotion still requires source-backed traces, full three-circle-footprint routes, client/server parity, independent author/reviewer dispositions, and explicit design-owner approval. Under the current screenshot-free recovery policy, do not generate screenshot or image-gallery artifacts; retain existing geometry wherever intent is unresolved.


**Mainline note (2026-11-13):** The provenance/review documentation was merged in PR #144 at main SHA `a8ccf734066d16178c0c7f8537bf82d82f3aef13`. This was documentation-only; the geometry source/runtime baseline recorded above remains `925a465458e8462cef8b6112daff90a0edc239b3`.


**Candidate metadata reconciliation (2026-11-14):** The latest PR #138 candidate assigns all 370 movement-only shapes to Z01–Z12 by centroid. The candidate still contains 14 closed and 356 open shapes; every shape blocks movement, none blocks sight, and no shadow-casting semantics have been authored. This supersedes the earlier A–E metadata description only. It does not satisfy the 12-zone source tracing, independent review, detached-region disposition, anchor-route, parking classification, or owner-approval gates.

## 9. Current-main reconciliation — 2026-11-16

The current default branch was rechecked at `93b4b542273fa064f9ca0db59bf43ff3e982cf9c`.

- `lib/shared/src/collisionOverrides.ts` contains exactly two walkable replacement zones (`green-service-van-bay`, `east-generator-approach-aisle`) and one manual blocked polygon (`green-service-van-silhouette`). The four cafeteria/tank/playground/shop contours and the C38 bay interpretation listed above are not in current main.
- All twelve `collision.zone-Z01.review.v1.json` through `collision.zone-Z12.review.v1.json` records remain `not-started`; no author trace, independent review or owner approval is recorded.
- PR #138 is closed and unmerged. Its 370-shape candidate is not production geometry.
- PR #210's exact-head CI passed the automated 24-anchor route/interaction checks, but distinct human author/reviewer dispositions and source-evidence hashes remain outstanding.
- PR #211 adds a fail-closed numeric parity evidence requirement; it does not establish that a candidate currently passes the two-way 2% comparison.
- Exact-main workflow [43838004960](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/43838004960) passed on `93b4b542273fa064f9ca0db59bf43ff3e982cf9c`: `verify` completed 57/57 steps and `plan2-soak` completed 12/12 steps. The 20-minute local API/WebSocket soak measured 1,200,429 ms, 121 WebSocket cycles, 484 authenticated sockets, 246 health probes, 2 ms p95 health latency, 117,088 KiB peak RSS and zero reported errors. The separate live gameplay suites included authenticated lobby/role/sabotage checks, four-client kill/body-report flow, reconnect restoration, and a solo human-versus-four-bots contextual meeting reply. This is exact-baseline CI evidence, not physical-device acceptance or deployment verification.

This is a documentation reconciliation only. It does not alter collision data, map art, runtime geometry or gameplay behavior.


## 10. Source-level vision and shadow pipeline audit — 2026-11-16

A code-only audit of current main's `artifacts/telegram-game/src/game/visibility.ts`, `scripts/src/buildCollisionDocument.ts` and `lib/shared/src/collision/vectorCollision.ts` confirms that the current sight/shadow implementation is still partly derived from movement occupancy; it is not a completed independently authored per-object contour system:

- Runtime vision builds a fine shadow/occlusion grid from the fine movement collision grid. Large connected components (at least 8,000 fine cells) are copied into the architectural shadow mask; compact components from 4 through 7,999 cells are converted into merged boundary segments. Components smaller than four cells are omitted from that segment extraction.
- The coarse-grid narrow-occluder pass recognizes four-cell 2×2 components and adds a manually measured upper-atrium lamp circle. The old offset statue circle is explicitly excluded because the statue's raster shadow is already painted into map art.
- The generated vector-candidate builder also consumes the same fine movement grid for its movement shapes, then derives sight-area rectangles and sight-segment shapes from the shadow grid/segments. This generated candidate is diagnostic and is not imported by live gameplay.
- The vector engine can represent separate movement, sight and shadow channels, and an explicit `castsShadow: false` can prevent a sight blocker from casting a presentation shadow. When `castsShadow` is omitted, the current engine defaults it to `blocksSight`; the editor exposes that as an explicit “Follow sight” mode. Thus the engine has an override channel, but omitted values still inherit sight semantics rather than proving a separately authored shadow decision.

This source audit does not establish that any particular contour is visually correct. It identifies the remaining work precisely: author object/edge identities from rights-cleared source material; record independent movement, interaction-sight and presentation-shadow dispositions per object; then validate collision footprint, LOS, lighting/shadow behavior and route parity separately. In particular, do not convert a raster movement component or a red-line collision stroke into an approved vision/shadow contour by inference. The statue planter/pedestal and the 12 zone reviews remain unresolved.

No runtime code, collision data, map art or geometry was changed. No screenshots, QA tiles or image artifacts were generated. Raster collision remains authoritative; candidate vector geometry remains unpromoted.

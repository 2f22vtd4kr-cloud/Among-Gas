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
| `artifacts/telegram-game/public/map-hires.png` | Git blob `11cd7946e792d1dd1ec737c10d371e3bb69f87c5`; 9,734,170 bytes. CI image QA reports 3224×1858. | Canonical PNG fallback / direct DOM map image; dimensions are asserted equal to world dimensions. |
| `artifacts/telegram-game/public/map-hires.webp` | Git blob `e5fbfe6d0ef42aca9f03cd2f480d9095325cba71`; 1,124,562 bytes. CI image QA reports 6608×3808. | Preferred high-resolution source in the gameplay canvas loader, with PNG fallback. |
| `attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png` | Git blob `05cb87a17f5d99f6625f703982f598cf87cf9417`; 1,912,558 bytes. | Historical handoff identifies this as the user-supplied original map artwork (1652×952). |

### Rendering transform

`lib/shared/src/mapImageTransform.ts` defines `mapWorldRectToImagePixels()`. It computes independent X and Y scales from world dimensions to the selected image's native dimensions. `GameMap.tsx` uses it for canvas source rectangles, so world-space player/collision coordinates are not passed unscaled into the larger WebP.

`scripts/src/testMapImageTransform.ts` checks:
- PNG native dimensions equal `MAP_W × MAP_H`;
- full-world crops map to the full native image for both PNG and WebP;
- an interior crop maps with the exact independent X/Y scale;
- invalid image dimensions are rejected.

### Provenance gap — do not guess

The historical `handoff.md` records that the 1652×952 user-supplied PNG was once upscaled with Sharp/Lanczos and sharpening, then a later WebP derivative was created. The one-off upscaling script was under `/tmp` and is not committed. The current repository contains the input image and the two published derivatives, but this repository snapshot does **not** contain a deterministic, versioned generator that recreates the current `map-hires.png` and `map-hires.webp` byte-for-byte.

Consequently:
1. Preserve the current binaries until their provenance and intended source are confirmed.
2. Do not regenerate or replace them using historical dimensions from `handoff.md`.
3. A future asset-pipeline workstream should add a committed deterministic generator, record its exact source file and processing recipe, and assert output dimensions/hashes or a documented non-byte-identical tolerance.

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

Production overrides live in `lib/shared/src/collisionOverrides.ts`, in 3224×1858 world coordinates:

| ID | Bounds | Current purpose |
|---|---|---|
| `green-service-van-bay` | [1985,1055,2260,1260] | Replace an oversized traced red rectangle with a walkable bay and a hand-traced van body/wheel polygon. The vehicle remains blocked. |
| `east-generator-approach-aisle` | [2780,850,3100,950] | Restore the visually open central aisle in the east generator room; perimeter equipment and lower generator bank remain outside the replacement zone. |

The van silhouette is also exposed through `MANUAL_BLOCKED_POLYGONS`. This is a small, targeted override set—not a comprehensive hand-authored vector description of every map object, doorway, light blocker and shadow caster.

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

As of the stated baseline:

1. World/image coordinates are test-covered for both PNG and WebP, but the current map-image generation recipe is not reproducible from committed source.
2. Fine movement and client/server paths can now be audited through the same shared helpers; the connectivity diagnostic verifies all 24 defined gameplay anchors and five named sector targets have spawn-connected approaches.
3. Five large detached walkable components remain under map review. Their nearest source-image boundary pairs are emitted by PR #89 CI and the annotated source-map artifact. No blanket connection or exclusion has been approved.
4. Raster-derived collision remains the base for much of the map. The current override file covers two bounded corrections, not all object silhouettes.
5. Collision, vision and shadow share parts of the raster/override pipeline, but there is not yet a single complete canonical per-object geometry source that drives all three.

**Promotion rule:** any future map-image, mask or outline replacement must state the exact source asset/hash, coordinate transform, generator version/parameters, output dimensions, before/after overlay evidence, full player-footprint path coverage, task/vent/admin/sabotage anchor checks, five-sector routes, and client/server parity. If any one of these is unknown, leave the production data unchanged and keep the release gate open.

# Fine-grid disconnected-region review register

Status: **classified — five sealed non-playable source-art regions are blocked by named irregular collision polygons.**  
Baseline reviewed: `main` `aef0f099e8924ec1d58359521ce8d235b762c38d`  
Diagnostic branch: `recovery/map-connectivity-regressions`

## Evidence and decision method

- Production player footprint: 4 px radius, 10 px horizontal half-width, 31 px sprite-centre-to-feet offset.
- Connectivity nodes use `isPlayerFootprintWalkableAtFeet`; edges use `isPlayerPathWalkable` with at-most-2 px samples. These are the same shared geometry checks used by client prediction and server movement.
- Fine grid: 680×392 at approximately 4.741×4.740 world px/cell.
- Before the exclusion polygons, the diagnostic found 72 player-clearance components. Five disconnected pockets exceeded 1,000 cells.
- The 24 required gameplay anchors (11 tasks, 6 vents, 1 Admin Table, 6 sabotage pads) and all five sector targets A–E had spawn-connected full-footprint approaches before the exclusions.
- The five boundary pairs were inspected at pixel level against `attached_assets/IMG_2907_1783632830477.jpeg` (1359×784). The nearest contacts for C27 and C38, plus the next-nearest boundary contacts, cross continuous red wall/fixture outlines. No open doorway is drawn at those boundaries.
- The detached pockets are not gameplay rooms with documented entry/exit mechanics. They are sealed decorative, machinery, shelving, or service-fixture interiors. No gameplay anchor is exclusively inside any of them.

The component IDs below are shown only to preserve the original diagnostic record. They are scan-order labels and are **not used by production geometry or the regression**.

## Final disposition table

| Original component | Valid cells | Original world bounds [minX,minY,maxX,maxY] | Spawn-side source px | Region-side source px | Named disposition | Collision treatment |
|---:|---:|---|---|---|---|---|
| 27 | 11,463 | [597,673,1645,1531] | [698,351] | [684,365] | `south-central-service-fixture-enclosure` — sealed lower-central equipment/cabinet area; continuous wall at the reviewed threshold; no exclusive gameplay anchor | Irregular blocked contour |
| 38 | 3,077 | [1821,801,2589,1327] | [1002,343] | [1016,357] | `east-office-vehicle-service-enclosure` — sealed vehicle-service room; continuous wall corner, no doorway in source art. The former van-bay walkable override only cleared floor inside this sealed room and did not define an entrance | Irregular blocked contour; obsolete van-bay walkable override removed |
| 20 | 2,719 | [597,507,929,801] | [311,201] | [299,215] | `northwest-tank-machinery-enclosure` — sealed tank/pipe machinery footprint; continuous wall, no task or interaction approach | Irregular blocked contour |
| 0 | 2,509 | [1337,19,2138,270] | [629,59] | [613,43] | `north-cafeteria-upper-furniture-strip` — upper furniture/bench strip behind the continuous cafeteria partition | Irregular blocked contour |
| 56 | 2,304 | [147,1209,427,1555] | [153,631] | [137,615] | `southwest-shop-shelving-interior` — enclosed shelving/display footprint behind a continuous diagonal wall | Irregular blocked contour |

World bounds use the 3224×1858 map coordinate system. Source coordinates refer to the collision reference image listed above.

## Geometry implementation

- Added five named entries to `MANUAL_BLOCKED_POLYGONS` in `lib/shared/src/collisionOverrides.ts`.
- Each polygon follows the actual detached pocket contour and is expanded by two fine-grid cells to cover the complete player-centre footprint. The polygons are irregular; no bounding rectangles or global holes were introduced.
- Polygon bounds are regression-checked against the reviewed source-derived component bounds within 12 world pixels.
- Removed the `green-service-van-bay` walkable replacement zone. It cleared an interior floor pocket that has no source-art entrance; retaining it would falsely describe a sealed room as playable. The green van silhouette is now covered by the named sealed vehicle-service region.
- Kept the separate `east-generator-approach-aisle` walkable replacement zone; it is outside these five sealed regions and remains connected to the spawn network.
- No source image, PNG/WebP asset, fine-grid RLE payload, or global collision mask was regenerated.

## Regression gate

`scripts/test-fine-map-connectivity.ts` now verifies:

1. Every named sealed region has a corresponding irregular production collision polygon.
2. Each polygon's bounds match the reviewed source-derived region bounds.
3. The region-side full-player-footprint probe is blocked.
4. The spawn-side approach remains walkable and the sweep across the sealed boundary remains blocked.
5. No significant disconnected walkable component remains after the named blocked footprints are applied.
6. Every one of the 24 gameplay anchors retains at least one spawn-connected full-footprint and line-of-sight approach.
7. All five sector targets A–E remain spawn-connected.

The regression matches stable geometry and source-image coordinates, never component IDs.

## Remaining provenance limitation

The original 1652×952 map source and the one-off upscale script mentioned in the earlier asset notes were not present in the available Library search or current source tree. This review therefore uses the committed 1359×784 collision reference and the existing generated fine-grid diagnostic. The original source/transform provenance must still be recovered before any further map-art regeneration.

## Decision

The five large detached pockets are now explicitly classified and blocked as sealed non-playable source-art regions. The intended gameplay network remains the spawn-connected region containing every required interaction anchor and sector target. A future design change that wants any of these rooms playable must first add an explicit doorway to the source map art, then add a named swept-path regression through that doorway; do not punch an undocumented collision hole.

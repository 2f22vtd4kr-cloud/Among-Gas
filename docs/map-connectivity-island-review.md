# Fine-grid disconnected-region review register

Status: **four sealed non-playable regions blocked by named contours; one central decorative-garden region is intentionally preserved as walkable but isolated by the source-art perimeter.**  
Baseline reviewed: `main` `aef0f099e8924ec1d58359521ce8d235b762c38d`  
Diagnostic branch: `recovery/map-connectivity-regressions`

## Evidence and decision method

- Production player footprint: 4 px radius, 10 px horizontal half-width, 31 px sprite-centre-to-feet offset.
- Connectivity nodes use `isPlayerFootprintWalkableAtFeet`; edges use `isPlayerPathWalkable` with at-most-2 px samples. These are the shared geometry checks used by client prediction and server movement.
- Fine grid: 680×392 at approximately 4.741×4.740 world px/cell.
- Before exclusions, the diagnostic found 72 player-clearance components. Five disconnected pockets exceeded 1,000 cells.
- The 24 required gameplay anchors (11 tasks, 6 vents, 1 Admin Table, 6 sabotage pads) and all five sector targets A–E had spawn-connected full-footprint approaches before exclusions.
- The five boundary pairs were inspected at pixel level against `attached_assets/IMG_2907_1783632830477.jpeg` (1359×784). The marked nearest contacts for the four sealed prop/service regions cross continuous red-line wall or fixture outlines. The C27 south threshold was also checked against its nearby source-art openings; the only detached region that must remain walkable is the central decorative garden, which the existing mechanics regression explicitly protects.
- No gameplay anchor or exclusive interaction approach is located inside any of the five detached pockets.

The component IDs below are retained only to preserve the original diagnostic record. They are scan-order labels and are **not used by production geometry or the regression**.

## Final disposition table

| Original component | Valid cells | Original world bounds [minX,minY,maxX,maxY] | Spawn-side source px | Region-side source px | Named disposition | Collision treatment |
|---:|---:|---|---|---|---|---|
| 27 | 11,463 | [597,673,1645,1531] | [698,351] | [684,365] | `south-central-decorative-garden-zone` — preserve the decorative garden's walkable footprint; the source-art south threshold remains a solid boundary and no gameplay anchor is inside | No manual polygon; test confirms walkable island-side footprint and blocked full-player sweep |
| 38 | 3,077 | [1821,801,2589,1327] | [1002,343] | [1016,357] | `east-office-vehicle-service-enclosure` — sealed vehicle-service room; continuous wall corner, no doorway in source art | Irregular blocked contour; obsolete van-bay walkable override removed |
| 20 | 2,719 | [597,507,929,801] | [311,201] | [299,215] | `northwest-tank-machinery-enclosure` — sealed tank/pipe machinery footprint; continuous wall, no task or interaction approach | Irregular blocked contour |
| 0 | 2,509 | [1337,19,2138,270] | [629,59] | [613,43] | `north-cafeteria-upper-furniture-strip` — upper furniture/bench strip behind the continuous cafeteria partition | Irregular blocked contour |
| 56 | 2,304 | [147,1209,427,1555] | [153,631] | [137,615] | `southwest-shop-shelving-interior` — enclosed shelving/display footprint behind a continuous diagonal wall | Irregular blocked contour |

World bounds use the 3224×1858 map coordinate system. Source coordinates refer to the collision reference image listed above.

## Geometry implementation

- Added four named entries to `MANUAL_BLOCKED_POLYGONS` in `lib/shared/src/collisionOverrides.ts`. Each polygon follows the isolated pocket's irregular fine-grid contour and is expanded by two fine-grid cells to cover the complete player-centre footprint. No bounding rectangles or global collision holes were introduced.
- The central decorative-garden component is deliberately **not** polygon-blocked. The existing `verify-map-mechanics` regression explicitly requires the garden to remain walkable and rejects manual polygons that fill it.
- Removed the `green-service-van-bay` walkable replacement zone. It cleared an interior floor pocket with no source-art entrance; retaining it would falsely describe a sealed room as playable. The van-service enclosure is now blocked by its named contour.
- Kept the separate `east-generator-approach-aisle` walkable replacement zone; it is outside these four sealed regions and remains connected to the spawn network.
- No source image, PNG/WebP asset, fine-grid RLE payload, or global collision mask was regenerated.

## Regression gate

`scripts/test-fine-map-connectivity.ts` verifies:

1. The four sealed regions have named irregular production collision polygons whose bounds match the reviewed component bounds.
2. Each sealed region's full-player-footprint probe is blocked; the spawn-side approach remains walkable; a sweep across the source-art boundary remains blocked.
3. The central decorative garden remains walkable and has no manual collision polygon; its source-art perimeter remains blocked to the full player footprint.
4. No other significant disconnected walkable component remains.
5. Every one of the 24 gameplay anchors retains at least one spawn-connected full-footprint and line-of-sight approach.
6. All five sector targets A–E remain spawn-connected.

The regression matches stable geometry and source-image coordinates, never component IDs.

## Remaining provenance limitation

The original 1652×952 map source and the one-off upscale script mentioned in the earlier asset notes were not present in the available Library search or current source tree. This review therefore uses the committed 1359×784 collision reference and the existing generated fine-grid diagnostic. The original source/transform provenance must still be recovered before any further map-art regeneration.

## Decision

Four sealed non-playable prop/service pockets are now blocked by named source-derived contours. The central decorative garden is explicitly preserved as a walkable decorative exclusion with a sealed perimeter, because the existing mechanics contract requires that footprint to remain clear of manual polygons. All intended gameplay anchors and sector approaches remain subject to strict spawn-connectivity assertions. If the design later wants any sealed service room playable, add an explicit doorway to the source map art and a named swept-path regression through that doorway; do not punch an undocumented collision hole.

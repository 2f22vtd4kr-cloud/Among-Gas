# Fine-grid disconnected-region review register

Status: **four sealed prop/service pockets blocked by named contours; the east vehicle-service bay remains internally walkable but intentionally sealed by its source-art perimeter.**  
Baseline reviewed: `main` `aef0f099e8924ec1d58359521ce8d235b762c38d`  
Diagnostic branch: `recovery/map-connectivity-regressions`

## Evidence and decision method

- Production player footprint: 4 px radius, 10 px horizontal half-width, 31 px sprite-centre-to-feet offset.
- Connectivity nodes use `isPlayerFootprintWalkableAtFeet`; edges use `isPlayerPathWalkable` with at-most-2 px samples. These are the shared geometry checks used by client prediction and server movement.
- Fine grid: 680×392 at approximately 4.741×4.740 world px/cell.
- Before exclusions, the diagnostic found 72 player-clearance components. Five disconnected pockets exceeded 1,000 cells.
- The 24 required gameplay anchors (11 tasks, 6 vents, 1 Admin Table, 6 sabotage pads) and all five sector targets A–E had spawn-connected full-footprint approaches before exclusions.
- All five annotated boundary pairs were inspected against both the red-line collision reference `attached_assets/IMG_2907_1783632830477.jpeg` (1359×784) and the recovered original artwork `attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png` (1652×952). The original artwork confirms C0 is upper cafeteria furniture, C20 is the tank/pipe machinery enclosure, C27 is the south-central playground/service-fixture enclosure, C56 is the southwest shelf/canister display interior, and C38 is the east office/vehicle-service bay. The four polygon contours stay on prop/furniture/fixture interiors and leave surrounding player routes open. C38 has a continuous source-art perimeter wall and no doorway; its internal walkable floor and green-van clearance remain because existing movement/vision tests explicitly require them.
- No gameplay anchor or exclusive interaction approach is located inside any detached pocket.

The component IDs below are retained only to preserve the original diagnostic record. They are scan-order labels and are **not used by production geometry or the regression**.

## Final disposition table

| Original component | Valid cells | Original world bounds [minX,minY,maxX,maxY] | Spawn-side source px | Region-side source px | Named disposition | Collision treatment |
|---:|---:|---|---|---|---|---|
| 27 | 11,463 | [597,673,1645,1531] | [698,351] | [684,365] | `south-central-playground-service-fixture-enclosure` — sealed lower-central playground/equipment footprint behind continuous walls; no exclusive gameplay anchor | Irregular blocked contour |
| 38 | 3,077 | [1821,801,2589,1327] | [1002,343] | [1016,357] | `east-office-vehicle-service-bay` — decorative vehicle-service bay with internally walkable floor and van silhouette; no doorway in source art and no gameplay anchor | Preserve walkable bay and van silhouette; keep the continuous perimeter wall blocked; entry/exit mechanics are explicitly **none by design** |
| 20 | 2,719 | [597,507,929,801] | [311,201] | [299,215] | `northwest-tank-machinery-enclosure` — sealed tank/pipe machinery footprint; continuous wall, no task or interaction approach | Irregular blocked contour |
| 0 | 2,509 | [1337,19,2138,270] | [629,59] | [613,43] | `north-cafeteria-upper-furniture-strip` — upper furniture/bench strip behind the continuous cafeteria partition | Irregular blocked contour |
| 56 | 2,304 | [147,1209,427,1555] | [153,631] | [137,615] | `southwest-shop-shelving-interior` — enclosed shelving/display footprint behind a continuous diagonal wall | Irregular blocked contour |

World bounds use the 3224×1858 map coordinate system. Boundary coordinates refer to the 1359×784 collision reference; every disposition was cross-checked against the recovered 1652×952 original artwork.

## Geometry implementation

- Added four named entries to `MANUAL_BLOCKED_POLYGONS` in `lib/shared/src/collisionOverrides.ts`. Each polygon follows the isolated pocket's irregular fine-grid contour and is expanded by two fine-grid cells to cover the complete player-centre footprint. No bounding rectangles or global collision holes were introduced.
- Preserved the `green-service-van-bay` walkable replacement zone and its vehicle silhouette polygon. The van remains solid, while left/right player clearance around the vehicle remains walkable. The bay perimeter is still blocked by the source-art wall; no doorway was invented. The zone has no door, vent, teleport or other entry/exit mechanic and is not a gameplay route target.
- Kept the separate `east-generator-approach-aisle` walkable replacement zone; it remains connected to the spawn network.
- The central decorative garden remains walkable. The map-mechanics regression now checks its actual floor probes rather than rejecting every manual collision polygon anywhere on the map.
- No runtime source image, PNG/WebP asset, fine-grid RLE payload, or global collision mask was modified. The recovered-source derivative was generated only as a non-production verification artifact.

## Regression gate

`scripts/test-fine-map-connectivity.ts` verifies:

1. The four sealed prop/service regions have named irregular production collision polygons whose bounds match the reviewed component bounds.
2. Each sealed region's full-player-footprint probe is blocked; the spawn-side approach remains walkable; a sweep across the original-art boundary remains blocked.
3. The east vehicle-service bay retains its internal walkable footprint, the van remains a solid obstacle, and the source-art perimeter remains a blocked boundary. The metadata and regression explicitly record that no entry/exit mechanic is authored for this decorative zone.
4. Exactly one documented decorative/service region remains internally walkable but isolated; no other significant detached walkable component remains.
5. Every one of the 24 gameplay anchors retains at least one spawn-connected full-footprint and line-of-sight approach.
6. All five sector targets A–E remain spawn-connected.
7. The central garden's required walkable floor probes remain clear of all manual collision polygons.

The regression matches stable geometry and source-image coordinates, never component IDs.

## Recovered source and reproducible derivative

The original 1652×952 source has now been recovered and compared against all five boundary locations. A deterministic non-destructive derivative generator is committed at `scripts/src/rebuildMapHiRes.ts`; it rebuilds PNG and WebP outputs into `artifacts/map-source-rebuild/` and verifies them against the committed runtime rasters. The historical one-off `/tmp` script itself was not recovered, so the committed generator records the verified replacement transform and pixel-error bounds. Runtime PNG/WebP assets remain unchanged.

## Decision

Four sealed non-playable prop/service pockets are blocked by named source-derived contours. The east vehicle-service bay remains a walkable decorative interior with a sealed perimeter because the existing movement/vision contract explicitly preserves the van's internal clearance; it is not a gameplay route target. The central garden and all 24 gameplay anchors and five sector approaches remain protected by strict full-footprint tests. If the design later wants the service bay accessible from the main map, add an explicit doorway to the source map art and a named swept-path regression through that doorway; do not punch an undocumented collision hole.
